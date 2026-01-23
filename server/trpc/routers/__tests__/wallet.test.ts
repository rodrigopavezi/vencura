import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestCaller } from "@/tests/utils/trpc";
import { createUser, createWallet, createWalletAccess } from "@/tests/utils/factories";
import { cleanupDatabase, disconnectDatabase, getTestPrisma } from "@/tests/utils/db";

// Mock the services
vi.mock("@/lib/lit/service", () => ({
  mintPKP: vi.fn().mockResolvedValue({
    tokenId: "0x" + "1".repeat(64),
    publicKey: "04" + "a".repeat(128),
    ethAddress: "0x" + "b".repeat(40),
  }),
  getSessionSigs: vi.fn().mockResolvedValue({ nodeUrl: { sig: "test" } }),
  signMessage: vi.fn().mockResolvedValue({
    signature: "0x" + "c".repeat(130),
    publicKey: "04" + "a".repeat(128),
    message: "test message",
  }),
  signTransaction: vi.fn().mockResolvedValue({
    signature: "0x" + "d".repeat(130),
    serializedTransaction: "0x" + "e".repeat(200),
  }),
}));

vi.mock("@/lib/blockchain/service", () => ({
  getBalance: vi.fn().mockResolvedValue({ wei: "1000000000000000000", ether: "1" }),
  getTokenBalances: vi.fn().mockResolvedValue([]),
  getTransactionHistory: vi.fn().mockResolvedValue([]),
  getTransactionCount: vi.fn().mockResolvedValue(5),
  getGasPrice: vi.fn().mockResolvedValue("20000000000"),
  estimateGas: vi.fn().mockResolvedValue("21000"),
  broadcastTransaction: vi.fn().mockResolvedValue({
    hash: "0x" + "f".repeat(64),
    status: "success",
  }),
}));

describe("Wallet Router", () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("create", () => {
    it("should create a new wallet for authenticated user", async () => {
      const user = await createUser();
      const caller = createTestCaller(user);

      const result = await caller.wallet.create({
        name: "My New Wallet",
      });

      expect(result.name).toBe("My New Wallet");
      expect(result.ownerId).toBe(user.id);
      expect(result.address).toBeDefined();
    });

    it("should throw error for unauthenticated user", async () => {
      const caller = createTestCaller(null);

      await expect(
        caller.wallet.create({
          name: "Test Wallet",
        })
      ).rejects.toThrow("must be logged in");
    });
  });

  describe("getAll", () => {
    it("should return owned and shared wallets", async () => {
      const owner = await createUser();
      const sharedUser = await createUser();
      
      const ownedWallet = await createWallet(owner.id, { name: "Owned Wallet" });
      const sharedWallet = await createWallet(sharedUser.id, { name: "Shared Wallet" });
      await createWalletAccess(sharedWallet.id, owner.id, "VIEW_ONLY");

      const caller = createTestCaller(owner);
      const result = await caller.wallet.getAll();

      expect(result.owned).toHaveLength(1);
      expect(result.owned[0].name).toBe("Owned Wallet");
      expect(result.shared).toHaveLength(1);
      expect(result.shared[0].name).toBe("Shared Wallet");
    });
  });

  describe("getById", () => {
    it("should return wallet for owner", async () => {
      const user = await createUser();
      const wallet = await createWallet(user.id);

      const caller = createTestCaller(user);
      const result = await caller.wallet.getById({ id: wallet.id });

      expect(result.id).toBe(wallet.id);
      expect(result.role).toBe("OWNER");
    });

    it("should return wallet for user with access", async () => {
      const owner = await createUser();
      const accessUser = await createUser();
      const wallet = await createWallet(owner.id);
      await createWalletAccess(wallet.id, accessUser.id, "VIEW_ONLY");

      const caller = createTestCaller(accessUser);
      const result = await caller.wallet.getById({ id: wallet.id });

      expect(result.id).toBe(wallet.id);
      expect(result.role).toBe("VIEW_ONLY");
    });

    it("should throw error for user without access", async () => {
      const owner = await createUser();
      const otherUser = await createUser();
      const wallet = await createWallet(owner.id);

      const caller = createTestCaller(otherUser);

      await expect(caller.wallet.getById({ id: wallet.id })).rejects.toThrow(
        "do not have access"
      );
    });
  });

  describe("update", () => {
    it("should allow owner to update wallet name", async () => {
      const user = await createUser();
      const wallet = await createWallet(user.id, { name: "Old Name" });

      const caller = createTestCaller(user);
      const result = await caller.wallet.update({
        id: wallet.id,
        name: "New Name",
      });

      expect(result.name).toBe("New Name");
    });

    it("should not allow non-owner to update", async () => {
      const owner = await createUser();
      const otherUser = await createUser();
      const wallet = await createWallet(owner.id);
      await createWalletAccess(wallet.id, otherUser.id, "FULL_ACCESS");

      const caller = createTestCaller(otherUser);

      await expect(
        caller.wallet.update({ id: wallet.id, name: "Hacked Name" })
      ).rejects.toThrow("Only the owner");
    });
  });

  describe("delete", () => {
    it("should allow owner to delete wallet", async () => {
      const user = await createUser();
      const wallet = await createWallet(user.id);

      const caller = createTestCaller(user);
      await caller.wallet.delete({ id: wallet.id });

      const prisma = getTestPrisma();
      const deletedWallet = await prisma.wallet.findUnique({
        where: { id: wallet.id },
      });
      expect(deletedWallet).toBeNull();
    });

    it("should not allow non-owner to delete", async () => {
      const owner = await createUser();
      const otherUser = await createUser();
      const wallet = await createWallet(owner.id);

      const caller = createTestCaller(otherUser);

      await expect(caller.wallet.delete({ id: wallet.id })).rejects.toThrow(
        "Only the owner"
      );
    });
  });

  describe("getBalance", () => {
    it("should return balance for wallet owner", async () => {
      const user = await createUser();
      const wallet = await createWallet(user.id);

      const caller = createTestCaller(user);
      const result = await caller.wallet.getBalance({ id: wallet.id });

      expect(result.eth.ether).toBe("1");
      expect(result.tokens).toEqual([]);
    });

    it("should return balance for user with access", async () => {
      const owner = await createUser();
      const accessUser = await createUser();
      const wallet = await createWallet(owner.id);
      await createWalletAccess(wallet.id, accessUser.id, "VIEW_ONLY");

      const caller = createTestCaller(accessUser);
      const result = await caller.wallet.getBalance({ id: wallet.id });

      expect(result.eth).toBeDefined();
    });
  });

  describe("signMessage", () => {
    it("should allow owner to sign messages", async () => {
      const user = await createUser();
      const wallet = await createWallet(user.id);

      const caller = createTestCaller(user);
      const result = await caller.wallet.signMessage({
        walletId: wallet.id,
        message: "Hello, World!",
      });

      expect(result.signature).toBeDefined();
      expect(result.message).toBe("test message");
    });

    it("should allow FULL_ACCESS user to sign messages", async () => {
      const owner = await createUser();
      const fullAccessUser = await createUser();
      const wallet = await createWallet(owner.id);
      await createWalletAccess(wallet.id, fullAccessUser.id, "FULL_ACCESS");

      const caller = createTestCaller(fullAccessUser);
      const result = await caller.wallet.signMessage({
        walletId: wallet.id,
        message: "Test message",
      });

      expect(result.signature).toBeDefined();
    });

    it("should not allow VIEW_ONLY user to sign messages", async () => {
      const owner = await createUser();
      const viewOnlyUser = await createUser();
      const wallet = await createWallet(owner.id);
      await createWalletAccess(wallet.id, viewOnlyUser.id, "VIEW_ONLY");

      const caller = createTestCaller(viewOnlyUser);

      await expect(
        caller.wallet.signMessage({
          walletId: wallet.id,
          message: "Test",
        })
      ).rejects.toThrow("do not have permission to sign");
    });
  });

  describe("getTransactions", () => {
    it("should return transaction history", async () => {
      const user = await createUser();
      const wallet = await createWallet(user.id);

      const caller = createTestCaller(user);
      const result = await caller.wallet.getTransactions({
        walletId: wallet.id,
      });

      expect(Array.isArray(result)).toBe(true);
    });
  });
});
