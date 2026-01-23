// Using dynamic import to avoid loading Lit SDK at module initialization time
// This prevents the deprecation warning from appearing on every API request

import type { LitNodeClient as LitNodeClientType } from "@lit-protocol/lit-node-client";
import type { LIT_NETWORKS_KEYS } from "@lit-protocol/types";

let litNodeClient: LitNodeClientType | null = null;

export async function getLitClient(): Promise<LitNodeClientType> {
  if (litNodeClient) {
    return litNodeClient;
  }

  // Dynamic import to load Lit SDK only when needed
  const { LitNodeClient } = await import("@lit-protocol/lit-node-client");
  
  const network = (process.env.LIT_NETWORK || "datil-dev") as LIT_NETWORKS_KEYS;
  
  litNodeClient = new LitNodeClient({
    litNetwork: network,
    debug: false,
  });

  await litNodeClient.connect();
  
  return litNodeClient;
}

export async function disconnectLitClient(): Promise<void> {
  if (litNodeClient) {
    await litNodeClient.disconnect();
    litNodeClient = null;
  }
}
