"use client";

import { ReactNode } from "react";
import { DynamicContextProvider, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { TRPCProvider } from "@/lib/trpc/provider";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { Toaster } from "@/components/ui/sonner";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Get environment ID - use a fallback during build/SSR to prevent prerender errors
const dynamicEnvironmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || "build-placeholder";

function DashboardContent({ children }: { children: ReactNode }) {
  const { user, sdkHasLoaded } = useDynamicContext();
  const router = useRouter();
  const isAuthenticated = !!user;

  useEffect(() => {
    if (sdkHasLoaded && !isAuthenticated) {
      router.push("/");
    }
  }, [sdkHasLoaded, isAuthenticated, router]);

  // Show loading state while SDK is loading or user is not authenticated
  // This prevents auth-dependent components from rendering during logout
  if (!sdkHasLoaded || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">
          {!sdkHasLoaded ? "Loading..." : "Redirecting..."}
        </div>
      </div>
    );
  }

  return (
    <TRPCProvider>
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
        <Toaster />
      </div>
    </TRPCProvider>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: dynamicEnvironmentId,
        walletConnectors: [EthereumWalletConnectors],
      }}
    >
      <DashboardContent>{children}</DashboardContent>
    </DynamicContextProvider>
  );
}
