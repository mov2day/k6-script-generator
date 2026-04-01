import { DEFAULT_THRESHOLDS } from "./constants.js";
import { normalizeInteger } from "./utils.js";

export function recommendLoadPreset(intent, targetType = "vus", target = 1) {
  if (intent === "breakpoint") {
    return "stress";
  }

  if (intent === "spike") {
    return "stress";
  }

  if (intent === "soak") {
    return "load";
  }

  if (intent === "capacity") {
    if (targetType === "rpm" && Number(target) > 1000) {
      return "stress";
    }
    return "load";
  }

  return "smoke";
}

export function resolveLoadProfile(loadProfile = {}) {
  const preset = loadProfile.preset || "quick";

  if (preset === "quick") {
    return {
      executor: "shared-iterations",
      vus: 1,
      iterations: 10,
      maxDuration: "30s"
    };
  }

  if (preset === "smoke") {
    return {
      executor: "constant-vus",
      vus: 1,
      duration: "1m"
    };
  }

  if (preset === "load") {
    return {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "30s", target: 5 },
        { duration: "2m", target: 10 },
        { duration: "30s", target: 0 }
      ],
      gracefulRampDown: "20s"
    };
  }

  if (preset === "stress") {
    return {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "45s", target: 10 },
        { duration: "2m", target: 30 },
        { duration: "45s", target: 0 }
      ],
      gracefulRampDown: "30s"
    };
  }

  return resolveCustomLoadProfile(loadProfile.custom || {});
}

function resolveCustomLoadProfile(custom) {
  const targetType = custom.targetType === "rpm" ? "rpm" : "vus";
  const target = Math.max(1, normalizeInteger(custom.target, 10));
  const durationSeconds = Math.max(30, normalizeInteger(custom.durationSeconds, 300));
  const rampUpSeconds = Math.max(10, Math.min(durationSeconds - 10, normalizeInteger(custom.rampUpSeconds, 60)));
  const holdSeconds = Math.max(10, durationSeconds - rampUpSeconds);

  if (targetType === "rpm") {
    const preAllocatedVUs = Math.max(1, Math.ceil(target / 20));
    const maxVUs = Math.max(preAllocatedVUs * 3, Math.ceil(target / 5));
    return {
      executor: "ramping-arrival-rate",
      startRate: 1,
      timeUnit: "1m",
      preAllocatedVUs,
      maxVUs,
      stages: [
        { duration: `${rampUpSeconds}s`, target },
        { duration: `${holdSeconds}s`, target }
      ]
    };
  }

  return {
    executor: "ramping-vus",
    startVUs: 1,
    stages: [
      { duration: `${rampUpSeconds}s`, target },
      { duration: `${holdSeconds}s`, target },
      { duration: "20s", target: 0 }
    ],
    gracefulRampDown: "15s"
  };
}

export function buildThresholdConfig(thresholdInput = {}) {
  const thresholds = {};
  if (thresholdInput.useDefault !== false) {
    Object.assign(thresholds, DEFAULT_THRESHOLDS);
  }

  const custom = Array.isArray(thresholdInput.custom) ? thresholdInput.custom : [];
  for (const item of custom) {
    if (!item || !item.metric || !item.condition) {
      continue;
    }
    if (!thresholds[item.metric]) {
      thresholds[item.metric] = [];
    }
    thresholds[item.metric].push(item.condition);
  }

  return thresholds;
}
