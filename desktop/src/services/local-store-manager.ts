import * as fs from "fs";
import * as path from "path";
import type { LocalStoreEntry, StoreStatus } from "../types/mount";

const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000];
const MAX_RETRIES = 5;

export interface LocalStoreManagerOptions {
  baseDir: string;
  apiBaseUrl: string;
  getAuthToken: () => Promise<string | null>;
  onProgress?: (entryId: string, progress: number) => void;
}

export class LocalStoreManager {
  private baseDir: string;
  private localStoreDir: string;
  private apiBaseUrl: string;
  private getAuthToken: () => Promise<string | null>;
  private onProgress?: (entryId: string, progress: number) => void;
  private deviceId: string | null = null;
  private aborted = new Set<string>();

  constructor(options: LocalStoreManagerOptions) {
    this.baseDir = options.baseDir;
    this.localStoreDir = path.join(options.baseDir, "local-store");
    this.apiBaseUrl = options.apiBaseUrl;
    this.getAuthToken = options.getAuthToken;
    this.onProgress = options.onProgress;
  }

  setDeviceId(id: string): void {
    this.deviceId = id;
  }

  getLocalStorePath(): string {
    return this.localStoreDir;
  }

  getLocalPath(userId: string, driveId: string, relativePath: string): string {
    const safePath = relativePath.replace(/^\/+/, "").replace(/\.\./g, "_");
    return path.join(this.localStoreDir, "users", userId, driveId, safePath);
  }

  async storeLocally(
    fileId: string,
    objectKey: string,
    relativePath: string,
    sizeBytes: number,
    driveId: string,
    userId: string
  ): Promise<LocalStoreEntry> {
    if (!this.deviceId) {
      throw new Error("Device not registered. Call setDeviceId first.");
    }

    const localPath = this.getLocalPath(userId, driveId, relativePath);
    await fs.promises.mkdir(path.dirname(localPath), { recursive: true });

    const token = await this.getAuthToken();
    if (!token) throw new Error("Not authenticated");

    const res = await fetch(`${this.apiBaseUrl}/api/mount/local-store`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        file_id: fileId,
        object_key: objectKey,
        device_id: this.deviceId,
        relative_path: relativePath,
        size_bytes: sizeBytes,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `Store failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      url: string;
      object_key: string;
      file_id: string;
      total_bytes: number;
    };

    const entryId = "local";
    this.aborted.delete(entryId);

    let downloadedBytes = 0;
    const totalBytes = data.total_bytes || sizeBytes;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (this.aborted.has(entryId)) {
        throw new Error("Download aborted");
      }

      try {
        const rangeHeader =
          downloadedBytes > 0
            ? { Range: `bytes=${downloadedBytes}-` }
            : undefined;

        const dlRes = await fetch(data.url, {
          headers: rangeHeader,
        });

        if (!dlRes.ok && dlRes.status !== 206) {
          throw new Error(`Download failed: ${dlRes.status}`);
        }

        const reader = dlRes.body?.getReader();
        if (!reader) throw new Error("No response body");

        const writeStream = fs.createWriteStream(localPath, {
          flags: downloadedBytes > 0 ? "a" : "w",
        });

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          writeStream.write(Buffer.from(value));
          downloadedBytes += value.length;
          const progress = Math.round((downloadedBytes / totalBytes) * 100);
          this.onProgress?.(entryId, progress);
        }
        writeStream.end();
        await new Promise<void>((resolve, reject) => {
          writeStream.on("finish", () => resolve());
          writeStream.on("error", reject);
        });

        const entry: LocalStoreEntry = {
          id: entryId,
          user_id: userId,
          device_id: this.deviceId,
          file_id: fileId,
          object_key: objectKey,
          relative_path: relativePath,
          local_path: localPath,
          store_status: "completed",
          store_progress: 100,
          total_bytes: totalBytes,
          downloaded_bytes: downloadedBytes,
          checksum: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_verified_at: new Date().toISOString(),
          offline_available: true,
          stale: false,
        };
        return entry;
      } catch (err) {
        if (attempt === MAX_RETRIES - 1) throw err;
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
      }
    }

    throw new Error("Download failed after retries");
  }

  async removeLocalCopy(localPath: string): Promise<void> {
    try {
      await fs.promises.unlink(localPath);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== "ENOENT") throw err;
    }
  }

  async getLocalPathForFile(fileId: string): Promise<string | null> {
    const statusRes = await fetch(
      `${this.apiBaseUrl}/api/mount/local-store/status?device_id=${this.deviceId}`,
      {
        headers: {
          Authorization: `Bearer ${await this.getAuthToken()}`,
        },
      }
    );
    if (!statusRes.ok) return null;
    const { entries } = (await statusRes.json()) as { entries: LocalStoreEntry[] };
    const entry = entries.find((e) => e.file_id === fileId && e.store_status === "completed");
    return entry?.local_path ?? null;
  }

  pauseDownload(entryId: string): void {
    this.aborted.add(entryId);
  }

  resumeDownload(entryId: string): void {
    this.aborted.delete(entryId);
  }

  prioritize(entryId: string): void {
    this.aborted.delete(entryId);
  }
}
