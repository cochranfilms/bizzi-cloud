import { describe, expect, it } from "vitest";
import type { NotificationType } from "@/types/collaboration";
import {
  inferNotificationRoutingBucket,
  isPersonalShellFirstNotificationType,
  NOTIFICATION_TYPE_ROUTING_CLASS,
  NOTIFICATION_TYPES_PERSONAL_SHELL_FIRST,
  notificationMatchesActiveRouting,
  notificationVisibleForRouting,
} from "./notification-routing";

/** Compile-time: every NotificationType must appear exactly once in the routing map. */
type RoutingMapKeys = keyof typeof NOTIFICATION_TYPE_ROUTING_CLASS;
type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
type _routingMapExhaustive = AssertEqual<RoutingMapKeys, NotificationType>;
void (null as unknown as _routingMapExhaustive);

describe("isPersonalShellFirstNotificationType", () => {
  it("is true for org and personal team invites and removals", () => {
    expect(isPersonalShellFirstNotificationType("personal_team_invited")).toBe(true);
    expect(isPersonalShellFirstNotificationType("org_seat_invite")).toBe(true);
    expect(isPersonalShellFirstNotificationType("gallery_invite")).toBe(true);
    expect(isPersonalShellFirstNotificationType("personal_team_added")).toBe(true);
    expect(isPersonalShellFirstNotificationType("personal_team_you_were_removed")).toBe(true);
    expect(isPersonalShellFirstNotificationType("org_you_were_removed")).toBe(true);
  });

  it("is false for team-owner activity types", () => {
    expect(isPersonalShellFirstNotificationType("personal_team_joined_owner")).toBe(false);
    expect(isPersonalShellFirstNotificationType("personal_team_member_left_owner")).toBe(false);
  });

  it("is false for org member activity", () => {
    expect(isPersonalShellFirstNotificationType("org_member_joined")).toBe(false);
    expect(isPersonalShellFirstNotificationType("org_role_changed")).toBe(false);
  });
});

describe("inferNotificationRoutingBucket", () => {
  describe("personal shell first (ignores stale Firestore routingBucket)", () => {
    it("personal_team_invited always returns consumer", () => {
      expect(
        inferNotificationRoutingBucket({
          type: "personal_team_invited",
          metadata: { teamOwnerUserId: "owner1" },
        })
      ).toBe("consumer");
    });

    it("personal_team_invited ignores stored team:* bucket", () => {
      expect(
        inferNotificationRoutingBucket({
          type: "personal_team_invited",
          routingBucket: "team:owner1",
          metadata: { teamOwnerUserId: "owner1" },
        })
      ).toBe("consumer");
    });

    it("org_seat_invite always returns consumer", () => {
      expect(
        inferNotificationRoutingBucket({
          type: "org_seat_invite",
          metadata: { orgId: "org9", orgName: "Acme" },
        })
      ).toBe("consumer");
    });

    it("org_seat_invite ignores stored enterprise:* bucket", () => {
      expect(
        inferNotificationRoutingBucket({
          type: "org_seat_invite",
          routingBucket: "enterprise:org_legacy",
          metadata: { orgId: "org9" },
        })
      ).toBe("consumer");
    });

    it("personal_team_you_were_removed returns consumer even with stale team bucket", () => {
      expect(
        inferNotificationRoutingBucket({
          type: "personal_team_you_were_removed",
          routingBucket: "team:owner_x",
          metadata: { teamOwnerUserId: "owner_x" },
        })
      ).toBe("consumer");
    });

    it("org_you_were_removed returns consumer even with stale enterprise bucket", () => {
      expect(
        inferNotificationRoutingBucket({
          type: "org_you_were_removed",
          routingBucket: "enterprise:org1",
          metadata: { orgId: "org1" },
        })
      ).toBe("consumer");
    });

    it("gallery_invite returns consumer and ignores stale buckets", () => {
      expect(
        inferNotificationRoutingBucket({
          type: "gallery_invite",
          routingBucket: "enterprise:wrong",
          metadata: { galleryId: "g1" },
        })
      ).toBe("consumer");
    });

    it("personal_team_added returns consumer", () => {
      expect(
        inferNotificationRoutingBucket({
          type: "personal_team_added",
          routingBucket: "team:someone",
          metadata: { teamOwnerUserId: "someone" },
        })
      ).toBe("consumer");
    });
  });

  describe("team-scoped owner activity", () => {
    it("personal_team_joined_owner infers team from teamOwnerUserId", () => {
      expect(
        inferNotificationRoutingBucket({
          type: "personal_team_joined_owner",
          metadata: { teamOwnerUserId: "uid_owner" },
        })
      ).toBe("team:uid_owner");
    });

    it("personal_team_member_left_owner infers team from teamOwnerUserId", () => {
      expect(
        inferNotificationRoutingBucket({
          type: "personal_team_member_left_owner",
          metadata: { teamOwnerUserId: "uid_owner" },
        })
      ).toBe("team:uid_owner");
    });

    it("respects stored routingBucket when not personal-shell-first", () => {
      expect(
        inferNotificationRoutingBucket({
          type: "personal_team_joined_owner",
          routingBucket: "team:legacy_saved",
          metadata: { teamOwnerUserId: "uid_owner" },
        })
      ).toBe("team:legacy_saved");
    });
  });

  describe("enterprise-scoped org member notifications", () => {
    it("org_member_joined uses orgId", () => {
      expect(
        inferNotificationRoutingBucket({
          type: "org_member_joined",
          metadata: { orgId: "org_abc" },
        })
      ).toBe("enterprise:org_abc");
    });

    it("org_role_changed uses orgId", () => {
      expect(
        inferNotificationRoutingBucket({
          type: "org_role_changed",
          metadata: { orgId: "org_abc" },
        })
      ).toBe("enterprise:org_abc");
    });

    it("org_storage_quota_changed uses orgId", () => {
      expect(
        inferNotificationRoutingBucket({
          type: "org_storage_quota_changed",
          metadata: { orgId: "org_abc" },
        })
      ).toBe("enterprise:org_abc");
    });

    it("org_removal_scheduled uses orgId", () => {
      expect(
        inferNotificationRoutingBucket({
          type: "org_removal_scheduled",
          metadata: { orgId: "org_abc" },
        })
      ).toBe("enterprise:org_abc");
    });

    it("respects stored enterprise bucket for org_member_joined", () => {
      expect(
        inferNotificationRoutingBucket({
          type: "org_member_joined",
          routingBucket: "enterprise:stored_org",
          metadata: { orgId: "org_abc" },
        })
      ).toBe("enterprise:stored_org");
    });
  });

  describe("file_shared workspace targets", () => {
    it("routes to team for personal_team target", () => {
      expect(
        inferNotificationRoutingBucket({
          type: "file_shared",
          metadata: { workspaceTargetKey: "personal_team:owner_z" },
        })
      ).toBe("team:owner_z");
    });

    it("routes to enterprise when enterprise_workspace and targetOrganizationId set", () => {
      expect(
        inferNotificationRoutingBucket({
          type: "file_shared",
          metadata: {
            workspaceTargetKey: "enterprise_workspace:ws_1",
            targetOrganizationId: "org_ent",
          },
        })
      ).toBe("enterprise:org_ent");
    });
  });

  describe("billing org-scoped", () => {
    it("billing_payment_failed uses orgId when billingScope is org", () => {
      expect(
        inferNotificationRoutingBucket({
          type: "billing_payment_failed",
          metadata: { billingScope: "org", orgId: "org_bill" },
        })
      ).toBe("enterprise:org_bill");
    });
  });

  describe("default consumer", () => {
    it("file_comment_created falls through to consumer", () => {
      expect(
        inferNotificationRoutingBucket({
          type: "file_comment_created",
          metadata: { actorDisplayName: "A" },
        })
      ).toBe("consumer");
    });

    it("transfer_sent falls through to consumer", () => {
      expect(
        inferNotificationRoutingBucket({
          type: "transfer_sent",
          metadata: { transferSlug: "x" },
        })
      ).toBe("consumer");
    });
  });

  describe("NOTIFICATION_TYPES_PERSONAL_SHELL_FIRST contract", () => {
    it("every personal-shell-first type resolves to consumer without relying on metadata ids", () => {
      for (const typ of NOTIFICATION_TYPES_PERSONAL_SHELL_FIRST) {
        expect(
          inferNotificationRoutingBucket({
            type: typ,
            routingBucket: "team:evil",
            metadata: {},
          })
        ).toBe("consumer");
      }
    });
  });
});

describe("notificationMatchesActiveRouting (bell / API filtering)", () => {
  const inviteDoc = {
    type: "org_seat_invite",
    routingBucket: "enterprise:old",
    metadata: { orgId: "o1" },
  };

  it("shows org seat invite on personal shell (consumer)", () => {
    expect(notificationMatchesActiveRouting(inviteDoc, "consumer")).toBe(true);
  });

  it("does not show org seat invite only under enterprise until user switches", () => {
    expect(notificationMatchesActiveRouting(inviteDoc, "enterprise:old")).toBe(false);
    expect(notificationMatchesActiveRouting(inviteDoc, "enterprise:o1")).toBe(false);
  });

  it("shows team owner join notification only on matching team surface", () => {
    const doc = {
      type: "personal_team_joined_owner",
      metadata: { teamOwnerUserId: "owner99" },
    };
    expect(notificationMatchesActiveRouting(doc, "team:owner99")).toBe(true);
    expect(notificationMatchesActiveRouting(doc, "consumer")).toBe(false);
  });

  it("shows org_member_joined on enterprise surface", () => {
    const doc = { type: "org_member_joined", metadata: { orgId: "org_x" } };
    expect(notificationMatchesActiveRouting(doc, "enterprise:org_x")).toBe(true);
    expect(notificationMatchesActiveRouting(doc, "consumer")).toBe(false);
  });
});

describe("notificationVisibleForRouting", () => {
  it("requires exact bucket match", () => {
    expect(notificationVisibleForRouting("consumer", "consumer")).toBe(true);
    expect(notificationVisibleForRouting("team:a", "team:a")).toBe(true);
    expect(notificationVisibleForRouting("team:a", "team:b")).toBe(false);
  });
});
