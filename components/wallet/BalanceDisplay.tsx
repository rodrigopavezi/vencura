"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Coins } from "lucide-react";

interface TokenBalance {
  contractAddress: string;
  symbol: string;
  name: string;
  balance: string;
  decimals: number;
}

interface BalanceDisplayProps {
  ethBalance?: {
    wei: string;
    ether: string;
  };
  tokenBalances?: TokenBalance[];
  isLoading?: boolean;
  onRefresh?: () => void;
}

function formatTokenBalance(balance: string, decimals: number): string {
  const value = BigInt(balance);
  const divisor = BigInt(10 ** decimals);
  const wholePart = value / divisor;
  const fractionalPart = value % divisor;
  const fractionalStr = fractionalPart.toString().padStart(decimals, "0").slice(0, 4);
  return `${wholePart}.${fractionalStr}`;
}

export function BalanceDisplay({
  ethBalance,
  tokenBalances,
  isLoading,
  onRefresh,
}: BalanceDisplayProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">Balance</CardTitle>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-6 w-24" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* ETH Balance */}
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">
                  {parseFloat(ethBalance?.ether || "0").toFixed(4)}
                </span>
                <span className="text-lg text-muted-foreground">ETH</span>
              </div>
            </div>

            {/* Token Balances */}
            {tokenBalances && tokenBalances.length > 0 && (
              <div className="space-y-2 border-t pt-4">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Coins className="h-4 w-4" />
                  Tokens
                </h4>
                <div className="space-y-2">
                  {tokenBalances.map((token) => (
                    <div
                      key={token.contractAddress}
                      className="flex items-center justify-between rounded-lg bg-muted/50 p-2"
                    >
                      <div>
                        <span className="font-medium">{token.symbol}</span>
                        <span className="text-sm text-muted-foreground ml-2">
                          {token.name}
                        </span>
                      </div>
                      <span className="font-mono">
                        {formatTokenBalance(token.balance, token.decimals)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!tokenBalances || tokenBalances.length === 0) && (
              <p className="text-sm text-muted-foreground border-t pt-4">
                No tokens found
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
