/**
 * Resolve UI synthetic macOS package row IDs (`macos-pkg:…`) to all active backup_files
 * doc IDs for trash/move. Client views only load a page of files, so expansion must run on the server.
 */
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";

export const MACOS_PACKAGE_ROW_ID_PREFIX = "macos-pkg:";

export async function expandTrashInputIdsWithMacosPackages(
  db: Firestore,
  inputIds: string[]
): Promise<{ ok: true; expanded: string[] } | { ok: false; error: string }> {
  const expanded: string[] = [];
  const seen = new Set<string>();

  for (const id of inputIds) {
    if (!id.startsWith(MACOS_PACKAGE_ROW_ID_PREFIX)) {
      if (!seen.has(id)) {
        seen.add(id);
        expanded.push(id);
      }
      continue;
    }

    const pkgId = id.slice(MACOS_PACKAGE_ROW_ID_PREFIX.length);
    let foundAny = false;
    let last: QueryDocumentSnapshot | undefined;
    const page = 400;

    for (;;) {
      let q = db
        .collection("backup_files")
        .where("macos_package_id", "==", pkgId)
        .where("deleted_at", "==", null)
        .orderBy("relative_path")
        .limit(page);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (snap.empty) break;
      for (const doc of snap.docs) {
        foundAny = true;
        if (!seen.has(doc.id)) {
          seen.add(doc.id);
          expanded.push(doc.id);
        }
      }
      last = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < page) break;
    }

    if (!foundAny) {
      return {
        ok: false,
        error: "macOS package not found or already deleted",
      };
    }
  }

  return { ok: true, expanded };
}
