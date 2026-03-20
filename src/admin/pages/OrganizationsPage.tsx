"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "../components/shared/PageHeader";
import { Building2, Loader2, Users } from "lucide-react";
import { ENTERPRISE_STORAGE_TIERS } from "@/lib/enterprise-pricing";

export interface OrgListItem {
  id: string;
  name: string;
  owner_email: string | null;
  max_seats: number | null;
  seat_count: number;
  seats_accepted: number;
  seats_pending: number;
  storage_quota_bytes: number | null;
  storage_used_bytes: number;
  created_at: string | null;
}

export default function OrganizationsPage() {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<OrgListItem[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [orgName, setOrgName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [maxSeats, setMaxSeats] = useState("1");
  const [storageTierId, setStorageTierId] = useState("1tb");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    organization_id: string;
    org_name: string;
    owner_email: string;
    success?: boolean;
    message?: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    const trimmedName = orgName.trim();
    const trimmedEmail = ownerEmail.trim().toLowerCase();
    const seatsNum = maxSeats ? parseInt(maxSeats, 10) : 0;
    const tier = ENTERPRISE_STORAGE_TIERS.find((t) => t.id === storageTierId);
    if (!trimmedName || trimmedName.length < 2) {
      setError("Organization name must be at least 2 characters");
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Valid owner email is required");
      return;
    }
    if (!seatsNum || seatsNum < 1) {
      setError("Seats is required (minimum 1)");
      return;
    }
    if (!tier) {
      setError("Storage tier is required");
      return;
    }
    setCreating(true);
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/admin/enterprise/create-org", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          org_name: trimmedName,
          owner_email: trimmedEmail,
          max_seats: seatsNum,
          storage_quota_bytes: tier.bytes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create organization");
      }
      setResult(data);
      setOrgName("");
      setOwnerEmail("");
      setMaxSeats("1");
      setStorageTierId("1tb");
      fetchOrganizations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  const fetchOrganizations = async () => {
    if (!user) {
      setOrgsLoading(false);
      return;
    }
    setOrgsLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/enterprise/organizations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data.organizations ?? []);
      }
    } catch {
      setOrganizations([]);
    } finally {
      setOrgsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, [user]);

  const formatStorage = (bytes: number) => {
    if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(1)} TB`;
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organizations"
        subtitle="Create enterprise organizations. Invoice is sent to the owner email; sign-up link is sent automatically after payment."
      />

      {orgsLoading ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-12 dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex items-center justify-center gap-2 text-neutral-500 dark:text-neutral-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading organizations…
          </div>
        </div>
      ) : organizations.length > 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden dark:border-neutral-700 dark:bg-neutral-900">
          <h2 className="px-6 py-4 text-lg font-semibold text-neutral-900 dark:text-white border-b border-neutral-200 dark:border-neutral-700">
            Organization accounts
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/50">
                  <th className="px-6 py-3 text-left font-medium text-neutral-700 dark:text-neutral-300">
                    Organization
                  </th>
                  <th className="px-6 py-3 text-left font-medium text-neutral-700 dark:text-neutral-300">
                    Owner
                  </th>
                  <th className="px-6 py-3 text-left font-medium text-neutral-700 dark:text-neutral-300">
                    Seats
                  </th>
                  <th className="px-6 py-3 text-left font-medium text-neutral-700 dark:text-neutral-300">
                    Storage
                  </th>
                  <th className="px-6 py-3 text-left font-medium text-neutral-700 dark:text-neutral-300">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => (
                  <tr
                    key={org.id}
                    className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/30"
                  >
                    <td className="px-6 py-3 text-neutral-900 dark:text-white font-medium">
                      {org.name}
                    </td>
                    <td className="px-6 py-3 text-neutral-600 dark:text-neutral-400">
                      {org.owner_email ?? "—"}
                    </td>
                    <td className="px-6 py-3">
                      <span className="font-medium text-neutral-900 dark:text-white">
                        {org.seat_count}
                      </span>
                      {org.max_seats != null ? (
                        <span className="text-neutral-500 dark:text-neutral-400">
                          {" "}/ {org.max_seats} max
                        </span>
                      ) : (
                        <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">
                          (limit not set — contact sales)
                        </span>
                      )}
                      <span className="ml-1 text-xs text-neutral-500 dark:text-neutral-400">
                        ({org.seats_accepted} active, {org.seats_pending} pending)
                      </span>
                    </td>
                    <td className="px-6 py-3 text-neutral-600 dark:text-neutral-400">
                      {formatStorage(org.storage_used_bytes)}
                      {org.storage_quota_bytes != null && (
                        <span className="text-neutral-500">
                          {" "}/ {formatStorage(org.storage_quota_bytes)}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-neutral-500 dark:text-neutral-400">
                      {org.created_at
                        ? new Date(org.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-6 py-8 text-center dark:border-neutral-700 dark:bg-neutral-800/30">
          <Users className="mx-auto h-10 w-10 text-neutral-400 dark:text-neutral-500" />
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            No organizations yet. Create one below.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
          Create organization
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          <div>
            <label
              htmlFor="org_name"
              className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Organization name
            </label>
            <input
              id="org_name"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Inc"
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              disabled={creating}
            />
          </div>
          <div>
            <label
              htmlFor="owner_email"
              className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Owner email
            </label>
            <input
              id="owner_email"
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              placeholder="owner@company.com"
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              disabled={creating}
            />
          </div>
          <div>
            <label
              htmlFor="storage"
              className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Storage *
            </label>
            <select
              id="storage"
              value={storageTierId}
              onChange={(e) => setStorageTierId(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              disabled={creating}
            >
              {ENTERPRISE_STORAGE_TIERS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} — ${t.priceMonthly}/mo
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="max_seats"
              className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Seats *
            </label>
            <input
              id="max_seats"
              type="number"
              min={1}
              value={maxSeats}
              onChange={(e) => setMaxSeats(e.target.value)}
              placeholder="e.g. 3"
              required
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              disabled={creating}
            />
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              Seats are $9/seat/mo. Required for all organizations.
            </p>
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={creating}
            className="flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Building2 className="h-4 w-4" />
                Create & send invoice
              </>
            )}
          </button>
        </form>
      </div>

      {result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-800 dark:bg-emerald-950/30">
          <h3 className="mb-2 font-semibold text-emerald-900 dark:text-emerald-100">
            Organization created
          </h3>
          <p className="mb-2 text-sm text-emerald-800 dark:text-emerald-200">
            Subscription payment link sent to {result.owner_email}. Sign-up link will be sent after first payment. Future months will auto-charge.
          </p>
          <p className="text-xs text-emerald-700 dark:text-emerald-300">
            Org ID: {result.organization_id}
          </p>
        </div>
      )}
    </div>
  );
}
