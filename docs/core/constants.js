export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export const PAYLOAD_TYPES = ["none", "json", "text"];

export const AUTH_TYPES = [
  { value: "none", label: "No auth" },
  { value: "basic", label: "Basic (username/password)" },
  { value: "api_key", label: "API key" },
  { value: "token", label: "Custom token header" },
  { value: "bearer", label: "Bearer token" },
  { value: "oauth_existing", label: "OAuth (existing token)" },
  { value: "oauth_client_credentials", label: "OAuth (client credentials)" },
  { value: "oauth_password", label: "OAuth (resource owner password)" }
];

export const LOAD_PRESETS = ["quick", "smoke", "load", "stress", "custom"];

export const TEST_INTENTS = ["quick_check", "capacity", "breakpoint", "spike", "soak"];

export const DYNAMIC_STRATEGIES = {
  uuid: "UUID",
  iso_datetime: "ISO datetime",
  epoch_seconds: "Epoch seconds",
  epoch_millis: "Epoch millis",
  random_string: "Random string",
  random_digits: "Random numeric string",
  integer_digits: "Integer with fixed digits",
  integer_range: "Integer in range",
  float_range: "Float in range",
  boolean_flip: "Random boolean",
  email: "Random email",
  lorem_text: "Random text",
  pattern: "Pattern-driven value"
};

export const DEFAULT_THRESHOLDS = {
  http_req_failed: ["rate<0.01"],
  http_req_duration: ["p(95)<800", "p(99)<1500"]
};
