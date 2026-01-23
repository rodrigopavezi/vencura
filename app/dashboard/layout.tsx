"use client";

import { ReactNode, useState, useEffect } from "react";
import { DynamicContextProvider, useDynamicContext, getAuthToken } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { TRPCProvider } from "@/lib/trpc/provider";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { Toaster } from "@/components/ui/sonner";
import { useRouter } from "next/navigation";

function DashboardContent({ children }: { children: ReactNode }) {
  const { user, sdkHasLoaded } = useDynamicContext();
  const router = useRouter();
  const isAuthenticated = !!user;

  // Track token status: whether we've completed initial check and whether token is available
  const [tokenStatus, setTokenStatus] = useState<{
    checked: boolean;
    available: boolean;
  }>({ checked: false, available: false });

  // Get fresh token on each render (not stale cached value)
  const currentToken = getAuthToken() ?? null;

  useEffect(() => {
    if (sdkHasLoaded && !isAuthenticated) {
      router.push("/");
    }
  }, [sdkHasLoaded, isAuthenticated, router]);

  // Poll for token availability when authenticated but token not yet available
  useEffect(() => {
    if (!sdkHasLoaded || !isAuthenticated) {
      setTokenStatus({ checked: false, available: false });
      return;
    }

    // If we already have the token available, no need to poll
    if (tokenStatus.checked && tokenStatus.available) {
      return;
    }

    // Check if token is immediately available
    const token = getAuthToken();
    console.log("[Dashboard] Initial getAuthToken:", token ? `present (${token.substring(0, 20)}...)` : "no token");

    if (token) {
      setTokenStatus({ checked: true, available: true });
      return;
    }

    // Poll for token if not immediately available
    console.log("[Dashboard] Starting token polling...");
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const token = getAuthToken();
      if (token) {
        console.log(`[Dashboard] Token obtained after ${attempts} attempts`);
        setTokenStatus({ checked: true, available: true });
        clearInterval(interval);
      }
    }, 100);

    // Stop polling after 5 seconds
    const timeout = setTimeout(() => {
      clearInterval(interval);
      const finalToken = getAuthToken();
      setTokenStatus({ checked: true, available: !!finalToken });
      if (!finalToken) {
        console.warn("[Dashboard] Auth token not available after 5 seconds");
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [sdkHasLoaded, isAuthenticated, tokenStatus.checked, tokenStatus.available]);

  // Monitor for token becoming unavailable after initial availability
  // This handles token expiration or temporary unavailability
  useEffect(() => {
    if (!sdkHasLoaded || !isAuthenticated || !tokenStatus.checked || !tokenStatus.available) {
      return;
    }

    const monitorInterval = setInterval(() => {
      const token = getAuthToken();
      if (!token) {
        console.log("[Dashboard] Token became unavailable, will re-poll...");
        // Reset status to trigger re-polling via the first effect
        setTokenStatus({ checked: false, available: false });
      }
    }, 2000); // Check every 2 seconds

    return () => clearInterval(monitorInterval);
  }, [sdkHasLoaded, isAuthenticated, tokenStatus.checked, tokenStatus.available]);

  // Token is ready when we've checked and it's available (using fresh token from render)
  const isTokenReady = tokenStatus.checked && tokenStatus.available && !!currentToken;

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
    <TRPCProvider authToken={isTokenReady ? currentToken : null}>
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
        environmentId: process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID as string,
        walletConnectors: [EthereumWalletConnectors],
      }}
    >
      <DashboardContent>{children}</DashboardContent>
    </DynamicContextProvider>
  );
}