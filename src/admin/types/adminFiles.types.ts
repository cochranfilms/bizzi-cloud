/**
 * Admin files types.
 * TODO: Align with real Bizzi Cloud API responses.
 */

export interface AdminFile {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail: string;
  sizeBytes: number;
  mimeType: string;
  extension: string;
  folderPath: string;
  status: "active" | "archived" | "trash";
  shared: boolean;
  createdAt: string;
  modifiedAt: string;
  flags?: string[];
}
