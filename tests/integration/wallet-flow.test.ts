import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestCaller } from "@/tests/utils/trpc";
import { createUser } from "@/tests/utils/factories";
import { cleanupDatabase, getTestPrisma } from "@/tests/utils/db";

// Mock external services
vi.mock("@/lib/lit/service", () => ({
  mintPKP: vi.fn().mockImplementation(() => ({
    tokenId: "0x" + Math.random().toString(16).slice(2).padEnd(64, "0"),
    publicKey: "04" + Math.random().toString(16).slice(2).padEnd(128, "a"),
    ethAddress: "0x" + Math.random().toString(16).slice(2).padEnd(40, "0"),
    authMethodId: "0x" + "a".repeat(64),
  })),
  computeAuthMethodId: vi.fn((_email: string) => "0x" + "a".repeat(64)),
  getSessionSigs: vi.fn().mockResolvedValue({ nodeUrl: { sig: "test" } }),
  signMessage: vi.fn().mockResolvedValue({
    signature: "0x" + "a".repeat(130),
    publicKey: "04" + "b".repeat(128),
    message: "test",
  }),
  signTransaction: vi.fn().mockResolvedValue({
    signature: "0x" + "c".repeat(130),
    serializedTransaction: "0x" + "d".repeat(200),
  }),
  addPermittedAuthMethod: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/blockchain/service", () => ({
  getBalance: vi.fn().mockResolvedValue({ wei: "2500000000000000000", ether: "2.5" }),
  getTokenBalances: vi.fn().mockResolvedValue([
    { contractAddress: "0x" + "a".repeat(40), symbol: "USDC", name: "USD Coin", balance: "1000000000", decimals: 6 },
  ]),
  getTransactionHistory: vi.fn().mockResolvedValue([
    { hash: "0x" + "1".repeat(64), from: "0x" + "2".repeat(40), to: "0x" + "3".repeat(40), value: "1.0", timestamp: 1700000000, blockNumber: 18000000, status: "success" },
  ]),
  getTransactionCount: vi.fn().mockResolvedValue(10),
  getGasPrice: vi.fn().mockResolvedValue("25000000000"),
  estimateGas: vi.fn().mockResolvedValue("21000"),
  broadcastTransaction: vi.fn().mockResolvedValue({ hash: "0x" + "e".repeat(64), status: "success" }),
}));

describe("Wallet Flow Integration Tests", () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("Complete wallet lifecycle", () => {
    it("should create, use, and delete a wallet", async () => {
      // Create a user
      const user = await createUser({ email: "test@example.com", name: "Test User" });
      const caller = createTestCaller(user);

      // Create a wallet
      const wallet = await caller.wallet.create({
        name: "My First Wallet",
      });

      expect(wallet.name).toBe("My First Wallet");
      expect(wallet.ownerId).toBe(user.id);
      expect(wallet.address).toMatch(/^0x[a-f0-9]{40}$/i);

      // Get wallet balance
      const balance = await caller.wallet.getBalance({ id: wallet.id });
      expect(balance.eth.ether).toBe("2.5");
      expect(balance.tokens).toHaveLength(1);
      expect(balance.tokens[0].symbol).toBe("USDC");

      // Get transaction history
      const transactions = await caller.wallet.getTransactions({ walletId: wallet.id });
      expect(transactions).toHaveLength(1);
      expect(transactions[0].status).toBe("success");

      // Sign a message
      const signedMessage = await caller.wallet.signMessage({
        walletId: wallet.id,
        message: "Hello, World!",
      });
      expect(signedMessage.signature).toBeDefined();

      // Update wallet name
      const updatedWallet = await caller.wallet.update({
        id: wallet.id,
        name: "Renamed Wallet",
      });
      expect(updatedWallet.name).toBe("Renamed Wallet");

      // Delete wallet
      await caller.wallet.delete({ id: wallet.id });

      // Verify wallet is deleted
      const prisma = getTestPrisma();
      const deletedWallet = await prisma.wallet.findUnique({ where: { id: wallet.id } });
      expect(deletedWallet).toBeNull();
    });

    it("should create multiple wallets for a user", async () => {
      const user = await createUser();
      const caller = createTestCaller(user);

      // Create multiple wallets
      await caller.wallet.create({
        name: "Personal Wallet",
        
      });

      await caller.wallet.create({
        name: "Business Wallet",
        
      });

      await caller.wallet.create({
        name: "Savings Wallet",
        
      });

      // Get all wallets
      const allWallets = await caller.wallet.getAll();

      expect(allWallets.owned).toHaveLength(3);
      expect(allWallets.owned.map(w => w.name)).toContain("Personal Wallet");
      expect(allWallets.owned.map(w => w.name)).toContain("Business Wallet");
      expect(allWallets.owned.map(w => w.name)).toContain("Savings Wallet");
    });

    it("should send a transaction", async () => {
      const user = await createUser();
      const caller = createTestCaller(user);

      const wallet = await caller.wallet.create({
        name: "Transaction Wallet",
        
      });

      const result = await caller.wallet.sendTransaction({
        walletId: wallet.id,
        to: "0x" + "f".repeat(40),
        value: "0.1",
        
      });

      expect(result.hash).toMatch(/^0x[a-f0-9]{64}$/i);
      expect(result.status).toBe("success");
    });
  });

  describe("Wallet access control", () => {
    it("should prevent unauthorized access to wallets", async () => {
      const owner = await createUser({ email: "owner@example.com" });
      const stranger = await createUser({ email: "stranger@example.com" });

      const ownerCaller = createTestCaller(owner);
      const strangerCaller = createTestCaller(stranger);

      // Owner creates a wallet
      const wallet = await ownerCaller.wallet.create({
        name: "Private Wallet",
        
      });

      // Stranger cannot view the wallet
      await expect(
        strangerCaller.wallet.getById({ id: wallet.id })
      ).rejects.toThrow(/do not have|Only the|not for you/);

      // Stranger cannot get balance
      await expect(
        strangerCaller.wallet.getBalance({ id: wallet.id })
      ).rejects.toThrow(/do not have|Only the|not for you/);

      // Stranger cannot update
      await expect(
        strangerCaller.wallet.update({ id: wallet.id, name: "Hacked" })
      ).rejects.toThrow(/do not have|Only the|not for you/);

      // Stranger cannot delete
      await expect(
        strangerCaller.wallet.delete({ id: wallet.id })
      ).rejects.toThrow(/do not have|Only the|not for you/);
    });
  });
});
