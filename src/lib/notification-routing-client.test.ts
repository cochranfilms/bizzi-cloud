import { describe, expect, it } from "vitest";
import { clientNotificationRouting } from "./notification-routing-client";
import { notificationMatchesActiveRouting } from "./notification-routing";

/**
 * Ensures pathname-derived routing matches what the bell sends to the API,
 * and that personal-shell-first notifications appear on /dashboard.
 */
describe("clientNotificationRouting + notificationMatchesActiveRouting", () => {
  it("/dashboard maps to consumer; pending personal team invite is visible", () => {
    const routing = clientNotificationRouting("/dashboard/files", null);
    expect(routing).toBe("consumer");
    expect(
      notificationMatchesActiveRouting(
        {
          type: "personal_team_invited",
          routingBucket: "team:owner_bad",
          metadata: { teamOwnerUserId: "owner_bad" },
        },
        routing
      )
    ).toBe(true);
  });

  it("/team/:owner maps to team bucket; invite is still visible only on consumer", () => {
    const teamRouting = clientNotificationRouting("/team/user123/settings", null);
    expect(teamRouting).toBe("team:user123");
    expect(
      notificationMatchesActiveRouting(
        { type: "personal_team_invited", metadata: { teamOwnerUserId: "user123" } },
        teamRouting
      )
    ).toBe(false);
  });

  it("/enterprise uses org id when provided", () => {
    expect(clientNotificationRouting("/enterprise/files", "org_1")).toBe("enterprise:org_1");
  });

  it("owner team join notification visible on team surface", () => {
    const routing = clientNotificationRouting("/team/ownerA/files", null);
    expect(
      notificationMatchesActiveRouting(
        { type: "personal_team_joined_owner", metadata: { teamOwnerUserId: "ownerA" } },
        routing
      )
    ).toBe(true);
  });
});
