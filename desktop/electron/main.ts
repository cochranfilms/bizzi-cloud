import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import Store from "electron-store";
import { MountService } from "./mount/mount-service";

const mountService = new MountService();

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
    streamCacheMaxBytes: 50 * 1024 * 1024 * 1024, // 50 GB
    deviceId: null,
  },
});

let mainWindow: BrowserWindow | null = null;

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
  const desktopUrl = `${baseUrl.replace(/\/$/, "")}/desktop`;

  if (process.env.NODE_ENV === "development") {
    // Load Next.js dev server (run `npm run dev` from project root)
    mainWindow.loadURL("http://localhost:3000/desktop").catch(() => {
      mainWindow?.loadURL(desktopUrl);
    });
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(desktopUrl);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("get-settings", () => store.store);
ipcMain.handle("set-settings", (_e, key: string, value: unknown) => {
  store.set(key, value);
  return store.store;
});
ipcMain.handle("get-path", (_e, name: "userData" | "cacheBase") => {
  if (name === "cacheBase") return store.get("cacheBaseDir");
  return app.getPath("userData");
});

// Mount IPC
ipcMain.handle("mount-fuse-available", () => mountService.isFuseAvailable());
ipcMain.handle("mount-status", () => ({
  isMounted: mountService.isMounted(),
  mountPoint: mountService.isMounted() ? mountService.getMountPoint() : null,
}));

ipcMain.handle("mount-mount", async (_e, { apiBaseUrl, token }: { apiBaseUrl?: string; token?: string }) => {
  const cacheBaseDir = String(store.get("cacheBaseDir") ?? path.join(app.getPath("userData"), "BizziCloud"));
  const baseUrl = apiBaseUrl || String(store.get("apiBaseUrl") ?? PRODUCTION_URL);
  if (!token) {
    throw new Error("Not signed in. Sign in to Bizzi Cloud to mount.");
  }
  const resourcesDir =
    process.resourcesPath && !process.defaultApp
      ? process.resourcesPath
      : path.join(app.getAppPath(), "resources");
  await mountService.mount({
    apiBaseUrl: baseUrl,
    cacheBaseDir,
    getAuthToken: async () => token,
    resourcesDir,
  });
  return { mountPoint: mountService.getMountPoint() };
});
ipcMain.handle("mount-unmount", () => mountService.unmount());
