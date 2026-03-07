export interface FolderShare {
  id: string;
  token: string;
  owner_id: string;
  linked_drive_id: string;
  permission: "view" | "edit";
  access_level: "private" | "public";
  expires_at: string | null;
  created_at: string;
  invited_emails?: string[];
}

export interface CreateShareInput {
  linked_drive_id: string;
  permission: "view" | "edit";
  access_level?: "private" | "public";
  expires_at?: string | null;
  invited_emails?: string[];
}
