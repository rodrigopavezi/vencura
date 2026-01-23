import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { prisma } from "@/lib/prisma";
import type { User } from "@/lib/generated/prisma";

export interface TRPCContext {
  prisma: typeof prisma;
  user: User | null;
  jwt: string | null; // Raw JWT token for Lit Protocol auth
}

export const createTRPCContext = async (opts?: { 
  user?: User | null;
  jwt?: string | null;
}): Promise<TRPCContext> => {
  return {
    prisma,
    user: opts?.user ?? null,
    jwt: opts?.jwt ?? null,
  };
};

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

/**
 * Protected procedure - requires authenticated user
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action",
    });
  }

  if (!ctx.jwt) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "JWT token is required for authenticated operations",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      jwt: ctx.jwt,
    },
  });
});
