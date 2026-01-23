"use client";

import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc/client";

interface Conversation {
  id: string;
  peerAddress: string;
  createdAt: Date;
}

interface Message {
  id: string;
  senderAddress: string;
  content: string;
  sent: Date;
}

interface UseXmtpOptions {
  walletId: string | null;
}

interface UseXmtpReturn {
  isInitializing: boolean;
  error: string | null;
  conversations: Conversation[];
  conversationsLoading: boolean;
  loadConversations: () => void;
  getMessages: (conversationId: string) => void;
  messages: Message[];
  messagesLoading: boolean;
  sendMessage: (conversationId: string, content: string) => Promise<Message | null>;
  sendingMessage: boolean;
  startConversation: (peerAddress: string, initialMessage?: string) => Promise<Conversation | null>;
  startingConversation: boolean;
  canMessage: (peerAddress: string) => Promise<boolean>;
}

export function useXmtp({ walletId }: UseXmtpOptions): UseXmtpReturn {
  const [error, setError] = useState<string | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  // Get conversations query
  const conversationsQuery = trpc.messaging.getConversations.useQuery(
    { walletId: walletId! },
    {
      enabled: !!walletId,
      retry: 1,
      onError: (err) => {
        setError(err.message);
      },
    }
  );

  // Get messages query
  const messagesQuery = trpc.messaging.getMessages.useQuery(
    { walletId: walletId!, conversationId: currentConversationId! },
    {
      enabled: !!walletId && !!currentConversationId,
      retry: 1,
      onError: (err) => {
        setError(err.message);
      },
    }
  );

  // Mutations
  const sendMessageMutation = trpc.messaging.sendMessage.useMutation({
    onError: (err) => {
      setError(err.message);
    },
  });

  const startConversationMutation = trpc.messaging.startConversation.useMutation({
    onSuccess: () => {
      conversationsQuery.refetch();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const canMessageQuery = trpc.messaging.canMessage.useQuery(
    { walletId: walletId!, peerAddress: "" },
    { enabled: false }
  );

  const loadConversations = useCallback(() => {
    conversationsQuery.refetch();
  }, [conversationsQuery]);

  const getMessages = useCallback((conversationId: string) => {
    setCurrentConversationId(conversationId);
  }, []);

  const sendMessageFn = useCallback(async (conversationId: string, content: string): Promise<Message | null> => {
    if (!walletId) return null;

    try {
      const result = await sendMessageMutation.mutateAsync({
        walletId,
        conversationId,
        content,
      });
      // Refetch messages after sending
      messagesQuery.refetch();
      return result;
    } catch {
      return null;
    }
  }, [walletId, sendMessageMutation, messagesQuery]);

  const startConversationFn = useCallback(async (peerAddress: string, initialMessage?: string): Promise<Conversation | null> => {
    if (!walletId) return null;

    try {
      const result = await startConversationMutation.mutateAsync({
        walletId,
        peerAddress,
        initialMessage,
      });
      return result.conversation;
    } catch {
      return null;
    }
  }, [walletId, startConversationMutation]);

  const canMessageFn = useCallback(async (peerAddress: string): Promise<boolean> => {
    if (!walletId) return false;

    try {
      const result = await canMessageQuery.refetch();
      return result.data?.canMessage ?? false;
    } catch {
      return false;
    }
  }, [walletId, canMessageQuery]);

  // Convert dates from string to Date objects
  const conversations = (conversationsQuery.data ?? []).map(conv => ({
    ...conv,
    createdAt: new Date(conv.createdAt),
  }));

  const messages = (messagesQuery.data ?? []).map(msg => ({
    ...msg,
    sent: new Date(msg.sent),
  }));

  return {
    isInitializing: conversationsQuery.isLoading && !conversationsQuery.data,
    error,
    conversations,
    conversationsLoading: conversationsQuery.isLoading,
    loadConversations,
    getMessages,
    messages,
    messagesLoading: messagesQuery.isLoading,
    sendMessage: sendMessageFn,
    sendingMessage: sendMessageMutation.isPending,
    startConversation: startConversationFn,
    startingConversation: startConversationMutation.isPending,
    canMessage: canMessageFn,
  };
}
