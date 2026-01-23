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
  // Track the authentication state and the confirmed token
  const [authState, setAuthState] = useState<{ 
    sdkLoaded: boolean; 
    authenticated: boolean; 
    token: string | null;
  } | null>(null);

  // Poll for auth token availability when user is authenticated
  useEffect(() => {
    if (!sdkHasLoaded || !isAuthenticated) {
      return;
    }

    // Check if token is already available
    const token = getAuthToken();
    console.log("[Dashboard] Initial getAuthToken:", token ? `present (${token.substring(0, 20)}...)` : "no token");
    
    if (token) {
      // Use setTimeout to avoid synchronous setState in effect
      const timeoutId = setTimeout(() => {
        setAuthState({ sdkLoaded: sdkHasLoaded, authenticated: isAuthenticated, token });
      }, 0);
      return () => clearTimeout(timeoutId);
    }

    // Poll for token if not immediately available
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const token = getAuthToken();
      if (token) {
        console.log(`[Dashboard] Token obtained after ${attempts} attempts: ${token.substring(0, 20)}...`);
        setAuthState({ sdkLoaded: sdkHasLoaded, authenticated: isAuthenticated, token });
        clearInterval(interval);
      }
    }, 100);

    // Mark as complete after 5 seconds even if no token (let queries fail gracefully)
    const timeout = setTimeout(() => {
      clearInterval(interval);
      const finalToken = getAuthToken() ?? null;
      setAuthState({ sdkLoaded: sdkHasLoaded, authenticated: isAuthenticated, token: finalToken });
      if (!finalToken) {
        console.warn(`[Dashboard] Auth token not available after 5 seconds (${attempts} attempts). User email: ${user?.email}`);
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [sdkHasLoaded, isAuthenticated, user?.email]);

  // Token check is complete if we've checked for the current auth state and have a token
  const tokenCheckComplete = authState?.sdkLoaded === sdkHasLoaded && 
                              authState?.authenticated === isAuthenticated &&
                              isAuthenticated &&
                              !!authState?.token;
  
  // Use the stored token from the auth state
  const currentToken = authState?.token ?? null;

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
    console.log("[DashboardLayout] Waiting for token...", {
      sdkHasLoaded,
      isAuthenticated,
      authState,
      tokenCheckComplete,
    });
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">
          Initializing...
        </div>
      </div>
    );
  }

  console.log("[DashboardLayout] Token ready, rendering TRPCProvider with token:", currentToken ? `present (${currentToken.substring(0, 20)}...)` : "null");
  
  return (
    <TRPCProvider authToken={tokenCheckComplete ? currentToken : null}>
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
