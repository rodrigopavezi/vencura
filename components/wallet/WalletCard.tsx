"use client";

import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Wallet, MoreVertical, Copy, ExternalLink, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface WalletCardProps {
  wallet: {
    id: string;
    name: string;
    address: string;
  };
  role: "OWNER" | "VIEW_ONLY" | "CO_SIGNER" | "FULL_ACCESS";
  onDelete?: (id: string) => void;
}

const roleConfig: Record<string, { label: string; color: string }> = {
  OWNER: { label: "Owner", color: "bg-primary text-primary-foreground" },
  VIEW_ONLY: { label: "View Only", color: "bg-blue-500 text-white" },
  CO_SIGNER: { label: "Co-signer", color: "bg-yellow-500 text-white" },
  FULL_ACCESS: { label: "Full Access", color: "bg-green-500 text-white" },
};

export function WalletCard({ wallet, role, onDelete }: WalletCardProps) {
  const config = roleConfig[role] || roleConfig.VIEW_ONLY;

  const copyAddress = () => {
    navigator.clipboard.writeText(wallet.address);
    toast.success("Address copied to clipboard");
  };

  const openExplorer = () => {
    window.open(`https://sepolia.etherscan.io/address/${wallet.address}`, "_blank");
  };

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Wallet className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{wallet.name}</h3>
              <p className="text-sm text-muted-foreground font-mono">
                {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={config.color}>{config.label}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={copyAddress}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Address
                </DropdownMenuItem>
                <DropdownMenuItem onClick={openExplorer}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View on Explorer
                </DropdownMenuItem>
                {role === "OWNER" && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/wallets/${wallet.id}?tab=sharing`}>
                        <Users className="mr-2 h-4 w-4" />
                        Manage Access
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete?.(wallet.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Wallet
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-0">
        <Link href={`/dashboard/wallets/${wallet.id}`} className="w-full">
          <Button variant="outline" className="w-full">
            View Details
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
