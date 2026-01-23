"use client";

import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wallet, ArrowUpRight, ArrowDownLeft, Bell, Plus } from "lucide-react";
import Link from "next/link";

function WalletSummaryCard({ 
  title, 
  count, 
  icon: Icon 
}: { 
  title: string; 
  count: number; 
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{count}</div>
      </CardContent>
    </Card>
  );
}

function WalletCardPreview({ 
  wallet, 
  role 
}: { 
  wallet: { id: string; name: string; address: string }; 
  role: string;
}) {
  const roleColors: Record<string, string> = {
    OWNER: "bg-primary",
    VIEW_ONLY: "bg-blue-500",
    CO_SIGNER: "bg-yellow-500",
    FULL_ACCESS: "bg-green-500",
  };

  return (
    <Link href={`/dashboard/wallets/${wallet.id}`}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">{wallet.name}</p>
              <p className="text-sm text-muted-foreground">
                {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
              </p>
            </div>
          </div>
          <Badge className={roleColors[role] || "bg-gray-500"}>
            {role.replace("_", " ")}
          </Badge>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  const { data: wallets, isLoading: walletsLoading } = trpc.wallet.getAll.useQuery();
  const { data: invitations, isLoading: invitationsLoading } = trpc.walletAccess.listInvitations.useQuery({ type: "received" });

  const totalWallets = (wallets?.owned?.length || 0) + (wallets?.shared?.length || 0);
  const pendingInvitations = invitations?.length || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Overview of your MPC wallets and activity
          </p>
        </div>
        <Link href="/dashboard/wallets">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Wallet
          </Button>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {walletsLoading ? (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </>
        ) : (
          <>
            <WalletSummaryCard
              title="Total Wallets"
              count={totalWallets}
              icon={Wallet}
            />
            <WalletSummaryCard
              title="Owned Wallets"
              count={wallets?.owned?.length || 0}
              icon={ArrowUpRight}
            />
            <WalletSummaryCard
              title="Shared with Me"
              count={wallets?.shared?.length || 0}
              icon={ArrowDownLeft}
            />
            <WalletSummaryCard
              title="Pending Invitations"
              count={pendingInvitations}
              icon={Bell}
            />
          </>
        )}
      </div>

      {/* Pending Invitations Alert */}
      {pendingInvitations > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="font-medium">You have {pendingInvitations} pending invitation{pendingInvitations > 1 ? "s" : ""}</p>
                <p className="text-sm text-muted-foreground">
                  Someone wants to share wallet access with you
                </p>
              </div>
            </div>
            <Link href="/dashboard/sharing">
              <Button variant="outline" size="sm">
                View Invitations
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Recent Wallets */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>My Wallets</CardTitle>
            <CardDescription>Wallets you own</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {walletsLoading ? (
              <>
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </>
            ) : wallets?.owned?.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Wallet className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>No wallets yet</p>
                <Link href="/dashboard/wallets">
                  <Button variant="link" size="sm">
                    Create your first wallet
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {wallets?.owned?.slice(0, 3).map((wallet) => (
                  <WalletCardPreview key={wallet.id} wallet={wallet} role="OWNER" />
                ))}
              </div>
            )}
            {(wallets?.owned?.length || 0) > 3 && (
              <Link href="/dashboard/wallets">
                <Button variant="ghost" className="w-full">
                  View all wallets
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shared with Me</CardTitle>
            <CardDescription>Wallets others have shared with you</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {walletsLoading ? (
              <>
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </>
            ) : wallets?.shared?.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <ArrowDownLeft className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>No shared wallets</p>
                <p className="text-sm">When someone shares a wallet with you, it will appear here</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {wallets?.shared?.slice(0, 3).map((wallet) => (
                  <WalletCardPreview key={wallet.id} wallet={wallet} role={wallet.role} />
                ))}
              </div>
            )}
            {(wallets?.shared?.length || 0) > 3 && (
              <Link href="/dashboard/wallets">
                <Button variant="ghost" className="w-full">
                  View all shared wallets
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
