import { z } from "zod";
import { router, protectedProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import * as xmtpService from "@/lib/xmtp/service";
import * as litService from "@/lib/lit/service";

/**
 * Helper to create a sign function using Lit Protocol (fully non-custodial)
 * Uses Lit Action to verify JWT and sign in one atomic operation
 */
function createSignMessageFn(
  pkpPublicKey: string,
  userJwt: string,
  authMethodId: string
): (message: string) => Promise<string> {
  return async (message: string): Promise<string> => {
    const signedMessage = await litService.signMessage(pkpPublicKey, message, userJwt, authMethodId);
    return signedMessage.signature;
  };
}

export const messagingRouter = router({
  /**
   * Get all conversations for a wallet
   */
  getConversations: protectedProcedure
    .input(
      z.object({
        walletId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify user has access to the wallet
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

      const isOwner = wallet.ownerId === ctx.user.id;
      const hasAccess = wallet.accessList.some((a) => a.userId === ctx.user.id);

      if (!isOwner && !hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this wallet",
        });
      }

      if (!wallet.authMethodId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Wallet is missing auth method ID. Please migrate the wallet.",
        });
      }

      if (!wallet.authMethodId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Wallet is missing auth method ID. Please delete and recreate the wallet.",
        });
      }

      try {
        // Create a sign function using Lit Protocol (fully non-custodial)
        const signMessageFn = createSignMessageFn(wallet.pkpPublicKey, ctx.jwt, wallet.authMethodId);

        const conversations = await xmtpService.getConversations(
          wallet.address,
          signMessageFn
        );

        return conversations;
      } catch (error) {
        console.error("Failed to get conversations:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to get conversations",
        });
      }
    }),

  /**
   * Get messages from a conversation
   */
  getMessages: protectedProcedure
    .input(
      z.object({
        walletId: z.string(),
        conversationId: z.string(),
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

      const isOwner = wallet.ownerId === ctx.user.id;
      const hasAccess = wallet.accessList.some((a) => a.userId === ctx.user.id);

      if (!isOwner && !hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this wallet",
        });
      }

      if (!wallet.authMethodId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Wallet is missing auth method ID. Please delete and recreate the wallet.",
        });
      }

      try {
        const signMessageFn = createSignMessageFn(wallet.pkpPublicKey, ctx.jwt, wallet.authMethodId);

        const messages = await xmtpService.getMessages(
          wallet.address,
          signMessageFn,
          input.conversationId,
          input.limit
        );

        return messages;
      } catch (error) {
        console.error("Failed to get messages:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to get messages",
        });
      }
    }),

  /**
   * Send a message to a peer address
   */
  sendMessage: protectedProcedure
    .input(
      z.object({
        walletId: z.string(),
        conversationId: z.string(),
        content: z.string().min(1).max(10000),
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

      // Only owner and FULL_ACCESS can send messages
      const isOwner = wallet.ownerId === ctx.user.id;
      const access = wallet.accessList.find((a) => a.userId === ctx.user.id);
      const canMessage = isOwner || access?.role === "FULL_ACCESS";

      if (!canMessage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to send messages from this wallet",
        });
      }

      if (!wallet.authMethodId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Wallet is missing auth method ID. Please delete and recreate the wallet.",
        });
      }

      try {
        const signMessageFn = createSignMessageFn(wallet.pkpPublicKey, ctx.jwt, wallet.authMethodId);

        const sentMessage = await xmtpService.sendMessage(
          wallet.address,
          signMessageFn,
          input.conversationId,
          input.content
        );

        if (!sentMessage) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Conversation not found",
          });
        }

        return sentMessage;
      } catch (error) {
        console.error("Failed to send message:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send message",
        });
      }
    }),

  /**
   * Start a new conversation with a peer
   */
  startConversation: protectedProcedure
    .input(
      z.object({
        walletId: z.string(),
        peerAddress: z.string(),
        initialMessage: z.string().min(1).max(10000).optional(),
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

      const isOwner = wallet.ownerId === ctx.user.id;
      const access = wallet.accessList.find((a) => a.userId === ctx.user.id);
      const canMessage = isOwner || access?.role === "FULL_ACCESS";

      if (!canMessage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to start conversations from this wallet",
        });
      }

      if (!wallet.authMethodId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Wallet is missing auth method ID. Please delete and recreate the wallet.",
        });
      }

      try {
        // Check if peer is a wallet in our system and register it with XMTP if needed
        // Try both original case and lowercase for address matching
        const peerWallet = await ctx.prisma.wallet.findFirst({
          where: {
            OR: [
              { address: input.peerAddress },
              { address: input.peerAddress.toLowerCase() },
            ],
          },
        });

        if (peerWallet && peerWallet.authMethodId) {
          // Register the peer wallet with XMTP first (this ensures they can receive messages)
          console.log(`📬 Registering peer wallet ${input.peerAddress.slice(0, 10)}... with XMTP`);
          const peerSignMessageFn = createSignMessageFn(peerWallet.pkpPublicKey, ctx.jwt, peerWallet.authMethodId);
          try {
            // Just creating the client registers it with XMTP
            await xmtpService.getXmtpClient(peerWallet.address, peerSignMessageFn);
            console.log(`✅ Peer wallet registered with XMTP`);
          } catch (peerRegError) {
            console.warn(`⚠️ Could not register peer wallet with XMTP:`, peerRegError);
            // Continue anyway - maybe they're registered externally
          }
        }

        const signMessageFn = createSignMessageFn(wallet.pkpPublicKey, ctx.jwt, wallet.authMethodId);

        const result = await xmtpService.startConversation(
          wallet.address,
          signMessageFn,
          input.peerAddress,
          input.initialMessage
        );

        return result;
      } catch (error) {
        console.error("Failed to start conversation:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to start conversation",
        });
      }
    }),

  /**
   * Check if a peer address can receive XMTP messages
   */
  canMessage: protectedProcedure
    .input(
      z.object({
        walletId: z.string(),
        peerAddress: z.string(),
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

      const isOwner = wallet.ownerId === ctx.user.id;
      const hasAccess = wallet.accessList.some((a) => a.userId === ctx.user.id);

      if (!isOwner && !hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this wallet",
        });
      }

      if (!wallet.authMethodId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Wallet is missing auth method ID. Please delete and recreate the wallet.",
        });
      }

      try {
        const signMessageFn = createSignMessageFn(wallet.pkpPublicKey, ctx.jwt, wallet.authMethodId);

        const canMsg = await xmtpService.canMessage(
          wallet.address,
          signMessageFn,
          input.peerAddress
        );

        return { canMessage: canMsg };
      } catch (error) {
        console.error("Failed to check if can message:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to check messaging capability",
        });
      }
    }),
});
