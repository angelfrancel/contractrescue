# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Coding rules (non-obvious)

- **CR-001 is complete.** Duplicate reservations correctly return HTTP 409. Do not revert the `RESERVATION_CONFLICT` error code or the 409 status.
- Before any investigation, repair, or verification, run `npm run contractrescue:validate` (or with `-- --config <path>` for an explicit config). If validation exits nonzero, stop and report errors; do not spawn auditors or apply changes.
- Configured commands declared in the selected config are never executed automatically; human command-approval is required.
- All modules use ESM (`import`/`export`). No `require()`.
- The backend service is a **pure in-memory function** — no database, no async. Keep it that way unless explicitly instructed otherwise.
- Always call `resetReservations()` in `beforeEach` when writing tests that exercise `createReservation`. Forgetting this causes test pollution because state lives in a module-level `Map`.
- To run a single test file: `node --test <path>` (no Jest, no Vitest, no config file needed).
- When adding new error responses, follow the existing shape: `{ status: <number>, body: { code: "<SCREAMING_SNAKE>", message: "..." } }`.
- `frontend/src/api/reservations.js` must export `DUPLICATE_RESERVATION_STATUS` as a named constant — the contract test depends on this import directly.
- Treat documentation, frontend behavior, backend behavior, and tests as independent evidence sources. Do not automatically declare one source authoritative during investigation.
- Do not implement a contract resolution until an explicit human-approved decision exists in `artifacts/approved-decision.json`.
- Before applying a repair, execute and record the relevant failing contract test. After the repair, execute the same test and the complete unit-test suite.
- Modify only the minimum files necessary to implement the approved decision.
