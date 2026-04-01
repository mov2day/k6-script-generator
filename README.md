# k6 Script Generator

CLI + static web generator for modular k6 scripts.

## What this v1 does

- Supports **single-endpoint** script generation from either:
1. CLI wizard (`npm run cli`)
2. Static web UI (`docs/index.html`)
- Captures endpoint + request inputs: URL, path, method, auth, headers, params, payload.
- Supports auth modes:
1. none
2. basic
3. API key (header/query)
4. custom token header
5. bearer token
6. OAuth existing token
7. OAuth client credentials
8. OAuth password grant (username/password optional)
- Supports dynamic generation in 1 click (`static` or `auto`).
- Keeps checks and thresholds simple in UI (checkbox + number inputs).
- Generates lean modular files:
1. Always: `script.js`, `config.js`, `README.md`
2. Only when needed: `auth.js` for OAuth token generation
3. Only when needed: `data-helper.js` for dynamic fields

## Architecture

Shared core (`src/core`) contains all business logic.

- `inference.js`: value analysis and dynamic generator suggestions.
- `profiles.js`: load profile + k6 scenario/threshold assembly.
- `generator.js`: final k6 file generation.
- `constants.js`, `utils.js`: shared primitives.

Adapters:

- CLI adapter: `src/cli/index.js`
- Web adapter: `docs/app.js`

This keeps CLI and web behavior aligned while letting each UI evolve independently.

## GitHub Pages compatibility

The web app is in `docs/` and uses **relative paths only**, so it can be hosted directly on GitHub Pages.

- `docs/index.html`
- `docs/styles.css`
- `docs/app.js`
- `docs/core/*.js`

`docs/core` is synced from `src/core` with:

```bash
npm run sync:web-core
```

Run this after changing shared core modules.

## Local usage

### 1) CLI

```bash
npm run cli
```

Generated scripts are written to `generated-output/<test-name-slug>/`.

### 2) Static UI

```bash
npm run build:web
npm run serve:docs
```

Then open: <http://localhost:8080>

## Validation

Smoke check:

```bash
npm run smoke
```

## Suggested v2 (multi-endpoint + scenarios)

Add an explicit scenario model now to avoid redesign later:

```txt
TestPlan
  scenarios[]
    steps[]
      request + auth + dynamic rules + assertions
```

Recommended v2 upgrades:

1. Multi-endpoint workflow with ordered steps and data passing.
2. Correlation extraction (`response -> variable -> next request`).
3. CSV/JSON external datasets and parameterization pools.
4. Advanced assertions (JSONPath, schema, contracts).
5. Scenario templates (login-flow, checkout, search-browse).
6. Export/import of test plans (JSON format).
