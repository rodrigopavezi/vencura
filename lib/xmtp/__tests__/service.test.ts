import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getConversations,
  getMessages,
  sendMessage,
  startConversation,
  canMessage,
} from "../service";

// Mock XMTP Node SDK
vi.mock("@xmtp/node-sdk", () => ({
  Client: {
    create: vi.fn(),
  },
  IdentifierKind: {
    Ethereum: 0,
  },
  GroupMessageKind: {
    Application: 1,
  },
}));

// Mock crypto for encryption key - include createHash
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal() as object;
  return {
    ...actual,
    createHash: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn(() => Buffer.alloc(32, 0xab)),
    })),
    getRandomValues: vi.fn((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    }),
  };
});

import { Client } from "@xmtp/node-sdk";

describe("XMTP Service", () => {
  const mockConversation = {
    id: "conv-1",
    peerInboxId: "0x" + "a".repeat(40),
    createdAt: Date.now(),
    sendText: vi.fn(),
    messages: vi.fn(),
    sync: vi.fn(),
  };

  const mockClient = {
    conversations: {
      list: vi.fn(),
      createDmWithIdentifier: vi.fn(),
      syncAll: vi.fn(),
    },
    canMessage: vi.fn(),
  };

  const mockSignFn = vi.fn().mockResolvedValue("0x" + "a".repeat(130));
  const walletAddress = "0x" + "b".repeat(40);

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(Client.create).mockResolvedValue(mockClient as any);
  });

  describe("getConversations", () => {
    it("should return list of conversations", async () => {
      mockClient.conversations.syncAll.mockResolvedValue(undefined);
      mockClient.conversations.list.mockResolvedValue([
        {
          id: "conv-1",
          peerInboxId: "0x" + "c".repeat(40),
          createdAt: Date.now(),
        },
        {
          id: "conv-2",
          peerInboxId: "0x" + "d".repeat(40),
          createdAt: Date.now(),
        },
      ]);

      const result = await getConversations(walletAddress, mockSignFn);

      expect(result).toHaveLength(2);
      expect(result[0].peerAddress).toBe("0x" + "c".repeat(40));
    });

    it("should return empty array when no conversations", async () => {
      mockClient.conversations.syncAll.mockResolvedValue(undefined);
      mockClient.conversations.list.mockResolvedValue([]);

      const result = await getConversations(walletAddress, mockSignFn);

      expect(result).toEqual([]);
    });
  });

  describe("getMessages", () => {
    it("should return messages from a conversation", async () => {
      mockClient.conversations.syncAll.mockResolvedValue(undefined);
      mockClient.conversations.list.mockResolvedValue([mockConversation]);
      mockConversation.sync.mockResolvedValue(undefined);
      mockConversation.messages.mockResolvedValue([
        {
          id: "msg-1",
          senderInboxId: "0x" + "e".repeat(40),
          content: { text: "Hello!" },
          sentAtNs: BigInt(Date.now() * 1000000),
          kind: 0, // GroupMessageKind.Application
        },
      ]);

      const result = await getMessages(walletAddress, mockSignFn, "conv-1");

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe("Hello!");
    });

    it("should return empty array when conversation not found", async () => {
      mockClient.conversations.syncAll.mockResolvedValue(undefined);
      mockClient.conversations.list.mockResolvedValue([]);

      const result = await getMessages(walletAddress, mockSignFn, "non-existent");

      expect(result).toEqual([]);
    });
  });

  describe("sendMessage", () => {
    it("should send a message and return the sent message", async () => {
      mockClient.conversations.syncAll.mockResolvedValue(undefined);
      mockClient.conversations.list.mockResolvedValue([mockConversation]);
      mockConversation.sendText.mockResolvedValue("msg-2");

      const result = await sendMessage(walletAddress, mockSignFn, "conv-1", "Hi there!");

      expect(result?.id).toBe("msg-2");
      expect(result?.content).toBe("Hi there!");
      expect(mockConversation.sendText).toHaveBeenCalledWith("Hi there!");
    });

    it("should return null when conversation not found", async () => {
      mockClient.conversations.syncAll.mockResolvedValue(undefined);
      mockClient.conversations.list.mockResolvedValue([]);

      const result = await sendMessage(walletAddress, mockSignFn, "non-existent", "Hi!");

      expect(result).toBeNull();
    });
  });

  describe("startConversation", () => {
    it("should start a conversation without initial message", async () => {
      const peerAddr = "0x" + "h".repeat(40);
      mockClient.conversations.syncAll.mockResolvedValue(undefined);
      mockClient.canMessage.mockResolvedValue(new Map([[peerAddr, true]]));
      mockClient.conversations.createDmWithIdentifier.mockResolvedValue({
        id: "conv-3",
        peerInboxId: peerAddr,
        createdAt: Date.now(),
      });

      const result = await startConversation(walletAddress, mockSignFn, peerAddr);

      expect(result.conversation.peerAddress).toBe(peerAddr);
      expect(result.message).toBeUndefined();
    });

    it("should start a conversation with initial message", async () => {
      const peerAddr = "0x" + "i".repeat(40);
      mockClient.conversations.syncAll.mockResolvedValue(undefined);
      mockClient.canMessage.mockResolvedValue(new Map([[peerAddr, true]]));
      
      const conv = {
        id: "conv-4",
        peerInboxId: peerAddr,
        createdAt: Date.now(),
        sendText: vi.fn().mockResolvedValue("msg-3"),
      };

      mockClient.conversations.createDmWithIdentifier.mockResolvedValue(conv);

      const result = await startConversation(
        walletAddress,
        mockSignFn,
        peerAddr,
        "First message"
      );

      expect(result.conversation.peerAddress).toBe(peerAddr);
      expect(result.message?.content).toBe("First message");
    });
  });

  describe("canMessage", () => {
    it("should return true if peer can receive messages", async () => {
      mockClient.canMessage.mockResolvedValue(new Map([["0x" + "j".repeat(40), true]]));

      const result = await canMessage(walletAddress, mockSignFn, "0x" + "j".repeat(40));

      expect(result).toBe(true);
    });

    it("should return false if peer cannot receive messages", async () => {
      mockClient.canMessage.mockResolvedValue(new Map([["0x" + "k".repeat(40), false]]));

      const result = await canMessage(walletAddress, mockSignFn, "0x" + "k".repeat(40));

      expect(result).toBe(false);
    });
  });
});
