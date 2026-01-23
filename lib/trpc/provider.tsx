"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useState, createContext, useContext, useMemo } from "react";
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
  
  // Create tRPC client that gets fresh token on each request
  const [trpcClient] = useState(() => 
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
          async headers() {
            // Get fresh token on each request using Dynamic SDK's getAuthToken
            // This always returns the latest token from the SDK's internal state
            const token = getAuthToken();
            if (token) {
              return {
                authorization: `Bearer ${token}`,
              };
            }
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
