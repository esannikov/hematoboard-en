#!/usr/bin/env python3
"""Fail-closed checks for the English HematoBoard public projection."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CYRILLIC = re.compile(r"[А-Яа-яІіЇїЄєҐґ]")
EXPECTED = {"case001": "CASE001", "case002": "CASE002", "case003": "CASE003"}
NARRATIVE_KINDS = {"context", "differential", "hypothesis", "evidence", "action", "critic", "conclusion"}
BANNED_TRANSLATIONS = {
    "source solutions",
    "independent criticism",
    "differential series",
    "working candidate",
    "germinogenic",
    "unrepresentative",
    "immunophenotypingm",
    "urgent eye assessment",
    "trepanobioptate",
    "fabric verification",
    "male gender",
}


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    errors: list[str] = []
    index = load(ROOT / "data/case-index.json")
    manifest = load(ROOT / "data/translation-manifest.json")
    if index.get("locale") != "en":
        errors.append("case index locale is not en")
    if {item["key"]: item["case_id"] for item in index["cases"]} != EXPECTED:
        errors.append("case index is not exactly CASE001-CASE003")
    manifest_by_key = {item["key"]: item for item in manifest["cases"]}

    for entry in index["cases"]:
        case_key = entry["key"]
        path = ROOT / entry["data_path"]
        package = load(path)
        text = path.read_text(encoding="utf-8")
        projection = package["projection"]
        candidate = projection["candidate"]
        log = package["reasoning_log"]

        if CYRILLIC.search(text):
            errors.append(f"{case_key}: Cyrillic remains")
        lowered = text.casefold()
        for phrase in BANNED_TRANSLATIONS:
            if phrase in lowered:
                errors.append(f"{case_key}: banned translation remains: {phrase}")
        if package["publication"]["display_case_id"] != EXPECTED[case_key]:
            errors.append(f"{case_key}: public case identity mismatch")
        allowed_internal_ids = {EXPECTED[case_key], package["publication"].get("archived_source_case_id")}
        if projection["case"]["id"] not in allowed_internal_ids:
            errors.append(f"{case_key}: projection case identity is neither public scope nor recorded archive alias")
        if package["publication"]["candidate_sha256"] != projection["candidate_sha256"]:
            errors.append(f"{case_key}: candidate hash mismatch inside package")
        if projection["review_status"]["clinician_accepted"] is not False or log["audit"]["clinician_accepted"] is not False:
            errors.append(f"{case_key}: clinician status is not fail-closed")
        if projection["review_status"]["projection_verified"] is not True or log["audit"]["projection_verified"] is not True:
            errors.append(f"{case_key}: projection status is not verified")
        kinds = {item["kind"] for item in log["narrative"]}
        if kinds != NARRATIVE_KINDS:
            errors.append(f"{case_key}: narrative kinds mismatch: {sorted(kinds)}")
        for paragraph in log["narrative"]:
            for term in paragraph["emphasis_terms"]:
                if term.casefold() not in paragraph["text"].casefold():
                    errors.append(f"{case_key}: non-exact emphasis term in {paragraph['id']}")

        hypotheses = {item["id"]: item for item in candidate["hypotheses"]}
        diagnostic = sorted(item["rank"] for item in hypotheses.values() if item["clinical_role"] == "diagnostic_hypothesis")
        if diagnostic != list(range(1, len(diagnostic) + 1)):
            errors.append(f"{case_key}: diagnostic ranks are not contiguous")
        if any(item["rank"] is not None for item in hypotheses.values() if item["clinical_role"] != "diagnostic_hypothesis"):
            errors.append(f"{case_key}: a non-diagnostic item has a rank")

        facts = {item["id"] for item in projection["facts"]}
        signals = {item["id"] for item in projection["signals"]}
        evidence = {item["id"] for item in candidate["external_evidence"]}
        workup = {item["id"] for item in candidate["workup"]}
        gaps = {item["id"] for item in candidate["critical_gaps"]}
        for relation in candidate["relations"]:
            if relation["source_id"] not in facts | signals or relation["hypothesis_id"] not in hypotheses:
                errors.append(f"{case_key}: dangling candidate relation")
        for item in candidate["workup"]:
            if not set(item["discriminates"]) <= hypotheses.keys() or not set(item["evidence_refs"]) <= evidence:
                errors.append(f"{case_key}: dangling workup reference in {item['id']}")
        for item in candidate["critical_gaps"]:
            if not set(item["hypothesis_ids"]) <= hypotheses.keys() or not set(item["evidence_refs"]) <= evidence:
                errors.append(f"{case_key}: dangling gap reference in {item['id']}")
        allowed_graph_nodes = facts | signals | set(hypotheses) | evidence | workup | gaps
        if any(node["id"] not in allowed_graph_nodes for node in projection["justification_graph"]["nodes"]):
            errors.append(f"{case_key}: graph contains an unknown node")
        if manifest_by_key[case_key]["candidate_sha256"] != package["publication"]["candidate_sha256"]:
            errors.append(f"{case_key}: manifest candidate hash mismatch")
        if manifest_by_key[case_key]["english_package_sha256"] != sha256(path):
            errors.append(f"{case_key}: manifest package hash mismatch")
        if manifest_by_key[case_key]["clinician_accepted"] is not False:
            errors.append(f"{case_key}: manifest clinician status mismatch")

    for asset in (ROOT / "index.html", ROOT / "styles.css", ROOT / "app.js"):
        if CYRILLIC.search(asset.read_text(encoding="utf-8")):
            errors.append(f"{asset.name}: Cyrillic remains")
    if 'lang="en"' not in (ROOT / "index.html").read_text(encoding="utf-8"):
        errors.append("index.html language is not en")

    if errors:
        print("FAIL")
        for error in errors:
            print(f"- {error}")
        return 1
    print("PASS: CASE001-CASE003 English projection is structurally closed")
    print("component_available: true")
    print("case_wired: true")
    print("technical_verified: true")
    print("clinician_accepted: false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
