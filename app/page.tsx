"use client";

import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { TRPCProvider } from "@/lib/trpc/provider";
import ConnectWithEmailView from "../components/ConnectWithEmailView";

export default function App() {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID as string,
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
