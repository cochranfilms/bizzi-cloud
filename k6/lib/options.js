import { env, envInt } from "./env.js";
import { buildNormalThresholds, buildAbuseThresholds } from "./thresholds.js";

/**
 * Used by feature scripts (notifications, gallery, etc.) with K6_PROFILE.
 * @param {string} execName
 * @param {Record<string, string|string[]>} [thresholds]
 */
export function buildExecutorOptions(execName, thresholds) {
  const profile = env("K6_PROFILE", "load").toLowerCase();
  const execOverride = env("K6_EXECUTOR", "");
  const t = thresholds || buildNormalThresholds();

  let scenarios;
  if (execOverride === "ramping-vus") {
    scenarios = rampingVusScenarios(execName);
  } else if (execOverride === "ramping-arrival-rate") {
    scenarios = rampingArrivalScenarios(execName);
  } else if (execOverride === "constant-vus") {
    scenarios = constantVusSc(
      execName,
      envInt("K6_VUS", 10),
      env("K6_DURATION", "5m")
    );
  } else {
    switch (profile) {
      case "smoke":
        scenarios = constantVusSc(
          execName,
          Math.max(1, envInt("K6_VUS", 3)),
          env("K6_DURATION", "45s")
        );
        break;
      case "spike":
        scenarios = rampingVusSpikeScenarios(execName);
        break;
      case "soak":
        scenarios = constantVusSc(
          execName,
          envInt("K6_VUS", 15),
          env("K6_DURATION", "30m")
        );
        break;
      case "load":
      default:
        scenarios = constantVusSc(
          execName,
          envInt("K6_VUS", 20),
          env("K6_DURATION", "5m")
        );
        break;
    }
  }

  return { scenarios, thresholds: t };
}

/**
 * Legacy umbrella [k6/bizzi-api.js]: default ramping-vus 10→4000 unless K6_EXECUTOR overrides.
 * Thresholds match historical script (not <1% failure).
 * @param {string} execName
 */
export function buildBizziMixOptions() {
  const mode = env("K6_EXECUTOR", "ramping-vus");

  const legacyThresholds = {
    http_req_failed: ["rate<0.5"],
    http_req_duration: ["p(95)<30000"],
  };

  if (mode === "constant-vus") {
    return {
      scenarios: {
        main: {
          executor: "constant-vus",
          vus: envInt("K6_VUS", 10),
          duration: env("K6_DURATION", "5m"),
          exec: "default",
        },
      },
      thresholds: legacyThresholds,
    };
  }

  if (mode === "ramping-arrival-rate") {
    return {
      scenarios: rampingArrivalScenarios("default"),
      thresholds: legacyThresholds,
    };
  }

  return {
    scenarios: rampingVusScenarios("default"),
    thresholds: legacyThresholds,
  };
}

function constantVusSc(execName, vus, duration) {
  return {
    main: {
      executor: "constant-vus",
      vus,
      duration,
      exec: execName,
    },
  };
}

function rampingVusScenarios(execName) {
  return {
    main: {
      executor: "ramping-vus",
      startVUs: envInt("K6_START_VUS", 10),
      stages: [
        {
          duration: env("K6_RAMP_DURATION", "8m"),
          target: envInt("K6_TARGET_VUS", 4000),
        },
        {
          duration: env("K6_HOLD_DURATION", "2m"),
          target: envInt("K6_TARGET_VUS", 4000),
        },
        {
          duration: env("K6_RAMP_DOWN_DURATION", "2m"),
          target: 0,
        },
      ],
      gracefulRampDown: "30s",
      exec: execName,
    },
  };
}

function rampingVusSpikeScenarios(execName) {
  return {
    main: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        {
          duration: env("K6_RAMP_DURATION", "30s"),
          target: envInt("K6_TARGET_VUS", 80),
        },
        {
          duration: env("K6_HOLD_DURATION", "1m"),
          target: envInt("K6_TARGET_VUS", 80),
        },
        {
          duration: env("K6_RAMP_DOWN_DURATION", "20s"),
          target: 0,
        },
      ],
      gracefulRampDown: "15s",
      exec: execName,
    },
  };
}

function rampingArrivalScenarios(execName) {
  return {
    main: {
      executor: "ramping-arrival-rate",
      startRate: envInt("K6_START_RATE", 10),
      timeUnit: "1s",
      preAllocatedVUs: envInt("K6_PREALLOC_VUS", 200),
      maxVUs: envInt("K6_MAX_VUS", 4000),
      stages: [
        {
          duration: env("K6_STAGE1_DURATION", "2m"),
          target: envInt("K6_STAGE1_TARGET", 50),
        },
        {
          duration: env("K6_STAGE2_DURATION", "5m"),
          target: envInt("K6_STAGE2_TARGET", 500),
        },
        {
          duration: env("K6_STAGE3_DURATION", "5m"),
          target: envInt("K6_STAGE3_TARGET", 2000),
        },
        {
          duration: env("K6_STAGE4_DURATION", "2m"),
          target: envInt("K6_STAGE4_TARGET", 0),
        },
      ],
      exec: execName,
    },
  };
}

export { buildNormalThresholds, buildAbuseThresholds };
