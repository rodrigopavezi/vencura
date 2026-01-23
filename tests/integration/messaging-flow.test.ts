import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestCaller } from "@/tests/utils/trpc";
import { createUser, createWallet, createWalletAccess } from "@/tests/utils/factories";
import { cleanupDatabase } from "@/tests/utils/db";

// Mock the Lit service to avoid calling actual Lit Protocol
vi.mock("@/lib/lit/service", () => ({
  getSessionSigs: vi.fn().mockRejectedValue(new Error("XMTP requires client-side signer")),
  signMessage: vi.fn().mockRejectedValue(new Error("XMTP requires client-side signer")),
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

describe("Messaging Flow Integration Tests", () => {
  beforeEach(async () => {
    await cleanupDatabase();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("Access control for messaging", () => {
    it("should require wallet access to view conversations", async () => {
      const owner = await createUser();
      const stranger = await createUser();
      const wallet = await createWallet(owner.id);

      const strangerCaller = createTestCaller(stranger);

      await expect(
        strangerCaller.messaging.getConversations({ walletId: wallet.id })
      ).rejects.toThrow(/do not have|Only the|not for you/);
    });

    it("should allow VIEW_ONLY to view but not send messages", async () => {
      const owner = await createUser();
      const viewOnlyUser = await createUser();
      const wallet = await createWallet(owner.id);
      await createWalletAccess(wallet.id, viewOnlyUser.id, "VIEW_ONLY");

      const viewOnlyCaller = createTestCaller(viewOnlyUser);

      // Can view (though returns mock error)
      await expect(
        viewOnlyCaller.messaging.getConversations({ walletId: wallet.id })
      ).rejects.toThrow("requires client-side");

      // Cannot send messages
      await expect(
        viewOnlyCaller.messaging.sendMessage({
          walletId: wallet.id,
          conversationId: "conv-1",
          content: "Hello",
        })
      ).rejects.toThrow(/do not have|Only the|not for you/);
    });

    it("should allow CO_SIGNER to view but not send messages", async () => {
      const owner = await createUser();
      const coSignerUser = await createUser();
      const wallet = await createWallet(owner.id);
      await createWalletAccess(wallet.id, coSignerUser.id, "CO_SIGNER");

      const coSignerCaller = createTestCaller(coSignerUser);

      // Can view messages
      await expect(
        coSignerCaller.messaging.getMessages({
          walletId: wallet.id,
          conversationId: "conv-1",
        })
      ).rejects.toThrow("requires client-side");

      // Cannot send messages
      await expect(
        coSignerCaller.messaging.sendMessage({
          walletId: wallet.id,
          conversationId: "conv-1",
          content: "Hello",
        })
      ).rejects.toThrow(/do not have|Only the|not for you/);

      // Cannot start conversations
      await expect(
        coSignerCaller.messaging.startConversation({
          walletId: wallet.id,
          peerAddress: "0x" + "d".repeat(40),
        })
      ).rejects.toThrow(/do not have|Only the|not for you/);
    });

    it("should allow FULL_ACCESS to view and send messages", async () => {
      const owner = await createUser();
      const fullAccessUser = await createUser();
      const wallet = await createWallet(owner.id);
      await createWalletAccess(wallet.id, fullAccessUser.id, "FULL_ACCESS");

      const fullAccessCaller = createTestCaller(fullAccessUser);

      // Can view (returns mock error)
      await expect(
        fullAccessCaller.messaging.getConversations({ walletId: wallet.id })
      ).rejects.toThrow("requires client-side");

      // Can send messages (returns mock error)
      await expect(
        fullAccessCaller.messaging.sendMessage({
          walletId: wallet.id,
          conversationId: "conv-1",
          content: "Hello from full access",
        })
      ).rejects.toThrow("requires client-side");

      // Can start conversations (returns mock error)
      await expect(
        fullAccessCaller.messaging.startConversation({
          walletId: wallet.id,
          peerAddress: "0x" + "f".repeat(40),
          initialMessage: "Hi there!",
        })
      ).rejects.toThrow("requires client-side");
    });

    it("should allow owner full messaging capabilities", async () => {
      const owner = await createUser();
      const wallet = await createWallet(owner.id);

      const ownerCaller = createTestCaller(owner);

      // Owner can do everything (returns mock error)
      await expect(
        ownerCaller.messaging.getConversations({ walletId: wallet.id })
      ).rejects.toThrow("requires client-side");

      await expect(
        ownerCaller.messaging.sendMessage({
          walletId: wallet.id,
          conversationId: "conv-1",
          content: "Owner message",
        })
      ).rejects.toThrow("requires client-side");

      await expect(
        ownerCaller.messaging.canMessage({
          walletId: wallet.id,
          peerAddress: "0x" + "h".repeat(40),
        })
      ).rejects.toThrow("requires client-side");
    });
  });

  describe("Non-existent wallet handling", () => {
    it("should return NOT_FOUND for non-existent wallet", async () => {
      const user = await createUser();
      const caller = createTestCaller(user);

      await expect(
        caller.messaging.getConversations({ walletId: "non-existent-id" })
      ).rejects.toThrow("not found");
    });
  });
});
