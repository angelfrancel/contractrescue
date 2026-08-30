# AGENTS.md

This file provides persistent project context and workflow constraints for agents working in this repository.

## Project purpose

ContractRescue is a proof of concept for an IBM Bob workflow that detects, explains, resolves, repairs, and verifies API-contract mismatches across documentation, frontend consumer behavior, backend provider behavior, schemas, and tests.

## CR-001 status

CR-001 is complete. Duplicate reservations correctly return HTTP 409. The `RESERVATION_CONFLICT` error code must not be reverted.

The following CR-001 historical files are immutable and must not be modified:

- `artifacts/contract-analysis.json`
- `artifacts/approved-decision.json`
- `artifacts/test-results.pre-repair.json`
- `artifacts/test-results.post-repair.json`
- `artifacts/verification-report.json`
- `CONTRACT_TRACEABILITY.md`

New run-specific artifacts may be created under distinct filenames only after their underlying task actually executes and a human reviews the proposed artifact.

## Configuration and investigation

Run `npm run contractrescue:validate` (or `npm run contractrescue:validate -- --config <path>` for an explicit config) before any investigation, repair, or verification. If validation exits nonzero, do not spawn auditors, do not investigate, do not repair — report the validation errors.

Configured commands declared in `contractrescue.json` (or the selected config) are never executed automatically. Normal human command-approval is required before execution.

## Technology stack

- Plain Node.js using ECMAScript modules
- Node.js 20 or later
- No application framework
- No bundler or transpiler
- No external npm dependencies
- Tests use `node:test` and `node:assert/strict`
- The backend uses an in-memory `Map`
- No database or authentication

Running `npm install` is unnecessary for the current proof of concept.

## Security

- Never read, expose, modify, or commit `.env`.
- Never place credentials, access tokens, API keys, personal information, client data, or confidential data in repository artifacts.
- Preserve the official `.gitignore`, `.bobignore`, `.env.example`, and `SECURITY.md`.
- Review the Git diff before every commit.

## Commands

Run all tests:

```bash
npm test
```
