import { beforeAll, afterAll, afterEach, vi } from "vitest";

// Mock environment variables
process.env.LIT_NETWORK = "datil-dev";
process.env.RESEND_API_KEY = "re_test_key";
process.env.ETHEREUM_RPC_URL = "https://eth-mainnet.test.com";
process.env.ETHERSCAN_API_KEY = "test_etherscan_key";
process.env.APP_URL = "http://localhost:3000";

// Set DATABASE_URL for tests if not already set
// For CI, this is set via environment; for local, use local PostgreSQL or provide your own
if (!process.env.DATABASE_URL) {
  // Default to local PostgreSQL for testing
  // You can override this by setting DATABASE_URL in your environment
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/vencura_test";
}

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
