import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const STORAGE_SERVICES = [
  "Dropbox",
  "Google Drive",
  "AWS S3",
  "Backblaze B2",
  "Frame.io",
  "Adobe Creative Cloud",
  "Box",
  "OneDrive",
  "Other",
];

const FAVORITE_FEATURES = [
  "Galleries & proofing",
  "NLE cloud editing",
  "Transfers & delivery",
  "SSO & permissions",
  "Version history",
  "Storage & backup",
  "Client invoicing",
  "Other",
];

export async function POST(request: Request) {
  let body: {
    current_storage_service?: string;
    monthly_storage_tb?: string | number;
    favorite_features?: string[];
    company_name?: string;
    contact_email?: string;
    message?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const currentStorageService =
    typeof body.current_storage_service === "string"
      ? body.current_storage_service.trim()
      : "";
  const monthlyStorageTbRaw = body.monthly_storage_tb;
  const monthlyStorageTb =
    typeof monthlyStorageTbRaw === "number"
      ? monthlyStorageTbRaw
      : typeof monthlyStorageTbRaw === "string"
        ? parseFloat(monthlyStorageTbRaw.trim()) || 0
        : 0;
  const favoriteFeatures = Array.isArray(body.favorite_features)
    ? body.favorite_features.filter((f): f is string => typeof f === "string")
    : [];
  const companyName =
    typeof body.company_name === "string" ? body.company_name.trim() : "";
  const contactEmail =
    typeof body.contact_email === "string" ? body.contact_email.trim() : "";
  const message =
    typeof body.message === "string" ? body.message.trim() : "";

  if (!currentStorageService || !STORAGE_SERVICES.includes(currentStorageService)) {
    return NextResponse.json(
      { error: "Invalid current storage service" },
      { status: 400 }
    );
  }

  if (!contactEmail || !contactEmail.includes("@")) {
    return NextResponse.json(
      { error: "Valid contact email required" },
      { status: 400 }
    );
  }

  if (!companyName || companyName.length < 2) {
    return NextResponse.json(
      { error: "Company name must be at least 2 characters" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const docRef = await db.collection("enterprise_contacts").add({
    current_storage_service: currentStorageService,
    monthly_storage_tb: monthlyStorageTb,
    favorite_features: favoriteFeatures,
    company_name: companyName,
    contact_email: contactEmail,
    message: message || null,
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    id: docRef.id,
  });
}
