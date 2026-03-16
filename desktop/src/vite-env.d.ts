/// <reference types="vite/client" />

declare global {
  interface Window {
    bizzi?: {
      getSettings: () => Promise<Record<string, unknown>>;
      setSettings: (key: string, value: unknown) => Promise<Record<string, unknown>>;
      getPath: (name: "userData" | "cacheBase") => Promise<string>;
      mount?: {
        isFuseAvailable: () => Promise<boolean>;
        getDependencies: () => Promise<unknown>;
        getStatus: () => Promise<{ isMounted: boolean; mountPoint: string | null }>;
        mount: (apiBaseUrl: string, token: string) => Promise<{ mountPoint: string }>;
        unmount: () => Promise<void>;
        refreshToken: (token: string) => Promise<void>;
        refreshFolder: (driveSlug: string) => Promise<void>;
      };
    };
  }
}

declare const __FIREBASE_API_KEY__: string | undefined;
declare const __FIREBASE_AUTH_DOMAIN__: string | undefined;
declare const __FIREBASE_PROJECT_ID__: string | undefined;
declare const __FIREBASE_STORAGE_BUCKET__: string | undefined;
declare const __FIREBASE_MESSAGING_SENDER_ID__: string | undefined;
declare const __FIREBASE_APP_ID__: string | undefined;
declare const __FIREBASE_MEASUREMENT_ID__: string | undefined;

export {};
