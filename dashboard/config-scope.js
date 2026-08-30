/**
 * dashboard/config-scope.js
 *
 * Side-effect-free module. No import-time filesystem access, no server creation.
 * Exports the testable configuration-scope logic used by GET /api/config-scope.
 */

const CATEGORIES = ["provider", "consumer", "documentation", "tests"];

// ---------------------------------------------------------------------------
// Path safety checks (mirrors logic in config/validate-config.js, kept local
// so this module has zero imports and no dependency on the validator internals)
// ---------------------------------------------------------------------------

function isAbsolutePath(p) {
  if (typeof p !== "string") return true; // non-strings treated as unsafe
  if (p.startsWith("/")) return true;     // Unix absolute
  if (/^[a-zA-Z]:[/\\]/.test(p)) return true; // Windows drive-letter
  if (p.startsWith("\\\\")) return true;  // UNC path
  return false;
}

function hasTraversal(p) {
  // Normalize backslashes then check each segment.
  return p.replace(/\\/g, "/").split("/").includes("..");
}

function hasNullByte(p) {
  return p.includes("\0");
}

/**
 * Returns true if the path string is safe to pass to pathExists() and to
 * return verbatim in the browser response. A safe path is:
 *  - a non-empty string
 *  - not absolute (Unix, Windows drive-letter, or UNC)
 *  - contains no parent-traversal segments
 *  - contains no null bytes
 */
function isPathSafe(p) {
  if (typeof p !== "string" || p.length === 0) return false;
  if (isAbsolutePath(p)) return false;
  if (hasTraversal(p)) return false;
  if (hasNullByte(p)) return false;
  return true;
}

// Generic replacement used in place of unsafe validator diagnostic messages.
const UNSAFE_DIAGNOSTIC_REPLACEMENT = "Configuration contains an unsafe or inaccessible path.";

// Patterns that indicate a validator message contains sensitive content that
// must not be forwarded verbatim to the browser.
function isDiagnosticSafe(msg) {
  if (typeof msg !== "string") return false;
  // Contains absolute path (Unix)
  if (/(?:^|[\s:])\/[^\s]/.test(msg)) return false;
  // Contains Windows drive-letter absolute path
  if (/[a-zA-Z]:[/\\]/.test(msg)) return false;
  // Contains UNC path
  if (/\\\\/.test(msg)) return false;
  // Contains null byte
  if (msg.includes("\0")) return false;
  // Contains parent traversal
  if (/(?:^|[/\\])\.\.(?:[/\\]|$)/.test(msg)) return false;
  return true;
}

function sanitizeDiagnostics(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map(m => isDiagnosticSafe(m) ? m : UNSAFE_DIAGNOSTIC_REPLACEMENT);
}

// ---------------------------------------------------------------------------
// Status derivation
// ---------------------------------------------------------------------------

function deriveStatus(category, validationResult) {
  if (validationResult.enabledSources.includes(category)) return "enabled";
  if (validationResult.skippedSources.includes(category)) return "skipped";
  return "error"; // in neither list → hard validation error for this category
}

// ---------------------------------------------------------------------------
// buildConfigScopePayload
// ---------------------------------------------------------------------------

/**
 * Assembles the GET /api/config-scope response payload.
 *
 * @param {object} raw - Parsed JSON config object (from contractrescue.json)
 * @param {object} validationResult - Return value of validateConfig(raw, repoRoot)
 * @param {{ pathExists: (repoRelativePath: string) => boolean }} options
 *   pathExists is called ONLY for paths that pass isPathSafe().
 *   Unsafe paths are never forwarded to pathExists and never returned verbatim.
 *
 * @returns {object} Payload safe for JSON serialization and browser delivery.
 */
export function buildConfigScopePayload(raw, validationResult, options) {
  const { pathExists } = options;

  const sources = (raw && typeof raw === "object" && raw.sources) ? raw.sources : {};

  const builtSources = {};
  for (const category of CATEGORIES) {
    const decl = sources[category];
    const required = decl && typeof decl === "object" ? Boolean(decl.required) : false;
    const status = deriveStatus(category, validationResult);

    let paths = [];
    if (decl && Array.isArray(decl.paths)) {
      for (const p of decl.paths) {
        if (isPathSafe(p)) {
          // Safe: call pathExists and return verbatim.
          paths.push({ path: p, exists: pathExists(p), safe: true });
        } else {
          // Unsafe: generic replacement, never call pathExists, never expose raw value.
          paths.push({ path: "[unsafe configured path omitted]", exists: false, safe: false });
        }
      }
    }

    builtSources[category] = { required, status, paths };
  }

  return {
    available: true,
    valid: validationResult.valid,
    configFilename: "contractrescue.json",
    projectName: validationResult.projectName ?? null,
    enabledSources: validationResult.enabledSources ?? [],
    skippedSources: validationResult.skippedSources ?? [],
    missingEvidence: validationResult.missingEvidence ?? [],
    enabledPersonas: validationResult.enabledPersonas ?? [],
    errors: sanitizeDiagnostics(validationResult.errors),
    warnings: sanitizeDiagnostics(validationResult.warnings),
    sources: builtSources,
  };
}

// ---------------------------------------------------------------------------
// createConfigScopeHandler
// ---------------------------------------------------------------------------

/**
 * Returns an async HTTP handler for GET /api/config-scope.
 *
 * @param {() => Promise<object>} readConfigScope
 *   Async function that reads + validates contractrescue.json and returns a
 *   payload produced by buildConfigScopePayload. Never receives browser input.
 *
 * @returns {(request: object, response: object) => Promise<void>}
 */
export function createConfigScopeHandler(readConfigScope) {
  return async function handleConfigScope(_request, response) {
    try {
      const payload = await readConfigScope();
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify(payload, null, 2));
    } catch {
      // Do NOT forward error.message, error.code, stack trace, or any
      // filesystem path from the caught error to the browser.
      response.writeHead(503, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify({
        available: false,
        reason: "contractrescue.json could not be read or is not valid JSON.",
      }, null, 2));
    }
  };
}
