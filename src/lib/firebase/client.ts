import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp;

function getApp(): FirebaseApp {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0] as FirebaseApp;
  }
  return app;
}

let browserLocalPersistenceEnsured = false;

export function getFirebaseAuth(): Auth {
  const auth = getAuth(getApp());
  if (typeof window !== "undefined" && !browserLocalPersistenceEnsured) {
    browserLocalPersistenceEnsured = true;
    void setPersistence(auth, browserLocalPersistence).catch((err) =>
      console.warn("[firebase/auth] setPersistence failed:", err)
    );
  }
  return auth;
}

export function getFirebaseFirestore(): Firestore {
  return getFirestore(getApp());
}

/**
 * Firebase Storage - used ONLY for user profile images.
 * All backup/sync file storage goes to Backblaze B2.
 */
export function getFirebaseStorage(): FirebaseStorage {
  return getStorage(getApp());
}

export const isFirebaseConfigured = () =>
  !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
