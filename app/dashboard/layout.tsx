"use client";

import { ReactNode } from "react";
import { DynamicContextProvider, useDynamicContext, getAuthToken } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { TRPCProvider } from "@/lib/trpc/provider";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { Toaster } from "@/components/ui/sonner";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Get environment ID - use a fallback during build/SSR to prevent prerender errors
const dynamicEnvironmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || "build-placeholder";

function DashboardContent({ children }: { children: ReactNode }) {
  const { user, sdkHasLoaded } = useDynamicContext();
  const router = useRouter();
  const isAuthenticated = !!user;
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [tokenCheckComplete, setTokenCheckComplete] = useState(false);

  // Get auth token when user is authenticated
  useEffect(() => {
    if (sdkHasLoaded && isAuthenticated) {
      // Try to get the token immediately
      const token = getAuthToken();
      console.log("[Dashboard] Initial getAuthToken:", token ? "token present" : "no token");
      
      if (token) {
        setAuthToken(token);
        setTokenCheckComplete(true);
      } else {
        // Poll for token if not immediately available
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          const token = getAuthToken();
          if (token) {
            console.log(`[Dashboard] Token obtained after ${attempts} attempts`);
            setAuthToken(token);
            setTokenCheckComplete(true);
            clearInterval(interval);
          }
        }, 100);

        // Mark as complete after 5 seconds even if no token (let queries fail gracefully)
        const timeout = setTimeout(() => {
          clearInterval(interval);
          setTokenCheckComplete(true);
          console.warn(`[Dashboard] Auth token not available after 5 seconds (${attempts} attempts). User email: ${user?.email}`);
        }, 5000);

        return () => {
          clearInterval(interval);
          clearTimeout(timeout);
        };
      }
    } else {
      setAuthToken(null);
      setTokenCheckComplete(false);
    }
  }, [sdkHasLoaded, isAuthenticated, user?.email]);

  useEffect(() => {
    if (sdkHasLoaded && !isAuthenticated) {
      router.push("/");
    }
  }, [sdkHasLoaded, isAuthenticated, router]);

  // Show loading state while SDK is loading, user is not authenticated, or token check is pending
  if (!sdkHasLoaded || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">
          {!sdkHasLoaded ? "Loading..." : "Redirecting..."}
        </div>
      </div>
    );
  }

  // Wait for token check to complete before rendering dashboard
  if (!tokenCheckComplete) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">
          Initializing...
        </div>
      </div>
    );
  }

  return (
    <TRPCProvider authToken={authToken}>
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
