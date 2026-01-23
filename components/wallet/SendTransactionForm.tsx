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
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { Send, Loader2, AlertCircle, Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SendTransactionFormProps {
  walletId: string;
  disabled?: boolean;
  role?: "OWNER" | "VIEW_ONLY" | "CO_SIGNER" | "FULL_ACCESS";
}

export function SendTransactionForm({ walletId, disabled, role }: SendTransactionFormProps) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [value, setValue] = useState("");
  const [data, setData] = useState("");
  const [reason, setReason] = useState("");

  const utils = trpc.useUtils();
  const isCoSigner = role === "CO_SIGNER";

  const sendTransaction = trpc.wallet.sendTransaction.useMutation({
    onSuccess: (result) => {
      toast.success(`Transaction sent! Hash: ${result.hash.slice(0, 10)}...`);
      utils.wallet.getTransactions.invalidate({ walletId });
      utils.wallet.getBalance.invalidate({ id: walletId });
      setOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to send transaction");
    },
  });

  const proposeTransaction = trpc.transactionProposal.propose.useMutation({
    onSuccess: () => {
      toast.success("Transaction proposal submitted! Waiting for owner approval.");
      utils.transactionProposal.list.invalidate({ walletId });
      utils.transactionProposal.getPendingCount.invalidate({ walletId });
      setOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to submit proposal");
    },
  });

  const isPending = sendTransaction.isPending || proposeTransaction.isPending;

  const resetForm = () => {
    setTo("");
    setValue("");
    setData("");
    setReason("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!to.trim()) {
      toast.error("Please enter a recipient address");
      return;
    }

    if (!value.trim() || parseFloat(value) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (isCoSigner) {
      proposeTransaction.mutate({
        walletId,
        to: to.trim(),
        value: value.trim(),
        data: data.trim() || undefined,
        reason: reason.trim() || undefined,
      });
    } else {
      sendTransaction.mutate({
        walletId,
        to: to.trim(),
        value: value.trim(),
        data: data.trim() || undefined,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled} variant={isCoSigner ? "secondary" : "default"}>
          {isCoSigner ? (
            <Clock className="mr-2 h-4 w-4" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          {isCoSigner ? "Propose" : "Send"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isCoSigner ? "Propose Transaction" : "Send Transaction"}
            </DialogTitle>
            <DialogDescription>
              {isCoSigner
                ? "Submit a transaction proposal for the wallet owner to review and approve."
                : "Send ETH to another address. Make sure the recipient address is correct."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="to">Recipient Address</Label>
              <Input
                id="to"
                placeholder="0x..."
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={isPending}
                className="font-mono"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="value">Amount (ETH)</Label>
              <Input
                id="value"
                type="number"
                step="0.0001"
                min="0"
                placeholder="0.0"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="data">Data (Optional)</Label>
              <Input
                id="data"
                placeholder="0x..."
                value={data}
                onChange={(e) => setData(e.target.value)}
                disabled={isPending}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Optional hex data for contract interactions
              </p>
            </div>

            {isCoSigner && (
              <div className="grid gap-2">
                <Label htmlFor="reason">Reason (Optional)</Label>
                <Textarea
                  id="reason"
                  placeholder="Explain why this transaction is needed..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={isPending}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Help the owner understand why you are requesting this transaction
                </p>
              </div>
            )}

            <Alert variant={isCoSigner ? "default" : undefined}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {isCoSigner
                  ? "This proposal will be sent to the wallet owner for approval. The transaction will only be executed after approval."
                  : "Double-check the recipient address. Transactions cannot be reversed."}
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isCoSigner ? "Submit Proposal" : "Send Transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
