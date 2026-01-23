import { describe, it, expect, vi, beforeEach } from "vitest";
import { signMessage, signTransaction, getSessionSigs, computeAuthMethodId } from "../service";
import * as litClient from "../client";

// Mock the Lit client
vi.mock("../client", () => ({
  getLitClient: vi.fn(),
}));

describe("Lit Service", () => {
  const mockLitClient = {
    connect: vi.fn(),
    executeJs: vi.fn(),
    pkpSign: vi.fn(),
    getSessionSigs: vi.fn(),
    getPkpSessionSigs: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  describe("signMessage", () => {
    it("should sign a message using PKP", async () => {
      const mockSignature = "0x" + "a".repeat(130);
      mockLitClient.pkpSign.mockResolvedValue({
        signature: mockSignature,
      });

      const pkpPublicKey = "04" + "b".repeat(128);
      const message = "Hello, World!";
      const sessionSigs = { nodeUrl: { sig: "test" } } as any;

      const result = await signMessage(pkpPublicKey, message, sessionSigs);

      expect(result.signature).toBe(mockSignature);
      expect(result.message).toBe(message);
      expect(result.publicKey).toBe(pkpPublicKey);
      expect(mockLitClient.pkpSign).toHaveBeenCalledWith(
        expect.objectContaining({
          pubKey: pkpPublicKey,
          sessionSigs,
        })
      );
    });
  });

  describe("signTransaction", () => {
    it("should sign a transaction using PKP", async () => {
      const mockSignature = "0x" + "c".repeat(130);
      mockLitClient.pkpSign.mockResolvedValue({
        signature: mockSignature,
      });

      const pkpPublicKey = "04" + "d".repeat(128);
      const transaction = {
        to: "0x" + "e".repeat(40),
        value: "1000000000000000000", // 1 ETH in Wei
        nonce: 0,
        gasLimit: "21000",
        gasPrice: "20000000000",
        chainId: 1,
      };
      const sessionSigs = { nodeUrl: { sig: "test" } } as any;

      const result = await signTransaction(pkpPublicKey, transaction, sessionSigs);

      expect(result).toHaveProperty("signature");
      expect(result).toHaveProperty("serializedTransaction");
      expect(mockLitClient.pkpSign).toHaveBeenCalled();
    });
  });

  describe("getSessionSigs", () => {
    it("should get session signatures using JWT-based auth", async () => {
      const mockSessionSigs = {
        nodeUrl1: { sig: "sig1", derivedVia: "test", signedMessage: "msg", address: "0x123" },
        nodeUrl2: { sig: "sig2", derivedVia: "test", signedMessage: "msg", address: "0x123" },
      };

      mockLitClient.getPkpSessionSigs.mockResolvedValue(mockSessionSigs);

      const pkpPublicKey = "04" + "f".repeat(128);
      const userJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20ifQ.mock";
      const authMethodId = "0x" + "a".repeat(64);

      const result = await getSessionSigs(pkpPublicKey, userJwt, authMethodId);

      expect(result).toEqual(mockSessionSigs);
      expect(mockLitClient.getPkpSessionSigs).toHaveBeenCalledWith(
        expect.objectContaining({
          pkpPublicKey,
          jsParams: expect.objectContaining({
            jwt: userJwt,
            expectedAuthMethodId: authMethodId,
          }),
        })
      );
    });

    it("should throw error if JWT is missing", async () => {
      const pkpPublicKey = "04" + "f".repeat(128);
      const authMethodId = "0x" + "a".repeat(64);

      await expect(getSessionSigs(pkpPublicKey, "", authMethodId)).rejects.toThrow(
        "User JWT is required"
      );
    });

    it("should throw error if authMethodId is missing", async () => {
      const pkpPublicKey = "04" + "f".repeat(128);
      const userJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20ifQ.mock";

      await expect(getSessionSigs(pkpPublicKey, userJwt, "")).rejects.toThrow(
        "Auth method ID is required"
      );
    });
  });
});
