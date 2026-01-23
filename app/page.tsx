"use client";

import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { TRPCProvider } from "@/lib/trpc/provider";
import ConnectWithEmailView from "../components/ConnectWithEmailView";

// Get environment ID - use a fallback during build/SSR to prevent prerender errors
const dynamicEnvironmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || "build-placeholder";

export default function App() {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: dynamicEnvironmentId,
        walletConnectors: [EthereumWalletConnectors],
      }}
    >
      <TRPCProvider>
        <main className="min-h-screen flex items-center justify-center p-4">
          <ConnectWithEmailView />
        </main>
      </TRPCProvider>
    </DynamicContextProvider>
  );
}
