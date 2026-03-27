# Final Cut library (`.fcpbundle`) — production readiness

**Do not treat `.fcpbundle` support as complete** until this checklist is executed on real hardware and signed off.

## 1. Writer audit (reference)

All paths that **create** or **materially change** `backup_files` rows relevant to macOS packages should:

- set denormalized package fields from `macos_package*` / `macosPackageFirestoreFieldsFromRelativePath(relative_path)` where appropriate; and  
- join `macos_package_containers` via `linkBackupFileToMacosPackageContainer` (or the full **`reconcileMacosPackageMembershipForBackupFile`** when path/drive changes).

| Area | Path | Create / metadata | Container link / reconcile |
|------|------|-------------------|----------------------------|
| Web upload (small) | `src/app/api/uppy/presigned-complete/route.ts` | spread + `linkBackupFileToMacosPackageContainer` | — |
| Web upload (multipart) | `src/app/api/uppy/s3/multipart/[uploadId]/complete/route.ts` | spread + link | — |
| Desktop mount upload | `src/app/api/mount/upload-complete/route.ts` | spread + link | — |
| Mount rename (WebDAV) | `src/app/api/mount/rename/route.ts` | updates `relative_path` | `reconcileMacosPackageMembershipForBackupFile` per row |
| Mount delete (WebDAV) | `src/app/api/mount/delete/route.ts` | soft-delete | `mergeMacosPackageTrashDeltasInto` + `applyMacosPackageDelta` |
| App trash API | `src/app/api/files/trash/route.ts` | soft-delete | package negative deltas |
| App restore API | `src/app/api/files/restore/route.ts` | clears `deleted_at` | positive deltas + **reconcile** per row |
| Permanent delete | `src/app/api/backup/permanent-delete/route.ts` | hard delete | **active** rows only: `applyMacosPackageStatsForActiveBackupFileRemoval` (trashed rows were decremented on trash) |
| Cron trash cleanup | `src/app/api/cron/trash-cleanup/route.ts` | hard delete trashed | **no** package delta (already applied on trash) |
| Gallery delete (with files) | `src/app/api/galleries/[id]/route.ts` | soft-delete | trash-style package deltas |
| Gallery asset hard delete | `src/lib/delete-gallery-asset.ts` | hard delete | `applyMacosPackageStatsForActiveBackupFileRemoval` |
| Favorite-folder batch | `src/app/api/galleries/[id]/create-favorite-folder/route.ts` | spread + link batch | — |
| Cold → hot restore | `src/lib/cold-storage-restore.ts` | spread + post-batch link | — |
| Client sync upload | `BackupContext` (`startSync` / `uploadSingleFile` / gallery upload / `UploadManager`) | spread + `/api/packages/link-backup-file` | — |
| Client rename / move | `src/hooks/useCloudFiles.ts` | Firestore `relative_path` / `linked_drive_id` | **`POST /api/files/reconcile-macos-package`** |

**Does not change package membership** (metadata / proxy only): `extract-metadata`, `proxy-queue`, `mux`, `generate-proxy`, `cron/proxy-generation`, etc.

**Known gaps / follow-ups**

- **`POST /api/mount/rename`** and **`POST /api/mount/delete`** still scope queries primarily by `userId`; org-only or mixed WebDAV flows may need parity with org-aware queries used elsewhere.
- **Move-to-trash from UI** on synthetic `macos-pkg:*` rows expands to member `backup_file` IDs in `FileGrid`; ensure QA covers “trash whole library from package row.”
- **Marketing**: avoid claiming “true Final Cut Pro library support” until QA below passes.

---

## 2. Container consistency (what we guarantee)

| Event | Behavior |
|-------|----------|
| **Trash** (API, mount delete, gallery soft-delete) | Negative `file_count` / `total_bytes` on `macos_package_id` (while doc still holds `macos_package_id`). |
| **Restore** | Positive delta to package id stored on doc, then **reconcile** so path ↔ container stay consistent. |
| **Permanent delete** | If `deleted_at` is null, one negative decrement; if already trashed, **no** second decrement. |
| **Rename / path change** | `reconcileMacosPackageMembershipForBackupFile`: leave old container, join new (or clear fields if path leaves bundle). |
| **Drive change (client move)** | Same `reconcile` after `linked_drive_id` change (`macosPackageContainerDocId` includes `linked_drive_id`). |

---

## 3. QA plan (real Final Cut Pro libraries)

**Environment**

- macOS with Final Cut Pro installed (production-like version you ship against).
- Stable network; B2 and Firestore indexes deployed (including `backup_files`: `macos_package_id`, `deleted_at`, `relative_path`).

### 3.1 Upload & ingest

1. Create a **small** test library (`File → New Library`) and add a few clips; note library name.
2. Upload the `.fcpbundle` via **web** (folder / flat upload) into **Storage** (preserve inner paths).
3. Confirm in the app: **one package row** (or folder view consistent with design), member files not duplicated as loose rows where hidden-by-package applies.
4. Repeat via **desktop mount / WebDAV** if you ship it: copy bundle into mounted Storage; confirm `backup_files` rows and package list.

### 3.2 One-click restore (ZIP)

1. From the package row, **Download package (ZIP)**.
2. On macOS, unzip to a **short path** (avoid deep paths for first test).
3. **Expected:** ZIP entries preserve `relative_path` segments (e.g. `MyLib.fcpbundle/...`).
4. Open the `.fcpbundle` in Final Cut Pro; **Expected:** library opens without “missing media” for assets that were fully uploaded.

### 3.3 Trash / restore / permanent delete

1. Trash the package (row action or member trash); confirm package aggregates drop; list view / download behavior matches policy.
2. Restore from **Deleted files**; confirm aggregates and reconcile (row visible again, ZIP still works).
3. Trash again, then **permanent delete**; confirm no orphan container explosions (empty containers may remain until a future cleanup job).

### 3.4 Rename & move (regression)

1. **WebDAV / mount rename:** rename the bundle folder or a parent folder; confirm ZIP download still contains correct tree and FCP opens.
2. **In-app rename** a member file inside the bundle path (if supported); run reconcile via API (automatic from `useCloudFiles`).
3. **Move** file or bundle-related paths between drives (if product allows); confirm reconcile and aggregates.

### 3.5 Scale / timeout

1. Test a **large** library (multi-GB, many events) upload and **single ZIP download**; confirm `maxDuration` / infra limits and user messaging if timeout occurs.
2. Document maximum practical library size for v1.

### 3.6 Sign-off

- [ ] Small library: upload → ZIP → unzip → FCP open — **pass**
- [ ] Large library: upload + download — **pass / documented limit**
- [ ] Trash / restore / permanent delete — **pass**
- [ ] Rename (mount + in-app) — **pass**
- [ ] Indexes deployed — **pass**

Record **FCP version**, **macOS version**, and **build / commit** in your release notes when marking support complete.
