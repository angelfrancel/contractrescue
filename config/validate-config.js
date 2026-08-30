import { existsSync, realpathSync, statSync } from "node:fs";
import { resolve, isAbsolute, normalize, sep } from "node:path";

// Patterns for sensitive credential/secret file names.
const SENSITIVE_PATTERNS = [
  /^\.env$/i,
  /\.env\./i,
  /\.env$/i,
  /api[_-]?key/i,
  /secret/i,
  /credential/i,
  /password/i,
  /private[_-]?key/i,
  /auth[_-]?token/i,
  /access[_-]?token/i,
  /bearer[_-]?token/i,
  /jwt[_-]?secret/i,
  /session[_-]?secret/i,
];

function isSensitivePath(p) {
  const base = p.replace(/\\/g, "/").split("/").pop() || "";
  return SENSITIVE_PATTERNS.some((re) => re.test(base));
}

function isAbsolutePath(p) {
  // Unix absolute
  if (p.startsWith("/")) return true;
  // Windows absolute: C:\ C:/ etc.
  if (/^[a-zA-Z]:[/\\]/.test(p)) return true;
  return false;
}

function hasTraversal(p) {
  // Normalize to resolve any OS-specific separator, then unify to forward slashes for the check.
  const normalized = normalize(p).replace(/\\/g, "/");
  return normalized.split("/").includes("..");
}

function hasNullByte(p) {
  return p.includes("\0");
}

/**
 * Check a single path string for hard-error unsafe conditions.
 * Returns an error string if unsafe, null if safe.
 */
function checkPathSafety(p) {
  if (hasNullByte(p)) return `Path contains null byte: ${p}`;
  if (isAbsolutePath(p)) return `Path is absolute and not allowed: ${p}`;
  if (hasTraversal(p)) return `Path contains parent traversal: ${p}`;
  if (isSensitivePath(p)) return `Path references a sensitive file: ${p}`;
  return null;
}

/**
 * Verify that a resolved absolute path stays inside repoRoot via realpathSync.
 * Returns an error string if it escapes, null if contained.
 * If the path doesn't exist, returns null (let existence check handle that separately).
 */
function checkContainment(resolvedPath, realRoot) {
  try {
    const realPath = realpathSync(resolvedPath);
    const withSep = realRoot.endsWith(sep) ? realRoot : realRoot + sep;
    if (realPath !== realRoot && !realPath.startsWith(withSep)) {
      return `Path escapes repository root: ${resolvedPath}`;
    }
  } catch {
    // Path doesn't exist — existence check will surface this separately.
  }
  return null;
}

/**
 * Validate a list of source paths for a given category.
 * required=true  → any failure pushes to errors (hard error)
 * required=false → unsafe paths push to errors; missing paths push to warnings
 *
 * Returns { validPaths, errors, warnings, skipped }
 */
function validateSourcePaths(category, paths, required, repoRoot, realRoot) {
  const errors = [];
  const warnings = [];
  const validPaths = [];
  let skipped = false;

  if (!Array.isArray(paths) || paths.length === 0) {
    if (required) {
      errors.push(`Provider paths must be a non-empty array.`);
    } else {
      warnings.push(`Source '${category}' has no paths declared — skipped.`);
      skipped = true;
    }
    return { validPaths, errors, warnings, skipped };
  }

  for (const p of paths) {
    // Hard safety checks apply regardless of required/optional.
    const safetyError = checkPathSafety(p);
    if (safetyError) {
      errors.push(safetyError);
      continue;
    }

    const absPath = resolve(repoRoot, p);

    // Containment check (symlink escape) — hard error for all categories.
    const containmentError = checkContainment(absPath, realRoot);
    if (containmentError) {
      errors.push(containmentError);
      continue;
    }

    // Existence check.
    if (!existsSync(absPath)) {
      if (required) {
        errors.push(`Provider path does not exist: ${p}`);
      } else {
        warnings.push(`Optional path does not exist (skipped): ${p}`);
        skipped = true;
      }
      continue;
    }

    validPaths.push(p);
  }

  return { validPaths, errors, warnings, skipped };
}

/**
 * Validate commands block.
 * Returns { errors }
 */
function validateCommands(commands) {
  const errors = [];
  if (commands === undefined || commands === null) return { errors };
  if (typeof commands !== "object" || Array.isArray(commands)) {
    errors.push("commands must be an object.");
    return { errors };
  }
  for (const [name, cmd] of Object.entries(commands)) {
    if (!cmd || typeof cmd !== "object") {
      errors.push(`Command '${name}' must be an object.`);
      continue;
    }
    if (cmd.program !== "npm" && cmd.program !== "node") {
      errors.push(`Command program must be 'npm' or 'node': ${cmd.program}`);
    }
    if (!Array.isArray(cmd.args)) {
      errors.push(`Command args must be an array of non-empty strings.`);
    } else {
      for (const arg of cmd.args) {
        if (typeof arg !== "string" || arg.length === 0) {
          errors.push(`Command args must be an array of non-empty strings.`);
          break;
        }
        if (hasNullByte(arg)) {
          errors.push(`Command arg contains null byte.`);
          break;
        }
      }
    }
  }
  return { errors };
}

/**
 * Validate artifacts block.
 * Returns { errors }
 */
function validateArtifacts(artifacts, repoRoot, realRoot) {
  const errors = [];
  if (artifacts === undefined || artifacts === null) return { errors };
  const dir = artifacts.directory;
  if (typeof dir !== "string" || dir.trim() === "") {
    errors.push("Artifacts directory must be declared.");
    return { errors };
  }
  const safetyError = checkPathSafety(dir);
  if (safetyError) {
    errors.push(`Artifacts directory is unsafe: ${safetyError}`);
    return { errors };
  }
  const absDir = resolve(repoRoot, dir);
  const containmentError = checkContainment(absDir, realRoot);
  if (containmentError) {
    errors.push("Artifacts directory escapes repository root.");
    return { errors };
  }
  if (existsSync(absDir)) {
    try {
      const stat = statSync(absDir);
      if (!stat.isDirectory()) {
        errors.push("Artifacts path exists but is not a directory.");
      }
    } catch {
      errors.push("Artifacts directory is not accessible.");
    }
  }
  return { errors };
}

/**
 * Main validator.
 * @param {object} raw      - Parsed JSON config object
 * @param {string} repoRoot - Absolute path to repository root
 * @returns {object} Validation result
 */
export function validateConfig(raw, repoRoot) {
  const errors = [];
  const warnings = [];
  const enabledSources = [];
  const skippedSources = [];
  const missingEvidence = [];
  const enabledPersonas = [];

  // Resolve real root (resolve symlinks on the root itself).
  let realRoot;
  try {
    realRoot = realpathSync(repoRoot);
  } catch {
    return {
      valid: false,
      projectName: null,
      enabledSources,
      skippedSources,
      missingEvidence,
      enabledPersonas,
      errors: ["Repository root does not exist or is not accessible."],
      warnings,
    };
  }

  const projectName =
    raw && raw.project && typeof raw.project.name === "string"
      ? raw.project.name
      : null;

  if (!raw || typeof raw !== "object") {
    errors.push("Config must be a JSON object.");
    return { valid: false, projectName, enabledSources, skippedSources, missingEvidence, enabledPersonas, errors, warnings };
  }

  const sources = raw.sources || {};

  // --- Provider (required) ---
  const providerDecl = sources.provider;
  if (!providerDecl || typeof providerDecl !== "object") {
    errors.push("Provider source is required but was not declared.");
  } else if (providerDecl.required !== true) {
    errors.push("Provider source must have required: true.");
  } else {
    const { validPaths, errors: pe, warnings: pw } = validateSourcePaths(
      "provider", providerDecl.paths, true, repoRoot, realRoot
    );
    errors.push(...pe);
    warnings.push(...pw);
    if (validPaths.length > 0 && pe.length === 0) {
      enabledSources.push("provider");
    }
  }

  // --- Optional sources ---
  const optionalCategories = ["consumer", "documentation", "tests"];
  for (const cat of optionalCategories) {
    const decl = sources[cat];
    if (!decl || typeof decl !== "object") {
      warnings.push(`Source '${cat}' is not declared — skipped.`);
      skippedSources.push(cat);
      missingEvidence.push(cat);
      continue;
    }
    const { validPaths, errors: ce, warnings: cw, skipped } = validateSourcePaths(
      cat, decl.paths, false, repoRoot, realRoot
    );
    // Unsafe path in optional category → hard error.
    errors.push(...ce);
    warnings.push(...cw);

    if (ce.length > 0) {
      // Hard error from optional category — don't add to enabled or skipped.
      continue;
    }

    if (skipped || validPaths.length === 0) {
      skippedSources.push(cat);
      missingEvidence.push(cat);
    } else {
      enabledSources.push(cat);
    }
  }

  // --- Commands ---
  const cmdResult = validateCommands(raw.commands);
  errors.push(...cmdResult.errors);

  // --- Artifacts ---
  const artResult = validateArtifacts(raw.artifacts, repoRoot, realRoot);
  errors.push(...artResult.errors);

  // --- Persona assignment ---
  if (enabledSources.includes("provider")) {
    enabledPersonas.push("provider-auditor");
  }
  if (enabledSources.includes("consumer")) {
    enabledPersonas.push("consumer-auditor");
  }
  if (enabledSources.includes("documentation") || enabledSources.includes("tests")) {
    enabledPersonas.push("contract-evidence-auditor");
  }

  const valid = errors.length === 0;

  return {
    valid,
    projectName,
    enabledSources,
    skippedSources,
    missingEvidence,
    enabledPersonas,
    errors,
    warnings,
  };
}
