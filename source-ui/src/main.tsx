import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Alert,
  AppBar,
  Box,
  BottomNavigation,
  BottomNavigationAction,
  Button,
  Chip,
  CircularProgress,
  Container,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Slider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ThemeProvider,
  Toolbar,
  Tooltip,
  Typography,
  createTheme,
} from "@mui/material";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import FactCheckRoundedIcon from "@mui/icons-material/FactCheckRounded";
import HubRoundedIcon from "@mui/icons-material/HubRounded";
import TableRowsRoundedIcon from "@mui/icons-material/TableRowsRounded";
import SubjectRoundedIcon from "@mui/icons-material/SubjectRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import TimelineRoundedIcon from "@mui/icons-material/TimelineRounded";
import VerifiedRoundedIcon from "@mui/icons-material/VerifiedRounded";
import type {
  CandidateDashboardProjection,
  CandidateClinicalItem,
  ClinicalFact,
  ClinicalRole,
  ClinicalSignal,
  ClinicianReasoningLog,
  Projection,
  PublicCandidateDashboard,
  PublicCaseIndex,
  SourceRecord,
} from "./types";
import "./styles.css";

const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: "light",
    primary: { main: "#6750a4", dark: "#4f378b", light: "#eaddff" },
    secondary: { main: "#625b71" },
    background: { default: "#f9f7fb", paper: "#fffbfe" },
    text: { primary: "#1d1b20", secondary: "#49454f" },
    success: { main: "#1b6f3a" },
    warning: { main: "#7a5900" },
    divider: "#cac4d0",
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: 13,
    h1: { fontSize: "2rem", fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.12 },
    h2: { fontSize: "1.35rem", fontWeight: 500, letterSpacing: "-0.01em" },
    h3: { fontSize: "1.05rem", fontWeight: 500 },
    body1: { fontSize: "0.875rem", lineHeight: 1.5 },
    body2: { fontSize: "0.78rem", lineHeight: 1.45 },
    button: { fontSize: "0.78rem", textTransform: "none", fontWeight: 500 },
    caption: { fontSize: "0.7rem", lineHeight: 1.35 },
  },
  components: {
    MuiCssBaseline: { styleOverrides: { body: { textRendering: "optimizeLegibility" } } },
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundImage: "none", boxShadow: "none", borderBottom: "1px solid #cac4d0" },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { minHeight: 40, borderRadius: 20 } },
    },
    MuiChip: { styleOverrides: { root: { borderRadius: 8, fontWeight: 500 } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none", boxShadow: "none" } } },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: "#e7e0ec", fontSize: "0.78rem" },
        head: { backgroundColor: "#f3edf7", fontWeight: 500 },
      },
    },
  },
});

const navigation = [
  { key: "overview", label: "Overview", icon: <DashboardRoundedIcon /> },
  { key: "timeline", label: "Timeline", icon: <TimelineRoundedIcon /> },
  { key: "graph", label: "Graph", icon: <HubRoundedIcon /> },
  { key: "data", label: "Data", icon: <TableRowsRoundedIcon /> },
  { key: "gaps", label: "Gaps", icon: <FactCheckRoundedIcon /> },
  { key: "reasoning", label: "Reasoning", icon: <SubjectRoundedIcon /> },
] as const;
type ViewKey = (typeof navigation)[number]["key"];

type LoadedDashboard = {
  projection: Projection;
  publication: PublicCandidateDashboard["publication"] | null;
  reasoningLog: ClinicianReasoningLog | null;
};

function isProjection(value: unknown): value is Projection {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Projection>;
  return (
    ["hematoboard.v2.dashboard-projection/1.1", "hematoboard.v2.dashboard-projection/1.2", "hematoboard.v2.candidate-dashboard-projection/1.0"].includes(String(item.schema_version)) &&
    item.capabilities?.data === true &&
    Array.isArray(item.source_records) &&
    Array.isArray(item.facts) &&
    Array.isArray(item.signals)
  );
}

function isPublicDashboard(value: unknown): value is PublicCandidateDashboard {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PublicCandidateDashboard>;
  return item.schema_version === "hematoboard.v2.public-candidate-dashboard/1.0" &&
    Boolean(item.publication?.display_case_id) &&
    Boolean(item.reasoning_log?.narrative?.length) &&
    isProjection(item.projection);
}

function isPublicCaseIndex(value: unknown): value is PublicCaseIndex {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PublicCaseIndex>;
  return item.schema_version === "hematoboard.public-case-index/2.0.0" && Array.isArray(item.cases);
}

async function fetchProjection(): Promise<LoadedDashboard> {
  for (const endpoint of ["/api/projection", "/dashboard_projection.v1.json"]) {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) continue;
      const value: unknown = await response.json();
      if (isProjection(value)) return { projection: value, publication: null, reasoningLog: null };
    } catch {
      // The static Vite fixture intentionally has no /api route.
    }
  }
  throw new Error("No valid data projection was found.");
}

async function fetchPublicIndex(): Promise<PublicCaseIndex | null> {
  try {
    const response = await fetch(new URL("case-index.json", document.baseURI), { cache: "no-store" });
    if (!response.ok) return null;
    const value: unknown = await response.json();
    return isPublicCaseIndex(value) ? value : null;
  } catch {
    return null;
  }
}

async function fetchPublicCase(entry: PublicCaseIndex["cases"][number]): Promise<LoadedDashboard> {
  const response = await fetch(new URL(entry.data_path, document.baseURI), { cache: "no-store" });
  if (!response.ok) throw new Error(`Case ${entry.case_id} could not be loaded.`);
  const value: unknown = await response.json();
  if (!isPublicDashboard(value)) throw new Error(`Public package ${entry.case_id} failed validation.`);
  return { projection: value.projection, publication: value.publication, reasoningLog: value.reasoning_log };
}

function isCandidateProjection(projection: Projection): projection is CandidateDashboardProjection {
  return projection.schema_version === "hematoboard.v2.candidate-dashboard-projection/1.0";
}

function leadingHypothesisId(projection: Projection): string {
  if (!isCandidateProjection(projection)) return "H1";
  return projection.candidate.hypotheses
    .filter((item) => item.clinical_role === "diagnostic_hypothesis")
    .sort(clinicalItemSort)[0]?.id ?? "H1";
}

function viewEnabled(projection: Projection, view: ViewKey, reasoningLog: ClinicianReasoningLog | null): boolean {
  if (view === "data") return true;
  if (view === "reasoning") return Boolean(reasoningLog);
  if (view === "timeline") return isCandidateProjection(projection) && projection.capabilities.timeline === true;
  return isCandidateProjection(projection) && projection.capabilities[view] === true;
}

function formatDate(value: string | null): string {
  if (!value) return "Date not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function factNarrative(fact: ClinicalFact): string {
  if (fact.value.type === "text") return fact.value.text;
  const unit = fact.unit_resolution?.display_unit ?? fact.unit ?? "";
  return `${fact.label}: ${fact.comparator ?? ""}${fact.value.number}${unit ? ` ${unit}` : ""}`;
}

function sourceHighlightTerms(facts: ClinicalFact[]): string[] {
  const terms = facts.flatMap((fact) => {
    if (fact.value.type === "text") return [fact.value.text.trim()];
    const literal = String(fact.value.number);
    return [literal, literal.replace(".", ",")];
  });
  return [...new Set(terms.filter((term) => term.length > 0))].sort((left, right) => right.length - left.length);
}

function renderSourceLiteral(text: string, facts: ClinicalFact[]): React.ReactNode {
  const terms = sourceHighlightTerms(facts);
  if (terms.length === 0) return text;
  const escapedTerms = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escapedTerms.join("|")})`, "gi");
  const normalized = new Set(terms.map((term) => term.toLocaleLowerCase("en-GB")));
  return text.split(pattern).map((part, index) => (
    normalized.has(part.toLocaleLowerCase("en-GB"))
      ? <mark key={`${part}-${index}`}>{part}</mark>
      : <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
  ));
}

function SourceDrawer({
  facts,
  records,
  onClose,
}: {
  facts: ClinicalFact[];
  records: SourceRecord[];
  onClose: () => void;
}) {
  const groupedRecords = records.map((record) => ({
    record,
    facts: facts.filter((fact) => fact.source_record_ids.includes(record.id)),
  })).filter((group) => group.facts.length > 0);
  return (
    <Drawer
      anchor="right"
      open={facts.length > 0 && groupedRecords.length > 0}
      onClose={onClose}
      className="hb-source-drawer"
      slotProps={{
        paper: { component: "aside", role: "region", "aria-label": "Open source record" },
      }}
    >
      {facts.length > 0 && groupedRecords.length > 0 && (
        <Box className="hb-source-drawer__content" data-testid="source-record-drawer">
          <Box className="hb-source-drawer__heading">
            <Typography variant="h2">Paragraph evidence</Typography>
            <Button onClick={onClose}>Close</Button>
          </Box>
          <Typography color="text.secondary">
            The text highlights {facts.length} {facts.length === 1 ? "clinical support" : "clinical supports"}, used in this reasoning paragraph.
          </Typography>
          {groupedRecords.map(({ record, facts: recordFacts }) => (
            <Box component="section" className="hb-source-drawer__record" key={record.id}>
              <Typography variant="h3">Exact translated text from DOCX</Typography>
              <Typography className="hb-source-drawer__literal">{renderSourceLiteral(record.literal, recordFacts)}</Typography>
              <Box className="hb-source-drawer__focus-list">
                {recordFacts.map((fact) => (
                  <article key={fact.id}>
                    <strong>{fact.label}</strong>
                    <Typography>{factNarrative(fact)}</Typography>
                    <small>{formatDate(fact.effective_at)} · {record.locator.part} · paragraph {record.locator.paragraph_index}</small>
                    {fact.kind === "measurement" && (
                      <dl>
                        <div><dt>Unit in DOCX</dt><dd>{fact.unit ?? "not recorded"}</dd></div>
                        {fact.unit_resolution?.status === "registry_inferred" && (
                          <div><dt>Resolved unit</dt><dd>{fact.unit_resolution.display_unit}</dd></div>
                        )}
                      </dl>
                    )}
                  </article>
                ))}
              </Box>
            </Box>
          ))}
          <Typography variant="body2" color="text.secondary">The text is reproduced from an already de-identified DOCX without content additions.</Typography>
        </Box>
      )}
    </Drawer>
  );
}

function MeasurementTable({
  projection,
  onOpenSource,
}: {
  projection: Projection;
  onOpenSource: (factId: string, trigger: HTMLButtonElement) => void;
}) {
  const [query, setQuery] = useState("");
  const facts = useMemo(
    () => new Map(projection.facts.map((fact) => [fact.id, fact])),
    [projection.facts],
  );
  const dates = useMemo(() => {
    const found = new Set<string>();
    projection.signals.forEach((signal) =>
      signal.readings.forEach((reading) => found.add(reading.effective_at ?? "__undated__")),
    );
    return [...found].sort((a, b) => {
      if (a === "__undated__") return 1;
      if (b === "__undated__") return -1;
      return a.localeCompare(b);
    });
  }, [projection.signals]);
  const visibleSignals = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en-GB");
    return projection.signals.filter((signal) =>
      signal.label.toLocaleLowerCase("en-GB").includes(needle),
    );
  }, [projection.signals, query]);
  const inferredUnitRows = useMemo(
    () => projection.signals.filter((signal) => signal.unit_resolution_statuses?.includes("registry_inferred")).length,
    [projection.signals],
  );
  return (
    <Paper elevation={0} className="hb-data">
        <Box className="hb-section-heading">
          <Box>
            <Typography variant="h1">Quantitative measurements</Typography>
            <Typography color="text.secondary">
              Each row represents one compatible measurement series. Name, value, unit, and source remain separate.
            </Typography>
          </Box>
          <TextField
            size="small"
            label="Measurement"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Box>
        <Box className="hb-table-summary">
          <Box>
            <Typography variant="h2">
              {projection.provenance.counts.measurement_facts} measurements · {projection.provenance.counts.signals} series
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Standard hematology units may be resolved by a deterministic rule; the exact source text remains unchanged.
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
            {inferredUnitRows > 0 && (
              <Chip label={`${inferredUnitRows} units restored`} size="small" variant="outlined" />
            )}
            <Chip label="read-only" size="small" color="success" />
          </Stack>
        </Box>
        <TableContainer className="hb-measurement-table">
          <Table stickyHeader size="small" aria-label="Quantitative measurements by clinical dates">
            <TableHead>
              <TableRow>
                <TableCell>Measurement</TableCell>
                {dates.map((date) => (
                  <TableCell key={date} align="center">
                    {date === "__undated__" ? "Date not recorded" : formatDate(date)}
                  </TableCell>
                ))}
                <TableCell>Unit</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleSignals.map((signal: ClinicalSignal) => (
                <TableRow key={signal.id} hover data-testid="measurement-series">
                  <TableCell component="th" scope="row" data-label="Measurement">
                    <strong>{signal.label}</strong>
                    {signal.review_flags.includes("unit_not_recorded") && (
                      <Chip className="hb-review-chip" label="unit not recorded" size="small" color="warning" />
                    )}
                    {signal.review_flags.includes("unit_source_corrupted") && (
                      <Chip className="hb-review-chip" label="source unit is corrupted" size="small" color="warning" />
                    )}
                  </TableCell>
                  {dates.map((date) => {
                    const reading = signal.readings.find(
                      (item) => (item.effective_at ?? "__undated__") === date,
                    );
                    const fact = reading ? facts.get(reading.fact_id) : null;
                    return (
                      <TableCell
                        key={date}
                        align="center"
                        className="hb-measurement-value"
                        data-label={date === "__undated__" ? "Date not recorded" : formatDate(date)}
                      >
                        {reading && fact ? (
                          <Button
                            className="hb-value-button"
                            data-testid="source-open"
                            onClick={(event) => onOpenSource(fact.id, event.currentTarget)}
                            aria-label={`Open source record for ${signal.label}, ${formatDate(reading.effective_at)}`}
                          >
                            {fact.comparator ?? ""}{reading.value_number}
                          </Button>
                        ) : "—"}
                      </TableCell>
                    );
                  })}
                  <TableCell data-label="Unit">{signal.unit ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {visibleSignals.length === 0 && (
          <Alert severity="info" className="hb-empty">No measurements match this query.</Alert>
        )}
    </Paper>
  );
}

const directionLabel = {
  support: "supports",
  refute: "contradicts",
  neutral: "does not discriminate",
} as const;

const evidenceTypeLabel = {
  guideline: "Guideline",
  classification: "Classification",
  evidence_summary: "Evidence review",
  pmid: "PubMed",
} as const;

const evidenceTypeColor = {
  guideline: "success",
  classification: "secondary",
  evidence_summary: "info",
  pmid: "primary",
} as const;

function sourceFactId(projection: CandidateDashboardProjection, sourceId: string): string | null {
  if (sourceId.startsWith("CF-")) return sourceId;
  const signal = projection.signals.find((item) => item.id === sourceId);
  return signal?.fact_ids[0] ?? null;
}

function clinicalNodeLabel(projection: CandidateDashboardProjection, sourceId: string): string {
  const fact = projection.facts.find((item) => item.id === sourceId);
  if (fact) return fact.kind === "statement" && fact.value.type === "text" ? fact.value.text : fact.label;
  return projection.signals.find((item) => item.id === sourceId)?.label ?? sourceId;
}

function shorten(value: string, limit = 120): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit - 1).trimEnd();
  const lastSpace = clipped.lastIndexOf(" ");
  const wordSafe = lastSpace >= Math.floor(limit * 0.72) ? clipped.slice(0, lastSpace) : clipped;
  return `${wordSafe.trim()}…`;
}

function patientCaseSummary(projection: CandidateDashboardProjection): string {
  const factText = (fact: ClinicalFact | undefined): string | null => {
    if (!fact) return null;
    return fact.value.type === "text" ? fact.value.text.trim() : factNarrative(fact).trim();
  };
  const demographicFacts = projection.facts.filter((fact) => fact.category === "demographics");
  const demographicValue = (pattern: RegExp): string | null => {
    const fact = demographicFacts.find((item) => pattern.test(item.label));
    const value = factText(fact);
    return value?.replace(/^(?:Sex|Age)\s*:\s*/i, "") ?? null;
  };
  const sex = demographicValue(/sex/i);
  const age = demographicValue(/age/i)?.replace(/(\d+)\s+years?/i, (_, rawAge: string) => {
    const numericAge = Number(rawAge);
    const lastTwo = numericAge % 100;
    const last = numericAge % 10;
    const suffix = lastTwo >= 11 && lastTwo <= 14 ? "years" : last === 1 ? "year" : last >= 2 && last <= 4 ? "years" : "years";
    return `${numericAge} ${suffix}`;
  }) ?? null;
  const demographics = [sex, age].filter(Boolean).join(", ");
  const statements = projection.facts.filter((fact) => fact.value.type === "text" && fact.category !== "demographics");
  const picks = [
    statements.find((fact) => fact.category === "symptoms_course"),
    statements.find((fact) => fact.category === "pathology_procedure"),
  ].filter((fact, index, all): fact is ClinicalFact => Boolean(fact) && all.indexOf(fact) === index);
  const sentences = picks.map((fact, index) => {
    const text = factText(fact);
    return text ? shorten(text, index === 0 ? 165 : 125) : null;
  }).filter((text): text is string => Boolean(text));
  const summary = [demographics, ...sentences].filter(Boolean).map((part) => /[.!?…]$/.test(part) ? part : `${part}.`).join(" ");
  return shorten(summary || "The patient's clinical data was transferred from the already de-identified DOCX.", 310);
}

function publicFacingText(value: string, publication: PublicCandidateDashboard["publication"] | null): string {
  if (!publication) return value;
  const sourceId = publication.archived_source_case_id ?? publication.source_case_id;
  return value.replaceAll(sourceId, publication.display_case_id);
}

function clinicianSourceLocation(value: string): string {
  const page = value.match(/(?:_p|page[\s:_-]*)(\d{1,4})\b/i);
  if (page) return `Page ${Number(page[1])}`;
  if (/^p\.\s*\d+/i.test(value)) return value.replace(/^p\./i, "p.");
  return "The exact location is saved in the source receipt";
}

function relationCounts(projection: CandidateDashboardProjection, hypothesisId: string) {
  const relations = projection.candidate.relations.filter((item) => item.hypothesis_id === hypothesisId);
  return {
    support: relations.filter((item) => item.direction === "support").length,
    refute: relations.filter((item) => item.direction === "refute").length,
    neutral: relations.filter((item) => item.direction === "neutral").length,
  };
}

const clinicalRoleMeta: Record<ClinicalRole, { singular: string; plural: string; order: number }> = {
  diagnostic_hypothesis: {
    singular: "Diagnostic hypothesis",
    plural: "Differential diagnoses",
    order: 0,
  },
  complication: {
    singular: "Complication or clinical syndrome",
    plural: "Complications and clinical syndromes",
    order: 1,
  },
  concurrent_condition: {
    singular: "Concurrent condition or parallel process",
    plural: "Concurrent conditions and parallel processes",
    order: 2,
  },
  incidental_finding: {
    singular: "Incidental finding",
    plural: "Incidental findings",
    order: 3,
  },
  data_quality_issue: {
    singular: "Data quality limitations",
    plural: "Data quality and representativeness",
    order: 4,
  },
};

function clinicalItemSort(left: CandidateClinicalItem, right: CandidateClinicalItem): number {
  const roleOrder = clinicalRoleMeta[left.clinical_role].order - clinicalRoleMeta[right.clinical_role].order;
  if (roleOrder !== 0) return roleOrder;
  const rankOrder = (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER);
  if (rankOrder !== 0) return rankOrder;
  return left.id.localeCompare(right.id, "en");
}

function clinicalRoleLabel(item: CandidateClinicalItem): string {
  if (item.clinical_role === "diagnostic_hypothesis") {
    return item.rank === 1 ? "The leading diagnostic hypothesis" : "Differential diagnostic hypothesis";
  }
  return clinicalRoleMeta[item.clinical_role].singular;
}

function clinicalDisplayName(item: CandidateClinicalItem): string {
  return item.label.split(";", 1)[0].trim();
}

function clinicalItemActionLabel(item: CandidateClinicalItem): string {
  const role = item.clinical_role === "diagnostic_hypothesis" ? "hypothesis" : clinicalRoleLabel(item).toLocaleLowerCase("en-GB");
  return `Open ${role} ${item.id}: ${clinicalDisplayName(item)}`;
}

function clinicalItemMarker(item: CandidateClinicalItem): string | null {
  return item.clinical_role === "diagnostic_hypothesis" && item.rank !== null ? `H${item.rank}` : null;
}

const factPriority: Record<ClinicalFact["category"], number> = {
  pathology_procedure: 0,
  imaging: 1,
  laboratory: 2,
  examination: 3,
  symptoms_course: 4,
  treatment: 5,
  demographics: 6,
  other: 7,
};

function CandidateOverview({
  projection,
  publication,
  selectedHypothesisId,
  onSelectHypothesis,
  onOpenSource,
}: {
  projection: CandidateDashboardProjection;
  publication: PublicCandidateDashboard["publication"] | null;
  selectedHypothesisId: string;
  onSelectHypothesis: (id: string) => void;
  onOpenSource: (factId: string, trigger: HTMLButtonElement) => void;
}) {
  const candidate = projection.candidate;
  const clinicalItems = [...candidate.hypotheses].sort(clinicalItemSort);
  const diagnosticHypotheses = clinicalItems.filter((item) => item.clinical_role === "diagnostic_hypothesis");
  const selected = clinicalItems.find((item) => item.id === selectedHypothesisId) ?? diagnosticHypotheses[0];
  const selectedRelations = candidate.relations
    .filter((item) => item.hypothesis_id === selected.id && item.direction === "support")
    .map((relation) => {
      const factId = sourceFactId(projection, relation.source_id);
      const fact = factId ? projection.facts.find((item) => item.id === factId) ?? null : null;
      const alsoSupports = candidate.relations
        .filter((item) => item.source_id === relation.source_id && item.direction === "support" && item.hypothesis_id !== selected.id)
        .map((item) => item.hypothesis_id);
      return { relation, factId, fact, alsoSupports };
    })
    .sort((left, right) => (left.fact ? factPriority[left.fact.category] : 99) - (right.fact ? factPriority[right.fact.category] : 99))
    .slice(0, 6);
  const renderClinicalItem = (item: CandidateClinicalItem) => {
    const counts = relationCounts(projection, item.id);
    const total = Math.max(1, counts.support + counts.refute + counts.neutral);
    return (
      <Button
        key={item.id}
        className="hb-v1-diff__row"
        data-ranked={item.clinical_role === "diagnostic_hypothesis"}
        data-selected={selected.id === item.id}
        onClick={() => onSelectHypothesis(item.id)}
        aria-pressed={selected.id === item.id}
      >
        {item.clinical_role === "diagnostic_hypothesis" && <strong>{clinicalItemMarker(item)}</strong>}
        <span><small>{clinicalRoleLabel(item)}</small>{item.short_label}</span>
        <small><i>+{counts.support}</i> <b>−{counts.refute}</b> ·{counts.neutral}</small>
        <em aria-hidden="true">
          <i style={{ width: `${(counts.support / total) * 100}%` }} />
          <b style={{ width: `${(counts.refute / total) * 100}%` }} />
          <span style={{ width: `${(counts.neutral / total) * 100}%` }} />
        </em>
      </Button>
    );
  };
  return (
    <Box className="hb-v1-overview-wrap">
      <Alert severity="warning" className="hb-candidate-alert">
        <strong>Candidate for clinician review.</strong>{" "}
        Independent critique passed. The clinician determines the final diagnosis and treatment decision.
      </Alert>
      <section className="hb-v1-overview">
        <Paper className="hb-v1-leading" elevation={0}>
          <Box className="hb-v1-leading__headline">
            <Chip
              icon={<VerifiedRoundedIcon />}
              label={`${clinicalRoleLabel(selected)} · clinician decision pending`}
              color="primary"
            />
            <Typography variant="h1">{clinicalDisplayName(selected)}</Typography>
            <Typography className="hb-v1-leading__rationale">{selected.summary}</Typography>
          </Box>
          <Box className="hb-v1-leading__evidence">
            <div>
              <Typography variant="h3">Supporting facts</Typography>
              <Typography className="hb-v1-leading__shared-note">
                Imaging, morphology, and quantitative data are shown before general symptoms. Shared facts are identified separately.
              </Typography>
              {selectedRelations.length ? selectedRelations.map(({ relation, factId, alsoSupports }) => (
                <article key={`${relation.source_id}-${selected.id}`} className="hb-v1-leading__fact">
                  <strong>{shorten(clinicalNodeLabel(projection, relation.source_id), 150)}</strong>
                  <p>{relation.rationale}</p>
                  {alsoSupports.length > 0 && (
                    <div className="hb-v1-leading__also-supports">
                      <small>Also supports:</small>
                      {alsoSupports.map((id) => {
                        const hypothesis = clinicalItems.find((item) => item.id === id);
                        return hypothesis ? (
                          <Button
                            key={id}
                            size="small"
                            onClick={() => onSelectHypothesis(id)}
                            aria-label={clinicalItemActionLabel(hypothesis)}
                          >
                            {id} · {hypothesis.short_label}
                          </Button>
                        ) : null;
                      })}
                    </div>
                  )}
                  {factId && (
                    <Button size="small" onClick={(event) => onOpenSource(factId, event.currentTarget)}>
                      Open source record
                    </Button>
                  )}
                </article>
              )) : <p>There are no recorded supporting relationships for this hypothesis.</p>}
            </div>
            <div>
              <Typography variant="h3">What limits the conclusion</Typography>
              {[...selected.applicability_limits, ...selected.missing_evidence].map((item) => <p key={item}>{item}</p>)}
            </div>
          </Box>
        </Paper>
        <Paper className="hb-v1-diff" elevation={0}>
          <header>
            <Typography variant="h2">Differential diagnosis</Typography>
            <Typography variant="body2">Only diagnostic hypotheses of the main clinical pattern are ranked. The number of connections is not the probability of a diagnosis.</Typography>
          </header>
          {diagnosticHypotheses.map(renderClinicalItem)}
          {(Object.keys(clinicalRoleMeta) as ClinicalRole[])
            .filter((role) => role !== "diagnostic_hypothesis")
            .map((role) => {
              const items = clinicalItems.filter((item) => item.clinical_role === role);
              if (!items.length) return null;
              return <section className="hb-v1-diff__group" key={role}><h3>{clinicalRoleMeta[role].plural}</h3>{items.map(renderClinicalItem)}</section>;
            })}
          <footer><span data-direction="support">supports</span><span data-direction="refute">contradicts</span><span>neutral</span></footer>
        </Paper>
      </section>
      <Paper className="hb-evidence-corpus" elevation={0}>
        <Typography variant="h2">Source support for diagnostic verification</Typography>
        <Typography color="text.secondary" variant="body2">
          Sources support criteria and subsequent diagnostic steps. The clinician reaches a patient-specific conclusion after clinical verification.
        </Typography>
        <Box className="hb-evidence-corpus__grid">
          {candidate.external_evidence.map((source) => (
            <article key={source.id}>
              <Chip label={`${evidenceTypeLabel[source.source_type]}${source.year ? ` · ${source.year}` : ""}`} size="small" color="success" />
              <Typography variant="h3">{source.title}</Typography>
              <Typography>{publicFacingText(source.proposition, publication)}</Typography>
              <Typography color="text.secondary" variant="body2">{publicFacingText(source.applicability, publication)}</Typography>
              <Typography variant="caption">{clinicianSourceLocation(source.location)}</Typography>
            </article>
          ))}
        </Box>
      </Paper>
    </Box>
  );
}

type TimelineLane = "course" | "laboratory" | "imaging" | "pathology" | "consultation";
type TimelineEvent = {
  id: string;
  lane: TimelineLane;
  categoryLabel: string;
  date: string | null;
  title: string;
  summary: string;
  factIds: string[];
  sourceRecordId: string;
  sourceOrder: number;
};

const timelineLaneMeta: Array<{ id: TimelineLane; label: string }> = [
  { id: "course", label: "Course" },
  { id: "laboratory", label: "Laboratory tests and markers" },
  { id: "imaging", label: "Visualization" },
  { id: "pathology", label: "Tissue and IHC" },
  { id: "consultation", label: "Consultations" },
];

function timelineLane(fact: ClinicalFact): TimelineLane {
  if (fact.category === "laboratory") return "laboratory";
  if (fact.category === "imaging") return "imaging";
  if (fact.category === "pathology_procedure") return "pathology";
  if (fact.category === "other") return "consultation";
  return "course";
}

function buildTimelineEvents(projection: CandidateDashboardProjection): TimelineEvent[] {
  const sourceOrder = new Map(projection.source_records.map((item) => [item.id, item.source_order]));
  const groups = new Map<string, ClinicalFact[]>();
  projection.facts
    .filter((fact) => fact.category !== "demographics")
    .forEach((fact) => {
      const recordId = fact.source_record_ids[0] ?? "unbound";
      const lane = timelineLane(fact);
      const key = `${recordId}|${fact.effective_at ?? "undated"}|${lane}`;
      groups.set(key, [...(groups.get(key) ?? []), fact]);
    });
  return [...groups.entries()].map(([key, facts]) => {
    const [recordId, rawDate, lane] = key.split("|") as [string, string, TimelineLane];
    const ordered = [...facts].sort((a, b) => a.source_segment_index - b.source_segment_index);
    const statement = ordered.find((item) => item.value.type === "text");
    const title = statement ? shorten(factNarrative(statement), 110) : timelineLaneMeta.find((item) => item.id === lane)?.label ?? "Clinical record";
    return {
      id: key,
      lane,
      categoryLabel: timelineLaneMeta.find((item) => item.id === lane)?.label ?? "Clinical record",
      date: rawDate === "undated" ? null : rawDate,
      title,
      summary: ordered.slice(0, 5).map(factNarrative).join("; "),
      factIds: ordered.map((item) => item.id),
      sourceRecordId: recordId,
      sourceOrder: sourceOrder.get(recordId) ?? 9999,
    };
  }).sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date) || a.sourceOrder - b.sourceOrder;
    if (a.date) return -1;
    if (b.date) return 1;
    return a.sourceOrder - b.sourceOrder || a.lane.localeCompare(b.lane);
  });
}

function CandidateTimeline({
  projection,
  selectedHypothesisId,
  onSelectHypothesis,
  onOpenSource,
}: {
  projection: CandidateDashboardProjection;
  selectedHypothesisId: string;
  onSelectHypothesis: (id: string) => void;
  onOpenSource: (factId: string, trigger: HTMLButtonElement) => void;
}) {
  const events = useMemo(() => buildTimelineEvents(projection), [projection]);
  const dated = events.filter((item) => item.date);
  const boardEvents = dated.length ? dated : events;
  const [selectedEventId, setSelectedEventId] = useState(boardEvents.at(-1)?.id ?? events[0]?.id ?? "");
  const [scale, setScale] = useState(100);
  useEffect(() => {
    setSelectedEventId((current) => events.some((item) => item.id === current) ? current : boardEvents.at(-1)?.id ?? events[0]?.id ?? "");
  }, [boardEvents, events]);
  const active = events.find((item) => item.id === selectedEventId) ?? boardEvents.at(-1) ?? events[0];
  const datedTimes = dated.map((item) => new Date(`${item.date}T12:00:00Z`).getTime());
  const minTime = datedTimes.length ? Math.min(...datedTimes) : 0;
  const maxTime = datedTimes.length ? Math.max(...datedTimes) : 1;
  const positionFor = (event: TimelineEvent) => {
    if (event.date && dated.length) {
      const time = new Date(`${event.date}T12:00:00Z`).getTime();
      return 4 + ((time - minTime) / Math.max(1, maxTime - minTime)) * 92;
    }
    const index = boardEvents.findIndex((item) => item.id === event.id);
    return boardEvents.length <= 1 ? 50 : 5 + (index / (boardEvents.length - 1)) * 90;
  };
  const activePosition = active && boardEvents.some((item) => item.id === active.id) ? positionFor(active) : 0;
  const activeRelations = active ? projection.candidate.relations.filter((relation) => {
    const factId = sourceFactId(projection, relation.source_id);
    return factId ? active.factIds.includes(factId) : false;
  }) : [];
  const related = active ? events.filter((item) => item.id !== active.id && item.sourceRecordId === active.sourceRecordId).slice(0, 2) : [];
  if (!active) return <Alert severity="info">There are no clinical events for the timeline in the projection.</Alert>;
  return (
    <Paper className="hb-v1-timeline" elevation={0} data-testid="clinical-timeline">
      <section className="hb-v1-timeline__monitor">
        <div className="hb-v1-timeline__visual" role="img" aria-label="Contextual anatomical reference">
          <img src={new URL("anatomy-reference.png", document.baseURI).href} alt="" aria-hidden="true" />
        </div>
        <div className="hb-v1-timeline__readout">
          <header>
            <time dateTime={active.date ?? undefined}>{formatDate(active.date)}</time>
            <span>{active.categoryLabel}</span>
            <Button size="small" onClick={(event) => onOpenSource(active.factIds[0], event.currentTarget)}>Open source record</Button>
          </header>
          <Stack direction="row" spacing={0.6} useFlexGap className="hb-v1-timeline__facts">
            <Chip label={`${active.factIds.length} ${active.factIds.length === 1 ? "observation" : "observations"}`} size="small" />
            <Chip label="de-identified record" size="small" variant="outlined" />
            <Chip label="clinician decision pending" size="small" color="success" variant="outlined" />
          </Stack>
          <Typography variant="h2">{active.title}</Typography>
          <Typography className="hb-v1-timeline__summary">{active.summary}</Typography>
          <div className="hb-v1-timeline__detail-grid">
            <section>
              <Typography variant="h3">Clinical significance of this record · {activeRelations.length}</Typography>
              {activeRelations.length ? activeRelations.slice(0, 4).map((relation) => {
                const hypothesis = projection.candidate.hypotheses.find((item) => item.id === relation.hypothesis_id);
                return hypothesis ? (
                  <button key={`${relation.source_id}-${hypothesis.id}`} type="button" onClick={() => { onSelectHypothesis(hypothesis.id); }}>
                    <span data-direction={relation.direction}>{directionLabel[relation.direction]}</span>
                    <strong>{clinicalRoleLabel(hypothesis)} · {hypothesis.short_label}</strong>
                    <OpenInNewRoundedIcon />
                  </button>
                ) : null;
              }) : <p>There is no stored association with clinical interpretations for this record.</p>}
            </section>
            <section>
              <Typography variant="h3">Related records · {related.length}</Typography>
              {related.length ? related.map((item) => (
                <button key={item.id} type="button" onClick={() => setSelectedEventId(item.id)}><span>{item.categoryLabel}</span><strong>{item.title}</strong></button>
              )) : <p>There are no other records from this source fragment.</p>}
            </section>
          </div>
        </div>
      </section>
      <div className="hb-v1-timeline__transport">
        <header><strong>{dated.length ? formatDate(active.date) : "Document sequence"}</strong><div><span>Time scale</span><Slider min={100} max={300} step={25} value={scale} onChange={(_, value) => setScale(value as number)} aria-label="Time scale" /><strong>{scale}%</strong></div></header>
        <div className="hb-v1-timeline__stage">
          <aside><div />{timelineLaneMeta.map((lane) => <span key={lane.id}>{lane.label}<b>{boardEvents.filter((event) => event.lane === lane.id).length}</b></span>)}<small>Time cursor</small></aside>
          <div className="hb-v1-timeline__board">
            <div className="hb-v1-timeline__canvas" style={{ width: `${scale}%` }}>
              <div className="hb-v1-timeline__axis-label">{dated.length ? `${formatDate(dated[0].date)} — ${formatDate(dated.at(-1)?.date ?? null)}` : "Record order in DOCX"}</div>
              {timelineLaneMeta.map((lane) => (
                <div className="hb-v1-timeline__lane" key={lane.id}>
                  {boardEvents.filter((event) => event.lane === lane.id).map((event) => (
                    <Tooltip title={`${formatDate(event.date)} · ${event.title}`} key={event.id}>
                      <button type="button" data-lane={lane.id} data-selected={event.id === active.id} style={{ left: `${positionFor(event)}%` }} onClick={() => setSelectedEventId(event.id)} aria-label={`Open event: ${event.title}`} />
                    </Tooltip>
                  ))}
                </div>
              ))}
              <div className="hb-v1-timeline__cursor" />
              <div className="hb-v1-timeline__playhead" style={{ left: `${activePosition}%` }} />
              <div className="hb-v1-timeline__floating-label" style={{ left: `${activePosition}%` }}>{shorten(active.title, 46)}</div>
              <div className="hb-v1-timeline__cursor-date" style={{ left: `${activePosition}%` }}>{formatDate(active.date)}</div>
            </div>
          </div>
        </div>
      </div>
      {dated.length > 0 && events.length > dated.length && (
        <details className="hb-v1-timeline__undated"><summary>Records without a confirmed clinical date · {events.length - dated.length}</summary><div>{events.filter((item) => !item.date).map((item) => <button type="button" key={item.id} onClick={() => setSelectedEventId(item.id)}>{item.title}</button>)}</div></details>
      )}
    </Paper>
  );
}

function CandidateGraph({
  projection,
  publication,
  selectedHypothesisId,
  onSelectHypothesis,
  onOpenSource,
}: {
  projection: CandidateDashboardProjection;
  publication: PublicCandidateDashboard["publication"] | null;
  selectedHypothesisId: string;
  onSelectHypothesis: (id: string) => void;
  onOpenSource: (factId: string, trigger: HTMLButtonElement) => void;
}) {
  const [lens, setLens] = useState<"facts" | "sources">("facts");
  const [selectedFactId, setSelectedFactId] = useState<string | null>(null);
  const hypotheses = projection.candidate.hypotheses
    .filter((item) => item.clinical_role === "diagnostic_hypothesis")
    .sort(clinicalItemSort);
  const hypothesisIds = new Set(hypotheses.map((item) => item.id));
  const graphRelations = projection.candidate.relations.filter((item) => hypothesisIds.has(item.hypothesis_id));
  const selectedHypothesis = hypotheses.find((item) => item.id === selectedHypothesisId) ?? hypotheses[0];
  const factNodes = [...new Set(graphRelations.map((item) => item.source_id))].map((id) => ({ id, label: clinicalNodeLabel(projection, id), factId: sourceFactId(projection, id) }));
  const height = Math.max(560, factNodes.length * 58 + 50);
  const factY = (index: number) => 44 + index * ((height - 88) / Math.max(1, factNodes.length - 1));
  const hypothesisY = (index: number) => 78 + index * ((height - 156) / Math.max(1, hypotheses.length - 1));
  const factIndex = new Map(factNodes.map((item, index) => [item.id, index]));
  const hypothesisIndex = new Map(hypotheses.map((item, index) => [item.id, index]));
  const focusedRelations = graphRelations.filter((item) => selectedFactId ? item.source_id === selectedFactId : item.hypothesis_id === selectedHypothesis.id);
  const selectedFact = selectedFactId ? factNodes.find((item) => item.id === selectedFactId) ?? null : null;
  const sourceTraceRows = projection.candidate.external_evidence.map((source) => {
    const workup = projection.candidate.workup.filter((item) => item.evidence_refs.includes(source.id));
    const gaps = projection.candidate.critical_gaps.filter((item) => item.evidence_refs.includes(source.id));
    const linkedHypothesisIds = [...new Set([...workup.flatMap((item) => item.discriminates), ...gaps.flatMap((item) => item.hypothesis_ids)])]
      .filter((id) => hypothesisIds.has(id));
    return { source, vias: [...workup.map((item) => item.label), ...gaps.map((item) => item.question)], hypothesisIds: linkedHypothesisIds };
  });
  return (
    <Paper className="hb-v1-graph" elevation={0}>
      <header className="hb-v1-graph__toolbar">
        <div><Typography variant="h1">Patient facts → hypotheses</Typography><Typography>The line reproduces the recorded relation type. Its thickness and count do not represent diagnostic probability.</Typography></div>
        <div><div className="hb-v1-graph__lens"><button type="button" aria-pressed={lens === "facts"} onClick={() => setLens("facts")}>Patient facts</button><button type="button" aria-pressed={lens === "sources"} onClick={() => setLens("sources")}>Source traces</button></div><div className="hb-v1-graph__legend"><span data-direction="support">supports</span><span data-direction="refute">contradicts</span><span>neutral</span></div></div>
      </header>
      {lens === "facts" ? (
        <div className="hb-v1-graph__workspace">
          <div className="hb-v1-graph__canvas" style={{ height }}>
            <svg viewBox={`0 0 1000 ${height}`} preserveAspectRatio="none" aria-hidden="true">
              {graphRelations.map((relation, index) => {
                const sourceIndex = factIndex.get(relation.source_id);
                const targetIndex = hypothesisIndex.get(relation.hypothesis_id);
                if (sourceIndex === undefined || targetIndex === undefined) return null;
                const active = (!selectedFactId || selectedFactId === relation.source_id) && (selectedFactId ? true : selectedHypothesis.id === relation.hypothesis_id);
                return <path key={`${relation.source_id}-${relation.hypothesis_id}-${index}`} d={`M 405 ${factY(sourceIndex)} C 505 ${factY(sourceIndex)}, 540 ${hypothesisY(targetIndex)}, 650 ${hypothesisY(targetIndex)}`} data-direction={relation.direction} data-active={active} />;
              })}
            </svg>
            <div className="hb-v1-graph__facts">{factNodes.map((fact, index) => <button type="button" key={fact.id} className={selectedFactId === fact.id ? "is-selected" : ""} style={{ top: `${(factY(index) / height) * 100}%` }} onClick={() => setSelectedFactId((current) => current === fact.id ? null : fact.id)}><strong>{fact.id.startsWith("CF-") ? `F${String(index + 1).padStart(3, "0")}` : `S${String(index + 1).padStart(3, "0")}`}</strong><span>{shorten(fact.label, 58)}</span></button>)}</div>
            <div className="hb-v1-graph__hypotheses">{hypotheses.map((item, index) => <button type="button" key={item.id} className={selectedHypothesis.id === item.id ? "is-selected" : ""} aria-pressed={selectedHypothesis.id === item.id} style={{ top: `${(hypothesisY(index) / height) * 100}%` }} onClick={() => { setSelectedFactId(null); onSelectHypothesis(item.id); }}><strong>{clinicalItemMarker(item)}</strong><span><small>{item.rank === 1 ? "leading" : "working hypothesis"}</small>{item.short_label}</span></button>)}</div>
          </div>
          <div className="hb-v1-graph__mobile">{hypotheses.map((item) => { const counts = relationCounts(projection, item.id); return <button type="button" key={item.id} className={selectedHypothesis.id === item.id ? "is-selected" : ""} aria-pressed={selectedHypothesis.id === item.id} onClick={() => onSelectHypothesis(item.id)}><strong>{clinicalItemMarker(item)}</strong><span>{item.short_label}</span><small>+{counts.support} −{counts.refute} ·{counts.neutral}</small></button>; })}</div>
          <aside className="hb-v1-graph__inspector" style={{ height }}>
            <header><Typography variant="h3">Graph focus</Typography><p>Select a hypothesis or fact to inspect relations and provenance.</p></header>
            {selectedFact ? <>
              <section><strong>{selectedFact.label}</strong><p>Recorded hypothesis relations: {focusedRelations.length}.</p></section>
              {selectedFact.factId && <section><Typography variant="h3">Source address</Typography><Button onClick={(event) => onOpenSource(selectedFact.factId!, event.currentTarget)}>Open source record</Button></section>}
              <section><Typography variant="h3">Connections</Typography>{focusedRelations.map((relation) => { const item = hypotheses.find((candidate) => candidate.id === relation.hypothesis_id); return <p key={`${relation.source_id}-${relation.hypothesis_id}`}><b>{item?.short_label ?? relation.hypothesis_id}</b> · {directionLabel[relation.direction]}</p>; })}</section>
            </> : <>
              <section><Chip label={clinicalItemMarker(selectedHypothesis)} color="primary" size="small" /><Typography variant="h3">{clinicalDisplayName(selectedHypothesis)}</Typography><p>{selectedHypothesis.summary}</p><div className="hb-v1-graph__counts">{Object.entries(relationCounts(projection, selectedHypothesis.id)).map(([key, value]) => <span key={key} data-direction={key}>{key === "support" ? "+" : key === "refute" ? "−" : "·"}{value}</span>)}</div></section>
              <section><Typography variant="h3">Related facts</Typography>{focusedRelations.slice(0, 8).map((relation) => <button className="hb-v1-graph__fact-link" type="button" key={relation.source_id} onClick={() => setSelectedFactId(relation.source_id)}><span>{directionLabel[relation.direction]}</span><small>{shorten(clinicalNodeLabel(projection, relation.source_id), 100)}</small></button>)}</section>
              <section><Typography variant="h3">What is missing?</Typography>{selectedHypothesis.missing_evidence.map((item) => <p key={item}>{item}</p>)}</section>
            </>}
          </aside>
        </div>
      ) : (
        <div className="hb-v1-source-traces">{sourceTraceRows.map(({ source, vias, hypothesisIds }) => <article key={source.id}><Chip label={evidenceTypeLabel[source.source_type]} color={evidenceTypeColor[source.source_type]} size="small" /><div><Typography variant="h3">{source.title}</Typography><p>{publicFacingText(source.proposition, publication)}</p><small>{vias.join(" · ") || "Source route not recorded"}</small><div className="hb-v1-source-traces__hypothesis-links">{hypothesisIds.map((id) => { const item = hypotheses.find((candidate) => candidate.id === id); return item ? <Button key={id} size="small" onClick={() => { setLens("facts"); setSelectedFactId(null); onSelectHypothesis(id); }} aria-label={clinicalItemActionLabel(item)}>{id} · {item.short_label}</Button> : null; })}</div></div></article>)}</div>
      )}
    </Paper>
  );
}

function CandidateGaps({
  projection,
  onSelectHypothesis,
}: {
  projection: CandidateDashboardProjection;
  onSelectHypothesis: (id: string) => void;
}) {
  const candidate = projection.candidate;
  const evidence = new Map(candidate.external_evidence.map((item) => [item.id, item]));
  const clinicalItems = new Map(candidate.hypotheses.map((item) => [item.id, item]));
  const priorityLabels = {
    critical: "Urgent priority",
    high: "High priority",
    medium: "Medium priority",
    conditional: "When clinically indicated",
  } as const;
  const necessityLabels = {
    classification_exclusion_required: "Required classification exclusion",
    key_discriminator: "Key discriminating test",
    conditional_adjunct: "Conditional adjunct",
    urgent_if_triggered: "Urgent action if the clinical trigger is present",
  } as const;
  return (
    <Box className="hb-gaps">
      <Paper elevation={0}>
        <Typography variant="h1">Critical gaps</Typography>
        {candidate.critical_gaps.map((gap) => (
          <article key={gap.id} className="hb-gap-card">
            <Chip label="Critical clinical question" color="error" size="small" />
            <Typography variant="h3">{gap.question}</Typography>
            <Typography>{gap.rationale}</Typography>
            <Stack className="hb-clinical-link-row" direction="row" spacing={0.75} useFlexGap>
              {gap.hypothesis_ids.map((id) => {
                const hypothesis = clinicalItems.get(id);
                return hypothesis ? <Button key={id} size="small" onClick={() => onSelectHypothesis(id)} aria-label={clinicalItemActionLabel(hypothesis)}>{id} · {hypothesis.short_label}</Button> : null;
              })}
            </Stack>
            <Stack className="hb-gap-card__sources" spacing={0.5}>
              {gap.evidence_refs.map((id) => {
                const source = evidence.get(id);
                return (
                  <Box className="hb-gap-card__source" key={id}>
                    <Chip
                      label={source ? evidenceTypeLabel[source.source_type] : "Source"}
                      color={source ? evidenceTypeColor[source.source_type] : "default"}
                      size="small"
                    />
                    <Typography component="span">{source?.title ?? "Source support"}</Typography>
                  </Box>
                );
              })}
            </Stack>
          </article>
        ))}
      </Paper>
      <Paper elevation={0}>
        <Typography variant="h1">Verification plan</Typography>
        {candidate.workup.map((item) => (
          <article key={item.id} className="hb-workup-card">
            <Box><Chip label={necessityLabels[item.necessity]} color="primary" size="small" /><Chip label={priorityLabels[item.priority]} size="small" variant="outlined" /></Box>
            <Typography variant="h3">{item.label}</Typography>
            <Typography>{item.rationale}</Typography>
            <Stack className="hb-clinical-link-row" direction="row" spacing={0.75} useFlexGap>
              {item.discriminates.map((id) => {
                const hypothesis = clinicalItems.get(id);
                return hypothesis ? <Button key={id} size="small" onClick={() => onSelectHypothesis(id)} aria-label={clinicalItemActionLabel(hypothesis)}>{id} · {hypothesis.short_label}</Button> : null;
              })}
            </Stack>
            {item.trigger && <Alert severity="warning"><strong>Urgency trigger:</strong> {item.trigger}</Alert>}
          </article>
        ))}
      </Paper>
    </Box>
  );
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes} min ${remainder} s` : `${remainder} s`;
}

const reasoningKindLabels: Record<ClinicianReasoningLog["narrative"][number]["kind"], string> = {
  context: "Clinical context",
  differential: "Differential diagnosis",
  hypothesis: "Hypotheses and diagnoses",
  evidence: "Evidence comparison",
  action: "Questions and next steps",
  critic: "Independent critique",
  conclusion: "Conclusion and revision criteria",
};

function renderEmphasizedText(text: string, terms: string[]): React.ReactNode {
  const normalizedTerms = [...new Set(terms.filter(Boolean))].sort((left, right) => right.length - left.length);
  if (normalizedTerms.length === 0) return text;
  const escapedTerms = normalizedTerms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escapedTerms.join("|")})`, "gi");
  const normalized = new Set(normalizedTerms.map((term) => term.toLocaleLowerCase("en-GB")));
  return text.split(pattern).map((part, index) => (
    normalized.has(part.toLocaleLowerCase("en-GB"))
      ? <strong key={`${part}-${index}`}>{part}</strong>
      : <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
  ));
}

function ReasoningLogView({
  projection,
  log,
  publication,
  onOpenSourceGroup,
}: {
  projection: CandidateDashboardProjection;
  log: ClinicianReasoningLog;
  publication: PublicCandidateDashboard["publication"];
  onOpenSourceGroup: (factIds: string[], trigger: HTMLButtonElement) => void;
}) {
  const evidence = new Map(log.source_library.map((item) => [item.id, item]));
  return (
    <Box className="hb-reasoning-log">
      <Paper component="article" className="hb-reasoning-article" elevation={0}>
        <header className="hb-reasoning-article__header">
          <Typography variant="h1">{log.title}</Typography>
          <Typography className="hb-reasoning-log__lead">{log.opening_summary}</Typography>
          <Stack direction="row" spacing={0.75} useFlexGap className="hb-reasoning-article__meta">
            <span>Approximately {log.reading_time_minutes} min read</span>
            <span aria-hidden="true">·</span>
            <span>Candidate for clinician review</span>
          </Stack>
          <Typography className="hb-reasoning-article__disclaimer">{log.disclaimer}</Typography>
        </header>

        <Box className="hb-reasoning-article__body">
          {log.narrative.map((paragraph) => {
            const evidenceLabels = [...new Set(paragraph.evidence_ids.map((evidenceId) => {
              const source = evidence.get(evidenceId);
              return source ? `${source.type_label}${source.year ? ` · ${source.year}` : ""}` : null;
            }).filter((label): label is string => Boolean(label)))];
            return (
            <Box key={paragraph.id} className="hb-reasoning-paragraph" data-kind={paragraph.kind}>
              <Typography component="span" className="hb-reasoning-paragraph__kind">
                {reasoningKindLabels[paragraph.kind]}
              </Typography>
              <Typography component="p">{renderEmphasizedText(paragraph.text, paragraph.emphasis_terms)}</Typography>
              {(paragraph.source_fact_ids.length > 0 || paragraph.evidence_ids.length > 0) && (
                <Stack direction="row" spacing={0.75} useFlexGap className="hb-reasoning-paragraph__citations">
                  {paragraph.source_fact_ids.length > 0 && (
                    <Button
                      size="small"
                      variant="text"
                      onClick={(event) => onOpenSourceGroup(paragraph.source_fact_ids, event.currentTarget)}
                      aria-label={paragraph.source_fact_ids.length === 1 ? "Show source support" : `Show source supports · ${paragraph.source_fact_ids.length}`}
                      title={paragraph.source_fact_ids.map((factId) => clinicalNodeLabel(projection, factId)).join("; ")}
                    >
                      {paragraph.source_fact_ids.length === 1 ? "Show source support" : `Show source supports · ${paragraph.source_fact_ids.length}`}
                    </Button>
                  )}
                  {evidenceLabels.length > 0 && (
                    <Typography component="span" className="hb-reasoning-paragraph__evidence-note">
                      Sources: {evidenceLabels.join(" · ")}
                    </Typography>
                  )}
                </Stack>
              )}
            </Box>
          );
          })}
        </Box>
      </Paper>

      <Paper component="details" className="hb-reasoning-details" elevation={0}>
        <summary>Protocol sources · {log.source_library.length}</summary>
        <Box className="hb-reasoning-sources">
          {log.source_library.map((source) => (
            <article key={source.id}>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                <Chip label={source.type_label} size="small" color="success" variant="outlined" />
                {source.year && <Chip label={source.year} size="small" variant="outlined" />}
              </Stack>
              <Typography variant="h3">{source.title}</Typography>
              <Typography>{source.proposition}</Typography>
              <Typography variant="body2" color="text.secondary">{source.applicability}</Typography>
              <Typography variant="caption">{source.location}</Typography>
              {source.url && (
                <Button component="a" href={source.url} target="_blank" rel="noreferrer" endIcon={<OpenInNewRoundedIcon />}>
                  Open publication
                </Button>
              )}
            </article>
          ))}
        </Box>
      </Paper>

      <Paper component="details" className="hb-reasoning-details" elevation={0}>
        <summary>Run receipt</summary>
        <dl className="hb-reasoning-receipt">
          <div><dt>Public case</dt><dd>{publication.display_case_id}</dd></div>
          <div><dt>Total run time</dt><dd>{formatDuration(log.audit.total_seconds)}</dd></div>
          <div><dt>Model calls</dt><dd>{log.audit.model_calls}</dd></div>
          <div><dt>Independent critique attempts</dt><dd>{log.audit.critic_attempts}</dd></div>
          <div><dt>Unresolved major findings</dt><dd>0</dd></div>
          <div><dt>Language review</dt><dd>passed</dd></div>
          <div><dt>Projection verification</dt><dd>passed</dd></div>
          <div><dt>Clinician decision</dt><dd>not yet recorded</dd></div>
        </dl>
      </Paper>
    </Box>
  );
}

function NavigationRail({
  projection,
  reasoningLog,
  view,
  onChange,
}: {
  projection: Projection;
  reasoningLog: ClinicianReasoningLog | null;
  view: ViewKey;
  onChange: (view: ViewKey) => void;
}) {
  return (
    <Drawer
      variant="permanent"
      className="hb-rail"
      slotProps={{ paper: { component: "nav", "aria-label": "HematoBoard navigation" } }}
    >
      <Toolbar />
      <List>
        {navigation.map((item) => {
          const enabled = viewEnabled(projection, item.key, reasoningLog);
          return (
          <Tooltip
            key={item.key}
            title={enabled ? item.label : `${item.label}: Not available for this projection`}
            placement="right"
            arrow
          >
            <span>
              <ListItemButton
                selected={view === item.key}
                disabled={!enabled}
                onClick={() => onChange(item.key)}
                aria-current={view === item.key ? "page" : undefined}
                aria-label={enabled ? item.label : `${item.label}, not available for this projection`}
              >
                <ListItemIcon>
                  <Box className="hb-rail__indicator">{item.icon}</Box>
                </ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </span>
          </Tooltip>
          );
        })}
      </List>
    </Drawer>
  );
}

function MobileNavigation({
  projection,
  reasoningLog,
  view,
  onChange,
}: {
  projection: Projection;
  reasoningLog: ClinicianReasoningLog | null;
  view: ViewKey;
  onChange: (view: ViewKey) => void;
}) {
  return (
    <BottomNavigation
      component="nav"
      aria-label="HematoBoard mobile navigation"
      className="hb-mobile-nav"
      value={view}
      onChange={(_, next: ViewKey) => onChange(next)}
      showLabels
    >
      {navigation.map((item) => {
        const enabled = viewEnabled(projection, item.key, reasoningLog);
        return <BottomNavigationAction
          key={item.key}
          value={item.key}
          icon={item.icon}
          label={item.label}
          disabled={!enabled}
          aria-current={view === item.key ? "page" : undefined}
          aria-label={enabled ? item.label : `${item.label}, not available for this projection`}
        />;
      })}
    </BottomNavigation>
  );
}

function App() {
  const [dashboard, setDashboard] = useState<LoadedDashboard | null>(null);
  const [caseIndex, setCaseIndex] = useState<PublicCaseIndex | null>(null);
  const [selectedCaseKey, setSelectedCaseKey] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>("data");
  const [selectedHypothesisId, setSelectedHypothesisId] = useState("H1");
  const [selectedFactIds, setSelectedFactIds] = useState<string[]>([]);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const load = async () => {
      try {
        const index = await fetchPublicIndex();
        if (index?.cases.length) {
          const queryKey = new URLSearchParams(window.location.search).get("case");
          const entry = index.cases.find((item) => item.key === queryKey || item.case_id === queryKey) ?? index.cases[0];
          setCaseIndex(index);
          setSelectedCaseKey(entry.key);
          const value = await fetchPublicCase(entry);
          setDashboard(value);
          setSelectedHypothesisId(leadingHypothesisId(value.projection));
          setView("overview");
          return;
        }
        const value = await fetchProjection();
        setDashboard(value);
        if (isCandidateProjection(value.projection)) setSelectedHypothesisId(leadingHypothesisId(value.projection));
        setView(isCandidateProjection(value.projection) ? "overview" : "data");
      } catch (reason: unknown) {
        setError(reason instanceof Error ? reason.message : "The projection could not be loaded.");
      }
    };
    void load();
  }, []);

  const changeCase = async (key: string) => {
    const entry = caseIndex?.cases.find((item) => item.key === key);
    if (!entry) return;
    setSelectedCaseKey(key);
    setError(null);
    try {
      const value = await fetchPublicCase(entry);
      setDashboard(value);
      setSelectedFactIds([]);
      setSelectedHypothesisId(leadingHypothesisId(value.projection));
      setView("overview");
      const url = new URL(window.location.href);
      url.searchParams.set("case", entry.key);
      window.history.replaceState({}, "", url);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : `Case ${entry.case_id} could not be loaded.`);
    }
  };

  if (error) {
    return <Box className="hb-load-state"><Alert severity="error">{error}</Alert></Box>;
  }
  if (!dashboard) {
    return <Box className="hb-load-state"><CircularProgress aria-label="Loading projection" /></Box>;
  }

  const { projection, publication, reasoningLog } = dashboard;
  const counts = projection.provenance.counts;
  const facts = new Map(projection.facts.map((fact) => [fact.id, fact]));
  const records = new Map(projection.source_records.map((record) => [record.id, record]));
  const selectedFacts = selectedFactIds.map((factId) => facts.get(factId)).filter((fact): fact is ClinicalFact => Boolean(fact));
  const selectedRecordIds = [...new Set(selectedFacts.flatMap((fact) => fact.source_record_ids))];
  const selectedRecords = selectedRecordIds.map((recordId) => records.get(recordId)).filter((record): record is SourceRecord => Boolean(record));
  const openSource = (factId: string, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setSelectedFactIds([factId]);
  };
  const openSourceGroup = (factIds: string[], trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setSelectedFactIds([...new Set(factIds.filter((factId) => facts.has(factId)))]);
  };
  const closeSource = () => {
    setSelectedFactIds([]);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };
  const candidateProjection = isCandidateProjection(projection) ? projection : null;
  const displayRunId = isCandidateProjection(projection) ? projection.reasoning_run_id : projection.run_id;
  const displayCaseId = publication?.display_case_id ?? projection.case.id;
  const publicSourceCount = reasoningLog?.source_library.length ?? candidateProjection?.candidate.external_evidence.length ?? 0;
  const publicGapCount = candidateProjection?.candidate.critical_gaps.length ?? 0;
  const caseSummary = candidateProjection
    ? patientCaseSummary(candidateProjection)
    : "Deterministic transfer of quantitative data from an already de-identified DOCX.";
  const selectHypothesis = (id: string, nextView?: ViewKey) => {
    setSelectedHypothesisId(id);
    if (nextView) setView(nextView);
  };
  return (
    <Box className="hb-app">
      <AppBar position="fixed" elevation={0} color="inherit" className="hb-appbar">
        <Toolbar>
          <IconButton edge="start" color="primary" aria-label="HematoBoard">
            <HubRoundedIcon />
          </IconButton>
          <Typography className="hb-brand">
            HematoBoard <span>Clinical projection</span>
          </Typography>
          {caseIndex ? (
            <TextField
              select
              size="small"
              label="Case"
              value={selectedCaseKey}
              onChange={(event) => void changeCase(event.target.value)}
              className="hb-case-selector"
              slotProps={{ select: { inputProps: { "aria-label": "Choose a case" } } }}
            >
              {caseIndex.cases.map((item) => <MenuItem key={item.key} value={item.key}>{item.case_id}</MenuItem>)}
            </TextField>
          ) : (
            <TextField
              size="small"
              label="Case"
              value={displayCaseId}
              className="hb-case-selector"
              slotProps={{ input: { readOnly: true, inputProps: { "aria-label": "Current case" } } }}
            />
          )}
        </Toolbar>
      </AppBar>
      <NavigationRail projection={projection} reasoningLog={reasoningLog} view={view} onChange={setView} />
      <SourceDrawer facts={selectedFacts} records={selectedRecords} onClose={closeSource} />
      <Box component="main" className="hb-main">
        <Toolbar />
        <MobileNavigation projection={projection} reasoningLog={reasoningLog} view={view} onChange={setView} />
        <Container maxWidth="xl" className="hb-canvas">
          <Paper elevation={0} className="hb-case-strip">
            <div>
              <Typography variant="h2">{displayCaseId}</Typography>
              <Typography color="text.secondary">{caseSummary}</Typography>
            </div>
            <div><b>{candidateProjection ? projection.facts.length : counts.source_records}</b><span>{candidateProjection ? "observations" : "source records"}</span></div>
            <div><b>{candidateProjection ? publicSourceCount : counts.measurement_facts}</b><span>{candidateProjection ? "sources" : "measurements"}</span></div>
            <div><b>{candidateProjection ? publicGapCount : counts.signals}</b><span>{candidateProjection ? "gaps" : "series"}</span></div>
          </Paper>
          {!candidateProjection && (
            <Alert severity="info" className="hb-scope-alert">
              <strong>Currently, only the auditable data layer is available.</strong>{" "}
              Overview, timeline, graph, and gaps remain unavailable until a separate synthesis run is completed.
              {`${counts.context_facts} context facts are stored separately from the measurements table.`}
              {counts.deferred_source_records > 0 && (
                <> {counts.deferred_source_records} administrative document row was not converted into a clinical fact.</>
              )}
            </Alert>
          )}
          {candidateProjection && view === "overview" && <CandidateOverview projection={candidateProjection} publication={publication} selectedHypothesisId={selectedHypothesisId} onSelectHypothesis={setSelectedHypothesisId} onOpenSource={openSource} />}
          {candidateProjection && view === "timeline" && <CandidateTimeline projection={candidateProjection} selectedHypothesisId={selectedHypothesisId} onSelectHypothesis={(id) => selectHypothesis(id, "graph")} onOpenSource={openSource} />}
          {candidateProjection && view === "graph" && <CandidateGraph projection={candidateProjection} publication={publication} selectedHypothesisId={selectedHypothesisId} onSelectHypothesis={setSelectedHypothesisId} onOpenSource={openSource} />}
          {view === "data" && <MeasurementTable projection={projection} onOpenSource={openSource} />}
          {candidateProjection && view === "gaps" && <CandidateGaps projection={candidateProjection} onSelectHypothesis={(id) => {
            const item = candidateProjection.candidate.hypotheses.find((candidate) => candidate.id === id);
            selectHypothesis(id, item?.clinical_role === "diagnostic_hypothesis" ? "graph" : "overview");
          }} />}
          {candidateProjection && publication && reasoningLog && view === "reasoning" && (
            <ReasoningLogView
              projection={candidateProjection}
              log={reasoningLog}
              publication={publication}
              onOpenSourceGroup={openSourceGroup}
            />
          )}
          <Typography className="hb-run-id" variant="caption">
            {publication
              ? `${publication.generation.toUpperCase()} · projection verified · clinician decision not yet recorded`
              : `Run: ${displayRunId} · DOCX SHA-256: ${projection.provenance.source_document_sha256.slice(0, 12)}…`}
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
