"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthToken } from "@/lib/trpc/provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "sonner";
import { 
  Check, 
  X, 
  Clock, 
  ExternalLink, 
  AlertCircle,
  Loader2,
  User,
  ArrowRight
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface PendingProposalsProps {
  walletId: string;
  isOwner: boolean;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: { label: "Pending", color: "bg-yellow-500 text-white", icon: <Clock className="h-3 w-3" /> },
  APPROVED: { label: "Approved", color: "bg-blue-500 text-white", icon: <Check className="h-3 w-3" /> },
  EXECUTED: { label: "Executed", color: "bg-green-500 text-white", icon: <Check className="h-3 w-3" /> },
  REJECTED: { label: "Rejected", color: "bg-red-500 text-white", icon: <X className="h-3 w-3" /> },
  EXPIRED: { label: "Expired", color: "bg-gray-500 text-white", icon: <AlertCircle className="h-3 w-3" /> },
};

export function PendingProposals({ walletId, isOwner }: PendingProposalsProps) {
  const [selectedProposal, setSelectedProposal] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);

  const utils = trpc.useUtils();
  const { isTokenReady } = useAuthToken();

  const { data: proposals, isLoading } = trpc.transactionProposal.list.useQuery({
    walletId,
    limit: 50,
  }, {
    enabled: isTokenReady,
  });

  const approveMutation = trpc.transactionProposal.approve.useMutation({
    onSuccess: (result) => {
      toast.success(`Transaction approved and executed! Hash: ${result.txHash?.slice(0, 10)}...`);
      utils.transactionProposal.list.invalidate({ walletId });
      utils.transactionProposal.getPendingCount.invalidate({ walletId });
      utils.wallet.getBalance.invalidate({ id: walletId });
      utils.wallet.getTransactions.invalidate({ walletId });
      setSelectedProposal(null);
      setActionType(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to approve proposal");
      setSelectedProposal(null);
      setActionType(null);
    },
  });

  const rejectMutation = trpc.transactionProposal.reject.useMutation({
    onSuccess: () => {
      toast.success("Proposal rejected");
      utils.transactionProposal.list.invalidate({ walletId });
      utils.transactionProposal.getPendingCount.invalidate({ walletId });
      setSelectedProposal(null);
      setActionType(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to reject proposal");
      setSelectedProposal(null);
      setActionType(null);
    },
  });

  const cancelMutation = trpc.transactionProposal.cancel.useMutation({
    onSuccess: () => {
      toast.success("Proposal cancelled");
      utils.transactionProposal.list.invalidate({ walletId });
      utils.transactionProposal.getPendingCount.invalidate({ walletId });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to cancel proposal");
    },
  });

  const isPending = approveMutation.isPending || rejectMutation.isPending;

  const handleAction = (proposalId: string, action: "approve" | "reject") => {
    setSelectedProposal(proposalId);
    setActionType(action);
  };

  const confirmAction = () => {
    if (!selectedProposal || !actionType) return;

    if (actionType === "approve") {
      approveMutation.mutate({ proposalId: selectedProposal });
    } else {
      rejectMutation.mutate({ proposalId: selectedProposal });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Transaction Proposals</CardTitle>
          <CardDescription>Loading proposals...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const pendingProposals = proposals?.filter(p => p.status === "PENDING" && !p.isExpired) || [];
  const otherProposals = proposals?.filter(p => p.status !== "PENDING" || p.isExpired) || [];

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Transaction Proposals
                {pendingProposals.length > 0 && (
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                    {pendingProposals.length} pending
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {isOwner
                  ? "Review and approve transaction proposals from co-signers"
                  : "Your transaction proposals and their status"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {proposals?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No transaction proposals yet</p>
              {!isOwner && (
                <p className="text-sm mt-2">
                  Use the &quot;Propose&quot; button to submit a transaction for owner approval
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Pending proposals first */}
              {pendingProposals.map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  isOwner={isOwner}
                  onApprove={() => handleAction(proposal.id, "approve")}
                  onReject={() => handleAction(proposal.id, "reject")}
                  onCancel={() => cancelMutation.mutate({ proposalId: proposal.id })}
                  isCancelling={cancelMutation.isPending}
                  isProcessing={isPending && selectedProposal === proposal.id}
                  processingAction={selectedProposal === proposal.id ? actionType : null}
                />
              ))}

              {/* Divider if both sections have items */}
              {pendingProposals.length > 0 && otherProposals.length > 0 && (
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      History
                    </span>
                  </div>
                </div>
              )}

              {/* Other proposals */}
              {otherProposals.map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  isOwner={isOwner}
                  isHistorical
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!selectedProposal && !!actionType} onOpenChange={() => {
        if (!isPending) {
          setSelectedProposal(null);
          setActionType(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === "approve" ? "Approve and Execute Transaction?" : "Reject Proposal?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === "approve"
                ? "This will sign and broadcast the transaction to the network. This action cannot be undone."
                : "This will reject the proposal. The co-signer will be notified."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmAction();
              }}
              disabled={isPending}
              className={actionType === "reject" ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {actionType === "approve" ? "Approve & Execute" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface ProposalCardProps {
  proposal: {
    id: string;
    to: string;
    value: string;
    data?: string | null;
    reason?: string | null;
    status: string;
    txHash?: string | null;
    createdAt: Date;
    expiresAt: Date;
    isExpired?: boolean;
    proposer: { id: string; email: string; name?: string | null };
    reviewer?: { id: string; email: string; name?: string | null } | null;
    reviewedAt?: Date | null;
  };
  isOwner: boolean;
  isHistorical?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onCancel?: () => void;
  isCancelling?: boolean;
  isProcessing?: boolean;
  processingAction?: "approve" | "reject" | null;
}

function ProposalCard({
  proposal,
  isOwner,
  isHistorical,
  onApprove,
  onReject,
  onCancel,
  isCancelling,
  isProcessing,
  processingAction,
}: ProposalCardProps) {
  const status = proposal.isExpired ? "EXPIRED" : proposal.status;
  const config = statusConfig[status] || statusConfig.PENDING;

  return (
    <div className={`border rounded-lg p-4 ${isHistorical ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Header with status */}
          <div className="flex items-center gap-2 mb-2">
            <Badge className={`${config.color} flex items-center gap-1`}>
              {config.icon}
              {config.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(proposal.createdAt), { addSuffix: true })}
            </span>
          </div>

          {/* Transaction details */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Amount:</span>
              <span className="font-semibold">{proposal.value} ETH</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">To:</span>
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                {proposal.to.slice(0, 10)}...{proposal.to.slice(-8)}
              </code>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
            </div>
            {proposal.reason && (
              <div className="text-sm">
                <span className="text-muted-foreground">Reason: </span>
                <span>{proposal.reason}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              <span>
                Proposed by {proposal.proposer.name || proposal.proposer.email}
              </span>
            </div>
            {proposal.txHash && (
              <div className="flex items-center gap-2 text-xs">
                <a
                  href={`https://sepolia.etherscan.io/tx/${proposal.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  View transaction
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        {!isHistorical && status === "PENDING" && (
          <div className="flex flex-col gap-2">
            {isOwner ? (
              <>
                <Button 
                  size="sm" 
                  onClick={onApprove}
                  disabled={isProcessing}
                >
                  {isProcessing && processingAction === "approve" ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="mr-1 h-3 w-3" />
                  )}
                  Approve
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive" 
                  onClick={onReject}
                  disabled={isProcessing}
                >
                  {isProcessing && processingAction === "reject" ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <X className="mr-1 h-3 w-3" />
                  )}
                  Reject
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={onCancel}
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <X className="mr-1 h-3 w-3" />
                )}
                Cancel
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Expiration warning */}
      {status === "PENDING" && !proposal.isExpired && (
        <div className="mt-3 text-xs text-muted-foreground">
          Expires {formatDistanceToNow(new Date(proposal.expiresAt), { addSuffix: true })}
        </div>
      )}
    </div>
  );
}
