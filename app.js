const state = {
  index: null,
  package: null,
  caseKey: null,
  view: "overview",
  sourceOpener: null,
};

const roleLabels = {
  diagnostic_hypothesis: "Diagnostic hypotheses",
  complication: "Complications and clinical syndromes",
  concurrent_condition: "Concurrent conditions",
  incidental_finding: "Incidental findings",
  data_quality_issue: "Data quality and representativeness",
};

const narrativeLabels = {
  context: "Clinical context",
  differential: "Differential diagnosis",
  hypothesis: "Hypotheses and diagnoses",
  evidence: "Evidence comparison",
  action: "Questions and next steps",
  critic: "Independent critique",
  conclusion: "Conclusion and revision criteria",
};

const priorityLabels = {
  critical: "Urgent priority",
  high: "High priority",
  medium: "Medium priority",
  conditional: "When clinically indicated",
};

const necessityLabels = {
  classification_exclusion_required: "Required classification exclusion",
  key_discriminator: "Key discriminating test",
  conditional_adjunct: "Conditional adjunct",
  urgent_if_triggered: "Urgent if trigger is present",
};

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, String(value));
  }
  const items = Array.isArray(children) ? children : [children];
  for (const child of items) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function sectionHead(title, description) {
  return el("header", { class: "section-head" }, [
    el("h2", { text: title }),
    description ? el("p", { text: description }) : null,
  ]);
}

function chip(text) { return el("span", { class: "chip", text }); }

function candidateProjection() { return state.package.projection; }
function candidate() { return candidateProjection().candidate; }

function factMap() {
  return new Map(candidateProjection().facts.map((fact) => [fact.id, fact]));
}

function sourceMap() {
  return new Map(candidateProjection().source_records.map((record) => [record.id, record]));
}

function clinicalValue(fact) {
  const value = fact.value.type === "number" ? String(fact.value.number) : fact.value.text;
  const comparator = fact.comparator && fact.comparator !== "=" ? `${fact.comparator} ` : "";
  return `${comparator}${value}${fact.unit ? ` ${fact.unit}` : ""}`;
}

function highlightText(text, terms) {
  const fragment = document.createDocumentFragment();
  const exact = [...new Set(terms.filter((term) => term && text.toLocaleLowerCase("en").includes(term.toLocaleLowerCase("en"))))]
    .sort((a, b) => b.length - a.length);
  if (!exact.length) {
    fragment.append(text);
    return fragment;
  }
  const escaped = exact.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const lower = new Set(exact.map((term) => term.toLocaleLowerCase("en")));
  for (const part of text.split(regex)) {
    fragment.append(lower.has(part.toLocaleLowerCase("en")) ? el("strong", { text: part }) : document.createTextNode(part));
  }
  return fragment;
}

function hero() {
  const pkg = state.package;
  const projection = candidateProjection();
  const ranked = candidate().hypotheses.filter((item) => item.clinical_role === "diagnostic_hypothesis").sort((a, b) => a.rank - b.rank);
  return el("section", { class: "case-hero" }, [
    el("span", { class: "eyebrow", text: `${pkg.publication.display_case_id} · candidate for clinician review` }),
    el("h1", { text: ranked[0]?.label ?? "Clinical case" }),
    el("p", { class: "hero-summary", text: pkg.reasoning_log.opening_summary }),
    el("div", { class: "status-row" }, [
      chip("Source-pinned translation"),
      chip("Independent critique passed"),
      chip("Clinician decision pending"),
    ]),
    el("div", { class: "metric-row" }, [
      metric(projection.facts.length, "patient facts"),
      metric(ranked.length, "ranked diagnoses"),
      metric(candidate().workup.length, "verification steps"),
      metric(pkg.reasoning_log.source_library.length, "source records"),
    ]),
  ]);
}

function metric(value, label) {
  return el("div", { class: "metric" }, [el("strong", { text: value }), el("span", { text: label })]);
}

function notice() {
  return el("div", { class: "notice" }, [
    el("strong", { text: "Clinical status: " }),
    "This is a translated, read-only candidate reconstruction. It does not establish a confirmed diagnosis or treatment decision.",
  ]);
}

function overviewView() {
  const projection = candidateProjection();
  const hypotheses = candidate().hypotheses;
  const ranked = hypotheses.filter((item) => item.clinical_role === "diagnostic_hypothesis").sort((a, b) => a.rank - b.rank);
  const other = hypotheses.filter((item) => item.clinical_role !== "diagnostic_hypothesis");
  const facts = factMap();
  const leading = ranked[0];
  const support = candidate().relations.filter((relation) => relation.hypothesis_id === leading.id && relation.direction === "support");

  return [
    hero(), notice(),
    sectionHead("Leading working hypothesis", "The rank is a review priority, not a probability score or a confirmed diagnosis."),
    el("div", { class: "grid two" }, [
      hypothesisCard(leading, facts),
      el("article", { class: "card" }, [
        el("span", { class: "eyebrow", text: "Recorded support" }),
        el("h3", { text: `${support.length} supporting relations` }),
        el("p", { text: leading.summary }),
        el("div", { class: "relation-list" }, support.slice(0, 6).map((relation) => relationRow(relation, facts))),
      ]),
    ]),
    sectionHead("Clinical roles outside the ranked differential", "Complications, concurrent conditions, incidental findings, and data-quality issues remain visible without receiving a diagnostic rank."),
    el("div", { class: "grid two" }, other.map((item) => hypothesisCard(item, facts))),
    el("p", { class: "footer-note", text: `Candidate SHA-256: ${state.package.publication.candidate_sha256}` }),
  ];
}

function hypothesisCard(item, facts) {
  const relations = candidate().relations.filter((relation) => relation.hypothesis_id === item.id);
  const heading = el("h3", {}, [item.label, item.rank !== null ? el("span", { class: "rank", text: `#${item.rank}` }) : null]);
  const card = el("article", { class: "card" }, [
    el("span", { class: "eyebrow", text: roleLabels[item.clinical_role] }),
    heading,
    el("p", { text: item.summary }),
    el("div", { class: "chip-row" }, [
      chip(`${relations.filter((r) => r.direction === "support").length} support`),
      chip(`${relations.filter((r) => r.direction === "refute").length} refute`),
      chip(`${relations.filter((r) => r.direction === "neutral").length} neutral`),
    ]),
  ]);
  if (item.missing_evidence.length || item.applicability_limits.length) {
    card.append(el("details", {}, [
      el("summary", { text: "Limitations and missing evidence" }),
      el("ul", {}, [...item.missing_evidence, ...item.applicability_limits].map((text) => el("li", { text }))),
    ]));
  }
  return card;
}

function relationRow(relation, facts) {
  const fact = facts.get(relation.source_id);
  return el("div", { class: "relation" }, [
    el("span", { class: "relation-type", "data-direction": relation.direction, text: relation.direction }),
    el("span", { text: fact?.label ?? relation.source_id }),
    fact ? el("button", { class: "text-button", type: "button", text: "Open record", onclick: (event) => openSource(fact.id, event.currentTarget) }) : null,
  ]);
}

function narrativeView() {
  const log = state.package.reasoning_log;
  const sourceLookup = new Map(log.source_library.map((source) => [source.id, source]));
  return [
    sectionHead(log.title, "A clinician-facing reconstruction from recorded facts, source propositions, diagnostic relations, and the independent critique."),
    notice(),
    el("div", { class: "narrative" }, log.narrative.map((paragraph) => {
      const body = el("p");
      body.append(highlightText(paragraph.text, paragraph.emphasis_terms));
      const actions = [];
      if (paragraph.source_fact_ids.length) {
        actions.push(el("button", {
          class: "text-button",
          type: "button",
          text: paragraph.source_fact_ids.length === 1 ? "Show patient record" : `Show patient records · ${paragraph.source_fact_ids.length}`,
          onclick: (event) => openSourceGroup(paragraph.source_fact_ids, event.currentTarget),
        }));
      }
      const labels = paragraph.evidence_ids.map((id) => sourceLookup.get(id)).filter(Boolean).map((source) => `${source.type_label}${source.year ? ` · ${source.year}` : ""}`);
      if (labels.length) actions.push(...labels.map((label) => chip(label)));
      return el("article", { class: "narrative-block", "data-kind": paragraph.kind }, [
        el("span", { class: "narrative-role", text: narrativeLabels[paragraph.kind] }),
        body,
        actions.length ? el("div", { class: "narrative-citations chip-row" }, actions) : null,
      ]);
    })),
    el("p", { class: "footer-note", text: log.disclaimer }),
  ];
}

function differentialView() {
  const facts = factMap();
  const groups = Object.keys(roleLabels).map((role) => ({
    role,
    items: candidate().hypotheses.filter((item) => item.clinical_role === role).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)),
  })).filter((group) => group.items.length);
  return [
    sectionHead("Differential diagnosis", "Only diagnoses that explain the principal clinical pattern are ranked. Other clinical entities retain their stated role."),
    ...groups.flatMap((group) => [
      el("h2", { text: roleLabels[group.role] }),
      el("div", { class: "grid two" }, group.items.map((item) => {
        const card = hypothesisCard(item, facts);
        const relations = candidate().relations.filter((relation) => relation.hypothesis_id === item.id);
        if (relations.length) card.append(el("details", {}, [
          el("summary", { text: `Patient-fact relations · ${relations.length}` }),
          el("div", { class: "relation-list" }, relations.map((relation) => relationRow(relation, facts))),
        ]));
        return card;
      })),
    ]),
  ];
}

function planView() {
  const sourceLookup = new Map(candidate().external_evidence.map((source) => [source.id, source]));
  return [
    sectionHead("Critical gaps", "Each open question is linked to the candidate diagnoses and any recorded external source support."),
    el("div", { class: "grid two" }, candidate().critical_gaps.map((gap) => el("article", { class: "card" }, [
      el("span", { class: "eyebrow", text: "Critical clinical question" }),
      el("h3", { text: gap.question }),
      el("p", { text: gap.rationale }),
      el("div", { class: "chip-row" }, [
        ...gap.hypothesis_ids.map((id) => chip(id)),
        ...gap.evidence_refs.map((id) => chip(sourceLookup.get(id)?.title ?? id)),
      ]),
    ]))),
    sectionHead("Verification plan", "The steps organize diagnostic verification. They do not constitute treatment instructions."),
    el("div", { class: "grid two" }, candidate().workup.map((item) => el("article", { class: "card" }, [
      el("div", { class: "chip-row" }, [chip(item.id), chip(priorityLabels[item.priority]), chip(necessityLabels[item.necessity])]),
      el("h3", { text: item.label }),
      el("p", { text: item.rationale }),
      item.trigger ? el("p", {}, [el("strong", { text: "Urgency trigger: " }), item.trigger]) : null,
      el("p", { class: "source-meta", text: `Discriminates: ${item.discriminates.join(", ")}` }),
    ]))),
  ];
}

function evidenceView() {
  const sources = state.package.reasoning_log.source_library;
  return [
    sectionHead("Source library", "Sources define diagnostic criteria and verification routes. They do not establish a diagnosis in this patient."),
    el("div", { class: "grid two" }, sources.map((source) => el("article", { class: "card source-card" }, [
      el("div", { class: "chip-row" }, [chip(source.type_label), source.year ? chip(source.year) : null]),
      el("h3", { text: source.title }),
      el("p", { text: source.proposition }),
      el("p", { class: "source-meta", text: source.applicability }),
      el("p", { class: "source-meta", text: source.location }),
      source.url ? el("a", { href: source.url, target: "_blank", rel: "noreferrer", text: "Open publication ↗" }) : null,
    ]))),
  ];
}

function dataView() {
  const projection = candidateProjection();
  const facts = [...projection.facts].sort((a, b) => (a.effective_at ?? "9999").localeCompare(b.effective_at ?? "9999") || a.label.localeCompare(b.label));
  const audit = state.package.reasoning_log.audit;
  return [
    sectionHead("Patient facts", "This table reproduces the translated public-safe fact ledger. Dates, units, and missing values are not inferred."),
    el("div", { class: "data-table-wrap" }, el("table", {}, [
      el("thead", {}, el("tr", {}, ["Date", "Category", "Observation", "Value", "Source"].map((label) => el("th", { text: label })))),
      el("tbody", {}, facts.map((fact) => el("tr", {}, [
        el("td", { text: fact.effective_at ?? "Not recorded" }),
        el("td", { text: fact.category.replaceAll("_", " ") }),
        el("td", { text: fact.label }),
        el("td", { text: clinicalValue(fact) }),
        el("td", {}, el("button", { class: "text-button", type: "button", text: "Open", onclick: (event) => openSource(fact.id, event.currentTarget) })),
      ]))),
    ])),
    sectionHead("Projection receipt", "Technical verification and clinician acceptance are reported separately."),
    el("dl", { class: "card receipt" }, [
      receipt("Public case", state.package.publication.display_case_id),
      receipt("Candidate SHA-256", state.package.publication.candidate_sha256),
      receipt("Clinical input SHA-256", projection.clinical_input_sha256),
      receipt("Source document SHA-256", projection.provenance.source_document_sha256),
      receipt("Projection verified", audit.projection_verified ? "Passed" : "Not passed"),
      receipt("Independent critique", projection.review_status.critic_pass ? "Passed" : "Not passed"),
      receipt("Clinician decision", projection.review_status.clinician_accepted ? "Recorded" : "Not yet recorded"),
      receipt("Model calls", audit.model_calls),
    ]),
    el("p", { class: "footer-note", text: "English presentation translation. Clinical claims, ranks, relations, workup, gaps, source identity, and clinician status remain tied to the source candidate." }),
  ];
}

function receipt(label, value) {
  return el("div", {}, [el("dt", { text: label }), el("dd", { text: value })]);
}

function openSource(factId, opener) {
  openSourceGroup([factId], opener);
}

function openSourceGroup(factIds, opener) {
  const facts = factMap();
  const records = sourceMap();
  const body = document.getElementById("source-dialog-body");
  body.replaceChildren();
  for (const factId of factIds) {
    const fact = facts.get(factId);
    if (!fact) continue;
    const record = records.get(fact.source_record_ids[0]);
    body.append(el("article", { class: "card" }, [
      el("span", { class: "eyebrow", text: fact.id }),
      el("h3", { text: fact.label }),
      el("p", {}, [el("strong", { text: "Recorded value: " }), clinicalValue(fact)]),
      record ? el("p", { class: "source-literal", text: record.literal }) : null,
      record ? el("p", { class: "source-meta", text: `${record.locator.part} · paragraph ${record.locator.paragraph_index}${record.effective_at ? ` · ${record.effective_at}` : ""}` }) : null,
    ]));
  }
  state.sourceOpener = opener;
  document.getElementById("source-dialog").showModal();
}

function closeSource() {
  document.getElementById("source-dialog").close();
  state.sourceOpener?.focus();
}

function render() {
  const main = document.getElementById("main");
  const views = { overview: overviewView, narrative: narrativeView, differential: differentialView, plan: planView, evidence: evidenceView, data: dataView };
  main.replaceChildren(...views[state.view]());
  for (const button of document.querySelectorAll("[data-view]")) {
    button.setAttribute("aria-current", button.dataset.view === state.view ? "page" : "false");
  }
  document.title = `${state.package.publication.display_case_id} · HematoBoard English Clinical Projection`;
  main.focus({ preventScroll: true });
}

async function loadCase(caseKey) {
  const entry = state.index.cases.find((item) => item.key === caseKey) ?? state.index.cases[0];
  const response = await fetch(entry.data_path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load ${entry.case_id}.`);
  const pkg = await response.json();
  if (pkg.publication.display_case_id !== entry.case_id || pkg.projection.review_status.clinician_accepted !== false) {
    throw new Error(`The public package for ${entry.case_id} failed its identity or review-status check.`);
  }
  state.caseKey = entry.key;
  state.package = pkg;
  document.getElementById("case-select").value = entry.key;
  const url = new URL(window.location.href);
  url.searchParams.set("case", entry.key);
  history.replaceState({}, "", url);
  render();
}

async function start() {
  try {
    const response = await fetch("./data/case-index.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load the case index.");
    state.index = await response.json();
    const select = document.getElementById("case-select");
    for (const item of state.index.cases) select.append(el("option", { value: item.key, text: item.case_id }));
    select.addEventListener("change", () => loadCase(select.value).catch(showError));
    for (const button of document.querySelectorAll("[data-view]")) {
      button.addEventListener("click", () => {
        state.view = button.dataset.view;
        render();
      });
    }
    document.getElementById("source-dialog-close").addEventListener("click", closeSource);
    document.getElementById("source-dialog").addEventListener("cancel", (event) => { event.preventDefault(); closeSource(); });
    const requested = new URLSearchParams(window.location.search).get("case");
    await loadCase(requested);
  } catch (error) {
    showError(error);
  }
}

function showError(error) {
  document.getElementById("main").replaceChildren(el("div", { class: "error", role: "alert", text: error instanceof Error ? error.message : "The clinical projection could not be loaded." }));
}

start();
