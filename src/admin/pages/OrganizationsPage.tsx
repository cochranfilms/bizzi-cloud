"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "../components/shared/PageHeader";
import { Building2, Copy, Check, Loader2 } from "lucide-react";

export default function OrganizationsPage() {
  const { user } = useAuth();
  const [orgName, setOrgName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [maxSeats, setMaxSeats] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    organization_id: string;
    org_name: string;
    owner_email: string;
    invite_link: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    const trimmedName = orgName.trim();
    const trimmedEmail = ownerEmail.trim().toLowerCase();
    if (!trimmedName || trimmedName.length < 2) {
      setError("Organization name must be at least 2 characters");
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Valid owner email is required");
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
          max_seats: maxSeats ? parseInt(maxSeats, 10) : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create organization");
      }
      setResult(data);
      setOrgName("");
      setOwnerEmail("");
      setMaxSeats("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  const handleCopyLink = () => {
    if (!result?.invite_link) return;
    navigator.clipboard.writeText(result.invite_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organizations"
        subtitle="Create enterprise organizations and invite org owners. Copy the invite link and send it to the customer."
      />

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
              htmlFor="max_seats"
              className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Max seats (optional)
            </label>
            <input
              id="max_seats"
              type="number"
              min={1}
              value={maxSeats}
              onChange={(e) => setMaxSeats(e.target.value)}
              placeholder="Unlimited"
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              disabled={creating}
            />
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
                Create & get invite link
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
          <p className="mb-4 text-sm text-emerald-800 dark:text-emerald-200">
            Send this invite link to {result.owner_email}:
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              readOnly
              value={result.invite_link}
              className="flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-neutral-700 dark:border-emerald-700 dark:bg-neutral-900 dark:text-neutral-300"
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-50 dark:border-emerald-700 dark:bg-neutral-900 dark:text-emerald-200 dark:hover:bg-emerald-900/30"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy link
                </>
              )}
            </button>
          </div>
          <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
            Org ID: {result.organization_id}
          </p>
        </div>
      )}
    </div>
  );
}
