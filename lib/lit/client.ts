// Lit SDK v8 (Naga) client setup
// Uses createLitClient which handles connection automatically

import type { LitClient } from "@lit-protocol/lit-client";

let litClient: LitClient | null = null;

export async function getLitClient(): Promise<LitClient> {
  if (litClient) {
    console.log("🔌 Using existing Lit client connection");
    return litClient;
  }

  console.log("🔌 Creating new Lit client...");
  
  // Dynamic imports for v8 SDK
  const { createLitClient } = await import("@lit-protocol/lit-client");
  const { nagaDev } = await import("@lit-protocol/networks");
  
  const networkName = process.env.LIT_NETWORK || "naga-dev";
  console.log(`🔌 Lit network: ${networkName}`);
  
  console.log("🔌 Connecting to Lit network...");
  try {
    // In v8, createLitClient handles connection automatically
    litClient = await createLitClient({ 
      network: nagaDev,
    });
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
      console.error("   - Firewall blocking outbound connections to Lit validator ports");
      console.error("   - ISP blocking connections to Lit validator IPs");
      console.error("   - VPN or proxy interfering with connections");
      console.error("❌ Try: Using a VPN, different network, or deploy to a cloud server.");
    }
    
    // Reset client on failure so next call tries again
    litClient = null;
    throw new Error(
      isTimeoutError 
        ? "Unable to connect to Lit Protocol network. Please check your network connectivity or try using a VPN."
        : err.message || "Failed to connect to Lit network"
    );
  }
  
  return litClient;
}

export async function disconnectLitClient(): Promise<void> {
  if (litClient) {
    litClient.disconnect();
    litClient = null;
  }
}
