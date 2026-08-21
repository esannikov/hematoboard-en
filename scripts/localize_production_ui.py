#!/usr/bin/env python3
"""Build an English source copy of the canonical HematoBoard React/MUI UI.

The script refuses source drift, copies the verified production UI source, and
changes only presentation language plus the public CASE001-003 data paths.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

from build_translation import CYRILLIC, google_translate, transform, write_json


EXPECTED_SOURCE_HASHES = {
    "src/main.tsx": "9ab2f87f9c6042aa023f80b40293674d3220c8f9ecb094d01baa9df4b969f3cb",
    "src/styles.css": "5b45f9788dcf5d3d11f4dc74a23f37d366fcf01238b56c89251b0ef89adf6fb4",
}

COPY_FILES = (
    "src/main.tsx",
    "src/styles.css",
    "src/types.ts",
    "index.html",
    "package.json",
    "package-lock.json",
    "vite.config.ts",
    "tsconfig.json",
    "public/favicon.svg",
    "public/anatomy-reference.png",
)

UI_POST_EDITS = {
    "Review": "Overview",
    "Timeline": "Timeline",
    "Graph": "Graph",
    "Data": "Data",
    "Gaps": "Gaps",
    "Log": "Reasoning",
    "Valid data projection not found.": "No valid data projection was found.",
    "Date not recorded": "Date not recorded",
    "Paragraph supports": "Paragraph evidence",
    "Exact text from DOCX": "Exact translated text from DOCX",
    "Restored unit": "Resolved unit",
    "Quantitative indicators": "Quantitative measurements",
    "Indicator": "Measurement",
    "The unit is not recorded": "Unit not recorded",
    "The unit is damaged in the source": "Source unit is corrupted",
    "no distinction": "does not discriminate",
    "Attitude": "Guideline",
    "Overview of evidence": "Evidence review",
    "Clinical hypothesis": "Diagnostic hypothesis",
    "Differential diagnoses": "Differential diagnoses",
    "Complications and clinical syndromes": "Complications and clinical syndromes",
    "Concomitant diseases and parallel processes": "Concurrent conditions and parallel processes",
    "Incident findings": "Incidental findings",
    "Data quality and representativeness": "Data quality and representativeness",
    "Leading diagnostic hypothesis": "Leading diagnostic hypothesis",
    "Differential diagnostic hypothesis": "Differential diagnostic hypothesis",
    "Candidate for medical examination.": "Candidate for clinician review.",
    "awaiting doctor's decision": "clinician decision pending",
    "Doctor's decision": "Clinician decision",
    "not yet recorded": "not yet recorded",
    "Supporting Facts": "Supporting facts",
    "What limits the conclusion": "What limits the conclusion",
    "Differential series": "Differential diagnosis",
    "Sources of diagnostic tests": "Source support for diagnostic verification",
    "Analysis and markers": "Laboratory tests and markers",
    "Tissues and IHC": "Tissue and IHC",
    "Consultations": "Consultations",
    "Clinical record": "Clinical record",
    "There are no clinical events in the projection for the timeline.": "No clinical events are available for the timeline.",
    "Contextual anatomical scheme": "Contextual anatomical reference",
    "Open source": "Open source record",
    "depersonalized record": "de-identified record",
    "Clinical significance of the record": "Clinical significance of this record",
    "Related records": "Related records",
    "Document sequence": "Document sequence",
    "Time scale": "Time scale",
    "Time cursor": "Time cursor",
    "Records without a clinical date": "Records without a confirmed clinical date",
    "Patient facts → hypotheses": "Patient facts → hypotheses",
    "Patient facts": "Patient facts",
    "Source traces": "Source traces",
    "Graph focus": "Graph focus",
    "Source address": "Source address",
    "Open fragment": "Open source record",
    "Related facts": "Related facts",
    "What is missing": "What is missing",
    "Source route not recorded": "Source route not recorded",
    "Urgent priority": "Urgent priority",
    "High priority": "High priority",
    "Medium priority": "Medium priority",
    "According to clinical indications": "When clinically indicated",
    "Mandatory classification check": "Required classification exclusion",
    "Key Discrimination Study": "Key discriminating test",
    "Additional research according to indications": "Conditional adjunct",
    "Emergency action on clinical trigger": "Urgent action if the clinical trigger is present",
    "Critical gaps": "Critical gaps",
    "Critical clinical issue": "Critical clinical question",
    "Verification plan": "Verification plan",
    "Clinical condition of emergency": "Urgency trigger",
    "Clinical context": "Clinical context",
    "Differential search": "Differential diagnosis",
    "Hypotheses and diagnoses": "Hypotheses and diagnoses",
    "Source mapping": "Evidence comparison",
    "Questions and next steps": "Questions and next steps",
    "Independent criticism": "Independent critique",
    "Summary and Terms of Review": "Conclusion and revision criteria",
    "Candidate for verification": "Candidate for clinician review",
    "Show support": "Show source support",
    "Show supports": "Show source supports",
    "Protocol sources": "Protocol sources",
    "Open publication": "Open publication",
    "Passing receipt": "Run receipt",
    "Public case": "Public case",
    "Full transit time": "Total run time",
    "Model calls": "Model calls",
    "Attempts of independent criticism": "Independent critique attempts",
    "Unresolved essential remarks": "Unresolved major findings",
    "Language check": "Language review",
    "Projection check": "Projection verification",
    "passed": "passed",
    "HematoBoard navigation": "HematoBoard navigation",
    "HematoBoard Mobile Navigation": "HematoBoard mobile navigation",
    "Projection failed to load.": "The projection could not be loaded.",
    "Loading projection": "Loading projection",
    "Clinical projection": "Clinical projection",
    "Case": "Case",
    "Select Case": "Select case",
    "Current case": "Current case",
    "observations": "observations",
    "source records": "source records",
    "sources": "sources",
    "measurements": "measurements",
    "gaps": "gaps",
    "series": "series",
    "the projection has been verified": "projection verified",
    "the doctor's decision has not yet been recorded": "clinician decision not yet recorded",
}

CODE_POST_EDITS = {
    'label: "Earl"': 'label: "Graph"',
    '"Analyzes and markers"': '"Laboratory tests and markers"',
    '"Associated diseases and parallel processes"': '"Concurrent conditions and parallel processes"',
    '"Concomitant disease or parallel process"': '"Concurrent condition or parallel process"',
    '"Accidental find"': '"Incidental finding"',
    '"Accidental findings"': '"Incidental findings"',
    '"clinical resistance"': '"clinical support"',
    '"does not distinguish"': '"does not discriminate"',
    '"Deterministic transfer of quantitative data from already depersonalized DOCX."': '"Deterministic transfer of quantitative data from an already de-identified DOCX."',
    '"The patient\'s clinical data was transferred from the already depersonalized DOCX."': '"The patient\'s clinical data was transferred from the already de-identified DOCX."',
    'already depersonalized DOCX': 'already de-identified DOCX',
    '"impersonal record"': '"de-identified record"',
    '"No source route recorded"': '"Source route not recorded"',
    '"No valid data projection found."': '"No valid data projection was found."',
    '"Open source record recording"': '"Open source record"',
    '"Order of records in DOCX"': '"Record order in DOCX"',
    '"Projection loading"': '"Loading projection"',
    '"Show resistance"': '"Show source support"',
    '"Summary and viewing conditions"': '"Conclusion and revision criteria"',
    '"the unit is damaged at the source"': '"source unit is corrupted"',
    '"waiting for the clinician decision"': '"clinician decision pending"',
    '"WITH."': '"p."',
    '"A critical clinical issue"': '"Critical clinical question"',
    '"A key differential study"': '"Key discriminating test"',
    '"Additional research as indicated"': '"Conditional adjunct"',
    '"Immediate action on a clinical trigger"': '"Urgent action if the clinical trigger is present"',
    '"Immediate priority"': '"Urgent priority"',
    'Open source record record for': 'Open source record for',
    'Open source record record': 'Open source record',
    'waiting for the clinician decision': 'clinician decision pending',
    '"uk")': '"en")',
    'The line reproduces the recorded communication type. Its thickness and number are not the probability of diagnosis.': 'The line reproduces the recorded relation type. Its thickness and count do not represent diagnostic probability.',
    'Source tracks': 'Source traces',
    'Select a hypothesis or fact to test connections and origins.': 'Select a hypothesis or fact to inspect relations and provenance.',
    'Clinical condition of urgency:': 'Urgency trigger:',
    'Candidate for inspection': 'Candidate for clinician review',
    'Pass receipt': 'Run receipt',
    'Full passage time': 'Total run time',
    'Model challenges': 'Model calls',
    'Attempts at independent critique': 'Independent critique attempts',
    'Unresolved significant comments': 'Unresolved major findings',
    'Which limits the conclusion': 'What limits the conclusion',
    'Source supports of diagnostic checks': 'Source support for diagnostic verification',
    '>close<': '>Close<',
    '"rows"': '"series"',
    'There are no indicators for this request.': 'No measurements match this query.',
    '${minutes} min ${remainder} p': '${minutes} min ${remainder} s',
    '${remainder} p': '${remainder} s',
    'projection checked': 'projection verified',
    'Pass: ${displayRunId}': 'Run: ${displayRunId}',
    'indicator table': 'measurements table',
    'У тексті виділено ': 'The text highlights ',
    ', використані в цьому абзаці міркування.': ', used in this reasoning paragraph.',
    ' · абзац ': ' · paragraph ',
    'Один ряд відповідає одному сумісному ряду вимірювань. Назва, значення, одиниця і джерело зберігаються окремо.': 'Each row represents one compatible measurement series. Name, value, unit, and source remain separate.',
    ' вимірювань · ': ' measurements · ',
    ' рядів': ' series',
    'Стандартні гематологічні одиниці можуть бути відновлені детермінованим правилом; точний текст джерела залишається незмінним.': 'Standard hematology units may be resolved by a deterministic rule; the exact source text remains unchanged.',
    'Незалежний критик пройдено. Остаточний діагноз і лікувальне рішення визначає лікар.': 'Independent critique passed. The clinician determines the final diagnosis and treatment decision.',
    'Візуалізація, морфологія та кількісні дані показані перед загальними симптомами. Спільні факти позначено окремо.': 'Imaging, morphology, and quantitative data are shown before general symptoms. Shared facts are identified separately.',
    'Відкрити джерельний запис': 'Open source record',
    'Джерела обґрунтовують критерії та наступні діагностичні кроки. Висновок щодо конкретного пацієнта формує лікар після клінічної верифікації.': 'Sources support criteria and subsequent diagnostic steps. The clinician reaches a patient-specific conclusion after clinical verification.',
    '"спостереження"': '"observation"',
    '"спостережень"': '"observations"',
    'Клінічне значення запису · ': 'Clinical significance of this record · ',
    'Пов’язані записи · ': 'Related records · ',
    'Записи без клінічної дати · ': 'Records without a confirmed clinical date · ',
    'Записані зв’язки з гіпотезами: ': 'Recorded hypothesis relations: ',
    'Приблизно ': 'Approximately ',
    ' хв читання': ' min read',
    'Джерела: ': 'Sources: ',
    'Джерела протоколу · ': 'Protocol sources · ',
    'Відкрити публікацію': 'Open publication',
    'Огляд, таймлайн, граф і прогалини залишаються вимкненими до окремого запуску синтезу.': 'Overview, timeline, graph, and gaps remain unavailable until a separate synthesis run is completed.',
    ' службовий рядок документа не перетворено на клінічний факт.': ' administrative document row was not converted into a clinical fact.',
}


STRING_RE = re.compile(r'"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`', re.DOTALL)
JSX_TEXT_RE = re.compile(r">([^<>{}\n]*[А-Яа-яІіЇїЄєҐґ][^<>{}\n]*)<")
INTERPOLATION_RE = re.compile(r"\$\{[^{}]+\}")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def post_edit(text: str) -> str:
    rendered = text
    for source, target in sorted(UI_POST_EDITS.items(), key=lambda item: len(item[0]), reverse=True):
        rendered = rendered.replace(source, target)
    return rendered


def translate_value(text: str, cache: dict[str, str]) -> str:
    if not CYRILLIC.search(text):
        return post_edit(text)
    if text not in cache:
        cache[text] = google_translate(text)
    return post_edit(transform(text, cache))


def translate_code(source: str, cache: dict[str, str]) -> str:
    def string_replacement(match: re.Match[str]) -> str:
        token = match.group(0)
        quote = token[0]
        content = token[1:-1]
        if not CYRILLIC.search(content):
            return token.replace("uk-UA", "en-GB")
        placeholders: dict[str, str] = {}
        if quote == "`":
            for index, interpolation in enumerate(INTERPOLATION_RE.findall(content)):
                placeholder = f"XQZEXPR{index:03d}QZX"
                placeholders[placeholder] = interpolation
                content = content.replace(interpolation, placeholder)
        translated = translate_value(content, cache)
        for placeholder, interpolation in placeholders.items():
            translated = translated.replace(placeholder, interpolation).replace(placeholder.lower(), interpolation)
        if quote == '"':
            return json.dumps(translated, ensure_ascii=False)
        return f"`{translated.replace('`', '\\`')}`"

    rendered = STRING_RE.sub(string_replacement, source)

    def jsx_replacement(match: re.Match[str]) -> str:
        raw = match.group(1)
        leading = raw[: len(raw) - len(raw.lstrip())]
        trailing = raw[len(raw.rstrip()):]
        translated = translate_value(raw.strip(), cache)
        return f">{leading}{translated}{trailing}<"

    rendered = JSX_TEXT_RE.sub(jsx_replacement, rendered)
    rendered = rendered.replace("uk-UA", "en-GB")
    rendered = rendered.replace("/^(?:Стать|Вік)\\s*:\\s*/i", "/^(?:Sex|Age)\\s*:\\s*/i")
    rendered = rendered.replace("/стать/i", "/sex/i").replace("/вік/i", "/age/i")
    rendered = rendered.replace("/(\\d+)\\s+років/i", "/(\\d+)\\s+years?/i")
    rendered = rendered.replace("/сторінка\\s*(\\d+)/i", "/page\\s*(\\d+)/i")
    rendered = rendered.replace('/^(?:p\\.|с\\.)\\s*\\d+/i', '/^p\\.\\s*\\d+/i')
    rendered = rendered.replace('.replace(/^p\\./i, "S.")', '.replace(/^p\\./i, "p.")')
    for source, target in CODE_POST_EDITS.items():
        rendered = rendered.replace(source, target)
    return rendered


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--template-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--english-data-root", type=Path, required=True)
    parser.add_argument("--cache", type=Path, required=True)
    args = parser.parse_args()

    for relative, expected in EXPECTED_SOURCE_HASHES.items():
        actual = sha256(args.template_root / relative)
        if actual != expected:
            raise SystemExit(f"FAIL: verified production UI source drifted at {relative}: {actual}")

    for relative in COPY_FILES:
        source = args.template_root / relative
        target = args.output_root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)

    cache = json.loads(args.cache.read_text(encoding="utf-8")) if args.cache.exists() else {}
    main_path = args.output_root / "src/main.tsx"
    main_path.write_text(translate_code(main_path.read_text(encoding="utf-8"), cache), encoding="utf-8")
    types_path = args.output_root / "src/types.ts"
    types_path.write_text(translate_code(types_path.read_text(encoding="utf-8"), cache), encoding="utf-8")

    index_path = args.output_root / "index.html"
    index = index_path.read_text(encoding="utf-8")
    index = index.replace('lang="uk"', 'lang="en"')
    index = index.replace(
        "HematoBoard v2 — read-only клінічна проєкція з джерельними опорами та протоколом міркувань.",
        "HematoBoard v2 — read-only clinical projection with source support and a clinical reasoning record.",
    )
    index = index.replace("HematoBoard v2 · Клінічна проєкція", "HematoBoard v2 · Clinical Projection")
    index_path.write_text(index, encoding="utf-8")

    case_index = {"schema_version": "hematoboard.public-case-index/2.0.0", "cases": []}
    for number in (1, 2, 3):
        key = f"case{number:03d}"
        source = args.english_data_root / key / "public-dashboard.en.v1.json"
        target = args.output_root / "public" / key / "public-dashboard.v1.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        case_index["cases"].append({
            "key": key,
            "case_id": f"CASE{number:03d}",
            "source_case_id": f"CASE{number:03d}",
            "data_path": f"{key}/public-dashboard.v1.json",
        })
    write_json(args.output_root / "public/case-index.json", case_index)
    write_json(args.cache, dict(sorted(cache.items())))

    residual_files = []
    for path in (main_path, types_path, index_path):
        if CYRILLIC.search(path.read_text(encoding="utf-8")):
            residual_files.append(str(path))
    if residual_files:
        print("WARN: Cyrillic remains for targeted manual localization:")
        for path in residual_files:
            print(path)
    print("PASS: copied verified production UI source and applied English presentation localization")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
