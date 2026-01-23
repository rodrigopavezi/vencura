"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ExternalLink, ArrowUpRight, ArrowDownLeft } from "lucide-react";

interface Transaction {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  timestamp: number;
  blockNumber: number;
  status: "success" | "failed" | "pending";
}

interface TransactionHistoryProps {
  transactions?: Transaction[];
  walletAddress: string;
  isLoading?: boolean;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

const statusColors: Record<string, string> = {
  success: "bg-green-500",
  failed: "bg-red-500",
  pending: "bg-yellow-500",
};

export function TransactionHistory({
  transactions,
  walletAddress,
  isLoading,
}: TransactionHistoryProps) {
  const openExplorer = (hash: string) => {
    window.open(`https://sepolia.etherscan.io/tx/${hash}`, "_blank");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Recent Transactions</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : !transactions || transactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No transactions yet</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {transactions.map((tx) => {
                const isSent = tx.from.toLowerCase() === walletAddress.toLowerCase();
                return (
                  <div
                    key={tx.hash}
                    className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full ${
                          isSent ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"
                        }`}
                      >
                        {isSent ? (
                          <ArrowUpRight className="h-5 w-5" />
                        ) : (
                          <ArrowDownLeft className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {isSent ? "Sent" : "Received"}
                          </span>
                          <Badge
                            variant="secondary"
                            className={`${statusColors[tx.status]} text-white text-xs`}
                          >
                            {tx.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {isSent ? "To: " : "From: "}
                          <span className="font-mono">
                            {truncateAddress(isSent ? (tx.to || "Contract") : tx.from)}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(tx.timestamp)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={`font-medium ${isSent ? "text-red-600" : "text-green-600"}`}>
                          {isSent ? "-" : "+"}
                          {parseFloat(tx.value).toFixed(4)} ETH
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openExplorer(tx.hash)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
