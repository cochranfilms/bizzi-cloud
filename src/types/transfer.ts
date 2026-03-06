export interface TransferFile {
  id: string;
  name: string;
  type: "file";
  size?: number;
  path: string;
  views: number;
  downloads: number;
}

export interface Transfer {
  id: string;
  name: string;
  clientName: string;
  clientEmail?: string;
  files: TransferFile[];
  password?: string | null;
  expiresAt: string | null;
  createdAt: string;
  status: "active" | "expired" | "cancelled";
  slug: string;
}

export interface CreateTransferInput {
  name: string;
  clientName: string;
  clientEmail?: string;
  files: Omit<TransferFile, "views" | "downloads" | "id">[];
  password?: string | null;
  expiresAt: string | null;
}
