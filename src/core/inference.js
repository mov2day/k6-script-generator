import { flattenLeafValues, formatPath, escapeRegex } from "./utils.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}([tT ]\d{2}:\d{2}:\d{2}(\.\d{1,3})?([zZ]|[+-]\d{2}:?\d{2})?)?$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function classifyCharacter(char) {
  if (/[A-Z]/.test(char)) {
    return "upper";
  }
  if (/[a-z]/.test(char)) {
    return "lower";
  }
  if (/\d/.test(char)) {
    return "digit";
  }
  return "literal";
}

function segmentStringPattern(value) {
  const chars = Array.from(value);
  if (!chars.length) {
    return null;
  }

  const segments = [];
  for (const char of chars) {
    const type = classifyCharacter(char);
    const current = segments[segments.length - 1];
    if (
      current &&
      current.type === type &&
      (type !== "literal" || current.value === char)
    ) {
      current.count += 1;
      continue;
    }

    segments.push({
      type,
      count: 1,
      value: type === "literal" ? char : undefined
    });
  }

  const hasDigits = segments.some((segment) => segment.type === "digit");
  const hasLetters = segments.some(
    (segment) => segment.type === "upper" || segment.type === "lower"
  );

  if (!hasDigits || !hasLetters || segments.length < 2 || value.length < 6 || /\s/.test(value)) {
    return null;
  }

  const pattern =
    "^" +
    segments
      .map((segment) => {
        if (segment.type === "upper") {
          return segment.count > 1 ? `[A-Z]{${segment.count}}` : "[A-Z]";
        }
        if (segment.type === "lower") {
          return segment.count > 1 ? `[a-z]{${segment.count}}` : "[a-z]";
        }
        if (segment.type === "digit") {
          return segment.count > 1 ? `\\d{${segment.count}}` : "\\d";
        }
        const escaped = escapeRegex(segment.value);
        return segment.count > 1 ? `${escaped}{${segment.count}}` : escaped;
      })
      .join("") +
    "$";

  return { pattern, segments };
}

function inferFromString(value) {
  const trimmed = value.trim();

  if (!trimmed) {
    return {
      strategy: "random_string",
      label: "Empty string -> random string",
      options: { length: 12 }
    };
  }

  if (UUID_REGEX.test(trimmed)) {
    return {
      strategy: "uuid",
      label: "UUID format",
      options: {}
    };
  }

  if (EMAIL_REGEX.test(trimmed)) {
    return {
      strategy: "email",
      label: "Email format",
      options: { domain: "example.test" }
    };
  }

  if (/^\d{13}$/.test(trimmed)) {
    return {
      strategy: "epoch_millis",
      label: "13-digit epoch millis",
      options: {}
    };
  }

  if (/^\d{10}$/.test(trimmed)) {
    return {
      strategy: "epoch_seconds",
      label: "10-digit epoch seconds",
      options: {}
    };
  }

  if (ISO_DATE_REGEX.test(trimmed)) {
    return {
      strategy: "iso_datetime",
      label: "ISO date/time",
      options: {}
    };
  }

  if (/^\d+$/.test(trimmed)) {
    if (trimmed.length >= 10) {
      return {
        strategy: "integer_digits",
        label: `${trimmed.length}-digit numeric string`,
        options: { digits: trimmed.length }
      };
    }

    return {
      strategy: "random_digits",
      label: `${trimmed.length}-digit numeric string`,
      options: { length: Math.max(trimmed.length, 4) }
    };
  }

  const patternInfo = segmentStringPattern(trimmed);
  if (patternInfo) {
    return {
      strategy: "pattern",
      label: `Pattern detected (${patternInfo.pattern})`,
      options: {
        pattern: patternInfo.pattern,
        segments: patternInfo.segments
      }
    };
  }

  if (trimmed.length > 40) {
    return {
      strategy: "lorem_text",
      label: "Long text",
      options: { minLength: trimmed.length }
    };
  }

  return {
    strategy: "random_string",
    label: `Random string (${trimmed.length} chars)`,
    options: { length: Math.max(trimmed.length, 8) }
  };
}

export function inferDynamicSuggestion(value) {
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      const digits = String(Math.abs(value)).length;
      if (digits >= 10) {
        return {
          strategy: "integer_digits",
          label: `${digits}-digit integer`,
          options: { digits }
        };
      }

      return {
        strategy: "integer_range",
        label: `Integer near ${value}`,
        options: {
          min: Math.max(0, value - Math.max(5, Math.round(value * 0.2))),
          max: value + Math.max(5, Math.round(value * 0.2))
        }
      };
    }

    const spread = Math.max(1, Math.abs(value * 0.2));
    return {
      strategy: "float_range",
      label: `Float near ${value}`,
      options: { min: value - spread, max: value + spread }
    };
  }

  if (typeof value === "boolean") {
    return {
      strategy: "boolean_flip",
      label: "Boolean",
      options: {}
    };
  }

  if (typeof value === "string") {
    return inferFromString(value);
  }

  if (value === null) {
    return {
      strategy: "random_string",
      label: "Null -> random string",
      options: { length: 10 }
    };
  }

  return {
    strategy: "random_string",
    label: "Fallback random string",
    options: { length: 10 }
  };
}

export function collectDynamicCandidates(request) {
  const candidates = [];

  const areas = [
    { area: "headers", value: request.headers || {} },
    { area: "queryParams", value: request.queryParams || {} }
  ];

  if (request.payloadType === "json") {
    areas.push({ area: "payload", value: request.payload || {} });
  }

  if (request.payloadType === "text") {
    areas.push({ area: "payload", value: request.payload || "" });
  }

  for (const areaDef of areas) {
    const leaves = flattenLeafValues(areaDef.value);

    for (const leaf of leaves) {
      if (
        areaDef.area === "headers" &&
        /^authorization$/i.test(leaf.path.replace(/^.*\./, ""))
      ) {
        continue;
      }

      const suggestion = inferDynamicSuggestion(leaf.value);
      candidates.push({
        id: `${areaDef.area}:${leaf.path}`,
        area: areaDef.area,
        path: leaf.path,
        fullPath: formatPath(areaDef.area, leaf.path),
        value: leaf.value,
        suggestion
      });
    }
  }

  return candidates;
}
