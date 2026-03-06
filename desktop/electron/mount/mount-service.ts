/**
 * Mount Service - Orchestrates mount lifecycle.
 * Requires fuse-native + macFUSE (macOS) or WinFsp (Windows).
 * To enable: npm install fuse-native, then brew install macfuse (macOS)
 */
import * as path from "path";

export interface MountOptions {
  mountPoint: string;
  cacheBaseDir: string;
  apiBaseUrl: string;
  getAuthToken: () => Promise<string | null>;
}

export class MountService {
  private mounted = false;
  private mountPoint = "";

  async mount(options: MountOptions): Promise<void> {
    if (this.mounted) {
      throw new Error("Already mounted");
    }

    try {
      // Try to use fuse-native if available
      const fuseNative = await this.loadFuseNative();
      if (fuseNative) {
        await fuseNative.mount(options.mountPoint, {
          cacheDir: path.join(options.cacheBaseDir, "stream-cache"),
          localStoreDir: path.join(options.cacheBaseDir, "local-store"),
          apiBaseUrl: options.apiBaseUrl,
          getToken: options.getAuthToken,
        });
        this.mounted = true;
        this.mountPoint = options.mountPoint;
      } else {
        throw new Error(
          "FUSE not available. Install macFUSE (macOS) or WinFsp (Windows), then: npm install fuse-native"
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Mount failed: ${msg}. Ensure macFUSE (macOS) or WinFsp (Windows) is installed.`
      );
    }
  }

  async unmount(): Promise<void> {
    if (!this.mounted) return;
    try {
      const fuseNative = await this.loadFuseNative();
      if (fuseNative) {
        await fuseNative.unmount(this.mountPoint);
      }
    } finally {
      this.mounted = false;
      this.mountPoint = "";
    }
  }

  isMounted(): boolean {
    return this.mounted;
  }

  private async loadFuseNative(): Promise<{ mount: Function; unmount: Function } | null> {
    try {
      const fuse = require("fuse-native");
      return fuse;
    } catch {
      return null;
    }
  }
}
