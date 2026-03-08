# Personal vs Enterprise Storage Separation

## Overview

Files uploaded in the **personal dashboard** (`/dashboard/*`) are stored separately from files uploaded in the **enterprise dashboard** (`/enterprise/*`). This enables:

- **Personal storage**: Billed under the user's own Stripe subscription
- **Enterprise storage**: Billed at the organization level; org owner can see all seat holders' enterprise files

## Data Model

### linked_drives
- `organization_id`: `null` = personal drive; `orgId` = enterprise drive
- Existing drives without this field are treated as **personal** (backward compatible)

### backup_files
- `organization_id`: Matches the linked drive. `null` = personal; `orgId` = enterprise
- Set when creating files from the drive's `organization_id`

## Implementation Status

### Done
- Types: `organization_id` added to `LinkedDrive` and `BackupFile`
- BackupContext.fetchDrives: Filters by `organization_id` based on pathname (personal vs enterprise)
- BackupContext.linkDrive: Sets `organization_id` when creating drives
- BackupContext backup_files (startSync): Adds `organization_id` from drive
- BackupContext.getOrCreateUploadsDrive: Filters existing "Uploads" by `organization_id`; sets it when creating
- BackupContext.createFolder: Sets `organization_id` when creating folders
- BackupContext.uploadFiles/uploadSingleFile: Adds `organization_id` to backup_files
- useCloudFiles: Filters drives and recent files by `organization_id` (pathname-based context)
- my-storage API: Counts only `backup_files` where `organization_id == orgId`
- checkUserCanUpload: Accepts optional `driveId`; uses drive's `organization_id` for quota
- multipart-init, upload-url: Pass `driveId` to `checkUserCanUpload`
- storage/status API: Accepts `?context=enterprise|personal` for pre-upload quota check
- Firestore indexes: `linked_drives` and `backup_files` with `organization_id`
- Firestore rules: Org owners can read enterprise `linked_drives` and `backup_files`

### Future
- Org owner view: Show all seat holders' enterprise files in a unified view

## Migration

For existing data without `organization_id`, treat as personal. To explicitly set `organization_id: null` on all existing docs (enables indexed queries), run:

```bash
npx ts-node scripts/migrate-organization-id.ts
```

(Requires Firebase Admin credentials and creates the script if missing.)

## Firestore Indexes

Add for efficient queries (if using `organization_id` in queries):

```json
{
  "collectionGroup": "linked_drives",
  "fields": [
    { "fieldPath": "userId", "order": "ASCENDING" },
    { "fieldPath": "organization_id", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "backup_files",
  "fields": [
    { "fieldPath": "userId", "order": "ASCENDING" },
    { "fieldPath": "organization_id", "order": "ASCENDING" },
    { "fieldPath": "modified_at", "order": "DESCENDING" }
  ]
}
```

## Firestore Rules

Update `backup_files` and `linked_drives` to allow org owners to read enterprise files (where `organization_id` matches their org). Current rules allow read if `userId == request.auth.uid` or if the linked drive belongs to the user. For org owner viewing seat holders' files, add a rule that allows read when `resource.data.organization_id == orgId` and the requester is an admin of that org.
