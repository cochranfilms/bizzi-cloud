/**
 * Mount Service - Uses rclone + local WebDAV server.
 *
 * Spawns a WebDAV server that proxies to the Bizzi Cloud API (metadata + range),
 * then runs `rclone mount` against it. Requires rclone to be installed.
 *
 * Token refresh: The renderer should call refreshToken() periodically (e.g. every 50 min)
 * so the WebDAV server uses a fresh token for API calls after Firebase tokens expire.
 */
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { WebDAVServer } from "./webdav-server";

export interface MountOptions {
  cacheBaseDir: string;
  apiBaseUrl: string;
  getAuthToken: () => Promise<string | null>;
  resourcesDir?: string;
}

const PRODUCTION_URL = "https://www.bizzicloud.io";

/** Parses rclone log/stderr to produce user-friendly error messages */
function parseRcloneError(logFile: string, stderr: string, exitCode: number): string {
  let log = "";
  try {
    log = fs.readFileSync(logFile, "utf-8");
  } catch {
    // ignore
  }

  const combined = log || stderr;

  if (combined.includes("Homebrew") || combined.includes("not supported") || combined.includes("macFUSE")) {
    return "rclone from Homebrew does not support mount on macOS. Uninstall it (brew uninstall rclone) and install from https://rclone.org/downloads/ instead.";
  }
  if (combined.includes("FUSE") || combined.includes("osxfuse") || combined.includes("macfuse")) {
    return "macFUSE is required for mounting. Install it from https://osxfuse.github.io/ and restart your Mac.";
  }
  if (combined.includes("mount point") && (combined.includes("busy") || combined.includes("not empty"))) {
    return "Mount point is busy or not empty. Close any apps using it, then try again.";
  }
  if (combined.includes("permission denied") || combined.includes("Permission denied")) {
    return "Permission denied. Ensure you have access to the mount location.";
  }
  if (combined.includes("connection refused") || combined.includes("ECONNREFUSED")) {
    return "Could not connect to local WebDAV. Try unmounting and mounting again.";
  }

  const criticalMatch = combined.match(/CRITICAL:\s*([^\n]+)/i);
  if (criticalMatch) return criticalMatch[1].trim();

  const errorMatch = combined.match(/ERROR\s*[:\s]+([^\n]+)/i);
  if (errorMatch) return errorMatch[1].trim();

  const excerpt = (combined.slice(-800) || stderr || `Exit code ${exitCode}`).trim();
  const lastLine = excerpt.split("\n").filter(Boolean).pop();
  return lastLine && lastLine.length < 200 ? lastLine : `Mount failed. ${excerpt ? excerpt.slice(-200) : `rclone exited with code ${exitCode}`}`;
}

/** macOS arch for bundled rclone */
function getDarwinArch(): "darwin-arm64" | "darwin-amd64" {
  return process.arch === "arm64" ? "darwin-arm64" : "darwin-amd64";
}

/** Check if macFUSE is installed (filesystem bundle or FUSE libs). */
function getMacFuseStatus(): { installed: boolean; version?: string } {
  if (process.platform !== "darwin") return { installed: false };
  const fsBundle = "/Library/Filesystems/macfuse.fs";
  const fsBundleAlt = "/Library/Filesystems/macFUSE.fs";
  const bundlePath = fs.existsSync(fsBundle) ? fsBundle : fs.existsSync(fsBundleAlt) ? fsBundleAlt : null;
  if (bundlePath) {
    try {
      const { execSync } = require("child_process");
      const out = execSync(`defaults read "${bundlePath}/Contents/Info" CFBundleVersion 2>/dev/null || true`, {
        encoding: "utf-8",
      }).trim();
      return { installed: true, version: out || undefined };
    } catch {
      return { installed: true };
    }
  }
  const libPaths = ["/usr/local/lib", "/opt/homebrew/lib"];
  for (const libDir of libPaths) {
    if (
      fs.existsSync(path.join(libDir, "libfuse.2.dylib")) ||
      fs.existsSync(path.join(libDir, "libfuse.dylib"))
    ) {
      return { installed: true };
    }
  }
  return { installed: false };
}

export interface MountDependencies {
  rclone: { available: boolean; source: "bundled" | "system" | null };
  macFuse: { installed: boolean; version?: string };
}

export class MountService {
  private webdav: WebDAVServer | null = null;
  private mountPoint: string = "";
  private currentToken: string | null = null;
  private _isMounted = false;

  /**
   * Returns mount dependencies: rclone (bundled or system) and macFUSE status.
   * Use this for the dependency/installer UI.
   */
  async getMountDependencies(resourcesDir: string): Promise<MountDependencies> {
    if (process.platform !== "darwin") {
      return {
        rclone: { available: false, source: null },
        macFuse: { installed: false },
      };
    }
    const arch = getDarwinArch();
    const bundled = path.join(resourcesDir, "bin", arch, "rclone");
    const rcloneAvailable = fs.existsSync(bundled);
    let source: "bundled" | "system" | null = rcloneAvailable ? "bundled" : null;
    if (!rcloneAvailable) {
      const system = await this.findSystemRclone();
      if (system && !system.includes("Cellar") && !system.includes("/opt/homebrew/")) {
        source = "system";
      }
    }
    return {
      rclone: { available: !!source || rcloneAvailable, source: source ?? (rcloneAvailable ? "bundled" : null) },
      macFuse: getMacFuseStatus(),
    };
  }

  /**
   * rclone is used for mounting; we consider it "available" if the rclone binary exists (bundled or system).
   */
  async isFuseAvailable(): Promise<boolean> {
    try {
      const rclonePath = await this.findRclone(undefined);
      return !!rclonePath;
    } catch {
      return false;
    }
  }

  /** Prefer bundled rclone, fall back to system (excluding Homebrew). */
  private async findRclone(resourcesDir?: string): Promise<string | null> {
    if (process.platform === "darwin" && resourcesDir) {
      const arch = getDarwinArch();
      const bundled = path.join(resourcesDir, "bin", arch, "rclone");
      if (fs.existsSync(bundled)) return bundled;
    }
    return this.findSystemRclone();
  }

  private async findSystemRclone(): Promise<string | null> {
    const fromPath = await new Promise<string | null>((resolve) => {
      const proc = spawn("which", ["rclone"], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      proc.stdout?.on("data", (d) => { out += d.toString(); });
      proc.on("close", (code) => {
        if (code === 0 && out.trim()) resolve(out.trim());
        else resolve(null);
      });
    });
    if (fromPath) return fromPath;

    if (process.platform === "darwin") {
      const candidates = ["/usr/local/bin/rclone", "/opt/homebrew/bin/rclone"];
      for (const p of candidates) {
        try {
          if (fs.existsSync(p)) return p;
        } catch {
          // ignore
        }
      }
    }
    return null;
  }

  isMounted(): boolean {
    return this._isMounted;
  }

  getMountPoint(): string {
    return this.mountPoint;
  }

  /** Update the auth token used for API calls. Call periodically from the renderer (e.g. every 50 min) when mounted. */
  refreshToken(token: string | null): void {
    if (this._isMounted && token) this.currentToken = token;
  }

  async mount(options: MountOptions): Promise<void> {
    if (this.isMounted()) {
      throw new Error("Already mounted. Unmount first.");
    }

    const token = await options.getAuthToken();
    if (!token) {
      throw new Error("Not signed in. Sign in to Bizzi Cloud to mount.");
    }

    this.currentToken = token;
    // WebDAV uses getAuthToken() per request so token refresh works without remounting
    const getAuthToken = async () => this.currentToken ?? (await options.getAuthToken());

    this.webdav = new WebDAVServer({
      apiBaseUrl: options.apiBaseUrl || PRODUCTION_URL,
      getAuthToken,
    });

    const port = await this.webdav.start();
    const webdavUrl = `http://127.0.0.1:${port}`;

    if (process.platform === "darwin") {
      const volumesPath = "/Volumes/BizziCloud";
      try {
        const volsDir = "/Volumes";
        await fs.promises.access(volsDir, fs.constants.W_OK);

        // Try to clean up a stale/orphaned mount from a previous session
        const tryUnmount = (cmd: string, args: string[]) =>
          new Promise<void>((resolve) => {
            const proc = spawn(cmd, args, { stdio: "ignore" });
            proc.on("close", () => resolve());
            proc.on("error", () => resolve());
            setTimeout(resolve, 2000);
          });
        await tryUnmount("umount", [volumesPath]);
        await tryUnmount("diskutil", ["unmount", "force", volumesPath]);
        await new Promise((r) => setTimeout(r, 500)); // Brief wait for FS to settle

        const stat = await fs.promises.stat(volumesPath).catch(() => null);
        if (stat) {
          if (!stat.isDirectory()) throw new Error("Not a directory");
          const entries = await fs.promises.readdir(volumesPath).catch(() => []);
          if (entries.length > 0) {
            throw new Error(
              "Mount point not empty. Unmount Bizzi Cloud in Finder (eject icon) or run: diskutil unmount /Volumes/BizziCloud"
            );
          }
        } else {
          await fs.promises.mkdir(volumesPath, { recursive: true });
        }
        this.mountPoint = volumesPath;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Only fall back on permission errors; for "not empty", throw so user can unmount first
        if (msg.includes("not empty") || msg.includes("Mount point not empty")) {
          throw new Error(
            "Unmount Bizzi Cloud first: click the eject icon next to it in Finder, or run in Terminal: diskutil unmount /Volumes/BizziCloud"
          );
        }
        this.mountPoint = path.join(options.cacheBaseDir, "Mount");
        await fs.promises.mkdir(this.mountPoint, { recursive: true });
        console.warn("Using fallback mount path (not in /Volumes):", this.mountPoint, err);
      }
    } else {
      this.mountPoint = path.join(options.cacheBaseDir, "Mount");
      await fs.promises.mkdir(this.mountPoint, { recursive: true });
    }

    const resourcesDir =
      options.resourcesDir ??
      (process.resourcesPath && !process.defaultApp ? process.resourcesPath : path.join(require("electron").app.getPath("appPath"), "resources"));
    const rclonePath = await this.findRclone(resourcesDir);
    if (!rclonePath) {
      await this.webdav.stop();
      this.webdav = null;
      throw new Error("rclone is not installed. Install it from https://rclone.org/downloads/ to use the mount feature.");
    }

    const logFile = path.join(options.cacheBaseDir, "rclone-mount.log");
    const args = [
      "mount",
      ":webdav:",
      this.mountPoint,
      "--webdav-url", webdavUrl,
      "--webdav-bearer-token", token,
      "--webdav-vendor", "other",
      "--dir-cache-time", "72h",
      "--vfs-cache-mode", "full",
      "--vfs-read-chunk-size", "32M",
      "--daemon",
      "--log-file", logFile,
    ];
    if (process.platform === "darwin") {
      args.push("--volname", "Bizzi Cloud");
      // volicon is not supported by all macFUSE versions; omit to avoid mount failure
    }

    let isHomebrewRclone = false;
    if (process.platform === "darwin") {
      try {
        const realPath = fs.realpathSync(rclonePath);
        isHomebrewRclone = realPath.includes("Cellar") || rclonePath.includes("/opt/homebrew/");
      } catch {
        isHomebrewRclone = rclonePath.includes("/opt/homebrew/");
      }
    }
    if (isHomebrewRclone) {
      throw new Error(
        "rclone from Homebrew does not support mount on macOS. Uninstall it (brew uninstall rclone) and install from https://rclone.org/downloads/ instead."
      );
    }

    // On macOS, GUI apps get a minimal env; rclone needs lib paths for macFUSE
    const spawnEnv = { ...process.env };
    if (process.platform === "darwin") {
      const libPaths = ["/usr/local/lib", "/opt/homebrew/lib"].filter((p) => {
        try {
          return fs.existsSync(path.join(p, "libfuse.2.dylib")) || fs.existsSync(path.join(p, "libfuse.dylib"));
        } catch {
          return false;
        }
      });
      if (libPaths.length > 0) {
        const extra = libPaths.join(":");
        spawnEnv.DYLD_FALLBACK_LIBRARY_PATH = process.env.DYLD_FALLBACK_LIBRARY_PATH
          ? `${process.env.DYLD_FALLBACK_LIBRARY_PATH}:${extra}`
          : extra;
      }
    }

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(rclonePath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: spawnEnv,
      });

      let stderr = "";
      proc.stderr?.on("data", (d) => { stderr += d.toString(); });

      proc.on("error", (err) => {
        reject(new Error(`rclone failed to start: ${err.message}`));
      });

      proc.on("exit", (code, signal) => {
        if (code !== 0 && code !== null && !signal) {
          const errMsg = parseRcloneError(logFile, stderr, code);
          reject(new Error(errMsg));
        }
      });

      const mountReady = (): void => {
        this._isMounted = true;
        if (process.platform === "darwin" && this.mountPoint.startsWith("/Volumes/")) {
          spawn("open", [this.mountPoint], { stdio: "ignore" });
        }
        resolve();
      };

      const verifyAndResolve = async (): Promise<void> => {
        try {
          await fs.promises.access(this.mountPoint, fs.constants.R_OK);
          mountReady();
        } catch {
          mountReady();
        }
      };

      setTimeout(verifyAndResolve, 2000);
    });
  }

  async unmount(): Promise<void> {
    this.currentToken = null;
    this._isMounted = false;

    if (this.mountPoint) {
      try {
        await new Promise<void>((resolve) => {
          const proc = spawn("umount", [this.mountPoint], { stdio: "ignore" });
          proc.on("close", () => resolve());
          proc.on("error", () => resolve());
          setTimeout(resolve, 3000);
        });
      } catch {
        // ignore
      }
      this.mountPoint = "";
    }

    if (this.webdav) {
      await this.webdav.stop();
      this.webdav = null;
    }
  }
}
