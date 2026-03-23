/**
 * PrefetchCache - Range cache for object_key + byte range.
 * Used by PrefetchService (put) and WebDAV handleGet (get).
 * Never reads from the mounted path; avoids feedback loops.
 */
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const MAX_CACHE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

function objectKeyToHash(objectKey: string): string {
  return crypto.createHash("sha256").update(objectKey).digest("hex").slice(0, 16);
}

export class PrefetchCache {
  constructor(private cacheDir: string) {}

  async init(): Promise<void> {
    await fs.promises.mkdir(this.cacheDir, { recursive: true });
  }

  private chunkPath(objectKey: string, rangeStart: number, rangeEnd: number): string {
    const hash = objectKeyToHash(objectKey);
    const safe = `${hash}_${rangeStart}_${rangeEnd}.bin`;
    return path.join(this.cacheDir, safe);
  }

  private parseChunkPath(filename: string): { rangeStart: number; rangeEnd: number } | null {
    const match = filename.match(/^[a-f0-9]+_(\d+)_(\d+)\.bin$/);
    if (!match) return null;
    return { rangeStart: parseInt(match[1], 10), rangeEnd: parseInt(match[2], 10) };
  }

  /** Get cached bytes for the given range. Returns null on miss. */
  async get(objectKey: string, rangeStart: number, rangeEnd: number): Promise<Buffer | null> {
    const hash = objectKeyToHash(objectKey);
    const prefix = path.join(this.cacheDir, `${hash}_`);
    let entries: string[];
    try {
      entries = await fs.promises.readdir(this.cacheDir);
    } catch {
      return null;
    }

    const matching = entries
      .filter((e) => e.startsWith(hash + "_"))
      .map((e) => {
        const parsed = this.parseChunkPath(e);
        return parsed ? { ...parsed, file: e } : null;
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .filter((e) => e.rangeStart <= rangeStart && e.rangeEnd >= rangeEnd);

    if (matching.length === 0) return null;

    // Prefer smallest containing chunk
    matching.sort((a, b) => a.rangeEnd - a.rangeStart - (b.rangeEnd - b.rangeStart));
    const best = matching[0];
    const filePath = path.join(this.cacheDir, best.file);

    try {
      const buf = await fs.promises.readFile(filePath);
      const offset = rangeStart - best.rangeStart;
      const len = rangeEnd - rangeStart + 1;
      return buf.subarray(offset, offset + len);
    } catch {
      return null;
    }
  }

  /** Store bytes in the cache. */
  async put(objectKey: string, rangeStart: number, rangeEnd: number, data: Buffer): Promise<void> {
    const filePath = this.chunkPath(objectKey, rangeStart, rangeEnd);
    try {
      await fs.promises.writeFile(filePath, data, { flag: "wx" });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") return;
      throw err;
    }
    await this.evictIfNeeded();
  }

  private async evictIfNeeded(): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(this.cacheDir, { withFileTypes: true });
    } catch {
      return;
    }

    const files = await Promise.all(
      entries
        .filter((e) => e.isFile() && e.name.endsWith(".bin"))
        .map(async (e) => {
          const p = path.join(this.cacheDir, e.name);
          const stat = await fs.promises.stat(p).catch(() => null);
          return stat ? { path: p, mtime: stat.mtimeMs, size: stat.size } : null;
        })
    );

    const valid = files.filter((f): f is NonNullable<typeof f> => f !== null);
    const total = valid.reduce((s, f) => s + f.size, 0);
    if (total <= MAX_CACHE_BYTES) return;

    valid.sort((a, b) => a.mtime - b.mtime);
    let freed = 0;
    for (const f of valid) {
      if (total - freed <= MAX_CACHE_BYTES) break;
      try {
        await fs.promises.unlink(f.path);
        freed += f.size;
      } catch {
        // ignore
      }
    }
  }
}
