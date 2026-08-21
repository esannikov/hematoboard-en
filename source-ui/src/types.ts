export type SourceRecord = {
  id: string;
  kind: string;
  literal: string;
  source_order: number;
  locator: { part: string; paragraph_index: number };
  effective_at: string | null;
  derived_pdf_page: number | null;
};

export type ClinicalFact = {
  id: string;
  source_record_ids: string[];
  source_segment_index: number;
  kind: "demographic" | "statement" | "measurement";
  category: "demographics" | "symptoms_course" | "treatment" | "examination" | "laboratory" | "imaging" | "pathology_procedure" | "other";
  label: string;
  canonical_analyte: string | null;
  component: string | null;
  value: { type: "number"; number: number } | { type: "text"; text: string };
  unit: string | null;
  unit_resolution: null | {
    status: "source_recorded" | "registry_inferred" | "unresolved" | "source_corrupted";
    canonical_unit: string | null;
    display_unit: string | null;
    method: "source_exact" | "deterministic_registry" | "none";
    rule_id: string | null;
    confidence: "exact" | "high" | "unresolved";
    registry_id: string;
  };
  comparator: string | null;
  reference_range: string | null;
  effective_at: string | null;
  date_status: "recorded" | "not_recorded";
  assertion_status: "recorded" | "negative" | "pending" | "source_corrupted";
};

export type ClinicalSignal = {
  id: string;
  kind: "measurement_series";
  visibility: "data_only";
  label: string;
  canonical_analyte: string;
  component: string;
  unit: string | null;
  unit_resolution_statuses?: string[];
  fact_ids: string[];
  readings: Array<{
    fact_id: string;
    value_number: number;
    unit: string | null;
    source_unit?: string | null;
    unit_resolution_status?: string;
    effective_at: string | null;
  }>;
  review_flags: string[];
};

export type DashboardProjection = {
  schema_version: "hematoboard.v2.dashboard-projection/1.1" | "hematoboard.v2.dashboard-projection/1.2";
  case: { id: string; status: "deterministic_projection_only" };
  run_id: string;
  source_records: SourceRecord[];
  facts: ClinicalFact[];
  signals: ClinicalSignal[];
  deferred_source_record_ids: string[];
  capabilities: {
    data: true;
    source_drawer: true;
    overview: false;
    graph: false;
    timeline: false;
    gaps: false;
  };
  provenance: {
    source_document_sha256: string;
    counts: {
      source_records: number;
      facts: number;
      measurement_facts: number;
      context_facts: number;
      signals: number;
      deferred_source_records: number;
    };
  };
};

export type ClinicalRole =
  | "diagnostic_hypothesis"
  | "complication"
  | "concurrent_condition"
  | "incidental_finding"
  | "data_quality_issue";

export type CandidateClinicalItem = {
  id: string;
  label: string;
  short_label: string;
  clinical_role: ClinicalRole;
  role_rationale: string;
  rank: number | null;
  summary: string;
  missing_evidence: string[];
  applicability_limits: string[];
};

export type CandidateSynthesis = {
  schema_version: "hematoboard.v2.candidate-synthesis/1.1";
  case_id: string;
  clinical_input_sha256: string;
  role: "candidate_for_clinician_review";
  decision_readiness: {
    status: "candidate_available" | "insufficient_evidence" | "outside_validated_domain" | "conflicting_evidence";
    rationale: string;
    blocked_actions: string[];
    required_next_information: string[];
  };
  hypotheses: CandidateClinicalItem[];
  relations: Array<{
    source_id: string;
    hypothesis_id: string;
    direction: "support" | "refute" | "neutral";
    rationale: string;
  }>;
  workup: Array<{
    id: string;
    label: string;
    priority: "critical" | "high" | "medium" | "conditional";
    necessity: "classification_exclusion_required" | "key_discriminator" | "conditional_adjunct" | "urgent_if_triggered";
    trigger: string | null;
    rationale: string;
    discriminates: string[];
    evidence_refs: string[];
  }>;
  critical_gaps: Array<{
    id: string;
    question: string;
    rationale: string;
    hypothesis_ids: string[];
    evidence_refs: string[];
  }>;
  external_evidence: Array<{
    id: string;
    source_type: "guideline" | "classification" | "evidence_summary" | "pmid";
    bibliographic_id: string;
    title: string;
    year: number | null;
    location: string;
    proposition: string;
    applicability: string;
    source_sha256: string;
    rights_status: string;
    source_review_route: "text_exact" | "visual_semantic";
    retrieval_ref: string;
  }>;
  limitations: string[];
};

export type CandidateDashboardProjection = {
  schema_version: "hematoboard.v2.candidate-dashboard-projection/1.0";
  case: { id: string; status: "candidate_projection" };
  clinical_run_id: string;
  reasoning_run_id: string;
  clinical_input_sha256: string;
  candidate_sha256: string;
  source_records: SourceRecord[];
  facts: ClinicalFact[];
  signals: ClinicalSignal[];
  deferred_source_record_ids: string[];
  candidate: CandidateSynthesis;
  justification_graph: {
    nodes: Array<{ id: string; kind: "fact" | "signal" | "hypothesis" | "workup" | "gap" | "evidence"; label: string }>;
    edges: Array<{ id: string; source: string; target: string; role: "support" | "refute" | "neutral" | "grounds" | "discriminates" | "limits"; label: string }>;
  };
  capabilities: {
    overview: true;
    timeline: true;
    graph: true;
    data: true;
    gaps: true;
    source_drawer: true;
    clinician_review: false;
  };
  review_status: {
    candidate_only: true;
    critic_pass: true;
    projection_verified: boolean;
    clinician_accepted: false;
  };
  provenance: DashboardProjection["provenance"] & {
    candidate_sha256: string;
    critic_sha256: string;
    graph_counts: { nodes: number; edges: number };
  };
};

export type Projection = DashboardProjection | CandidateDashboardProjection;

export type ClinicianReasoningLog = {
  title: "Clinical history reasoning";
  disclaimer: string;
  reading_time_minutes: number;
  opening_summary: string;
  narrative: Array<{
    id: string;
    kind: "context" | "differential" | "hypothesis" | "evidence" | "action" | "critic" | "conclusion";
    text: string;
    emphasis_terms: string[];
    source_fact_ids: string[];
    evidence_ids: string[];
  }>;
  source_library: Array<{
    id: string;
    type_label: string;
    title: string;
    bibliographic_id: string;
    year: number | null;
    location: string;
    proposition: string;
    applicability: string;
    url: string | null;
  }>;
  audit: {
    synthesis_seconds: number;
    language_revision_seconds: number;
    total_seconds: number;
    model_calls: number;
    critic_attempts: number;
    unresolved_critical: 0;
    unresolved_high: 0;
    language_clean: true;
    projection_verified: true;
    clinician_accepted: false;
  };
};

export type PublicCandidateDashboard = {
  schema_version: "hematoboard.v2.public-candidate-dashboard/1.0";
  publication: {
    display_case_id: string;
    source_case_id: string;
    archived_source_case_id: string | null;
    docx_case_number: number;
    generation: "v2";
    candidate_sha256: string;
  };
  projection: CandidateDashboardProjection;
  reasoning_log: ClinicianReasoningLog;
};

export type PublicCaseIndex = {
  schema_version: "hematoboard.public-case-index/2.0.0";
  cases: Array<{
    key: string;
    case_id: string;
    source_case_id: string;
    data_path: string;
  }>;
};
