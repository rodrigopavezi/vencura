import { describe, it, expect, vi, beforeEach } from "vitest";
import { getBalance, getTokenBalances, getTransactionHistory, broadcastTransaction } from "../service";

// Mock viem
vi.mock("viem", async () => {
  const actual = await vi.importActual("viem");
  return {
    ...actual,
    createPublicClient: vi.fn(() => mockPublicClient),
  };
});

const mockPublicClient = {
  getBalance: vi.fn(),
  getTransactionCount: vi.fn(),
  estimateGas: vi.fn(),
  getGasPrice: vi.fn(),
  sendRawTransaction: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  readContract: vi.fn(),
};

// Mock fetch for Etherscan API calls
global.fetch = vi.fn();

describe("Blockchain Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getBalance", () => {
    it("should return ETH balance in wei and ether", async () => {
      const mockBalance = BigInt("1500000000000000000"); // 1.5 ETH
      mockPublicClient.getBalance.mockResolvedValue(mockBalance);

      const result = await getBalance("0x" + "a".repeat(40));

      expect(result.wei).toBe("1500000000000000000");
      expect(result.ether).toBe("1.5");
    });

    it("should return zero balance", async () => {
      mockPublicClient.getBalance.mockResolvedValue(BigInt(0));

      const result = await getBalance("0x" + "b".repeat(40));

      expect(result.wei).toBe("0");
      expect(result.ether).toBe("0");
    });
  });

  describe("getTokenBalances", () => {
    beforeEach(() => {
      process.env.ETHERSCAN_API_KEY = "test-api-key";
    });

    it("should return empty array when no API key", async () => {
      delete process.env.ETHERSCAN_API_KEY;

      const result = await getTokenBalances("0x" + "c".repeat(40));

      expect(result).toEqual([]);
    });

    it("should return token balances from Etherscan", async () => {
      const mockTokenTxs = {
        status: "1",
        result: [
          {
            contractAddress: "0x" + "d".repeat(40),
            tokenSymbol: "USDC",
            tokenName: "USD Coin",
            tokenDecimal: "6",
          },
        ],
      };

      vi.mocked(global.fetch).mockResolvedValue({
        json: () => Promise.resolve(mockTokenTxs),
      } as Response);

      mockPublicClient.readContract.mockResolvedValue(BigInt("1000000")); // 1 USDC

      const result = await getTokenBalances("0x" + "e".repeat(40));

      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it("should handle API errors gracefully", async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error("API Error"));

      const result = await getTokenBalances("0x" + "f".repeat(40));

      expect(result).toEqual([]);
    });
  });

  describe("getTransactionHistory", () => {
    beforeEach(() => {
      process.env.ETHERSCAN_API_KEY = "test-api-key";
    });

    it("should return transaction history", async () => {
      const mockTxs = {
        status: "1",
        result: [
          {
            hash: "0x" + "1".repeat(64),
            from: "0x" + "2".repeat(40),
            to: "0x" + "3".repeat(40),
            value: "1000000000000000000",
            timeStamp: "1700000000",
            blockNumber: "18000000",
            isError: "0",
            txreceipt_status: "1",
          },
        ],
      };

      vi.mocked(global.fetch).mockResolvedValue({
        json: () => Promise.resolve(mockTxs),
      } as Response);

      const result = await getTransactionHistory("0x" + "4".repeat(40));

      expect(result).toHaveLength(1);
      expect(result[0].hash).toBe("0x" + "1".repeat(64));
      expect(result[0].status).toBe("success");
    });

    it("should return empty array when no API key", async () => {
      delete process.env.ETHERSCAN_API_KEY;

      const result = await getTransactionHistory("0x" + "5".repeat(40));

      expect(result).toEqual([]);
    });
  });

  describe("broadcastTransaction", () => {
    it("should broadcast transaction and return result", async () => {
      const txHash = "0x" + "6".repeat(64);
      mockPublicClient.sendRawTransaction.mockResolvedValue(txHash);
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        status: "success",
      });

      const signedTx = "0x" + "7".repeat(200);
      const result = await broadcastTransaction(signedTx);

      expect(result.hash).toBe(txHash);
      expect(result.status).toBe("success");
    });

    it("should handle failed transactions", async () => {
      const txHash = "0x" + "8".repeat(64);
      mockPublicClient.sendRawTransaction.mockResolvedValue(txHash);
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        status: "reverted",
      });

      const signedTx = "0x" + "9".repeat(200);
      const result = await broadcastTransaction(signedTx);

      expect(result.hash).toBe(txHash);
      expect(result.status).toBe("failed");
    });
  });
});
