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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { UserPlus, Loader2 } from "lucide-react";

interface InviteUserDialogProps {
  walletId: string;
  onSuccess?: () => void;
}

export function InviteUserDialog({ walletId, onSuccess }: InviteUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"VIEW_ONLY" | "CO_SIGNER" | "FULL_ACCESS">("VIEW_ONLY");

  const utils = trpc.useUtils();

  const inviteUser = trpc.walletAccess.invite.useMutation({
    onSuccess: () => {
      toast.success("Invitation sent successfully!");
      utils.walletAccess.listInvitations.invalidate();
      utils.walletAccess.listAccess.invalidate({ walletId });
      setOpen(false);
      resetForm();
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to send invitation");
    },
  });

  const resetForm = () => {
    setEmail("");
    setRole("VIEW_ONLY");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast.error("Please enter an email address");
      return;
    }

    inviteUser.mutate({
      walletId,
      email: email.trim(),
      role,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Invite User
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
            <DialogDescription>
              Share wallet access with another user. They will receive an email invitation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={inviteUser.isPending}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Access Level</Label>
              <Select
                value={role}
                onValueChange={(value) => setRole(value as typeof role)}
                disabled={inviteUser.isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select access level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VIEW_ONLY">
                    <div>
                      <span className="font-medium">View Only</span>
                      <p className="text-xs text-muted-foreground">
                        Can view balance and transactions
                      </p>
                    </div>
                  </SelectItem>
                  <SelectItem value="CO_SIGNER">
                    <div>
                      <span className="font-medium">Co-signer</span>
                      <p className="text-xs text-muted-foreground">
                        Requires your approval for transactions
                      </p>
                    </div>
                  </SelectItem>
                  <SelectItem value="FULL_ACCESS">
                    <div>
                      <span className="font-medium">Full Access</span>
                      <p className="text-xs text-muted-foreground">
                        Can sign and send transactions independently
                      </p>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={inviteUser.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={inviteUser.isPending}>
              {inviteUser.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Send Invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
