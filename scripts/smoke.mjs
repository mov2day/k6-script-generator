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

const requiredFiles = ["config.js", "auth.js", "data-helper.js", "script.js", "README.md"];
for (const fileName of requiredFiles) {
  if (!files[fileName]) {
    throw new Error(`Missing generated file: ${fileName}`);
  }
}

console.log("Smoke check passed.");
console.log(`Candidates detected: ${dynamicCandidates.length}`);
console.log(`Files generated: ${Object.keys(files).length}`);
