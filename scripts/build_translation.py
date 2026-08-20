#!/usr/bin/env python3
"""Build a source-pinned English presentation of public HematoBoard cases."""

from __future__ import annotations

import argparse
import concurrent.futures
import copy
import datetime as dt
import hashlib
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


CYRILLIC = re.compile(r"[А-Яа-яІіЇїЄєҐґ]")
TRANSLATE_URL = "https://translate.googleapis.com/translate_a/single"

# Exact clinical terminology is protected before the general translation pass.
# Longest phrases are applied first so a shorter entry cannot fragment a diagnosis.
GLOSSARY = {
    "Огляд доказів": "Evidence review",
    "Первинне джерело": "Primary source",
    "Класифікація": "Classification",
    "Настанова": "Guideline",
    "Зріла лімфоїдна неоплазія зі спленічним або кістковомозковим представленням":
        "Mature lymphoid neoplasm with splenic or bone marrow involvement",
    "Інфекційний ендокардит або інша ендоваскулярна інфекція":
        "Infective endocarditis or another endovascular infection",
    "Мікобактеріальна, грибкова або інша глибока прихована інфекція":
        "Mycobacterial, fungal, or another deep-seated occult infection",
    "Хвороба Стілла дорослих або інший системний автозапальний синдром":
        "Adult-onset Still disease or another systemic autoinflammatory syndrome",
    "Системне захворювання сполучної тканини або імунокомплексний процес":
        "Systemic connective tissue disease or immune-complex-mediated process",
    "Васкуліт великих судин або інший серонегативний системний васкуліт":
        "Large-vessel vasculitis or another seronegative systemic vasculitis",
    "Можливе порушення гуморального імунітету з інфекційними або автоімунними проявами":
        "Possible humoral immune deficiency with infectious or autoimmune manifestations",
    "Солідна пухлина з пухлинною гарячкою": "Solid tumor associated with neoplastic fever",
    "Вузлове утворення лівої частки щитоподібної залози невизначеної природи":
        "Left thyroid lobe nodule of indeterminate nature",
    "Лікарська гарячка або медикаментозно індукована запальна реакція":
        "Drug fever or medication-induced inflammatory reaction",
    "Тромбоемболічний або інший стерильний судинний процес":
        "Thromboembolic or another sterile vascular process",
    "Первинна медіастинальна В-великоклітинна лімфома":
        "Primary mediastinal large B-cell lymphoma",
    "Класична лімфома Годжкіна, можливо нодулярно-склерозуючий варіант":
        "Classical Hodgkin lymphoma, possibly the nodular sclerosis subtype",
    "Медіастинальна сіра зона між PMBCL і класичною лімфомою Годжкіна":
        "Mediastinal gray zone lymphoma between PMBCL and classical Hodgkin lymphoma",
    "Класична волосатоклітинна лейкемія; зв’язок із кістковими осередками ще не доведений":
        "Classic hairy cell leukemia; a causal relationship with the bone lesions remains unproven",
    "Інша індолентна спленічна В-клітинна неоплазія: SBLPN, SMZL або SDRPL":
        "Another indolent splenic B-cell neoplasm: SBLPN, SMZL, or SDRPL",
    "CD10-позитивна фолікулярна лімфома з ураженням кісткового мозку":
        "CD10-positive follicular lymphoma with bone marrow involvement",
    "Плазмоклітинна неоплазія як причина кісткових змін":
        "Plasma cell neoplasm as the cause of the bone abnormalities",
    "Агресивна зріла В-клітинна лімфома з ураженням кісток, кісткового мозку або нерва":
        "Aggressive mature B-cell lymphoma involving bone, bone marrow, or nerve",
    "Окреме ураження скелета або нижньої щелепи поряд із реальним В-клітинним клоном":
        "A separate skeletal or mandibular disorder coexisting with a genuine B-cell clone",
    "Змішані клітинні популяції або аналітичний чи преаналітичний артефакт у проточній цитометрії, κ/λ або BRAF":
        "Mixed cell populations or an analytical or preanalytical artifact in flow cytometry, κ/λ, or BRAF testing",
    "Вторинний гемофагоцитарний синдром": "Secondary hemophagocytic syndrome",
    "Хвороба Кастлемана": "Castleman disease",
    "Т-лімфобластна лімфома": "T-lymphoblastic lymphoma",
    "Медіастинальна герміногенна пухлина": "Mediastinal germ cell tumor",
    "класична лімфома Годжкіна": "classical Hodgkin lymphoma",
    "волосатоклітинна лейкемія": "hairy cell leukemia",
    "трепанобіопсія кісткового мозку": "bone marrow trephine biopsy",
    "проточна цитометрія": "flow cytometry",
    "імунофенотипування": "immunophenotyping",
    "імунофенотип": "immunophenotype",
    "імунофенотипових": "immunophenotypic",
    "імунофенотиповий": "immunophenotypic",
    "імунофенотипово": "immunophenotypically",
    "імунофенотипу": "immunophenotype",
    "ІГХ": "IHC",
    "ПЕТ-КТ": "PET/CT",
    "ПЛР": "PCR",
    "МРТ": "MRI",
    "КТ": "CT",
    "ЛДГ": "LDH",
    "ШОЕ": "ESR",
    "С-реактивний білок": "C-reactive protein",
    "загальний аналіз крові": "complete blood count",
    "кісткового мозку": "bone marrow",
    "кістковий мозок": "bone marrow",
    "верхньої порожнистої вени": "superior vena cava",
    "верхня порожниста вена": "superior vena cava",
    "лімфома Ходжкіна": "Hodgkin lymphoma",
    "нодулярний склероз": "nodular sclerosis",
    "В-клітинна": "B-cell",
    "В-клітинної": "B-cell",
    "В-клітинний": "B-cell",
    "В-клітинних": "B-cell",
    "Т-клітинна": "T-cell",
    "Т-клітинної": "T-cell",
    "Од/л": "U/L",
    "млн/мкл": "million/µL",
}

# Bounded post-editing fixes recurring literal machine-translation errors while
# preserving the underlying clinical assertions and rank structure.
POST_EDITS = {
    "Attitude": "Guideline",
    "A review of the evidence": "Evidence review",
    "source solutions": "source review decisions",
    "source-grounded decisions": "source review decisions",
    "independent criticism": "independent critique",
    "Independent criticism": "Independent critique",
    "after criticism": "after critique",
    "differential series": "differential diagnosis",
    "working candidate": "candidate diagnosis",
    "initial configuration of the findings": "initial constellation of findings",
    "conditions for revision of the conclusion": "conditions that would prompt revision of the conclusion",
    "The doctor determines": "The clinician determines",
    "checked by a doctor": "reviewed by a clinician",
    "doctor's decision": "clinician decision",
    "clinical dynamics": "clinical course",
    "had a significant amplitude": "varied widely",
    "supports a systemic search": "supports a systemic diagnostic workup",
    "causal diagnostic directions": "diagnostic categories",
    "first place is occupied by": "leading hypothesis is",
    "The first place is occupied by": "The leading hypothesis is",
    "The second place is occupied by": "The second-ranked group comprises",
    "The second and third positions are occupied by": "The second- and third-ranked diagnoses are",
    "The third place goes to": "The third-ranked diagnosis is",
    "The fourth place is given to": "The fourth-ranked diagnosis is",
    "takes second place": "ranks second",
    "occupies the third position": "ranks third",
    "has the fourth rank": "ranks fourth",
    "is retained in the fifth position": "ranks fifth",
    "is in fifth place": "ranks fifth",
    "mature lymphoid neoplasia": "mature lymphoid neoplasm",
    "Mature lymphoid neoplasia": "Mature lymphoid neoplasm",
    "B-cell neoplasias": "B-cell neoplasms",
    "B-cell neoplasia": "B-cell neoplasm",
    "lymphoblastic neoplasia": "lymphoblastic neoplasm",
    "plasma cell neoplasia": "plasma cell neoplasm",
    "laboratory controls": "supporting laboratory findings",
    "Guidelines with lymphoma": "Lymphoma guidelines",
    "hidden infection": "occult infection",
    "hidden infectious route": "occult infection",
    "does not close a tuberculous, fungal or other": "does not exclude tuberculosis, fungal disease, or another",
    "Amplitude of C-reactive protein": "The magnitude of C-reactive protein variation",
    "nodule histology": "lymph-node histology",
    "nodule enlargement in two stations": "lymphadenopathy in at least two nodal stations",
    "nodular histology": "lymph-node histology",
    "nodular enlargement in at least two sites": "lymphadenopathy in at least two nodal stations",
    "tumor fever": "neoplastic fever",
    "medicinal fever": "drug fever",
    "causative center": "causative lesion",
    "profile support": "source support",
    "source collation": "source comparison",
    "Source collation": "Source comparison",
    "source clauses": "source propositions",
    "multinodular Castleman disease": "multicentric Castleman disease",
    "immunophenotypingm": "immunophenotyping",
    "complete blood count with WBC count": "complete blood count with differential",
    "Complete blood count with WBC count": "Complete blood count with differential",
    "accurate antibiotic binding": "precise timing relative to antibiotic exposure",
    "A separate security block": "A separate safety assessment",
    "Epidemiologic anamnesis": "The epidemiologic history",
    "an anamnesis of repeated infections": "a history of recurrent infections",
    "requires urgent eye assessment": "requires urgent in-person clinical assessment",
    "clinical materials": "case record",
    "medicinal chronology": "medication history",
    "The sterile vascular process": "A sterile vascular process",
    "Search for a biopsy-accessible cell": "Identify a biopsy-accessible lesion",
    "active cell": "active lesion",
    "Research bone marrow": "Evaluate the bone marrow",
    "Study bone marrow": "Bone marrow evaluation",
    "target imaging": "targeted imaging",
    "tumor disease": "malignancy",
    "night sweats appeared periodically": "intermittent night sweats occurred",
    "male gender": "male sex",
    "such dynamics of symptoms determine a wide oncohematological differential": "this symptom trajectory warrants a broad hematologic oncology differential diagnosis",
    "These signs have auxiliary weight": "These findings are supportive rather than diagnostic",
    "formation of the front, upper and middle mediastinum": "mass involving the anterior, superior, and middle mediastinum",
    "compression threat": "compressive risk",
    "The anatomical pattern directs the search": "The anatomic pattern directs the diagnostic workup",
    "ranked differential diagnosis includes": "ranked differential diagnosis comprises",
    "nodular-sclerosing variant": "nodular sclerosis subtype",
    "classic Hodgkin's lymphoma": "classical Hodgkin lymphoma",
    "classic Hodgkin lymphoma": "classical Hodgkin lymphoma",
    "germinogenic tumor": "germ cell tumor",
    "germinogenic branch": "germ cell tumor pathway",
    "germinogenic immunophenotype": "germ cell tumor immunophenotype",
    "germinal tumor": "germ cell tumor",
    "clinical and radiological picture": "clinicoradiologic picture",
    "Fabric classification": "Tissue classification",
    "Fabric verification": "Tissue verification",
    "massiveness of the process": "presence of bulky disease",
    "demarcated from": "that distinguishes it from",
    "T-cell affiliation": "T-cell lineage",
    "T-cell belongingness": "T-cell lineage",
    "bone marrow score": "bone marrow evaluation",
    "unrepresentative material": "nonrepresentative tissue",
    "Its assumption requires": "Its diagnosis requires",
    "Source mapping supports the delimiter tissue route": "Source comparison supports a tissue-based diagnostic pathway",
    "Source mapping maintains": "Source comparison maintains",
    "diagnostic guidelines for": "diagnostic pathways for",
    "morphological forks": "morphologic distinctions",
    "its own histological classification": "an established histologic classification",
    "determination of cellularity": "lineage assignment",
    "evaluation bone marrow": "bone marrow evaluation",
    "thick-needle biopsy": "core needle biopsy",
    "ultrasound examination of the testicles": "testicular ultrasonography",
    ". flow cytometry": ". Flow cytometry",
    "compliance with the norm": "whether values are within reference limits",
    "The erythrocyte unit is damaged": "The erythrocyte unit is corrupted",
    "five-component differential diagnosis": "five-diagnosis differential",
    "will enhance primary": "will strengthen primary",
    "will enhance mediastinal": "will strengthen mediastinal",
    "control the compressive risk": "monitor and manage the compressive risk",
    "immunophenotypei": "immunophenotype",
    "MRI CT": "multislice CT (MSCT)",
    "pathological changes bone marrow": "pathological bone marrow changes",
    "infiltration bone marrow": "bone marrow infiltration",
    "lesion bone marrow": "bone marrow involvement",
    "systemic involvement bone marrow": "systemic bone marrow involvement",
    "multifocal lesion bone marrow": "multifocal bone marrow involvement",
    "Complete blood count in": "The complete blood count in",
    "contained hemoglobin": "showed hemoglobin",
    "The growth of ESR": "The rise in ESR",
    "immunophenotyping punctate bone marrow": "immunophenotyping of the bone marrow aspirate",
    "The classic hairy cell leukemia": "Classic hairy cell leukemia",
    "Classic hairy cell leukemia takes first place": "Classic hairy cell leukemia is the leading hypothesis",
    "trepanobioptate": "trephine biopsy",
    "Trepanobioptate": "Trephine biopsy",
    "BRAF cellularity": "cell-specific attribution of BRAF",
    "visualization conclusion": "imaging findings",
    "increases the predominance": "increases the likelihood",
    "agreed morphological pattern": "concordant morphologic pattern",
    "accessible cell": "accessible lesion",
    "fixed cell population": "recorded cell population",
    "most informative cell available": "most informative accessible lesion",
    "representative bone cell": "representative bone lesion",
    "accurate κ/λ": "the exact κ/λ result",
    "Cell tissue": "Tissue from the lesion",
    "bone cells": "bone lesions",
    "Fabric verification of the most informative accessible lesion": "Tissue verification of the most informative accessible lesion",
    "Expert morphological and IHC classification bone marrow": "Expert morphologic and IHC classification of the bone marrow",
    "plasma cells bone marrow": "bone marrow plasma cells",
    "compare histology, IHC, flow cytometry, and BRAF in bone marrow and bone marrow": "compare histology, IHC, flow cytometry, and BRAF findings in the bone lesion and bone marrow",
    "not attribute all bone changes": "avoid attributing all bone changes",
    "internal discomfort": "generalized internal discomfort",
    "inferior alveolar nerve": "inferior alveolar nerve distribution",
    "Fabric": "Tissue",
    "germinogenic": "germ cell",
    "Germinogenic": "Germ cell",
    "unrepresentative": "nonrepresentative",
    "Male gender": "Male sex",
    "male gender": "male sex",
    "B-cell affiliation": "B-cell lineage",
    "A tissue cell available for biopsy": "A tissue lesion accessible for biopsy",
    "reasoning history": "reasoning narrative",
    "Reasoning history": "Reasoning narrative",
    "clinical course need to be updated": "clinical course needs to be updated",
    "combined clinical support and completeness of the available validation": "combined clinical support and completeness of the available evaluation",
    "splenic or bone marrow presentation": "splenic or bone marrow involvement",
    "are not given": "are not available",
    "adult-onset Still's disease": "adult-onset Still disease",
    "adult Still's disease": "adult-onset Still disease",
    "Still's disease in adults": "adult-onset Still disease",
    "Castleman's disease": "Castleman disease",
    "support the review": "support further evaluation",
    "possible violation of humoral immunity": "possible humoral immune deficiency",
    "oncohematologic pathway": "hematologic oncology pathway",
    "The working report is subject to review": "The working assessment should be reassessed",
    "initiation of etiological treatment": "initiation of disease-specific treatment",
    "physician's decision": "clinician review",
    "Young age, male sex and this symptom trajectory warrants": "Young age, male sex, and this symptom trajectory warrant",
    "a large anterior mediastinal conglomerate": "a large anterior mediastinal mass",
    "fully correspond to this nosology": "are fully compatible with this diagnosis",
    "belongs to critical diagnoses for timely exclusion": "is a critical diagnosis for timely exclusion",
    "will be decisive, and the bone marrow evaluation for the corresponding phenotype": "will be decisive, with bone marrow evaluation if the phenotype is compatible",
    "a separate classification nosology": "a distinct classification entity",
    "mediastinal gray area": "mediastinal gray zone lymphoma",
    "diagnostic delineation": "differential diagnosis",
    "There are no critical and significant comments": "There are no unresolved critical or major findings",
    "as the first working hypothesis": "as the leading working hypothesis",
    "excluded from histological delineation": "excluded from the histologic differential diagnosis",
    "will change the leading direction": "will shift the leading diagnosis",
    "will raise the position of": "will raise the rank of",
    "temporal pyramids": "petrous temporal bones",
    "characterize the time dynamics": "describe longitudinal values",
    "the imaging findings has a descriptive role": "the imaging findings have a descriptive role",
    "and the bone marrow lesion": "and bone marrow involvement",
    "significantly reduces its coherence": "makes it substantially less concordant",
    "must rule out multiple myeloma or plasmacytoma": "require exclusion of multiple myeloma or plasmacytoma",
    "will allow to evaluate the criteria of myeloma comprehensively": "will allow comprehensive evaluation of myeloma criteria",
    "reduce its consistency": "reduce its concordance",
    "review of the aspirate and trephine biopsy bone marrow": "review of the bone marrow aspirate and trephine biopsy",
    "Spleen, monocyte, and peripheral blood data": "Splenic findings, monocyte count, and peripheral blood morphology",
    "Tissue from the lesion should be matched to bone marrow": "Tissue from the lesion should be compared with bone marrow findings",
    "clinician decision remains binding": "clinician decision remains required",
    "BRAF cellular identity": "cell-specific attribution of BRAF",
    "regimen can be determined after": "treatment regimen should be determined only after",
    "medicinal and thromboembolic": "drug-related and thromboembolic",
    "medicinal fever": "drug fever",
    "profile diagnostic algorithms": "condition-specific diagnostic algorithms",
    "profile guideline": "condition-specific guideline",
    "profile sources": "condition-specific sources",
    "Morphological study of aspirate and trephine biopsy bone marrow": "Morphologic examination of the bone marrow aspirate and trephine biopsy",
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False) + "\n"
    path.write_text(encoded, encoding="utf-8")


def protect_terms(text: str) -> tuple[str, dict[str, str]]:
    protected = text
    replacements: dict[str, str] = {}
    for index, (source, target) in enumerate(sorted(GLOSSARY.items(), key=lambda item: len(item[0]), reverse=True)):
        if source not in protected:
            continue
        token = f"XQZTERM{index:04d}QZX"
        protected = protected.replace(source, token)
        replacements[token] = target
    return protected, replacements


def google_translate(text: str) -> str:
    protected, replacements = protect_terms(text)
    query = urllib.parse.urlencode({"client": "gtx", "sl": "uk", "tl": "en", "dt": "t", "q": protected})
    request = urllib.request.Request(f"{TRANSLATE_URL}?{query}", headers={"User-Agent": "Mozilla/5.0 HematoBoardTranslation/1.0"})
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.load(response)
            translated = "".join(part[0] for part in payload[0] if part and part[0])
            for token, target in replacements.items():
                translated = translated.replace(token, target).replace(token.lower(), target)
            translated = translated.replace("PET-CT", "PET/CT").replace("IHC profile", "IHC profile")
            translated = translated.replace("β-human chorionic gonadotropin", "β-human chorionic gonadotropin")
            return translated.strip()
        except Exception as exc:  # bounded retry for a public translation endpoint
            last_error = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Translation failed after four attempts: {last_error}")


def collect_cyrillic_strings(value: Any, target: set[str]) -> None:
    if isinstance(value, str):
        if CYRILLIC.search(value):
            target.add(value)
    elif isinstance(value, list):
        for item in value:
            collect_cyrillic_strings(item, target)
    elif isinstance(value, dict):
        for item in value.values():
            collect_cyrillic_strings(item, target)


def transform(value: Any, translations: dict[str, str]) -> Any:
    if isinstance(value, str):
        rendered = translations.get(value, value).replace("МСCT", "MSCT")
        for source, target in POST_EDITS.items():
            rendered = rendered.replace(source, target)
        return rendered
    if isinstance(value, list):
        return [transform(item, translations) for item in value]
    if isinstance(value, dict):
        return {key: transform(item, translations) for key, item in value.items()}
    return value


def reconcile_emphasis(package: dict[str, Any]) -> int:
    dropped = 0
    for paragraph in package["reasoning_log"]["narrative"]:
        text = paragraph["text"]
        lower = text.casefold()
        exact_terms: list[str] = []
        for term in paragraph["emphasis_terms"]:
            start = lower.find(term.casefold())
            if start >= 0:
                exact_terms.append(text[start:start + len(term)])
            else:
                dropped += 1
        paragraph["emphasis_terms"] = list(dict.fromkeys(exact_terms))
    return dropped


def assert_structure(source: Any, translated: Any, path: str = "$") -> None:
    if isinstance(source, dict):
        if source.keys() != translated.keys():
            raise AssertionError(f"Key mismatch at {path}")
        for key in source:
            assert_structure(source[key], translated[key], f"{path}.{key}")
    elif isinstance(source, list):
        if len(source) != len(translated):
            raise AssertionError(f"List length mismatch at {path}")
        for index, (left, right) in enumerate(zip(source, translated)):
            assert_structure(left, right, f"{path}[{index}]")
    elif isinstance(source, str):
        if not CYRILLIC.search(source) and source != translated:
            raise AssertionError(f"Non-Ukrainian string changed at {path}")
    elif source != translated:
        raise AssertionError(f"Scalar changed at {path}")


def package_for_web(source_package: dict[str, Any]) -> dict[str, Any]:
    """Keep the entire public-safe package so all clinical relations remain inspectable."""
    return copy.deepcopy(source_package)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--cases", nargs="+", default=["case001", "case002", "case003"])
    args = parser.parse_args()

    source_packages: dict[str, dict[str, Any]] = {}
    source_bytes: dict[str, bytes] = {}
    strings: set[str] = set()
    for case_key in args.cases:
        path = args.source_root / case_key / "public-dashboard.v1.json"
        raw = path.read_bytes()
        source_bytes[case_key] = raw
        package = package_for_web(json.loads(raw))
        source_packages[case_key] = package
        collect_cyrillic_strings(package, strings)

    cache: dict[str, str] = read_json(args.cache) if args.cache.exists() else {}
    pending = sorted(strings - cache.keys(), key=lambda item: (len(item), item))
    if pending:
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            futures = {executor.submit(google_translate, text): text for text in pending}
            for index, future in enumerate(concurrent.futures.as_completed(futures), start=1):
                source = futures[future]
                cache[source] = future.result()
                if index % 50 == 0 or index == len(pending):
                    print(f"translated {index}/{len(pending)} new strings", flush=True)
        write_json(args.cache, dict(sorted(cache.items())))

    manifest_cases: list[dict[str, Any]] = []
    case_index = {"schema_version": "hematoboard.en.case-index/1.0", "locale": "en", "cases": []}
    for case_key, source in source_packages.items():
        translated = transform(source, cache)
        assert_structure(source, translated)
        dropped = reconcile_emphasis(translated)
        translated["reasoning_log"]["title"] = "Clinical Reasoning Narrative"
        if translated["projection"]["review_status"]["clinician_accepted"] is not False:
            raise AssertionError(f"{case_key}: clinician status changed")
        if translated["publication"]["candidate_sha256"] != source["publication"]["candidate_sha256"]:
            raise AssertionError(f"{case_key}: candidate identity changed")

        out_path = args.output_root / case_key / "public-dashboard.en.v1.json"
        write_json(out_path, translated)
        rendered = out_path.read_bytes()
        residual = len(CYRILLIC.findall(rendered.decode("utf-8")))
        if residual:
            raise AssertionError(f"{case_key}: {residual} Cyrillic characters remain")
        display_id = translated["publication"]["display_case_id"]
        case_index["cases"].append({
            "key": case_key,
            "case_id": display_id,
            "data_path": f"data/{case_key}/public-dashboard.en.v1.json",
        })
        manifest_cases.append({
            "key": case_key,
            "display_case_id": display_id,
            "candidate_sha256": translated["publication"]["candidate_sha256"],
            "source_package_sha256": sha256_bytes(source_bytes[case_key]),
            "english_package_sha256": sha256_bytes(rendered),
            "translated_unique_strings": sum(1 for item in strings if item in json.dumps(source, ensure_ascii=False)),
            "dropped_non_exact_emphasis_terms": dropped,
            "clinician_accepted": False,
        })

    write_json(args.output_root / "case-index.json", case_index)
    write_json(args.output_root / "translation-manifest.json", {
        "schema_version": "hematoboard.en.translation-manifest/1.0",
        "locale": "en",
        "source_locale": "uk",
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "translation_route": "public-safe presentation translation with protected medical terminology",
        "clinical_claims_added": False,
        "cases": manifest_cases,
    })
    print(f"PASS: built {len(manifest_cases)} English case packages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
