import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateConfig } from "../../config/validate-config.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpRepo(files) {
  const dir = mkdtempSync(join(tmpdir(), "cr-test-"));
  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(dir, relPath);
    mkdirSync(resolve(abs, ".."), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  // Also create an "artifacts" directory so artifact checks pass.
  mkdirSync(join(dir, "artifacts"), { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// T-01: Complete production-shaped config passes with four enabled sources
//        and three enabled personas.
// ---------------------------------------------------------------------------
test("T-01: complete production config passes with four sources and three personas", () => {
  // Build the production-shaped object directly (real repo paths).
  const raw = {
    schemaVersion: "1.0",
    project: { name: "ContractRescue Demo" },
    sources: {
      provider: {
        required: true,
        paths: ["backend/reservation-service.js", "backend/server.js"],
      },
      consumer: {
        required: false,
        paths: ["frontend/src/api/reservations.js"],
      },
      documentation: {
        required: false,
        paths: ["docs/api-contract.md"],
      },
      tests: {
        required: false,
        paths: [
          "tests/unit/reservation-service.test.js",
          "tests/unit/frontend-reservation.test.js",
          "tests/contract/reservation-contract.test.js",
        ],
      },
    },
    commands: {
      allTests: { program: "npm", args: ["test"] },
    },
    artifacts: { directory: "artifacts" },
  };
  const r = validateConfig(raw, REPO_ROOT);
  assert.equal(r.valid, true, `Expected valid but got errors: ${r.errors.join("; ")}`);
  assert.equal(r.enabledSources.length, 4, `Expected 4 enabled sources, got: ${r.enabledSources.join(", ")}`);
  assert.deepEqual(
    [...r.enabledSources].sort(),
    ["consumer", "documentation", "provider", "tests"]
  );
  assert.equal(r.enabledPersonas.length, 3);
  assert.ok(r.enabledPersonas.includes("provider-auditor"));
  assert.ok(r.enabledPersonas.includes("consumer-auditor"));
  assert.ok(r.enabledPersonas.includes("contract-evidence-auditor"));
  assert.equal(r.errors.length, 0);
});

// ---------------------------------------------------------------------------
// T-02: Provider-only config passes with exactly three missing-evidence warnings.
// ---------------------------------------------------------------------------
test("T-02: provider-only config passes with exactly three missing-evidence warnings", () => {
  const tmp = makeTmpRepo({ "provider.js": "export const x = 1;" });
  const raw = {
    schemaVersion: "1.0",
    project: { name: "Provider Only" },
    sources: {
      provider: { required: true, paths: ["provider.js"] },
    },
    commands: { allTests: { program: "npm", args: ["test"] } },
    artifacts: { directory: "artifacts" },
  };
  const r = validateConfig(raw, tmp);
  assert.equal(r.valid, true, `Expected valid but got errors: ${r.errors.join("; ")}`);
  assert.equal(r.warnings.length, 3, `Expected exactly 3 warnings, got ${r.warnings.length}: ${r.warnings.join("; ")}`);
  assert.deepEqual([...r.skippedSources].sort(), ["consumer", "documentation", "tests"]);
  assert.equal(r.enabledPersonas.length, 1);
  assert.ok(r.enabledPersonas.includes("provider-auditor"));
});

// ---------------------------------------------------------------------------
// T-03: Missing provider produces invalid result.
// ---------------------------------------------------------------------------
test("T-03: missing provider produces invalid result", () => {
  const tmp = makeTmpRepo({});
  const raw = {
    schemaVersion: "1.0",
    project: { name: "No Provider" },
    sources: {},
    artifacts: { directory: "artifacts" },
  };
  const r = validateConfig(raw, tmp);
  assert.equal(r.valid, false);
  assert.ok(
    r.errors.some((e) => e.includes("Provider source is required")),
    `Expected required-provider error, got: ${r.errors.join("; ")}`
  );
});

// ---------------------------------------------------------------------------
// T-04: Provider required: false produces invalid result.
// ---------------------------------------------------------------------------
test("T-04: provider required:false produces invalid result", () => {
  const tmp = makeTmpRepo({ "provider.js": "export const x = 1;" });
  const raw = {
    schemaVersion: "1.0",
    project: { name: "Bad Provider" },
    sources: {
      provider: { required: false, paths: ["provider.js"] },
    },
    artifacts: { directory: "artifacts" },
  };
  const r = validateConfig(raw, tmp);
  assert.equal(r.valid, false);
  assert.ok(
    r.errors.some((e) => e.includes("required: true")),
    `Expected required-must-be-true error, got: ${r.errors.join("; ")}`
  );
});

// ---------------------------------------------------------------------------
// T-05: Empty provider paths produces invalid result.
// ---------------------------------------------------------------------------
test("T-05: empty provider paths produces invalid result", () => {
  const tmp = makeTmpRepo({});
  const raw = {
    schemaVersion: "1.0",
    project: { name: "Empty Paths" },
    sources: {
      provider: { required: true, paths: [] },
    },
    artifacts: { directory: "artifacts" },
  };
  const r = validateConfig(raw, tmp);
  assert.equal(r.valid, false);
  assert.ok(
    r.errors.some((e) => e.includes("non-empty array")),
    `Expected non-empty-array error, got: ${r.errors.join("; ")}`
  );
});

// ---------------------------------------------------------------------------
// T-06: Nonexistent provider path produces invalid result.
// ---------------------------------------------------------------------------
test("T-06: nonexistent provider path produces invalid result", () => {
  const tmp = makeTmpRepo({});
  const raw = {
    schemaVersion: "1.0",
    project: { name: "Missing Provider File" },
    sources: {
      provider: { required: true, paths: ["does-not-exist.js"] },
    },
    artifacts: { directory: "artifacts" },
  };
  const r = validateConfig(raw, tmp);
  assert.equal(r.valid, false);
  assert.ok(
    r.errors.some((e) => e.includes("does not exist")),
    `Expected path-does-not-exist error, got: ${r.errors.join("; ")}`
  );
});

// ---------------------------------------------------------------------------
// T-07: Nonexistent optional consumer path produces warning and skips consumer.
// ---------------------------------------------------------------------------
test("T-07: nonexistent optional consumer path produces warning and skips consumer", () => {
  const tmp = makeTmpRepo({ "provider.js": "export const x = 1;" });
  const raw = {
    schemaVersion: "1.0",
    project: { name: "Missing Consumer" },
    sources: {
      provider: { required: true, paths: ["provider.js"] },
      consumer: { required: false, paths: ["nonexistent-consumer.js"] },
    },
    artifacts: { directory: "artifacts" },
  };
  const r = validateConfig(raw, tmp);
  assert.equal(r.valid, true, `Expected valid but got errors: ${r.errors.join("; ")}`);
  assert.ok(
    r.warnings.some((w) => w.includes("nonexistent-consumer.js")),
    `Expected warning about nonexistent-consumer.js, got: ${r.warnings.join("; ")}`
  );
  assert.ok(r.skippedSources.includes("consumer"));
  assert.ok(!r.enabledSources.includes("consumer"));
});

// ---------------------------------------------------------------------------
// T-08: Absolute Unix source path produces invalid result (any category).
// ---------------------------------------------------------------------------
test("T-08: absolute Unix source path produces invalid result", () => {
  const tmp = makeTmpRepo({});
  const raw = {
    schemaVersion: "1.0",
    project: { name: "Absolute Unix Path" },
    sources: {
      provider: { required: true, paths: ["/etc/passwd"] },
    },
    artifacts: { directory: "artifacts" },
  };
  const r = validateConfig(raw, tmp);
  assert.equal(r.valid, false);
  assert.ok(
    r.errors.some((e) => e.includes("absolute")),
    `Expected absolute-path error, got: ${r.errors.join("; ")}`
  );
});

// ---------------------------------------------------------------------------
// T-09: Absolute Windows source path produces invalid result (any category).
// ---------------------------------------------------------------------------
test("T-09: absolute Windows source path produces invalid result", () => {
  const tmp = makeTmpRepo({});
  const raw = {
    schemaVersion: "1.0",
    project: { name: "Absolute Windows Path" },
    sources: {
      provider: { required: true, paths: ["C:\\Windows\\system.ini"] },
    },
    artifacts: { directory: "artifacts" },
  };
  const r = validateConfig(raw, tmp);
  assert.equal(r.valid, false);
  assert.ok(
    r.errors.some((e) => e.includes("absolute")),
    `Expected absolute-path error, got: ${r.errors.join("; ")}`
  );
});

// ---------------------------------------------------------------------------
// T-10: Parent traversal in any source path produces invalid result.
// ---------------------------------------------------------------------------
test("T-10: parent traversal in source path produces invalid result", () => {
  const tmp = makeTmpRepo({});
  const raw = {
    schemaVersion: "1.0",
    project: { name: "Traversal Path" },
    sources: {
      provider: { required: true, paths: ["../outside/provider.js"] },
    },
    artifacts: { directory: "artifacts" },
  };
  const r = validateConfig(raw, tmp);
  assert.equal(r.valid, false);
  assert.ok(
    r.errors.some((e) => e.includes("traversal")),
    `Expected traversal error, got: ${r.errors.join("; ")}`
  );
});

// ---------------------------------------------------------------------------
// T-11: .env or sensitive path produces invalid result regardless of category.
// ---------------------------------------------------------------------------
test("T-11: sensitive source path produces invalid result regardless of category", () => {
  const tmp = makeTmpRepo({ "provider.js": "export const x = 1;" });
  // Test with optional consumer category — still must be a hard error.
  const raw = {
    schemaVersion: "1.0",
    project: { name: "Sensitive Path" },
    sources: {
      provider: { required: true, paths: ["provider.js"] },
      consumer: { required: false, paths: [".env"] },
    },
    artifacts: { directory: "artifacts" },
  };
  const r = validateConfig(raw, tmp);
  assert.equal(r.valid, false, "Expected invalid due to sensitive path in optional category");
  assert.ok(
    r.errors.some((e) => e.includes("sensitive")),
    `Expected sensitive-file error, got: ${r.errors.join("; ")}`
  );
});

// ---------------------------------------------------------------------------
// T-12: Symlink resolving outside repoRoot produces invalid result.
//        Explicitly skipped if symlink creation is unavailable (Windows).
// ---------------------------------------------------------------------------
test("T-12: symlink escaping repoRoot produces invalid result", (t) => {
  const tmp = makeTmpRepo({ "provider.js": "export const x = 1;" });
  const outside = mkdtempSync(join(tmpdir(), "cr-outside-"));
  writeFileSync(join(outside, "secret.js"), "export const secret = 42;", "utf8");

  const linkPath = join(tmp, "escape-link.js");
  try {
    symlinkSync(join(outside, "secret.js"), linkPath);
  } catch (e) {
    t.skip(`Symlink creation unavailable on this platform (${e.message})`);
    return;
  }

  const raw = {
    schemaVersion: "1.0",
    project: { name: "Symlink Escape" },
    sources: {
      provider: { required: true, paths: ["escape-link.js"] },
    },
    artifacts: { directory: "artifacts" },
  };
  const r = validateConfig(raw, tmp);
  assert.equal(r.valid, false);
  assert.ok(
    r.errors.some((e) => e.includes("escapes repository root")),
    `Expected root-escape error, got: ${r.errors.join("; ")}`
  );
});

// ---------------------------------------------------------------------------
// T-13: Documentation present with tests absent enables contract-evidence-auditor
//        exactly once.
// ---------------------------------------------------------------------------
test("T-13: documentation alone enables contract-evidence-auditor exactly once", () => {
  const tmp = makeTmpRepo({
    "provider.js": "export const x = 1;",
    "api.md": "# API docs",
  });
  const raw = {
    schemaVersion: "1.0",
    project: { name: "Doc Only" },
    sources: {
      provider: { required: true, paths: ["provider.js"] },
      documentation: { required: false, paths: ["api.md"] },
    },
    artifacts: { directory: "artifacts" },
  };
  const r = validateConfig(raw, tmp);
  assert.equal(r.valid, true, `Expected valid but got errors: ${r.errors.join("; ")}`);
  const ceCount = r.enabledPersonas.filter((p) => p === "contract-evidence-auditor").length;
  assert.equal(ceCount, 1, `Expected contract-evidence-auditor exactly once, got ${ceCount}`);
  assert.ok(!r.enabledPersonas.includes("consumer-auditor"));
});

// ---------------------------------------------------------------------------
// T-14: Invalid command program produces invalid result.
// ---------------------------------------------------------------------------
test("T-14: invalid command program produces invalid result", () => {
  const tmp = makeTmpRepo({ "provider.js": "export const x = 1;" });
  const raw = {
    schemaVersion: "1.0",
    project: { name: "Bad Command" },
    sources: {
      provider: { required: true, paths: ["provider.js"] },
    },
    commands: {
      runTests: { program: "bash", args: ["run.sh"] },
    },
    artifacts: { directory: "artifacts" },
  };
  const r = validateConfig(raw, tmp);
  assert.equal(r.valid, false);
  assert.ok(
    r.errors.some((e) => e.includes("program must be")),
    `Expected program error, got: ${r.errors.join("; ")}`
  );
});

// ---------------------------------------------------------------------------
// T-15: Invalid command args or null byte in arg produces invalid result.
// ---------------------------------------------------------------------------
test("T-15: null byte in command arg produces invalid result", () => {
  const tmp = makeTmpRepo({ "provider.js": "export const x = 1;" });
  const raw = {
    schemaVersion: "1.0",
    project: { name: "Null Byte Arg" },
    sources: {
      provider: { required: true, paths: ["provider.js"] },
    },
    commands: {
      runTests: { program: "npm", args: ["test\0evil"] },
    },
    artifacts: { directory: "artifacts" },
  };
  const r = validateConfig(raw, tmp);
  assert.equal(r.valid, false);
  assert.ok(
    r.errors.some((e) => e.includes("null byte") || e.includes("non-empty strings")),
    `Expected null-byte or args error, got: ${r.errors.join("; ")}`
  );
});

// ---------------------------------------------------------------------------
// T-16: Unsafe or non-directory artifacts path produces invalid result.
// ---------------------------------------------------------------------------
test("T-16: traversal in artifacts directory produces invalid result", () => {
  const tmp = makeTmpRepo({ "provider.js": "export const x = 1;" });
  const raw = {
    schemaVersion: "1.0",
    project: { name: "Bad Artifacts" },
    sources: {
      provider: { required: true, paths: ["provider.js"] },
    },
    artifacts: { directory: "../outside-artifacts" },
  };
  const r = validateConfig(raw, tmp);
  assert.equal(r.valid, false);
  assert.ok(
    r.errors.some((e) => e.includes("Artifacts")),
    `Expected artifacts error, got: ${r.errors.join("; ")}`
  );
});

// ---------------------------------------------------------------------------
// T-17: CLI --repo-root + --config exits 0 and prints enabled sources/personas.
// ---------------------------------------------------------------------------
test("T-17: CLI with --repo-root and --config exits 0 and prints sources and personas", () => {
  const tmp = makeTmpRepo({ "provider.js": "export const x = 1;" });
  const configPath = join(tmp, "test-config.json");
  writeFileSync(
    configPath,
    JSON.stringify({
      schemaVersion: "1.0",
      project: { name: "CLI Test" },
      sources: {
        provider: { required: true, paths: ["provider.js"] },
      },
      commands: { allTests: { program: "npm", args: ["test"] } },
      artifacts: { directory: "artifacts" },
    }),
    "utf8"
  );

  const cliPath = resolve(REPO_ROOT, "config/validate-config-cli.js");
  let stdout;
  try {
    stdout = execFileSync(
      process.execPath,
      [cliPath, "--repo-root", tmp, "--config", "test-config.json"],
      { encoding: "utf8" }
    );
  } catch (e) {
    assert.fail(`CLI exited nonzero: ${e.stdout}\n${e.stderr}`);
  }

  assert.ok(stdout.includes("provider"), `Expected 'provider' in output:\n${stdout}`);
  assert.ok(stdout.includes("provider-auditor"), `Expected 'provider-auditor' in output:\n${stdout}`);
  assert.ok(stdout.includes("VALID"), `Expected VALID status in output:\n${stdout}`);
});

// ---------------------------------------------------------------------------
// T-18: CLI no-provider.json fixture exits nonzero and prints provider error.
// ---------------------------------------------------------------------------
test("T-18: CLI no-provider.json fixture exits nonzero and prints provider error", () => {
  const cliPath = resolve(REPO_ROOT, "config/validate-config-cli.js");
  const fixtureConfig = "tests/fixtures/configurable-workflow/no-provider.json";

  let threw = false;
  let output = "";
  try {
    execFileSync(
      process.execPath,
      [cliPath, "--repo-root", REPO_ROOT, "--config", fixtureConfig],
      { encoding: "utf8" }
    );
  } catch (e) {
    threw = true;
    output = (e.stdout || "") + (e.stderr || "");
  }

  assert.ok(threw, "Expected CLI to exit nonzero for no-provider config");
  assert.ok(
    output.includes("Provider source is required") || output.includes("required"),
    `Expected provider error in output:\n${output}`
  );
});
