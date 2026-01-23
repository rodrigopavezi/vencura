import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();

// Mock Resend before importing the service
vi.mock("resend", () => {
  return {
    Resend: class MockResend {
      emails = {
        send: mockSend,
      };
    },
  };
});

// Import after mock is set up
const { sendInvitationEmail, sendInvitationAcceptedEmail } = await import("../service");

describe("Email Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sendInvitationEmail", () => {
    it("should send invitation email successfully", async () => {
      mockSend.mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      const result = await sendInvitationEmail({
        to: "invitee@example.com",
        inviterName: "John Doe",
        walletName: "My Main Wallet",
        role: "VIEW_ONLY",
        inviteLink: "https://vencura.app/invite/abc123",
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("email-123");
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["invitee@example.com"],
          subject: expect.stringContaining("John Doe"),
        })
      );
    });

    it("should include correct role description for CO_SIGNER", async () => {
      mockSend.mockResolvedValue({
        data: { id: "email-456" },
        error: null,
      });

      await sendInvitationEmail({
        to: "cosigner@example.com",
        inviterName: "Jane Smith",
        walletName: "Shared Wallet",
        role: "CO_SIGNER",
        inviteLink: "https://vencura.app/invite/def456",
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining("co-sign transactions"),
        })
      );
    });

    it("should include correct role description for FULL_ACCESS", async () => {
      mockSend.mockResolvedValue({
        data: { id: "email-789" },
        error: null,
      });

      await sendInvitationEmail({
        to: "fullaccess@example.com",
        inviterName: "Bob Wilson",
        walletName: "Business Wallet",
        role: "FULL_ACCESS",
        inviteLink: "https://vencura.app/invite/ghi789",
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining("full access to sign and send transactions"),
        })
      );
    });

    it("should handle Resend API errors", async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { message: "Invalid API key" },
      });

      const result = await sendInvitationEmail({
        to: "test@example.com",
        inviterName: "Test User",
        walletName: "Test Wallet",
        role: "VIEW_ONLY",
        inviteLink: "https://vencura.app/invite/test",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid API key");
    });

    it("should handle network errors", async () => {
      mockSend.mockRejectedValue(new Error("Network error"));

      const result = await sendInvitationEmail({
        to: "test@example.com",
        inviterName: "Test User",
        walletName: "Test Wallet",
        role: "VIEW_ONLY",
        inviteLink: "https://vencura.app/invite/test",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });
  });

  describe("sendInvitationAcceptedEmail", () => {
    it("should send acceptance notification email", async () => {
      mockSend.mockResolvedValue({
        data: { id: "email-accepted" },
        error: null,
      });

      const result = await sendInvitationAcceptedEmail({
        to: "owner@example.com",
        acceptedByName: "New User",
        walletName: "Shared Wallet",
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("email-accepted");
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["owner@example.com"],
          subject: expect.stringContaining("New User accepted"),
        })
      );
    });

    it("should handle errors gracefully", async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { message: "Rate limit exceeded" },
      });

      const result = await sendInvitationAcceptedEmail({
        to: "owner@example.com",
        acceptedByName: "New User",
        walletName: "Wallet",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Rate limit exceeded");
    });
  });
});
