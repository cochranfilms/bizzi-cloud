/**
 * Native Sync (File Provider) Service
 *
 * Uses Apple File Provider to mount Bizzi Cloud in Finder without rclone/FUSE.
 * Starts a local WebDAV server and registers a File Provider domain that uses it.
 * Requires electron-macos-file-provider and the embedded EleFileProvider.appex.
 */
import { WebDAVServer } from "../mount/webdav-server";

const PRODUCTION_URL = "https://www.bizzicloud.io";
const FILE_PROVIDER_DOMAIN_ID = "cloud.bizzi.desktop";
const FILE_PROVIDER_DISPLAY_NAME = "Bizzi Cloud";

let efpHelper: {
  addDomain: (
    id: string,
    name: string,
    options: { url: string; user?: string; password?: string },
    callback?: (err?: string) => void
  ) => void;
  removeAllDomains: (callback?: (err?: string) => void) => void;
  getUserVisiblePath: (id: string, name: string) => Promise<string>;
} | null = null;

try {
  if (process.platform === "darwin") {
    efpHelper = require("electron-macos-file-provider");
  }
} catch {
  // Native addon not built or not macOS
}

export class FileProviderService {
  private webdav: WebDAVServer | null = null;
  private currentToken: string | null = null;
  private _isEnabled = false;

  /** Whether the native File Provider addon is available (macOS only, addon built). */
  isAvailable(): boolean {
    return process.platform === "darwin" && !!efpHelper?.addDomain;
  }

  isEnabled(): boolean {
    return this._isEnabled;
  }

  async enable(options: {
    apiBaseUrl: string;
    getAuthToken: () => Promise<string | null>;
  }): Promise<{ syncPath: string }> {
    if (this._isEnabled) {
      throw new Error("Native Sync is already enabled. Disable it first.");
    }
    if (!this.isAvailable()) {
      throw new Error(
        "Native Sync is not available. Ensure you are on macOS and have built the app with the File Provider extension. See desktop/macos/README.md"
      );
    }

    const token = await options.getAuthToken();
    if (!token) {
      throw new Error("Not signed in. Sign in to Bizzi Cloud to enable Native Sync.");
    }

    this.currentToken = token;
    const getAuthToken = async () => this.currentToken ?? (await options.getAuthToken());

    this.webdav = new WebDAVServer({
      apiBaseUrl: options.apiBaseUrl || PRODUCTION_URL,
      getAuthToken,
    });

    const port = await this.webdav.start();
    const webdavUrl = `http://127.0.0.1:${port}`;

    return new Promise((resolve, reject) => {
      efpHelper!.addDomain(
        FILE_PROVIDER_DOMAIN_ID,
        FILE_PROVIDER_DISPLAY_NAME,
        {
          url: webdavUrl,
          user: "bizzi",
          password: token,
        },
        (err) => {
          if (err) {
            this.webdav?.stop();
            this.webdav = null;
            reject(new Error(`Failed to enable Native Sync: ${err}`));
            return;
          }
          this._isEnabled = true;
          efpHelper!
            .getUserVisiblePath(FILE_PROVIDER_DOMAIN_ID, FILE_PROVIDER_DISPLAY_NAME)
            .then((syncPath) => resolve({ syncPath }))
            .catch(() => resolve({ syncPath: "~/Library/CloudStorage/Bizzi Cloud" }));
        }
      );
    });
  }

  async disable(): Promise<void> {
    if (!this._isEnabled) return;

    return new Promise((resolve) => {
      efpHelper?.removeAllDomains((err) => {
        if (err) console.error("FileProvider removeAllDomains error:", err);
        this._isEnabled = false;
        this.currentToken = null;
        this.webdav?.stop();
        this.webdav = null;
        resolve();
      });
    });
  }

  refreshToken(token: string | null): void {
    if (this._isEnabled && token) {
      this.currentToken = token;
    }
  }
}
