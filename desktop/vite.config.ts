import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

function parseEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        out[key] = value;
      }
    }
  } catch {
    // ignore
  }
  return out;
}

export default defineConfig(() => {
  const configDir = path.resolve(__dirname);
  const desktopEnv = Object.assign(
    {},
    parseEnvFile(path.join(process.cwd(), ".env.local")),
    parseEnvFile(path.join(configDir, ".env.local"))
  );
  const rootEnv = parseEnvFile(path.join(configDir, "..", ".env.local"));

  const apiKey = desktopEnv.VITE_FIREBASE_API_KEY ?? rootEnv.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = desktopEnv.VITE_FIREBASE_AUTH_DOMAIN ?? rootEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = desktopEnv.VITE_FIREBASE_PROJECT_ID ?? rootEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = desktopEnv.VITE_FIREBASE_STORAGE_BUCKET ?? rootEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = desktopEnv.VITE_FIREBASE_MESSAGING_SENDER_ID ?? rootEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = desktopEnv.VITE_FIREBASE_APP_ID ?? rootEnv.NEXT_PUBLIC_FIREBASE_APP_ID;
  const measurementId = desktopEnv.VITE_FIREBASE_MEASUREMENT_ID ?? rootEnv.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

  const firebaseEnv = {
    __FIREBASE_API_KEY__: JSON.stringify(apiKey),
    __FIREBASE_AUTH_DOMAIN__: JSON.stringify(authDomain),
    __FIREBASE_PROJECT_ID__: JSON.stringify(projectId),
    __FIREBASE_STORAGE_BUCKET__: JSON.stringify(storageBucket),
    __FIREBASE_MESSAGING_SENDER_ID__: JSON.stringify(messagingSenderId),
    __FIREBASE_APP_ID__: JSON.stringify(appId),
    __FIREBASE_MEASUREMENT_ID__: JSON.stringify(measurementId),
  };

  return {
  envDir: configDir,
  define: firebaseEnv,
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  base: "./",
  build: {
    outDir: "dist",
  },
  };
});
