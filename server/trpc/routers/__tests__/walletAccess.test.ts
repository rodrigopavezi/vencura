import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestCaller } from "@/tests/utils/trpc";
import {
  createUser,
  createWallet,
  createWalletAccess,
  createWalletInvitation,
} from "@/tests/utils/factories";
import { cleanupDatabase, getTestPrisma } from "@/tests/utils/db";

// Mock email service
vi.mock("@/lib/email/service", () => ({
  sendInvitationEmail: vi.fn().mockResolvedValue({ success: true, messageId: "email-123" }),
  sendInvitationAcceptedEmail: vi.fn().mockResolvedValue({ success: true }),
}));

describe("WalletAccess Router", () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("invite", () => {
    it("should create invitation and send email", async () => {
      const owner = await createUser({ email: "owner@example.com" });
      const wallet = await createWallet(owner.id);

      const caller = createTestCaller(owner);
      const result = await caller.walletAccess.invite({
        walletId: wallet.id,
        email: "invitee@example.com",
        role: "VIEW_ONLY",
      });

      expect(result.inviteeEmail).toBe("invitee@example.com");
      expect(result.role).toBe("VIEW_ONLY");
      expect(result.status).toBe("PENDING");
    });

    it("should not allow non-owner to invite", async () => {
      const owner = await createUser();
      const otherUser = await createUser();
      const wallet = await createWallet(owner.id);

      const caller = createTestCaller(otherUser);

      await expect(
        caller.walletAccess.invite({
          walletId: wallet.id,
          email: "test@example.com",
          role: "VIEW_ONLY",
        })
      ).rejects.toThrow("Only the wallet owner");
    });

    it("should not allow duplicate pending invitations", async () => {
      const owner = await createUser();
      const wallet = await createWallet(owner.id);
      await createWalletInvitation(wallet.id, owner.id, "existing@example.com");

      const caller = createTestCaller(owner);

      await expect(
        caller.walletAccess.invite({
          walletId: wallet.id,
          email: "existing@example.com",
          role: "VIEW_ONLY",
        })
      ).rejects.toThrow("already been sent");
    });

    it("should not allow inviting user who already has access", async () => {
      const owner = await createUser();
      const existingUser = await createUser({ email: "existing@example.com" });
      const wallet = await createWallet(owner.id);
      await createWalletAccess(wallet.id, existingUser.id, "VIEW_ONLY");

      const caller = createTestCaller(owner);

      await expect(
        caller.walletAccess.invite({
          walletId: wallet.id,
          email: "existing@example.com",
          role: "FULL_ACCESS",
        })
      ).rejects.toThrow("already has access");
    });
  });

  describe("acceptInvitation", () => {
    it("should accept invitation and create wallet access", async () => {
      const owner = await createUser();
      const invitee = await createUser({ email: "invitee@example.com" });
      const wallet = await createWallet(owner.id);
      const invitation = await createWalletInvitation(
        wallet.id,
        owner.id,
        "invitee@example.com",
        "CO_SIGNER"
      );

      const caller = createTestCaller(invitee);
      const result = await caller.walletAccess.acceptInvitation({
        invitationId: invitation.id,
      });

      expect(result.role).toBe("CO_SIGNER");
      expect(result.userId).toBe(invitee.id);

      // Verify invitation is marked as accepted
      const prisma = getTestPrisma();
      const updatedInvitation = await prisma.walletInvitation.findUnique({
        where: { id: invitation.id },
      });
      expect(updatedInvitation?.status).toBe("ACCEPTED");
    });

    it("should not allow accepting invitation for different email", async () => {
      const owner = await createUser();
      const wrongUser = await createUser({ email: "wrong@example.com" });
      const wallet = await createWallet(owner.id);
      const invitation = await createWalletInvitation(
        wallet.id,
        owner.id,
        "correct@example.com"
      );

      const caller = createTestCaller(wrongUser);

      await expect(
        caller.walletAccess.acceptInvitation({ invitationId: invitation.id })
      ).rejects.toThrow("not for you");
    });

    it("should not allow accepting already accepted invitation", async () => {
      const owner = await createUser();
      const invitee = await createUser({ email: "invitee@example.com" });
      const wallet = await createWallet(owner.id);
      const invitation = await createWalletInvitation(
        wallet.id,
        owner.id,
        "invitee@example.com",
        "VIEW_ONLY",
        "ACCEPTED"
      );

      const caller = createTestCaller(invitee);

      await expect(
        caller.walletAccess.acceptInvitation({ invitationId: invitation.id })
      ).rejects.toThrow("already been");
    });
  });

  describe("rejectInvitation", () => {
    it("should reject invitation", async () => {
      const owner = await createUser();
      const invitee = await createUser({ email: "invitee@example.com" });
      const wallet = await createWallet(owner.id);
      const invitation = await createWalletInvitation(
        wallet.id,
        owner.id,
        "invitee@example.com"
      );

      const caller = createTestCaller(invitee);
      const result = await caller.walletAccess.rejectInvitation({
        invitationId: invitation.id,
      });

      expect(result.status).toBe("REJECTED");
    });
  });

  describe("revokeAccess", () => {
    it("should allow owner to revoke access", async () => {
      const owner = await createUser();
      const accessUser = await createUser();
      const wallet = await createWallet(owner.id);
      await createWalletAccess(wallet.id, accessUser.id, "VIEW_ONLY");

      const caller = createTestCaller(owner);
      await caller.walletAccess.revokeAccess({
        walletId: wallet.id,
        userId: accessUser.id,
      });

      const prisma = getTestPrisma();
      const access = await prisma.walletAccess.findFirst({
        where: { walletId: wallet.id, userId: accessUser.id },
      });
      expect(access).toBeNull();
    });

    it("should not allow non-owner to revoke access", async () => {
      const owner = await createUser();
      const user1 = await createUser();
      const user2 = await createUser();
      const wallet = await createWallet(owner.id);
      await createWalletAccess(wallet.id, user1.id, "FULL_ACCESS");
      await createWalletAccess(wallet.id, user2.id, "VIEW_ONLY");

      const caller = createTestCaller(user1);

      await expect(
        caller.walletAccess.revokeAccess({
          walletId: wallet.id,
          userId: user2.id,
        })
      ).rejects.toThrow("Only the wallet owner");
    });
  });

  describe("updateRole", () => {
    it("should allow owner to update role", async () => {
      const owner = await createUser();
      const accessUser = await createUser();
      const wallet = await createWallet(owner.id);
      await createWalletAccess(wallet.id, accessUser.id, "VIEW_ONLY");

      const caller = createTestCaller(owner);
      const result = await caller.walletAccess.updateRole({
        walletId: wallet.id,
        userId: accessUser.id,
        role: "FULL_ACCESS",
      });

      expect(result.role).toBe("FULL_ACCESS");
    });
  });

  describe("listAccess", () => {
    it("should return owner and access list", async () => {
      const owner = await createUser({ name: "Owner" });
      const user1 = await createUser({ name: "User 1" });
      const user2 = await createUser({ name: "User 2" });
      const wallet = await createWallet(owner.id);
      await createWalletAccess(wallet.id, user1.id, "VIEW_ONLY");
      await createWalletAccess(wallet.id, user2.id, "FULL_ACCESS");

      const caller = createTestCaller(owner);
      const result = await caller.walletAccess.listAccess({
        walletId: wallet.id,
      });

      expect(result.owner.name).toBe("Owner");
      expect(result.owner.role).toBe("OWNER");
      expect(result.accessList).toHaveLength(2);
    });
  });

  describe("listInvitations", () => {
    it("should return received invitations", async () => {
      const owner = await createUser();
      const invitee = await createUser({ email: "invitee@example.com" });
      const wallet = await createWallet(owner.id);
      await createWalletInvitation(wallet.id, owner.id, "invitee@example.com");

      const caller = createTestCaller(invitee);
      const result = await caller.walletAccess.listInvitations({
        type: "received",
      });

      expect(result).toHaveLength(1);
      expect(result[0].inviteeEmail).toBe("invitee@example.com");
    });

    it("should return sent invitations", async () => {
      const owner = await createUser();
      const wallet = await createWallet(owner.id);
      await createWalletInvitation(wallet.id, owner.id, "test1@example.com");
      await createWalletInvitation(wallet.id, owner.id, "test2@example.com");

      const caller = createTestCaller(owner);
      const result = await caller.walletAccess.listInvitations({
        type: "sent",
      });

      expect(result).toHaveLength(2);
    });
  });
});
