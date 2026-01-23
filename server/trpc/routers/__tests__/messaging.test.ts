import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestCaller } from "@/tests/utils/trpc";
import { createUser, createWallet, createWalletAccess } from "@/tests/utils/factories";
import { cleanupDatabase } from "@/tests/utils/db";

// Mock the Lit service to avoid calling actual Lit Protocol
vi.mock("@/lib/lit/service", () => ({
  getSessionSigs: vi.fn().mockRejectedValue(new Error("Lit Protocol operations are mocked in tests")),
  signMessage: vi.fn().mockRejectedValue(new Error("Lit Protocol operations are mocked in tests")),
  computeAuthMethodId: vi.fn((email) => "0x" + "a".repeat(64)),
}));

// Mock the XMTP service
vi.mock("@/lib/xmtp/service", () => ({
  getConversations: vi.fn().mockRejectedValue(new Error("XMTP requires client-side signer")),
  getMessages: vi.fn().mockRejectedValue(new Error("XMTP requires client-side signer")),
  sendMessage: vi.fn().mockRejectedValue(new Error("XMTP requires client-side signer")),
  startConversation: vi.fn().mockRejectedValue(new Error("XMTP requires client-side signer")),
  canMessage: vi.fn().mockRejectedValue(new Error("XMTP requires client-side signer")),
}));

describe("Messaging Router", () => {
  beforeEach(async () => {
    await cleanupDatabase();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("getConversations", () => {
    it("should require wallet access", async () => {
      const owner = await createUser();
      const otherUser = await createUser();
      const wallet = await createWallet(owner.id);

      const caller = createTestCaller(otherUser);

      await expect(
        caller.messaging.getConversations({ walletId: wallet.id })
      ).rejects.toThrow("do not have access");
    });

    it("should allow owner to get conversations (returns NOT_IMPLEMENTED for now)", async () => {
      const owner = await createUser();
      const wallet = await createWallet(owner.id);

      const caller = createTestCaller(owner);

      // The messaging router returns NOT_IMPLEMENTED because XMTP requires client-side signer
      await expect(
        caller.messaging.getConversations({ walletId: wallet.id })
      ).rejects.toThrow("requires client-side");
    });

    it("should allow user with access to get conversations", async () => {
      const owner = await createUser();
      const accessUser = await createUser();
      const wallet = await createWallet(owner.id);
      await createWalletAccess(wallet.id, accessUser.id, "VIEW_ONLY");

      const caller = createTestCaller(accessUser);

      await expect(
        caller.messaging.getConversations({ walletId: wallet.id })
      ).rejects.toThrow("requires client-side");
    });
  });

  describe("getMessages", () => {
    it("should require wallet access", async () => {
      const owner = await createUser();
      const otherUser = await createUser();
      const wallet = await createWallet(owner.id);

      const caller = createTestCaller(otherUser);

      await expect(
        caller.messaging.getMessages({
          walletId: wallet.id,
          conversationId: "conv-1",
        })
      ).rejects.toThrow("do not have access");
    });

    it("should return error for valid user (XMTP mocked)", async () => {
      const owner = await createUser();
      const wallet = await createWallet(owner.id);

      const caller = createTestCaller(owner);

      await expect(
        caller.messaging.getMessages({
          walletId: wallet.id,
          conversationId: "conv-1",
        })
      ).rejects.toThrow("requires client-side");
    });
  });

  describe("sendMessage", () => {
    it("should only allow owner or FULL_ACCESS to send messages", async () => {
      const owner = await createUser();
      const viewOnlyUser = await createUser();
      const wallet = await createWallet(owner.id);
      await createWalletAccess(wallet.id, viewOnlyUser.id, "VIEW_ONLY");

      const caller = createTestCaller(viewOnlyUser);

      await expect(
        caller.messaging.sendMessage({
          walletId: wallet.id,
          conversationId: "conv-1",
          content: "Hello!",
        })
      ).rejects.toThrow("do not have permission to send");
    });

    it("should allow owner to send message (XMTP mocked)", async () => {
      const owner = await createUser();
      const wallet = await createWallet(owner.id);

      const caller = createTestCaller(owner);

      await expect(
        caller.messaging.sendMessage({
          walletId: wallet.id,
          conversationId: "conv-1",
          content: "Test message",
        })
      ).rejects.toThrow("requires client-side");
    });

    it("should allow FULL_ACCESS user to send message (XMTP mocked)", async () => {
      const owner = await createUser();
      const fullAccessUser = await createUser();
      const wallet = await createWallet(owner.id);
      await createWalletAccess(wallet.id, fullAccessUser.id, "FULL_ACCESS");

      const caller = createTestCaller(fullAccessUser);

      await expect(
        caller.messaging.sendMessage({
          walletId: wallet.id,
          conversationId: "conv-1",
          content: "Hello from full access user",
        })
      ).rejects.toThrow("requires client-side");
    });
  });

  describe("startConversation", () => {
    it("should only allow owner or FULL_ACCESS to start conversations", async () => {
      const owner = await createUser();
      const coSignerUser = await createUser();
      const wallet = await createWallet(owner.id);
      await createWalletAccess(wallet.id, coSignerUser.id, "CO_SIGNER");

      const caller = createTestCaller(coSignerUser);

      await expect(
        caller.messaging.startConversation({
          walletId: wallet.id,
          peerAddress: "0x" + "e".repeat(40),
        })
      ).rejects.toThrow("do not have permission to start");
    });
  });

  describe("canMessage", () => {
    it("should require wallet access", async () => {
      const owner = await createUser();
      const otherUser = await createUser();
      const wallet = await createWallet(owner.id);

      const caller = createTestCaller(otherUser);

      await expect(
        caller.messaging.canMessage({
          walletId: wallet.id,
          peerAddress: "0x" + "f".repeat(40),
        })
      ).rejects.toThrow("do not have access");
    });
  });
});
