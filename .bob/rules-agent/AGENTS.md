# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Coding rules (non-obvious)

- **Do not repair the `400` → `409` mismatch** in `backend/reservation-service.js` without an explicit user instruction to do so via the Bob workflow. It is the intentional broken baseline.
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
