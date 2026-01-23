import { createPublicClient, http, formatEther, parseEther, type Address } from "viem";
import { mainnet, sepolia } from "viem/chains";

// Use CHAIN_ID env var to explicitly set the network (defaults to sepolia for safety)
const chainId = parseInt(process.env.CHAIN_ID || "11155111", 10);
const chain = chainId === 1 ? mainnet : sepolia;

let publicClient: ReturnType<typeof createPublicClient> | null = null;

function getPublicClient() {
  if (publicClient) {
    return publicClient;
  }

  publicClient = createPublicClient({
    chain,
    transport: http(process.env.ETHEREUM_RPC_URL),
  });

  return publicClient;
}

export interface Balance {
  wei: string;
  ether: string;
}

export interface TokenBalance {
  contractAddress: string;
  symbol: string;
  name: string;
  balance: string;
  decimals: number;
}

export interface Transaction {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  timestamp: number;
  blockNumber: number;
  status: "success" | "failed" | "pending";
}

/**
 * Get ETH balance for an address
 */
export async function getBalance(address: string): Promise<Balance> {
  const client = getPublicClient();
  const balance = await client.getBalance({ address: address as Address });

  return {
    wei: balance.toString(),
    ether: formatEther(balance),
  };
}

/**
 * Get ERC20 token balances for an address
 * Uses Etherscan API V2 for token discovery
 */
export async function getTokenBalances(address: string): Promise<TokenBalance[]> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    return [];
  }

  // Use Etherscan V2 API with chainid parameter
  const baseUrl = "https://api.etherscan.io/v2/api";

  try {
    const response = await fetch(
      `${baseUrl}?chainid=${chain.id}&module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`
    );
    
    const data = await response.json();
    
    if (data.status !== "1" || !data.result) {
      return [];
    }

    // Get unique token contracts
    const tokenContracts = new Map<string, { symbol: string; name: string; decimals: number }>();
    
    for (const tx of data.result) {
      if (!tokenContracts.has(tx.contractAddress)) {
        tokenContracts.set(tx.contractAddress, {
          symbol: tx.tokenSymbol,
          name: tx.tokenName,
          decimals: parseInt(tx.tokenDecimal),
        });
      }
    }

    // Get current balances for each token
    const client = getPublicClient();
    const balances: TokenBalance[] = [];

    for (const [contractAddress, tokenInfo] of tokenContracts) {
      try {
        const balance = await client.readContract({
          address: contractAddress as Address,
          abi: [
            {
              name: "balanceOf",
              type: "function",
              stateMutability: "view",
              inputs: [{ name: "account", type: "address" }],
              outputs: [{ name: "", type: "uint256" }],
            },
          ],
          functionName: "balanceOf",
          args: [address as Address],
        });

        if (balance > BigInt(0)) {
          balances.push({
            contractAddress,
            symbol: tokenInfo.symbol,
            name: tokenInfo.name,
            balance: balance.toString(),
            decimals: tokenInfo.decimals,
          });
        }
      } catch {
        // Skip tokens that fail to read
      }
    }

    return balances;
  } catch (error) {
    console.error("Failed to fetch token balances:", error);
    return [];
  }
}

/**
 * Get transaction history for an address
 */
export async function getTransactionHistory(
  address: string,
  limit: number = 50
): Promise<Transaction[]> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    console.warn("ETHERSCAN_API_KEY not set - transaction history unavailable");
    return [];
  }

  // Use Etherscan V2 API with chainid parameter
  const baseUrl = "https://api.etherscan.io/v2/api";

  try {
    const url = `${baseUrl}?chainid=${chain.id}&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc&apikey=${apiKey}`;
    console.log("Fetching transactions from Etherscan V2 for chain:", chain.id, "address:", address);
    const response = await fetch(url);
    
    const data = await response.json();
    
    if (data.status !== "1" || !data.result) {
      console.log("Etherscan API error:", JSON.stringify(data));
      return [];
    }

    return data.result.map((tx: {
      hash: string;
      from: string;
      to: string;
      value: string;
      timeStamp: string;
      blockNumber: string;
      isError: string;
      txreceipt_status: string;
    }) => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to || null,
      value: formatEther(BigInt(tx.value)),
      timestamp: parseInt(tx.timeStamp),
      blockNumber: parseInt(tx.blockNumber),
      status: tx.isError === "1" ? "failed" : tx.txreceipt_status === "1" ? "success" : "pending",
    }));
  } catch (error) {
    console.error("Failed to fetch transaction history:", error);
    return [];
  }
}

/**
 * Broadcast a signed transaction to the network
 */
export async function broadcastTransaction(signedTransaction: string): Promise<{
  hash: string;
  status: "pending" | "success" | "failed";
}> {
  const client = getPublicClient();
  
  const hash = await client.sendRawTransaction({
    serializedTransaction: signedTransaction as `0x${string}`,
  });

  // Wait for transaction receipt
  const receipt = await client.waitForTransactionReceipt({ hash });

  return {
    hash,
    status: receipt.status === "success" ? "success" : "failed",
  };
}

/**
 * Get current gas price
 */
export async function getGasPrice(): Promise<string> {
  const client = getPublicClient();
  const gasPrice = await client.getGasPrice();
  return gasPrice.toString();
}

/**
 * Get transaction count (nonce) for an address
 */
export async function getTransactionCount(address: string): Promise<number> {
  const client = getPublicClient();
  const count = await client.getTransactionCount({ address: address as Address });
  return count;
}

/**
 * Estimate gas for a transaction
 */
export async function estimateGas(transaction: {
  to: string;
  value?: string;
  data?: string;
}): Promise<string> {
  const client = getPublicClient();
  
  const gas = await client.estimateGas({
    to: transaction.to as Address,
    value: transaction.value ? parseEther(transaction.value) : undefined,
    data: transaction.data as `0x${string}` | undefined,
  });

  return gas.toString();
}
