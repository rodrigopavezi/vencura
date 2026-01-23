"use client";

import { use } from "react";
import { trpc } from "@/lib/trpc/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { BalanceDisplay } from "@/components/wallet/BalanceDisplay";
import { TransactionHistory } from "@/components/wallet/TransactionHistory";
import { SendTransactionForm } from "@/components/wallet/SendTransactionForm";
import { SignMessageForm } from "@/components/wallet/SignMessageForm";
import { PendingProposals } from "@/components/wallet/PendingProposals";
import { AccessList } from "@/components/sharing/AccessList";
import { InviteUserDialog } from "@/components/sharing/InviteUserDialog";
import { ArrowLeft, Copy, ExternalLink, Wallet } from "lucide-react";
import { toast } from "sonner";

interface WalletDetailPageProps {
  params: Promise<{ id: string }>;
}

const roleConfig: Record<string, { label: string; color: string }> = {
  OWNER: { label: "Owner", color: "bg-primary text-primary-foreground" },
  VIEW_ONLY: { label: "View Only", color: "bg-blue-500 text-white" },
  CO_SIGNER: { label: "Co-signer", color: "bg-yellow-500 text-white" },
  FULL_ACCESS: { label: "Full Access", color: "bg-green-500 text-white" },
};

export default function WalletDetailPage({ params }: WalletDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") || "overview";

  const { data: wallet, isLoading: walletLoading } = trpc.wallet.getById.useQuery({ id });
  const { data: balance, isLoading: balanceLoading, refetch: refetchBalance } = trpc.wallet.getBalance.useQuery({ id });
  const { data: transactions, isLoading: txLoading } = trpc.wallet.getTransactions.useQuery({ walletId: id });
  const { data: pendingCount } = trpc.transactionProposal.getPendingCount.useQuery({ walletId: id });

  const copyAddress = () => {
    if (wallet?.address) {
      navigator.clipboard.writeText(wallet.address);
      toast.success("Address copied to clipboard");
    }
  };

  const openExplorer = () => {
    if (wallet?.address) {
      window.open(`https://sepolia.etherscan.io/address/${wallet.address}`, "_blank");
    }
  };

  if (walletLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h2 className="text-xl font-semibold">Wallet not found</h2>
        <p className="text-muted-foreground mb-4">
          The wallet you're looking for doesn't exist or you don't have access.
        </p>
        <Button onClick={() => router.push("/dashboard/wallets")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Wallets
        </Button>
      </div>
    );
  }

  const config = roleConfig[wallet.role] || roleConfig.VIEW_ONLY;
  const canSign = wallet.role === "OWNER" || wallet.role === "FULL_ACCESS";
  const canPropose = wallet.role === "CO_SIGNER";
  const isOwner = wallet.role === "OWNER";
  const showProposalsTab = isOwner || canPropose;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/wallets")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Wallet className="h-7 w-7 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">{wallet.name}</h2>
              <Badge className={config.color}>{config.label}</Badge>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="font-mono">
                {wallet.address.slice(0, 10)}...{wallet.address.slice(-8)}
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyAddress}>
                <Copy className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={openExplorer}>
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <SignMessageForm walletId={id} disabled={!canSign} />
          <SendTransactionForm 
            walletId={id} 
            disabled={!canSign && !canPropose}
            role={wallet.role}
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          {showProposalsTab && (
            <TabsTrigger value="proposals" className="relative">
              Proposals
              {pendingCount && pendingCount.count > 0 && (
                <Badge 
                  variant="secondary" 
                  className="ml-2 h-5 min-w-5 px-1.5 bg-yellow-100 text-yellow-800"
                >
                  {pendingCount.count}
                </Badge>
              )}
            </TabsTrigger>
          )}
          {isOwner && <TabsTrigger value="sharing">Sharing</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <BalanceDisplay
              ethBalance={balance?.eth}
              tokenBalances={balance?.tokens}
              isLoading={balanceLoading}
              onRefresh={() => refetchBalance()}
            />
            <TransactionHistory
              transactions={transactions?.slice(0, 5)}
              walletAddress={wallet.address}
              isLoading={txLoading}
            />
          </div>
        </TabsContent>

        <TabsContent value="transactions">
          <TransactionHistory
            transactions={transactions}
            walletAddress={wallet.address}
            isLoading={txLoading}
          />
        </TabsContent>

        {showProposalsTab && (
          <TabsContent value="proposals">
            <PendingProposals walletId={id} isOwner={isOwner} />
          </TabsContent>
        )}

        {isOwner && (
          <TabsContent value="sharing" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Wallet Access</h3>
                <p className="text-sm text-muted-foreground">
                  Manage who has access to this wallet
                </p>
              </div>
              <InviteUserDialog walletId={id} />
            </div>
            <AccessList walletId={id} isOwner={isOwner} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
