/**
 * Mount Service - Orchestrates mount lifecycle.
 * Requires fuse-native + macFUSE (macOS) or WinFsp (Windows).
 */
import * as fs from "fs";
import * as path from "path";

const FUSE_MOUNT_NAME = "BizziCloud";

export interface MountOptions {
  cacheBaseDir: string;
  apiBaseUrl: string;
  getAuthToken: () => Promise<string | null>;
}

export class MountService {
  private fuseInstance: { mount: (cb: (err: Error | null) => void) => void; unmount: (cb: (err: Error | null) => void) => void } | null = null;
  private mountPoint = "";

  /** Check if FUSE (fuse-native + macFUSE/WinFsp) is available */
  async isFuseAvailable(): Promise<boolean> {
    try {
      require("fuse-native");
    } catch {
      return false;
    }
    if (process.platform === "darwin") {
      const osxfusePath = "/Library/Filesystems/osxfuse.fs/configured";
      const macfusePath = "/Library/Filesystems/macfuse.fs";
      try {
        const [osxfuseExists, macfuseExists] = await Promise.all([
          fs.promises.access(osxfusePath).then(() => true).catch(() => false),
          fs.promises.access(macfusePath).then(() => true).catch(() => false),
        ]);
        return osxfuseExists || macfuseExists;
      } catch {
        return false;
      }
    }
    if (process.platform === "win32") {
      try {
        const Fuse = require("fuse-native");
        return await new Promise<boolean>((resolve) => {
          Fuse.isConfigured((err: Error | null, configured: boolean) => {
            resolve(!err && !!configured);
          });
        });
      } catch {
        return false;
      }
    }
    return true;
  }

  isMounted(): boolean {
    return !!this.fuseInstance;
  }

  async mount(options: MountOptions): Promise<void> {
    if (this.fuseInstance) {
      throw new Error("Already mounted");
    }

    const Fuse = require("fuse-native");
    const mountPoint = this.getDefaultMountPoint();

    // Ensure mount point exists
    await fs.promises.mkdir(mountPoint, { recursive: true });

    const ops = this.buildFuseOps(options.apiBaseUrl, options.cacheBaseDir);

    const fuse = new Fuse(mountPoint, ops, {
      mkdir: true,
      displayFolder: FUSE_MOUNT_NAME,
      debug: process.env.DEBUG === "1",
    });

    await new Promise<void>((resolve, reject) => {
      fuse.mount((err: Error | null) => {
        if (err) {
          reject(new Error(`Mount failed: ${err.message}`));
        } else {
          this.fuseInstance = fuse;
          this.mountPoint = mountPoint;
          resolve();
        }
      });
    });
  }

  async unmount(): Promise<void> {
    if (!this.fuseInstance) return;
    const fuse = this.fuseInstance;
    this.fuseInstance = null;
    this.mountPoint = "";

    await new Promise<void>((resolve, reject) => {
      fuse.unmount((err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  getMountPoint(): string {
    return this.mountPoint;
  }

  private getDefaultMountPoint(): string {
    if (process.platform === "darwin") {
      return path.join("/Volumes", FUSE_MOUNT_NAME);
    }
    const os = require("os");
    return path.join(os.tmpdir(), "bizzi-cloud-mount");
  }

  private buildFuseOps(_apiBaseUrl: string, _cacheBaseDir: string) {
    const Fuse = require("fuse-native");

    const stat = (attrs: { mode?: number; size?: number }) => ({
      mtime: new Date(),
      atime: new Date(),
      ctime: new Date(),
      size: attrs.size ?? 4096,
      mode: attrs.mode ?? 16877,
      uid: process.getuid?.() ?? 0,
      gid: process.getgid?.() ?? 0,
    });

    return {
      readdir(pathStr: string, cb: (err: number, names?: string[], stats?: unknown[]) => void) {
        if (pathStr === "/") {
          return cb(0, ["BizziCloud"]);
        }
        if (pathStr === "/BizziCloud") {
          return cb(0, []);
        }
        cb(Fuse.ENOENT);
      },
      getattr(pathStr: string, cb: (err: number, stat?: unknown) => void) {
        if (pathStr === "/" || pathStr === "/BizziCloud") {
          return cb(0, stat({ mode: 16877 }));
        }
        cb(Fuse.ENOENT);
      },
      open(pathStr: string, _flags: number, cb: (err: number, fd?: number) => void) {
        if (pathStr === "/" || pathStr === "/BizziCloud") {
          return cb(Fuse.EISDIR);
        }
        cb(0, 42);
      },
      release(_pathStr: string, _fd: number, cb: (err: number) => void) {
        cb(0);
      },
      opendir(pathStr: string, _flags: number, cb: (err: number, fd?: number) => void) {
        if (pathStr === "/" || pathStr === "/BizziCloud") {
          return cb(0, 43);
        }
        cb(Fuse.ENOENT);
      },
      releasedir(_pathStr: string, _fd: number, cb: (err: number) => void) {
        cb(0);
      },
      read(_pathStr: string, _fd: number, _buf: Buffer, _len: number, _pos: number, cb: (err: number, bytes?: number) => void) {
        cb(0, 0);
      },
    };
  }
}
