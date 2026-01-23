"use client";

import { use, useState, useEffect } from "react";
import { DynamicContextProvider, useDynamicContext, getAuthToken } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { trpc } from "@/lib/trpc/client";
import { TRPCProvider, useAuthToken } from "@/lib/trpc/provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, Check, X, LogIn, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useRouter } from "next/navigation";

// Get environment ID - use a fallback during build/SSR to prevent prerender errors
const dynamicEnvironmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || "build-placeholder";

interface InvitePageProps {
  params: Promise<{ id: string }>;
}

const roleDescriptions: Record<string, string> = {
  VIEW_ONLY: "View wallet balance and transaction history",
  CO_SIGNER: "Co-sign transactions (requires owner approval)",
  FULL_ACCESS: "Full access to sign and send transactions",
};

const roleColors: Record<string, string> = {
  VIEW_ONLY: "bg-blue-500 text-white",
  CO_SIGNER: "bg-yellow-500 text-white",
  FULL_ACCESS: "bg-green-500 text-white",
};

function InviteContentInner({ invitationId }: { invitationId: string }) {
  const { user, sdkHasLoaded, setShowAuthFlow } = useDynamicContext();
  const { isTokenReady } = useAuthToken();
  const isAuthenticated = !!user;
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);

  const { data: invitation, isLoading, error } = trpc.walletAccess.getInvitation.useQuery(
    { id: invitationId },
    { enabled: isAuthenticated && isTokenReady }
  );

  const acceptInvitation = trpc.walletAccess.acceptInvitation.useMutation({
    onSuccess: () => {
      setAccepted(true);
      toast.success("Invitation accepted! Redirecting to dashboard...");
      setTimeout(() => {
        router.push("/dashboard/wallets");
      }, 2000);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to accept invitation");
    },
  });

  const rejectInvitation = trpc.walletAccess.rejectInvitation.useMutation({
    onSuccess: () => {
      toast.success("Invitation rejected");
      router.push("/");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to reject invitation");
    },
  });

  if (!sdkHasLoaded) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <Skeleton className="h-12 w-12 rounded-full mx-auto" />
            <Skeleton className="h-6 w-48 mx-auto" />
            <Skeleton className="h-4 w-64 mx-auto" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isAuthenticated) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mx-auto mb-4">
            <Wallet className="h-8 w-8 text-primary" />
          </div>
          <CardTitle>Wallet Invitation</CardTitle>
          <CardDescription>
            You have been invited to access a wallet. Sign in to view and accept the invitation.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button className="w-full" onClick={() => setShowAuthFlow(true)}>
            <LogIn className="mr-2 h-4 w-4" />
            Sign In to Continue
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <Skeleton className="h-12 w-12 rounded-full mx-auto" />
            <Skeleton className="h-6 w-48 mx-auto" />
            <Skeleton className="h-4 w-64 mx-auto" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !invitation) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle>Invitation Not Found</CardTitle>
          <CardDescription>
            This invitation may have expired, been revoked, or does not exist.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button className="w-full" variant="outline" onClick={() => router.push("/")}>
            Go Home
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (invitation.status !== "PENDING") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto mb-4">
            <Wallet className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle>Invitation {invitation.status.toLowerCase()}</CardTitle>
          <CardDescription>
            This invitation has already been {invitation.status.toLowerCase()}.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button className="w-full" onClick={() => router.push("/dashboard")}>
            Go to Dashboard
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (accepted) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 mx-auto mb-4">
            <Check className="h-8 w-8 text-green-500" />
          </div>
          <CardTitle>Invitation Accepted!</CardTitle>
          <CardDescription>
            You now have access to the wallet. Redirecting to dashboard...
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mx-auto mb-4">
          <Wallet className="h-8 w-8 text-primary" />
        </div>
        <CardTitle>Wallet Invitation</CardTitle>
        <CardDescription>
          {invitation.inviter.name || invitation.inviter.email} has invited you to access their wallet
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Wallet</span>
            <span className="font-medium">{invitation.wallet.name}</span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Address</span>
            <span className="font-mono text-sm">
              {invitation.wallet.address.slice(0, 6)}...{invitation.wallet.address.slice(-4)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Access Level</span>
            <Badge className={roleColors[invitation.role]}>
              {invitation.role.replace("_", " ")}
            </Badge>
          </div>
        </div>
        <p className="text-sm text-muted-foreground text-center">
          {roleDescriptions[invitation.role]}
        </p>
      </CardContent>
      <CardFooter className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => rejectInvitation.mutate({ invitationId })}
          disabled={acceptInvitation.isPending || rejectInvitation.isPending}
        >
          <X className="mr-2 h-4 w-4" />
          Reject
        </Button>
        <Button
          className="flex-1"
          onClick={() => acceptInvitation.mutate({ invitationId })}
          disabled={acceptInvitation.isPending || rejectInvitation.isPending}
        >
          <Check className="mr-2 h-4 w-4" />
          Accept
        </Button>
      </CardFooter>
    </Card>
  );
}

function InviteContent({ invitationId }: { invitationId: string }) {
  const { user, sdkHasLoaded } = useDynamicContext();
  const isAuthenticated = !!user;
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Get auth token when user is authenticated
  useEffect(() => {
    if (sdkHasLoaded && isAuthenticated) {
      // Try to get the token immediately
      const token = getAuthToken();
      if (token) {
        setAuthToken(token);
      } else {
        // Poll for token if not immediately available
        const interval = setInterval(() => {
          const token = getAuthToken();
          if (token) {
            setAuthToken(token);
            clearInterval(interval);
          }
        }, 100);

        // Cleanup after 5 seconds
        const timeout = setTimeout(() => {
          clearInterval(interval);
        }, 5000);

        return () => {
          clearInterval(interval);
          clearTimeout(timeout);
        };
      }
    } else {
      setAuthToken(null);
    }
  }, [sdkHasLoaded, isAuthenticated]);

  return (
    <TRPCProvider authToken={authToken}>
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <InviteContentInner invitationId={invitationId} />
      </div>
      <Toaster />
    </TRPCProvider>
  );
}

export default function InvitePage({ params }: InvitePageProps) {
  const { id } = use(params);

  return (
    <DynamicContextProvider
      settings={{
        environmentId: dynamicEnvironmentId,
        walletConnectors: [EthereumWalletConnectors],
      }}
    >
      <InviteContent invitationId={id} />
    </DynamicContextProvider>
  );
}
