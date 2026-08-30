import { readFileSync, existsSync, realpathSync, statSync } from "node:fs";
import { resolve, isAbsolute, normalize, sep } from "node:path";
import { validateConfig } from "./validate-config.js";

function hasTraversal(p) {
  const normalized = normalize(p).replace(/\\/g, "/");
  return normalized.split("/").includes("..");
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let repoRoot = null;
  let configPath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--repo-root" && args[i + 1]) {
      repoRoot = args[++i];
    } else if (args[i] === "--config" && args[i + 1]) {
      configPath = args[++i];
    } else if (args[i].startsWith("--repo-root=")) {
      repoRoot = args[i].slice("--repo-root=".length);
    } else if (args[i].startsWith("--config=")) {
      configPath = args[i].slice("--config=".length);
    } else {
      console.error(`Unknown argument: ${args[i]}`);
      process.exit(1);
    }
  }

  return { repoRoot, configPath };
}

function validateConfigPath(configPath, repoRoot, realRoot) {
  // --config must be repository-relative.
  if (isAbsolute(configPath)) {
    console.error(`Error: --config must be a repository-relative path.`);
    process.exit(1);
  }
  if (hasTraversal(configPath)) {
    console.error(`Error: --config must not contain parent traversal.`);
    process.exit(1);
  }
  const absConfig = resolve(repoRoot, configPath);
  // Must resolve inside real repoRoot.
  let realConfig;
  try {
    // Use the parent directory for realpathSync if file doesn't exist yet,
    // but here we check existence first.
    if (!existsSync(absConfig)) {
      console.error(`Error: Config file not found or unreadable: ${configPath}`);
      process.exit(1);
    }
    realConfig = realpathSync(absConfig);
  } catch {
    console.error(`Error: Config file not found or unreadable: ${configPath}`);
    process.exit(1);
  }
  const withSep = realRoot.endsWith(sep) ? realRoot : realRoot + sep;
  if (realConfig !== realRoot && !realConfig.startsWith(withSep)) {
    console.error(`Error: --config resolves outside the repository root.`);
    process.exit(1);
  }
  return absConfig;
}

function main() {
  const { repoRoot: rawRepoRoot, configPath: rawConfigPath } = parseArgs(process.argv);

  // Resolve repoRoot — may be absolute (it establishes the root).
  const repoRoot = rawRepoRoot ? resolve(rawRepoRoot) : process.cwd();

  // Validate repoRoot exists and is a directory.
  if (!existsSync(repoRoot)) {
    console.error(`Error: --repo-root does not exist: ${repoRoot}`);
    process.exit(1);
  }
  let stat;
  try {
    stat = statSync(repoRoot);
  } catch {
    console.error(`Error: --repo-root is not accessible: ${repoRoot}`);
    process.exit(1);
  }
  if (!stat.isDirectory()) {
    console.error(`Error: --repo-root must be a directory: ${repoRoot}`);
    process.exit(1);
  }

  let realRoot;
  try {
    realRoot = realpathSync(repoRoot);
  } catch {
    console.error(`Error: Could not resolve real path of repository root.`);
    process.exit(1);
  }

  // Determine config file path.
  const configRelPath = rawConfigPath || "contractrescue.json";
  const absConfigPath = validateConfigPath(configRelPath, repoRoot, realRoot);

  // Read and parse config file.
  let raw;
  try {
    const text = readFileSync(absConfigPath, "utf8");
    try {
      raw = JSON.parse(text);
    } catch (e) {
      console.error(`Error: Config file contains invalid JSON: ${e.message}`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`Error: Config file not found or unreadable: ${configRelPath}`);
    process.exit(1);
  }

  // Run validation.
  const result = validateConfig(raw, repoRoot);

  // Print report.
  console.log(`ContractRescue Configuration Validator`);
  console.log(`=======================================`);
  console.log(`Project      : ${result.projectName ?? "(unnamed)"}`);
  console.log(`Config file  : ${configRelPath}`);
  console.log(`Repo root    : ${repoRoot}`);
  console.log(``);
  console.log(`Enabled sources  : ${result.enabledSources.length > 0 ? result.enabledSources.join(", ") : "(none)"}`);
  console.log(`Skipped sources  : ${result.skippedSources.length > 0 ? result.skippedSources.join(", ") : "(none)"}`);
  console.log(`Missing evidence : ${result.missingEvidence.length > 0 ? result.missingEvidence.join(", ") : "(none)"}`);
  console.log(`Enabled personas : ${result.enabledPersonas.length > 0 ? result.enabledPersonas.join(", ") : "(none)"}`);

  if (result.warnings.length > 0) {
    console.log(``);
    console.log(`Warnings (${result.warnings.length}):`);
    for (const w of result.warnings) {
      console.log(`  [WARN] ${w}`);
    }
  }

  if (result.errors.length > 0) {
    console.log(``);
    console.log(`Errors (${result.errors.length}):`);
    for (const e of result.errors) {
      console.log(`  [ERROR] ${e}`);
    }
  }

  console.log(``);
  if (result.valid) {
    console.log(`Status: VALID`);
    process.exit(0);
  } else {
    console.log(`Status: INVALID`);
    process.exit(1);
  }
}

main();
