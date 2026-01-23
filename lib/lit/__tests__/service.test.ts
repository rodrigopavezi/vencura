import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeAuthMethodId } from "../service";
import * as litClient from "../client";

// Mock the Lit client
vi.mock("../client", () => ({
  getLitClient: vi.fn(),
}));

describe("Lit Service", () => {
  const mockSessionSigs = {
    nodeUrl1: { sig: "sig1", derivedVia: "test", signedMessage: "msg", address: "0x123" },
  };

  const mockLitClient = {
    connect: vi.fn(),
    executeJs: vi.fn(),
    pkpSign: vi.fn(),
    getSessionSigs: vi.fn(),
    getPkpSessionSigs: vi.fn().mockResolvedValue(mockSessionSigs),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(litClient.getLitClient).mockResolvedValue(mockLitClient as any);
  });

  describe("computeAuthMethodId", () => {
    it("should compute a deterministic auth method ID from email", () => {
      const email = "test@example.com";
      const authMethodId1 = computeAuthMethodId(email);
      const authMethodId2 = computeAuthMethodId(email);

      expect(authMethodId1).toBe(authMethodId2);
      expect(authMethodId1).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it("should normalize email to lowercase", () => {
      const authMethodId1 = computeAuthMethodId("TEST@EXAMPLE.COM");
      const authMethodId2 = computeAuthMethodId("test@example.com");

      expect(authMethodId1).toBe(authMethodId2);
    });

    it("should produce different IDs for different emails", () => {
      const authMethodId1 = computeAuthMethodId("user1@example.com");
      const authMethodId2 = computeAuthMethodId("user2@example.com");

      expect(authMethodId1).not.toBe(authMethodId2);
    });

    it("should produce valid keccak256 hash format", () => {
      const authMethodId = computeAuthMethodId("test@example.com");

      // Should be 66 characters (0x + 64 hex chars)
      expect(authMethodId.length).toBe(66);
      // Should start with 0x
      expect(authMethodId.startsWith("0x")).toBe(true);
      // Should only contain hex characters after 0x
      expect(/^0x[0-9a-f]+$/i.test(authMethodId)).toBe(true);
    });
  });

  describe("signMessage validation", () => {
    // Import dynamically to ensure mocks are in place
    it("should require valid JWT format", async () => {
      const { signMessage } = await import("../service");
      const pkpPublicKey = "04" + "b".repeat(128);
      const message = "Hello, World!";
      const invalidJwt = "not-a-valid-jwt";
      const authMethodId = computeAuthMethodId("test@example.com");

      await expect(
        signMessage(pkpPublicKey, message, invalidJwt, authMethodId)
      ).rejects.toThrow("Invalid JWT format");
    });

    it("should verify email matches authMethodId", async () => {
      const { signMessage } = await import("../service");
      const pkpPublicKey = "04" + "b".repeat(128);
      const message = "Hello, World!";
      // JWT for test@example.com with far-future expiry
      const payload = {
        email: "test@example.com",
        exp: 9999999999,
      };
      const userJwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
      // authMethodId for different email
      const wrongAuthMethodId = computeAuthMethodId("other@example.com");

      await expect(
        signMessage(pkpPublicKey, message, userJwt, wrongAuthMethodId)
      ).rejects.toThrow("Unauthorized");
    });
  });

  describe("signTransaction validation", () => {
    it("should require valid JWT format", async () => {
      const { signTransaction } = await import("../service");
      const pkpPublicKey = "04" + "d".repeat(128);
      const transaction = {
        to: "0x" + "e".repeat(40),
        value: "1000000000000000000",
        nonce: 0,
        gasLimit: "21000",
        gasPrice: "20000000000",
        chainId: 1,
      };
      const invalidJwt = "invalid";
      const authMethodId = computeAuthMethodId("test@example.com");

      await expect(
        signTransaction(pkpPublicKey, transaction, invalidJwt, authMethodId)
      ).rejects.toThrow("Invalid JWT format");
    });
  });
});
