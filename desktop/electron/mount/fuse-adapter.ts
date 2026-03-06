/**
 * FUSE Adapter - File system operations for the mounted drive.
 * Implements read, open, readdir, getattr for virtual filesystem.
 * Delegates to StreamCacheManager and LocalStoreManager.
 *
 * When fuse-native is available, this adapter handles:
 * - readdir: List drives/folders/files from API metadata
 * - getattr: File/folder attributes
 * - open/read: For files - check Local Store first, else Stream Cache, else fetch range from API
 */
export interface StreamCacheLike {
  getChunk(objectKey: string, start: number, end: number): Promise<Buffer | null>;
  putChunk(objectKey: string, start: number, end: number, data: Buffer): Promise<void>;
}

export interface FuseAdapterOptions {
  streamCache: StreamCacheLike;
  apiBaseUrl: string;
  getAuthToken: () => Promise<string | null>;
  getLocalStorePath: (fileId: string) => Promise<string | null>;
}

export class FuseAdapter {
  constructor(private options: FuseAdapterOptions) {}

  async readdir(path: string): Promise<string[]> {
    // List directory contents via /api/mount/metadata
    const token = await this.options.getAuthToken();
    if (!token) return [];
    const res = await fetch(`${this.options.apiBaseUrl}/api/mount/metadata`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ paths: [path], drive_id: this.parseDriveId(path) }),
    });
    if (!res.ok) return [];
    const { entries } = await res.json();
    return entries.map((e: { name: string }) => e.name);
  }

  async read(path: string, offset: number, length: number): Promise<Buffer> {
    // 1. Check Local Store
    const localPath = await this.getFileIdFromPath(path).then((id) =>
      id ? this.options.getLocalStorePath(id) : null
    );
    if (localPath) {
      const fs = await import("fs");
      const buf = Buffer.alloc(length);
      const fd = await fs.promises.open(localPath, "r");
      const { bytesRead } = await fd.read(buf, 0, length, offset);
      await fd.close();
      return buf.subarray(0, bytesRead);
    }

    // 2. Check Stream Cache
    const { objectKey } = this.parsePath(path);
    if (!objectKey) return Buffer.alloc(0);
    const chunk = await this.options.streamCache.getChunk(
      objectKey,
      offset,
      offset + length - 1
    );
    if (chunk) return chunk;

    // 3. Fetch from API (range request)
    const token = await this.options.getAuthToken();
    if (!token) return Buffer.alloc(0);
    const url = `${this.options.apiBaseUrl}/api/mount/range?object_key=${encodeURIComponent(objectKey)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Range: `bytes=${offset}-${offset + length - 1}`,
      },
    });
    if (!res.ok) return Buffer.alloc(0);
    const arrBuf = await res.arrayBuffer();
    const data = Buffer.from(arrBuf);
    await this.options.streamCache.putChunk(objectKey, offset, offset + data.length - 1, data);
    return data;
  }

  private parseDriveId(pathStr: string): string | null {
    const parts = pathStr.split("/").filter(Boolean);
    return parts[0] ?? null;
  }

  private parsePath(_pathStr: string): { objectKey: string } {
    return { objectKey: "" }; // TODO: map path to object_key via metadata
  }

  private async getFileIdFromPath(_pathStr: string): Promise<string | null> {
    return null; // TODO: lookup from metadata
  }
}
