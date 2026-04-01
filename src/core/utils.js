export function slugify(input) {
  return String(input || "k6-test")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "k6-test";
}

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function deepClone(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function safeJsonParse(raw, fallbackValue, label = "JSON") {
  if (typeof raw !== "string") {
    return raw;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return fallbackValue;
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`Invalid ${label}: ${error.message}`);
  }
}

export function flattenLeafValues(value, path = "") {
  const leaves = [];

  const walk = (node, nodePath) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        const nextPath = nodePath ? `${nodePath}[${index}]` : `[${index}]`;
        walk(item, nextPath);
      });
      return;
    }

    if (isPlainObject(node)) {
      Object.entries(node).forEach(([key, item]) => {
        const nextPath = nodePath ? `${nodePath}.${key}` : key;
        walk(item, nextPath);
      });
      return;
    }

    leaves.push({
      path: nodePath || "$",
      value: node
    });
  };

  walk(value, path);
  return leaves;
}

export function formatPath(area, path) {
  if (path === "$") {
    return area;
  }
  return `${area}.${path}`;
}

export function normalizeInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
}

export function normalizeFloat(value, fallback) {
  const parsed = Number.parseFloat(String(value));
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
}

export function parseThresholdLines(rawText) {
  if (!rawText || !String(rawText).trim()) {
    return [];
  }

  return String(rawText)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(":");
      if (separator === -1) {
        throw new Error(`Invalid threshold line \"${line}\". Expected metric:condition.`);
      }
      const metric = line.slice(0, separator).trim();
      const condition = line.slice(separator + 1).trim();
      if (!metric || !condition) {
        throw new Error(`Invalid threshold line \"${line}\". Expected metric:condition.`);
      }
      return { metric, condition };
    });
}
