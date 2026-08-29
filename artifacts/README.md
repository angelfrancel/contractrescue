# Workflow artifacts

These are genuine workflow artifacts generated or recorded during the IBM Bob-driven hackathon workflow. They form the recorded evidence chain for the ContractRescue demonstration.

| File | Phase | Description |
|---|---|---|
| `contract-analysis.json` | Investigation | Consolidated multi-layer evidence, blocking contradiction, and recommended resolution (CR-001) |
| `approved-decision.json` | Approval | Human approval record: authorized status 409, `implementationAuthorized: true`, decision ID CR-001-DECISION-001 |
| `test-results.pre-repair.json` | RED | Generated contract test executed before repair — pass 0, fail 1, observed status 400 |
| `test-results.post-repair.json` | GREEN | All three post-repair test commands — generated test pass 1, contract suite pass 1, unit suite pass 4 |
| `verification-report.json` | Verification | Independent `contract-verifier` structured result — VERIFIED_WITH_WARNINGS, 15 pass, 0 fail, 1 warning |

The full traceability narrative linking all artifacts is in [`../CONTRACT_TRACEABILITY.md`](../CONTRACT_TRACEABILITY.md).

Bob task-session screenshots are stored in [`../bob_sessions/`](../bob_sessions/), not here.
