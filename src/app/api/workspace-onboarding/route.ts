/**
 * PATCH — save draft workspace onboarding fields (partial).
 * POST — complete onboarding (idempotent for same version).
 */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { userOwnsPersonalTeamRecord } from "@/lib/personal-team-auth";
import { PERSONAL_TEAM_SETTINGS_COLLECTION } from "@/lib/personal-team-constants";
import { isValidPreferredPerformanceRegion } from "@/lib/workspace-regions";
import {
  CURRENT_WORKSPACE_ONBOARDING_VERSION,
  isValidCollaborationMode,
  isValidTeamType,
  isValidUseCase,
  normalizeWorkspaceDisplayName,
  parseWorkspaceOnboardingFromProfile,
} from "@/lib/workspace-onboarding";
import { NextResponse } from "next/server";

async function requireUid(request: Request): Promise<{ uid: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireUid(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const profileRef = db.collection("profiles").doc(uid);
  const snap = await profileRef.get();
  const prev = parseWorkspaceOnboardingFromProfile(
    snap.data() as Record<string, unknown> | undefined
  );
  const nextOnboarding = { ...prev.onboarding };

  if ("collaboration_mode" in body) {
    const v = body.collaboration_mode;
    if (v === null || v === "") {
      nextOnboarding.collaboration_mode = undefined;
    } else if (typeof v === "string" && isValidCollaborationMode(v)) {
      nextOnboarding.collaboration_mode = v;
    } else {
      return NextResponse.json({ error: "Invalid collaboration_mode" }, { status: 400 });
    }
  }

  if ("team_type" in body) {
    const v = body.team_type;
    if (v === null || v === "") {
      nextOnboarding.team_type = undefined;
    } else if (typeof v === "string" && isValidTeamType(v)) {
      nextOnboarding.team_type = v;
    } else {
      return NextResponse.json({ error: "Invalid team_type" }, { status: 400 });
    }
  }

  if ("use_case" in body) {
    const v = body.use_case;
    if (v === null || v === "") {
      nextOnboarding.use_case = undefined;
    } else if (typeof v === "string" && isValidUseCase(v)) {
      nextOnboarding.use_case = v;
    } else {
      return NextResponse.json({ error: "Invalid use_case" }, { status: 400 });
    }
  }

  if ("preferred_performance_region" in body) {
    const v = body.preferred_performance_region;
    if (v === null || v === "") {
      nextOnboarding.preferred_performance_region = undefined;
    } else if (typeof v === "string" && isValidPreferredPerformanceRegion(v)) {
      nextOnboarding.preferred_performance_region = v;
    } else {
      return NextResponse.json(
        { error: "Invalid preferred_performance_region" },
        { status: 400 }
      );
    }
  }

  if ("workspace_display_name" in body) {
    const v = body.workspace_display_name;
    if (v === null || v === "") {
      nextOnboarding.workspace_display_name = undefined;
    } else if (typeof v === "string") {
      const n = normalizeWorkspaceDisplayName(v);
      if (n.length > 120) {
        return NextResponse.json({ error: "Name is too long" }, { status: 400 });
      }
      nextOnboarding.workspace_display_name = n || undefined;
    } else {
      return NextResponse.json({ error: "Invalid workspace_display_name" }, { status: 400 });
    }
  }

  if ("draft_step" in body) {
    const v = body.draft_step;
    if (v === null || v === "") {
      nextOnboarding.draft_step = undefined;
    } else if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 2) {
      nextOnboarding.draft_step = v;
    } else {
      return NextResponse.json({ error: "Invalid draft_step" }, { status: 400 });
    }
  }

  await profileRef.set(
    {
      workspace_onboarding: stripUndefinedShallow(nextOnboarding as Record<string, unknown>),
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true, workspace_onboarding: nextOnboarding });
}

type CompleteBody = {
  workspace_display_name?: unknown;
  collaboration_mode?: unknown;
  team_type?: unknown;
  use_case?: unknown;
  preferred_performance_region?: unknown;
  /** review mode: update fields without toggling lifecycle if already completed */
  review?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireUid(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;

  let body: CompleteBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const profileRef = db.collection("profiles").doc(uid);
  const profileSnap = await profileRef.get();
  const prev = parseWorkspaceOnboardingFromProfile(
    profileSnap.data() as Record<string, unknown> | undefined
  );

  const review = body.review === true;
  /** Any “completed” profile may use review mode; version only affects the idempotent early-return above. */
  const reviewCompleted = review && prev.status === "completed";

  if (!review && prev.status === "completed" && prev.version === CURRENT_WORKSPACE_ONBOARDING_VERSION) {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  const hasShell = await userOwnsPersonalTeamRecord(db, uid);
  const settingsRef = db.collection(PERSONAL_TEAM_SETTINGS_COLLECTION).doc(uid);

  let existingTeamName = "";
  let settingsSnapExists = false;
  if (hasShell) {
    const settingsSnap = await settingsRef.get();
    settingsSnapExists = settingsSnap.exists;
    existingTeamName = ((settingsSnap.data()?.team_name as string) ?? "").trim();
  }

  const nameFromBody = normalizeWorkspaceDisplayName(
    typeof body.workspace_display_name === "string" ? body.workspace_display_name : ""
  );
  /**
   * Naming rules:
   * - Mandatory complete: if team_name already set, it wins (Team settings / branding SoT).
   * - Review (completed users): body wins so Settings → workspace setup can rename and stay in sync
   *   with personal_team_settings.team_name and workspace_onboarding.workspace_display_name.
   */
  const canonicalName = reviewCompleted
    ? nameFromBody
    : existingTeamName.length >= 2
      ? existingTeamName
      : nameFromBody;
  if (canonicalName.length < 2) {
    return NextResponse.json(
      { error: "workspace_display_name is required (min 2 chars)" },
      { status: 400 }
    );
  }

  const cm =
    typeof body.collaboration_mode === "string" ? body.collaboration_mode : "";
  if (!isValidCollaborationMode(cm)) {
    return NextResponse.json({ error: "Invalid collaboration_mode" }, { status: 400 });
  }

  const tt = typeof body.team_type === "string" ? body.team_type : "";
  if (!isValidTeamType(tt)) {
    return NextResponse.json({ error: "Invalid team_type" }, { status: 400 });
  }

  const uc = typeof body.use_case === "string" ? body.use_case : "";
  if (!isValidUseCase(uc)) {
    return NextResponse.json({ error: "Invalid use_case" }, { status: 400 });
  }

  const reg =
    typeof body.preferred_performance_region === "string"
      ? body.preferred_performance_region
      : "";
  if (!isValidPreferredPerformanceRegion(reg)) {
    return NextResponse.json(
      { error: "Invalid preferred_performance_region" },
      { status: 400 }
    );
  }

  const onboardingPayload = stripUndefined({
    collaboration_mode: cm,
    team_type: tt,
    use_case: uc,
    preferred_performance_region: reg,
    workspace_display_name: canonicalName,
    draft_step: null,
  });

  if (hasShell) {
    const shouldWriteTeamName =
      reviewCompleted ||
      (prev.status !== "completed" && existingTeamName.length === 0);
    if (shouldWriteTeamName && canonicalName.length >= 2) {
      await settingsRef.set(
        {
          team_owner_id: uid,
          team_name: canonicalName,
          updated_at: FieldValue.serverTimestamp(),
          ...(settingsSnapExists ? {} : { created_at: FieldValue.serverTimestamp() }),
        },
        { merge: true }
      );
    }
  }

  const nowIso = new Date().toISOString();

  if (reviewCompleted) {
    await profileRef.set(
      {
        workspace_onboarding: onboardingPayload,
      },
      { merge: true }
    );
    return NextResponse.json({ ok: true, review: true });
  }

  await profileRef.set(
    {
      workspace_onboarding_status: "completed",
      workspace_onboarding_version: CURRENT_WORKSPACE_ONBOARDING_VERSION,
      workspace_onboarding_completed_at: nowIso,
      workspace_onboarding: onboardingPayload,
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true });
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj };
  for (const k of Object.keys(out)) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

function stripUndefinedShallow(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
