# Mount delete policy (draft)

This document gates wiring `src/app/api/mount/delete/route.ts` into the shared backup-files trash domain (`backup-files-trash-domain.ts`). Until these rules are accepted, mount delete remains independent.

## Permission parity

- **Option A (strict):** Mount uses the same `assertCanTrashBackupFile` / org seat / drive-owner rules as web, evaluated per resolved `backup_files` id after path → id resolution.
- **Option B (documented subset):** Mount may delete only when the mount token is scoped to a drive owned by the token subject and the path prefix is inside that drive’s namespace. If B is chosen, implement explicit helpers rather than reusing web assertions piecemeal.

## Path-prefix deletes

- Define whether a prefix delete may mark **all** `backup_files` with matching `linked_drive_id` and `relative_path` prefix, including nested folders.
- Require explicit caps (max expanded rows) and behavior when the count exceeds the cap (reject vs require confirmation token).

## macOS packages

- State whether mount expands `macos-pkg:*` synthetic ids the same way as web (`expandTrashInputIdsWithMacosPackages`) or uses path-only expansion.
- Confirm package aggregate updates (`macos_package_containers`) follow the same deltas as web trash.

## Synthetic ids

- Document how `macos-pkg:*` rows that never appear in mount inputs are handled (skip vs infer from path).

## Lifecycle / audit

- All mount mutations that move rows to or from trash should pass `source: "mount"` into the domain layer once wired, and emit the same audit shape as web.

When product signs off on the choices above, update this file with the selected options and only then refactor the mount route onto the shared domain.
