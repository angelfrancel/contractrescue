import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildConfigScopePayload,
  createConfigScopeHandler,
} from "../../dashboard/config-scope.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const FOUR_SOURCE_RAW = {
  schemaVersion: "1.0",
  project: { name: "Test Project" },
  sources: {
    provider:      { required: true,  paths: ["backend/a.js", "backend/b.js"] },
    consumer:      { required: false, paths: ["frontend/c.js"] },
    documentation: { required: false, paths: ["docs/d.md"] },
    tests:         { required: false, paths: ["tests/e.test.js"] },
  },
  artifacts: { directory: "artifacts" },
};

const FOUR_SOURCE_RESULT = {
  valid: true,
  projectName: "Test Project",
  enabledSources:  ["provider", "consumer", "documentation", "tests"],
  skippedSources:  [],
  missingEvidence: [],
  enabledPersonas: ["provider-auditor", "consumer-auditor", "contract-evidence-auditor"],
  errors:   [],
  warnings: [],
};

const PROVIDER_ONLY_RAW = {
  schemaVersion: "1.0",
  project: { name: "Provider Only" },
  sources: {
    provider: { required: true, paths: ["backend/a.js"] },
  },
  artifacts: { directory: "artifacts" },
};

const PROVIDER_ONLY_RESULT = {
  valid: true,
  projectName: "Provider Only",
  enabledSources:  ["provider"],
  skippedSources:  ["consumer", "documentation", "tests"],
  missingEvidence: ["consumer", "documentation", "tests"],
  enabledPersonas: ["provider-auditor"],
  errors:   [],
  warnings: [
    "Source 'consumer' is not declared — skipped.",
    "Source 'documentation' is not declared — skipped.",
    "Source 'tests' is not declared — skipped.",
  ],
};

const INVALID_RESULT = {
  valid: false,
  projectName: "Bad Project",
  enabledSources:  [],
  skippedSources:  ["consumer", "documentation", "tests"],
  missingEvidence: ["consumer", "documentation", "tests"],
  enabledPersonas: [],
  errors:   ["Provider path does not exist: backend/missing.js"],
  warnings: [],
};

// Mock response helper used by handler tests.
function makeMockResponse() {
  const res = { statusCode: null, body: null };
  res.writeHead = (status) => { res.statusCode = status; };
  res.end = (body) => { res.body = body; };
  return res;
}

// ---------------------------------------------------------------------------
// Group A — Payload-builder tests (RT-01 through RT-06)
// ---------------------------------------------------------------------------

// RT-01: Valid four-source config — enabled sources, personas, path entries present.
test("RT-01: valid four-source config — all sources enabled and personas correct", () => {
  const payload = buildConfigScopePayload(
    FOUR_SOURCE_RAW,
    FOUR_SOURCE_RESULT,
    { pathExists: () => true }
  );

  assert.equal(payload.available, true);
  assert.equal(payload.valid, true);
  assert.deepEqual([...payload.enabledSources].sort(), ["consumer", "documentation", "provider", "tests"]);
  assert.equal(payload.enabledPersonas.length, 3);
  assert.ok(payload.enabledPersonas.includes("provider-auditor"));
  assert.ok(payload.enabledPersonas.includes("consumer-auditor"));
  assert.ok(payload.enabledPersonas.includes("contract-evidence-auditor"));
  assert.equal(payload.sources.provider.status, "enabled");
  // Every path entry must have path (string), exists (boolean), safe (boolean).
  for (const [cat, src] of Object.entries(payload.sources)) {
    for (const entry of src.paths) {
      assert.equal(typeof entry.path, "string", `${cat}: path must be a string`);
      assert.equal(typeof entry.exists, "boolean", `${cat}: exists must be a boolean`);
      assert.equal(typeof entry.safe, "boolean", `${cat}: safe must be a boolean`);
    }
  }
});

// RT-02: Valid provider-only config — three sources skipped, only provider-auditor persona.
test("RT-02: valid provider-only config — three sources skipped, one persona", () => {
  const payload = buildConfigScopePayload(
    PROVIDER_ONLY_RAW,
    PROVIDER_ONLY_RESULT,
    { pathExists: () => true }
  );

  assert.equal(payload.valid, true);
  assert.deepEqual([...payload.skippedSources].sort(), ["consumer", "documentation", "tests"]);
  assert.equal(payload.sources.consumer.status, "skipped");
  assert.equal(payload.sources.documentation.status, "skipped");
  assert.equal(payload.sources.tests.status, "skipped");
  assert.deepEqual(payload.sources.consumer.paths, []);
  assert.deepEqual(payload.sources.documentation.paths, []);
  assert.deepEqual(payload.sources.tests.paths, []);
  assert.deepEqual(payload.enabledPersonas, ["provider-auditor"]);
});

// RT-03: Invalid config (missing required provider) — status "error", errors non-empty.
test("RT-03: invalid config — provider missing produces error status and errors array", () => {
  const invalidRaw = {
    schemaVersion: "1.0",
    project: { name: "Bad Project" },
    sources: {
      provider: { required: true, paths: ["backend/missing.js"] },
    },
    artifacts: { directory: "artifacts" },
  };
  const payload = buildConfigScopePayload(
    invalidRaw,
    INVALID_RESULT,
    { pathExists: () => false }
  );

  assert.equal(payload.valid, false);
  assert.ok(payload.errors.length > 0, "Expected at least one error");
  assert.equal(payload.sources.provider.status, "error");
});

// RT-04: pathExists stub returns false — all exists fields reflect that value.
test("RT-04: pathExists returning false is reflected in every path entry", () => {
  const payload = buildConfigScopePayload(
    FOUR_SOURCE_RAW,
    FOUR_SOURCE_RESULT,
    { pathExists: () => false }
  );

  for (const [cat, src] of Object.entries(payload.sources)) {
    for (const entry of src.paths) {
      if (entry.safe) {
        assert.equal(entry.exists, false, `${cat}: expected exists===false from stub`);
      }
    }
  }
  // Validation result fields (valid, status) must not be affected by pathExists stub.
  assert.equal(payload.valid, true);
  assert.equal(payload.sources.provider.status, "enabled");
});

// RT-05: Unsafe configured paths — pathExists never called, generic replacement returned,
//         no unsafe value appears in the serialized payload.
test("RT-05: unsafe configured paths are redacted and pathExists is never called for them", () => {
  const UNSAFE_PATHS = [
    "/absolute/unix/path",
    "C:\\absolute\\windows\\path",
    "\\\\server\\share\\file",
    "../parent/traversal",
    "null\0byte",
  ];

  const rawWithUnsafe = {
    schemaVersion: "1.0",
    project: { name: "Unsafe Paths" },
    sources: {
      provider: { required: true, paths: ["backend/safe.js", ...UNSAFE_PATHS] },
    },
    artifacts: { directory: "artifacts" },
  };

  // Validator result that says provider has an error (because unsafe paths fail validation).
  const unsafeResult = {
    valid: false,
    projectName: "Unsafe Paths",
    enabledSources:  [],
    skippedSources:  ["consumer", "documentation", "tests"],
    missingEvidence: ["consumer", "documentation", "tests"],
    enabledPersonas: [],
    errors:   ["Configuration contains an unsafe or inaccessible path."],
    warnings: [],
  };

  const calledWith = [];
  const payload = buildConfigScopePayload(
    rawWithUnsafe,
    unsafeResult,
    { pathExists: (p) => { calledWith.push(p); return true; } }
  );

  // pathExists must NOT have been called for any unsafe value.
  for (const unsafe of UNSAFE_PATHS) {
    assert.ok(
      !calledWith.includes(unsafe),
      `pathExists was called with unsafe path: ${JSON.stringify(unsafe)}`
    );
  }

  // The safe path may have been passed to pathExists; that is correct.
  // But no unsafe raw string should appear verbatim in the serialized payload.
  const serialized = JSON.stringify(payload);
  for (const unsafe of UNSAFE_PATHS) {
    assert.ok(
      !serialized.includes(unsafe),
      `Unsafe path appeared verbatim in payload: ${JSON.stringify(unsafe)}`
    );
  }

  // Every unsafe entry must be marked safe: false with the generic replacement string.
  for (const entry of payload.sources.provider.paths) {
    if (!entry.safe) {
      assert.equal(entry.path, "[unsafe configured path omitted]");
      assert.equal(entry.exists, false);
    }
  }

  // Confirm the safe path entry is still safe: true.
  const safeEntry = payload.sources.provider.paths.find(e => e.safe);
  assert.ok(safeEntry, "Expected at least one safe path entry");
  assert.equal(safeEntry.path, "backend/safe.js");
});

// RT-06: configFilename is always the fixed string, not a filesystem path.
test("RT-06: configFilename is always the literal fixed string with no path separator", () => {
  const payload = buildConfigScopePayload(
    FOUR_SOURCE_RAW,
    FOUR_SOURCE_RESULT,
    { pathExists: () => true }
  );

  assert.equal(payload.configFilename, "contractrescue.json");
  assert.ok(!payload.configFilename.includes("/"), "configFilename must not contain /");
  assert.ok(!payload.configFilename.includes("\\"), "configFilename must not contain \\");
});

// ---------------------------------------------------------------------------
// Group B — Handler tests (RT-07 through RT-10)
// ---------------------------------------------------------------------------

// RT-07: readConfigScope resolves with valid payload → HTTP 200, available: true, valid: true.
test("RT-07: handler returns HTTP 200 for a successful readConfigScope resolution", async () => {
  const fakePayload = { available: true, valid: true, configFilename: "contractrescue.json" };
  const handler = createConfigScopeHandler(async () => fakePayload);
  const res = makeMockResponse();
  await handler({}, res);

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.available, true);
  assert.equal(body.valid, true);
});

// RT-08: readConfigScope resolves with invalid-config payload → HTTP 200, valid: false.
test("RT-08: handler returns HTTP 200 with valid:false for an invalid config payload", async () => {
  const fakePayload = {
    available: true,
    valid: false,
    configFilename: "contractrescue.json",
    errors: ["Provider path does not exist: backend/missing.js"],
  };
  const handler = createConfigScopeHandler(async () => fakePayload);
  const res = makeMockResponse();
  await handler({}, res);

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.available, true);
  assert.equal(body.valid, false);
  assert.ok(body.errors.length > 0);
});

// RT-09: readConfigScope rejects with ENOENT-shaped error → HTTP 503, safe body only.
test("RT-09: handler returns HTTP 503 for ENOENT without leaking error details", async () => {
  const ABSOLUTE_SENTINEL = "/srv/secret/contractrescue.json";
  const enoentError = Object.assign(new Error(`ENOENT: no such file or directory, open '${ABSOLUTE_SENTINEL}'`), {
    code: "ENOENT",
    path: ABSOLUTE_SENTINEL,
  });
  const handler = createConfigScopeHandler(async () => { throw enoentError; });
  const res = makeMockResponse();
  await handler({}, res);

  assert.equal(res.statusCode, 503);
  const body = JSON.parse(res.body);
  assert.equal(body.available, false);
  assert.equal(typeof body.reason, "string");
  assert.ok(body.reason.length > 0);

  // The response must not contain the error message, code, or absolute path.
  const serialized = res.body;
  assert.ok(!serialized.includes(ABSOLUTE_SENTINEL), "Absolute path must not appear in 503 body");
  assert.ok(!serialized.includes("ENOENT"), "Error code must not appear in 503 body");
  assert.ok(!serialized.includes("no such file"), "Error message must not appear in 503 body");
});

// RT-10: readConfigScope rejects with SyntaxError → HTTP 503, safe body only.
test("RT-10: handler returns HTTP 503 for SyntaxError without leaking error message", async () => {
  const syntaxMsg = "Unexpected token } in JSON at position 42";
  const syntaxError = new SyntaxError(syntaxMsg);
  const handler = createConfigScopeHandler(async () => { throw syntaxError; });
  const res = makeMockResponse();
  await handler({}, res);

  assert.equal(res.statusCode, 503);
  const body = JSON.parse(res.body);
  assert.equal(body.available, false);
  assert.equal(typeof body.reason, "string");

  const serialized = res.body;
  assert.ok(!serialized.includes(syntaxMsg), "SyntaxError message must not appear in 503 body");
  assert.ok(!serialized.includes("SyntaxError"), "Error constructor name must not appear in 503 body");
});
