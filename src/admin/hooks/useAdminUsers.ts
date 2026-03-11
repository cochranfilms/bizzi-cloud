"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchAdminUsers,
  type UsersFilters,
} from "@/admin/services/adminUsersService";
import { useAuth } from "@/context/AuthContext";
import type { AdminUser } from "@/admin/types/adminUsers.types";

export function useAdminUsers(initialFilters: UsersFilters = {}) {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<UsersFilters>(initialFilters);
  const [page, setPage] = useState(1);

  const getToken = useCallback(
    () => (user ? user.getIdToken() : Promise.resolve(null)),
    [user]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminUsers(filters, page, 25, { getToken });
      setUsers(res.users);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [filters, page, getToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    users,
    total,
    loading,
    error,
    filters,
    setFilters,
    page,
    setPage,
    refresh,
  };
}
