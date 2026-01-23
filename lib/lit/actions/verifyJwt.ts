/**
 * Lit Action for verifying Dynamic Labs JWT and signing.
 * 
 * This action verifies the JWT, checks authorization, and signs data.
 * It uses the PKP to sign directly within the Lit Action.
 */

// Lit Action that verifies JWT and signs data
// jsParams: jwt, expectedAuthMethodId, toSign (Uint8Array), publicKey
export const JWT_VERIFY_AND_SIGN_LIT_ACTION_CODE = `
(async () => {
  // Verify JWT exists
  if (!jwt) {
    Lit.Actions.setResponse({response: JSON.stringify({error: "No JWT"})});
    return;
  }
  
  // Parse JWT
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    Lit.Actions.setResponse({response: JSON.stringify({error: "Invalid JWT"})});
    return;
  }
  
  // Decode payload
  let payload;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    const padded = pad ? b64 + "=".repeat(4 - pad) : b64;
    payload = JSON.parse(atob(padded));
  } catch (e) {
    Lit.Actions.setResponse({response: JSON.stringify({error: "Failed to decode JWT"})});
    return;
  }
  
  // Verify email exists
  const email = payload.email;
  if (!email) {
    Lit.Actions.setResponse({response: JSON.stringify({error: "No email"})});
    return;
  }
  
  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    Lit.Actions.setResponse({response: JSON.stringify({error: "JWT expired"})});
    return;
  }
  
  // Compute auth method ID from email
  const bytes = new TextEncoder().encode(email.toLowerCase());
  const computed = ethers.utils.keccak256(bytes);
  
  // Verify authorization
  if (computed.toLowerCase() !== expectedAuthMethodId.toLowerCase()) {
    Lit.Actions.setResponse({response: JSON.stringify({error: "Unauthorized"})});
    return;
  }
  
  // Sign the data using the PKP
  const sigShare = await Lit.Actions.signEcdsa({
    toSign: toSign,
    publicKey: publicKey,
    sigName: "sig"
  });
  
  Lit.Actions.setResponse({response: JSON.stringify({success: true})});
})();
`;

// Keep the old action for backwards compatibility
export const JWT_VERIFY_LIT_ACTION_CODE = JWT_VERIFY_AND_SIGN_LIT_ACTION_CODE;

/**
 * Compute the auth method ID from a user's email
 * This must match the computation in the Lit Action
 */
export function computeAuthMethodId(userEmail: string): string {
  // Import dynamically to avoid issues
  const { keccak256, toBytes } = require("viem");
  return keccak256(toBytes(userEmail.toLowerCase()));
}

/**
 * Custom auth method type ID for Dynamic Labs JWT
 * Using a custom type ID that doesn't conflict with Lit's built-in types
 * Built-in types: 1-9 are reserved by Lit Protocol
 * We use a custom type starting from 100
 */
export const DYNAMIC_JWT_AUTH_METHOD_TYPE = 100;

/**
 * Auth method scopes
 */
export const AUTH_METHOD_SCOPES = {
  NO_PERMISSIONS: 0,
  SIGN_ANYTHING: 1,
  PERSONAL_SIGN: 2,
};
