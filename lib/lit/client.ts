// Using dynamic import to avoid loading Lit SDK at module initialization time
// This prevents the deprecation warning from appearing on every API request

let litNodeClient: any = null;

export async function getLitClient(): Promise<any> {
  if (litNodeClient) {
    return litNodeClient;
  }

  // Dynamic import to load Lit SDK only when needed
  const { LitNodeClient } = await import("@lit-protocol/lit-node-client");
  
  const network = process.env.LIT_NETWORK || "datil-dev";
  
  litNodeClient = new LitNodeClient({
    litNetwork: network as any,
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
