import { beforeAll, afterAll, afterEach, vi } from "vitest";

// Mock environment variables
process.env.LIT_NETWORK = "datil-dev";
process.env.RESEND_API_KEY = "re_test_key";
process.env.ETHEREUM_RPC_URL = "https://eth-mainnet.test.com";
process.env.ETHERSCAN_API_KEY = "test_etherscan_key";
process.env.APP_URL = "http://localhost:3000";

beforeAll(() => {
  // Global setup before all tests
});

afterAll(() => {
  // Global cleanup after all tests
});

afterEach(() => {
  // Reset mocks after each test
  vi.clearAllMocks();
});
