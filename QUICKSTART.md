# ContractRescue — Quickstart

This guide gets a reviewer running and inspecting ContractRescue in a few minutes. For the full project overview and CR-001 evidence, see [README.md](README.md).

---

## 1. Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 20 or later** | Check with `node --version` |
| **No `npm install` needed** | Zero external npm dependencies |
| **IBM Bob workspace** | Required to execute the auditor, governed repair, and independent-verifier workflow phases. The `npm` commands below validate configuration, run tests, and start the dashboard — they do not invoke IBM Bob. |

---

## 2. Clone and enter the repository

```bash
git clone https://github.com/angelfrancel/contractrescue.git
cd contractrescue
```

---

## 3. Validate the configuration

ContractRescue reads [`contractrescue.json`](contractrescue.json) before any investigation runs. Validate it now:

```bash
npm run contractrescue:validate
```

Expected output:

```
ContractRescue Configuration Validator
=======================================
Project      : ContractRescue Demo
Config file  : contractrescue.json
...
Status: VALID
```

If validation exits nonzero, review the reported errors before proceeding.

You can also validate an alternative config:

```bash
npm run contractrescue:validate -- --config path/to/other-contractrescue.json
```

---

## 4. Run all tests

```bash
npm test
```

Expected summary:

```
tests 34  |  pass 33  |  fail 0  |  skipped 1
```

The one skipped test (T-12) requires symlink creation, which is platform-restricted on Windows. All other tests pass.

To run subsets:

```bash
npm run test:unit        # backend and frontend unit tests
npm run test:contract    # both contract tests (existing + decision-bound generated)
```

---

## 5. Start the completed dashboard

```bash
npm run dashboard
```

Then open: **http://127.0.0.1:4173**

The dashboard displays the completed CR-001 workflow. No login or API key is required.

---

## 6. What you will see in the dashboard

| Section | What it shows |
|---|---|
| **Decision** | The human approval record from `artifacts/approved-decision.json` — authorized status 409, approver, timestamp, and implementation constraints. |
| **Evidence** | The consolidated multi-layer investigation findings from `artifacts/contract-analysis.json` — the configured evidence scope, the blocking contradiction, each layer's traceable observations, and the recommended resolution. |
| **Audit Trail** | Displays the recorded sequence from investigation and human decision through RED evidence, authorized repair, GREEN results, and independent verification. |

---

## 7. Adapting `contractrescue.json` for another repository

Copy the existing [`contractrescue.json`](contractrescue.json) to the root of the target repository and update the following fields. **Do not invent new keys** — the validated schema recognises `schemaVersion`, `project`, `sources`, `commands`, and `artifacts` only.

The example below uses illustrative filenames that must be replaced with paths that actually exist in the target repository:

```jsonc
{
  "schemaVersion": "1.0",
  "project": {
    "name": "Your Project Name",              // update
    "description": "Brief description"        // update
  },
  "sources": {
    "provider": {
      "required": true,                        // provider is always required
      "paths": [
        "src/your-service.js"                  // replace with real backend paths
      ]
    },
    "consumer": {
      "required": false,                       // optional — include when a consumer exists
      "paths": [
        "client/src/api/your-api.js"           // replace with real consumer paths
      ]
    },
    "documentation": {
      "required": false,                       // optional — include when a written spec exists
      "paths": [
        "docs/your-api-contract.md"            // replace with real documentation paths
      ]
    },
    "tests": {
      "required": false,                       // optional — include relevant test files
      "paths": [
        "tests/unit/your-service.test.js"      // replace with real test paths
      ]
    }
  },
  "commands": {
    "unitTests":     { "program": "npm", "args": ["run", "test:unit"] },    // update as needed
    "contractTests": { "program": "npm", "args": ["run", "test:contract"] },
    "allTests":      { "program": "npm", "args": ["test"] }
  },
  "artifacts": {
    "directory": "artifacts"                   // update only if a different safe relative path is needed
  }
}
```

**Key rules:**

- `provider` is the only required source. Consumer, documentation, and test sources are optional. When an optional category contains valid configured paths, it is enabled and its applicable auditor participates. When it is absent, empty, unsafe, or unavailable, ContractRescue skips or reports that evidence according to validator rules.
- All paths must be relative to the repository root. Absolute paths and parent-directory traversals are rejected by the validator.
- Sensitive filenames (`.env`, private keys, etc.) are blocked regardless of category.

Run `npm run contractrescue:validate` after any edit to confirm the config is valid before handing it to IBM Bob.

---

## 8. IBM Bob is required for the workflow

The `npm` commands in this repository do three things:

| Command | What it does |
|---|---|
| `npm run contractrescue:validate` | Validates `contractrescue.json` using the local Node.js validator — no IBM Bob required. |
| `npm test` | Runs the test suite using `node --test` — no IBM Bob required. |
| `npm run dashboard` | Starts the local dashboard server — no IBM Bob required. |

The **auditor, governed repair, and independent-verifier workflow** is orchestrated by IBM Bob:

- Three read-only auditor subagents (`provider-auditor`, `consumer-auditor`, `contract-evidence-auditor`) investigate in parallel.
- A human reviews findings in the dashboard and approves a decision.
- IBM Bob generates the decision-bound RED test and applies the minimal authorized repair only after approval.
- The `contract-verifier` runs in a separate IBM Bob task after implementation. It independently rereads the approved evidence, executes fresh verification commands, and does not rely on the repair task's conclusions as proof.

To run the full workflow, open the repository in an IBM Bob workspace and follow the governed task sequence.

---

## 9. Next steps

- **Full project overview:** [README.md](README.md)
- **End-to-end traceability for CR-001:** [CONTRACT_TRACEABILITY.md](CONTRACT_TRACEABILITY.md)
- **Workflow artifacts:** [artifacts/README.md](artifacts/README.md)
- **Bob task-session evidence:** [bob_sessions/](bob_sessions/)
