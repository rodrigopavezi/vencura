"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Crown } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useAuthToken } from "@/lib/trpc/provider";
import { toast } from "sonner";

interface AccessListProps {
  walletId: string;
  isOwner: boolean;
}

const roleColors: Record<string, string> = {
  OWNER: "bg-primary",
  VIEW_ONLY: "bg-blue-500",
  CO_SIGNER: "bg-yellow-500",
  FULL_ACCESS: "bg-green-500",
};

export function AccessList({ walletId, isOwner }: AccessListProps) {
  const { isTokenReady } = useAuthToken();
  const { data: accessData, isLoading } = trpc.walletAccess.listAccess.useQuery({
    walletId,
  }, {
    enabled: isTokenReady,
  });

  const utils = trpc.useUtils();

  const updateRole = trpc.walletAccess.updateRole.useMutation({
    onSuccess: () => {
      toast.success("Access role updated");
      utils.walletAccess.listAccess.invalidate({ walletId });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update role");
    },
  });

  const revokeAccess = trpc.walletAccess.revokeAccess.useMutation({
    onSuccess: () => {
      toast.success("Access revoked");
      utils.walletAccess.listAccess.invalidate({ walletId });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to revoke access");
    },
  });

  const handleRoleChange = (userId: string, newRole: string) => {
    updateRole.mutate({
      walletId,
      userId,
      role: newRole as "VIEW_ONLY" | "CO_SIGNER" | "FULL_ACCESS",
    });
  };

  const handleRevoke = (userId: string) => {
    revokeAccess.mutate({ walletId, userId });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Access List</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-12 bg-muted rounded" />
            <div className="h-12 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Access List</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Owner */}
        {accessData?.owner && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback>
                  {accessData.owner.name?.[0] || accessData.owner.email[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {accessData.owner.name || accessData.owner.email}
                  </span>
                  <Crown className="h-4 w-4 text-yellow-500" />
                </div>
                <span className="text-sm text-muted-foreground">
                  {accessData.owner.email}
                </span>
              </div>
            </div>
            <Badge className={roleColors.OWNER}>Owner</Badge>
          </div>
        )}

        {/* Access List */}
        {accessData?.accessList?.map((access) => (
          <div
            key={access.id}
            className="flex items-center justify-between p-3 rounded-lg border"
          >
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback>
                  {access.name?.[0] || access.email[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <span className="font-medium">
                  {access.name || access.email}
                </span>
                <p className="text-sm text-muted-foreground">{access.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isOwner ? (
                <>
                  <Select
                    defaultValue={access.role}
                    onValueChange={(value) => handleRoleChange(access.id, value)}
                    disabled={updateRole.isPending}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VIEW_ONLY">View Only</SelectItem>
                      <SelectItem value="CO_SIGNER">Co-signer</SelectItem>
                      <SelectItem value="FULL_ACCESS">Full Access</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRevoke(access.id)}
                    disabled={revokeAccess.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </>
              ) : (
                <Badge className={roleColors[access.role]}>
                  {access.role.replace("_", " ")}
                </Badge>
              )}
            </div>
          </div>
        ))}

        {(!accessData?.accessList || accessData.accessList.length === 0) && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No one else has access to this wallet
          </p>
        )}
      </CardContent>
    </Card>
  );
}
