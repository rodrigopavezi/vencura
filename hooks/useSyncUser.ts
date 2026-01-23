"use client";

import { useEffect, useRef } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { trpc } from "@/lib/trpc/client";

export function useSyncUser() {
  const { user } = useDynamicContext();
  const syncedEmailRef = useRef<string | null>(null);

  const syncUser = trpc.user.syncFromDynamic.useMutation();
  // Store mutate in a ref to avoid dependency issues
  const mutateRef = useRef(syncUser.mutate);
  mutateRef.current = syncUser.mutate;

  useEffect(() => {
    const email = user?.email;
    
    // Only sync if we have a new email that we haven't synced yet
    if (!email || email === syncedEmailRef.current) {
      return;
    }

    // Mark as synced immediately to prevent duplicate calls
    syncedEmailRef.current = email;

    const name = user?.firstName
      ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
      : undefined;

    mutateRef.current({ email, name });
  }, [user?.email, user?.firstName, user?.lastName]);

  return {
    isSyncing: syncUser.isPending,
    syncError: syncUser.error,
    dbUser: syncUser.data,
  };
}
