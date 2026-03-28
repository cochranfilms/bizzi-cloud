/**
 * DESTRUCTIVE: List and delete every Mux Video asset in the account.
 *
 * Run (dry run — lists count and IDs only):
 *   npm run mux:delete-all
 *
 * Actually delete all assets:
 *   npm run mux:delete-all -- --execute
 *
 * Requires .env.local: MUX_TOKEN_ID, MUX_TOKEN_SECRET
 *
 * Note: Firestore backup_files may still hold old mux_asset_id / mux_playback_id.
 * After a fresh Mux slate, re-run your ingest flow or clear those fields if needed.
 */
require("dotenv").config({ path: ".env.local" });

const MUX_API = "https://api.mux.com/video/v1";

function getAuthHeader(): string {
  const id = process.env.MUX_TOKEN_ID;
  const secret = process.env.MUX_TOKEN_SECRET;
  if (!id || !secret) {
    console.error("Set MUX_TOKEN_ID and MUX_TOKEN_SECRET in .env.local");
    process.exit(1);
  }
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

type ListResponse = {
  data?: Array<{ id?: string }>;
  next_cursor?: string | null;
};

async function listAssetsPage(cursor?: string, limit = 100): Promise<ListResponse> {
  const url = new URL(`${MUX_API}/assets`);
  url.searchParams.set("limit", String(limit));
  if (cursor) url.searchParams.set("cursor", cursor);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mux list assets failed: ${res.status} ${text}`);
  }
  return (await res.json()) as ListResponse;
}

async function deleteAsset(assetId: string): Promise<boolean> {
  const res = await fetch(`${MUX_API}/assets/${encodeURIComponent(assetId)}`, {
    method: "DELETE",
    headers: { Authorization: getAuthHeader() },
  });
  if (res.status === 204 || res.status === 404) return true;
  const text = await res.text().catch(() => "");
  console.error(`  DELETE ${assetId} failed: ${res.status} ${text}`);
  return false;
}

async function collectAllAssetIds(): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;

  for (;;) {
    const page = await listAssetsPage(cursor);
    const chunk = page.data ?? [];
    for (const row of chunk) {
      if (row.id) ids.push(row.id);
    }
    const next = page.next_cursor;
    if (!next || chunk.length === 0) break;
    cursor = next;
  }

  return ids;
}

async function main() {
  const execute = process.argv.includes("--execute");

  if (!execute) {
    console.log("DRY RUN — no assets will be deleted. Pass --execute to delete.\n");
  } else {
    console.log("*** EXECUTE — deleting ALL Mux assets in this account ***\n");
  }

  console.log("Fetching asset list from Mux…");
  const ids = await collectAllAssetIds();
  console.log(`Found ${ids.length} asset(s).\n`);

  if (ids.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  if (!execute) {
    console.log("First 20 IDs (sample):");
    ids.slice(0, 20).forEach((id) => console.log(`  ${id}`));
    if (ids.length > 20) console.log(`  … and ${ids.length - 20} more`);
    console.log("\nRun: npm run mux:delete-all -- --execute");
    return;
  }

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    process.stdout.write(`\rDeleting ${i + 1}/${ids.length}…`);
    const deleted = await deleteAsset(id);
    if (deleted) ok++;
    else fail++;
  }
  console.log(`\n\nDone. Deleted: ${ok}, failed: ${fail}`);

  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
