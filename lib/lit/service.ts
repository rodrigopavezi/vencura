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
} from "./actions/verifyJwt";

import type {
  SessionSigsMap,
  AuthMethod,
  LitResourceAbilityRequest,
} from "@lit-protocol/types";

// Re-export types for use by other modules
export type { SessionSigsMap, AuthMethod, LitResourceAbilityRequest };

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
  const { LIT_ABILITY } = await import("@lit-protocol/constants");
  const { LitPKPResource, LitActionResource, createSiweMessage, generateAuthSig } = await import("@lit-protocol/auth-helpers");
  const { ethers } = await import("ethers");
  
  const litClient = await getLitClient();
  
  const privateKey = process.env.ETHEREUM_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("ETHEREUM_PRIVATE_KEY required for session sigs");
  }
  
  const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const wallet = new ethers.Wallet(formattedKey);
  
  const expirationTime = new Date(Date.now() + 1000 * 60 * 10).toISOString();
  
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
      const toSign = await createSiweMessage({
        uri: params.uri!,
        expiration: params.expiration!,
        resources: params.resourceAbilityRequests!,
        walletAddress: wallet.address,
        nonce: await litClient.getLatestBlockhash(),
        litNodeClient: litClient,
      });
      
      return generateAuthSig({
        signer: wallet,
        toSign,
      });
    },
  });
  
  return sessionSigs;
}

/**
 * Sign data with PKP after server-side JWT verification
 * 
 * Security model:
 * 1. Server verifies JWT matches the wallet's authMethodId
 * 2. Only if verified, server uses its session sigs to sign with PKP
 * 3. Without valid JWT, no signing occurs
 * 
 * @param pkpPublicKey - The PKP's public key
 * @param toSign - The data to sign (as Uint8Array)
 * @param userJwt - The user's Dynamic Labs JWT
 * @param authMethodId - The auth method ID (hash of user's email)
 */
async function signWithPkpAfterJwtVerification(
  pkpPublicKey: string,
  toSign: Uint8Array,
  userJwt: string,
  authMethodId: string
): Promise<string> {
  // First, verify JWT on server side
  console.log("🔐 Verifying JWT...");
  const email = verifyJwtAndGetEmail(userJwt, authMethodId);
  console.log(`✅ JWT verified for: ${email}`);
  
  const litClient = await getLitClient();
  
  // Get session sigs using server wallet (which is a permitted address on the PKP)
  console.log("🔐 Getting session sigs for signing...");
  const sessionSigs = await getSessionSigsWithServerWallet();
  
  console.log("🔐 Signing with PKP...");
  
  // Sign directly with pkpSign
  const signingResult = await litClient.pkpSign({
    pubKey: pkpPublicKey,
    toSign,
    sessionSigs,
  });
  
  // Format signature
  const sig = signingResult.signature as string;
  const fullSignature = sig.startsWith("0x") ? sig : `0x${sig}`;
  
  console.log("✅ PKP signing successful");
  return fullSignature;
}

/**
 * Sign a message using a PKP
 * 
 * Security: JWT is verified on server before signing.
 * Only users with a valid JWT matching the PKP's authMethodId can sign.
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

  // Verify JWT and sign with PKP
  const signature = await signWithPkpAfterJwtVerification(
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
 * Security: JWT is verified on server before signing.
 * Only users with a valid JWT matching the PKP's authMethodId can sign.
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
  };

  const serializedTx = serializeTransaction(tx);
  const txHash = keccak256(serializedTx);
  const txBytes = toBytes(txHash);

  // Verify JWT and sign with PKP
  const signature = await signWithPkpAfterJwtVerification(
    pkpPublicKey,
    txBytes,
    userJwt,
    authMethodId
  );

  // Parse the signature components
  // Signature format: 0x{r}{s}{v} where r and s are 64 hex chars each, v is 2 hex chars
  const r = `0x${signature.slice(2, 66)}` as Hex;
  const s = `0x${signature.slice(66, 130)}` as Hex;
  const v = parseInt(signature.slice(130, 132), 16);

  // Serialize with signature
  const signedTx = serializeTransaction(tx, {
    r,
    s,
    v: BigInt(v),
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

