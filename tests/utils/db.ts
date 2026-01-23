import { PrismaClient } from "@/lib/generated/prisma";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

let prisma: PrismaClient | null = null;

export function getTestPrisma(): PrismaClient {
  if (!prisma) {
    const dbPath = path.join(process.cwd(), "test.db");
    const adapter = new PrismaBetterSqlite3({
      url: `file:${dbPath}`,
    });
    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}

export async function cleanupDatabase() {
  const client = getTestPrisma();
  
  try {
    // Delete in order to respect foreign key constraints
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
