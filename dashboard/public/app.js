const state = { analysis: null, filter: "all" };

// ---------------------------------------------------------------------------
// Config scope rendering
// ---------------------------------------------------------------------------

const CATEGORY_LABELS = {
  provider: "Provider",
  consumer: "Consumer",
  documentation: "Documentation",
  tests: "Tests",
};

function renderConfigScope(payload) {
  const section = $("#config-scope");
  const statusBadge = $("#config-scope-status");
  const body = $("#config-scope-body");

  if (!payload.available) {
    // 503 unavailable state
    statusBadge.textContent = "";
    const msg = document.createElement("p");
    msg.className = "config-unavailable";
    msg.textContent = "\u2298  Configuration scope unavailable.";
    const hint = document.createElement("p");
    hint.className = "explanation";
    hint.textContent =
      "contractrescue.json could not be read or is not valid JSON. " +
      "Run: npm run contractrescue:validate";
    body.replaceChildren(msg, hint);
    section.classList.remove("hidden");
    return;
  }

  // Status badge
  statusBadge.className =
    "config-status-badge " + (payload.valid ? "config-valid" : "config-invalid");
  const statusSymbol = document.createElement("span");
  statusSymbol.setAttribute("aria-hidden", "true");
  statusSymbol.textContent = payload.valid ? "\u25CF" : "\u2715";
  const statusText = document.createElement("span");
  statusText.textContent = payload.valid ? " VALID" : " INVALID";
  statusBadge.replaceChildren(statusSymbol, statusText);

  const fragments = [];

  // Meta line: project name + config filename
  const meta = document.createElement("p");
  meta.className = "config-meta";
  meta.textContent =
    (payload.projectName ?? "(unnamed)") + "  \u00B7  " + payload.configFilename;
  fragments.push(meta);

  // Category grid
  const grid = document.createElement("div");
  grid.className = "scope-grid";

  for (const category of ["provider", "consumer", "documentation", "tests"]) {
    const src = payload.sources?.[category];
    if (!src) continue;

    const card = document.createElement("article");
    card.className = "scope-category";

    // Category heading row
    const heading = document.createElement("div");
    heading.className = "scope-heading";

    const catLabel = document.createElement("span");
    catLabel.className = "scope-cat-label";
    catLabel.textContent = CATEGORY_LABELS[category] ?? category;

    const statusPill = document.createElement("span");
    statusPill.className = "scope-pill scope-pill-" + src.status;
    statusPill.textContent = src.status;

    const reqPill = document.createElement("span");
    reqPill.className = "scope-pill scope-pill-req";
    reqPill.textContent = src.required ? "required" : "optional";

    heading.append(catLabel, statusPill, reqPill);
    card.append(heading);

    if (src.paths.length === 0) {
      const none = document.createElement("p");
      none.className = "scope-no-paths";
      none.textContent = "Not declared in configuration.";
      card.append(none);
    } else {
      const list = document.createElement("ul");
      list.className = "scope-path-list";
      for (const entry of src.paths) {
        const li = document.createElement("li");
        li.className = "scope-path-row";

        const pathText = document.createElement("span");
        pathText.className = "scope-path-value";
        pathText.textContent = entry.path;

        const existsIndicator = document.createElement("span");
        if (!entry.safe) {
          existsIndicator.className = "scope-exists scope-unsafe";
          existsIndicator.textContent = "unsafe";
        } else if (entry.exists) {
          existsIndicator.className = "scope-exists scope-found";
          const icon = document.createElement("span");
          icon.setAttribute("aria-hidden", "true");
          icon.textContent = "\u2713 ";
          const label = document.createElement("span");
          label.textContent = "exists";
          existsIndicator.append(icon, label);
        } else {
          existsIndicator.className = "scope-exists scope-missing";
          const icon = document.createElement("span");
          icon.setAttribute("aria-hidden", "true");
          icon.textContent = "\u2717 ";
          const label = document.createElement("span");
          label.textContent = "not found";
          existsIndicator.append(icon, label);
        }

        li.append(pathText, existsIndicator);
        list.append(li);
      }
      card.append(list);
    }

    grid.append(card);
  }
  fragments.push(grid);

  // Enabled personas
  if (payload.enabledPersonas?.length > 0) {
    const personaRow = document.createElement("div");
    personaRow.className = "scope-persona-row";
    const personaLabel = document.createElement("span");
    personaLabel.className = "scope-persona-label";
    personaLabel.textContent = "Enabled personas";
    personaRow.append(personaLabel);
    for (const p of payload.enabledPersonas) {
      const pill = document.createElement("span");
      pill.className = "scope-pill scope-pill-persona";
      pill.textContent = p;
      personaRow.append(pill);
    }
    fragments.push(personaRow);
  }

  // Errors
  if (payload.errors?.length > 0) {
    const errSection = document.createElement("div");
    errSection.className = "scope-diagnostics scope-errors";
    const errHeading = document.createElement("h3");
    errHeading.textContent = "\u2715  " + payload.errors.length + " error" +
      (payload.errors.length === 1 ? "" : "s") + " \u2014 workflow cannot proceed";
    const errList = document.createElement("ul");
    for (const e of payload.errors) {
      const li = document.createElement("li");
      li.textContent = e;
      errList.append(li);
    }
    errSection.append(errHeading, errList);
    fragments.push(errSection);
  }

  // Warnings
  if (payload.warnings?.length > 0) {
    const warnSection = document.createElement("div");
    warnSection.className = "scope-diagnostics scope-warnings";
    const warnHeading = document.createElement("h3");
    warnHeading.textContent = "\u26A0  " + payload.warnings.length + " warning" +
      (payload.warnings.length === 1 ? "" : "s");
    const warnList = document.createElement("ul");
    for (const w of payload.warnings) {
      const li = document.createElement("li");
      li.textContent = w;
      warnList.append(li);
    }
    warnSection.append(warnHeading, warnList);
    fragments.push(warnSection);
  }

  // Explanatory notices
  if (payload.skippedSources?.length > 0) {
    const notice = document.createElement("p");
    notice.className = "scope-notice";
    notice.textContent =
      "\u2139  Skipping optional evidence sources does not automatically invalidate " +
      "the workflow. Configured analyses are scoped to available evidence only.";
    fragments.push(notice);
  }

  if (!payload.valid) {
    const fixNotice = document.createElement("p");
    fixNotice.className = "scope-notice scope-notice-fix";
    fixNotice.textContent =
      "Fix errors in contractrescue.json and restart the dashboard.";
    fragments.push(fixNotice);
  }

  const requiredNotice = document.createElement("p");
  requiredNotice.className = "scope-notice-muted";
  requiredNotice.textContent =
    "\u2139  Provider evidence is required. The workflow cannot proceed without it.";
  fragments.push(requiredNotice);

  body.replaceChildren(...fragments);
  section.classList.remove("hidden");
}

function fetchConfigScope() {
  fetch("/api/config-scope", { cache: "no-store" })
    .then(async (response) => {
      const payload = await response.json();
      renderConfigScope(payload);
    })
    .catch(() => {
      renderConfigScope({ available: false });
    });
}

const $ = selector => document.querySelector(selector);
const sourceLabels = {
  consumer: "Consumer",
  provider: "Provider",
  documentation: "Documentation",
  unit_test: "Unit test"
};

function escapeText(value) {
  return String(value ?? "");
}

function showError(message) {
  $("#error-panel").textContent = message;
  $("#error-panel").classList.remove("hidden");
}

function renderFilters(evidence) {
  const types = ["all", ...new Set(evidence.map(item => item.sourceType))];
  $("#filters").replaceChildren(...types.map(type => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-button${state.filter === type ? " active" : ""}`;
    button.textContent = type === "all" ? "All sources" : sourceLabels[type] ?? type;
    button.addEventListener("click", () => {
      state.filter = type;
      renderFilters(evidence);
      renderEvidence(evidence);
    });
    return button;
  }));
}

function renderEvidence(evidence) {
  const visible = evidence.filter(item => state.filter === "all" || item.sourceType === state.filter);
  $("#evidence-list").replaceChildren(...visible.map(item => {
    const article = document.createElement("article");
    article.className = "evidence-card";

    const top = document.createElement("div");
    top.className = "evidence-top";
    const tag = document.createElement("span");
    tag.className = `source-tag ${item.sourceType}`;
    tag.textContent = sourceLabels[item.sourceType] ?? item.sourceType;
    const status = document.createElement("strong");
    status.textContent = item.statusCode ? `HTTP ${item.statusCode}` : "Observed";
    top.append(tag, status);

    const observation = document.createElement("p");
    observation.textContent = escapeText(item.observation);
    const cite = document.createElement("code");
    cite.textContent = `${item.file} :: ${item.symbol}`;
    article.append(top, observation, cite);
    return article;
  }));
}

function renderConflict(conflict) {
  $("#conflict-title").textContent = conflict.contractElement;
  $("#conflict-explanation").textContent = conflict.explanation;
  $("#conflict-values").replaceChildren(...conflict.observedValues.map((entry, index) => {
    const card = document.createElement("article");
    card.className = `value-card ${index === 0 ? "recommended" : "divergent"}`;
    const value = document.createElement("strong");
    value.textContent = `HTTP ${entry.value}`;
    const sources = document.createElement("ul");
    for (const source of entry.sources) {
      const item = document.createElement("li");
      item.textContent = source;
      sources.append(item);
    }
    card.append(value, sources);
    return card;
  }));
}

function renderAnalysis(analysis) {
  state.analysis = analysis;
  $("#analysis-id").textContent = analysis.analysisId;
  $("#workflow-status").textContent = analysis.status.replaceAll("_", " ");
  $("#endpoint").textContent = `${analysis.endpoint.method} ${analysis.endpoint.path}`;
  $("#scenario").textContent = analysis.endpoint.scenario;
  $("#evidence-count").textContent = analysis.evidence.length;
  $("#conflict-count").textContent = analysis.contradictions.filter(item => item.blocking).length;
  const confidence = analysis.recommendation.confidence;
  $("#confidence").textContent =
  confidence.charAt(0).toUpperCase() + confidence.slice(1);
  $("#recommended-value").textContent = analysis.recommendation.proposedValue;
  const statuses = [...new Set(analysis.contradictions.flatMap(conflict => conflict.observedValues.map(item => item.value)))];
  $("#decision-value").replaceChildren(...statuses.map(status => {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = `HTTP ${status}${status === analysis.recommendation.proposedValue ? " — Bob recommendation" : " — retain current behavior"}`;
    option.selected = status === analysis.recommendation.proposedValue;
    return option;
  }));
  $("#approval-value").textContent = $("#decision-value").value;
  $("#recommendation-rationale").textContent = analysis.recommendation.rationale;
  renderConflict(analysis.contradictions[0]);
  renderFilters(analysis.evidence);
  renderEvidence(analysis.evidence);
  $("#dashboard").classList.remove("hidden");
}

function updateApprovalState() {
  $("#approve-button").disabled = !$("#acknowledgement").checked || $("#approver").value.trim().length < 2;
}

async function approveDecision() {
  const button = $("#approve-button");
  button.disabled = true;
  button.textContent = "Recording decision…";
  $("#decision-message").textContent = "";

  try {
    const response = await fetch("/api/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        analysisId: state.analysis.analysisId,
        decision: "approve",
        approvedStatus: Number($("#decision-value").value),
        approvedBy: $("#approver").value.trim()
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Approval failed.");
    $("#decision-message").textContent = `Decision ${result.decisionId} recorded. Bob may proceed under the listed constraints.`;
    $("#decision-message").classList.add("success");
    button.textContent = "Contract approved";
    $("#approver").disabled = true;
    $("#acknowledgement").disabled = true;
  } catch (error) {
    $("#decision-message").textContent = error.message;
    button.textContent = "Approve contract decision";
    updateApprovalState();
  }
}

$("#approver").addEventListener("input", updateApprovalState);
$("#decision-value").addEventListener("change", () => {
  $("#approval-value").textContent = $("#decision-value").value;
});
$("#acknowledgement").addEventListener("change", updateApprovalState);
$("#approve-button").addEventListener("click", approveDecision);

fetchConfigScope();

fetch("/api/analysis", { cache: "no-store" })
  .then(async response => {
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    renderAnalysis(payload);
  })
  .catch(error => showError(error.message));
