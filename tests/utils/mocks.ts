import { vi } from "vitest";

// Mock Lit Protocol Client
export const mockLitClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  executeJs: vi.fn().mockResolvedValue({
    signatures: {
      sig: {
        signature: "0x" + "a".repeat(130),
        publicKey: "0x" + "b".repeat(128),
        dataSigned: "0x" + "c".repeat(64),
      },
    },
  }),
  pkpSign: vi.fn().mockResolvedValue({
    signature: "0x" + "a".repeat(130),
  }),
};

export const mockLitContracts = {
  connect: vi.fn().mockResolvedValue(undefined),
  pkpNftContractUtils: {
    write: {
      mint: vi.fn().mockResolvedValue({
        pkp: {
          tokenId: "0x" + "1".repeat(64),
          publicKey: "0x" + "2".repeat(128),
          ethAddress: "0x" + "3".repeat(40),
        },
      }),
    },
  },
  addPermittedAuthMethod: vi.fn().mockResolvedValue({ hash: "0x" + "4".repeat(64) }),
};

// Mock XMTP Client
export const mockXmtpClient = {
  conversations: {
    list: vi.fn().mockResolvedValue([]),
    newConversation: vi.fn().mockResolvedValue({
      peerAddress: "0x" + "5".repeat(40),
      send: vi.fn().mockResolvedValue({ id: "msg_1" }),
      messages: vi.fn().mockResolvedValue([]),
    }),
  },
  close: vi.fn().mockResolvedValue(undefined),
};

// Mock Resend Client
export const mockResend = {
  emails: {
    send: vi.fn().mockResolvedValue({
      data: { id: "email_123" },
      error: null,
    }),
  },
};

// Mock viem Public Client
export const mockPublicClient = {
  getBalance: vi.fn().mockResolvedValue(BigInt("1000000000000000000")), // 1 ETH
  getTransactionCount: vi.fn().mockResolvedValue(5),
  estimateGas: vi.fn().mockResolvedValue(BigInt("21000")),
  getGasPrice: vi.fn().mockResolvedValue(BigInt("20000000000")), // 20 gwei
  sendRawTransaction: vi.fn().mockResolvedValue("0x" + "6".repeat(64)),
  waitForTransactionReceipt: vi.fn().mockResolvedValue({
    status: "success",
    transactionHash: "0x" + "6".repeat(64),
  }),
  readContract: vi.fn().mockResolvedValue(BigInt("500000000000000000000")), // 500 tokens
};

// Factory to create mock functions that can be customized per test
export function createMockLitClient(overrides = {}) {
  return { ...mockLitClient, ...overrides };
}

export function createMockXmtpClient(overrides = {}) {
  return { ...mockXmtpClient, ...overrides };
}

export function createMockResend(overrides = {}) {
  return { ...mockResend, ...overrides };
}

export function createMockPublicClient(overrides = {}) {
  return { ...mockPublicClient, ...overrides };
}
