"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getAuthToken } from "@/lib/auth-token";

export function useHearts(fileId: string | null) {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [hasHearted, setHasHearted] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    if (!fileId || !user) {
      setCount(0);
      setHasHearted(false);
      setLoading(false);
      return;
    }
    const token = await getAuthToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/files/${fileId}/hearts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCount(data.count ?? 0);
        setHasHearted(data.hasHearted ?? false);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [fileId, user]);

  useEffect(() => {
    setLoading(true);
    fetchSummary();
  }, [fetchSummary]);

  const toggle = useCallback(async () => {
    if (!fileId || !user) return;
    const token = await getAuthToken(true);
    if (!token) return;
    setHasHearted((prev) => !prev);
    setCount((c) => (hasHearted ? c - 1 : c + 1));
    try {
      const res = await fetch(`/api/files/${fileId}/hearts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCount(data.count ?? 0);
        setHasHearted(data.hasHearted ?? false);
      } else {
        setHasHearted(hasHearted);
        setCount(count);
      }
    } catch {
      setHasHearted(hasHearted);
      setCount(count);
    }
  }, [fileId, user, hasHearted, count]);

  return {
    count,
    hasHearted,
    loading,
    toggle,
    refresh: fetchSummary,
  };
}
