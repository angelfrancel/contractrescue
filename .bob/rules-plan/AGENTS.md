# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Architectural constraints

- `backend/reservation-service.js` is intentionally decoupled from HTTP so unit and contract tests can import its business logic without starting a server.
- The current contract test calls the backend service and reads the frontend contract constant in the same process. It does not require a running HTTP server.
- The in-memory `Map` in `reservation-service.js` is the only state store. Persistence is outside the scope of this hackathon proof of concept.
- `backend/server.js` is a thin HTTP adapter used for manual and integration demonstrations.
- New backend behavior should be implemented in a service module and exposed through the HTTP adapter. Business logic should not be placed directly in `server.js`.
- The project currently has no linter, formatter configuration, TypeScript, database, or external runtime dependencies.
- CR-001 is complete. Duplicate reservations correctly return HTTP 409. Plans must not treat any prior broken baseline as the current state.
- Plans must use source paths declared by the selected, validated `contractrescue.json` (or explicit config). If a required path is absent from the config, identify the configuration gap before beginning investigation rather than inferring paths from the repository structure.
