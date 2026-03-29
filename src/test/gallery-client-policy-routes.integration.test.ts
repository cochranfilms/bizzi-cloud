/**
 * Gallery comments/favorites GET-empty vs manager, POST 403 when disabled, download is_downloadable.
 * Mocks Firestore + auth; no real I/O.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type GalleryRow = Record<string, unknown>;
type CommentRow = {
  id: string;
  gallery_id: string;
  asset_id: string;
  body: string;
  client_email?: string | null;
  client_name?: string | null;
  created_at: { toDate: () => Date };
};
type AssetRow = Record<string, unknown> & { id?: string };

const GALLERY_ID = "gal_1";
const ASSET_ID = "asset_1";
const PHOTOGRAPHER_ID = "uid_photog";

let galleryRow: GalleryRow;
let commentsRows: CommentRow[];
let assetRows: AssetRow[];

function commentSnap(d: CommentRow) {
  return {
    id: d.id,
    data: () => ({
      asset_id: d.asset_id,
      client_email: d.client_email ?? null,
      client_name: d.client_name ?? null,
      body: d.body,
      created_at: d.created_at,
    }),
  };
}

function buildMockFirestore() {
  return {
    getAll: async (
      ...refs: Array<{ get: () => Promise<{ exists: boolean; id: string; data: () => AssetRow }> }>
    ) => Promise.all(refs.map((r) => r.get())),
    collection(name: string) {
      if (name === "galleries") {
        return {
          doc: (docId: string) => ({
            get: async () => ({
              exists: true,
              id: docId,
              data: (): GalleryRow => galleryRow,
            }),
            update: async () => undefined,
          }),
        };
      }
      if (name === "gallery_assets") {
        return {
          doc: (docId: string) => ({
            get: async () => {
              const row = assetRows.find((a) => a.id === docId);
              if (!row) return { exists: false, id: docId, data: () => ({}) };
              return {
                exists: true,
                id: docId,
                data: () => row,
              };
            },
          }),
          where(_field: string, _op: string, value: unknown) {
            const filters: Record<string, unknown> = {};
            const chain = {
              where(field2: string, _op2: string, value2: unknown) {
                filters[field2] = value2;
                return {
                  where(field3: string, _op3: string, value3: unknown) {
                    filters[field3] = value3;
                    return {
                      limit: (_n?: number) => ({
                        get: async () => {
                          const ok = assetRows.filter((a) => {
                            if (a.gallery_id !== value) return false;
                            if (filters.object_key != null && a.object_key !== filters.object_key)
                              return false;
                            if (
                              filters.is_visible != null &&
                              a.is_visible !== filters.is_visible
                            )
                              return false;
                            return true;
                          });
                          return {
                            empty: ok.length === 0,
                            docs: ok.map((a) => ({
                              data: () => a,
                            })),
                          };
                        },
                      }),
                    };
                  },
                  limit: (_n?: number) => ({
                    get: async () => {
                      const ok = assetRows.filter(
                        (a) => a.gallery_id === value && a.object_key === value2
                      );
                      return {
                        empty: ok.length === 0,
                        docs: ok.map((a) => ({ data: () => a })),
                      };
                    },
                  }),
                };
              },
            };
            filters[_field] = value;
            return chain;
          },
        };
      }
      if (name === "asset_comments") {
        return {
          add: async () => ({ id: "new_comment" }),
          where(field: string, _op: string, value: unknown) {
            const base = commentsRows.filter((c) => c.gallery_id === value);
            return {
              where(field2: string, _op2: string, value2: unknown) {
                return {
                  orderBy: () => ({
                    limit: () => ({
                      get: async () => ({
                        docs: base
                          .filter((c) => c.asset_id === value2)
                          .map(commentSnap),
                      }),
                    }),
                  }),
                };
              },
              orderBy: () => ({
                limit: () => ({
                  get: async () => ({
                    docs: base.map(commentSnap),
                  }),
                }),
              }),
            };
          },
        };
      }
      if (name === "favorites_lists") {
        const sampleList = (galleryId: unknown) => ({
          id: "list1",
          gallery_id: galleryId,
          asset_ids: [ASSET_ID],
          created_at: { toDate: () => new Date() },
          client_email: null as string | null,
          client_name: null as string | null,
        });
        return {
          add: async () => ({ id: "new_list" }),
          where(_field: string, _op: string, value: unknown) {
            const lists = [sampleList(value)];
            return {
              where(_f2: string, _o2: string, _v2: unknown) {
                return {
                  orderBy: () => ({
                    limit: () => ({
                      get: async () => ({
                        docs: lists.map((L) => ({
                          id: L.id,
                          data: () => L,
                        })),
                      }),
                    }),
                  }),
                };
              },
              orderBy: () => ({
                limit: () => ({
                  get: async () => ({
                    docs: lists.map((L) => ({
                      id: L.id,
                      data: () => L,
                    })),
                  }),
                }),
              }),
            };
          },
          doc: (listId: string) => ({
            get: async () => {
              const L = {
                ...sampleList(GALLERY_ID),
                id: listId,
              };
              return {
                exists: true,
                id: listId,
                data: () => L,
              };
            },
          }),
        };
      }
      if (name === "personal_team_seats") {
        return {
          doc: () => ({
            get: async () => ({ exists: false }),
          }),
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };
}

const testHarness = {
  verifyIdToken: vi.fn(),
};

vi.mock("@/lib/firebase-admin", () => ({
  verifyIdToken: (t: string) => testHarness.verifyIdToken(t),
  getAdminFirestore: () => buildMockFirestore(),
}));

vi.mock("@/lib/gallery-owner-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gallery-owner-access")>();
  return {
    ...actual,
    userCanManageGalleryAsPhotographer: (uid: string, data: GalleryRow) =>
      Promise.resolve(uid === (data.photographer_id as string)),
    galleryNotificationRecipientUserId: () => PHOTOGRAPHER_ID,
  };
});

vi.mock("@/lib/notification-service", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/b2", () => ({
  createPresignedDownloadUrl: vi.fn().mockResolvedValue("https://example.com/file"),
  isB2Configured: () => true,
}));

import { GET as commentsGET, POST as commentsPOST } from "@/app/api/galleries/[id]/comments/route";
import { GET as favoritesGET, POST as favoritesPOST } from "@/app/api/galleries/[id]/favorites/route";
import { GET as favoritesListGET } from "@/app/api/galleries/[id]/favorites/[listId]/route";
import { POST as galleryDownloadPOST } from "@/app/api/galleries/[id]/download/route";

function baseGallery(overrides: Partial<GalleryRow> = {}): GalleryRow {
  return {
    photographer_id: PHOTOGRAPHER_ID,
    access_mode: "public",
    password_hash: null,
    pin_hash: null,
    invited_emails: [],
    expiration_date: null,
    title: "T",
    allow_comments: true,
    allow_favorites: true,
    favorite_count: 0,
    ...overrides,
  };
}

beforeEach(() => {
  galleryRow = baseGallery();
  commentsRows = [
    {
      id: "c1",
      gallery_id: GALLERY_ID,
      asset_id: ASSET_ID,
      body: "hi",
      created_at: { toDate: () => new Date("2020-01-01") },
    },
  ];
  assetRows = [
    {
      id: ASSET_ID,
      gallery_id: GALLERY_ID,
      object_key: "k1",
      name: "clip.mov",
      is_visible: true,
      is_downloadable: true,
      media_type: "video",
    },
  ];
  testHarness.verifyIdToken.mockImplementation(async (token: string) => {
    if (token === "tok_photog") return { uid: PHOTOGRAPHER_ID };
    throw new Error("bad token");
  });
});

describe("comments routes", () => {
  it("GET returns empty comments for non-manager when allow_comments is false", async () => {
    galleryRow = baseGallery({ allow_comments: false });
    const req = new Request(`http://localhost/api/galleries/${GALLERY_ID}/comments`, {
      headers: {},
    });
    const res = await commentsGET(req, { params: Promise.resolve({ id: GALLERY_ID }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { comments: unknown[] };
    expect(body.comments).toEqual([]);
  });

  it("GET returns real comments for manager when allow_comments is false", async () => {
    galleryRow = baseGallery({ allow_comments: false });
    const req = new Request(`http://localhost/api/galleries/${GALLERY_ID}/comments`, {
      headers: { Authorization: "Bearer tok_photog" },
    });
    const res = await commentsGET(req, { params: Promise.resolve({ id: GALLERY_ID }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { comments: { id: string }[] };
    expect(body.comments.length).toBe(1);
    expect(body.comments[0].id).toBe("c1");
  });

  it("POST returns 403 when allow_comments is false", async () => {
    galleryRow = baseGallery({ allow_comments: false });
    const req = new Request(`http://localhost/api/galleries/${GALLERY_ID}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset_id: ASSET_ID,
        body: "x",
      }),
    });
    const res = await commentsPOST(req, { params: Promise.resolve({ id: GALLERY_ID }) });
    expect(res.status).toBe(403);
  });
});

describe("favorites routes", () => {
  it("GET returns empty lists for non-manager when allow_favorites is false", async () => {
    galleryRow = baseGallery({ allow_favorites: false });
    const req = new Request(`http://localhost/api/galleries/${GALLERY_ID}/favorites`, {
      headers: {},
    });
    const res = await favoritesGET(req, { params: Promise.resolve({ id: GALLERY_ID }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lists: unknown[] };
    expect(body.lists).toEqual([]);
  });

  it("GET returns lists for manager when allow_favorites is false", async () => {
    galleryRow = baseGallery({ allow_favorites: false });
    const req = new Request(`http://localhost/api/galleries/${GALLERY_ID}/favorites`, {
      headers: { Authorization: "Bearer tok_photog" },
    });
    const res = await favoritesGET(req, { params: Promise.resolve({ id: GALLERY_ID }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lists: { id: string }[] };
    expect(body.lists.length).toBeGreaterThanOrEqual(1);
  });

  it("POST returns 403 when allow_favorites is false", async () => {
    galleryRow = baseGallery({ allow_favorites: false });
    const req = new Request(`http://localhost/api/galleries/${GALLERY_ID}/favorites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_ids: [ASSET_ID] }),
    });
    const res = await favoritesPOST(req, { params: Promise.resolve({ id: GALLERY_ID }) });
    expect(res.status).toBe(403);
  });

  it("GET single list returns empty shape for non-manager when allow_favorites is false", async () => {
    galleryRow = baseGallery({ allow_favorites: false });
    const req = new Request(
      `http://localhost/api/galleries/${GALLERY_ID}/favorites/list1`,
      { headers: {} }
    );
    const res = await favoritesListGET(req, {
      params: Promise.resolve({ id: GALLERY_ID, listId: "list1" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { list: null; assets: unknown[] };
    expect(body.list).toBeNull();
    expect(body.assets).toEqual([]);
  });
});

describe("download route is_downloadable", () => {
  it("returns 403 for non-owner when asset is_downloadable is false", async () => {
    galleryRow = baseGallery({
      gallery_type: "video",
      download_policy: "all_assets",
      download_settings: { allow_single_download: true },
    });
    assetRows = [
      {
        id: ASSET_ID,
        gallery_id: GALLERY_ID,
        object_key: "k1",
        name: "clip.mov",
        is_visible: true,
        is_downloadable: false,
        media_type: "video",
      },
    ];
    const req = new Request(`http://localhost/api/galleries/${GALLERY_ID}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ object_key: "k1", name: "clip.mov" }),
    });
    const res = await galleryDownloadPOST(req, { params: Promise.resolve({ id: GALLERY_ID }) });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("download_disabled");
  });

  it("allows manager when is_downloadable is false", async () => {
    galleryRow = baseGallery({
      gallery_type: "video",
      download_policy: "all_assets",
      download_settings: { allow_single_download: true },
    });
    assetRows = [
      {
        id: ASSET_ID,
        gallery_id: GALLERY_ID,
        object_key: "k1",
        name: "clip.mov",
        is_visible: true,
        is_downloadable: false,
        media_type: "video",
      },
    ];
    const req = new Request(`http://localhost/api/galleries/${GALLERY_ID}/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer tok_photog",
      },
      body: JSON.stringify({ object_key: "k1", name: "clip.mov" }),
    });
    const res = await galleryDownloadPOST(req, { params: Promise.resolve({ id: GALLERY_ID }) });
    expect(res.status).toBe(200);
  });
});
