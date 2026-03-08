# Shared Folders: Reference-Based Sharing

## Overview

When you create a shared folder (e.g. "Share March 8, 2025" from bulk share), the system uses **reference-based sharing**. No copies of files are made; the share points to the original `backup_files` by ID. When you delete the share, only the share record is removed—your original files stay intact.

## How It Works

### Virtual Shares (Bulk Share / "Shared {date}")

- Created when sharing multiple files or folders from the file grid or home view
- `folder_shares` document stores `referenced_file_ids` (array of `backup_file` IDs)
- **No** `linked_drive_id`—no linked drive is created for the share
- Files remain in their original drives; the share is a logical view over them
- **Delete behavior**: Only the `folder_shares` document is deleted. `backup_files` are never modified or removed.

### Standard Shares (Single Folder Share)

- Created when sharing a single folder via the Share modal
- Uses `linked_drive_id` pointing to an existing `linked_drive`
- Files live in that drive; the share grants access to it
- **Delete behavior**: Only the `folder_shares` document is deleted. The `linked_drive` and its `backup_files` stay in place.

## Guarantee

**Deleting a share never deletes your original files.** Both virtual and standard shares only create a pointer. The actual `backup_files` documents and B2 objects are left untouched when a share is removed.
