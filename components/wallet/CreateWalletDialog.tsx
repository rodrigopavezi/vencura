"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";

interface CreateWalletDialogProps {
  onSuccess?: () => void;
}

export function CreateWalletDialog({ onSuccess }: CreateWalletDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const utils = trpc.useUtils();

  const createWallet = trpc.wallet.create.useMutation({
    onSuccess: () => {
      toast.success("Wallet created successfully!");
      utils.wallet.getAll.invalidate();
      setOpen(false);
      setName("");
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create wallet");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter a wallet name");
      return;
    }

    createWallet.mutate({
      name: name.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Wallet
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Wallet</DialogTitle>
            <DialogDescription>
              Create a new MPC wallet. Your wallet key will be securely split between you and our servers.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Wallet Name</Label>
              <Input
                id="name"
                placeholder="e.g., Personal Savings"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={createWallet.isPending}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={createWallet.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createWallet.isPending}>
              {createWallet.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create Wallet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
