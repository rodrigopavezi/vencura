import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestCaller } from "@/tests/utils/trpc";
import { createUser } from "@/tests/utils/factories";
import { cleanupDatabase, getTestPrisma } from "@/tests/utils/db";

// Mock services
vi.mock("@/lib/lit/service", () => ({
  mintPKP: vi.fn().mockImplementation(() => ({
    tokenId: "0x" + Math.random().toString(16).slice(2).padEnd(64, "0"),
    publicKey: "04" + Math.random().toString(16).slice(2).padEnd(128, "a"),
    ethAddress: "0x" + Math.random().toString(16).slice(2).padEnd(40, "0"),
    authMethodId: "0x" + "a".repeat(64),
  })),
  computeAuthMethodId: vi.fn((email) => "0x" + "a".repeat(64)),
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
  getBalance: vi.fn().mockResolvedValue({ wei: "1000000000000000000", ether: "1" }),
  getTokenBalances: vi.fn().mockResolvedValue([]),
  getTransactionHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/email/service", () => ({
  sendInvitationEmail: vi.fn().mockResolvedValue({ success: true, messageId: "email-123" }),
  sendInvitationAcceptedEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import * as emailService from "@/lib/email/service";

describe("Sharing Flow Integration Tests", () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe("Complete sharing workflow", () => {
    it("should invite, accept, and grant access to a wallet", async () => {
      // Setup users
      const owner = await createUser({ email: "owner@example.com", name: "Alice" });
      const invitee = await createUser({ email: "invitee@example.com", name: "Bob" });

      const ownerCaller = createTestCaller(owner);
      const inviteeCaller = createTestCaller(invitee);

      // Owner creates a wallet
      const wallet = await ownerCaller.wallet.create({
        name: "Shared Family Wallet",
        
      });

      // Owner invites the invitee
      const invitation = await ownerCaller.walletAccess.invite({
        walletId: wallet.id,
        email: "invitee@example.com",
        role: "VIEW_ONLY",
      });

      expect(invitation.status).toBe("PENDING");
      expect(emailService.sendInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "invitee@example.com",
          inviterName: "Alice",
          walletName: "Shared Family Wallet",
          role: "VIEW_ONLY",
        })
      );

      // Invitee can see pending invitation
      const pendingInvitations = await inviteeCaller.walletAccess.listInvitations({
        type: "received",
      });
      expect(pendingInvitations).toHaveLength(1);
      expect(pendingInvitations[0].id).toBe(invitation.id);

      // Invitee accepts the invitation
      const access = await inviteeCaller.walletAccess.acceptInvitation({
        invitationId: invitation.id,
      });

      expect(access.role).toBe("VIEW_ONLY");
      expect(access.userId).toBe(invitee.id);

      // Invitee can now view the wallet
      const walletView = await inviteeCaller.wallet.getById({ id: wallet.id });
      expect(walletView.name).toBe("Shared Family Wallet");
      expect(walletView.role).toBe("VIEW_ONLY");

      // Invitee can view balance
      const balance = await inviteeCaller.wallet.getBalance({ id: wallet.id });
      expect(balance.eth.ether).toBe("1");

      // Invitee cannot sign messages (VIEW_ONLY)
      await expect(
        inviteeCaller.wallet.signMessage({
          walletId: wallet.id,
          message: "Test",
          
        })
      ).rejects.toThrow(/do not have|Only the|not for you/);
    });

    it("should allow FULL_ACCESS user to perform all operations", async () => {
      const owner = await createUser({ email: "owner@example.com", name: "Owner" });
      const fullAccessUser = await createUser({ email: "fullaccess@example.com", name: "Full Access" });

      const ownerCaller = createTestCaller(owner);
      const fullAccessCaller = createTestCaller(fullAccessUser);

      // Create wallet
      const wallet = await ownerCaller.wallet.create({
        name: "Business Wallet",
        
      });

      // Invite with FULL_ACCESS
      const invitation = await ownerCaller.walletAccess.invite({
        walletId: wallet.id,
        email: "fullaccess@example.com",
        role: "FULL_ACCESS",
      });

      // Accept invitation
      await fullAccessCaller.walletAccess.acceptInvitation({
        invitationId: invitation.id,
      });

      // Full access user can sign messages
      const signed = await fullAccessCaller.wallet.signMessage({
        walletId: wallet.id,
        message: "Business transaction",
        
      });
      expect(signed.signature).toBeDefined();

      // But cannot update wallet name (only owner)
      await expect(
        fullAccessCaller.wallet.update({ id: wallet.id, name: "New Name" })
      ).rejects.toThrow(/do not have|Only the|not for you/);

      // And cannot delete (only owner)
      await expect(
        fullAccessCaller.wallet.delete({ id: wallet.id })
      ).rejects.toThrow(/do not have|Only the|not for you/);
    });

    it("should allow owner to upgrade and downgrade access", async () => {
      const owner = await createUser({ email: "owner@example.com" });
      const user = await createUser({ email: "user@example.com" });

      const ownerCaller = createTestCaller(owner);
      const userCaller = createTestCaller(user);

      const wallet = await ownerCaller.wallet.create({
        name: "Test Wallet",
        
      });

      // Invite with VIEW_ONLY
      const invitation = await ownerCaller.walletAccess.invite({
        walletId: wallet.id,
        email: "user@example.com",
        role: "VIEW_ONLY",
      });

      await userCaller.walletAccess.acceptInvitation({ invitationId: invitation.id });

      // User cannot sign
      await expect(
        userCaller.wallet.signMessage({
          walletId: wallet.id,
          message: "Test",
          
        })
      ).rejects.toThrow(/do not have|Only the|not for you/);

      // Owner upgrades to FULL_ACCESS
      await ownerCaller.walletAccess.updateRole({
        walletId: wallet.id,
        userId: user.id,
        role: "FULL_ACCESS",
      });

      // Now user can sign
      const signed = await userCaller.wallet.signMessage({
        walletId: wallet.id,
        message: "Test",
        
      });
      expect(signed.signature).toBeDefined();

      // Owner downgrades back to VIEW_ONLY
      await ownerCaller.walletAccess.updateRole({
        walletId: wallet.id,
        userId: user.id,
        role: "VIEW_ONLY",
      });

      // User can no longer sign
      await expect(
        userCaller.wallet.signMessage({
          walletId: wallet.id,
          message: "Test",
          
        })
      ).rejects.toThrow(/do not have|Only the|not for you/);
    });

    it("should allow owner to revoke access", async () => {
      const owner = await createUser({ email: "owner@example.com" });
      const user = await createUser({ email: "user@example.com" });

      const ownerCaller = createTestCaller(owner);
      const userCaller = createTestCaller(user);

      const wallet = await ownerCaller.wallet.create({
        name: "Revokable Wallet",
        
      });

      const invitation = await ownerCaller.walletAccess.invite({
        walletId: wallet.id,
        email: "user@example.com",
        role: "VIEW_ONLY",
      });

      await userCaller.walletAccess.acceptInvitation({ invitationId: invitation.id });

      // User has access
      const walletView = await userCaller.wallet.getById({ id: wallet.id });
      expect(walletView).toBeDefined();

      // Owner revokes access
      await ownerCaller.walletAccess.revokeAccess({
        walletId: wallet.id,
        userId: user.id,
      });

      // User no longer has access
      await expect(
        userCaller.wallet.getById({ id: wallet.id })
      ).rejects.toThrow(/do not have|Only the|not for you/);
    });

    it("should handle invitation rejection", async () => {
      const owner = await createUser({ email: "owner@example.com" });
      const invitee = await createUser({ email: "invitee@example.com" });

      const ownerCaller = createTestCaller(owner);
      const inviteeCaller = createTestCaller(invitee);

      const wallet = await ownerCaller.wallet.create({
        name: "Rejected Wallet",
        
      });

      const invitation = await ownerCaller.walletAccess.invite({
        walletId: wallet.id,
        email: "invitee@example.com",
        role: "VIEW_ONLY",
      });

      // Invitee rejects
      const rejected = await inviteeCaller.walletAccess.rejectInvitation({
        invitationId: invitation.id,
      });

      expect(rejected.status).toBe("REJECTED");

      // Invitee still cannot access wallet
      await expect(
        inviteeCaller.wallet.getById({ id: wallet.id })
      ).rejects.toThrow(/do not have|Only the|not for you/);
    });
  });
});
