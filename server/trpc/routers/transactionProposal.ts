import { z } from "zod";
import { router, protectedProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import * as litService from "@/lib/lit/service";
import * as blockchainService from "@/lib/blockchain/service";
import { parseEther } from "viem";

const ProposalStatus = z.enum(["PENDING", "APPROVED", "REJECTED", "EXECUTED", "EXPIRED"]);

// Proposal expires after 7 days by default
const PROPOSAL_EXPIRY_DAYS = 7;

export const transactionProposalRouter = router({
  /**
   * Propose a transaction (for CO_SIGNER role)
   * The proposal requires owner approval before execution
   */
  propose: protectedProcedure
    .input(
      z.object({
        walletId: z.string(),
        to: z.string(),
        value: z.string(), // ETH value in ether
        data: z.string().optional(),
        reason: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const wallet = await ctx.prisma.wallet.findUnique({
        where: { id: input.walletId },
        include: { accessList: true },
      });

      if (!wallet) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Wallet not found",
        });
      }

      // Check if user is a CO_SIGNER
      const access = wallet.accessList.find((a) => a.userId === ctx.user.id);
      const isCoSigner = access?.role === "CO_SIGNER";

      if (!isCoSigner) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only co-signers can propose transactions. Owners and full-access users can send transactions directly.",
        });
      }

      // Validate recipient address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(input.to)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid recipient address format",
        });
      }

      // Validate value
      const valueNum = parseFloat(input.value);
      if (isNaN(valueNum) || valueNum <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid transaction value",
        });
      }

      // Create the proposal with expiration
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + PROPOSAL_EXPIRY_DAYS);

      const proposal = await ctx.prisma.transactionProposal.create({
        data: {
          walletId: input.walletId,
          proposerId: ctx.user.id,
          to: input.to,
          value: input.value,
          data: input.data,
          reason: input.reason,
          expiresAt,
        },
        include: {
          proposer: true,
          wallet: true,
        },
      });

      return proposal;
    }),

  /**
   * List proposals for a wallet
   * Owners see all proposals, co-signers see only their own
   */
  list: protectedProcedure
    .input(
      z.object({
        walletId: z.string(),
        status: ProposalStatus.optional(),
        limit: z.number().min(1).max(100).optional().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const wallet = await ctx.prisma.wallet.findUnique({
        where: { id: input.walletId },
        include: { accessList: true },
      });

      if (!wallet) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Wallet not found",
        });
      }

      // Check access
      const isOwner = wallet.ownerId === ctx.user.id;
      const access = wallet.accessList.find((a) => a.userId === ctx.user.id);
      const hasAccess = isOwner || !!access;

      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this wallet",
        });
      }

      // Build query filters
      const where: {
        walletId: string;
        status?: string;
        proposerId?: string;
      } = {
        walletId: input.walletId,
      };

      if (input.status) {
        where.status = input.status;
      }

      // Non-owners (co-signers, view-only) can only see their own proposals
      if (!isOwner && access?.role !== "FULL_ACCESS") {
        where.proposerId = ctx.user.id;
      }

      const proposals = await ctx.prisma.transactionProposal.findMany({
        where,
        include: {
          proposer: true,
          reviewer: true,
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });

      // Mark expired proposals
      const now = new Date();
      return proposals.map((p) => ({
        ...p,
        isExpired: p.status === "PENDING" && p.expiresAt < now,
      }));
    }),

  /**
   * Get pending proposal count for a wallet (for badge display)
   */
  getPendingCount: protectedProcedure
    .input(z.object({ walletId: z.string() }))
    .query(async ({ ctx, input }) => {
      const wallet = await ctx.prisma.wallet.findUnique({
        where: { id: input.walletId },
      });

      if (!wallet) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Wallet not found",
        });
      }

      // Only owner needs to see pending count
      if (wallet.ownerId !== ctx.user.id) {
        return { count: 0 };
      }

      const count = await ctx.prisma.transactionProposal.count({
        where: {
          walletId: input.walletId,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
      });

      return { count };
    }),

  /**
   * Approve and execute a proposal (owner only)
   */
  approve: protectedProcedure
    .input(z.object({ proposalId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await ctx.prisma.transactionProposal.findUnique({
        where: { id: input.proposalId },
        include: { wallet: true },
      });

      if (!proposal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Proposal not found",
        });
      }

      // Only owner can approve
      if (proposal.wallet.ownerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the wallet owner can approve proposals",
        });
      }

      // Check status
      if (proposal.status !== "PENDING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Proposal has already been ${proposal.status.toLowerCase()}`,
        });
      }

      // Check expiration
      if (proposal.expiresAt < new Date()) {
        await ctx.prisma.transactionProposal.update({
          where: { id: input.proposalId },
          data: { status: "EXPIRED" },
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Proposal has expired",
        });
      }

      // Ensure wallet has auth method ID
      if (!proposal.wallet.authMethodId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Wallet is missing auth method ID. Please delete and recreate the wallet.",
        });
      }

      // Mark as approved
      await ctx.prisma.transactionProposal.update({
        where: { id: input.proposalId },
        data: {
          status: "APPROVED",
          reviewerId: ctx.user.id,
          reviewedAt: new Date(),
        },
      });

      try {
        // Get transaction parameters
        const [nonce, gasPrice, gasLimit] = await Promise.all([
          blockchainService.getTransactionCount(proposal.wallet.address),
          blockchainService.getGasPrice(),
          blockchainService.estimateGas({
            to: proposal.to,
            value: proposal.value,
            data: proposal.data || undefined,
          }),
        ]);

        // Convert ETH value to Wei
        const valueInWei = parseEther(proposal.value).toString();

        // Sign the transaction using Lit Action with JWT verification
        const signedTx = await litService.signTransaction(
          proposal.wallet.pkpPublicKey,
          {
            to: proposal.to,
            value: valueInWei,
            data: proposal.data || undefined,
            nonce,
            gasLimit,
            gasPrice,
            chainId: process.env.NODE_ENV === "production" ? 1 : 11155111,
          },
          ctx.jwt,
          proposal.wallet.authMethodId
        );

        // Broadcast the transaction
        const result = await blockchainService.broadcastTransaction(signedTx.serializedTransaction);

        // Update proposal with tx hash
        await ctx.prisma.transactionProposal.update({
          where: { id: input.proposalId },
          data: {
            status: "EXECUTED",
            txHash: result.hash,
          },
        });

        return {
          success: true,
          txHash: result.hash,
          proposal: await ctx.prisma.transactionProposal.findUnique({
            where: { id: input.proposalId },
            include: { proposer: true, reviewer: true },
          }),
        };
      } catch (error) {
        // Revert status if execution fails
        await ctx.prisma.transactionProposal.update({
          where: { id: input.proposalId },
          data: {
            status: "PENDING",
            reviewerId: null,
            reviewedAt: null,
          },
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to execute transaction",
        });
      }
    }),

  /**
   * Reject a proposal (owner only)
   */
  reject: protectedProcedure
    .input(
      z.object({
        proposalId: z.string(),
        reason: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const proposal = await ctx.prisma.transactionProposal.findUnique({
        where: { id: input.proposalId },
        include: { wallet: true },
      });

      if (!proposal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Proposal not found",
        });
      }

      // Only owner can reject
      if (proposal.wallet.ownerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the wallet owner can reject proposals",
        });
      }

      // Check status
      if (proposal.status !== "PENDING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Proposal has already been ${proposal.status.toLowerCase()}`,
        });
      }

      const updatedProposal = await ctx.prisma.transactionProposal.update({
        where: { id: input.proposalId },
        data: {
          status: "REJECTED",
          reviewerId: ctx.user.id,
          reviewedAt: new Date(),
        },
        include: { proposer: true, reviewer: true },
      });

      return updatedProposal;
    }),

  /**
   * Cancel a proposal (proposer only, while still pending)
   */
  cancel: protectedProcedure
    .input(z.object({ proposalId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await ctx.prisma.transactionProposal.findUnique({
        where: { id: input.proposalId },
      });

      if (!proposal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Proposal not found",
        });
      }

      // Only proposer can cancel their own proposal
      if (proposal.proposerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the proposer can cancel their proposal",
        });
      }

      // Can only cancel pending proposals
      if (proposal.status !== "PENDING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot cancel a proposal that has been ${proposal.status.toLowerCase()}`,
        });
      }

      const updatedProposal = await ctx.prisma.transactionProposal.update({
        where: { id: input.proposalId },
        data: { status: "REJECTED" },
        include: { proposer: true },
      });

      return updatedProposal;
    }),
});
