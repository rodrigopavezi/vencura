import { getLitClient } from "./client";
import {
  hashMessage,
  keccak256,
  serializeTransaction,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { publicKeyToAddress } from "viem/accounts";
import {
  AUTH_METHOD_SCOPES,
  JWT_VERIFY_AND_SIGN_LIT_ACTION_CODE,
} from "./actions/verifyJwt";

import type {
  SessionSigsMap,
  AuthMethod,
  LitResourceAbilityRequest,
} from "@lit-protocol/types";

// Re-export types for use by other modules
export type { SessionSigsMap, AuthMethod, LitResourceAbilityRequest };

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
 * The PKP is minted with the server wallet as a permitted signer.
 * However, signing is ONLY allowed when the user provides a valid JWT
 * that matches the authMethodId stored with the wallet.
 * 
 * Security model:
 * - Server wallet can technically sign with the PKP
 * - But the Lit Action verifies JWT before allowing any signature
 * - Without valid JWT from the user, no signing occurs
 * 
 * @param userEmail - The user's email from Dynamic Labs JWT
 */
export async function mintPKP(userEmail: string): Promise<PKPInfo> {
  // Dynamic imports to avoid loading at module initialization
  const { LitContracts } = await import("@lit-protocol/contracts-sdk");
  const { LIT_NETWORK } = await import("@lit-protocol/constants");
  const { ethers } = await import("ethers");
  
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
  const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  
  // Get server wallet address
  const serverWallet = new ethers.Wallet(formattedKey);
  const serverWalletAddress = serverWallet.address;
  console.log(`🔐 Server wallet address: ${serverWalletAddress}`);

  console.log("🔄 Connecting LitContracts client to network...");
  const litContracts = new LitContracts({
    privateKey: formattedKey,
    network: LIT_NETWORK.DatilDev,
    debug: false,
  });
  await litContracts.connect();
  console.log("✅ Connected LitContracts client to network");

  console.log("🔄 Minting new PKP...");
  
  try {
    // First mint the PKP
    const mintCost = await litContracts.pkpNftContract.read.mintCost();
    console.log(`💰 Mint cost: ${mintCost.toString()} wei`);
    
    // Check server wallet balance
    const provider = litContracts.signer?.provider;
    if (provider) {
      const balance = await provider.getBalance(serverWalletAddress);
      console.log(`💰 Server wallet balance: ${balance.toString()} wei`);
      
      if (balance.lt(mintCost)) {
        throw new Error(`Insufficient funds: wallet has ${ethers.utils.formatEther(balance)} ETH, needs at least ${ethers.utils.formatEther(mintCost)} ETH for minting. Fund your server wallet (${serverWalletAddress}) on Chronicle Yellowstone testnet.`);
      }
    }
    
    // Use mintGrantAndBurnNext - this creates a PKP that the contract controls
    // Then we'll add the server wallet as a permitted address
    const mintTx = await litContracts.pkpNftContract.write.mintNext(2, { value: mintCost });
    console.log(`📤 Mint transaction sent: ${mintTx.hash}`);
    const mintReceipt = await mintTx.wait();
    
    // Extract tokenId from Transfer event
    let tokenId: string | undefined;
    for (const log of mintReceipt.logs) {
      try {
        // Try parsing as Transfer event
        if (log.topics && log.topics.length >= 4) {
          // Transfer(from, to, tokenId) - tokenId is the 4th topic
          tokenId = BigInt(log.topics[3]).toString();
          break;
        }
      } catch {
        continue;
      }
    }
    
    if (!tokenId) {
      throw new Error("Could not extract tokenId from mint transaction");
    }
    
    console.log(`✅ Minted PKP with tokenId: ${tokenId}`);
    
    // Get public key
    const publicKey = await litContracts.pkpNftContract.read.getPubkey(tokenId);
    const pubkey = publicKey.startsWith("0x") ? publicKey : `0x${publicKey}`;
    
    // Derive ETH address
    const pkpEthAddress = publicKeyToAddress(pubkey as `0x${string}`);
    
    console.log(`✅ Public key: ${pubkey}`);
    console.log(`✅ ETH address: ${pkpEthAddress}`);
    
    // Add the server wallet as a permitted address with SignAnything scope
    console.log("🔄 Adding server wallet as permitted address...");
    const addPermittedTx = await litContracts.pkpPermissionsContract.write.addPermittedAddress(
      tokenId,
      serverWalletAddress,
      [AUTH_METHOD_SCOPES.SIGN_ANYTHING]
    );
    await addPermittedTx.wait();
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
 * Get session signatures using the server wallet
 * 
 * The server wallet is a permitted address on the PKP with SignAnything scope.
 */
async function getSessionSigsWithServerWallet(): Promise<SessionSigsMap> {
  console.log("  📋 Importing dependencies for session sigs...");
  const { LIT_ABILITY } = await import("@lit-protocol/constants");
  const { LitPKPResource, LitActionResource, createSiweMessage, generateAuthSig } = await import("@lit-protocol/auth-helpers");
  const { ethers } = await import("ethers");
  
  console.log("  📋 Getting Lit client for session sigs...");
  const litClient = await getLitClient();
  
  const privateKey = process.env.ETHEREUM_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("ETHEREUM_PRIVATE_KEY required for session sigs");
  }
  
  const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const wallet = new ethers.Wallet(formattedKey);
  console.log("  📋 Using server wallet:", wallet.address);
  
  const expirationTime = new Date(Date.now() + 1000 * 60 * 10).toISOString();
  console.log("  📋 Session expiration:", expirationTime);
  
  console.log("  📋 Calling litClient.getSessionSigs...");
  // Use getSessionSigs with SIWE auth
  const sessionSigs = await litClient.getSessionSigs({
    chain: "ethereum",
    expiration: expirationTime,
    resourceAbilityRequests: [
      {
        resource: new LitPKPResource("*"),
        ability: LIT_ABILITY.PKPSigning,
      },
      {
        resource: new LitActionResource("*"),
        ability: LIT_ABILITY.LitActionExecution,
      },
    ],
    authNeededCallback: async (params: { uri?: string; expiration?: string; resourceAbilityRequests?: LitResourceAbilityRequest[] }) => {
      console.log("  📋 authNeededCallback triggered, creating SIWE message...");
      const toSign = await createSiweMessage({
        uri: params.uri!,
        expiration: params.expiration!,
        resources: params.resourceAbilityRequests!,
        walletAddress: wallet.address,
        nonce: await litClient.getLatestBlockhash(),
        litNodeClient: litClient,
      });
      
      console.log("  📋 Generating auth sig...");
      return generateAuthSig({
        signer: wallet,
        toSign,
      });
    },
  });
  
  console.log("  📋 Session sigs obtained successfully");
  return sessionSigs;
}

/**
 * Sign data with PKP after server-side JWT verification (HYBRID MODE)
 * 
 * Security model:
 * 1. Server verifies JWT matches the wallet's authMethodId
 * 2. Only if verified, server uses its session sigs to sign with PKP
 * 3. Without valid JWT, no signing occurs
 * 
 * NOTE: This is the HYBRID mode where JWT verification happens server-side.
 * For true non-custodial, use signWithLitAction instead.
 * 
 * @param pkpPublicKey - The PKP's public key
 * @param toSign - The data to sign (as Uint8Array)
 * @param userJwt - The user's Dynamic Labs JWT
 * @param authMethodId - The auth method ID (hash of user's email)
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
  
  // Get session sigs using server wallet (which is a permitted address on the PKP)
  console.log("🔐 [HYBRID MODE] Getting session sigs for signing...");
  let sessionSigs;
  try {
    sessionSigs = await getSessionSigsWithServerWallet();
    console.log("✅ [HYBRID MODE] Session sigs obtained");
  } catch (sessionError: unknown) {
    const err = sessionError as { message?: string; errorCode?: string };
    console.error("❌ [HYBRID MODE] Failed to get session sigs:", err.message || sessionError);
    if (err.errorCode) console.error("Error code:", err.errorCode);
    throw sessionError;
  }
  
  console.log("🔐 [HYBRID MODE] Signing with PKP...");
  console.log("🔐 [HYBRID MODE] PKP Public Key:", pkpPublicKey);
  
  let signingResult;
  try {
    // Sign directly with pkpSign
    signingResult = await litClient.pkpSign({
      pubKey: pkpPublicKey,
      toSign,
      sessionSigs,
    });
    console.log("✅ [HYBRID MODE] PKP sign returned");
  } catch (signError: unknown) {
    const err = signError as { message?: string; errorCode?: string; details?: unknown };
    console.error("❌ [HYBRID MODE] PKP signing failed:", err.message || signError);
    if (err.errorCode) console.error("Error code:", err.errorCode);
    if (err.details) console.error("Error details:", JSON.stringify(err.details, null, 2));
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
 * 
 * This is more secure than hybrid mode because JWT verification happens
 * on the decentralized Lit Network, not on the server.
 * 
 * @param pkpPublicKey - The PKP's public key
 * @param toSign - The data to sign (as Uint8Array)
 * @param userJwt - The user's Dynamic Labs JWT
 * @param authMethodId - The auth method ID (hash of user's email)
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
  
  // Get session sigs (still needed for executeJs, but the Lit Action
  // will independently verify the JWT before signing)
  console.log("🔐 Getting session sigs for Lit Action execution...");
  let sessionSigs;
  try {
    sessionSigs = await getSessionSigsWithServerWallet();
    console.log("✅ Session sigs obtained");
  } catch (sessionError: unknown) {
    const err = sessionError as { message?: string; errorCode?: string };
    console.error("❌ Failed to get session sigs:", err.message || sessionError);
    if (err.errorCode) console.error("Error code:", err.errorCode);
    throw sessionError;
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
    // The JWT verification happens INSIDE the Lit Action, not on the server
    result = await litClient.executeJs({
      code: JWT_VERIFY_AND_SIGN_LIT_ACTION_CODE,
      sessionSigs,
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
    if (err.errorCode) console.error("Error code:", err.errorCode);
    if (err.details) console.error("Error details:", JSON.stringify(err.details, null, 2));
    throw executeError;
  }
  
  console.log("🔐 Lit Action result received");
  console.log("🔐 Result response:", result.response);
  console.log("🔐 Result logs:", result.logs);
  
  // Parse the response from Lit Action
  if (result.response) {
    try {
      const response = JSON.parse(result.response as string);
      if (!response.success) {
        console.error("❌ Lit Action returned failure:", response.error);
        throw new Error(`Lit Action verification failed: ${response.error}`);
      }
      console.log(`✅ JWT verified by Lit Network for: ${response.email}`);
    } catch (parseError) {
      console.error("❌ Failed to parse Lit Action response:", result.response);
      throw parseError;
    }
  } else {
    console.warn("⚠️ No response from Lit Action");
  }
  
  // Extract signature from result
  // The signature is in result.signatures under the name we specified ("sig")
  const signatures = result.signatures as Record<string, {
    r: string;
    s: string;
    recid: number;
    signature: string;
    publicKey: string;
    dataSigned: string;
  }> | undefined;
  
  console.log("🔐 Signatures received:", signatures ? Object.keys(signatures) : "none");
  
  if (!signatures || !signatures.sig) {
    console.error("❌ No signature in result. Full result:", JSON.stringify(result, null, 2));
    throw new Error("No signature returned from Lit Action. JWT verification may have failed.");
  }
  
  const sig = signatures.sig;
  
  // Format the signature as 0x{r}{s}{v}
  // r and s are 32 bytes each (64 hex chars), v is recovery id + 27
  const r = sig.r.startsWith("0x") ? sig.r.slice(2) : sig.r;
  const s = sig.s.startsWith("0x") ? sig.s.slice(2) : sig.s;
  const v = (sig.recid + 27).toString(16).padStart(2, "0");
  
  const fullSignature = `0x${r}${s}${v}`;
  
  console.log("✅ PKP signing successful (non-custodial mode via Lit Action)");
  return fullSignature;
}

/**
 * Sign data with PKP - uses the configured signing mode
 * 
 * @param pkpPublicKey - The PKP's public key
 * @param toSign - The data to sign (as Uint8Array)
 * @param userJwt - The user's Dynamic Labs JWT
 * @param authMethodId - The auth method ID (hash of user's email)
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
 * 
 * Security model depends on USE_LIT_ACTION_SIGNING:
 * - TRUE (default): JWT verified inside Lit Action on decentralized network (non-custodial)
 * - FALSE: JWT verified server-side before signing (hybrid mode)
 * 
 * @param pkpPublicKey - The PKP's public key
 * @param message - The message to sign
 * @param userJwt - The user's Dynamic Labs JWT
 * @param authMethodId - The auth method ID (hash of user's email)
 */
export async function signMessage(
  pkpPublicKey: string,
  message: string,
  userJwt: string,
  authMethodId: string
): Promise<SignedMessage> {
  const messageHash = hashMessage(message);
  const messageBytes = toBytes(messageHash);

  // Sign with PKP (mode determined by USE_LIT_ACTION_SIGNING)
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
 * 
 * Security model depends on USE_LIT_ACTION_SIGNING:
 * - TRUE (default): JWT verified inside Lit Action on decentralized network (non-custodial)
 * - FALSE: JWT verified server-side before signing (hybrid mode)
 * 
 * @param pkpPublicKey - The PKP's public key
 * @param transaction - Transaction parameters
 * @param userJwt - The user's Dynamic Labs JWT
 * @param authMethodId - The auth method ID (hash of user's email)
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

  // Sign with PKP (mode determined by USE_LIT_ACTION_SIGNING)
  const signature = await signWithPkp(
    pkpPublicKey,
    txBytes,
    userJwt,
    authMethodId
  );

  // Parse the signature components
  // Signature format: 0x{r}{s}{v} where r and s are 64 hex chars each, v is 2 hex chars
  const r = `0x${signature.slice(2, 66)}` as Hex;
  const s = `0x${signature.slice(66, 130)}` as Hex;
  const rawV = parseInt(signature.slice(130, 132), 16);
  
  // Convert raw v (27 or 28) to EIP-155 v value: chainId * 2 + 35 + recoveryParam
  // Use BigInt for the calculation to avoid mixing types
  const recoveryParam = rawV - 27;
  const eip155V = BigInt(transaction.chainId) * 2n + 35n + BigInt(recoveryParam);

  // Serialize with signature using the EIP-155 v value
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
  authMethod: AuthMethod
): Promise<{ success: boolean; transactionHash?: string }> {
  const { LitContracts } = await import("@lit-protocol/contracts-sdk");
  const { LIT_NETWORK } = await import("@lit-protocol/constants");
  const { createEthersSigner } = await import("./viemToEthers");

  const privateKey = process.env.ETHEREUM_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("ETHEREUM_PRIVATE_KEY environment variable is required");
  }

  const signer = await createEthersSigner(privateKey);

  const litContracts = new LitContracts({
    signer,
    network: LIT_NETWORK.DatilDev,
    debug: false,
  });
  await litContracts.connect();

  const tx = await litContracts.addPermittedAuthMethod({
    pkpTokenId,
    authMethodType: authMethod.authMethodType,
    authMethodId: authMethod.accessToken,
    authMethodScopes: [1], // Sign anything
  });

  return {
    success: true,
    transactionHash: tx.transactionHash,
  };
}

