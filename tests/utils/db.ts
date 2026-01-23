import { PrismaClient } from "@/lib/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

let prisma: PrismaClient | null = null;

export function getTestPrisma(): PrismaClient {
  if (!prisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set for tests");
    }
    const adapter = new PrismaPg({ connectionString });
    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}

export async function cleanupDatabase() {
  const client = getTestPrisma();
  
  try {
    // Delete in order to respect foreign key constraints
    await client.transactionProposal.deleteMany();
    await client.walletInvitation.deleteMany();
    await client.walletAccess.deleteMany();
    await client.wallet.deleteMany();
    await client.user.deleteMany();
  } catch (error) {
    // Ignore cleanup errors
    console.error("Cleanup error:", error);
  }
}

export async function disconnectDatabase() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
