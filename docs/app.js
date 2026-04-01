import { generateProjectFiles } from "./core/generator.js";
import { collectDynamicCandidates } from "./core/inference.js";
import { normalizeFloat, normalizeInteger, safeJsonParse, slugify } from "./core/utils.js";

const LOAD_PROFILE_HELP = {
  quick: {
    title: "Quick",
    description: "A very short run for fast connectivity and basic correctness checks.",
    summary: "Uses a tiny iteration-based profile for a quick script check."
  },
  smoke: {
    title: "Smoke",
    description: "Low steady traffic to confirm the endpoint behaves correctly under light load.",
    summary: "Runs a small constant-VU profile for a short duration."
  },
  load: {
    title: "Load",
    description: "Gradually increases traffic and holds a realistic sustained load.",
    summary: "Best for validating expected production-like usage."
  },
  stress: {
    title: "Stress",
    description: "Pushes the service past normal capacity to see where behavior degrades.",
    summary: "Uses a more aggressive ramp and higher peak concurrency."
  },
  custom: {
    title: "Custom",
    description: "Define your own target style, load target, duration, and ramp-up.",
    summary: "Answer the custom questions below to build the scenario."
  }
};

function byId(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}`);
  }
  return element;
}

function setStatus(message, type = "muted") {
  const status = byId("status-message");
  status.textContent = message;
  status.className = `helper-text ${type}`;
}

function authFieldTemplate(authType) {
  if (authType === "basic") {
    return `
      <label>Username <input name="username" type="text" autocomplete="username" /></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" /></label>
    `;
  }

  if (authType === "api_key") {
    return `
      <label>Location
        <select name="location">
          <option value="header">Header</option>
          <option value="query">Query param</option>
        </select>
      </label>
      <label>Key name <input name="keyName" type="text" value="x-api-key" /></label>
      <label>Value <input name="value" type="text" /></label>
    `;
  }

  if (authType === "token") {
    return `
      <label>Header name <input name="headerName" type="text" value="X-Auth-Token" /></label>
      <label>Token <input name="token" type="text" /></label>
    `;
  }

  if (authType === "bearer") {
    return `<label>Bearer token <input name="token" type="text" /></label>`;
  }

  if (authType === "oauth_existing") {
    return `<label>Existing token <input name="existingToken" type="text" /></label>`;
  }

  if (authType === "oauth_client_credentials") {
    return `
      <label>Token URL <input name="tokenUrl" type="url" /></label>
      <label>Client ID <input name="clientId" type="text" /></label>
      <label>Client secret <input name="clientSecret" type="password" /></label>
      <label>Scope <input name="scope" type="text" placeholder="optional" /></label>
    `;
  }

  if (authType === "oauth_password") {
    return `
      <label>Token URL <input name="tokenUrl" type="url" /></label>
      <label>Client ID <input name="clientId" type="text" /></label>
      <label>Client secret <input name="clientSecret" type="password" /></label>
      <label>Username <input name="username" type="text" placeholder="optional" /></label>
      <label>Password <input name="password" type="password" placeholder="optional" /></label>
      <label>Scope <input name="scope" type="text" placeholder="optional" /></label>
    `;
  }

  return `<p class="editor-empty">No authentication fields.</p>`;
}

function renderAuthFields() {
  const authType = byId("auth-type").value;
  byId("auth-fields").innerHTML = authFieldTemplate(authType);
}

function togglePairedInput(checkboxId, inputId) {
  byId(inputId).disabled = !byId(checkboxId).checked;
}

function updatePayloadVisibility() {
  const payloadType = byId("payload-type").value;
  byId("payload-json-mode-wrap").classList.toggle("hidden", payloadType !== "json");
  byId("payload-json-wrap").classList.toggle("hidden", payloadType !== "json");
  byId("payload-text-wrap").classList.toggle("hidden", payloadType !== "text");
  updatePayloadJsonMode();
}

function updateLoadUi() {
  const preset = byId("load-preset").value;
  const help = LOAD_PROFILE_HELP[preset] || LOAD_PROFILE_HELP.smoke;

  byId("load-profile-title").textContent = help.title;
  byId("load-profile-description").textContent = help.description;
  byId("load-profile-summary").textContent =
    preset === "custom" ? buildCustomLoadSummary() : help.summary;
  byId("custom-load-fields").classList.toggle("hidden", preset !== "custom");
  byId("custom-load-help").classList.toggle("hidden", preset !== "custom");
}

function updatePayloadJsonMode() {
  const isJson = byId("payload-type").value === "json";
  const mode = byId("payload-json-mode").value;

  byId("payload-json-builder").classList.toggle("hidden", !isJson || mode !== "fields");
  byId("payload-json-raw").classList.toggle("hidden", !isJson || mode !== "raw");
}

function createInput(type, placeholder = "", value = "") {
  const input = document.createElement("input");
  input.type = type;
  input.placeholder = placeholder;
  input.value = value;
  return input;
}

function createSelect(options, value) {
  const select = document.createElement("select");

  for (const optionDef of options) {
    const option = document.createElement("option");
    option.value = optionDef.value;
    option.textContent = optionDef.label;
    select.appendChild(option);
  }

  select.value = value;
  return select;
}

function createRemoveButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "row-remove";
  button.textContent = "Remove";
  button.addEventListener("click", () => {
    const row = button.closest(".kv-row, .payload-row");
    const list = row?.parentElement;
    if (!row || !list) {
      return;
    }

    row.remove();
    if (!list.querySelector(".kv-row, .payload-row")) {
      if (list.id === "payload-rows") {
        list.appendChild(createPayloadRow());
      } else {
        list.appendChild(createPairRow());
      }
    }
  });
  return button;
}

function createPairRow(key = "", value = "") {
  const row = document.createElement("div");
  row.className = "kv-row";

  const keyInput = createInput("text", "name", key);
  keyInput.dataset.role = "key";

  const valueInput = createInput("text", "value", value);
  valueInput.dataset.role = "value";

  row.append(keyInput, valueInput, createRemoveButton());
  return row;
}

function createPayloadRow(key = "", type = "string", value = "") {
  const row = document.createElement("div");
  row.className = "payload-row";

  const keyInput = createInput("text", "field", key);
  keyInput.dataset.role = "key";

  const typeSelect = createSelect(
    [
      { value: "string", label: "string" },
      { value: "number", label: "number" },
      { value: "boolean", label: "boolean" },
      { value: "null", label: "null" }
    ],
    type
  );
  typeSelect.dataset.role = "type";

  const valueInput = createInput("text", "value", value);
  valueInput.dataset.role = "value";
  valueInput.disabled = type === "null";

  typeSelect.addEventListener("change", () => {
    valueInput.disabled = typeSelect.value === "null";
    if (typeSelect.value === "null") {
      valueInput.value = "";
    }
  });

  row.append(keyInput, typeSelect, valueInput, createRemoveButton());
  return row;
}

function seedEditors() {
  const headerRows = byId("header-rows");
  const queryRows = byId("query-rows");
  const payloadRows = byId("payload-rows");

  if (!headerRows.children.length) {
    headerRows.appendChild(createPairRow());
  }
  if (!queryRows.children.length) {
    queryRows.appendChild(createPairRow());
  }
  if (!payloadRows.children.length) {
    payloadRows.appendChild(createPayloadRow());
  }
}

function readPairs(containerId) {
  const container = byId(containerId);
  const result = {};

  for (const row of container.querySelectorAll(".kv-row")) {
    const key = row.querySelector('[data-role="key"]')?.value.trim() || "";
    const value = row.querySelector('[data-role="value"]')?.value || "";
    if (!key) {
      continue;
    }
    result[key] = value;
  }

  return result;
}

function parsePayloadValue(type, raw) {
  if (type === "number") {
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      throw new Error(`Payload field value "${raw}" is not a valid number.`);
    }
    return parsed;
  }

  if (type === "boolean") {
    const normalized = String(raw).trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
    throw new Error(`Payload boolean value "${raw}" must be true or false.`);
  }

  if (type === "null") {
    return null;
  }

  return raw;
}

function readPayloadObject() {
  if (byId("payload-json-mode").value === "raw") {
    const parsed = safeJsonParse(byId("payload-json-raw-text").value, {}, "Payload JSON");
    if (parsed === null || typeof parsed !== "object") {
      throw new Error("Payload JSON must be an object or array.");
    }
    return parsed;
  }

  const result = {};

  for (const row of byId("payload-rows").querySelectorAll(".payload-row")) {
    const key = row.querySelector('[data-role="key"]')?.value.trim() || "";
    const type = row.querySelector('[data-role="type"]')?.value || "string";
    const rawValue = row.querySelector('[data-role="value"]')?.value || "";

    if (!key) {
      continue;
    }

    result[key] = parsePayloadValue(type, rawValue);
  }

  return result;
}

function buildCustomLoadSummary() {
  const targetType = byId("target-type").value;
  const target = Math.max(1, normalizeInteger(byId("target-value").value, 10));
  const durationSeconds = Math.max(30, normalizeInteger(byId("custom-duration").value, 300));
  const rampUpSeconds = Math.max(10, normalizeInteger(byId("custom-ramp").value, 60));
  const holdSeconds = Math.max(10, durationSeconds - rampUpSeconds);
  const unitLabel = targetType === "rpm" ? "requests/min" : "VUs";

  return `Ramp to ${target} ${unitLabel} over ${rampUpSeconds}s, then hold for ${holdSeconds}s.`;
}

function readRequestFromForm() {
  const payloadType = byId("payload-type").value;

  let payload = null;
  if (payloadType === "json") {
    payload = readPayloadObject();
  } else if (payloadType === "text") {
    payload = byId("payload-text").value;
  }

  return {
    path: byId("path").value.trim() || "/",
    method: byId("method").value,
    headers: readPairs("header-rows"),
    queryParams: readPairs("query-rows"),
    payloadType,
    payload
  };
}

function readAuthFromForm() {
  const authType = byId("auth-type").value;
  const container = byId("auth-fields");

  const valueOf = (name) => {
    const input = container.querySelector(`[name="${name}"]`);
    return input ? String(input.value || "").trim() : "";
  };

  if (authType === "none") {
    return { type: "none" };
  }

  if (authType === "basic") {
    return {
      type: authType,
      username: valueOf("username"),
      password: valueOf("password")
    };
  }

  if (authType === "api_key") {
    return {
      type: authType,
      location: valueOf("location") || "header",
      keyName: valueOf("keyName") || "x-api-key",
      value: valueOf("value")
    };
  }

  if (authType === "token") {
    return {
      type: authType,
      headerName: valueOf("headerName") || "X-Auth-Token",
      token: valueOf("token")
    };
  }

  if (authType === "bearer") {
    return {
      type: authType,
      token: valueOf("token")
    };
  }

  if (authType === "oauth_existing") {
    return {
      type: authType,
      existingToken: valueOf("existingToken")
    };
  }

  if (authType === "oauth_client_credentials") {
    return {
      type: authType,
      tokenUrl: valueOf("tokenUrl"),
      clientId: valueOf("clientId"),
      clientSecret: valueOf("clientSecret"),
      scope: valueOf("scope")
    };
  }

  return {
    type: authType,
    tokenUrl: valueOf("tokenUrl"),
    clientId: valueOf("clientId"),
    clientSecret: valueOf("clientSecret"),
    username: valueOf("username"),
    password: valueOf("password"),
    scope: valueOf("scope")
  };
}

function readAssertionsFromForm() {
  const bodyContains = [];
  if (byId("enable-body-contains").checked) {
    const value = byId("body-contains-value").value.trim();
    if (value) {
      bodyContains.push(value);
    }
  }

  return {
    statusCode: normalizeInteger(byId("status-code").value, 200),
    bodyContains,
    bodyRegex: []
  };
}

function readThresholdsFromForm() {
  const custom = [];

  if (byId("enable-p95").checked) {
    const p95 = Math.max(1, normalizeInteger(byId("p95-ms").value, 800));
    custom.push({ metric: "http_req_duration", condition: `p(95)<${p95}` });
  }

  if (byId("enable-p99").checked) {
    const p99 = Math.max(1, normalizeInteger(byId("p99-ms").value, 1500));
    custom.push({ metric: "http_req_duration", condition: `p(99)<${p99}` });
  }

  if (byId("enable-error-rate").checked) {
    const percent = Math.min(100, Math.max(0, normalizeFloat(byId("error-rate-percent").value, 1)));
    const rate = Math.max(0, Math.min(1, percent / 100));
    custom.push({ metric: "http_req_failed", condition: `rate<${rate.toFixed(4)}` });
  }

  return {
    useDefault: false,
    custom
  };
}

function readLoadProfileFromForm() {
  const preset = byId("load-preset").value;
  if (preset !== "custom") {
    return { preset };
  }

  return {
    preset,
    custom: {
      targetType: byId("target-type").value,
      target: Math.max(1, normalizeInteger(byId("target-value").value, 10)),
      durationSeconds: Math.max(30, normalizeInteger(byId("custom-duration").value, 300)),
      rampUpSeconds: Math.max(10, normalizeInteger(byId("custom-ramp").value, 60))
    }
  };
}

function collectDynamicRules(request) {
  if (byId("dynamic-mode").value !== "auto") {
    return [];
  }

  return collectDynamicCandidates(request).map((candidate) => ({
    area: candidate.area,
    path: candidate.path,
    mode: "dynamic",
    strategy: candidate.suggestion.strategy,
    options: candidate.suggestion.options || {}
  }));
}

function renderOutputFiles(files) {
  const container = byId("output-files");
  container.innerHTML = "";

  for (const [name, content] of Object.entries(files)) {
    const card = document.createElement("article");
    card.className = "output-card";

    const header = document.createElement("header");
    const title = document.createElement("code");
    title.textContent = name;

    const actions = document.createElement("div");
    actions.className = "file-actions";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(content);
        setStatus(`Copied ${name} to clipboard.`, "success");
      } catch {
        setStatus(`Failed to copy ${name}.`, "error");
      }
    });

    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.textContent = "Download";
    downloadBtn.addEventListener("click", () => {
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(url);
    });

    actions.append(copyBtn, downloadBtn);
    header.append(title, actions);

    const pre = document.createElement("pre");
    pre.textContent = content;

    card.append(header, pre);
    container.appendChild(card);
  }
}

function generateFiles() {
  try {
    const request = readRequestFromForm();
    const spec = {
      meta: {
        name: byId("test-name").value.trim() || "generated-k6-test",
        description: ""
      },
      baseUrl: byId("base-url").value.trim() || "https://example.com",
      request,
      auth: readAuthFromForm(),
      assertions: readAssertionsFromForm(),
      thresholds: readThresholdsFromForm(),
      loadProfile: readLoadProfileFromForm(),
      dynamicRules: collectDynamicRules(request)
    };

    const files = generateProjectFiles(spec);
    renderOutputFiles(files);
    setStatus(`Generated ${Object.keys(files).length} files for ${slugify(spec.meta.name)}.`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function wireRowEditors() {
  byId("add-header").addEventListener("click", () => {
    byId("header-rows").appendChild(createPairRow());
  });

  byId("add-query-param").addEventListener("click", () => {
    byId("query-rows").appendChild(createPairRow());
  });

  byId("add-payload-field").addEventListener("click", () => {
    byId("payload-rows").appendChild(createPayloadRow());
  });
}

function wireEvents() {
  byId("auth-type").addEventListener("change", renderAuthFields);
  byId("payload-type").addEventListener("change", updatePayloadVisibility);
  byId("payload-json-mode").addEventListener("change", updatePayloadJsonMode);
  byId("load-preset").addEventListener("change", updateLoadUi);
  byId("target-type").addEventListener("change", updateLoadUi);
  byId("target-value").addEventListener("input", updateLoadUi);
  byId("custom-duration").addEventListener("input", updateLoadUi);
  byId("custom-ramp").addEventListener("input", updateLoadUi);

  byId("enable-body-contains").addEventListener("change", () => {
    togglePairedInput("enable-body-contains", "body-contains-value");
  });
  byId("enable-p95").addEventListener("change", () => {
    togglePairedInput("enable-p95", "p95-ms");
  });
  byId("enable-p99").addEventListener("change", () => {
    togglePairedInput("enable-p99", "p99-ms");
  });
  byId("enable-error-rate").addEventListener("change", () => {
    togglePairedInput("enable-error-rate", "error-rate-percent");
  });

  byId("generate").addEventListener("click", generateFiles);
  wireRowEditors();
}

function bootstrap() {
  try {
    renderAuthFields();
    seedEditors();
    updatePayloadVisibility();
    updateLoadUi();

    togglePairedInput("enable-body-contains", "body-contains-value");
    togglePairedInput("enable-p95", "p95-ms");
    togglePairedInput("enable-p99", "p99-ms");
    togglePairedInput("enable-error-rate", "error-rate-percent");

    wireEvents();
  } catch (error) {
    console.error(error);
    setStatus(`UI initialization failed: ${error.message}`, "error");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
  bootstrap();
}
