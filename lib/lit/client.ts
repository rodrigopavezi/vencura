// Using dynamic import to avoid loading Lit SDK at module initialization time
// This prevents the deprecation warning from appearing on every API request

import type { LitNodeClient as LitNodeClientType } from "@lit-protocol/lit-node-client";
import type { LIT_NETWORKS_KEYS } from "@lit-protocol/types";

let litNodeClient: LitNodeClientType | null = null;

export async function getLitClient(): Promise<LitNodeClientType> {
  if (litNodeClient) {
    console.log("🔌 Using existing Lit client connection");
    return litNodeClient;
  }

  console.log("🔌 Creating new Lit client...");
  
  // Dynamic import to load Lit SDK only when needed
  const { LitNodeClient } = await import("@lit-protocol/lit-node-client");
  
  const network = (process.env.LIT_NETWORK || "datil-dev") as LIT_NETWORKS_KEYS;
  console.log(`🔌 Lit network: ${network}`);
  
  litNodeClient = new LitNodeClient({
    litNetwork: network,
    debug: false,
  });

  console.log("🔌 Connecting to Lit network...");
  try {
    await litNodeClient.connect();
    console.log("✅ Connected to Lit network successfully");
  } catch (connectError: unknown) {
    const err = connectError as { message?: string; cause?: { code?: string; name?: string }; code?: string };
    console.error("❌ Failed to connect to Lit network:", err.message || connectError);
    if (err.cause) {
      console.error("❌ Cause:", JSON.stringify(err.cause, null, 2));
    }
    if (err.code) {
      console.error("❌ Error code:", err.code);
    }
    
    // Check if this is a connection timeout error
    const isTimeoutError = 
      err.cause?.code === "UND_ERR_CONNECT_TIMEOUT" ||
      err.cause?.name === "ConnectTimeoutError" ||
      err.message?.includes("fetch failed");
    
    if (isTimeoutError) {
      console.error("❌ Network connectivity issue detected. The Lit Protocol nodes may be unreachable.");
      console.error("❌ Possible causes:");
      console.error("   - Firewall blocking outbound connections to ports 7470-7472");
      console.error("   - ISP blocking connections to Lit validator IPs");
      console.error("   - VPN or proxy interfering with connections");
      console.error("❌ Try: Using a VPN, different network, or deploy to a cloud server.");
    }
    
    // Reset client on failure so next call tries again
    litNodeClient = null;
    throw new Error(
      isTimeoutError 
        ? "Unable to connect to Lit Protocol network. Please check your network connectivity or try using a VPN."
        : err.message || "Failed to connect to Lit network"
    );
  }
  
  return litNodeClient;
}

export async function disconnectLitClient(): Promise<void> {
  if (litNodeClient) {
    await litNodeClient.disconnect();
    litNodeClient = null;
  }
}
