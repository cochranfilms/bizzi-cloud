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
import { Notification } from "electron";
import { PrefetchService } from "./prefetch-service";
import { WebDAVServer } from "./webdav-server";

export interface MountOptions {
  cacheBaseDir: string;
  apiBaseUrl: string;
  getAuthToken: () => Promise<string | null>;
  resourcesDir?: string;
  /** Max bytes for rclone VFS cache (default 50 GB). Shared with stream cache budget. */
  streamCacheMaxBytes?: number;
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

  // Specific errors first (before generic FUSE match)
  if (combined.includes("mount_macfuse: the file system is not available")) {
    return "macFUSE kernel extension isn't loaded. Open System Settings → Privacy & Security and allow the macFUSE extension, or restart your Mac.";
  }
  if (combined.includes("is not empty") && combined.includes("--allow-non-empty")) {
    return "Mount point has leftover files. The app will retry with --allow-non-empty.";
  }
  if (combined.includes("cgofuse: cannot find FUSE")) {
    return "rclone can't load macFUSE libraries. Reinstall macFUSE from https://osxfuse.github.io/ and restart your Mac.";
  }
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
  const isPackaged = !process.defaultApp;
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
  // Packaged apps (DMG/Applications) may not have access to /Library or /usr/local.
  // Assume macFUSE might be installed so we don't block the user; mount will fail with a clear error if not.
  if (isPackaged) return { installed: true };
  return { installed: false };
}

export interface MountDependencies {
  rclone: { available: boolean; source: "bundled" | "system" | null };
  macFuse: { installed: boolean; version?: string };
}

const DEFAULT_STREAM_CACHE_MAX_BYTES = 50 * 1024 * 1024 * 1024; // 50 GB

const FULL_DISK_ACCESS_MSG =
  "Can't access /Volumes. Add Bizzi Cloud to Full Disk Access for NLE visibility: System Settings → Privacy & Security → Full Disk Access. Then restart the app and mount again.";

/** Returns true if the error indicates a permission/access denial (e.g. needs Full Disk Access). */
function isPermissionError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    code === "EACCES" ||
    code === "EPERM" ||
    msg.includes("permission denied") ||
    msg.includes("operation not permitted") ||
    msg.includes("not allowed")
  );
}

export class MountService {
  private webdav: WebDAVServer | null = null;
  private mountPoint: string = "";
  private symlinkForFallback: string | null = null;
  private currentToken: string | null = null;
  private _isMounted = false;
  private prefetch: PrefetchService | null = null;

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
    return this.symlinkForFallback ?? this.mountPoint;
  }

  /** Update the auth token used for API calls. Call periodically from the renderer (e.g. every 50 min) when mounted. */
  refreshToken(token: string | null): void {
    if (this._isMounted && token) this.currentToken = token;
  }

  /** Returns true if the mount point is still in the system mount table (rclone is running). */
  private async isMountActuallyActive(): Promise<boolean> {
    if (!this.mountPoint) return false;
    try {
      const { execSync } = require("child_process");
      const out = execSync("mount", { encoding: "utf-8", maxBuffer: 1024 * 1024 });
      return out.includes(this.mountPoint);
    } catch {
      return false;
    }
  }

  async mount(options: MountOptions): Promise<void> {
    // If we think we're mounted, always unmount first. Fixes stuck "Already mounted" when
    // rclone died, user ejected, or state is stale. Mount button effectively becomes "remount".
    if (this.isMounted()) {
      await this.unmount();
    }

    const token = await options.getAuthToken();
    if (!token) {
      throw new Error("Not signed in. Sign in to Bizzi Cloud to mount.");
    }

    this.currentToken = token;
    // WebDAV uses getAuthToken() per request so token refresh works without remounting
    const getAuthToken = async () => this.currentToken ?? (await options.getAuthToken());

    const prefetch = new PrefetchService({ mountPoint: "" });
    this.prefetch = prefetch;

    this.webdav = new WebDAVServer({
      apiBaseUrl: options.apiBaseUrl || PRODUCTION_URL,
      getAuthToken,
      onUploadComplete: (fileName) => {
        try {
          new Notification({
            title: "Bizzi Cloud",
            body: `"${fileName}" synced to cloud`,
          }).show();
        } catch {
          // Notification may fail if app not focused or on some systems
        }
      },
      onFolderListed: (driveId, folderPath, entries) => prefetch.onFolderListed(driveId, folderPath, entries),
      onFileRead: (driveId, relativePath, rangeStart, rangeEnd) =>
        prefetch.onFileRead(driveId, relativePath, rangeStart, rangeEnd),
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
        // "Not empty" means user should unmount first (don't fall back)
        if (msg.includes("not empty") || msg.includes("Mount point not empty")) {
          throw new Error(
            "Unmount Bizzi Cloud first: click the eject icon next to it in Finder, or run in Terminal: diskutil unmount /Volumes/BizziCloud"
          );
        }
        // Fall back to Application Support
        this.mountPoint = path.join(options.cacheBaseDir, "Mount");
        await fs.promises.mkdir(this.mountPoint, { recursive: true });
        console.warn("Using fallback mount path (not in /Volumes):", this.mountPoint, err);

        // Create symlink at /Volumes/BizziCloud so NLEs can see it (may fail without Full Disk Access)
        try {
          const existing = await fs.promises.lstat(volumesPath).catch(() => null);
          if (existing) {
            if (existing.isSymbolicLink()) {
              await fs.promises.unlink(volumesPath);
            } else if (existing.isDirectory()) {
              const entries = await fs.promises.readdir(volumesPath).catch(() => []);
              if (entries.length === 0) {
                await fs.promises.rmdir(volumesPath);
              } else {
                throw new Error("Path exists and is not empty");
              }
            } else {
              await fs.promises.unlink(volumesPath);
            }
          }
          await fs.promises.symlink(this.mountPoint, volumesPath);
          this.symlinkForFallback = volumesPath;
        } catch {
          // Symlink failed (likely same permission issue); mount still works at fallback path
        }
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
    const cacheDir = path.join(options.cacheBaseDir, "rclone-vfs");
    await fs.promises.mkdir(cacheDir, { recursive: true });
    const vfsCacheMaxBytes = options.streamCacheMaxBytes ?? DEFAULT_STREAM_CACHE_MAX_BYTES;

    const args = [
      "mount",
      ":webdav:",
      this.mountPoint,
      "--webdav-url", webdavUrl,
      "--webdav-bearer-token", token,
      "--webdav-vendor", "other",
      "--timeout", "2h", // Video exports can take 30+ min; rclone default 5m aborts long PUTs
      "--dir-cache-time", "72h",
      "--vfs-cache-mode", "full",
      "--vfs-read-chunk-size", "32M",
      "--vfs-read-ahead", "64M", // Predictive: prefetch ahead during sequential reads (video scrubbing, etc.)
      "--vfs-cache-max-size", String(vfsCacheMaxBytes),
      "--cache-dir", cacheDir,
      "--daemon",
      "--log-file", logFile,
      "--allow-non-empty", // Fallback mount path can have leftover files from previous sessions
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

    // On macOS, packaged apps often strip DYLD_* for child processes. Always use a shell
    // wrapper so rclone gets DYLD_FALLBACK_LIBRARY_PATH and can load libfuse from macFUSE.
    // (Don't rely on fs.existsSync for libs—it can fail in packaged app context.)
    const spawnEnv = { ...process.env };
    let spawnCmd: string;
    let spawnArgs: string[];
    if (process.platform === "darwin") {
      const libPathStr = ["/usr/local/lib", "/opt/homebrew/lib"].join(":");
      spawnEnv.DYLD_FALLBACK_LIBRARY_PATH = process.env.DYLD_FALLBACK_LIBRARY_PATH
        ? `${process.env.DYLD_FALLBACK_LIBRARY_PATH}:${libPathStr}`
        : libPathStr;
      const wrapperScript = path.join(options.cacheBaseDir, "rclone-macfuse-wrapper.sh");
      const scriptBody = `#!/bin/bash\nexport DYLD_FALLBACK_LIBRARY_PATH="${libPathStr}"\nexec "${rclonePath}" "$@"\n`;
      await fs.promises.writeFile(wrapperScript, scriptBody, { mode: 0o755 });
      spawnCmd = "/bin/bash";
      spawnArgs = [wrapperScript, ...args];
    } else {
      spawnCmd = rclonePath;
      spawnArgs = args;
    }

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(spawnCmd, spawnArgs, {
        stdio: ["ignore", "pipe", "pipe"],
        env: spawnEnv,
      });

      let stderr = "";
      proc.stderr?.on("data", (d) => { stderr += d.toString(); });
      let rcloneExitedWithError = false;

      proc.on("error", (err) => {
        reject(new Error(`rclone failed to start: ${err.message}`));
      });

      proc.on("exit", (code, signal) => {
        if (code !== 0 && code !== null && !signal) {
          rcloneExitedWithError = true;
          const errMsg = parseRcloneError(logFile, stderr, code);
          reject(new Error(errMsg));
        }
      });

      const mountReady = (): void => {
        this._isMounted = true;
        const openPath = this.symlinkForFallback ?? this.mountPoint;
        if (process.platform === "darwin" && openPath.startsWith("/Volumes/")) {
          spawn("open", [openPath], { stdio: "ignore" });
        }
        resolve();
      };

      const verifyAndResolve = async (): Promise<void> => {
        try {
          await fs.promises.access(this.mountPoint, fs.constants.R_OK);
          mountReady();
          // Start predictive prefetch (folder open, clip click, grading, idle)
          this.prefetch?.start(this.mountPoint);
        } catch {
          // Don't set _isMounted when rclone failed—prevents "Already mounted" on retry.
          if (!rcloneExitedWithError) {
            mountReady();
            this.prefetch?.start(this.mountPoint);
          }
        }
      };

      setTimeout(verifyAndResolve, 2000);
    });
  }

  async unmount(): Promise<void> {
    this.currentToken = null;
    this._isMounted = false;
    this.prefetch?.stop();
    this.prefetch = null;

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

    // Remove symlink created for fallback mount (so /Volumes/BizziCloud doesn't point to empty dir)
    if (this.symlinkForFallback) {
      try {
        await fs.promises.unlink(this.symlinkForFallback);
      } catch {
        // ignore
      }
      this.symlinkForFallback = null;
    }

    if (this.webdav) {
      await this.webdav.stop();
      this.webdav = null;
    }
  }
}
