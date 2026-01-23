"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, Check, X, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";

interface InvitationCardProps {
  invitation: {
    id: string;
    role: string;
    status: string;
    expiresAt: Date | string;
    createdAt: Date | string;
    wallet: {
      id: string;
      name: string;
      address: string;
    };
    inviter?: {
      id: string;
      email: string;
      name: string | null;
    } | null;
    invitee?: {
      id: string;
      email: string;
      name: string | null;
    } | null;
    inviteeEmail?: string | null;
  };
  type: "received" | "sent";
}

const roleColors: Record<string, string> = {
  VIEW_ONLY: "bg-blue-500 text-white",
  CO_SIGNER: "bg-yellow-500 text-white",
  FULL_ACCESS: "bg-green-500 text-white",
};

export function InvitationCard({ invitation, type }: InvitationCardProps) {
  const utils = trpc.useUtils();

  const acceptInvitation = trpc.walletAccess.acceptInvitation.useMutation({
    onSuccess: () => {
      toast.success("Invitation accepted! You now have access to the wallet.");
      utils.walletAccess.listInvitations.invalidate();
      utils.wallet.getAll.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to accept invitation");
    },
  });

  const rejectInvitation = trpc.walletAccess.rejectInvitation.useMutation({
    onSuccess: () => {
      toast.success("Invitation rejected");
      utils.walletAccess.listInvitations.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to reject invitation");
    },
  });

  const isExpired = new Date(invitation.expiresAt) < new Date();
  const isPending = invitation.status === "PENDING" && !isExpired;

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Wallet className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h4 className="font-semibold">{invitation.wallet.name}</h4>
              <p className="text-sm text-muted-foreground font-mono">
                {invitation.wallet.address.slice(0, 6)}...
                {invitation.wallet.address.slice(-4)}
              </p>
              {type === "received" && invitation.inviter && (
                <p className="text-sm text-muted-foreground mt-1">
                  From: {invitation.inviter.name || invitation.inviter.email}
                </p>
              )}
              {type === "sent" && invitation.inviteeEmail && (
                <p className="text-sm text-muted-foreground mt-1">
                  To: {invitation.inviteeEmail}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <Badge className={roleColors[invitation.role]}>
              {invitation.role.replace("_", " ")}
            </Badge>
            
            {isExpired ? (
              <Badge variant="secondary" className="text-muted-foreground">
                <Clock className="h-3 w-3 mr-1" />
                Expired
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">
                Expires {formatDate(invitation.expiresAt)}
              </span>
            )}
          </div>
        </div>

        {type === "received" && isPending && (
          <div className="flex gap-2 mt-4 pt-4 border-t">
            <Button
              className="flex-1"
              onClick={() => acceptInvitation.mutate({ invitationId: invitation.id })}
              disabled={acceptInvitation.isPending || rejectInvitation.isPending}
            >
              <Check className="h-4 w-4 mr-2" />
              Accept
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => rejectInvitation.mutate({ invitationId: invitation.id })}
              disabled={acceptInvitation.isPending || rejectInvitation.isPending}
            >
              <X className="h-4 w-4 mr-2" />
              Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
