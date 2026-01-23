import { z } from "zod";
import { router, protectedProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import * as emailService from "@/lib/email/service";
import * as litService from "@/lib/lit/service";

const AccessRole = z.enum(["VIEW_ONLY", "CO_SIGNER", "FULL_ACCESS"]);

export const walletAccessRouter = router({
  /**
   * Send an invitation to share wallet access
   */
  invite: protectedProcedure
    .input(
      z.object({
        walletId: z.string(),
        email: z.string().email(),
        role: AccessRole,
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const wallet = await ctx.prisma.wallet.findUnique({
        where: { id: input.walletId },
      });

      if (!wallet) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Wallet not found",
        });
      }

      if (wallet.ownerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the wallet owner can invite users",
        });
      }

      // Check if invitation already exists
      const existingInvitation = await ctx.prisma.walletInvitation.findUnique({
        where: {
          walletId_inviteeEmail: {
            walletId: input.walletId,
            inviteeEmail: input.email,
          },
        },
      });

      if (existingInvitation && existingInvitation.status === "PENDING") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An invitation has already been sent to this email",
        });
      }

      // Check if user already has access
      const invitee = await ctx.prisma.user.findUnique({
        where: { email: input.email },
      });

      if (invitee) {
        const existingAccess = await ctx.prisma.walletAccess.findUnique({
          where: {
            walletId_userId: {
              walletId: input.walletId,
              userId: invitee.id,
            },
          },
        });

        if (existingAccess) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This user already has access to the wallet",
          });
        }
      }

      // Create or update invitation
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const invitation = await ctx.prisma.walletInvitation.upsert({
        where: {
          walletId_inviteeEmail: {
            walletId: input.walletId,
            inviteeEmail: input.email,
          },
        },
        update: {
          role: input.role,
          status: "PENDING",
          expiresAt,
          inviteeId: invitee?.id ?? null,
        },
        create: {
          walletId: input.walletId,
          inviterId: ctx.user.id,
          inviteeEmail: input.email,
          inviteeId: invitee?.id ?? null,
          role: input.role,
          expiresAt,
        },
      });

      // Send invitation email
      const inviteLink = `${process.env.APP_URL || "http://localhost:3000"}/invite/${invitation.id}`;
      
      await emailService.sendInvitationEmail({
        to: input.email,
        inviterName: ctx.user.name || ctx.user.email,
        walletName: wallet.name,
        role: input.role,
        inviteLink,
      });

      return invitation;
    }),

  /**
   * Accept a pending invitation
   */
  acceptInvitation: protectedProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.prisma.walletInvitation.findUnique({
        where: { id: input.invitationId },
        include: {
          wallet: true,
          inviter: true,
        },
      });

      if (!invitation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found",
        });
      }

      // Verify the invitation is for this user
      if (invitation.inviteeEmail !== ctx.user.email) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This invitation is not for you",
        });
      }

      if (invitation.status !== "PENDING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invitation has already been ${invitation.status.toLowerCase()}`,
        });
      }

      if (invitation.expiresAt < new Date()) {
        await ctx.prisma.walletInvitation.update({
          where: { id: input.invitationId },
          data: { status: "EXPIRED" },
        });

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invitation has expired",
        });
      }

      // Create wallet access
      const access = await ctx.prisma.walletAccess.create({
        data: {
          walletId: invitation.walletId,
          userId: ctx.user.id,
          role: invitation.role,
        },
      });

      // Update invitation status
      await ctx.prisma.walletInvitation.update({
        where: { id: input.invitationId },
        data: {
          status: "ACCEPTED",
          inviteeId: ctx.user.id,
        },
      });

      // If FULL_ACCESS, add permitted auth method to PKP
      if (invitation.role === "FULL_ACCESS") {
        // This would add the user's auth method to the PKP
        // For now, we'll skip this as it requires user's auth method
        console.log("Would add permitted auth method for FULL_ACCESS user");
      }

      // Send notification to inviter
      await emailService.sendInvitationAcceptedEmail({
        to: invitation.inviter.email,
        acceptedByName: ctx.user.name || ctx.user.email,
        walletName: invitation.wallet.name,
      });

      return access;
    }),

  /**
   * Reject an invitation
   */
  rejectInvitation: protectedProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.prisma.walletInvitation.findUnique({
        where: { id: input.invitationId },
      });

      if (!invitation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found",
        });
      }

      if (invitation.inviteeEmail !== ctx.user.email) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This invitation is not for you",
        });
      }

      if (invitation.status !== "PENDING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invitation has already been ${invitation.status.toLowerCase()}`,
        });
      }

      return ctx.prisma.walletInvitation.update({
        where: { id: input.invitationId },
        data: { status: "REJECTED" },
      });
    }),

  /**
   * Revoke a user's access to a wallet
   */
  revokeAccess: protectedProcedure
    .input(
      z.object({
        walletId: z.string(),
        userId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const wallet = await ctx.prisma.wallet.findUnique({
        where: { id: input.walletId },
      });

      if (!wallet) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Wallet not found",
        });
      }

      if (wallet.ownerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the wallet owner can revoke access",
        });
      }

      const access = await ctx.prisma.walletAccess.findUnique({
        where: {
          walletId_userId: {
            walletId: input.walletId,
            userId: input.userId,
          },
        },
      });

      if (!access) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Access not found",
        });
      }

      return ctx.prisma.walletAccess.delete({
        where: { id: access.id },
      });
    }),

  /**
   * Update a user's access role
   */
  updateRole: protectedProcedure
    .input(
      z.object({
        walletId: z.string(),
        userId: z.string(),
        role: AccessRole,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const wallet = await ctx.prisma.wallet.findUnique({
        where: { id: input.walletId },
      });

      if (!wallet) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Wallet not found",
        });
      }

      if (wallet.ownerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the wallet owner can update access roles",
        });
      }

      const access = await ctx.prisma.walletAccess.findUnique({
        where: {
          walletId_userId: {
            walletId: input.walletId,
            userId: input.userId,
          },
        },
      });

      if (!access) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Access not found",
        });
      }

      return ctx.prisma.walletAccess.update({
        where: { id: access.id },
        data: { role: input.role },
      });
    }),

  /**
   * List all users with access to a wallet
   */
  listAccess: protectedProcedure
    .input(z.object({ walletId: z.string() }))
    .query(async ({ ctx, input }) => {
      const wallet = await ctx.prisma.wallet.findUnique({
        where: { id: input.walletId },
        include: {
          owner: true,
          accessList: {
            include: { user: true },
          },
        },
      });

      if (!wallet) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Wallet not found",
        });
      }

      // Check if user has access to view this
      const isOwner = wallet.ownerId === ctx.user.id;
      const hasAccess = wallet.accessList.some((a) => a.userId === ctx.user.id);

      if (!isOwner && !hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this wallet",
        });
      }

      return {
        owner: {
          ...wallet.owner,
          role: "OWNER" as const,
        },
        accessList: wallet.accessList.map((a) => ({
          ...a.user,
          role: a.role as "VIEW_ONLY" | "CO_SIGNER" | "FULL_ACCESS",
          grantedAt: a.createdAt,
        })),
      };
    }),

  /**
   * List pending invitations (sent by user or received by user)
   */
  listInvitations: protectedProcedure
    .input(
      z.object({
        type: z.enum(["sent", "received"]).optional().default("received"),
      })
    )
    .query(async ({ ctx, input }) => {
      if (input.type === "sent") {
        return ctx.prisma.walletInvitation.findMany({
          where: {
            inviterId: ctx.user.id,
            status: "PENDING",
          },
          include: {
            wallet: true,
            invitee: true,
          },
          orderBy: { createdAt: "desc" },
        });
      }

      return ctx.prisma.walletInvitation.findMany({
        where: {
          inviteeEmail: ctx.user.email,
          status: "PENDING",
        },
        include: {
          wallet: true,
          inviter: true,
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  /**
   * Get a specific invitation by ID
   */
  getInvitation: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const invitation = await ctx.prisma.walletInvitation.findUnique({
        where: { id: input.id },
        include: {
          wallet: true,
          inviter: true,
        },
      });

      if (!invitation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found",
        });
      }

      // Only allow invitee or inviter to view
      if (
        invitation.inviteeEmail !== ctx.user.email &&
        invitation.inviterId !== ctx.user.id
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this invitation",
        });
      }

      return invitation;
    }),
});
