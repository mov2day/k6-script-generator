import { generateProjectFiles } from "../src/core/generator.js";
import { collectDynamicCandidates } from "../src/core/inference.js";

const request = {
  path: "/api/v1/orders",
  method: "POST",
  headers: {
    "x-trace-id": "ABC12345",
    "x-client": "web"
  },
  queryParams: {
    userId: "USR123456"
  },
  payloadType: "json",
  payload: {
    orderId: "ORD123456789",
    amount: 199.95,
    createdAt: "2026-04-01T10:30:00Z",
    notes: "baseline payload"
  }
};

const dynamicCandidates = collectDynamicCandidates(request);
const dynamicRules = dynamicCandidates.slice(0, 2).map((candidate) => ({
  area: candidate.area,
  path: candidate.path,
  mode: "dynamic",
  strategy: candidate.suggestion.strategy,
  options: candidate.suggestion.options
}));

const files = generateProjectFiles({
  meta: {
    name: "smoke-generated-test"
  },
  baseUrl: "https://example.com",
  request,
  auth: {
    type: "bearer",
    token: "{{TOKEN}}"
  },
  assertions: {
    statusCode: 200,
    bodyContains: ["success"],
    bodyRegex: ["\\\"status\\\":\\s*\\\"ok\\\""]
  },
  dynamicRules,
  loadProfile: {
    preset: "smoke"
  },
  thresholds: {
    useDefault: true,
    custom: [{ metric: "http_req_duration", condition: "p(90)<500" }]
  }
});

const requiredFiles = ["config.js", "data-helper.js", "script.js", "README.md"];
for (const fileName of requiredFiles) {
  if (!files[fileName]) {
    throw new Error(`Missing generated file: ${fileName}`);
  }
}

if (files["auth.js"]) {
  throw new Error("Did not expect auth.js for bearer-token auth.");
}

if (files["script.js"].includes("function buildUrl")) {
  throw new Error("Did not expect buildUrl helper in generated script.");
}

if (files["script.js"].includes("function applyAuth")) {
  throw new Error("Did not expect applyAuth helper in generated script.");
}

if (files["script.js"].includes("function buildChecks")) {
  throw new Error("Did not expect buildChecks helper in generated script.");
}

if (!files["script.js"].includes("const responseChecks = {")) {
  throw new Error("Expected inline responseChecks in generated script.");
}

const oauthFiles = generateProjectFiles({
  meta: {
    name: "oauth-smoke-test"
  },
  baseUrl: "https://example.com",
  request: {
    path: "/oauth-check",
    method: "GET",
    headers: {},
    queryParams: {},
    payloadType: "none",
    payload: null
  },
  auth: {
    type: "oauth_client_credentials",
    tokenUrl: "https://example.com/oauth/token",
    clientId: "client-id",
    clientSecret: "client-secret"
  },
  assertions: {
    statusCode: 200
  },
  dynamicRules: [],
  loadProfile: {
    preset: "quick"
  },
  thresholds: {
    useDefault: true
  }
});

if (!oauthFiles["auth.js"]) {
  throw new Error("Expected auth.js for OAuth token generation.");
}

if (oauthFiles["data-helper.js"]) {
  throw new Error("Did not expect data-helper.js when no dynamic rules exist.");
}

if (!oauthFiles["script.js"].includes("return getAccessToken(config.auth);")) {
  throw new Error("Expected simplified OAuth setup in generated script.");
}

console.log("Smoke check passed.");
console.log(`Candidates detected: ${dynamicCandidates.length}`);
console.log(`Files generated: ${Object.keys(files).length}`);
