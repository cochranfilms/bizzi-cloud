# Delete lifecycle: storage and `object_key` references

This note locks behavior for `pending_permanent_delete` and B2 cleanup so cron, user permanent-delete, and workers stay aligned.

## Hard delete vs tombstone

- **Hard delete:** The `backup_files` document is removed after successful or safely skipped storage cleanup. There is **no** long-lived tombstone row in `backup_files` for normal user/cron purge. Orphan B2 keys are handled by `orphan-cleanup` if deletes fail transiently.
- **Tombstone (not default):** A future mode could keep a minimal doc for audit; that would require new fields, queries, and UI — **not** enabled today.

## `object_key` reference counting with `pending_permanent_delete`

- A row in **`pending_permanent_delete`** still exists in Firestore until the worker runs; it **still counts** as a reference to its `object_key`.
- **Rule:** Before deleting B2 content for a key, the purge implementation queries `backup_files` for other docs with the same `object_key`. Those docs include any still-queued or in-progress purge rows. **Only when no other referencing `backup_files` doc remains** may B2 objects (content, proxy, thumbnails, etc.) be deleted.
- **Idempotency:** Retries and overlapping jobs must remain safe: deleting an already-removed object is acceptable; the reference check is the guard against premature shared-key deletion.

## Drive item counts (`/api/files/drive-item-counts`)

Trash vs active counts still use Firestore `deleted_at` predicates with `count()` aggregations for performance. Pending permanent-delete rows keep `deleted_at` set, so they remain counted as “trash” until the worker removes the doc; this matches “not active” semantics. A future index-backed `lifecycle_state` aggregation could tighten semantics if product needs exact “restorable trash only” counts.

## Gallery-rich purge jobs

- Jobs with `purge_variant: "gallery_rich"` run `purgeGalleryStoredBackupFileAdmin`, which removes gallery-specific derivatives (Mux, cover LUT, etc.) before deleting the `backup_files` row, using the same reference rule for the content `object_key`.
