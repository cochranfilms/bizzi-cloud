/**
 * In-memory Firestore-shaped store for API route integration tests.
 * Supports doc get/set (merge + FieldValue.delete), collection.where chains, limit, get.
 */
import type { Firestore } from "firebase-admin/firestore";

type DocData = Record<string, unknown>;
type Clause = { field: string; value: unknown };

function isDeleteSentinel(v: unknown): boolean {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { constructor?: { name?: string } }).constructor?.name === "DeleteTransform"
  );
}

function applyMerge(existing: DocData | undefined, patch: DocData): DocData {
  const base = { ...(existing ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (isDeleteSentinel(v)) {
      delete base[k];
    } else {
      base[k] = v;
    }
  }
  return base;
}

export function createPersonalTeamIntegrationDb() {
  const raw = new Map<string, DocData>();

  const key = (col: string, id: string) => `${col}/${id}`;

  function matchDoc(col: string, docId: string, data: DocData, clauses: Clause[]): boolean {
    if (clauses.length === 0) return true;
    return clauses.every((c) => data[c.field] === c.value);
  }

  function queryDocs(col: string, clauses: Clause[], lim?: number) {
    const prefix = `${col}/`;
    const rows: Array<{ id: string; data: DocData }> = [];
    for (const [kp, data] of raw.entries()) {
      if (!kp.startsWith(prefix)) continue;
      const docId = kp.slice(prefix.length);
      if (docId.includes("/")) continue;
      if (matchDoc(col, docId, data, clauses)) {
        rows.push({ id: docId, data });
      }
    }
    const slice = lim != null ? rows.slice(0, lim) : rows;
    return slice.map(({ id, data }) => {
      const docRefObj = docRef(col, id);
      return {
        id,
        exists: true,
        data: () => ({ ...data }),
        ref: docRefObj,
      };
    });
  }

  function docRef(col: string, id: string) {
    const k = key(col, id);
    const docRefObj = {
      id,
      /** @internal for runTransaction / bulkWriter tests */
      __testKey: k,
      get: async () => {
        const d = raw.get(k);
        return {
          exists: d !== undefined,
          id,
          data: () => (d === undefined ? undefined : { ...d }),
          ref: docRefObj,
        };
      },
      set: async (data: DocData, opts?: { merge?: boolean }) => {
        if (opts?.merge) {
          raw.set(k, applyMerge(raw.get(k), data));
        } else {
          raw.set(k, { ...data });
        }
      },
      delete: async () => {
        raw.delete(k);
      },
    };
    return docRefObj;
  }

  function makeQuery(col: string, clauses: Clause[], lim?: number) {
    return {
      where(field: string, _op: string, value: unknown) {
        return makeQuery(col, [...clauses, { field, value }], lim);
      },
      limit(n: number) {
        return makeQuery(col, clauses, n);
      },
      get: async () => {
        const docs = queryDocs(col, clauses, lim);
        return {
          empty: docs.length === 0,
          docs,
        };
      },
    };
  }

  type TestRef = { __testKey: string; id: string; set: (data: DocData, opts?: { merge?: boolean }) => Promise<void> };

  const firestore = {
    collection(col: string) {
      return {
        doc: (id: string) => docRef(col, id),
        where(field: string, op: string, value: unknown) {
          return makeQuery(col, [{ field, value }], undefined);
        },
      };
    },
    async runTransaction<T>(fn: (tx: { get: (r: TestRef) => Promise<unknown>; update: (r: TestRef, data: DocData) => Promise<void> }) => Promise<T>): Promise<T> {
      const tx = {
        get: async (ref: TestRef) => {
          const d = raw.get(ref.__testKey);
          return {
            exists: d !== undefined,
            id: ref.id,
            data: () => (d === undefined ? undefined : { ...d }),
            ref,
          };
        },
        update: async (ref: TestRef, data: DocData) => {
          const cur = raw.get(ref.__testKey);
          if (cur === undefined) throw new Error(`[test] transaction update missing ${ref.__testKey}`);
          raw.set(ref.__testKey, applyMerge(cur, data));
        },
      };
      return fn(tx);
    },
    bulkWriter: () => {
      const ops: Array<() => Promise<void>> = [];
      return {
        update: (ref: TestRef, data: DocData) => {
          ops.push(async () => {
            const cur = raw.get(ref.__testKey);
            if (cur === undefined) throw new Error(`[test] bulkWriter update missing ${ref.__testKey}`);
            raw.set(ref.__testKey, applyMerge(cur, data));
          });
        },
        set: (ref: TestRef, data: DocData, opts?: { merge?: boolean }) => {
          ops.push(async () => {
            if (opts?.merge) {
              raw.set(ref.__testKey, applyMerge(raw.get(ref.__testKey), data));
            } else {
              raw.set(ref.__testKey, { ...data });
            }
          });
        },
        close: async () => {
          for (const o of ops) await o();
        },
      };
    },
  } as unknown as Firestore;

  return {
    firestore,
    raw,
    /** @internal test helpers */
    seedDoc(col: string, id: string, data: DocData) {
      raw.set(key(col, id), { ...data });
    },
  };
}
