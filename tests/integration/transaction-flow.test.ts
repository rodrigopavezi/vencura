import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestCaller } from "@/tests/utils/trpc";
import { createUser, createWallet, createWalletAccess } from "@/tests/utils/factories";
import { cleanupDatabase } from "@/tests/utils/db";

// Mock services
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
  getBalance: vi.fn().mockResolvedValue({ wei: "5000000000000000000", ether: "5" }),
  getTokenBalances: vi.fn().mockResolvedValue([
    { contractAddress: "0x" + "1".repeat(40), symbol: "USDC", name: "USD Coin", balance: "1000000000", decimals: 6 },
    { contractAddress: "0x" + "2".repeat(40), symbol: "WETH", name: "Wrapped Ether", balance: "500000000000000000", decimals: 18 },
  ]),
  getTransactionHistory: vi.fn().mockResolvedValue([
    {
      hash: "0x" + "a".repeat(64),
      from: "0x" + "b".repeat(40),
      to: "0x" + "c".repeat(40),
      value: "0.5",
      timestamp: 1700000000,
      blockNumber: 18000000,
      status: "success",
    },
    {
      hash: "0x" + "d".repeat(64),
      from: "0x" + "c".repeat(40),
      to: "0x" + "b".repeat(40),
      value: "0.25",
      timestamp: 1700001000,
      blockNumber: 18000100,
      status: "success",
    },
  ]),
  getTransactionCount: vi.fn().mockResolvedValue(15),
  getGasPrice: vi.fn().mockResolvedValue("30000000000"),
  estimateGas: vi.fn().mockResolvedValue("21000"),
  broadcastTransaction: vi.fn().mockResolvedValue({
    hash: "0x" + "e".repeat(64),
    status: "success",
  }),
}));

import * as blockchainService from "@/lib/blockchain/service";
import * as litService from "@/lib/lit/service";

describe("Transaction Flow Integration Tests", () => {
  beforeEach(async () => {
    await cleanupDatabase();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("Transaction signing and broadcasting", () => {
    it("should complete a full transaction flow", async () => {
      const user = await createUser();
      const wallet = await createWallet(user.id);
      const caller = createTestCaller(user);

      // Check balance before transaction
      const balanceBefore = await caller.wallet.getBalance({ id: wallet.id });
      expect(balanceBefore.eth.ether).toBe("5");

      // Send transaction
      const txResult = await caller.wallet.sendTransaction({
        walletId: wallet.id,
        to: "0x" + "recipient".padEnd(40, "0"),
        value: "0.5",
        
      });

      expect(txResult.hash).toMatch(/^0x[a-f0-9]{64}$/i);
      expect(txResult.status).toBe("success");

      // Verify services were called correctly
      expect(litService.signTransaction).toHaveBeenCalledWith(
        wallet.pkpPublicKey,
        expect.objectContaining({
          to: expect.any(String),
          // Value is converted to Wei (0.5 ETH = 500000000000000000 Wei)
          value: "500000000000000000",
        }),
        expect.any(String), // userJwt
        expect.any(String)  // authMethodId
      );
      expect(blockchainService.broadcastTransaction).toHaveBeenCalled();
    });

    it("should include correct transaction parameters", async () => {
      const user = await createUser();
      const wallet = await createWallet(user.id);
      const caller = createTestCaller(user);

      await caller.wallet.sendTransaction({
        walletId: wallet.id,
        to: "0x" + "f".repeat(40),
        value: "1.5",
        data: "0x12345678",
        
      });

      expect(blockchainService.getTransactionCount).toHaveBeenCalledWith(wallet.address);
      expect(blockchainService.getGasPrice).toHaveBeenCalled();
      expect(blockchainService.estimateGas).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "0x" + "f".repeat(40),
          value: "1.5",
          data: "0x12345678",
        })
      );
    });
  });

  describe("Transaction history", () => {
    it("should retrieve transaction history", async () => {
      const user = await createUser();
      const wallet = await createWallet(user.id);
      const caller = createTestCaller(user);

      const history = await caller.wallet.getTransactions({ walletId: wallet.id });

      expect(history).toHaveLength(2);
      expect(history[0].status).toBe("success");
      expect(history[0].value).toBe("0.5");
    });

    it("should respect limit parameter", async () => {
      const user = await createUser();
      const wallet = await createWallet(user.id);
      const caller = createTestCaller(user);

      await caller.wallet.getTransactions({
        walletId: wallet.id,
        limit: 10,
      });

      expect(blockchainService.getTransactionHistory).toHaveBeenCalledWith(
        wallet.address,
        10
      );
    });
  });

  describe("Access control for transactions", () => {
    it("should allow owner to send transactions", async () => {
      const owner = await createUser();
      const wallet = await createWallet(owner.id);
      const ownerCaller = createTestCaller(owner);

      const result = await ownerCaller.wallet.sendTransaction({
        walletId: wallet.id,
        to: "0x" + "a".repeat(40),
        value: "0.1",
        
      });

      expect(result.status).toBe("success");
    });

    it("should allow FULL_ACCESS user to send transactions", async () => {
      const owner = await createUser();
      const fullAccessUser = await createUser();
      const wallet = await createWallet(owner.id);
      await createWalletAccess(wallet.id, fullAccessUser.id, "FULL_ACCESS");

      const fullAccessCaller = createTestCaller(fullAccessUser);

      const result = await fullAccessCaller.wallet.sendTransaction({
        walletId: wallet.id,
        to: "0x" + "b".repeat(40),
        value: "0.2",
        
      });

      expect(result.status).toBe("success");
    });

    it("should not allow VIEW_ONLY user to send transactions", async () => {
      const owner = await createUser();
      const viewOnlyUser = await createUser();
      const wallet = await createWallet(owner.id);
      await createWalletAccess(wallet.id, viewOnlyUser.id, "VIEW_ONLY");

      const viewOnlyCaller = createTestCaller(viewOnlyUser);

      await expect(
        viewOnlyCaller.wallet.sendTransaction({
          walletId: wallet.id,
          to: "0x" + "c".repeat(40),
          value: "0.1",
          
        })
      ).rejects.toThrow(/do not have|Only the|not for you/);
    });

    it("should not allow CO_SIGNER user to send transactions independently", async () => {
      const owner = await createUser();
      const coSignerUser = await createUser();
      const wallet = await createWallet(owner.id);
      await createWalletAccess(wallet.id, coSignerUser.id, "CO_SIGNER");

      const coSignerCaller = createTestCaller(coSignerUser);

      await expect(
        coSignerCaller.wallet.sendTransaction({
          walletId: wallet.id,
          to: "0x" + "d".repeat(40),
          value: "0.1",
          
        })
      ).rejects.toThrow(/do not have|Only the|not for you/);
    });

    it("should allow all access levels to view transaction history", async () => {
      const owner = await createUser();
      const viewOnlyUser = await createUser();
      const coSignerUser = await createUser();
      const wallet = await createWallet(owner.id);
      await createWalletAccess(wallet.id, viewOnlyUser.id, "VIEW_ONLY");
      await createWalletAccess(wallet.id, coSignerUser.id, "CO_SIGNER");

      const viewOnlyCaller = createTestCaller(viewOnlyUser);
      const coSignerCaller = createTestCaller(coSignerUser);

      const history1 = await viewOnlyCaller.wallet.getTransactions({ walletId: wallet.id });
      expect(history1).toHaveLength(2);

      const history2 = await coSignerCaller.wallet.getTransactions({ walletId: wallet.id });
      expect(history2).toHaveLength(2);
    });
  });

  describe("Balance queries", () => {
    it("should return ETH and token balances", async () => {
      const user = await createUser();
      const wallet = await createWallet(user.id);
      const caller = createTestCaller(user);

      const balance = await caller.wallet.getBalance({ id: wallet.id });

      expect(balance.eth.ether).toBe("5");
      expect(balance.tokens).toHaveLength(2);
      expect(balance.tokens[0].symbol).toBe("USDC");
      expect(balance.tokens[1].symbol).toBe("WETH");
    });

    it("should allow all access levels to view balances", async () => {
      const owner = await createUser();
      const viewOnlyUser = await createUser();
      const wallet = await createWallet(owner.id);
      await createWalletAccess(wallet.id, viewOnlyUser.id, "VIEW_ONLY");

      const viewOnlyCaller = createTestCaller(viewOnlyUser);

      const balance = await viewOnlyCaller.wallet.getBalance({ id: wallet.id });
      expect(balance.eth).toBeDefined();
      expect(balance.tokens).toBeDefined();
    });
  });

  describe("Message signing", () => {
    it("should sign messages with the wallet PKP", async () => {
      const user = await createUser();
      const wallet = await createWallet(user.id);
      const caller = createTestCaller(user);

      const signed = await caller.wallet.signMessage({
        walletId: wallet.id,
        message: "I agree to the terms and conditions",
        
      });

      expect(signed.signature).toBeDefined();
      expect(litService.signMessage).toHaveBeenCalledWith(
        wallet.pkpPublicKey,
        "I agree to the terms and conditions",
        expect.any(String), // userJwt
        expect.any(String)  // authMethodId
      );
    });
  });
});
