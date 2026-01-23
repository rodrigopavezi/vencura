"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { useXmtp } from "@/hooks/useXmtp";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ConversationList } from "@/components/messages/ConversationList";
import { ChatView } from "@/components/messages/ChatView";
import { NewConversationDialog } from "@/components/messages/NewConversationDialog";
import { MessageSquare, Wallet, AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function MessagesPage() {
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  const { data: wallets, isLoading: walletsLoading } = trpc.wallet.getAll.useQuery();

  const {
    isInitializing,
    error: xmtpError,
    conversations,
    conversationsLoading,
    loadConversations,
    getMessages,
    messages,
    messagesLoading,
    sendMessage,
    sendingMessage,
    startConversation,
    startingConversation,
  } = useXmtp({ walletId: selectedWallet });

  const allWallets = [
    ...(wallets?.owned || []).map(w => ({ ...w, role: "OWNER" })),
    ...(wallets?.shared || []).filter(w => w.role === "FULL_ACCESS"),
  ];

  const selectedWalletData = allWallets.find(w => w.id === selectedWallet);
  const selectedConversation = conversations.find(c => c.id === selectedConversationId);

  // Load messages when conversation is selected
  useEffect(() => {
    if (selectedConversationId) {
      getMessages(selectedConversationId);
    }
  }, [selectedConversationId, getMessages]);

  const handleStartConversation = async (address: string) => {
    const conversation = await startConversation(address);
    if (conversation) {
      setSelectedConversationId(conversation.id);
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!selectedConversationId) return;
    await sendMessage(selectedConversationId, content);
  };

  // Convert conversations to format expected by ConversationList
  const conversationListData = conversations.map(conv => ({
    peerAddress: conv.peerAddress,
    lastMessage: "",
    lastMessageTime: conv.createdAt,
    id: conv.id,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Messages</h2>
          <p className="text-muted-foreground">
            Wallet-to-wallet messaging with XMTP
          </p>
        </div>
      </div>

      {xmtpError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>XMTP Error</AlertTitle>
          <AlertDescription>{xmtpError}</AlertDescription>
        </Alert>
      )}

      {/* Wallet Selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Select Wallet</CardTitle>
          <CardDescription>
            Choose which wallet to use for messaging
          </CardDescription>
        </CardHeader>
        <CardContent>
          {walletsLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : allWallets.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <Wallet className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No wallets with messaging capability</p>
              <p className="text-sm">Create a wallet or get full access to an existing one</p>
            </div>
          ) : (
            <Select value={selectedWallet || ""} onValueChange={setSelectedWallet}>
              <SelectTrigger>
                <SelectValue placeholder="Select a wallet" />
              </SelectTrigger>
              <SelectContent>
                {allWallets.map((wallet) => (
                  <SelectItem key={wallet.id} value={wallet.id}>
                    <div className="flex items-center gap-2">
                      <span>{wallet.name}</span>
                      <span className="text-muted-foreground font-mono text-xs">
                        {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {/* XMTP Initialization Status */}
      {selectedWallet && isInitializing && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Initializing XMTP</AlertTitle>
          <AlertDescription>
            Connecting to XMTP network and loading conversations...
          </AlertDescription>
        </Alert>
      )}

      {/* Chat Interface */}
      {selectedWallet && !isInitializing && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[600px]">
          {/* Conversations List */}
          <Card className="md:col-span-1">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Conversations</CardTitle>
              <NewConversationDialog 
                onStartConversation={handleStartConversation} 
                isLoading={startingConversation}
              />
            </CardHeader>
            <CardContent className="p-0 h-[calc(100%-80px)]">
              {conversationsLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-4">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No conversations yet</p>
                  <p className="text-xs text-muted-foreground">Start a new conversation</p>
                </div>
              ) : (
                <ConversationList
                  conversations={conversationListData}
                  selectedAddress={selectedConversation?.peerAddress}
                  onSelect={(peerAddress) => {
                    const conv = conversations.find(c => c.peerAddress === peerAddress);
                    if (conv) {
                      setSelectedConversationId(conv.id);
                    }
                  }}
                />
              )}
            </CardContent>
          </Card>

          {/* Chat View */}
          <Card className="md:col-span-2">
            <CardContent className="p-0 h-full">
              {selectedConversation ? (
                messagesLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <ChatView
                    messages={messages}
                    peerAddress={selectedConversation.peerAddress}
                    walletAddress={selectedWalletData?.address || ""}
                    onSendMessage={handleSendMessage}
                    isSending={sendingMessage}
                  />
                )
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-4">
                  <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="font-semibold">Select a conversation</h3>
                  <p className="text-sm text-muted-foreground">
                    Choose a conversation from the list or start a new one
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
