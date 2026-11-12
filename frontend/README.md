# frontend

React + Vite + TypeScript client for LeeTKOB. The UI follows `../docs/design-system/`.

## Setup

Node.js 22 (`.nvmrc`). Install once, then use the repository `make` targets:

```sh
npm ci
npm run dev        # http://localhost:5173
```

`VITE_API_BASE_URL` (listed in `../.env.example`) points the API client at the backend; empty means same origin.

## Layout

- `src/styles/tokens.css`: generated from `docs/design-system/tokens.json` by `npm run tokens`. Do not edit by hand.
- `src/styles/ui.css`: verbatim copy of `docs/design-system/components/bundle.css`. A test fails if either file drifts.
- `src/components/ui/`: one component per `docs/design-system/components/<Name>/`, using the same `lk-*` classes.
- `src/app/`: router, mocked auth, TA and student layouts.
- `src/api/client.ts`: fetch wrapper; failed requests throw `ApiProblemError` with RFC 9457 problem details.
- `src/features/<flow>/`: feature pages (`auth`, `classes-grading`, `submit-judge`, `review-queue`). ESLint blocks inline styles, stylesheet imports and hard-coded colours or sizes here.

## Checks

| make target    | npm script     | tool                       |
| -------------- | -------------- | -------------------------- |
| `lint`         | `lint`         | ESLint (typescript-eslint) |
| `format-check` | `format:check` | Prettier                   |
| `typecheck`    | `typecheck`    | `tsc -b`                   |
| `test`         | `test`         | Vitest + Testing Library   |
