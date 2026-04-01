#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";

import { AUTH_TYPES, HTTP_METHODS, PAYLOAD_TYPES } from "../core/constants.js";
import { collectDynamicCandidates } from "../core/inference.js";
import { generateProjectFiles } from "../core/generator.js";
import { normalizeFloat, normalizeInteger, safeJsonParse, slugify } from "../core/utils.js";

async function askText(rl, label, defaultValue = "") {
  const answer = await rl.question(`${label}${defaultValue ? ` [${defaultValue}]` : ""}: `);
  if (!answer.trim()) {
    return defaultValue;
  }
  return answer.trim();
}

async function askYesNo(rl, label, defaultValue = true) {
  const prompt = defaultValue ? "Y/n" : "y/N";
  const answer = await rl.question(`${label} (${prompt}): `);
  const normalized = answer.trim().toLowerCase();
  if (!normalized) {
    return defaultValue;
  }
  return ["y", "yes"].includes(normalized);
}

async function askChoice(rl, label, options, defaultValue) {
  console.log(`\n${label}`);
  options.forEach((option, index) => {
    const suffix = option.value === defaultValue ? " (default)" : "";
    console.log(`  ${index + 1}. ${option.label}${suffix}`);
  });

  const answer = await rl.question("Choose number or value: ");
  const normalized = answer.trim();
  if (!normalized) {
    return defaultValue;
  }

  const numeric = Number.parseInt(normalized, 10);
  if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= options.length) {
    return options[numeric - 1].value;
  }

  const byValue = options.find((option) => option.value === normalized);
  if (byValue) {
    return byValue.value;
  }

  console.log("Invalid selection, using default.");
  return defaultValue;
}

async function askJson(rl, label, defaultRaw = "{}") {
  while (true) {
    const raw = await askText(rl, label, defaultRaw);
    try {
      const parsed = safeJsonParse(raw, {}, label);
      if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error(`${label} must be a JSON object.`);
      }
      return parsed;
    } catch (error) {
      console.log(error.message);
    }
  }
}

async function promptAuth(rl, authType) {
  if (authType === "none") {
    return { type: "none" };
  }

  if (authType === "basic") {
    return {
      type: authType,
      username: await askText(rl, "Auth username"),
      password: await askText(rl, "Auth password")
    };
  }

  if (authType === "api_key") {
    const location = await askChoice(
      rl,
      "API key location",
      [
        { value: "header", label: "Header" },
        { value: "query", label: "Query parameter" }
      ],
      "header"
    );

    return {
      type: authType,
      location,
      keyName: await askText(rl, "API key name", location === "header" ? "x-api-key" : "api_key"),
      value: await askText(rl, "API key value")
    };
  }

  if (authType === "token") {
    return {
      type: authType,
      headerName: await askText(rl, "Token header name", "X-Auth-Token"),
      token: await askText(rl, "Token value")
    };
  }

  if (authType === "bearer") {
    return {
      type: authType,
      token: await askText(rl, "Bearer token")
    };
  }

  if (authType === "oauth_existing") {
    return {
      type: authType,
      existingToken: await askText(rl, "Existing OAuth token")
    };
  }

  if (authType === "oauth_client_credentials") {
    return {
      type: authType,
      tokenUrl: await askText(rl, "OAuth token URL"),
      clientId: await askText(rl, "OAuth client ID"),
      clientSecret: await askText(rl, "OAuth client secret"),
      scope: await askText(rl, "OAuth scope (optional)")
    };
  }

  return {
    type: authType,
    tokenUrl: await askText(rl, "OAuth token URL"),
    clientId: await askText(rl, "OAuth client ID"),
    clientSecret: await askText(rl, "OAuth client secret"),
    username: await askText(rl, "OAuth username (optional)"),
    password: await askText(rl, "OAuth password (optional)"),
    scope: await askText(rl, "OAuth scope (optional)")
  };
}

async function promptSimpleThresholds(rl) {
  const custom = [];

  const enableP95 = await askYesNo(rl, "Enable p95 threshold", true);
  if (enableP95) {
    const p95 = Math.max(1, normalizeInteger(await askText(rl, "p95 limit (ms)", "800"), 800));
    custom.push({ metric: "http_req_duration", condition: `p(95)<${p95}` });
  }

  const enableP99 = await askYesNo(rl, "Enable p99 threshold", true);
  if (enableP99) {
    const p99 = Math.max(1, normalizeInteger(await askText(rl, "p99 limit (ms)", "1500"), 1500));
    custom.push({ metric: "http_req_duration", condition: `p(99)<${p99}` });
  }

  const enableErrorRate = await askYesNo(rl, "Enable error-rate threshold", true);
  if (enableErrorRate) {
    const percent = Math.min(100, Math.max(0, normalizeFloat(await askText(rl, "Error rate (%)", "1"), 1)));
    custom.push({ metric: "http_req_failed", condition: `rate<${(percent / 100).toFixed(4)}` });
  }

  return { useDefault: false, custom };
}

async function promptLoadProfile(rl) {
  const preset = await askChoice(
    rl,
    "Load profile",
    [
      { value: "quick", label: "Quick" },
      { value: "smoke", label: "Smoke" },
      { value: "load", label: "Load" },
      { value: "stress", label: "Stress" },
      { value: "custom", label: "Custom" }
    ],
    "smoke"
  );

  if (preset !== "custom") {
    return { preset };
  }

  const targetType = await askChoice(
    rl,
    "Custom target type",
    [
      { value: "vus", label: "Concurrent users (VUs)" },
      { value: "rpm", label: "Requests per minute" }
    ],
    "vus"
  );

  return {
    preset,
    custom: {
      targetType,
      target: Math.max(1, normalizeInteger(await askText(rl, `Target ${targetType.toUpperCase()}`, "10"), 10)),
      durationSeconds: Math.max(30, normalizeInteger(await askText(rl, "Duration seconds", "300"), 300)),
      rampUpSeconds: Math.max(10, normalizeInteger(await askText(rl, "Ramp-up seconds", "60"), 60))
    }
  };
}

function autoDynamicRules(request) {
  const candidates = collectDynamicCandidates(request);
  return candidates.map((candidate) => ({
    area: candidate.area,
    path: candidate.path,
    mode: "dynamic",
    strategy: candidate.suggestion.strategy,
    options: candidate.suggestion.options || {}
  }));
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log("\nK6 Script Generator (CLI v1 - quick flow)\n");

    const testName = await askText(rl, "Test name", "generated-k6-test");
    const baseUrl = await askText(rl, "Base URL", "https://example.com");
    const pathValue = await askText(rl, "Endpoint path", "/api/v1/resource");

    const method = await askChoice(
      rl,
      "HTTP method",
      HTTP_METHODS.map((value) => ({ value, label: value })),
      "GET"
    );

    const authType = await askChoice(rl, "Authentication type", AUTH_TYPES, "none");
    const auth = await promptAuth(rl, authType);

    const hasHeaders = await askYesNo(rl, "Add custom headers JSON", false);
    const headers = hasHeaders ? await askJson(rl, "Headers JSON", "{}") : {};

    const hasQueryParams = await askYesNo(rl, "Add query params JSON", false);
    const queryParams = hasQueryParams ? await askJson(rl, "Query params JSON", "{}") : {};

    const payloadType = await askChoice(
      rl,
      "Payload type",
      PAYLOAD_TYPES.map((value) => ({ value, label: value })),
      "none"
    );

    let payload = null;
    if (payloadType === "json") {
      payload = await askJson(rl, "Payload JSON", "{}");
    }

    if (payloadType === "text") {
      payload = await askText(rl, "Payload text", "");
    }

    const request = {
      path: pathValue,
      method,
      headers,
      queryParams,
      payloadType,
      payload
    };

    const dynamicMode = await askChoice(
      rl,
      "Dynamic data mode",
      [
        { value: "static", label: "Keep all values static" },
        { value: "auto", label: "Auto-generate dynamic values" }
      ],
      "static"
    );

    const dynamicRules = dynamicMode === "auto" ? autoDynamicRules(request) : [];

    const statusCode = normalizeInteger(await askText(rl, "Expected status code", "200"), 200);

    const includeBodyContains = await askYesNo(rl, "Add response contains check", false);
    const bodyContains = includeBodyContains
      ? [await askText(rl, "Text that must exist in response body", "success")]
      : [];

    const thresholds = await promptSimpleThresholds(rl);
    const loadProfile = await promptLoadProfile(rl);

    const spec = {
      meta: {
        name: testName,
        description: ""
      },
      baseUrl,
      request,
      auth,
      assertions: {
        statusCode,
        bodyContains,
        bodyRegex: []
      },
      dynamicRules,
      loadProfile,
      thresholds
    };

    const outputDir = await askText(
      rl,
      "Output directory",
      path.join("generated-output", slugify(testName))
    );

    const files = generateProjectFiles(spec);
    await mkdir(outputDir, { recursive: true });

    for (const [fileName, content] of Object.entries(files)) {
      await writeFile(path.join(outputDir, fileName), content, "utf8");
    }

    console.log(`\nGenerated ${Object.keys(files).length} files in: ${outputDir}`);
    console.log(`Dynamic mode: ${dynamicMode} (${dynamicRules.length} fields)`);
    console.log("Run with: k6 run script.js");
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(`\nFailed: ${error.message}`);
  process.exitCode = 1;
});
