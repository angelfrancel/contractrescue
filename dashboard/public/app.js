// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const $ = selector => document.querySelector(selector);

function escapeText(value) {
  return String(value ?? "");
}

// Safe DOM text setter — never uses innerHTML.
function setText(selector, value) {
  const el = $(selector);
  if (el) el.textContent = escapeText(value);
}

// ---------------------------------------------------------------------------
// Tab controller
// Tab model: Arrow keys move focus AND activate simultaneously (automatic activation).
// ArrowRight / ArrowLeft move through tabs, wrapping at ends.
// Home / End jump to first / last tab.
// Tab key exits the tab list into the active panel.
// ---------------------------------------------------------------------------

const TAB_IDS    = ["tab-decision", "tab-evidence", "tab-audit"];
const PANEL_IDS  = ["panel-decision", "panel-evidence", "panel-audit"];

function activateTab(targetId) {
  TAB_IDS.forEach((id, i) => {
    const btn   = document.getElementById(id);
    const panel = document.getElementById(PANEL_IDS[i]);
    const isActive = id === targetId;
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
    btn.setAttribute("tabindex", isActive ? "0" : "-1");
    btn.classList.toggle("tab-active", isActive);
    if (isActive) {
      panel.removeAttribute("hidden");
    } else {
      panel.setAttribute("hidden", "");
    }
  });
}

function initTabs() {
  const bar = document.getElementById("tab-bar");

  bar.addEventListener("keydown", (e) => {
    const current = TAB_IDS.findIndex(id => id === document.activeElement.id);
    if (current === -1) return;

    let next = -1;
    if (e.key === "ArrowRight") {
      next = (current + 1) % TAB_IDS.length;
    } else if (e.key === "ArrowLeft") {
      next = (current - 1 + TAB_IDS.length) % TAB_IDS.length;
    } else if (e.key === "Home") {
      next = 0;
    } else if (e.key === "End") {
      next = TAB_IDS.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    activateTab(TAB_IDS[next]);
    document.getElementById(TAB_IDS[next]).focus();
  });

  TAB_IDS.forEach(id => {
    document.getElementById(id).addEventListener("click", () => {
      activateTab(id);
    });
  });
}

// ---------------------------------------------------------------------------
// Lifecycle derivation
// Accepts analysis, decision (may be null), verification (may be null).
// Returns { label, sublabel, inconsistent, reason }
// ---------------------------------------------------------------------------

const KNOWN_DECISION_VALUES      = ["approved", "rejected"];
const KNOWN_VERIFICATION_VERDICTS = ["verified_with_warnings", "verified", "pass"];

function deriveLifecycle(analysis, decision, verification) {
  // ── Inconsistency checks (highest priority) ──────────────────────────────

  // Verification exists but decision is absent
  if (verification !== null && decision === null) {
    return {
      inconsistent: true,
      reason: "verification-report.json is present but no approved-decision.json was found."
    };
  }

  // Post-repair-in-verification exists but decision is absent (redundant with above,
  // kept explicit for clarity — unreachable given the check above).

  // Cross-artifact ID checks
  if (decision !== null) {
    if (decision.analysisId !== analysis.analysisId) {
      return {
        inconsistent: true,
        reason: "approved-decision.json analysisId (" + escapeText(decision.analysisId) +
                ") does not match contract-analysis.json analysisId (" +
                escapeText(analysis.analysisId) + ")."
      };
    }
  }

  if (verification !== null) {
    if (typeof verification.analysisId !== "string" ||
        typeof verification.decisionId !== "string" ||
        typeof verification.verdict    !== "string") {
      return {
        inconsistent: true,
        reason: "verification-report.json is missing required fields (analysisId, decisionId, or verdict)."
      };
    }
    if (verification.analysisId !== analysis.analysisId) {
      return {
        inconsistent: true,
        reason: "verification-report.json analysisId (" + escapeText(verification.analysisId) +
                ") does not match contract-analysis.json analysisId (" +
                escapeText(analysis.analysisId) + ")."
      };
    }
    if (decision !== null && verification.decisionId !== decision.decisionId) {
      return {
        inconsistent: true,
        reason: "verification-report.json decisionId (" + escapeText(verification.decisionId) +
                ") does not match approved-decision.json decisionId (" +
                escapeText(decision.decisionId) + ")."
      };
    }
    // Unknown verdict
    if (!KNOWN_VERIFICATION_VERDICTS.includes(verification.verdict)) {
      return {
        inconsistent: true,
        reason: "verification-report.json contains an unrecognized verdict value."
      };
    }
    // Required audit-trail structure check
    const missingFields = [];
    if (!verification.preRepair || typeof verification.preRepair !== "object") missingFields.push("preRepair");
    if (!verification.postRepair || typeof verification.postRepair !== "object") missingFields.push("postRepair");
    if (!verification.freshTestResults || typeof verification.freshTestResults !== "object") missingFields.push("freshTestResults");
    if (missingFields.length > 0) {
      return {
        inconsistent: true,
        reason: "verification-report.json is missing required fields: " + missingFields.join(", ") + "."
      };
    }
    // Rejected decision with verification present — inconsistent
    if (decision !== null && decision.decision === "rejected") {
      return {
        inconsistent: true,
        reason: "approved-decision.json records a rejected decision but verification evidence also exists."
      };
    }
  }

  // Rejected decision with no post-repair/verification
  if (decision !== null && decision.decision === "rejected" && verification === null) {
    return {
      inconsistent: false,
      label: "Contract decision rejected · no repair authorized",
      sublabel: null
    };
  }

  // Unknown decision value
  if (decision !== null && !KNOWN_DECISION_VALUES.includes(decision.decision)) {
    return {
      inconsistent: true,
      reason: "approved-decision.json contains an unrecognized decision value."
    };
  }

  // ── Normal lifecycle progression ─────────────────────────────────────────

  // No decision yet
  if (decision === null) {
    return {
      inconsistent: false,
      label: "Awaiting human approval",
      sublabel: null
    };
  }

  // Approved, no verification
  if (verification === null) {
    return {
      inconsistent: false,
      label: "Contract approved · repair authorized",
      sublabel: null
    };
  }

  // Verification present — we already validated the verdict above
  if (verification.verdict === "verified_with_warnings") {
    const pass = Number(verification.passedCriteria  ?? 0);
    const fail = Number(verification.failedCriteria  ?? 0);
    const warn = Number(verification.warningCriteria ?? 0);
    return {
      inconsistent: false,
      label: "Completed · independently verified with warnings",
      sublabel: pass + " pass · " + fail + " fail · " + warn + " warning"
    };
  }

  // "verified" or "pass" with no warnings
  const pass = Number(verification.passedCriteria  ?? 0);
  const fail = Number(verification.failedCriteria  ?? 0);
  const warn = Number(verification.warningCriteria ?? 0);
  return {
    inconsistent: false,
    label: "Completed · independently verified",
    sublabel: pass + " pass · " + fail + " fail · " + (warn > 0 ? warn + " warning" : "0 warnings")
  };
}

// ---------------------------------------------------------------------------
// Inconsistency banner
// ---------------------------------------------------------------------------

function showInconsistency(reason) {
  const panel = $("#error-panel");
  panel.replaceChildren();
  const heading = document.createElement("strong");
  heading.textContent = "Workflow evidence is incomplete or inconsistent";
  const detail = document.createElement("p");
  detail.textContent = escapeText(reason);
  panel.append(heading, detail);
  panel.classList.remove("hidden");
}

function showError(message) {
  const panel = $("#error-panel");
  panel.textContent = escapeText(message);
  panel.classList.remove("hidden");
}

// ---------------------------------------------------------------------------
// Config scope rendering (Evidence tab — inside <details>)
// ---------------------------------------------------------------------------

const CATEGORY_LABELS = {
  provider: "Provider",
  consumer: "Consumer",
  documentation: "Documentation",
  tests: "Tests",
};

function renderScopeSummaryBadge(payload) {
  const badge = $("#scope-summary-badge");
  if (!badge) return;
  badge.className = "scope-summary-badge " +
    (!payload.available ? "config-unavailable-badge" :
     payload.valid ? "config-valid" : "config-invalid");
  badge.textContent = !payload.available ? "unavailable" :
                      payload.valid ? "VALID" : "INVALID";
}

function renderScopeBody(payload) {
  const body = $("#config-scope-body");
  if (!body) return;

  if (!payload.available) {
    const msg = document.createElement("p");
    msg.className = "config-unavailable";
    msg.textContent = "\u2298  Configuration scope unavailable.";
    const hint = document.createElement("p");
    hint.className = "explanation";
    hint.textContent =
      "contractrescue.json could not be read or is not valid JSON. " +
      "Run: npm run contractrescue:validate";
    body.replaceChildren(msg, hint);
    return;
  }

  const fragments = [];

  // Compact summary line: categories · paths · personas
  const enabledCount = (payload.enabledSources ?? []).length;
  const pathCount = Object.values(payload.sources ?? {})
    .reduce((sum, src) => sum + (Array.isArray(src.paths) ? src.paths.length : 0), 0);
  const personaCount = (payload.enabledPersonas ?? []).length;

  const summary = document.createElement("p");
  summary.className = "config-meta";
  summary.textContent =
    (payload.projectName ?? "(unnamed)") + "  \u00B7  " + payload.configFilename +
    "  \u00B7  " + enabledCount + " source " + (enabledCount === 1 ? "category" : "categories") +
    "  \u00B7  " + pathCount + " configured " + (pathCount === 1 ? "path" : "paths") +
    "  \u00B7  " + personaCount + " " + (personaCount === 1 ? "persona" : "personas");
  fragments.push(summary);

  // Also update the summary badge in the <summary> element
  renderScopeSummaryBadge(payload);

  // Category grid
  const grid = document.createElement("div");
  grid.className = "scope-grid";

  for (const category of ["provider", "consumer", "documentation", "tests"]) {
    const src = payload.sources?.[category];
    if (!src) continue;

    const card = document.createElement("article");
    card.className = "scope-category";

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

    if (!Array.isArray(src.paths) || src.paths.length === 0) {
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
  if ((payload.enabledPersonas ?? []).length > 0) {
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
  if ((payload.errors ?? []).length > 0) {
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
  if ((payload.warnings ?? []).length > 0) {
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

  if ((payload.skippedSources ?? []).length > 0) {
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
}

function fetchConfigScope() {
  fetch("/api/config-scope", { cache: "no-store" })
    .then(async (response) => {
      const payload = await response.json();
      renderScopeSummaryBadge(payload);
      renderScopeBody(payload);
    })
    .catch(() => {
      renderScopeSummaryBadge({ available: false });
      renderScopeBody({ available: false });
    });
}

// ---------------------------------------------------------------------------
// Evidence rendering (filters + cards)
// ---------------------------------------------------------------------------

const sourceLabels = {
  consumer: "Consumer",
  provider: "Provider",
  documentation: "Documentation",
  unit_test: "Unit test"
};

const filterState = { value: "all" };

function renderFilters(evidence) {
  const types = ["all", ...new Set(evidence.map(item => item.sourceType))];
  $("#filters").replaceChildren(...types.map(type => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-button" + (filterState.value === type ? " active" : "");
    button.textContent = type === "all" ? "All sources" : (sourceLabels[type] ?? type);
    button.addEventListener("click", () => {
      filterState.value = type;
      renderFilters(evidence);
      renderEvidenceCards(evidence);
    });
    return button;
  }));
}

function renderEvidenceCards(evidence) {
  const visible = evidence.filter(
    item => filterState.value === "all" || item.sourceType === filterState.value
  );
  const label = $("#evidence-summary-label");
  if (label) label.textContent = "View " + visible.length + " evidence record" + (visible.length === 1 ? "" : "s");

  $("#evidence-list").replaceChildren(...visible.map(item => {
    const article = document.createElement("article");
    article.className = "evidence-card";

    const top = document.createElement("div");
    top.className = "evidence-top";
    const tag = document.createElement("span");
    tag.className = "source-tag " + escapeText(item.sourceType);
    tag.textContent = sourceLabels[item.sourceType] ?? item.sourceType;
    const status = document.createElement("strong");
    status.textContent = item.statusCode ? "HTTP " + item.statusCode : "Observed";
    top.append(tag, status);

    const observation = document.createElement("p");
    observation.textContent = escapeText(item.observation);
    const cite = document.createElement("code");
    cite.textContent = escapeText(item.file) + " :: " + escapeText(item.symbol);
    article.append(top, observation, cite);
    return article;
  }));
}

// ---------------------------------------------------------------------------
// Agreements / contradictions / missing evidence
// ---------------------------------------------------------------------------

function renderAgreements(agreements) {
  const section = $("#agreements-section");
  if (!section) return;
  if (!Array.isArray(agreements) || agreements.length === 0) { section.classList.add("hidden"); return; }
  section.replaceChildren();
  section.classList.remove("hidden");

  const heading = document.createElement("h3");
  heading.className = "evidence-subsection-heading";
  heading.textContent = "Agreements (" + agreements.length + ")";
  section.append(heading);

  const list = document.createElement("ul");
  list.className = "agreement-list";
  for (const item of agreements) {
    const li = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = escapeText(item.contractElement) + " \u2014 agreed: " + escapeText(item.agreedValue);
    const sources = document.createElement("ul");
    sources.className = "agreement-sources";
    for (const s of (item.sources ?? [])) {
      const sli = document.createElement("li");
      sli.textContent = escapeText(s);
      sources.append(sli);
    }
    li.append(title, sources);
    list.append(li);
  }
  section.append(list);
}

function renderContradictions(contradictions) {
  const section = $("#contradictions-section");
  if (!section) return;
  if (!Array.isArray(contradictions) || contradictions.length === 0) { section.classList.add("hidden"); return; }
  section.replaceChildren();
  section.classList.remove("hidden");

  const heading = document.createElement("h3");
  heading.className = "evidence-subsection-heading";
  const blockingCount = contradictions.filter(c => c.blocking).length;
  heading.textContent = "Contradictions (" + contradictions.length +
    (blockingCount > 0 ? " · " + blockingCount + " blocking" : "") + ")";
  section.append(heading);

  const list = document.createElement("ul");
  list.className = "contradiction-list";
  for (const item of contradictions) {
    const li = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = escapeText(item.contractElement);
    if (item.blocking) {
      const pill = document.createElement("span");
      pill.className = "blocking-pill blocking-pill-inline";
      pill.textContent = "blocking";
      title.append(" ", pill);
    }
    const values = document.createElement("p");
    values.className = "contradiction-values";
    values.textContent = (item.observedValues ?? []).map(v => "HTTP " + v.value).join(" vs ");
    li.append(title, values);
    list.append(li);
  }
  section.append(list);
}

function renderMissingEvidence(missing) {
  const section = $("#missing-evidence-section");
  if (!section) return;
  if (!Array.isArray(missing) || missing.length === 0) { section.classList.add("hidden"); return; }
  section.replaceChildren();
  section.classList.remove("hidden");

  const heading = document.createElement("h3");
  heading.className = "evidence-subsection-heading";
  heading.textContent = "Missing evidence (" + missing.length + ")";
  section.append(heading);

  const list = document.createElement("ul");
  list.className = "missing-evidence-list";
  for (const item of missing) {
    const li = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = escapeText(item.contractElement);
    const exp = document.createElement("p");
    exp.className = "explanation";
    exp.textContent = escapeText(item.explanation);
    li.append(title, exp);
    list.append(li);
  }
  section.append(list);
}

// ---------------------------------------------------------------------------
// Decision summary — concise completed-run view
// Shown when decision === "approved" and verification is present.
// ---------------------------------------------------------------------------

function renderDecisionSummary(analysis, decision, verification) {
  const container = $("#decision-summary");
  if (!container) return;
  container.replaceChildren();

  const conflict    = (analysis.contradictions ?? [])[0] ?? null;
  const preStatus   = conflict
    ? (conflict.observedValues ?? []).find(v => v.sources?.some(s => s.startsWith("provider")))?.value ?? 400
    : 400;
  const postStatus  = decision.approvedContract?.statusCode ?? 409;
  const verdictWarn = verification?.warningCriteria > 0;

  // ── Header: title + run badge ──
  const header = document.createElement("div");
  header.className = "decision-summary-header";

  const titleWrap = document.createElement("div");
  const title = document.createElement("h2");
  title.className = "decision-summary-title";
  title.textContent = "Completed case \u00B7 Historical workflow record";
  const sub = document.createElement("p");
  sub.className = "explanation";
  sub.style.margin = "0";
  sub.textContent = escapeText(analysis.endpoint?.method) + " " +
    escapeText(analysis.endpoint?.path) + " \u00B7 " +
    escapeText(analysis.endpoint?.scenario);
  titleWrap.append(title, sub);

  const badge = document.createElement("span");
  badge.className = "decision-run-badge";
  badge.textContent = escapeText(analysis.analysisId);

  header.append(titleWrap, badge);
  container.append(header);

  // ── Progression: HTTP 400 → HTTP 409 → Verified ──
  const progSection = document.createElement("div");
  progSection.className = "decision-summary-section";

  const progLabel = document.createElement("span");
  progLabel.className = "decision-summary-label";
  progLabel.textContent = "Outcome progression";
  progSection.append(progLabel);

  const progRow = document.createElement("div");
  progRow.className = "progression-row";
  progRow.setAttribute("aria-label",
    "Pre-repair HTTP " + preStatus + " repaired to HTTP " + postStatus + " then verified");

  function makeProgStep(valueText, labelText, cls) {
    const step = document.createElement("div");
    step.className = "prog-step";
    const val = document.createElement("span");
    val.className = "prog-value " + cls;
    val.textContent = valueText;
    const lbl = document.createElement("span");
    lbl.className = "prog-label";
    lbl.textContent = labelText;
    step.append(val, lbl);
    return step;
  }
  function makeArrow() {
    const a = document.createElement("span");
    a.className = "prog-arrow";
    a.setAttribute("aria-hidden", "true");
    a.textContent = "\u2192";
    return a;
  }

  progRow.append(
    makeProgStep("HTTP " + preStatus, "Pre-repair observation", "pre"),
    makeArrow(),
    makeProgStep("HTTP " + postStatus, "Approved contract", "post"),
    makeArrow(),
    makeProgStep(verdictWarn ? "Verified\u00B9" : "Verified", "Independent verification", "done")
  );
  if (verdictWarn) {
    const warn = document.createElement("p");
    warn.style.cssText = "margin:6px 0 0; font-size:12px; color:var(--muted);";
    warn.textContent = "\u00B9 " + escapeText(String(verification.passedCriteria ?? 0)) +
      " pass \u00B7 " + escapeText(String(verification.warningCriteria ?? 0)) + " warning";
    progSection.append(progRow, warn);
  } else {
    progSection.append(progRow);
  }
  container.append(progSection);

  // ── Four-row source comparison table ──
  const tableSection = document.createElement("div");
  tableSection.className = "decision-summary-section";

  const tableLabel = document.createElement("span");
  tableLabel.className = "decision-summary-label";
  tableLabel.textContent = "What Bob found";
  tableSection.append(tableLabel);

  const table = document.createElement("table");
  table.className = "source-comparison";
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const col of ["Source", "HTTP status", "Note"]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = col;
    headerRow.append(th);
  }
  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement("tbody");
  const rows = [
    { tagClass: "docs",         tag: "Documentation",      statusCls: "post", status: postStatus, note: "API contract specifies HTTP " + postStatus },
    { tagClass: "frontend",     tag: "Frontend consumer",  statusCls: "post", status: postStatus, note: "DUPLICATE_RESERVATION_STATUS constant = " + postStatus },
    { tagClass: "backend-pre",  tag: "Backend (pre-repair)", statusCls: "pre",  status: preStatus,  note: "Returned HTTP " + preStatus + " before repair \u2014 not current behavior" },
    { tagClass: "backend-post", tag: "Backend (post-repair)", statusCls: "post", status: postStatus, note: "Returns HTTP " + postStatus + " after approved repair" },
  ];
  for (const row of rows) {
    const tr = document.createElement("tr");

    const tdTag = document.createElement("td");
    const tagSpan = document.createElement("span");
    tagSpan.className = "source-tag-cell " + row.tagClass;
    tagSpan.textContent = row.tag;
    tdTag.append(tagSpan);

    const tdStatus = document.createElement("td");
    tdStatus.className = "source-status-cell " + row.statusCls;
    tdStatus.textContent = "HTTP " + row.status;

    const tdNote = document.createElement("td");
    tdNote.className = "source-note-cell";
    tdNote.textContent = row.note;

    tr.append(tdTag, tdStatus, tdNote);
    tbody.append(tr);
  }
  table.append(tbody);
  tableSection.append(table);
  container.append(tableSection);

  // ── Why Bob recommended (collapsed details) ──
  if (conflict) {
    const whyDetails = document.createElement("details");
    whyDetails.className = "why-details";

    const whySummary = document.createElement("summary");
    const arrowSpan = document.createElement("span");
    arrowSpan.setAttribute("aria-hidden", "true");
    arrowSpan.textContent = "\u25B8";
    const whySummaryText = document.createTextNode(
      " Why Bob recommended HTTP " + postStatus
    );
    whySummary.append(arrowSpan, whySummaryText);
    whyDetails.append(whySummary);

    const whyBody = document.createElement("div");
    whyBody.className = "why-details-body";

    const contExp = document.createElement("p");
    contExp.textContent = escapeText(conflict.explanation);
    whyBody.append(contExp);

    const rationale = analysis.recommendation?.rationale;
    if (rationale) {
      const ratEl = document.createElement("p");
      ratEl.textContent = escapeText(rationale);
      whyBody.append(ratEl);
    }
    whyDetails.append(whyBody);
    container.append(whyDetails);
  }

  // ── Human decision (read-only approved state) ──
  const decisionSection = document.createElement("div");
  decisionSection.className = "decision-summary-section";
  decisionSection.style.marginTop = "20px";

  const decLabel = document.createElement("span");
  decLabel.className = "decision-summary-label";
  decLabel.textContent = "Human decision";
  decisionSection.append(decLabel);

  const approvedBadge = document.createElement("div");
  approvedBadge.className = "approved-badge";
  approvedBadge.setAttribute("aria-label", "Decision: approved");
  const badgeMark = document.createElement("span");
  badgeMark.setAttribute("aria-hidden", "true");
  badgeMark.textContent = "\u2713 ";
  const badgeText = document.createElement("span");
  badgeText.textContent = "Approved";
  approvedBadge.append(badgeMark, badgeText);
  decisionSection.append(approvedBadge);

  const items = document.createElement("div");
  items.className = "summary-items";
  const fields = [
    ["Decision ID",       escapeText(decision.decisionId)],
    ["Approved by",       escapeText(decision.approvedBy)],
    ["Approved at",       escapeText(decision.approvedAt)],
    ["Approved contract", "HTTP " + escapeText(String(decision.approvedContract?.statusCode ?? ""))],
  ];
  for (const [lbl, val] of fields) {
    const item = document.createElement("div");
    item.className = "summary-item";
    const lSpan = document.createElement("span");
    lSpan.className = "summary-item-label";
    lSpan.textContent = lbl;
    const vSpan = document.createElement("span");
    vSpan.className = "summary-item-value";
    vSpan.textContent = val;
    item.append(lSpan, vSpan);
    items.append(item);
  }
  decisionSection.append(items);

  const authNote = document.createElement("p");
  authNote.className = "notice approved-notice";
  authNote.style.marginTop = "14px";
  authNote.textContent = "The recorded decision (" +
    escapeText(decision.decisionId) +
    ") authorized the subsequent repair. Bob cannot edit files from the browser.";
  decisionSection.append(authNote);
  container.append(decisionSection);

  // ── Nav buttons ──
  const navSection = document.createElement("div");
  navSection.className = "decision-summary-section";
  navSection.style.marginTop = "20px";

  const navLabel = document.createElement("span");
  navLabel.className = "decision-summary-label";
  navLabel.textContent = "Explore further";
  navSection.append(navLabel);

  const navRow = document.createElement("div");
  navRow.className = "decision-nav-row";

  const evBtn = document.createElement("button");
  evBtn.type = "button";
  evBtn.className = "nav-tab-button";
  evBtn.textContent = "View Evidence \u2192";
  evBtn.addEventListener("click", () => {
    activateTab("tab-evidence");
    document.getElementById("tab-evidence").focus();
  });

  const auBtn = document.createElement("button");
  auBtn.type = "button";
  auBtn.className = "nav-tab-button";
  auBtn.textContent = "View Audit Trail \u2192";
  auBtn.addEventListener("click", () => {
    activateTab("tab-audit");
    document.getElementById("tab-audit").focus();
  });

  navRow.append(evBtn, auBtn);
  navSection.append(navRow);
  container.append(navSection);

  // Show summary, hide full view
  container.classList.remove("hidden");
}

// ---------------------------------------------------------------------------
// Conflict (Decision tab)
// ---------------------------------------------------------------------------

function renderConflict(conflict) {
  setText("#conflict-title", conflict.contractElement);
  setText("#conflict-explanation", conflict.explanation);

  // Pre-repair observation note below the values
  const observedValues = conflict.observedValues ?? [];

  $("#conflict-values").replaceChildren(...observedValues.map((entry, index) => {
    const card = document.createElement("article");
    card.className = "value-card " + (index === 0 ? "recommended" : "divergent");

    const value = document.createElement("strong");
    value.textContent = "HTTP " + entry.value;

    const sources = document.createElement("ul");
    for (const source of (entry.sources ?? [])) {
      const item = document.createElement("li");
      item.textContent = escapeText(source);
      sources.append(item);
    }
    card.append(value, sources);
    return card;
  }));
}

// ---------------------------------------------------------------------------
// Decision gate rendering
// ---------------------------------------------------------------------------

const approvalState = { analysis: null };

function renderApprovalForm(analysis) {
  const gate = $("#decision-gate");
  gate.replaceChildren();

  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Human decision gate";

  const heading = document.createElement("h2");
  heading.textContent = "Authorize the contract";

  const awaitingNote = document.createElement("p");
  awaitingNote.className = "notice";
  awaitingNote.textContent = "Bob cannot edit the application until you approve.";

  // Status select
  const selectLabel = document.createElement("label");
  selectLabel.setAttribute("for", "decision-value");
  selectLabel.className = "form-label";
  selectLabel.textContent = "Authoritative HTTP status";

  const select = document.createElement("select");
  select.id = "decision-value";

  const statuses = [...new Set(
    (analysis.contradictions ?? []).flatMap(c => (c.observedValues ?? []).map(v => v.value))
  )];
  for (const status of statuses) {
    const option = document.createElement("option");
    option.value = String(status);
    option.textContent = "HTTP " + status +
      (status === analysis.recommendation?.proposedValue ? " \u2014 Bob recommendation" : " \u2014 retain current behavior");
    option.selected = status === analysis.recommendation?.proposedValue;
    select.append(option);
  }

  // Approver name
  const approverLabel = document.createElement("label");
  approverLabel.setAttribute("for", "approver");
  approverLabel.className = "form-label";
  approverLabel.textContent = "Approving developer";

  const approverInput = document.createElement("input");
  approverInput.id = "approver";
  approverInput.type = "text";
  approverInput.maxLength = 80;
  approverInput.autocomplete = "name";
  approverInput.placeholder = "Enter your name";

  // Acknowledgement
  const checkLabel = document.createElement("label");
  checkLabel.className = "checkbox-row";
  const checkbox = document.createElement("input");
  checkbox.id = "acknowledgement";
  checkbox.type = "checkbox";
  const checkSpan = document.createElement("span");
  const checkTextBefore = document.createTextNode("I reviewed the evidence and authorize Bob to implement HTTP ");
  const approvalValue = document.createElement("strong");
  approvalValue.id = "approval-value";
  approvalValue.textContent = select.value;
  const checkTextAfter = document.createTextNode(".");
  checkSpan.append(checkTextBefore, approvalValue, checkTextAfter);
  checkLabel.append(checkbox, checkSpan);

  // Button
  const approveButton = document.createElement("button");
  approveButton.id = "approve-button";
  approveButton.type = "button";
  approveButton.disabled = true;
  approveButton.textContent = "Approve contract decision";

  // Message
  const message = document.createElement("p");
  message.id = "decision-message";
  message.className = "decision-message";
  message.setAttribute("aria-live", "polite");

  gate.append(eyebrow, heading, awaitingNote, selectLabel, select, approverLabel, approverInput, checkLabel, approveButton, message);

  // Wire up form interactions
  function updateApprovalState() {
    approveButton.disabled = !checkbox.checked || approverInput.value.trim().length < 2;
  }

  approverInput.addEventListener("input", updateApprovalState);
  checkbox.addEventListener("change", updateApprovalState);
  select.addEventListener("change", () => {
    approvalValue.textContent = select.value;
  });

  approveButton.addEventListener("click", async () => {
    approveButton.disabled = true;
    approveButton.textContent = "Recording decision\u2026";
    message.textContent = "";
    message.classList.remove("success");

    try {
      const resp = await fetch("/api/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          analysisId: approvalState.analysis.analysisId,
          decision: "approve",
          approvedStatus: Number(select.value),
          approvedBy: approverInput.value.trim()
        })
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(escapeText(result.error ?? "Approval failed."));
      message.textContent = "Decision " + escapeText(result.decisionId) +
        " recorded. Bob may proceed under the listed constraints.";
      message.classList.add("success");
      approveButton.textContent = "Contract approved";
      approverInput.disabled = true;
      checkbox.disabled = true;
    } catch (err) {
      message.textContent = escapeText(err.message);
      approveButton.textContent = "Approve contract decision";
      updateApprovalState();
    }
  });
}

function renderApprovedState(decision) {
  const gate = $("#decision-gate");
  gate.replaceChildren();

  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Human decision gate";

  const approvedBadge = document.createElement("div");
  approvedBadge.className = "approved-badge";
  approvedBadge.setAttribute("aria-label", "Decision: approved");
  const badgeMark = document.createElement("span");
  badgeMark.setAttribute("aria-hidden", "true");
  badgeMark.textContent = "\u2713 ";
  const badgeText = document.createElement("span");
  badgeText.textContent = "Approved";
  approvedBadge.append(badgeMark, badgeText);

  // Decision details table
  const dl = document.createElement("dl");
  dl.className = "decision-details";

  const fields = [
    ["Decision ID",       escapeText(decision.decisionId)],
    ["Approved by",       escapeText(decision.approvedBy)],
    ["Approved at",       escapeText(decision.approvedAt)],
    ["Approved contract", "HTTP " + escapeText(String(decision.approvedContract?.statusCode ?? ""))],
  ];

  for (const [label, value] of fields) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.append(dt, dd);
  }

  const authNote = document.createElement("p");
  authNote.className = "notice approved-notice";
  const noteText = document.createTextNode(
    "The recorded decision (" + escapeText(decision.decisionId) +
    ") authorized the subsequent repair. Bob cannot edit files from the browser."
  );
  authNote.append(noteText);

  gate.append(eyebrow, approvedBadge, dl, authNote);
}

function renderDecisionGate(analysis, decision) {
  if (decision !== null && decision.decision === "approved") {
    renderApprovedState(decision);
  } else {
    approvalState.analysis = analysis;
    renderApprovalForm(analysis);
  }
}

// ---------------------------------------------------------------------------
// Audit trail rendering
// ---------------------------------------------------------------------------

function makeAuditStep(state, title, artifactId, result, timestamp) {
  // state: "complete" | "pending" | "warning"
  const li = document.createElement("li");
  li.className = "audit-step audit-step-" + state;

  const marker = document.createElement("span");
  marker.className = "audit-marker";
  marker.setAttribute("aria-hidden", "true");
  marker.textContent = state === "complete" ? "\u2713" :
                       state === "warning"  ? "\u26A0" : "\u25CB";

  const body = document.createElement("div");
  body.className = "audit-body";

  const titleEl = document.createElement("strong");
  titleEl.textContent = escapeText(title);

  const meta = document.createElement("span");
  meta.className = "audit-meta";

  const parts = [];
  if (artifactId) parts.push(escapeText(artifactId));
  if (result)     parts.push(escapeText(result));
  if (timestamp)  parts.push(escapeText(timestamp));
  meta.textContent = parts.join(" \u00B7 ");

  body.append(titleEl, meta);
  li.append(marker, body);
  return li;
}

function renderAuditTrail(analysis, decision, verification) {
  const timeline = $("#audit-timeline");
  if (!timeline) return;
  timeline.replaceChildren();

  const decisionPresent = decision !== null;
  const verPresent = verification !== null;

  // Step 1: Evidence investigated
  const evidenceCount = (analysis.evidence ?? []).length;
  const contCount = (analysis.contradictions ?? []).length;
  const agreeCount = (analysis.agreements ?? []).length;
  timeline.append(makeAuditStep(
    "complete",
    "Evidence investigated",
    escapeText(analysis.analysisId),
    evidenceCount + " evidence records · " + contCount + " contradiction" +
      (contCount !== 1 ? "s" : "") + " · " + agreeCount + " agreement" + (agreeCount !== 1 ? "s" : ""),
    null
  ));

  // Step 2: Contradiction identified
  const firstConflict = (analysis.contradictions ?? [])[0];
  if (firstConflict) {
    const vals = (firstConflict.observedValues ?? []).map(v => "HTTP " + v.value).join(" vs ");
    timeline.append(makeAuditStep(
      "complete",
      "Contradiction identified",
      escapeText(analysis.analysisId),
      escapeText(firstConflict.contractElement) + " · blocking · " + vals,
      null
    ));
  }

  // Step 3: Human decision recorded
  if (decisionPresent) {
    timeline.append(makeAuditStep(
      "complete",
      "Human decision recorded",
      escapeText(decision.decisionId),
      "approved by " + escapeText(decision.approvedBy) + " · HTTP " +
        escapeText(String(decision.approvedContract?.statusCode ?? "")),
      escapeText(decision.approvedAt)
    ));
  } else {
    timeline.append(makeAuditStep("pending", "Human decision recorded", null, "pending", null));
  }

  // Step 4: Decision-bound RED test failed as expected
  if (verPresent) {
    const pr = verification.preRepair;
    timeline.append(makeAuditStep(
      "complete",
      "Decision-bound RED test failed as expected",
      escapeText(verification.verificationId),
      "expected HTTP " + escapeText(String(pr.expectedStatus ?? "")) +
        " · observed HTTP " + escapeText(String(pr.observedStatus ?? "")) +
        " · pass " + escapeText(String(pr.runnerSummary?.pass ?? 0)) +
        " · fail " + escapeText(String(pr.runnerSummary?.fail ?? 0)),
      null
    ));
  } else {
    timeline.append(makeAuditStep("pending", "Decision-bound RED test failed as expected", null, "pending", null));
  }

  // Step 5: Approved repair applied
  if (verPresent) {
    const po = verification.postRepair;
    const files = (po.implementationFilesChanged ?? []).join(", ");
    const commitHash = verification.repairCommit?.hash
      ? escapeText(verification.repairCommit.hash.slice(0, 8))
      : null;
    timeline.append(makeAuditStep(
      "complete",
      "Approved repair applied",
      commitHash ? "commit " + commitHash : null,
      (files || "implementation files modified") +
        " · observed HTTP " + escapeText(String(po.observedStatus ?? "")),
      null
    ));
  } else {
    timeline.append(makeAuditStep("pending", "Approved repair applied", null, "pending", null));
  }

  // Step 6: GREEN verification passed — all required commands passed
  if (verPresent) {
    const ft = verification.freshTestResults;
    const contractResult = ft.existingContractSuite
      ? "contract " + ft.existingContractSuite.pass + " pass · " + ft.existingContractSuite.fail + " fail"
      : null;
    const unitResult = ft.unitSuite
      ? "unit " + ft.unitSuite.pass + " pass · " + ft.unitSuite.fail + " fail"
      : null;
    const resultStr = [contractResult, unitResult].filter(Boolean).join(" · ");
    timeline.append(makeAuditStep(
      "complete",
      "All required commands passed (GREEN)",
      escapeText(verification.verificationId),
      resultStr || "all commands passed",
      null
    ));
  } else {
    timeline.append(makeAuditStep("pending", "All required commands passed (GREEN)", null, "pending", null));
  }

  // Step 7: Independent verification completed
  if (verPresent) {
    const warn = Number(verification.warningCriteria ?? 0);
    const stepState = warn > 0 ? "warning" : "complete";
    timeline.append(makeAuditStep(
      stepState,
      "Independent verification completed",
      escapeText(verification.verificationId),
      escapeText(verification.verdict) + " · " +
        escapeText(String(verification.passedCriteria ?? 0)) + " pass · " +
        escapeText(String(verification.failedCriteria ?? 0)) + " fail · " +
        warn + " warning",
      null
    ));
  } else {
    timeline.append(makeAuditStep("pending", "Independent verification completed", null, "not yet performed", null));
  }
}

// ---------------------------------------------------------------------------
// Main analysis render (Decision tab + Evidence tab setup)
// ---------------------------------------------------------------------------

function renderAnalysis(analysis) {
  setText("#analysis-id", analysis.analysisId);
  setText("#endpoint",
    escapeText(analysis.endpoint?.method) + " " + escapeText(analysis.endpoint?.path));
  setText("#scenario", analysis.endpoint?.scenario);
  setText("#evidence-count", String((analysis.evidence ?? []).length));
  const confidence = analysis.recommendation?.confidence ?? "";
  setText("#confidence", confidence.charAt(0).toUpperCase() + confidence.slice(1));
  setText("#recommended-value", String(analysis.recommendation?.proposedValue ?? ""));
  setText("#recommendation-rationale", analysis.recommendation?.rationale);

  if ((analysis.contradictions ?? []).length > 0) {
    renderConflict(analysis.contradictions[0]);
  }

  filterState.value = "all";
  renderFilters(analysis.evidence ?? []);
  renderEvidenceCards(analysis.evidence ?? []);
  renderAgreements(analysis.agreements);
  renderContradictions(analysis.contradictions);
  renderMissingEvidence(analysis.missingEvidence);
}

// ---------------------------------------------------------------------------
// Bootstrap — fetch all three artifacts, derive lifecycle, render
// ---------------------------------------------------------------------------

async function bootstrap() {
  // Fetch all three concurrently; 404 is a valid "absent" state for decision and verification.
  const [analysisResp, decisionResp, verificationResp] = await Promise.all([
    fetch("/api/analysis",      { cache: "no-store" }),
    fetch("/api/decision",      { cache: "no-store" }),
    fetch("/api/verification",  { cache: "no-store" })
  ]);

  // Analysis is required; surface error and stop if absent.
  if (!analysisResp.ok) {
    const payload = await analysisResp.json().catch(() => ({}));
    showError(escapeText(payload.error ?? "No Bob analysis found. Run the ContractRescue workflow first."));
    return;
  }

  let analysis, decision = null, verification = null;

  try { analysis = await analysisResp.json(); } catch {
    showError("Analysis response could not be parsed.");
    return;
  }

  if (decisionResp.ok) {
    try { decision = await decisionResp.json(); } catch {
      showInconsistency("approved-decision.json could not be parsed.");
      return;
    }
  }

  if (verificationResp.ok) {
    try { verification = await verificationResp.json(); } catch {
      showInconsistency("verification-report.json could not be parsed.");
      return;
    }
  }

  // Derive lifecycle
  const lifecycle = deriveLifecycle(analysis, decision, verification);

  if (lifecycle.inconsistent) {
    showInconsistency(lifecycle.reason);
    return;
  }

  // Update hero
  setText("#workflow-status", lifecycle.label);
  if (lifecycle.sublabel) {
    setText("#workflow-substatus", lifecycle.sublabel);
  }

  // Render all panels
  renderAnalysis(analysis);
  renderAuditTrail(analysis, decision, verification);

  // Decision tab: show concise summary for approved+verified, full view otherwise
  const isApprovedAndVerified =
    decision !== null &&
    decision.decision === "approved" &&
    verification !== null;

  if (isApprovedAndVerified) {
    renderDecisionSummary(analysis, decision, verification);
    // #decision-full stays hidden; #decision-summary shown by renderDecisionSummary
  } else {
    renderDecisionGate(analysis, decision);
    const fullEl = $("#decision-full");
    if (fullEl) fullEl.classList.remove("hidden");
  }

  // Show main content and initialize tabs
  $("#main-content").classList.remove("hidden");
  initTabs();

  // Config scope (Evidence tab) — independent fetch, does not block main render
  fetchConfigScope();
}

bootstrap().catch(() => {
  showError("An unexpected error occurred while loading the dashboard.");
});
