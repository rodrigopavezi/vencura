import { appRouter } from "@/server/trpc/routers/_app";
import { createCallerFactory } from "@/server/trpc/init";
import { getTestPrisma } from "./db";
import type { User } from "@/lib/generated/prisma";

const createCaller = createCallerFactory(appRouter);

/**
 * Create a mock JWT token for testing
 * This is a simplified JWT that contains the user's email
 */
function createMockJwt(user: User): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    email: user.email,
    sub: user.id,
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  })).toString("base64url");
  const signature = "mock-signature";
  return `${header}.${payload}.${signature}`;
}

export function createTestCaller(user?: User | null) {
  const prisma = getTestPrisma();
  return createCaller({
    prisma,
    user: user ?? null,
    jwt: user ? createMockJwt(user) : null,
  });
}

export function createAuthenticatedCaller(user: User) {
  return createTestCaller(user);
}

export function createUnauthenticatedCaller() {
  return createTestCaller(null);
}
