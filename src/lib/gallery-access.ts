import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import type { GalleryAccessMode } from "@/types/gallery";

const scryptAsync = promisify(scrypt);
const SALT_LEN = 16;
const KEY_LEN = 64;

export type GalleryAccessResult =
  | { allowed: true; needsPassword?: boolean; needsPin?: boolean }
  | {
      allowed: false;
      code: string;
      message: string;
      needsPassword?: boolean;
      needsPin?: boolean;
    };

/** Hash a password or PIN for storage. */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(SALT_LEN).toString("hex");
  const derived = (await scryptAsync(secret, salt, KEY_LEN)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

/** Verify a password or PIN against stored hash. */
export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  try {
    const [salt, keyHex] = stored.split(":");
    if (!salt || !keyHex) return false;
    const derived = (await scryptAsync(secret, salt, KEY_LEN)) as Buffer;
    const key = Buffer.from(keyHex, "hex");
    return key.length === derived.length && timingSafeEqual(derived, key);
  } catch {
    return false;
  }
}

export interface GalleryAccessCheck {
  photographer_id: string;
  access_mode: GalleryAccessMode;
  password_hash?: string | null;
  pin_hash?: string | null;
  invited_emails?: string[];
  expiration_date?: string | null;
}

/**
 * Verify gallery access for viewing.
 * - Owner (photographer) always has access when authenticated.
 * - public: allow
 * - password: require password in request
 * - invite_only: require auth + invited email OR client session email
 */
export async function verifyGalleryViewAccess(
  gallery: GalleryAccessCheck,
  request: {
    authHeader: string | null;
    password?: string | null;
    /** Email from client session cookie (no Firebase Auth). */
    clientEmail?: string | null;
  }
): Promise<GalleryAccessResult> {
  const { access_mode, expiration_date, photographer_id } = gallery;

  if (expiration_date) {
    const exp = new Date(expiration_date);
    if (exp < new Date()) {
      return {
        allowed: false,
        code: "gallery_expired",
        message: "This gallery has expired.",
      };
    }
  }

  // Owner always has access when authenticated
  if (request.authHeader?.startsWith("Bearer ")) {
    const token = request.authHeader.slice(7).trim();
    try {
      const decoded = await verifyIdToken(token);
      if (decoded.uid === photographer_id) return { allowed: true };
    } catch {
      // Fall through to normal access checks
    }
  }

  if (access_mode === "public") {
    return { allowed: true };
  }

  if (access_mode === "pin") {
    // Legacy: treat as public (PIN feature removed)
    return { allowed: true };
  }

  if (access_mode === "password") {
    const { password } = request;
    if (!password || typeof password !== "string") {
      return {
        allowed: false,
        code: "password_required",
        message: "This gallery is password protected.",
        needsPassword: true,
      };
    }
    const hash = gallery.password_hash;
    if (!hash) return { allowed: true }; // Misconfigured, allow
    const ok = await verifySecret(password, hash);
    if (!ok) {
      return {
        allowed: false,
        code: "invalid_password",
        message: "Invalid password.",
      };
    }
    return { allowed: true };
  }

  if (access_mode === "invite_only") {
    let email: string | undefined;

    if (request.authHeader?.startsWith("Bearer ")) {
      const token = request.authHeader.slice(7).trim();
      try {
        const decoded = await verifyIdToken(token);
        if (decoded.uid === gallery.photographer_id) return { allowed: true };
        email = decoded.email;
      } catch {
        // Fall through to client session check
      }
    }

    if (!email && request.clientEmail) {
      email = request.clientEmail;
    }

    const invited = gallery.invited_emails ?? [];
    const emailLower = email?.toLowerCase();
    if (emailLower && invited.some((e) => e.toLowerCase() === emailLower)) {
      return { allowed: true };
    }

    return {
      allowed: false,
      code: "invite_required",
      message: "This gallery is invite only. Enter your invited email at /client to access.",
    };
  }

  return { allowed: true };
}

/**
 * Verify download permission.
 */
export async function verifyGalleryDownloadAccess(
  gallery: GalleryAccessCheck,
  request: {
    authHeader: string | null;
    password?: string | null;
    clientEmail?: string | null;
  }
): Promise<GalleryAccessResult> {
  return verifyGalleryViewAccess(gallery, {
    authHeader: request.authHeader,
    password: request.password,
    clientEmail: request.clientEmail,
  });
}
