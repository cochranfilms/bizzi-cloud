import { describe, expect, it, vi } from "vitest";
import { readProxyJobAndBackupSnapshotsInTransaction } from "@/lib/proxy-job-pipeline";
import type { DocumentReference, DocumentSnapshot, Transaction } from "firebase-admin/firestore";

/**
 * Regression: Firestore rejects transactions that read after a write in the same txn.
 * The access_revoked / proxy_valid_skip / complete paths must read proxy_jobs and
 * backup_files before any tx.update.
 */
describe("readProxyJobAndBackupSnapshotsInTransaction", () => {
  it("issues all transaction.get calls before any write in a simulated access_revoked flow", async () => {
    const callOrder: string[] = [];

    const jobRef = { path: "proxy_jobs/job1" } as DocumentReference;
    const bfRef = { path: "backup_files/bf1" } as DocumentReference;
    const db = {
      collection: (name: string) => ({
        doc: (id: string) => {
          if (name === "backup_files" && id === "bf1") return bfRef;
          throw new Error(`unexpected collection ${name}/${id}`);
        },
      }),
    };

    const jobSnap = {
      exists: true,
      data: () => ({
        backup_file_id: "bf1",
        status: "queued",
      }),
    } as unknown as DocumentSnapshot;

    const bfSnap = {
      exists: false,
      data: () => undefined,
    } as unknown as DocumentSnapshot;

    const tx = {
      get: vi.fn(async (ref: DocumentReference) => {
        callOrder.push(`get:${ref.path}`);
        if (ref === jobRef) return jobSnap;
        if (ref === bfRef) return bfSnap;
        throw new Error(`unexpected get ${ref.path}`);
      }),
      update: vi.fn((ref: DocumentReference) => {
        callOrder.push(`update:${ref.path}`);
      }),
    } as unknown as Transaction;

    const out = await readProxyJobAndBackupSnapshotsInTransaction(tx, db as never, jobRef);

    expect(out.jobSnap).toBe(jobSnap);
    expect(out.bfRef).toBe(bfRef);
    expect(out.bfSnap).toBe(bfSnap);
    expect(out.backupFileId).toBe("bf1");
    expect(callOrder).toEqual(["get:proxy_jobs/job1", "get:backup_files/bf1"]);

    // Simulated write phase (must come after reads only)
    tx.update(jobRef, { status: "failed_terminal" } as never);
    if (out.bfRef && out.bfSnap?.exists) {
      tx.update(out.bfRef, {} as never);
    }
    expect(callOrder).toEqual([
      "get:proxy_jobs/job1",
      "get:backup_files/bf1",
      "update:proxy_jobs/job1",
    ]);
  });

  it("only reads job doc when backup_file_id is missing", async () => {
    const callOrder: string[] = [];
    const jobRef = { path: "proxy_jobs/job2" } as DocumentReference;
    const db = { collection: () => ({ doc: () => { throw new Error("no backup"); } }) };

    const jobSnap = {
      exists: true,
      data: () => ({ backup_file_id: null, status: "queued" }),
    } as unknown as DocumentSnapshot;

    const tx = {
      get: vi.fn(async (ref: DocumentReference) => {
        callOrder.push(`get:${ref.path}`);
        return ref === jobRef ? jobSnap : ({} as DocumentSnapshot);
      }),
      update: vi.fn((ref: DocumentReference) => callOrder.push(`update:${ref.path}`)),
    } as unknown as Transaction;

    const out = await readProxyJobAndBackupSnapshotsInTransaction(tx, db as never, jobRef);
    expect(out.backupFileId).toBeNull();
    expect(out.bfRef).toBeNull();
    expect(out.bfSnap).toBeNull();
    expect(callOrder).toEqual(["get:proxy_jobs/job2"]);
  });
});
