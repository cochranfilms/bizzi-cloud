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
    const docRefObj = {
      id,
      get: async () => {
        const d = raw.get(key(col, id));
        return {
          exists: d !== undefined,
          id,
          data: () => (d === undefined ? undefined : { ...d }),
          ref: docRefObj,
        };
      },
      set: async (data: DocData, opts?: { merge?: boolean }) => {
        const k = key(col, id);
        if (opts?.merge) {
          raw.set(k, applyMerge(raw.get(k), data));
        } else {
          raw.set(k, { ...data });
        }
      },
      delete: async () => {
        raw.delete(key(col, id));
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

  const firestore = {
    collection(col: string) {
      return {
        doc: (id: string) => docRef(col, id),
        where(field: string, op: string, value: unknown) {
          return makeQuery(col, [{ field, value }], undefined);
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
