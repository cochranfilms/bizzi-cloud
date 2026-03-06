/**
 * Mount Service - Uses rclone + local WebDAV server.
 *
 * Spawns a WebDAV server that proxies to the Bizzi Cloud API (metadata + range),
 * then runs `rclone mount` against it. Requires rclone to be installed.
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

const PRODUCTION_URL = "https://bizzi-cloud.vercel.app";

export class MountService {
  private webdav: WebDAVServer | null = null;
  private mountPoint: string = "";
  private currentToken: string | null = null;
  private _isMounted = false;

  /**
   * rclone is used for mounting; we consider it "available" if the rclone binary exists.
   */
  async isFuseAvailable(): Promise<boolean> {
    try {
      const rclonePath = await this.findRclone();
      return !!rclonePath;
    } catch {
      return false;
    }
  }

  private async findRclone(): Promise<string | null> {
    return new Promise((resolve) => {
      const proc = spawn("which", ["rclone"], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      proc.stdout?.on("data", (d) => { out += d.toString(); });
      proc.on("close", (code) => {
        if (code === 0 && out.trim()) resolve(out.trim());
        else resolve(null);
      });
    });
  }

  isMounted(): boolean {
    return this._isMounted;
  }

  getMountPoint(): string {
    return this.mountPoint;
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
    const getAuthToken = () => Promise.resolve(this.currentToken);

    this.webdav = new WebDAVServer({
      apiBaseUrl: options.apiBaseUrl || PRODUCTION_URL,
      getAuthToken,
    });

    const port = await this.webdav.start();
    const webdavUrl = `http://127.0.0.1:${port}`;

    if (process.platform === "darwin") {
      this.mountPoint = "/Volumes/BizziCloud";
      try {
        const volsDir = "/Volumes";
        await fs.promises.access(volsDir, fs.constants.W_OK);
        const stat = await fs.promises.stat(this.mountPoint).catch(() => null);
        if (stat) {
          if (!stat.isDirectory()) throw new Error("Not a directory");
          const entries = await fs.promises.readdir(this.mountPoint).catch(() => []);
          if (entries.length > 0) throw new Error("Mount point not empty");
        } else {
          await fs.promises.mkdir(this.mountPoint, { recursive: true });
        }
      } catch {
        this.mountPoint = path.join(options.cacheBaseDir, "Mount");
        await fs.promises.mkdir(this.mountPoint, { recursive: true });
      }
    } else {
      this.mountPoint = path.join(options.cacheBaseDir, "Mount");
      await fs.promises.mkdir(this.mountPoint, { recursive: true });
    }

    const rclonePath = await this.findRclone();
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
      const iconPath = options.resourcesDir
        ? path.join(options.resourcesDir, "icon.icns")
        : path.join(__dirname, "..", "..", "resources", "icon.icns");
      if (fs.existsSync(iconPath)) {
        args.push("--fuse-flag", `volicon=${iconPath}`);
      }
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

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(rclonePath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });

      let stderr = "";
      proc.stderr?.on("data", (d) => { stderr += d.toString(); });

      proc.on("error", (err) => {
        reject(new Error(`rclone failed to start: ${err.message}`));
      });

      proc.on("exit", (code, signal) => {
        if (code !== 0 && code !== null && !signal) {
          let errMsg = stderr;
          try {
            const log = fs.readFileSync(logFile, "utf-8");
            if (log.includes("Homebrew") || log.includes("not supported")) {
              errMsg = "rclone from Homebrew does not support mount on macOS. Uninstall it (brew uninstall rclone) and install from https://rclone.org/downloads/ instead.";
            } else if (log.includes("CRITICAL:") || log.includes("ERROR")) {
              const match = log.match(/CRITICAL: ([^\n]+)|ERROR : ([^\n]+)/);
              errMsg = match ? (match[1] || match[2] || "").trim() : log.slice(-500);
            } else {
              errMsg = log.slice(-500) || stderr || String(code);
            }
          } catch {
            errMsg = errMsg || String(code);
          }
          reject(new Error(errMsg || `rclone exited: ${code}`));
        }
      });

      setTimeout(() => {
        this._isMounted = true;
        if (process.platform === "darwin" && this.mountPoint.startsWith("/Volumes/")) {
          spawn("open", [this.mountPoint], { stdio: "ignore" });
        }
        resolve();
      }, 2000);
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
