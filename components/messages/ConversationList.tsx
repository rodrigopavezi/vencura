"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface Conversation {
  peerAddress: string;
  lastMessage?: string;
  lastMessageTime?: Date;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedAddress?: string;
  onSelect: (address: string) => void;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } else if (days === 1) {
    return "Yesterday";
  } else if (days < 7) {
    return new Date(date).toLocaleDateString("en-US", { weekday: "short" });
  }
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function ConversationList({
  conversations,
  selectedAddress,
  onSelect,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <p className="text-muted-foreground">No conversations yet</p>
        <p className="text-sm text-muted-foreground">
          Start a new conversation to message other wallets
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 p-2">
        {conversations.map((conversation) => (
          <button
            key={conversation.peerAddress}
            onClick={() => onSelect(conversation.peerAddress)}
            className={cn(
              "w-full flex items-center gap-3 rounded-lg p-3 text-left transition-colors",
              selectedAddress === conversation.peerAddress
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            )}
          >
            <Avatar>
              <AvatarFallback>
                {conversation.peerAddress.slice(2, 4).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-medium font-mono text-sm">
                  {truncateAddress(conversation.peerAddress)}
                </span>
                {conversation.lastMessageTime && (
                  <span className={cn(
                    "text-xs",
                    selectedAddress === conversation.peerAddress
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground"
                  )}>
                    {formatTime(conversation.lastMessageTime)}
                  </span>
                )}
              </div>
              {conversation.lastMessage && (
                <p className={cn(
                  "text-sm truncate",
                  selectedAddress === conversation.peerAddress
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground"
                )}>
                  {conversation.lastMessage}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}
