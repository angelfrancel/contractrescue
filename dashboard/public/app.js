const state = { analysis: null, filter: "all" };

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

fetch("/api/analysis", { cache: "no-store" })
  .then(async response => {
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    renderAnalysis(payload);
  })
  .catch(error => showError(error.message));
