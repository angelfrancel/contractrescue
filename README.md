# ContractRescue

ContractRescue detects cross-layer API contract mismatches, guides a developer through approving the correct behavior, and automatically generates a decision-bound test, repairs the implementation, and verifies the result end-to-end. IBM Bob is the orchestration and execution layer.

## Problem

API expectations can contradict each other across documentation, frontend consumer code, backend provider code, and tests simultaneously. Layer-specific test suites pass — each layer only validates its own assumptions — while integration behavior is wrong. The mismatch remains invisible until a cross-layer contract test catches it.

## Demonstrated scenario

The reservation API contained a single inconsistency across four layers:

| Layer | Expected status for duplicate |
|---|---|
| `docs/api-contract.md` | 409 |
| Frontend (`DUPLICATE_RESERVATION_STATUS`) | 409 |
| Backend (`createReservation`) | **400** (pre-repair) |
| Backend unit test | **400** (pre-repair) |

Because the frontend only routes HTTP 409 to its `"conflict"` outcome branch, the backend's 400 response would cause a duplicate reservation to be treated as an unexpected error by the consumer.

ContractRescue detected the contradiction, presented it for human approval, generated a failing contract test, applied a minimal repair, and independently verified the result — all through the Bob workflow with genuine artifacts.

## End-to-end workflow

1. **Document and code understanding** — Bob reads `docs/api-contract.md`, frontend source, backend source, and both test suites.
2. **Three parallel read-only auditors** — `contract-evidence-auditor`, `consumer-auditor`, and `provider-auditor` subagents investigate their respective layers simultaneously; no source code is modified during this phase.
3. **Evidence arbitration** — Bob consolidates findings into `artifacts/contract-analysis.json`, identifies the blocking contradiction, and recommends aligning the backend to HTTP 409.
4. **Human approval dashboard** — `npm run dashboard` serves the approval UI; the developer reviews the evidence summary and approves or rejects the recommended decision, which is recorded in `artifacts/approved-decision.json`.
5. **Decision-bound RED test** — Bob generates `tests/contract/generated/duplicate-reservation-approved.test.js`, which reads the expected status at runtime from the approved decision artifact. The test is executed before any repair and fails with `expected 409, observed 400`.
6. **Minimal Agent Mode repair** — Bob modifies only the files authorized by the decision: the backend status code and the stale backend unit test assertion. No unrelated implementation or test files are changed.
7. **GREEN verification** — The generated contract test, the existing contract suite, and the full unit suite are all executed and pass.
8. **Independent verifier** — A separate `contract-verifier` subagent in a new Bob task re-reads all evidence, re-executes all tests, and inspects the git diff. Its findings are subsequently materialized by Bob in `artifacts/verification-report.json` after human review.

## IBM Bob 2.0 usage

- **Agent Mode** — Bob edits source files, writes tests, and records artifacts directly in the repository.
- **Subagents and parallel tasks** — Three read-only auditor subagents run in parallel during investigation; a separate verifier subagent runs independently after implementation.
- **Document understanding** — Bob reads `docs/api-contract.md` and interprets written API requirements as first-class evidence alongside code.
- **Reusable `.bob/agents` personas** — Four named personas (`contract-evidence-auditor`, `consumer-auditor`, `provider-auditor`, `contract-verifier`) are defined in `.bob/agents/` and invoked by name across tasks.
- **Approval gates** — No repair is started until `artifacts/approved-decision.json` is present and `implementationAuthorized: true`. The generated test and the repair are both decision-bound.

## Architecture

```text
docs/
  api-contract.md              Written API specification

frontend/src/api/
  reservations.js              Consumer — DUPLICATE_RESERVATION_STATUS, interpretReservationResponse

backend/
  reservation-service.js       Provider — createReservation (repaired)
  server.js                    HTTP server

tests/unit/
  reservation-service.test.js  Backend unit tests (updated to 409)
  frontend-reservation.test.js Frontend unit tests

tests/contract/
  reservation-contract.test.js Existing cross-layer contract test
  generated/
    duplicate-reservation-approved.test.js  Decision-bound generated test

dashboard/
  server.js                    Approval dashboard server
  public/                      Approval dashboard UI

artifacts/
  contract-analysis.json       Investigation findings and recommendation
  approved-decision.json       Human approval record
  test-results.pre-repair.json RED phase evidence
  test-results.post-repair.json GREEN phase evidence
  verification-report.json     Independent verifier structured result

bob_sessions/
  *.png                        Relevant IBM Bob task-session evidence

.bob/agents/
  contract-evidence-auditor.md
  consumer-auditor.md
  provider-auditor.md
  contract-verifier.md

CONTRACT_TRACEABILITY.md       Full end-to-end traceability narrative
```

## Run the completed prototype

Requires Node.js 20 or later. Zero npm dependencies — `npm install` is not needed.

**Run the configured unit and existing contract suites:**

```bash
npm test
```

**Unit suite only:**

```bash
npm run test:unit
```

**Existing contract suite:**

```bash
npm run test:contract
```

**Generated contract test** (note: `npm run test:contract` targets `tests/contract/*.test.js` and does not include the `generated/` subdirectory — run this command directly):

```bash
node --test tests/contract/generated/duplicate-reservation-approved.test.js
```

**Approval dashboard:**

```bash
npm run dashboard
```

## Verified result

**RED (pre-repair):**

```
node --test tests/contract/generated/duplicate-reservation-approved.test.js
→ pass 0, fail 1
AssertionError: Expected provider to return HTTP 409 … but received 400
```

**GREEN (post-repair):**

| Command | pass | fail |
|---|---|---|
| `node --test tests/contract/generated/…` | 1 | 0 |
| `npm run test:contract` | 1 | 0 |
| `npm run test:unit` | 4 | 0 |

**Independent verdict:** `VERIFIED_WITH_WARNINGS` — 15 pass, 0 fail, 1 warning-level criterion.

The warning-level criterion recorded expected documentation and Bob-session evidence files outside the repair commit; no unexpected source, test, credential, or sensitive file was found. Separately, the verifier observed that `npm run test:contract` excludes `tests/contract/generated/` because of its glob pattern. The generated test was executed independently and passed, so no verification evidence gap remains, although the npm script still has a scope gap.

## Evidence

Full end-to-end traceability narrative: [`CONTRACT_TRACEABILITY.md`](CONTRACT_TRACEABILITY.md)

Key artifacts:

- `artifacts/contract-analysis.json` — contradiction finding and recommendation
- `artifacts/approved-decision.json` — human approval record
- `artifacts/test-results.pre-repair.json` — RED phase evidence
- `artifacts/test-results.post-repair.json` — GREEN phase evidence
- `artifacts/verification-report.json` — independent verifier structured result

Bob task-session screenshots: `bob_sessions/`

## Security

Never commit `.env`. The repository includes:

- `.gitignore` — excludes `.env` and other sensitive files
- `.bobignore` — excludes `.env` from Bob context
- `.env.example` — provides safe environment-variable placeholders without secret values
- `SECURITY.md` — disclosure policy

The committed repository must not contain credentials, tokens, secrets, or the local `.env` file. Review `git status` and `git diff` before every commit.

## Limitations

- Focused proof of concept covering one endpoint (`POST /api/reservations`) and one mismatch type.
- In-memory backend with no persistence; state resets on each test run.
- Human approval remains required; the workflow does not auto-approve any decision.
- No production deployment, user study, or benchmark results are claimed.
