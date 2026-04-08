/**
 * Proofing hardening: favorites/selects routing, materialize/merge semantics, merge audit docs,
 * archived filtering, deprecated create-favorite-folder, nav helpers. Mocks Firestore + auth; no emulator.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Firestore } from "firebase-admin/firestore";

import { materializeProofingList } from "@/lib/gallery-proofing-materialize";
import { mergeAllProofingLists } from "@/lib/gallery-proofing-merge-all";
import { submitProofingList } from "@/lib/gallery-proofing-submit";
import * as favoritesWriteContext from "@/lib/gallery-favorites-write-context";
import {
  proofingFilesHrefFromGalleryDetailHref,
  isSelectsPublicSharePathname,
} from "@/lib/gallery-proofing-types";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";

const G1 = "gal_proof_1";
const PHOTOGRAPHER = "uid_photo_1";
const LINKED_DRIVE = "drive_link_1";

type Row = Record<string, unknown>;

const resolveMock = vi.fn();

vi.mock("@/lib/gallery-proofing-storage-layout", () => ({
  ensureProofingShortcutParentFolder: vi.fn().mockResolvedValue({
    driveData: { folder_model_version: 2 },
    leafFolderId: "test_proofing_leaf_folder",
  }),
  repairProofingMaterializedShortcutsMissingFolderId: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/macos-package-container-admin", () => ({
  linkBackupFileToMacosPackageContainer: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/gallery-favorites-write-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gallery-favorites-write-context")>();
  return {
    ...actual,
    resolveGalleryFavoritesWriteContext: (
      ...args: Parameters<typeof actual.resolveGalleryFavoritesWriteContext>
    ) => resolveMock(...args),
  };
});

type ProofingMem = {
  db: Firestore;
  lists: Map<string, Row>;
  assets: Map<string, Row>;
  backupRows: { id: string; data: Row }[];
  mergeRuns: Map<string, Map<string, Row>>;
  setBatchCommitHook: (fn: (() => void) | null) => void;
};

function createProofingMemDb(): ProofingMem {
  const lists = new Map<string, Row>();
  const assets = new Map<string, Row>();
  let backupRows: { id: string; data: Row }[] = [];
  let backupAuto = 0;
  let snapAuto = 0;
  let mergeRunAuto = 0;
  let listIdAuto = 0;
  const mergeRuns = new Map<string, Map<string, Row>>();
  let batchCommitHook: (() => void) | null = null;

  function listDocRef(listId: string) {
    return {
      id: listId,
      get: async () => {
        const d = lists.get(listId);
        return { exists: !!d, data: () => ({ ...(d as Row) }) };
      },
      set: async (data: Row) => {
        lists.set(listId, { ...data });
      },
      update: async (patch: Row) => {
        lists.set(listId, { ...(lists.get(listId) ?? {}), ...patch });
      },
    };
  }

  const db = {
    collection(name: string) {
      if (name === "favorites_lists") {
        return {
          doc: (id?: string) => listDocRef(id ?? `gen_${++listIdAuto}`),
          where(field: string, _op: string, val: unknown) {
            const filters: [string, unknown][] = [[field, val]];
            const chain = {
              where(f2: string, _o2: string, v2: unknown) {
                filters.push([f2, v2]);
                return chain;
              },
              get: async () => ({
                docs: [...lists.entries()]
                  .filter(([, row]) => filters.every(([k, v]) => row[k] === v))
                  .map(([id, row]) => ({
                    id,
                    data: () => ({ ...row }),
                  })),
              }),
            };
            return chain;
          },
        };
      }
      if (name === "gallery_assets") {
        return {
          doc: (id: string) => ({
            get: async () => {
              const d = assets.get(id);
              return { exists: !!d, data: () => ({ ...(d as Row) }) };
            },
          }),
        };
      }
      if (name === "backup_snapshots") {
        return {
          add: async (_data: Row) => {
            const id = `bs_${++snapAuto}`;
            return { id };
          },
        };
      }
      if (name === "backup_files") {
        return {
          doc: (id?: string) => {
            const fid = id ?? `bf_${++backupAuto}`;
            return { id: fid };
          },
          where(field: string, _op: string, value: unknown) {
            const filters: Record<string, unknown> = { [field]: value };
            const chain = {
              where(field2: string, _op2: string, value2: unknown) {
                filters[field2] = value2;
                return chain;
              },
              limit(_n: number) {
                return {
                  get: async () => {
                    const docs = backupRows
                      .filter(({ data }) =>
                        Object.entries(filters).every(([k, v]) => data[k] === v)
                      )
                      .map((r) => ({
                        id: r.id,
                        data: () => r.data,
                      }));
                    return { docs };
                  },
                };
              },
            };
            return chain;
          },
        };
      }
      if (name === "linked_drives") {
        return {
          doc: (_id: string) => ({
            update: async () => undefined,
          }),
        };
      }
      if (name === "galleries") {
        return {
          doc: (gid: string) => ({
            collection(sub: string) {
              if (sub === "proofing_merge_runs") {
                return {
                  doc: (mid?: string) => {
                    const rid = mid ?? `mr_${++mergeRunAuto}`;
                    return {
                      id: rid,
                      set: async (data: Row) => {
                        if (!mergeRuns.has(gid)) mergeRuns.set(gid, new Map());
                        mergeRuns.get(gid)!.set(rid, { ...data });
                      },
                      update: async (patch: Row) => {
                        const cur = mergeRuns.get(gid)?.get(rid) ?? {};
                        mergeRuns.get(gid)!.set(rid, { ...cur, ...patch });
                      },
                    };
                  },
                };
              }
              throw new Error(`unknown sub ${sub}`);
            },
          }),
        };
      }
      throw new Error(`unknown collection ${name}`);
    },
    runTransaction: async (
      fn: (t: {
        get: (ref: { id: string }) => Promise<{ exists: boolean; data: () => Row }>;
        update: (ref: { id: string }, patch: Row) => void;
      }) => Promise<unknown>
    ) => {
      const t = {
        get: async (ref: { id: string }) => {
          const d = lists.get(ref.id);
          return { exists: !!d, data: () => ({ ...(d ?? {}) }) };
        },
        update: (ref: { id: string }, patch: Row) => {
          lists.set(ref.id, { ...(lists.get(ref.id) ?? {}), ...patch });
        },
      };
      return fn(t);
    },
    batch: () => {
      const pending: { id: string; data: Row }[] = [];
      return {
        set: (ref: { id: string }, data: Row) => {
          pending.push({ id: ref.id, data: { ...data } });
        },
        commit: async () => {
          if (batchCommitHook) batchCommitHook();
          for (const op of pending) {
            backupRows.push({ id: op.id, data: op.data });
          }
          pending.length = 0;
        },
      };
    },
  };

  return {
    db: db as unknown as Firestore,
    lists,
    assets,
    get backupRows() {
      return backupRows;
    },
    mergeRuns,
    setBatchCommitHook(fn: (() => void) | null) {
      batchCommitHook = fn;
    },
  };
}

function wireGalleriesCollection(dbInner: ReturnType<typeof createProofingMemDb>["db"], galleries: Map<string, Row>) {
  const d = dbInner as {
    collection: (name: string) => unknown;
  };
  const orig = d.collection.bind(d);
  d.collection = (name: string) => {
    if (name === "galleries") {
      const inner = orig("galleries") as {
        doc: (gid: string) => { collection: (sub: string) => unknown };
      };
      return {
        doc: (gid: string) => {
          const baseDoc = inner.doc(gid);
          return {
            get: async () => {
              const g = galleries.get(gid);
              return { exists: !!g, data: () => ({ ...(g as Row) }) };
            },
            update: async (patch: Row) => {
              const cur = galleries.get(gid) ?? {};
              applyGalleryPatchMutable(cur, patch);
              galleries.set(gid, cur);
            },
            collection: (sub: string) => baseDoc.collection(sub),
          };
        },
      };
    }
    return orig(name) as object;
  };
}

function applyGalleryPatchMutable(target: Row, patch: Row) {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && "operand" in v && typeof (v as { operand: number }).operand === "number") {
      const op = (v as { operand: number }).operand;
      target[k] = ((target[k] as number) ?? 0) + op;
    } else {
      target[k] = v;
    }
  }
}

function baseGalleryPhoto(): Row {
  return {
    photographer_id: PHOTOGRAPHER,
    gallery_type: "photo",
    organization_id: "org1",
    access_mode: "public",
    password_hash: null,
    pin_hash: null,
    invited_emails: [],
    expiration_date: null,
    allow_favorites: true,
    title: "Test",
    media_folder_segment: "wedding-test",
  };
}

function photoAsset(id: string, objectKey: string): Row {
  return {
    id,
    gallery_id: G1,
    media_type: "image",
    name: `${id}.jpg`,
    object_key: objectKey,
    size_bytes: 100,
  };
}

beforeEach(() => {
  resolveMock.mockResolvedValue({
    linkedDriveId: LINKED_DRIVE,
    scopeFields: {
      workspace_id: "ws1",
      visibility_scope: "org",
      organization_id: "org1",
      userId: PHOTOGRAPHER,
    },
  });
});

describe("proofing nav helpers (shell-aware filesHref / share path)", () => {
  it("proofingFilesHrefFromGalleryDetailHref maps dashboard, enterprise, team, desktop", () => {
    expect(proofingFilesHrefFromGalleryDetailHref("/dashboard/galleries/x")).toBe("/dashboard");
    expect(proofingFilesHrefFromGalleryDetailHref("/enterprise/galleries/g1")).toBe("/enterprise");
    expect(proofingFilesHrefFromGalleryDetailHref("/team/ownerUid42/galleries/g1")).toBe(
      "/team/ownerUid42"
    );
    expect(proofingFilesHrefFromGalleryDetailHref("/desktop/app/galleries/g1")).toBe("/desktop/app");
  });

  it("isSelectsPublicSharePathname is true only for /selects/ public segment", () => {
    expect(isSelectsPublicSharePathname("/g/abc/selects/list1")).toBe(true);
    expect(isSelectsPublicSharePathname("/g/abc/favorites/list1")).toBe(false);
    expect(isSelectsPublicSharePathname(null)).toBe(false);
  });
});

describe("submitProofingList listType (photo vs video)", () => {
  it("increments favorite counters for photo_favorites", async () => {
    const mem = createProofingMemDb();
    const galleries = new Map<string, Row>([[G1, { ...baseGalleryPhoto(), favorite_submission_count: 0 }]]);
    wireGalleriesCollection(mem.db, galleries);
    mem.assets.set("a1", photoAsset("a1", "k1"));

    await submitProofingList({
      db: mem.db,
      galleryId: G1,
      galleryRow: galleries.get(G1)!,
      uniqueIds: ["a1"],
      clientEmail: null,
      clientName: null,
      listType: "photo_favorites",
      shellContext: "personal",
      submissionSource: "public_gallery",
      createdByRole: "client",
    });

    expect(galleries.get(G1)!.favorite_submission_count).toBe(1);
  });

  it("increments select counters for video_selects", async () => {
    const mem = createProofingMemDb();
    const galleries = new Map<string, Row>([
      [
        G1,
        {
          ...baseGalleryPhoto(),
          gallery_type: "video",
          select_submission_count: 0,
        },
      ],
    ]);
    wireGalleriesCollection(mem.db, galleries);
    mem.assets.set("a1", {
      id: "a1",
      gallery_id: G1,
      media_type: "video",
      name: "a1.mp4",
      object_key: "kv1",
      size_bytes: 100,
    });

    await submitProofingList({
      db: mem.db,
      galleryId: G1,
      galleryRow: galleries.get(G1)!,
      uniqueIds: ["a1"],
      clientEmail: null,
      clientName: null,
      listType: "video_selects",
      shellContext: "personal",
      submissionSource: "public_gallery",
      createdByRole: "client",
    });

    expect(galleries.get(G1)!.select_submission_count).toBe(1);
  });
});

describe("materializeProofingList", () => {
  it("uses stored materialized_relative_prefix; does not replace with newly computed slug", async () => {
    const mem = createProofingMemDb();
    const listId = "list_stored_prefix";
    const storedPrefix = `${G1}/Favorites/legacy-slug-never-recompute`;
    mem.lists.set(listId, {
      gallery_id: G1,
      asset_ids: ["a1"],
      status: "submitted",
      materialization_state: "idle",
      list_type: "photo_favorites",
      materialized_relative_prefix: storedPrefix,
      folder_slug: "legacy-slug-never-recompute",
    });
    mem.assets.set("a1", photoAsset("a1", "key-a1"));

    const galleries = new Map<string, Row>([[G1, baseGalleryPhoto()]]);
    wireGalleriesCollection(mem.db, galleries);

    const out = await materializeProofingList({
      db: mem.db,
      actingUid: PHOTOGRAPHER,
      galleryId: G1,
      listId,
      galleryRow: galleries.get(G1)! as Parameters<typeof materializeProofingList>[0]["galleryRow"],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.materialized_relative_prefix).toBe(storedPrefix);
    expect(mem.backupRows.length).toBe(1);
    expect(String(mem.backupRows[0].data.relative_path)).toMatch(new RegExp(`^${storedPrefix}/`));
  });

  it("persists materialized_linked_drive_id on success", async () => {
    const mem = createProofingMemDb();
    const listId = "list_drive";
    mem.lists.set(listId, {
      gallery_id: G1,
      asset_ids: ["a1"],
      status: "submitted",
      materialization_state: "idle",
      list_type: "photo_favorites",
      materialized_relative_prefix: `${G1}/Favorites/s1`,
    });
    mem.assets.set("a1", photoAsset("a1", "k2"));
    const galleries = new Map<string, Row>([[G1, baseGalleryPhoto()]]);
    wireGalleriesCollection(mem.db, galleries);

    const out = await materializeProofingList({
      db: mem.db,
      actingUid: PHOTOGRAPHER,
      galleryId: G1,
      listId,
      galleryRow: galleries.get(G1)! as Parameters<typeof materializeProofingList>[0]["galleryRow"],
    });
    expect(out.ok).toBe(true);
    expect(mem.lists.get(listId)!.materialized_linked_drive_id).toBe(LINKED_DRIVE);
  });

  it("zero rows written + loadExistingKeys error => failed", async () => {
    const mem = createProofingMemDb();
    const listId = "list_fail_keys";
    mem.lists.set(listId, {
      gallery_id: G1,
      asset_ids: ["a1"],
      status: "submitted",
      materialization_state: "idle",
      list_type: "photo_favorites",
      materialized_relative_prefix: `${G1}/Favorites/f1`,
    });
    mem.assets.set("a1", photoAsset("a1", "k3"));
    const galleries = new Map<string, Row>([[G1, baseGalleryPhoto()]]);
    wireGalleriesCollection(mem.db, galleries);

    const spy = vi
      .spyOn(favoritesWriteContext, "loadExistingProofingObjectKeys")
      .mockRejectedValueOnce(new Error("simulated indexer failure"));

    const out = await materializeProofingList({
      db: mem.db,
      actingUid: PHOTOGRAPHER,
      galleryId: G1,
      listId,
      galleryRow: galleries.get(G1)! as Parameters<typeof materializeProofingList>[0]["galleryRow"],
    });
    spy.mockRestore();

    expect(out.ok).toBe(false);
    expect(mem.lists.get(listId)!.materialization_state).toBe("failed");
    expect(mem.backupRows.length).toBe(0);
  });

  it("at least one row written + later error => partial and keeps rows", async () => {
    const mem = createProofingMemDb();
    let commits = 0;
    mem.setBatchCommitHook(() => {
      commits++;
      if (commits >= 2) throw new Error("second batch blowup");
    });

    const listId = "list_partial";
    const ids = Array.from({ length: 401 }, (_, i) => `a${i}`);
    const assetIds = ids.map((id) => id);
    mem.lists.set(listId, {
      gallery_id: G1,
      asset_ids: assetIds,
      status: "submitted",
      materialization_state: "idle",
      list_type: "photo_favorites",
      materialized_relative_prefix: `${G1}/Favorites/big`,
    });
    for (let i = 0; i < 401; i++) {
      mem.assets.set(`a${i}`, photoAsset(`a${i}`, `key-${i}`));
    }
    const galleries = new Map<string, Row>([[G1, baseGalleryPhoto()]]);
    wireGalleriesCollection(mem.db, galleries);

    const out = await materializeProofingList({
      db: mem.db,
      actingUid: PHOTOGRAPHER,
      galleryId: G1,
      listId,
      galleryRow: galleries.get(G1)! as Parameters<typeof materializeProofingList>[0]["galleryRow"],
    });
    mem.setBatchCommitHook(null);

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.materialization_state).toBe("partial");
    expect(mem.backupRows.length).toBe(400);
    expect(mem.lists.get(listId)!.materialization_state).toBe("partial");
  });

  it("retry fills only missing keys under the same prefix (does not wipe prior backup_files)", async () => {
    const mem = createProofingMemDb();
    const listId = "list_retry";
    const prefix = `${G1}/Favorites/retry`;
    mem.lists.set(listId, {
      gallery_id: G1,
      asset_ids: ["a1"],
      status: "submitted",
      materialization_state: "idle",
      list_type: "photo_favorites",
      materialized_relative_prefix: prefix,
    });
    mem.assets.set("a1", photoAsset("a1", "rk1"));
    const galleries = new Map<string, Row>([[G1, baseGalleryPhoto()]]);
    wireGalleriesCollection(mem.db, galleries);

    const r1 = await materializeProofingList({
      db: mem.db,
      actingUid: PHOTOGRAPHER,
      galleryId: G1,
      listId,
      galleryRow: galleries.get(G1)! as Parameters<typeof materializeProofingList>[0]["galleryRow"],
    });
    expect(r1.ok).toBe(true);
    const firstCount = mem.backupRows.length;

    const cur = mem.lists.get(listId)!;
    mem.lists.set(listId, { ...cur, asset_ids: ["a1", "a2"] });
    mem.assets.set("a2", photoAsset("a2", "rk2"));

    const r2 = await materializeProofingList({
      db: mem.db,
      actingUid: PHOTOGRAPHER,
      galleryId: G1,
      listId,
      galleryRow: galleries.get(G1)! as Parameters<typeof materializeProofingList>[0]["galleryRow"],
    });
    expect(r2.ok).toBe(true);
    expect(mem.backupRows.length).toBe(firstCount + 1);
    const objectKeys = mem.backupRows.map((r) => r.data.object_key as string);
    expect(objectKeys).toContain("rk1");
    expect(objectKeys).toContain("rk2");
  });

  it("all eligible handled => complete", async () => {
    const mem = createProofingMemDb();
    const listId = "list_complete";
    mem.lists.set(listId, {
      gallery_id: G1,
      asset_ids: ["a1"],
      status: "submitted",
      materialization_state: "idle",
      list_type: "photo_favorites",
      materialized_relative_prefix: `${G1}/Favorites/c1`,
    });
    mem.assets.set("a1", photoAsset("a1", "kc1"));
    const galleries = new Map<string, Row>([[G1, baseGalleryPhoto()]]);
    wireGalleriesCollection(mem.db, galleries);

    const out = await materializeProofingList({
      db: mem.db,
      actingUid: PHOTOGRAPHER,
      galleryId: G1,
      listId,
      galleryRow: galleries.get(G1)! as Parameters<typeof materializeProofingList>[0]["galleryRow"],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.materialization_state).toBe("complete");
    expect(mem.lists.get(listId)!.materialization_state).toBe("complete");
  });
});

describe("mergeAllProofingLists", () => {
  it("creates a new proofing_merge_runs doc on each call and uses distinct merge_slug / prefix", async () => {
    const mem = createProofingMemDb();
    mem.lists.set("l1", {
      gallery_id: G1,
      asset_ids: ["a1"],
      status: "submitted",
      list_type: "photo_favorites",
      materialization_state: "idle",
    });
    mem.assets.set("a1", photoAsset("a1", "mk1"));
    const galleries = new Map<string, Row>([[G1, baseGalleryPhoto()]]);
    wireGalleriesCollection(mem.db, galleries);

    const r1 = await mergeAllProofingLists({
      db: mem.db,
      actingUid: PHOTOGRAPHER,
      galleryId: G1,
      galleryRow: galleries.get(G1)! as Parameters<typeof mergeAllProofingLists>[0]["galleryRow"],
      shellContext: "personal",
    });
    const r2 = await mergeAllProofingLists({
      db: mem.db,
      actingUid: PHOTOGRAPHER,
      galleryId: G1,
      galleryRow: galleries.get(G1)! as Parameters<typeof mergeAllProofingLists>[0]["galleryRow"],
      shellContext: "personal",
    });

    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    const runs = [...(mem.mergeRuns.get(G1)?.values() ?? [])];
    expect(runs.length).toBe(2);
    expect(r1.merge_slug).not.toBe(r2.merge_slug);
    expect(r1.merge_relative_prefix).not.toBe(r2.merge_relative_prefix);
  });
});

describe("loadExistingProofingObjectKeys (real impl on mem backup_files)", () => {
  it("scopes by linked_drive, gallery_id, org, and list folder prefix", async () => {
    const mem = createProofingMemDb();
    const prefix = `${G1}/Favorites/pf`;
    mem.backupRows.push({
      id: "b1",
      data: {
        linked_drive_id: LINKED_DRIVE,
        gallery_id: G1,
        organization_id: "org1",
        relative_path: `${prefix}/a.jpg`,
        object_key: "ok-in",
        deleted_at: null,
        lifecycle_state: BACKUP_LIFECYCLE_ACTIVE,
      },
    });
    mem.backupRows.push({
      id: "b2",
      data: {
        linked_drive_id: LINKED_DRIVE,
        gallery_id: G1,
        organization_id: "org1",
        relative_path: `${G1}/Favorites/other/x.jpg`,
        object_key: "ok-out",
        deleted_at: null,
        lifecycle_state: BACKUP_LIFECYCLE_ACTIVE,
      },
    });

    const keys = await favoritesWriteContext.loadExistingProofingObjectKeys(
      mem.db,
      G1,
      LINKED_DRIVE,
      "org1",
      prefix
    );
    expect(keys.has("ok-in")).toBe(true);
    expect(keys.has("ok-out")).toBe(false);
  });
});

type GalleryRowRt = Row & { photographer_id: string };

let routeGallery: GalleryRowRt;
let routeListDocs: { id: string; data: () => Row }[];
let newListCounter = 0;
const createdListRows = new Map<string, Row>();

function buildRouteFirestore() {
  return {
    getAll: async (
      ...refs: Array<{ get: () => Promise<{ exists: boolean; data: () => Row }> }>
    ) => Promise.all(refs.map((r) => r.get())),
    collection(name: string) {
      if (name === "galleries") {
        return {
          doc: (gid: string) => ({
            get: async () => ({
              exists: true,
              id: gid,
              data: (): Row => routeGallery,
            }),
            update: async (patch: Row) => {
              applyGalleryPatchMutable(routeGallery, patch);
            },
          }),
        };
      }
      if (name === "gallery_assets") {
        return {
          doc: (id: string) => ({
            get: async () => {
              const a = routeListDocs
                .flatMap((d) => (d.data().asset_ids as string[]) ?? [])
                .includes(id);
              if (!a) return { exists: false, id, data: () => ({}) };
              return {
                exists: true,
                id,
                data: (): Row => ({
                  gallery_id: G1,
                  media_type: "image",
                  name: `${id}.jpg`,
                  object_key: `ok-${id}`,
                }),
              };
            },
          }),
        };
      }
      if (name === "favorites_lists") {
        return {
          doc: (id?: string) => {
            const docId = id ?? `nl_${++newListCounter}`;
            return {
              id: docId,
              set: async (data: Row) => {
                createdListRows.set(docId, data);
              },
              get: async () => {
                const row = createdListRows.get(docId);
                return row
                  ? { exists: true, id: docId, data: () => row }
                  : { exists: false, id: docId, data: () => ({}) };
              },
            };
          },
          where(field: string, _op: string, value: unknown) {
            void field;
            const chain = {
              where(field2: string, _op2: string, value2: unknown) {
                void field2;
                return {
                  orderBy: () => ({
                    limit: () => ({
                      get: async () => ({
                        docs: routeListDocs.filter((d) => {
                          const x = d.data();
                          return (
                            x.gallery_id === value &&
                            String(x.client_email ?? "").toLowerCase() === String(value2).toLowerCase()
                          );
                        }),
                      }),
                    }),
                  }),
                };
              },
              orderBy: () => ({
                limit: () => ({
                  get: async () => ({
                    docs: routeListDocs.filter((d) => d.data().gallery_id === value),
                  }),
                }),
              }),
            };
            return chain;
          },
        };
      }
      if (name === "asset_comments") {
        return { where: () => ({ orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) }) };
      }
      throw new Error(`route: unexpected collection ${name}`);
    },
  };
}

const routeHarness = { verifyIdToken: vi.fn() };

vi.mock("@/lib/firebase-admin", () => ({
  verifyIdToken: (t: string) => routeHarness.verifyIdToken(t),
  getAdminFirestore: () => buildRouteFirestore(),
}));

vi.mock("@/lib/gallery-owner-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gallery-owner-access")>();
  return {
    ...actual,
    userCanManageGalleryAsPhotographer: (uid: string, data: GalleryRowRt) =>
      Promise.resolve(uid === data.photographer_id),
    galleryNotificationRecipientUserId: () => PHOTOGRAPHER,
  };
});

vi.mock("@/lib/notification-service", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

import { GET as favoritesGET } from "@/app/api/galleries/[id]/favorites/route";
import { POST as favoritesPOST } from "@/app/api/galleries/[id]/favorites/route";
import { POST as selectsPOST } from "@/app/api/galleries/[id]/selects/route";
import { POST as deprecatedCreateFolderPOST } from "@/app/api/galleries/[id]/create-favorite-folder/route";

describe("proofing HTTP routes", () => {
  beforeEach(() => {
    routeGallery = {
      photographer_id: PHOTOGRAPHER,
      access_mode: "public",
      password_hash: null,
      pin_hash: null,
      invited_emails: [],
      expiration_date: null,
      title: "T",
      gallery_type: "photo",
      allow_favorites: true,
    };
    routeListDocs = [];
    newListCounter = 0;
    createdListRows.clear();
    routeHarness.verifyIdToken.mockImplementation(async (token: string) => {
      if (token === "tok_ok") return { uid: PHOTOGRAPHER };
      throw new Error("bad");
    });
  });

  it("POST /favorites returns 400 for video gallery (use selects)", async () => {
    routeGallery = { ...routeGallery, gallery_type: "video" };
    const req = new Request(`http://localhost/api/galleries/${G1}/favorites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_ids: ["x1"] }),
    });
    const res = await favoritesPOST(req, { params: Promise.resolve({ id: G1 }) });
    expect(res.status).toBe(400);
    const b = (await res.json()) as { error: string };
    expect(b.error).toBe("use_selects_endpoint");
  });

  it("POST /selects returns 400 for photo gallery", async () => {
    routeGallery = { ...routeGallery, gallery_type: "photo" };
    const req = new Request(`http://localhost/api/galleries/${G1}/selects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_ids: ["x1"] }),
    });
    const res = await selectsPOST(req, { params: Promise.resolve({ id: G1 }) });
    expect(res.status).toBe(400);
    const b = (await res.json()) as { error: string };
    expect(b.error).toBe("use_favorites_endpoint");
  });

  it("GET /favorites hides archived lists by default for manager", async () => {
    routeListDocs = [
      {
        id: "l_active",
        data: () => ({
          gallery_id: G1,
          client_email: null,
          client_name: null,
          asset_ids: [],
          created_at: { toDate: () => new Date("2024-06-01") },
          list_type: "photo_favorites",
          title: null,
          status: "submitted",
          materialization_state: "idle",
        }),
      },
      {
        id: "l_arch",
        data: () => ({
          gallery_id: G1,
          client_email: null,
          client_name: null,
          asset_ids: [],
          created_at: { toDate: () => new Date("2024-06-02") },
          list_type: "photo_favorites",
          title: null,
          status: "archived",
          materialization_state: "idle",
        }),
      },
    ];
    const req = new Request(`http://localhost/api/galleries/${G1}/favorites`, {
      headers: { Authorization: "Bearer tok_ok" },
    });
    const res = await favoritesGET(req, { params: Promise.resolve({ id: G1 }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lists: { id: string }[] };
    expect(body.lists.map((x) => x.id)).toEqual(["l_active"]);
  });

  it("POST /create-favorite-folder returns 410", async () => {
    const req = new Request(`http://localhost/api/galleries/${G1}/create-favorite-folder`, {
      method: "POST",
      headers: { Authorization: "Bearer tok_ok" },
    });
    const res = await deprecatedCreateFolderPOST(req, { params: Promise.resolve({ id: G1 }) });
    expect(res.status).toBe(410);
  });
});
