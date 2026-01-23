import { Resend } from "resend";

// Initialize Resend lazily to avoid errors when API key is not set
let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY is not set. Email sending will be disabled.");
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export interface InvitationEmailParams {
  to: string;
  inviterName: string;
  walletName: string;
  role: "VIEW_ONLY" | "CO_SIGNER" | "FULL_ACCESS";
  inviteLink: string;
}

const roleDescriptions = {
  VIEW_ONLY: "view the wallet balance and transaction history",
  CO_SIGNER: "co-sign transactions (requiring your approval)",
  FULL_ACCESS: "full access to sign and send transactions",
};

// Use Resend's testing domain if no custom domain is configured
// For production, set EMAIL_FROM_ADDRESS to your verified domain
const getFromAddress = () => {
  return process.env.EMAIL_FROM_ADDRESS || "Vencura <onboarding@resend.dev>";
};

/**
 * Send a wallet sharing invitation email
 */
export async function sendInvitationEmail(params: InvitationEmailParams): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  const { to, inviterName, walletName, role, inviteLink } = params;

  const roleDescription = roleDescriptions[role];

  const resend = getResendClient();
  if (!resend) {
    console.log("[DEV] Would send invitation email to:", to);
    return {
      success: true,
      messageId: "dev-mock-id",
    };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: getFromAddress(),
      to: [to],
      subject: `${inviterName} has invited you to access their wallet`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Wallet Invitation</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">Wallet Invitation</h1>
            </div>
            
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
              <p style="font-size: 16px; margin-bottom: 20px;">
                Hi there,
              </p>
              
              <p style="font-size: 16px; margin-bottom: 20px;">
                <strong>${inviterName}</strong> has invited you to access their wallet <strong>"${walletName}"</strong> on Vencura.
              </p>
              
              <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 14px;">
                  <strong>Access Level:</strong> ${role.replace("_", " ")}
                </p>
                <p style="margin: 10px 0 0 0; font-size: 14px; color: #666;">
                  You will be able to ${roleDescription}.
                </p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${inviteLink}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 30px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  Accept Invitation
                </a>
              </div>
              
              <p style="font-size: 14px; color: #666; margin-top: 30px;">
                This invitation will expire in 7 days. If you didn't expect this email, you can safely ignore it.
              </p>
              
              <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
              
              <p style="font-size: 12px; color: #999; text-align: center; margin: 0;">
                Vencura - Secure MPC Wallet Management
              </p>
            </div>
          </body>
        </html>
      `,
      text: `
        Wallet Invitation

        Hi there,

        ${inviterName} has invited you to access their wallet "${walletName}" on Vencura.

        Access Level: ${role.replace("_", " ")}
        You will be able to ${roleDescription}.

        Accept the invitation by visiting: ${inviteLink}

        This invitation will expire in 7 days.

        ---
        Vencura - Secure MPC Wallet Management
      `,
    });

    if (error) {
      console.error("Failed to send invitation email:", error);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      messageId: data?.id,
    };
  } catch (error) {
    console.error("Error sending invitation email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send a notification email when someone accepts an invitation
 */
export async function sendInvitationAcceptedEmail(params: {
  to: string;
  acceptedByName: string;
  walletName: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { to, acceptedByName, walletName } = params;

  const resend = getResendClient();
  if (!resend) {
    console.log("[DEV] Would send acceptance notification to:", to);
    return { success: true, messageId: "dev-mock-id" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: getFromAddress(),
      to: [to],
      subject: `${acceptedByName} accepted your wallet invitation`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Invitation Accepted</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>Invitation Accepted</h2>
            <p><strong>${acceptedByName}</strong> has accepted your invitation to access wallet <strong>"${walletName}"</strong>.</p>
            <p>They now have access to the wallet according to the permissions you set.</p>
          </body>
        </html>
      `,
      text: `${acceptedByName} has accepted your invitation to access wallet "${walletName}".`,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
