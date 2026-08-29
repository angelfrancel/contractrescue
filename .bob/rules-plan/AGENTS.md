# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Architectural constraints

- `backend/reservation-service.js` is intentionally decoupled from HTTP so unit and contract tests can import its business logic without starting a server.
- The current contract test calls the backend service and reads the frontend contract constant in the same process. It does not require a running HTTP server.
- The in-memory `Map` in `reservation-service.js` is the only state store. Persistence is outside the scope of this hackathon proof of concept.
- `backend/server.js` is a thin HTTP adapter used for manual and integration demonstrations.
- New backend behavior should be implemented in a service module and exposed through the HTTP adapter. Business logic should not be placed directly in `server.js`.
- The project currently has no linter, formatter configuration, TypeScript, database, or external runtime dependencies.
- Plans must preserve the intentional broken baseline until the ContractRescue investigation and human approval stages are complete.