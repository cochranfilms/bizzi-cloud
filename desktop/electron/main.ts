import * as fs from "fs";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import * as path from "path";
import Store from "electron-store";
import { FileProviderService } from "./file-provider/file-provider-service";
import { desktopLog, setDesktopLogFile } from "./logger";

const fileProviderService = new FileProviderService();

const PRODUCTION_URL = "https://www.bizzicloud.io";

/**
 * Appended to the session user agent so the hosted web app can detect the Electron
 * shell. (Do not rely on `window.bizzi` alone—Next.js SSR/hydration runs before preload is visible.)
 * Keep in sync with `BIZZI_CLOUD_DESKTOP_UA_MARKER` in `src/components/desktop/NLEMountPanel.tsx`.
 */
const BIZZI_CLOUD_DESKTOP_UA_MARKER = "BizziCloudDesktop/1";

function getPreloadPath(): string {
  const joined = path.join(__dirname, "preload.js");
  if (!app.isPackaged) return joined;
  const unpacked = joined.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
  try {
    if (fs.existsSync(unpacked)) return unpacked;
  } catch {
    /* ignore */
  }
  return joined;
}

function applyDesktopUserAgent(sesh: Electron.Session): void {
  const cur = sesh.getUserAgent();
  if (!cur.includes(BIZZI_CLOUD_DESKTOP_UA_MARKER)) {
    sesh.setUserAgent(`${cur} ${BIZZI_CLOUD_DESKTOP_UA_MARKER}`);
  }
}

const store = new Store<{
  apiBaseUrl: string;
  cacheBaseDir: string;
  streamCacheMaxBytes: number;
  deviceId: string | null;
}>({
  defaults: {
    apiBaseUrl: PRODUCTION_URL,
    cacheBaseDir: path.join(app.getPath("userData"), "BizziCloud"),
    streamCacheMaxBytes: 500 * 1024 * 1024 * 1024, // 500 GB (NLE editing)
    deviceId: null,
  },
});

let mainWindow: BrowserWindow | null = null;

function updateDesktopLogPath(): void {
  const cacheBaseDir = String(store.get("cacheBaseDir") ?? path.join(app.getPath("userData"), "BizziCloud"));
  setDesktopLogFile(path.join(cacheBaseDir, "desktop.log"));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  applyDesktopUserAgent(mainWindow.webContents.session);

  const baseUrl = String(store.get("apiBaseUrl") ?? PRODUCTION_URL);
  const desktopUrl = `${baseUrl.replace(/\/$/, "")}/desktop/app`;

  if (process.env.NODE_ENV === "development") {
    // Load Next.js dev server (run `npm run dev` from project root)
    mainWindow.loadURL("http://localhost:3000/desktop/app").catch(() => {
      mainWindow?.loadURL(desktopUrl);
    });
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(desktopUrl);
  }

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    desktopLog.error("[desktop] renderer process exited", details);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  updateDesktopLogPath();
  desktopLog.info("[desktop] app ready");
  createWindow();
});

process.on("uncaughtException", (error) => {
  desktopLog.error("[desktop] uncaught exception", error);
});

process.on("unhandledRejection", (reason) => {
  desktopLog.error("[desktop] unhandled rejection", reason);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("get-settings", () => store.store);
ipcMain.handle("set-settings", (_e, key: string, value: unknown) => {
  store.set(key, value);
  if (key === "cacheBaseDir") {
    updateDesktopLogPath();
  }
  return store.store;
});
ipcMain.handle("get-path", (_e, name: "userData" | "cacheBase") => {
  if (name === "cacheBase") return store.get("cacheBaseDir");
  return app.getPath("userData");
});
ipcMain.handle("open-in-finder", (_e, pathToOpen: string) => shell.openPath(pathToOpen));
ipcMain.handle("open-external", (_e, url: string) => shell.openExternal(url));

// Native Sync (File Provider) — replaces FUSE/rclone mount
ipcMain.handle("native-sync-available", () => fileProviderService.isAvailable());
ipcMain.handle("native-sync-status", () => ({
  isEnabled: fileProviderService.isEnabled(),
}));
ipcMain.handle("native-sync-enable", async (_e, { apiBaseUrl, token }: { apiBaseUrl?: string; token?: string }) => {
  const baseUrl = apiBaseUrl || String(store.get("apiBaseUrl") ?? PRODUCTION_URL);
  if (!token) throw new Error("Not signed in. Sign in to Bizzi Cloud to enable Native Sync.");
  const result = await fileProviderService.enable({
    apiBaseUrl: baseUrl,
    getAuthToken: async () => token,
  });
  // Opening the CloudStorage path nudges Finder to show the domain; macOS still controls Locations sidebar.
  if (result.syncPath) {
    setImmediate(() => {
      void shell.openPath(result.syncPath).then((errMsg) => {
        if (errMsg) desktopLog.warn("[native-sync] shell.openPath after enable", errMsg);
      });
    });
  }
  return result;
});
ipcMain.handle("native-sync-disable", () => fileProviderService.disable());
ipcMain.handle("native-sync-refresh-token", (_e, token: string) => {
  fileProviderService.refreshToken(token);
});
ipcMain.handle("native-sync-refresh-folder", (_e, driveSlug: string) =>
  fileProviderService.refreshFolder(driveSlug)
);
