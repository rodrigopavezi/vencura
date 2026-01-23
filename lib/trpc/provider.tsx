"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useState, createContext, useContext, useMemo, useEffect } from "react";
import superjson from "superjson";
import { trpc } from "./client";
import { getAuthToken } from "@dynamic-labs/sdk-react-core";

function getBaseUrl() {
  if (typeof window !== "undefined") return "";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

// Context to track when auth token is ready
interface AuthTokenContextValue {
  isTokenReady: boolean;
}

const AuthTokenContext = createContext<AuthTokenContextValue>({
  isTokenReady: false,
});

export function useAuthToken() {
  return useContext(AuthTokenContext);
}

interface TRPCProviderProps {
  children: React.ReactNode;
  authToken?: string | null;
}

// Use a module-level ref to store the current token
// This allows the headers function to access the latest token
// even though it's called outside the React component tree
let currentAuthToken: string | null = null;

export function TRPCProvider({ children, authToken }: TRPCProviderProps) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Retry failed queries a few times
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      },
    },
  }));

  // IMPORTANT: Update token synchronously during render, BEFORE children render
  // This ensures the token is available when queries start making requests
  // The useEffect below is kept for logging purposes only
  currentAuthToken = authToken ?? null;

  // Log token updates (for debugging)
  useEffect(() => {
    console.log("[TRPCProvider] Token updated:", currentAuthToken ? "present" : "null");
  }, [authToken]);
  
  // Create tRPC client that gets fresh token on each request
  const [trpcClient] = useState(() => 
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
          async headers() {
            // First try the module-level token (set by React component)
            // Then fall back to getAuthToken() from Dynamic SDK
            const moduleToken = currentAuthToken;
            const sdkToken = getAuthToken();
            const token = moduleToken || sdkToken;
            
            console.log("[TRPCProvider] headers() called:");
            console.log("  - moduleToken (currentAuthToken):", moduleToken ? `present (${moduleToken.substring(0, 20)}...)` : "null");
            console.log("  - sdkToken (getAuthToken()):", sdkToken ? `present (${sdkToken.substring(0, 20)}...)` : "null");
            console.log("  - using token:", token ? "yes" : "NO - request will be unauthorized!");
            
            if (token) {
              return {
                authorization: `Bearer ${token}`,
              };
            }
            console.warn("[TRPCProvider] WARNING: Making request without auth token!");
            return {};
          },
        }),
      ],
    })
  );

  // Token is ready when authToken prop is truthy
  const isTokenReady = !!authToken;

  const contextValue = useMemo<AuthTokenContextValue>(() => ({
    isTokenReady,
  }), [isTokenReady]);

  return (
    <AuthTokenContext.Provider value={contextValue}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </trpc.Provider>
    </AuthTokenContext.Provider>
  );
}
