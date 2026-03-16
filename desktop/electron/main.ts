import { app, BrowserWindow, ipcMain, shell } from "electron";
import * as path from "path";
import Store from "electron-store";
import { FileProviderService } from "./file-provider/file-provider-service";
import { desktopLog, setDesktopLogFile } from "./logger";
import { MountService } from "./mount/mount-service";

const mountService = new MountService();
const fileProviderService = new FileProviderService();

const PRODUCTION_URL = "https://www.bizzicloud.io";

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
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

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

// Mount IPC
ipcMain.handle("mount-fuse-available", () => mountService.isFuseAvailable());
ipcMain.handle("mount-dependencies", async () => {
  // Prod: Contents/Resources (contains bin/). Dev: desktop folder (contains bin/).
  const resourcesDir =
    process.resourcesPath && !process.defaultApp
      ? process.resourcesPath
      : app.getAppPath();
  return mountService.getMountDependencies(resourcesDir);
});
ipcMain.handle("mount-status", async () => mountService.getStatus());

ipcMain.handle("mount-mount", async (_e, { apiBaseUrl, token }: { apiBaseUrl?: string; token?: string }) => {
  const cacheBaseDir = String(store.get("cacheBaseDir") ?? path.join(app.getPath("userData"), "BizziCloud"));
  const baseUrl = apiBaseUrl || String(store.get("apiBaseUrl") ?? PRODUCTION_URL);
  if (!token) {
    throw new Error("Not signed in. Sign in to Bizzi Cloud to mount.");
  }
  // Same as mount-dependencies: prod=Contents/Resources, dev=desktop (contains bin/)
  const resourcesDir =
    process.resourcesPath && !process.defaultApp
      ? process.resourcesPath
      : app.getAppPath();
  // fallbackMountDir: use Caches (local disk) when /Volumes inaccessible; Application Support can be on iCloud/FUSE
  const cacheDir = path.join(app.getPath("userData"), "..", "Caches", "bizzi-cloud-desktop");
  const fallbackMountDir = path.join(cacheDir, "BizziCloudMount");
  await mountService.mount({
    apiBaseUrl: baseUrl,
    cacheBaseDir,
    fallbackMountDir,
    getAuthToken: async () => token,
    resourcesDir,
    streamCacheMaxBytes: Number(store.get("streamCacheMaxBytes")) || undefined,
  });
  return { mountPoint: mountService.getMountPoint() };
});
ipcMain.handle("mount-unmount", () => mountService.unmount());
ipcMain.handle("mount-refresh-token", (_e, token: string) => {
  mountService.refreshToken(token);
});
ipcMain.handle("mount-refresh-folder", async (_e, driveSlug: string) =>
  mountService.refreshFolder(driveSlug)
);

// Native Sync (File Provider) IPC
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
  return result;
});
ipcMain.handle("native-sync-disable", () => fileProviderService.disable());
ipcMain.handle("native-sync-refresh-token", (_e, token: string) => {
  fileProviderService.refreshToken(token);
});
