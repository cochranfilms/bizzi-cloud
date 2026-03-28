import { describe, expect, it } from "vitest";
import {
  remainingAllocatableBytes,
  remainingSubscriptionHeadroomBytes,
  remainingUsablePoolBytes,
} from "./personal-team-pool-accounting";

describe("personal-team-pool-accounting", () => {
  it("remainingAllocatableBytes subtracts allocated and reserved", () => {
    const pool = 9 * 1024 ** 4;
    expect(
      remainingAllocatableBytes({
        poolBytes: pool,
        fixedAllocated: 2 * 1024 ** 4,
        fixedReserved: 2 * 1024 ** 4,
      })
    ).toBe(5 * 1024 ** 4);
  });

  it("remainingAllocatableBytes never goes negative", () => {
    expect(
      remainingAllocatableBytes({
        poolBytes: 100,
        fixedAllocated: 80,
        fixedReserved: 50,
      })
    ).toBe(0);
  });

  it("remainingUsablePoolBytes uses team-scoped usage only", () => {
    const pool = 1000;
    expect(remainingUsablePoolBytes({ poolBytes: pool, teamScopedUsedBytes: 600 })).toBe(400);
  });

  it("remainingSubscriptionHeadroomBytes uses full billable usage", () => {
    const pool = 1000;
    expect(
      remainingSubscriptionHeadroomBytes({ poolBytes: pool, billableUsedBytes: 950 })
    ).toBe(50);
  });

  it("9 TB purchased: two 2 TB fixed seats leaves 5 TB assignable; 5 TB pending fills it; billable headroom is separate", () => {
    const pool = 9 * 1024 ** 4;
    const twoTb = 2 * 1024 ** 4;
    const fiveTb = 5 * 1024 ** 4;
    expect(
      remainingAllocatableBytes({
        poolBytes: pool,
        fixedAllocated: twoTb * 2,
        fixedReserved: 0,
      })
    ).toBe(fiveTb);
    expect(
      remainingAllocatableBytes({
        poolBytes: pool,
        fixedAllocated: twoTb * 2,
        fixedReserved: fiveTb,
      })
    ).toBe(0);
    const teamUsed = 1 * 1024 ** 4;
    const billableUsed = pool;
    expect(remainingUsablePoolBytes({ poolBytes: pool, teamScopedUsedBytes: teamUsed })).toBe(pool - teamUsed);
    expect(remainingSubscriptionHeadroomBytes({ poolBytes: pool, billableUsedBytes: billableUsed })).toBe(0);
  });
});
