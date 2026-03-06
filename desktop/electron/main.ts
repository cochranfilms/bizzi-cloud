import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import Store from "electron-store";

const store = new Store<{
  apiBaseUrl: string;
  cacheBaseDir: string;
  streamCacheMaxBytes: number;
  deviceId: string | null;
}>({
  defaults: {
    apiBaseUrl: "http://localhost:3000",
    cacheBaseDir: path.join(app.getPath("userData"), "BizziCloud"),
    streamCacheMaxBytes: 50 * 1024 * 1024 * 1024, // 50 GB
    deviceId: null,
  },
});

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
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
