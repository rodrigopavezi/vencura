import { getLitClient } from "./client";
import {
  hashMessage,
  keccak256,
  serializeTransaction,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { publicKeyToAddress, privateKeyToAccount } from "viem/accounts";
import {
  AUTH_METHOD_SCOPES,
  JWT_VERIFY_AND_SIGN_LIT_ACTION_CODE,
} from "./actions/verifyJwt";

/**
 * Configuration for signing mode
 * Set to true to use Lit Actions (true non-custodial)
 * Set to false to use server-side verification (hybrid mode)
 */
const USE_LIT_ACTION_SIGNING = true;

export interface PKPInfo {
  tokenId: string;
  publicKey: string;
  ethAddress: string;
  authMethodId: string; // Hash of user's identity for Lit auth
}

/**
 * Compute auth method ID from user email
 * This creates a deterministic ID that links the user's identity to their PKP
 */
export function computeAuthMethodId(userEmail: string): string {
  return keccak256(toBytes(userEmail.toLowerCase()));
}

export interface SignedMessage {
  signature: string;
  publicKey: string;
  message: string;
}

export interface SignedTransaction {
  signature: string;
  serializedTransaction: string;
}

/**
 * Mint a new PKP (Programmable Key Pair) for wallet creation
 * 
 * In v8, PKP minting is done through litClient.mintWithEoa
 * 
 * @param userEmail - The user's email from Dynamic Labs JWT
 */
export async function mintPKP(userEmail: string): Promise<PKPInfo> {
  if (!userEmail) {
    throw new Error("User email is required for PKP minting");
  }

  const privateKey = process.env.ETHEREUM_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("ETHEREUM_PRIVATE_KEY environment variable is required for gas payment");
  }

  // Compute the auth method ID from user's email (for JWT verification)
  const authMethodId = computeAuthMethodId(userEmail);
  console.log(`🔐 Auth method ID for ${userEmail}: ${authMethodId}`);

  // Ensure private key has 0x prefix
  const formattedKey = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
  
  // Get server wallet address using viem
  const serverAccount = privateKeyToAccount(formattedKey);
  const serverWalletAddress = serverAccount.address;
  console.log(`🔐 Server wallet address: ${serverWalletAddress}`);

  console.log("🔄 Getting Lit client...");
  const litClient = await getLitClient();
  
  console.log("🔄 Minting new PKP...");
  
  try {
    // In v8, use litClient.mintWithEoa for PKP minting
    const mintResult = await litClient.mintWithEoa({
      account: serverAccount,
    });
    
    // Log mint result with BigInt handling
    console.log("🔐 Mint result keys:", Object.keys(mintResult));
    console.log("🔐 Mint result data:", mintResult.data);
    console.log("🔐 Mint result data keys:", mintResult.data ? Object.keys(mintResult.data) : "no data");
    
    // In v8, the PKP info is in mintResult.data
    const data = mintResult.data as { tokenId?: bigint | string; publicKey?: string; pubkey?: string; ethAddress?: string } | undefined;
    
    // v8 might use different property names - check for pubkey or publicKey
    const tokenId = data?.tokenId || mintResult.tokenId;
    const rawPubkey = data?.publicKey || data?.pubkey || mintResult.publicKey;
    const ethAddress = data?.ethAddress || mintResult.ethAddress;
    
    if (!tokenId) {
      throw new Error("No tokenId returned from mintWithEoa");
    }
    
    if (!rawPubkey) {
      throw new Error("No publicKey returned from mintWithEoa");
    }
    
    console.log(`✅ Minted PKP with tokenId: ${tokenId}`);
    
    const pubkey = rawPubkey.startsWith("0x") ? rawPubkey : `0x${rawPubkey}`;
    
    // Derive ETH address from public key if not provided
    const pkpEthAddress = ethAddress || publicKeyToAddress(pubkey as `0x${string}`);
    
    console.log(`✅ Public key: ${pubkey}`);
    console.log(`✅ ETH address: ${pkpEthAddress}`);
    
    // Add the server wallet as a permitted address with SignAnything scope
    console.log("🔄 Adding server wallet as permitted address...");
    console.log(`🔐 Using pubkey for permissions: ${pubkey}`);
    
    // v8 API: getPKPPermissionsManager needs pkpIdentifier as a nested object
    const pkpPermissionsManager = await litClient.getPKPPermissionsManager({
      pkpIdentifier: {
        pubkey: pubkey,
      },
      account: serverAccount,
    });
    
    // Add the server wallet address with SignAnything scope
    await pkpPermissionsManager.addPermittedAddress({
      address: serverWalletAddress,
      scopes: ["sign-anything"],
    });
    console.log(`✅ Server wallet added as permitted address`);
    
    console.log(`✅ JWT verification ID: ${authMethodId}`);

    return {
      tokenId: tokenId.toString(),
      publicKey: pubkey,
      ethAddress: pkpEthAddress,
      authMethodId, // Store this for JWT verification
    };
  } catch (error: unknown) {
    const err = error as { message?: string; reason?: string; code?: string };
    console.error("❌ Failed to mint PKP:", err.message || error);
    if (err.reason) console.error("Reason:", err.reason);
    if (err.code) console.error("Code:", err.code);
    throw error;
  }
}

/**
 * Verify JWT and extract user email
 * Returns the email if valid, throws if invalid
 */
function verifyJwtAndGetEmail(jwt: string, expectedAuthMethodId: string): string {
  if (!jwt) {
    throw new Error("No JWT provided");
  }
  
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }
  
  // Decode payload
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  const padded = pad ? b64 + "=".repeat(4 - pad) : b64;
  const payload = JSON.parse(Buffer.from(padded, "base64").toString());
  
  const email = payload.email;
  if (!email) {
    throw new Error("No email found in JWT");
  }
  
  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error("JWT expired");
  }
  
  // Verify the auth method ID matches
  const computedAuthMethodId = keccak256(toBytes(email.toLowerCase()));
  if (computedAuthMethodId.toLowerCase() !== expectedAuthMethodId.toLowerCase()) {
    throw new Error("Unauthorized: JWT email does not match wallet owner");
  }
  
  return email;
}

/**
 * Create an EOA auth context for signing operations
 * In v8, this replaces session sigs generation
 */
async function createEoaAuthContext() {
  console.log("  📋 Creating EOA auth context...");
  const { createAuthManager, storagePlugins } = await import("@lit-protocol/auth");
  
  const litClient = await getLitClient();
  
  const privateKey = process.env.ETHEREUM_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("ETHEREUM_PRIVATE_KEY required for auth context");
  }
  
  const formattedKey = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
  const serverAccount = privateKeyToAccount(formattedKey);
  console.log("  📋 Using server wallet:", serverAccount.address);
  
  // Use localStorageNode for server-side operations
  const authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "vencura",
      networkName: "naga-dev",
      storagePath: "/tmp/lit-auth-storage",
    }),
  });
  
  const expirationTime = new Date(Date.now() + 1000 * 60 * 15).toISOString(); // 15 minutes
  console.log("  📋 Auth context expiration:", expirationTime);
  
  console.log("  📋 Creating EOA auth context...");
  const authContext = await authManager.createEoaAuthContext({
    config: { account: serverAccount },
    authConfig: {
      domain: "vencura.app",
      statement: "Authorize Lit session for wallet operations",
      resources: [
        ["lit-action-execution", "*"],
        ["pkp-signing", "*"],
        ["access-control-condition-signing", "*"],
        ["access-control-condition-decryption", "*"],
      ],
      expiration: expirationTime,
    },
    litClient,
  });
  
  console.log("  📋 EOA auth context created successfully");
  return authContext;
}

/**
 * Sign data with PKP after server-side JWT verification (HYBRID MODE)
 * 
 * Security model:
 * 1. Server verifies JWT matches the wallet's authMethodId
 * 2. Only if verified, server uses its auth context to sign with PKP
 * 3. Without valid JWT, no signing occurs
 */
async function signWithPkpServerSideVerification(
  pkpPublicKey: string,
  toSign: Uint8Array,
  userJwt: string,
  authMethodId: string
): Promise<string> {
  // First, verify JWT on server side
  console.log("🔐 [HYBRID MODE] Verifying JWT server-side...");
  const email = verifyJwtAndGetEmail(userJwt, authMethodId);
  console.log(`✅ JWT verified for: ${email}`);
  
  console.log("🔐 [HYBRID MODE] Getting Lit client...");
  let litClient;
  try {
    litClient = await getLitClient();
    console.log("✅ [HYBRID MODE] Lit client connected");
  } catch (clientError: unknown) {
    const err = clientError as { message?: string };
    console.error("❌ [HYBRID MODE] Failed to get Lit client:", err.message || clientError);
    throw clientError;
  }
  
  // Get auth context using server wallet
  console.log("🔐 [HYBRID MODE] Creating auth context for signing...");
  let authContext;
  try {
    authContext = await createEoaAuthContext();
    console.log("✅ [HYBRID MODE] Auth context obtained");
  } catch (authError: unknown) {
    const err = authError as { message?: string; errorCode?: string };
    console.error("❌ [HYBRID MODE] Failed to create auth context:", err.message || authError);
    throw authError;
  }
  
  console.log("🔐 [HYBRID MODE] Signing with PKP...");
  console.log("🔐 [HYBRID MODE] PKP Public Key:", pkpPublicKey);
  
  let signingResult;
  try {
    // In v8, use litClient.chain.ethereum.pkpSign with authContext
    signingResult = await litClient.chain.ethereum.pkpSign({
      pubKey: pkpPublicKey,
      toSign,
      authContext,
    });
    console.log("✅ [HYBRID MODE] PKP sign returned");
  } catch (signError: unknown) {
    const err = signError as { message?: string; errorCode?: string; details?: unknown };
    console.error("❌ [HYBRID MODE] PKP signing failed:", err.message || signError);
    throw signError;
  }
  
  // Format signature
  const sig = signingResult.signature as string;
  const fullSignature = sig.startsWith("0x") ? sig : `0x${sig}`;
  
  console.log("✅ [HYBRID MODE] PKP signing successful");
  return fullSignature;
}

/**
 * Sign data with PKP using Lit Action (TRUE NON-CUSTODIAL MODE)
 * 
 * Security model:
 * 1. JWT is passed to Lit Action running on decentralized Lit Network
 * 2. Lit Action fetches Dynamic Labs JWKS and verifies JWT signature
 * 3. Lit Action validates claims and authMethodId
 * 4. Only if all checks pass, Lit nodes perform threshold signing
 * 5. Server CANNOT sign without valid user JWT
 */
async function signWithLitAction(
  pkpPublicKey: string,
  toSign: Uint8Array,
  userJwt: string,
  authMethodId: string
): Promise<string> {
  console.log("🔐 [NON-CUSTODIAL MODE] Executing Lit Action for JWT verification and signing...");
  
  console.log("🔐 Getting Lit client...");
  let litClient;
  try {
    litClient = await getLitClient();
    console.log("✅ Lit client connected");
  } catch (clientError: unknown) {
    const err = clientError as { message?: string };
    console.error("❌ Failed to get Lit client:", err.message || clientError);
    throw clientError;
  }
  
  // Get auth context for executeJs
  console.log("🔐 Creating auth context for Lit Action execution...");
  let authContext;
  try {
    authContext = await createEoaAuthContext();
    console.log("✅ Auth context obtained");
  } catch (authError: unknown) {
    const err = authError as { message?: string; errorCode?: string };
    console.error("❌ Failed to create auth context:", err.message || authError);
    throw authError;
  }
  
  // Get Dynamic environment ID from env or extract from JWT
  const dynamicEnvironmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || "";
  
  console.log("🔐 Executing Lit Action on decentralized network...");
  console.log("🔐 PKP Public Key:", pkpPublicKey);
  console.log("🔐 Auth Method ID:", authMethodId);
  console.log("🔐 Dynamic Environment ID:", dynamicEnvironmentId);
  
  let result;
  try {
    // Execute the Lit Action on the decentralized Lit Network
    // In v8, use authContext instead of sessionSigs
    result = await litClient.executeJs({
      code: JWT_VERIFY_AND_SIGN_LIT_ACTION_CODE,
      authContext,
      jsParams: {
        jwt: userJwt,
        expectedAuthMethodId: authMethodId,
        toSign: Array.from(toSign), // Convert Uint8Array to array for JSON serialization
        publicKey: pkpPublicKey,
        dynamicEnvironmentId,
      },
    });
  } catch (executeError: unknown) {
    const err = executeError as { message?: string; errorCode?: string; details?: unknown };
    console.error("❌ Lit Action execution failed:", err.message || executeError);
    throw executeError;
  }
  
  console.log("🔐 Lit Action result received");
  console.log("🔐 Result response:", result.response);
  console.log("🔐 Result logs:", result.logs);
  console.log("🔐 Result signatures:", result.signatures);
  
  // Parse the response from Lit Action - in v8, response might already be an object
  if (result.response) {
    let response: { success: boolean; error?: string; email?: string };
    
    if (typeof result.response === "string") {
      try {
        response = JSON.parse(result.response);
      } catch (parseError) {
        console.error("❌ Failed to parse Lit Action response string:", result.response);
        throw parseError;
      }
    } else {
      // Already an object in v8
      response = result.response as { success: boolean; error?: string; email?: string };
    }
    
    if (!response.success) {
      console.error("❌ Lit Action returned failure:", response.error);
      throw new Error(`Lit Action verification failed: ${response.error}`);
    }
    console.log(`✅ JWT verified by Lit Network for: ${response.email}`);
  } else {
    console.warn("⚠️ No response from Lit Action");
  }
  
  // Extract signature from result - v8 may return signatures differently
  const signatures = result.signatures as Record<string, {
    r?: string;
    s?: string;
    recid?: number;
    recoveryId?: number;
    signature?: string;
    publicKey?: string;
    dataSigned?: string;
  }> | undefined;
  
  console.log("🔐 Signatures received:", signatures ? Object.keys(signatures) : "none");
  
  if (!signatures || !signatures.sig) {
    console.error("❌ No signature in result. Result keys:", Object.keys(result));
    console.error("❌ Signatures object:", signatures);
    throw new Error("No signature returned from Lit Action. JWT verification may have failed.");
  }
  
  const sig = signatures.sig;
  console.log("🔐 Signature object keys:", Object.keys(sig));
  
  let r: string;
  let s: string;
  let recid: number;
  
  // Handle v8 signature format - signature is r+s concatenated (64 bytes = 128 hex chars)
  if (sig.signature) {
    // v8 format: { signature: "0x{r}{s}", recoveryId: 0|1 }
    const sigHex = sig.signature.startsWith("0x") ? sig.signature.slice(2) : sig.signature;
    r = sigHex.slice(0, 64);  // First 32 bytes (64 hex chars)
    s = sigHex.slice(64, 128); // Second 32 bytes (64 hex chars)
    recid = sig.recoveryId ?? 0;
    console.log("🔐 Using v8 signature format (concatenated r+s)");
  } else if (sig.r && sig.s) {
    // v7 format: { r: "0x...", s: "0x...", recid: 0|1 }
    r = sig.r.startsWith("0x") ? sig.r.slice(2) : sig.r;
    s = sig.s.startsWith("0x") ? sig.s.slice(2) : sig.s;
    recid = sig.recid ?? 0;
    console.log("🔐 Using v7 signature format (separate r, s)");
  } else {
    console.error("❌ Unknown signature format:", sig);
    throw new Error("Unknown signature format returned from Lit Action");
  }
  
  const v = (recid + 27).toString(16).padStart(2, "0");
  const fullSignature = `0x${r}${s}${v}`;
  console.log("🔐 Full signature:", fullSignature);
  
  console.log("✅ PKP signing successful (non-custodial mode via Lit Action)");
  return fullSignature;
}

/**
 * Sign data with PKP - uses the configured signing mode
 */
async function signWithPkp(
  pkpPublicKey: string,
  toSign: Uint8Array,
  userJwt: string,
  authMethodId: string
): Promise<string> {
  if (USE_LIT_ACTION_SIGNING) {
    return signWithLitAction(pkpPublicKey, toSign, userJwt, authMethodId);
  } else {
    return signWithPkpServerSideVerification(pkpPublicKey, toSign, userJwt, authMethodId);
  }
}

/**
 * Sign a message using a PKP
 */
export async function signMessage(
  pkpPublicKey: string,
  message: string,
  userJwt: string,
  authMethodId: string
): Promise<SignedMessage> {
  const messageHash = hashMessage(message);
  const messageBytes = toBytes(messageHash);

  const signature = await signWithPkp(
    pkpPublicKey,
    messageBytes,
    userJwt,
    authMethodId
  );

  return {
    signature,
    publicKey: pkpPublicKey,
    message,
  };
}

/**
 * Sign a transaction using a PKP
 */
export async function signTransaction(
  pkpPublicKey: string,
  transaction: {
    to: string;
    value: string;
    data?: string;
    nonce: number;
    gasLimit: string;
    gasPrice: string;
    chainId: number;
  },
  userJwt: string,
  authMethodId: string
): Promise<SignedTransaction> {
  const tx = {
    to: transaction.to as Address,
    value: BigInt(transaction.value),
    data: (transaction.data || "0x") as Hex,
    nonce: transaction.nonce,
    gas: BigInt(transaction.gasLimit),
    gasPrice: BigInt(transaction.gasPrice),
    chainId: transaction.chainId,
    type: "legacy" as const,
  };

  const serializedTx = serializeTransaction(tx);
  const txHash = keccak256(serializedTx);
  const txBytes = toBytes(txHash);

  const signature = await signWithPkp(
    pkpPublicKey,
    txBytes,
    userJwt,
    authMethodId
  );

  // Parse the signature components
  const r = `0x${signature.slice(2, 66)}` as Hex;
  const s = `0x${signature.slice(66, 130)}` as Hex;
  const rawV = parseInt(signature.slice(130, 132), 16);
  
  // Convert raw v (27 or 28) to EIP-155 v value
  const recoveryParam = rawV - 27;
  const eip155V = BigInt(transaction.chainId) * 2n + 35n + BigInt(recoveryParam);

  const signedTx = serializeTransaction(tx, {
    r,
    s,
    v: eip155V,
  });

  return {
    signature,
    serializedTransaction: signedTx,
  };
}

/**
 * Add a permitted auth method to a PKP (for sharing access)
 */
export async function addPermittedAuthMethod(
  pkpTokenId: string,
  authMethod: { authMethodType: number; accessToken: string }
): Promise<{ success: boolean; transactionHash?: string }> {
  const privateKey = process.env.ETHEREUM_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("ETHEREUM_PRIVATE_KEY environment variable is required");
  }

  const formattedKey = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
  const serverAccount = privateKeyToAccount(formattedKey);
  
  const litClient = await getLitClient();
  
  const pkpPermissionsManager = await litClient.getPKPPermissionsManager({
    account: serverAccount,
  });

  const tx = await pkpPermissionsManager.addPermittedAuthMethod({
    tokenId: pkpTokenId,
    authMethodType: authMethod.authMethodType,
    authMethodId: authMethod.accessToken,
    authMethodScopes: [1], // Sign anything
  });

  return {
    success: true,
    transactionHash: tx.transactionHash,
  };
}
