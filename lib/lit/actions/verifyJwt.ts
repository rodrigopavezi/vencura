/**
 * Lit Action for verifying Dynamic Labs JWT and signing.
 * 
 * TRUE NON-CUSTODIAL: JWT verification happens INSIDE the Lit Action,
 * running on the decentralized Lit Network nodes. The server cannot
 * sign without a valid user JWT.
 * 
 * This action:
 * 1. Fetches Dynamic Labs' JWKS (public keys)
 * 2. Verifies the JWT signature cryptographically
 * 3. Validates claims (expiration, email)
 * 4. Checks authMethodId matches
 * 5. Signs with the PKP only if all checks pass
 * 
 * NOTE: In Lit SDK v8 (Naga), jsParams are accessed via jsParams.* (not as globals)
 */

// Lit Action that verifies JWT cryptographically and signs data
// jsParams: jwt, expectedAuthMethodId, toSign (array of numbers), publicKey, dynamicEnvironmentId
export const JWT_VERIFY_AND_SIGN_LIT_ACTION_CODE = `
(async () => {
  try {
    // In v8, access jsParams properties via jsParams.*
    const jwt = jsParams.jwt;
    const expectedAuthMethodId = jsParams.expectedAuthMethodId;
    const toSign = jsParams.toSign;
    const publicKey = jsParams.publicKey;
    const dynamicEnvironmentId = jsParams.dynamicEnvironmentId;

    // ========================================
    // 1. VALIDATE INPUTS
    // ========================================
    if (!jwt) {
      Lit.Actions.setResponse({response: JSON.stringify({success: false, error: "No JWT provided"})});
      return;
    }
    
    if (!expectedAuthMethodId) {
      Lit.Actions.setResponse({response: JSON.stringify({success: false, error: "No expectedAuthMethodId provided"})});
      return;
    }
    
    if (!toSign || !Array.isArray(toSign)) {
      Lit.Actions.setResponse({response: JSON.stringify({success: false, error: "Invalid toSign data"})});
      return;
    }
    
    if (!publicKey) {
      Lit.Actions.setResponse({response: JSON.stringify({success: false, error: "No publicKey provided"})});
      return;
    }

    // ========================================
    // 2. PARSE JWT
    // ========================================
    const parts = jwt.split(".");
    if (parts.length !== 3) {
      Lit.Actions.setResponse({response: JSON.stringify({success: false, error: "Invalid JWT format"})});
      return;
    }
    
    const [headerB64, payloadB64, signatureB64] = parts;
    
    // Decode header
    let header;
    try {
      const headerPadded = headerB64.replace(/-/g, "+").replace(/_/g, "/");
      const headerPad = headerPadded.length % 4;
      const headerFinal = headerPad ? headerPadded + "=".repeat(4 - headerPad) : headerPadded;
      header = JSON.parse(atob(headerFinal));
    } catch (e) {
      Lit.Actions.setResponse({response: JSON.stringify({success: false, error: "Failed to decode JWT header"})});
      return;
    }
    
    // Decode payload
    let payload;
    try {
      const payloadPadded = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
      const payloadPad = payloadPadded.length % 4;
      const payloadFinal = payloadPad ? payloadPadded + "=".repeat(4 - payloadPad) : payloadPadded;
      payload = JSON.parse(atob(payloadFinal));
    } catch (e) {
      Lit.Actions.setResponse({response: JSON.stringify({success: false, error: "Failed to decode JWT payload"})});
      return;
    }

    // ========================================
    // 3. FETCH DYNAMIC LABS JWKS
    // ========================================
    const envId = dynamicEnvironmentId || payload.iss?.split("/").pop();
    if (!envId) {
      Lit.Actions.setResponse({response: JSON.stringify({success: false, error: "Could not determine Dynamic environment ID"})});
      return;
    }
    
    // Dynamic Labs JWKS endpoint
    const jwksUrl = "https://app.dynamic.xyz/api/v0/sdk/" + envId + "/.well-known/jwks";
    
    // SECURITY: JWKS fetch is MANDATORY - we cannot verify JWT without it
    let jwks;
    try {
      const jwksResponse = await fetch(jwksUrl);
      if (!jwksResponse.ok) {
        throw new Error("JWKS fetch returned status: " + jwksResponse.status);
      }
      jwks = await jwksResponse.json();
    } catch (e) {
      // SECURITY: Fail if JWKS cannot be fetched - do not fall back to claims-only
      Lit.Actions.setResponse({response: JSON.stringify({
        success: false, 
        error: "Failed to fetch JWKS for JWT verification: " + (e.message || e)
      })});
      return;
    }

    // ========================================
    // 4. VERIFY JWT SIGNATURE (MANDATORY)
    // ========================================
    // SECURITY: Signature verification is MANDATORY - reject if it cannot be performed
    if (!jwks || !jwks.keys || jwks.keys.length === 0) {
      Lit.Actions.setResponse({response: JSON.stringify({
        success: false, 
        error: "No keys found in JWKS response"
      })});
      return;
    }
    
    const kid = header.kid;
    const alg = header.alg || "RS256";
    
    // Find matching key
    let matchingKey = null;
    for (const key of jwks.keys) {
      if (key.kid === kid || (!kid && key.use === "sig")) {
        matchingKey = key;
        break;
      }
    }
    
    if (!matchingKey) {
      // If no matching key found by kid, use the first available key
      matchingKey = jwks.keys[0];
    }
    
    if (!matchingKey) {
      Lit.Actions.setResponse({response: JSON.stringify({
        success: false, 
        error: "No suitable signing key found in JWKS"
      })});
      return;
    }
    
    if (alg !== "RS256") {
      Lit.Actions.setResponse({response: JSON.stringify({
        success: false, 
        error: "Unsupported JWT algorithm: " + alg + ". Only RS256 is supported."
      })});
      return;
    }
    
    // SECURITY: Cryptographic signature verification - MUST succeed
    try {
      // Import the public key
      const keyData = {
        kty: matchingKey.kty,
        n: matchingKey.n,
        e: matchingKey.e,
        alg: "RS256",
        use: "sig"
      };
      
      const cryptoKey = await crypto.subtle.importKey(
        "jwk",
        keyData,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"]
      );
      
      // Prepare data to verify
      const signedData = headerB64 + "." + payloadB64;
      const signedDataBytes = new TextEncoder().encode(signedData);
      
      // Decode signature from base64url
      const sigPadded = signatureB64.replace(/-/g, "+").replace(/_/g, "/");
      const sigPad = sigPadded.length % 4;
      const sigFinal = sigPad ? sigPadded + "=".repeat(4 - sigPad) : sigPadded;
      const sigBytes = Uint8Array.from(atob(sigFinal), c => c.charCodeAt(0));
      
      // Verify signature
      const isValid = await crypto.subtle.verify(
        { name: "RSASSA-PKCS1-v1_5" },
        cryptoKey,
        sigBytes,
        signedDataBytes
      );
      
      if (!isValid) {
        Lit.Actions.setResponse({response: JSON.stringify({success: false, error: "JWT signature verification failed"})});
        return;
      }
    } catch (verifyError) {
      // SECURITY: Fail if cryptographic verification throws - do not continue
      Lit.Actions.setResponse({response: JSON.stringify({
        success: false, 
        error: "JWT signature verification error: " + (verifyError.message || verifyError)
      })});
      return;
    }

    // ========================================
    // 5. VERIFY JWT CLAIMS
    // ========================================
    
    // Verify email exists
    const email = payload.email;
    if (!email) {
      Lit.Actions.setResponse({response: JSON.stringify({success: false, error: "No email in JWT"})});
      return;
    }
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      Lit.Actions.setResponse({response: JSON.stringify({success: false, error: "JWT expired"})});
      return;
    }
    
    // Check not-before (nbf) if present
    if (payload.nbf && payload.nbf > now) {
      Lit.Actions.setResponse({response: JSON.stringify({success: false, error: "JWT not yet valid"})});
      return;
    }
    
    // Check issued-at (iat) - reject tokens issued more than 24 hours ago
    if (payload.iat && (now - payload.iat) > 86400) {
      Lit.Actions.setResponse({response: JSON.stringify({success: false, error: "JWT too old"})});
      return;
    }

    // ========================================
    // 6. VERIFY AUTH METHOD ID
    // ========================================
    
    // Compute auth method ID from email using keccak256
    // In v8, ethers is still available as a global in Lit Actions
    const emailBytes = new TextEncoder().encode(email.toLowerCase());
    const computedAuthMethodId = ethers.utils.keccak256(emailBytes);
    
    if (computedAuthMethodId.toLowerCase() !== expectedAuthMethodId.toLowerCase()) {
      Lit.Actions.setResponse({response: JSON.stringify({
        success: false, 
        error: "Unauthorized: JWT email does not match wallet owner"
      })});
      return;
    }

    // ========================================
    // 7. SIGN WITH PKP
    // ========================================
    
    // Convert toSign array back to Uint8Array
    const toSignBytes = new Uint8Array(toSign);
    
    // Sign the data using the PKP
    // This is the critical operation - it only happens after all verification passes
    const sigShare = await Lit.Actions.signEcdsa({
      toSign: toSignBytes,
      publicKey: publicKey,
      sigName: "sig"
    });
    
    // Return success
    Lit.Actions.setResponse({response: JSON.stringify({
      success: true,
      email: email,
      message: "JWT verified and data signed successfully"
    })});
    
  } catch (error) {
    Lit.Actions.setResponse({response: JSON.stringify({
      success: false, 
      error: "Lit Action error: " + (error.message || String(error))
    })});
  }
})();
`;

// Legacy action for backwards compatibility (less secure - no signature verification)
// Updated for v8 jsParams access pattern
export const JWT_VERIFY_LIT_ACTION_CODE_LEGACY = `
(async () => {
  const jwt = jsParams.jwt;
  const expectedAuthMethodId = jsParams.expectedAuthMethodId;
  const toSign = jsParams.toSign;
  const publicKey = jsParams.publicKey;

  if (!jwt) {
    Lit.Actions.setResponse({response: JSON.stringify({error: "No JWT"})});
    return;
  }
  
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    Lit.Actions.setResponse({response: JSON.stringify({error: "Invalid JWT"})});
    return;
  }
  
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
  
  const email = payload.email;
  if (!email) {
    Lit.Actions.setResponse({response: JSON.stringify({error: "No email"})});
    return;
  }
  
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    Lit.Actions.setResponse({response: JSON.stringify({error: "JWT expired"})});
    return;
  }
  
  const bytes = new TextEncoder().encode(email.toLowerCase());
  const computed = ethers.utils.keccak256(bytes);
  
  if (computed.toLowerCase() !== expectedAuthMethodId.toLowerCase()) {
    Lit.Actions.setResponse({response: JSON.stringify({error: "Unauthorized"})});
    return;
  }
  
  const sigShare = await Lit.Actions.signEcdsa({
    toSign: toSign,
    publicKey: publicKey,
    sigName: "sig"
  });
  
  Lit.Actions.setResponse({response: JSON.stringify({success: true})});
})();
`;

// Alias for backward compatibility
export const JWT_VERIFY_LIT_ACTION_CODE = JWT_VERIFY_AND_SIGN_LIT_ACTION_CODE;

import { keccak256, toBytes } from "viem";

/**
 * Compute the auth method ID from a user's email
 * This must match the computation in the Lit Action
 */
export function computeAuthMethodId(userEmail: string): string {
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
