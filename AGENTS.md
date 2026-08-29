# AGENTS.md

This file provides persistent project context and workflow constraints for agents working in this repository.

## Project purpose

ContractRescue is a proof of concept for an IBM Bob workflow that detects, explains, resolves, repairs, and verifies API-contract mismatches across documentation, frontend consumer behavior, backend provider behavior, schemas, and tests.

The baseline is intentionally inconsistent:

- The written API document specifies HTTP 409 for duplicate reservations.
- The frontend consumer expects HTTP 409.
- The backend provider currently returns HTTP 400.
- The backend unit test encodes the existing HTTP 400 behavior.
- The cross-layer contract test intentionally fails with 400 versus 409.

Do not repair this mismatch during initialization or investigation. Any repair must follow the ContractRescue evidence, human approval, implementation, and verification workflow.

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