"use client";

import { trpc } from "@/lib/trpc/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InvitationCard } from "@/components/sharing/InvitationCard";
import { Inbox, Send } from "lucide-react";

export default function SharingPage() {
  const { data: receivedInvitations, isLoading: receivedLoading } = 
    trpc.walletAccess.listInvitations.useQuery({ type: "received" });
  
  const { data: sentInvitations, isLoading: sentLoading } = 
    trpc.walletAccess.listInvitations.useQuery({ type: "sent" });

  const pendingCount = receivedInvitations?.length || 0;
  const sentCount = sentInvitations?.length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Sharing</h2>
        <p className="text-muted-foreground">
          Manage wallet access invitations
        </p>
      </div>

      <Tabs defaultValue="received" className="space-y-4">
        <TabsList>
          <TabsTrigger value="received" className="gap-2">
            <Inbox className="h-4 w-4" />
            Received
            {pendingCount > 0 && (
              <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="sent" className="gap-2">
            <Send className="h-4 w-4" />
            Sent
            {sentCount > 0 && (
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                {sentCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="received" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Invitations</CardTitle>
              <CardDescription>
                Invitations from other users to access their wallets
              </CardDescription>
            </CardHeader>
            <CardContent>
              {receivedLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                </div>
              ) : !receivedInvitations || receivedInvitations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Inbox className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="font-semibold">No pending invitations</h3>
                  <p className="text-sm text-muted-foreground">
                    When someone invites you to access their wallet, it will appear here
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {receivedInvitations.map((invitation) => (
                    <InvitationCard
                      key={invitation.id}
                      invitation={invitation}
                      type="received"
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sent" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sent Invitations</CardTitle>
              <CardDescription>
                Invitations you have sent to share your wallets
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sentLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                </div>
              ) : !sentInvitations || sentInvitations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Send className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="font-semibold">No sent invitations</h3>
                  <p className="text-sm text-muted-foreground">
                    You have not invited anyone to access your wallets yet
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sentInvitations.map((invitation) => (
                    <InvitationCard
                      key={invitation.id}
                      invitation={invitation}
                      type="sent"
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
