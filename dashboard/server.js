import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateConfig } from "../config/validate-config.js";
import {
  buildConfigScopePayload,
  createConfigScopeHandler,
} from "./config-scope.js";

const dashboardRoot = fileURLToPath(new URL("./public/", import.meta.url));
const artifactsRoot = fileURLToPath(new URL("../artifacts/", import.meta.url));
const port = Number(process.env.DASHBOARD_PORT ?? 4173);

// Resolved once at server startup from import.meta.url — never from request input.
const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const configFilePath = join(repoRoot, "contractrescue.json");

async function readProductionConfigScope() {
  const text = await readFile(configFilePath, "utf8");
  const raw = JSON.parse(text); // throws SyntaxError → caught by handler → 503
  const result = validateConfig(raw, repoRoot);
  return buildConfigScopePayload(raw, result, {
    // pathExists is called only with safe repository-relative paths supplied by
    // buildConfigScopePayload after its own safety checks. repoRoot is never
    // forwarded into the returned payload.
    pathExists: (p) => existsSync(resolve(repoRoot, p)),
  });
}

const handleConfigScope = createConfigScopeHandler(readProductionConfigScope);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

async function readJson(filename) {
  return JSON.parse(await readFile(join(artifactsRoot, filename), "utf8"));
}

async function readRequestJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error("REQUEST_TOO_LARGE");
  }
  return JSON.parse(body || "{}");
}

function validateApproval(input, analysis) {
  if (analysis.status !== "awaiting_human_approval") {
    return "Analysis is not awaiting human approval.";
  }
  if (input.analysisId !== analysis.analysisId) return "Analysis identifier does not match.";
  if (input.decision !== "approve") return "Only an explicit approve decision is supported.";
  if (!Number.isInteger(input.approvedStatus)) return "Approved status must be an integer.";
  const observedStatuses = analysis.contradictions
    ?.flatMap(conflict => conflict.observedValues ?? [])
    .map(item => item.value) ?? [];
  if (!observedStatuses.includes(input.approvedStatus)) {
    return "Approved status must be one of the evidence-backed options.";
  }
  if (typeof input.approvedBy !== "string" || input.approvedBy.trim().length < 2) {
    return "Enter the approving developer's name.";
  }
  return null;
}

async function handleApproval(request, response) {
  try {
    const [analysis, input] = await Promise.all([
      readJson("contract-analysis.json"),
      readRequestJson(request)
    ]);
    const error = validateApproval(input, analysis);
    if (error) return sendJson(response, 400, { error });

    const decision = {
      schemaVersion: "1.0",
      decisionId: `${analysis.analysisId}-DECISION-001`,
      analysisId: analysis.analysisId,
      decision: "approved",
      approvedContract: {
        method: analysis.endpoint.method,
        path: analysis.endpoint.path,
        scenario: analysis.endpoint.scenario,
        statusCode: input.approvedStatus
      },
      approvedBy: input.approvedBy.trim(),
      approvedAt: new Date().toISOString(),
      sourceAnalysis: "artifacts/contract-analysis.json",
      recommendationAccepted: input.approvedStatus === analysis.recommendation?.proposedValue,
      implementationAuthorized: true,
      constraints: [
        "Generate and execute a failing contract test before repair",
        "Modify only files required by the approved decision",
        "Run the same contract test and all unit tests after repair",
        "Perform independent verification"
      ]
    };

    await writeFile(
      join(artifactsRoot, "approved-decision.json"),
      `${JSON.stringify(decision, null, 2)}\n`,
      { flag: "wx" }
    );
    sendJson(response, 201, decision);
  } catch (error) {
    if (error?.code === "EEXIST") {
      return sendJson(response, 409, {
        error: "A decision already exists. Delete it manually only when deliberately resetting the demo."
      });
    }
    if (error instanceof SyntaxError) return sendJson(response, 400, { error: "Invalid JSON request." });
    if (error?.message === "REQUEST_TOO_LARGE") {
      return sendJson(response, 413, { error: "Request body is too large." });
    }
    sendJson(response, 500, { error: "Unable to record the approval decision." });
  }
}

async function serveStatic(request, response) {
  const requested = request.url === "/" ? "index.html" : request.url.slice(1).split("?")[0];
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(dashboardRoot, safePath);
  if (!filePath.startsWith(dashboardRoot)) return sendJson(response, 403, { error: "Forbidden" });

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream",
      "cache-control": "no-store"
    });
    response.end(body);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/api/config-scope") {
    return handleConfigScope(request, response);
  }

  if (request.method === "GET" && request.url === "/api/analysis") {
    try {
      return sendJson(response, 200, await readJson("contract-analysis.json"));
    } catch {
      return sendJson(response, 404, {
        error: "No Bob analysis found at artifacts/contract-analysis.json."
      });
    }
  }

  if (request.method === "GET" && request.url === "/api/decision") {
    try {
      return sendJson(response, 200, await readJson("approved-decision.json"));
    } catch {
      return sendJson(response, 404, { error: "No human decision has been recorded." });
    }
  }

  if (request.method === "POST" && request.url === "/api/decision") {
    return handleApproval(request, response);
  }

  if (request.method === "GET") return serveStatic(request, response);
  sendJson(response, 405, { error: "Method not allowed" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`ContractRescue dashboard: http://127.0.0.1:${port}`);
});
