/**
 * Adapter to convert viem wallet to ethers-compatible signer
 * This is needed because Lit Protocol's contracts-sdk requires ethers
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Chronicle Yellowstone chain configuration for Lit Protocol
export const chronicleYellowstone: Chain = {
  id: 175188,
  name: "Chronicle Yellowstone",
  nativeCurrency: {
    decimals: 18,
    name: "LIT",
    symbol: "LIT",
  },
  rpcUrls: {
    default: {
      http: ["https://yellowstone-rpc.litprotocol.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Yellowstone Explorer",
      url: "https://yellowstone-explorer.litprotocol.com",
    },
  },
};

/**
 * Creates an ethers-compatible signer from a private key using viem under the hood
 * The Lit contracts-sdk requires ethers, so we need this adapter
 */
export async function createEthersSigner(privateKey: string) {
  // We still need ethers for the Lit SDK compatibility
  const ethers = await import("ethers");
  
  // Chronicle Yellowstone network configuration for ethers
  const chronicleYellowstoneNetwork = {
    name: "chronicle-yellowstone",
    chainId: 175188,
  };
  
  // Use StaticJsonRpcProvider to skip network detection
  // This avoids the "could not detect network" error
  // Add connection options with longer timeout
  const connection = {
    url: "https://yellowstone-rpc.litprotocol.com",
    timeout: 60000, // 60 second timeout
  };
  
  const provider = new ethers.providers.StaticJsonRpcProvider(
    connection,
    chronicleYellowstoneNetwork
  );
  
  // Ensure private key has 0x prefix
  const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const wallet = new ethers.Wallet(formattedKey, provider);
  
  return wallet;
}

/**
 * Get viem clients for Chronicle Yellowstone
 */
export function getViemClients(privateKey: string) {
  const formattedKey = privateKey.startsWith("0x") 
    ? privateKey as `0x${string}`
    : `0x${privateKey}` as `0x${string}`;
    
  const account = privateKeyToAccount(formattedKey);

  const walletClient = createWalletClient({
    account,
    chain: chronicleYellowstone,
    transport: http(),
  });

  const publicClient = createPublicClient({
    chain: chronicleYellowstone,
    transport: http(),
  });

  return { walletClient, publicClient, account };
}
