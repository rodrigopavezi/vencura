"use client";

import { trpc } from "@/lib/trpc/client";
import { useAuthToken } from "@/lib/trpc/provider";
import { WalletCard } from "@/components/wallet/WalletCard";
import { CreateWalletDialog } from "@/components/wallet/CreateWalletDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, ArrowDownLeft } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

export default function WalletsPage() {
  const { isTokenReady } = useAuthToken();
  const { data: wallets, isLoading } = trpc.wallet.getAll.useQuery(undefined, {
    enabled: isTokenReady,
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [walletToDelete, setWalletToDelete] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const deleteWallet = trpc.wallet.delete.useMutation({
    onSuccess: () => {
      toast.success("Wallet deleted successfully");
      utils.wallet.getAll.invalidate();
      setDeleteDialogOpen(false);
      setWalletToDelete(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete wallet");
    },
  });

  const handleDelete = (id: string) => {
    setWalletToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (walletToDelete) {
      deleteWallet.mutate({ id: walletToDelete });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Wallets</h2>
          <p className="text-muted-foreground">
            Manage your MPC wallets and shared access
          </p>
        </div>
        <CreateWalletDialog />
      </div>

      <Tabs defaultValue="owned" className="space-y-4">
        <TabsList>
          <TabsTrigger value="owned" className="gap-2">
            <Wallet className="h-4 w-4" />
            My Wallets
            {wallets?.owned && (
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                {wallets.owned.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="shared" className="gap-2">
            <ArrowDownLeft className="h-4 w-4" />
            Shared with Me
            {wallets?.shared && (
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                {wallets.shared.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="owned" className="space-y-4">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-40" />
              <Skeleton className="h-40" />
              <Skeleton className="h-40" />
            </div>
          ) : wallets?.owned?.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
              <Wallet className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold">No wallets yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first MPC wallet to get started
              </p>
              <CreateWalletDialog />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {wallets?.owned?.map((wallet) => (
                <WalletCard
                  key={wallet.id}
                  wallet={wallet}
                  role="OWNER"
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="shared" className="space-y-4">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-40" />
              <Skeleton className="h-40" />
            </div>
          ) : wallets?.shared?.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
              <ArrowDownLeft className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold">No shared wallets</h3>
              <p className="text-muted-foreground">
                When someone shares a wallet with you, it will appear here
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {wallets?.shared?.map((wallet) => (
                <WalletCard
                  key={wallet.id}
                  wallet={wallet}
                  role={wallet.role as "VIEW_ONLY" | "CO_SIGNER" | "FULL_ACCESS"}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Wallet</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this wallet? This action cannot be undone.
              All shared access will also be revoked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
