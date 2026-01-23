import { Client } from "@xmtp/node-sdk";

// Const enum values to avoid isolatedModules issue
const IDENTIFIER_KIND_ETHEREUM = 0 as const; // IdentifierKind.Ethereum
const GROUP_MESSAGE_KIND_APPLICATION = 0 as const; // GROUP_MESSAGE_KIND_APPLICATION
import type { Signer, Identifier } from "@xmtp/node-sdk";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface Conversation {
  id: string;
  peerAddress: string;
  createdAt: Date;
}

export interface Message {
  id: string;
  senderAddress: string;
  content: string;
  sent: Date;
}

// Cache for XMTP clients per wallet address
const clientCache = new Map<string, Client>();

// Track when each client was last used for cleanup
const clientLastUsed = new Map<string, number>();

// Maximum age for unused clients (default: 30 minutes)
const CLIENT_MAX_AGE_MS = 30 * 60 * 1000;

// Maximum number of cached clients
const MAX_CACHED_CLIENTS = 50;

/**
 * Get the directory for XMTP database files.
 * Uses XMTP_DB_DIR env var, or falls back to a temp directory.
 * This prevents database files from accumulating in the project root.
 */
function getXmtpDbDir(): string {
  const dbDir = process.env.XMTP_DB_DIR || join(tmpdir(), "vencura-xmtp");
  
  // Ensure directory exists
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  
  return dbDir;
}

/**
 * Get a deterministic encryption key for a wallet.
 * This derives a 32-byte key from the wallet address + a secret salt.
 * The key will be the same for the same wallet across server restarts.
 */
function getEncryptionKey(walletAddress: string): Uint8Array {
  // Use a secret from environment or a default (in production, always use env var)
  const secret = process.env.XMTP_ENCRYPTION_SECRET || "vencura-xmtp-default-secret";
  
  // Create a deterministic 32-byte key using SHA-256
  const hash = createHash("sha256");
  hash.update(`${secret}:${walletAddress.toLowerCase()}`);
  return new Uint8Array(hash.digest());
}

/**
 * Clean up old/unused XMTP clients to prevent memory and file accumulation
 */
async function cleanupOldClients(): Promise<void> {
  const now = Date.now();
  const clientsToRemove: string[] = [];

  // Find clients that haven't been used recently
  for (const [address, lastUsed] of clientLastUsed.entries()) {
    if (now - lastUsed > CLIENT_MAX_AGE_MS) {
      clientsToRemove.push(address);
    }
  }

  // If we're over the max, remove oldest clients
  if (clientCache.size > MAX_CACHED_CLIENTS) {
    const sortedClients = Array.from(clientLastUsed.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, clientCache.size - MAX_CACHED_CLIENTS);
    
    for (const [address] of sortedClients) {
      if (!clientsToRemove.includes(address)) {
        clientsToRemove.push(address);
      }
    }
  }

  // Remove old clients
  for (const address of clientsToRemove) {
    await closeXmtpClient(address);
  }
}

/**
 * Create a signer from the server's private key for PKP wallet operations
 * For XMTP, we use the PKP wallet address but sign using Lit Protocol
 */
export function createXmtpSigner(
  walletAddress: string,
  signMessageFn: (message: string) => Promise<string>
): Signer {
  return {
    type: "EOA",
    getIdentifier: () => ({
      identifier: walletAddress,
      identifierKind: IDENTIFIER_KIND_ETHEREUM,
    }),
    signMessage: async (message: string): Promise<Uint8Array> => {
      const signature = await signMessageFn(message);
      // Convert hex signature to Uint8Array
      const hexSig = signature.startsWith("0x") ? signature.slice(2) : signature;
      const bytes = new Uint8Array(hexSig.length / 2);
      for (let i = 0; i < hexSig.length; i += 2) {
        bytes[i / 2] = parseInt(hexSig.substring(i, i + 2), 16);
      }
      return bytes;
    },
  };
}

/**
 * Delete database files for a specific wallet
 */
function deleteDbFiles(dbFilePath: string): void {
  try {
    if (existsSync(dbFilePath)) {
      rmSync(dbFilePath);
    }
    // Also delete related SQLite files
    const relatedFiles = [dbFilePath + "-wal", dbFilePath + "-shm"];
    for (const file of relatedFiles) {
      if (existsSync(file)) {
        rmSync(file);
      }
    }
  } catch (cleanupError) {
    console.error("Failed to cleanup database files:", cleanupError);
  }
}

/**
 * Create a fresh XMTP client (used after cleaning up stale state)
 */
async function createFreshClient(
  walletAddress: string,
  signer: Signer,
  encryptionKey: Uint8Array,
  dbFilePath: string
): Promise<Client> {
  // Delete any existing database files
  deleteDbFiles(dbFilePath);
  
  console.log(`🔄 Creating fresh XMTP client for ${walletAddress.slice(0, 10)}...`);
  
  const client = await Client.create(signer, {
    dbEncryptionKey: encryptionKey,
    env: process.env.NODE_ENV === "production" ? "production" : "dev",
    dbPath: dbFilePath,
  });

  // Sync with XMTP network
  try {
    await client.conversations.sync();
  } catch (syncError: unknown) {
    const err = syncError as { message?: string };
    console.warn(`Sync warning for ${walletAddress.slice(0, 10)}:`, err.message);
    // Sync errors are non-fatal for fresh clients
  }
  
  clientCache.set(walletAddress, client);
  clientLastUsed.set(walletAddress, Date.now());
  return client;
}

/**
 * Initialize or get cached XMTP client for a wallet
 */
export async function getXmtpClient(
  walletAddress: string,
  signMessageFn: (message: string) => Promise<string>
): Promise<Client> {
  // Update last used time and return cached client if available
  if (clientCache.has(walletAddress)) {
    clientLastUsed.set(walletAddress, Date.now());
    return clientCache.get(walletAddress)!;
  }

  // Clean up old clients before creating a new one
  await cleanupOldClients();

  const signer = createXmtpSigner(walletAddress, signMessageFn);
  const encryptionKey = getEncryptionKey(walletAddress);
  const dbDir = getXmtpDbDir();
  
  // Use full file path for database (not just directory)
  const dbFilePath = join(dbDir, `xmtp-${walletAddress.toLowerCase().slice(0, 16)}.db3`);

  try {
    const client = await Client.create(signer, {
      dbEncryptionKey: encryptionKey,
      env: process.env.NODE_ENV === "production" ? "production" : "dev",
      dbPath: dbFilePath,
    });

    // Sync with XMTP network to ensure inbox is registered
    try {
      await client.conversations.sync();
    } catch (syncError: unknown) {
      const err = syncError as { message?: string };
      // If sync fails with inbox error, recreate fresh
      if (err.message?.includes("inbox id") && err.message?.includes("not found")) {
        console.log(`🔄 Sync failed - inbox not found, recreating client...`);
        return createFreshClient(walletAddress, signer, encryptionKey, dbFilePath);
      }
      // Other sync errors are warnings, not fatal
      console.warn(`Sync warning for ${walletAddress.slice(0, 10)}:`, err.message);
    }
    
    clientCache.set(walletAddress, client);
    clientLastUsed.set(walletAddress, Date.now());
    return client;
  } catch (error: unknown) {
    const err = error as { message?: string };
    // If inbox not found during client creation, create fresh
    if (err.message?.includes("inbox id") && err.message?.includes("not found")) {
      console.log(`🔄 Inbox not found for ${walletAddress.slice(0, 10)}, creating fresh...`);
      return createFreshClient(walletAddress, signer, encryptionKey, dbFilePath);
    }
    
    throw error;
  }
}

/**
 * Force refresh an XMTP client (clears cache and database)
 */
export async function refreshXmtpClient(
  walletAddress: string,
  signMessageFn: (message: string) => Promise<string>
): Promise<Client> {
  // Remove from cache
  clientCache.delete(walletAddress);
  clientLastUsed.delete(walletAddress);
  
  const signer = createXmtpSigner(walletAddress, signMessageFn);
  const encryptionKey = getEncryptionKey(walletAddress);
  const dbDir = getXmtpDbDir();
  const dbFilePath = join(dbDir, `xmtp-${walletAddress.toLowerCase().slice(0, 16)}.db3`);
  
  return createFreshClient(walletAddress, signer, encryptionKey, dbFilePath);
}

/**
 * Close and remove a cached XMTP client
 */
export async function closeXmtpClient(address: string): Promise<void> {
  const client = clientCache.get(address);
  if (client) {
    clientCache.delete(address);
    clientLastUsed.delete(address);
    // Note: The XMTP Node SDK doesn't have a close method,
    // but removing from cache allows garbage collection
  }
}

/**
 * Clean up all XMTP database files in the database directory.
 * Use this on server shutdown or maintenance.
 */
export function cleanupAllDatabaseFiles(): void {
  const dbDir = getXmtpDbDir();
  
  if (!existsSync(dbDir)) {
    return;
  }

  try {
    const files = readdirSync(dbDir);
    for (const file of files) {
      if (file.endsWith(".db3") || file.endsWith(".db3-wal") || file.endsWith(".db3-shm") || file.includes("sqlcipher_salt")) {
        try {
          rmSync(join(dbDir, file));
        } catch {
          // Ignore individual file deletion errors
        }
      }
    }
  } catch (error) {
    console.error("Failed to cleanup XMTP database files:", error);
  }
}

/**
 * Get the current number of cached clients (for monitoring)
 */
export function getCachedClientCount(): number {
  return clientCache.size;
}

/**
 * Get all conversations for a wallet
 */
export async function getConversations(
  walletAddress: string,
  signMessageFn: (message: string) => Promise<string>
): Promise<Conversation[]> {
  const client = await getXmtpClient(walletAddress, signMessageFn);
  
  // Sync all conversations AND messages from network
  // This ensures we receive new messages and conversations from other users
  await client.conversations.syncAll();
  const conversations = await client.conversations.list();

  return conversations.map((conv) => ({
    id: conv.id,
    // peerInboxId only exists on DM conversations, use id as fallback for groups
    peerAddress: "peerInboxId" in conv ? conv.peerInboxId : conv.id,
    createdAt: new Date(conv.createdAt),
  }));
}

/**
 * Get messages from a conversation
 */
export async function getMessages(
  walletAddress: string,
  signMessageFn: (message: string) => Promise<string>,
  conversationId: string,
  limit: number = 100
): Promise<Message[]> {
  const client = await getXmtpClient(walletAddress, signMessageFn);
  
  // Sync all conversations and messages from network first
  await client.conversations.syncAll();
  const conversations = await client.conversations.list();
  const conversation = conversations.find((c) => c.id === conversationId);

  if (!conversation) {
    return [];
  }

  // Also sync the specific conversation for latest messages
  await conversation.sync();
  const messages = await conversation.messages({ limit });

  // Filter to only include application messages (not membership changes/system messages)
  // and properly extract text content
  return messages
    .filter((msg) => msg.kind === GROUP_MESSAGE_KIND_APPLICATION)
    .map((msg) => {
      // Extract text content - could be a string directly or nested in an object
      let textContent: string;
      if (typeof msg.content === "string") {
        textContent = msg.content;
      } else if (msg.content && typeof msg.content === "object") {
        // Check for common content structures
        const content = msg.content as Record<string, unknown>;
        if (typeof content.text === "string") {
          textContent = content.text;
        } else if (typeof content.content === "string") {
          textContent = content.content;
        } else {
          // Fallback to stringifying only if we can't extract text
          textContent = msg.fallback || "[Unsupported content type]";
        }
      } else {
        textContent = msg.fallback || "[Empty message]";
      }

      return {
        id: msg.id,
        senderAddress: msg.senderInboxId,
        content: textContent,
        sent: new Date(Number(msg.sentAtNs) / 1000000),
      };
    });
}

/**
 * Send a message in a conversation
 */
export async function sendMessage(
  walletAddress: string,
  signMessageFn: (message: string) => Promise<string>,
  conversationId: string,
  content: string
): Promise<Message | null> {
  const client = await getXmtpClient(walletAddress, signMessageFn);
  
  // Sync all first to ensure we have the latest state
  await client.conversations.syncAll();
  const conversations = await client.conversations.list();
  const conversation = conversations.find((c) => c.id === conversationId);

  if (!conversation) {
    return null;
  }

  const messageId = await conversation.sendText(content);

  return {
    id: messageId,
    senderAddress: walletAddress,
    content,
    sent: new Date(),
  };
}

/**
 * Start a new conversation with a peer address
 */
export async function startConversation(
  walletAddress: string,
  signMessageFn: (message: string) => Promise<string>,
  peerAddress: string,
  initialMessage?: string
): Promise<{ conversation: Conversation; message?: Message }> {
  let client: Client;
  
  try {
    client = await getXmtpClient(walletAddress, signMessageFn);
  } catch (error: unknown) {
    const err = error as { message?: string };
    // If getXmtpClient fails with inbox error, try refreshing
    if (err.message?.includes("inbox id") && err.message?.includes("not found")) {
      console.log(`🔄 Refreshing XMTP client for ${walletAddress.slice(0, 10)}...`);
      client = await refreshXmtpClient(walletAddress, signMessageFn);
    } else {
      throw error;
    }
  }
  
  // Create identifier for the peer address
  const peerIdentifier: Identifier = {
    identifier: peerAddress,
    identifierKind: IDENTIFIER_KIND_ETHEREUM,
  };
  
  // Check if peer can receive XMTP messages
  try {
    const canMessageResults = await client.canMessage([peerIdentifier]);
    const peerCanReceive = canMessageResults.get(peerAddress.toLowerCase()) ?? canMessageResults.get(peerAddress) ?? false;
    
    if (!peerCanReceive) {
      throw new Error(`The address ${peerAddress} is not registered on XMTP and cannot receive messages. The recipient must first use XMTP to register their address.`);
    }
  } catch (canMsgError: unknown) {
    const err = canMsgError as { message?: string };
    // If canMessage fails with inbox error for our wallet, try to refresh and retry
    if (err.message?.includes("inbox id") && err.message?.includes("not found")) {
      console.log(`🔄 CanMessage failed - refreshing client...`);
      client = await refreshXmtpClient(walletAddress, signMessageFn);
      
      const canMessageResults = await client.canMessage([peerIdentifier]);
      const peerCanReceive = canMessageResults.get(peerAddress.toLowerCase()) ?? canMessageResults.get(peerAddress) ?? false;
      
      if (!peerCanReceive) {
        throw new Error(`The address ${peerAddress} is not registered on XMTP and cannot receive messages.`);
      }
    } else {
      throw canMsgError;
    }
  }
  
  // Create a new DM conversation with the peer using their identifier
  const conversation = await client.conversations.createDmWithIdentifier(peerIdentifier);

  const result: { conversation: Conversation; message?: Message } = {
    conversation: {
      id: conversation.id,
      peerAddress: conversation.peerInboxId,
      createdAt: new Date(conversation.createdAt),
    },
  };

  if (initialMessage) {
    const messageId = await conversation.sendText(initialMessage);
    result.message = {
      id: messageId,
      senderAddress: walletAddress,
      content: initialMessage,
      sent: new Date(),
    };
  }

  return result;
}

/**
 * Check if an address can receive XMTP messages
 */
export async function canMessage(
  walletAddress: string,
  signMessageFn: (message: string) => Promise<string>,
  peerAddress: string
): Promise<boolean> {
  const client = await getXmtpClient(walletAddress, signMessageFn);
  
  // Create identifier for the peer address
  const peerIdentifier: Identifier = {
    identifier: peerAddress,
    identifierKind: IDENTIFIER_KIND_ETHEREUM,
  };
  
  const canMessageResults = await client.canMessage([peerIdentifier]);
  return canMessageResults.get(peerAddress) ?? false;
}
