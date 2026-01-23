import { faker } from "@faker-js/faker";
import { getTestPrisma } from "./db";

export function createUserData(overrides: Partial<{ email: string; name: string }> = {}) {
  return {
    email: overrides.email ?? faker.internet.email(),
    name: overrides.name ?? faker.person.fullName(),
  };
}

export function createWalletData(
  ownerId: string,
  overrides: Partial<{
    name: string;
    address: string;
    pkpTokenId: string;
    pkpPublicKey: string;
    authMethodId: string;
  }> = {}
) {
  return {
    name: overrides.name ?? `Wallet ${faker.word.adjective()}`,
    address: overrides.address ?? faker.string.hexadecimal({ length: 40, prefix: "0x" }),
    pkpTokenId: overrides.pkpTokenId ?? faker.string.hexadecimal({ length: 64, prefix: "0x" }),
    pkpPublicKey: overrides.pkpPublicKey ?? faker.string.hexadecimal({ length: 128, prefix: "0x" }),
    authMethodId: overrides.authMethodId ?? faker.string.hexadecimal({ length: 64, prefix: "0x" }),
    ownerId,
  };
}

export async function createUser(overrides: Partial<{ email: string; name: string }> = {}) {
  const prisma = getTestPrisma();
  return prisma.user.create({
    data: createUserData(overrides),
  });
}

export async function createWallet(
  ownerId: string,
  overrides: Partial<{
    name: string;
    address: string;
    pkpTokenId: string;
    pkpPublicKey: string;
    authMethodId: string;
  }> = {}
) {
  const prisma = getTestPrisma();
  return prisma.wallet.create({
    data: createWalletData(ownerId, overrides),
  });
}

export async function createWalletAccess(
  walletId: string,
  userId: string,
  role: "VIEW_ONLY" | "CO_SIGNER" | "FULL_ACCESS" = "VIEW_ONLY"
) {
  const prisma = getTestPrisma();
  return prisma.walletAccess.create({
    data: {
      walletId,
      userId,
      role,
    },
  });
}

export async function createWalletInvitation(
  walletId: string,
  inviterId: string,
  inviteeEmail: string,
  role: "VIEW_ONLY" | "CO_SIGNER" | "FULL_ACCESS" = "VIEW_ONLY",
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED" = "PENDING"
) {
  const prisma = getTestPrisma();
  return prisma.walletInvitation.create({
    data: {
      walletId,
      inviterId,
      inviteeEmail,
      role,
      status,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    },
  });
}
