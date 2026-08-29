# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project purpose

ContractRescue is a proof-of-concept for an IBM Bob workflow that detects and repairs API contract mismatches. The **baseline is intentionally broken**: the backend returns `400` for duplicate reservations, but the contract (`docs/api-contract.md`) and the frontend both expect `409`. Do not fix this manually — repairs must go through the Bob workflow.

## Stack

- Plain Node.js (ESM, `"type": "module"`), no framework, no bundler, no transpiler.
- Node ≥ 20 required. Zero npm dependencies — no `npm install` needed.
- Tests use the built-in `node:test` runner and `node:assert/strict`.

## Commands

```bash
npm run test           # run all tests (unit + contract)
npm run test:unit      # unit tests only
npm run test:contract  # contract test only (currently fails by design)
npm start              # start backend on PORT env var or 3001
```

To run a **single test file** directly:
```bash
node --test tests/unit/reservation-service.test.js
```

## Architecture

```
docs/api-contract.md          ← authoritative written contract (product owner)
backend/reservation-service.js ← pure function, no HTTP; exportable for tests
backend/server.js              ← thin HTTP wrapper around reservation-service
frontend/src/api/reservations.js ← exports DUPLICATE_RESERVATION_STATUS (409) and interpretReservationResponse()
tests/unit/                    ← layer-isolated; they pass even when layers disagree
tests/contract/                ← imports both backend service and frontend API directly; this is the cross-layer guard
```

## Critical patterns

- **`resetReservations()`** must be called in `beforeEach` in any test that uses the backend service — state is a module-level `Map` (not reset between test files automatically).
- The contract test imports the backend service function **and** the frontend constants in the same file — this is intentional; it is the consumer-driven contract pattern.
- `DUPLICATE_RESERVATION_STATUS` is the single source of truth for the expected status code on the frontend side. If you change the contract, update this constant.
- `docs/api-contract.md` is the human-written spec and is authoritative. Code must conform to it, not the other way around.
- The HTTP server (`server.js`) handles only `POST /api/reservations`; all other routes return `404` with `{ code: "NOT_FOUND" }`.
- Error bodies always use a `code` string field (e.g. `"INVALID_REQUEST"`, `"RESERVATION_CONFLICT"`, `"INVALID_JSON"`, `"NOT_FOUND"`).
