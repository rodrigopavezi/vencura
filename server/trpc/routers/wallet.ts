import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import * as litService from "@/lib/lit/service";
import * as blockchainService from "@/lib/blockchain/service";
import { parseEther } from "viem";

const AccessRole = z.enum(["VIEW_ONLY", "CO_SIGNER", "FULL_ACCESS"]);

export const walletRouter = router({
  /**
   * Create a new wallet with PKP
   * The user's identity (email) becomes the PKP controller for true self-custody
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Mint a new PKP using user's email as the controller
      // The server wallet only pays gas, user's JWT controls the PKP
      const pkpInfo = await litService.mintPKP(ctx.user.email);

      // Store the wallet in the database with authMethodId for session sig generation
      const wallet = await ctx.prisma.wallet.create({
        data: {
          name: input.name,
          address: pkpInfo.ethAddress,
          pkpTokenId: pkpInfo.tokenId,
          pkpPublicKey: pkpInfo.publicKey,
          authMethodId: pkpInfo.authMethodId,
          ownerId: ctx.user.id,
        },
      });

      return wallet;
    }),

  /**
   * Get all wallets the user owns or has access to
   */
  getAll: protectedProcedure.query(async ({ ctx }) => {
    // Get wallets owned by the user
    const ownedWallets = await ctx.prisma.wallet.findMany({
      where: { ownerId: ctx.user.id },
      include: {
        accessList: {
          include: { user: true },
        },
        _count: {
          select: { accessList: true },
        },
      },
    });

    // Get wallets the user has access to
    const sharedWallets = await ctx.prisma.wallet.findMany({
      where: {
        accessList: {
          some: { userId: ctx.user.id },
        },
      },
      include: {
        owner: true,
        accessList: {
          where: { userId: ctx.user.id },
        },
      },
    });

    return {
      owned: ownedWallets.map((w) => ({
        ...w,
        role: "OWNER" as const,
      })),
      shared: sharedWallets.map((w) => ({
        ...w,
        role: w.accessList[0]?.role as "VIEW_ONLY" | "CO_SIGNER" | "FULL_ACCESS",
      })),
    };
  }),

  /**
   * Get a single wallet by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const wallet = await ctx.prisma.wallet.findUnique({
        where: { id: input.id },
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

      // Check if user has access
      const isOwner = wallet.ownerId === ctx.user.id;
      const access = wallet.accessList.find((a) => a.userId === ctx.user.id);

      if (!isOwner && !access) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this wallet",
        });
      }

      return {
        ...wallet,
        role: isOwner ? ("OWNER" as const) : (access!.role as "VIEW_ONLY" | "CO_SIGNER" | "FULL_ACCESS"),
      };
    }),

  /**
   * Update wallet name
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const wallet = await ctx.prisma.wallet.findUnique({
        where: { id: input.id },
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
          message: "Only the owner can update the wallet",
        });
      }

      return ctx.prisma.wallet.update({
        where: { id: input.id },
        data: { name: input.name },
      });
    }),

  /**
   * Delete a wallet (owner only)
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const wallet = await ctx.prisma.wallet.findUnique({
        where: { id: input.id },
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
          message: "Only the owner can delete the wallet",
        });
      }

      return ctx.prisma.wallet.delete({
        where: { id: input.id },
      });
    }),

  /**
   * Get wallet balance (ETH and tokens)
   */
  getBalance: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const wallet = await ctx.prisma.wallet.findUnique({
        where: { id: input.id },
        include: {
          accessList: true,
        },
      });

      if (!wallet) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Wallet not found",
        });
      }

      // Check access
      const isOwner = wallet.ownerId === ctx.user.id;
      const hasAccess = wallet.accessList.some((a) => a.userId === ctx.user.id);

      if (!isOwner && !hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this wallet",
        });
      }

      const [ethBalance, tokenBalances] = await Promise.all([
        blockchainService.getBalance(wallet.address),
        blockchainService.getTokenBalances(wallet.address),
      ]);

      return {
        eth: ethBalance,
        tokens: tokenBalances,
      };
    }),

  /**
   * Sign a message with the wallet's PKP
   * Uses user's JWT for authentication (true self-custody)
   */
  signMessage: protectedProcedure
    .input(
      z.object({
        walletId: z.string(),
        message: z.string(),
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

      // Check if user can sign (owner or FULL_ACCESS)
      const isOwner = wallet.ownerId === ctx.user.id;
      const access = wallet.accessList.find((a) => a.userId === ctx.user.id);
      const canSign = isOwner || access?.role === "FULL_ACCESS";

      if (!canSign) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to sign messages with this wallet",
        });
      }

      // Ensure wallet has auth method ID for non-custodial signing
      if (!wallet.authMethodId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Wallet is missing auth method ID. Please delete and recreate the wallet.",
        });
      }

      // For FULL_ACCESS users, compute their own authMethodId from their email
      // For owners, use the wallet's authMethodId (which is the same as their computed one)
      const userAuthMethodId = isOwner
        ? wallet.authMethodId
        : litService.computeAuthMethodId(ctx.user.email);

      // Sign the message using Lit Action with JWT verification (fully non-custodial)
      const signedMessage = await litService.signMessage(
        wallet.pkpPublicKey,
        input.message,
        ctx.jwt,
        userAuthMethodId
      );

      return signedMessage;
    }),

  /**
   * Send a transaction
   */
  sendTransaction: protectedProcedure
    .input(
      z.object({
        walletId: z.string(),
        to: z.string(),
        value: z.string(), // ETH value in ether
        data: z.string().optional(),
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

      // Check if user can transact (owner or FULL_ACCESS)
      const isOwner = wallet.ownerId === ctx.user.id;
      const access = wallet.accessList.find((a) => a.userId === ctx.user.id);
      const canTransact = isOwner || access?.role === "FULL_ACCESS";

      if (!canTransact) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to send transactions from this wallet",
        });
      }

      // Ensure wallet has auth method ID for non-custodial signing
      if (!wallet.authMethodId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Wallet is missing auth method ID. Please delete and recreate the wallet.",
        });
      }

      // For FULL_ACCESS users, compute their own authMethodId from their email
      // For owners, use the wallet's authMethodId (which is the same as their computed one)
      const userAuthMethodId = isOwner
        ? wallet.authMethodId
        : litService.computeAuthMethodId(ctx.user.email);

      // Get transaction parameters
      const [nonce, gasPrice, gasLimit] = await Promise.all([
        blockchainService.getTransactionCount(wallet.address),
        blockchainService.getGasPrice(),
        blockchainService.estimateGas({
          to: input.to,
          value: input.value,
          data: input.data,
        }),
      ]);

      // Convert ETH value to Wei (as string for BigInt conversion in litService)
      const valueInWei = parseEther(input.value).toString();

      // Sign the transaction using Lit Action with JWT verification (fully non-custodial)
      const signedTx = await litService.signTransaction(
        wallet.pkpPublicKey,
        {
          to: input.to,
          value: valueInWei,
          data: input.data,
          nonce,
          gasLimit,
          gasPrice,
          chainId: process.env.NODE_ENV === "production" ? 1 : 11155111, // mainnet or sepolia
        },
        ctx.jwt,
        userAuthMethodId
      );

      // Broadcast the transaction
      const result = await blockchainService.broadcastTransaction(signedTx.serializedTransaction);

      return result;
    }),

  /**
   * Get transaction history for a wallet
   */
  getTransactions: protectedProcedure
    .input(
      z.object({
        walletId: z.string(),
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
      const hasAccess = wallet.accessList.some((a) => a.userId === ctx.user.id);

      if (!isOwner && !hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this wallet",
        });
      }

      const transactions = await blockchainService.getTransactionHistory(
        wallet.address,
        input.limit
      );

      return transactions;
    }),

  /**
   * Migrate an existing wallet to use JWT-based authentication
   * This adds the user's auth method to the PKP and updates the wallet record
   */
  migrateToJwtAuth: protectedProcedure
    .input(z.object({ walletId: z.string() }))
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

      // Only owner can migrate wallet
      if (wallet.ownerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the owner can migrate the wallet",
        });
      }

      // Skip if already migrated
      if (wallet.authMethodId) {
        return {
          success: true,
          message: "Wallet already migrated",
          authMethodId: wallet.authMethodId,
        };
      }

      // Compute auth method ID from user's email
      const authMethodId = litService.computeAuthMethodId(ctx.user.email);

      // Add the user's auth method to the PKP
      // This allows the user to sign with their JWT going forward
      try {
        await litService.addPermittedAuthMethod(wallet.pkpTokenId, {
          authMethodType: 100, // DYNAMIC_JWT_AUTH_METHOD_TYPE
          accessToken: authMethodId,
        });
      } catch (error) {
        console.error("Failed to add auth method to PKP:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to add auth method to PKP. The server wallet may not have permission.",
        });
      }

      // Update wallet record with auth method ID
      const updatedWallet = await ctx.prisma.wallet.update({
        where: { id: input.walletId },
        data: { authMethodId },
      });

      return {
        success: true,
        message: "Wallet migrated to JWT authentication",
        authMethodId: updatedWallet.authMethodId,
      };
    }),
});
