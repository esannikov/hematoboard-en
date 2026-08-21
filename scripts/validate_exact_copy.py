#!/usr/bin/env python3
"""Verify that the English build changes language, not dashboard architecture."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT.parent / "hematoboard-v2" / "ui"
PRODUCTION = ROOT.parent / "hematoboard-pages"
EN = ROOT / "source-ui"
CYRILLIC = re.compile(r"[А-Яа-яІіЇїЄєҐґ]")
STRING_RE = re.compile(r'"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`', re.DOTALL)
REGEX_RE = re.compile(r"/(?:\\.|[^/\n])+/[dgimsuvy]*")
JSX_TEXT_RE = re.compile(r">[^<>{}]*<")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def structural_signature(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    text = STRING_RE.sub('"STRING"', text)
    text = REGEX_RE.sub('/REGEX/', text)
    text = JSX_TEXT_RE.sub(">TEXT<", text)
    text = re.sub(r"\s+", "", text)
    return hashlib.sha256(text.encode()).hexdigest()


def functions(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    return re.findall(r"(?:function|const)\s+([A-Za-z_$][\w$]*)", text)


def jsx_tags(path: Path) -> list[str]:
    return re.findall(r"<([A-Z][A-Za-z0-9.]*)\b", path.read_text(encoding="utf-8"))


def architecture_signature(path: Path) -> str:
    payload = json.dumps({"functions": functions(path), "jsx_tags": jsx_tags(path)}, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()


def main() -> int:
    errors: list[str] = []
    source_main = TEMPLATE / "src/main.tsx"
    english_main = EN / "src/main.tsx"

    if sha(TEMPLATE / "src/styles.css") != sha(EN / "src/styles.css"):
        errors.append("source CSS differs from canonical production UI")
    production_css = next(PRODUCTION.glob("assets/index-6vemKrSR.css"))
    english_css = next((EN / "dist/assets").glob("*.css"))
    if sha(production_css) != sha(english_css):
        errors.append("compiled CSS differs from deployed Ukrainian dashboard")
    if functions(source_main) != functions(english_main):
        errors.append("function/component inventory differs")
    if jsx_tags(source_main) != jsx_tags(english_main):
        errors.append("JSX component/tag sequence differs")
    if len(source_main.read_text(encoding="utf-8").splitlines()) != len(english_main.read_text(encoding="utf-8").splitlines()):
        errors.append("React source line topology differs")

    for path in (english_main, EN / "src/types.ts", EN / "index.html"):
        if CYRILLIC.search(path.read_text(encoding="utf-8")):
            errors.append(f"Cyrillic remains in {path.relative_to(ROOT)}")

    index = json.loads((EN / "public/case-index.json").read_text(encoding="utf-8"))
    expected = ["CASE001", "CASE002", "CASE003"]
    if [item["case_id"] for item in index["cases"]] != expected:
        errors.append("selector is not exactly CASE001-CASE003")

    for case_id in expected:
        key = case_id.lower()
        package = json.loads((EN / f"public/{key}/public-dashboard.v1.json").read_text(encoding="utf-8"))
        if package["publication"]["display_case_id"] != case_id:
            errors.append(f"{case_id}: public identity mismatch")
        if package["publication"]["candidate_sha256"] != package["projection"]["candidate_sha256"]:
            errors.append(f"{case_id}: candidate hash mismatch")
        if package["projection"]["review_status"]["clinician_accepted"] is not False:
            errors.append(f"{case_id}: clinician status changed")

    deploy_pairs = [
        (ROOT / "index.html", EN / "dist/index.html"),
        (ROOT / "case-index.json", EN / "dist/case-index.json"),
        (ROOT / "assets/index-6vemKrSR.css", english_css),
    ]
    english_js = next((EN / "dist/assets").glob("*.js"))
    deploy_pairs.append((ROOT / f"assets/{english_js.name}", english_js))
    for case_id in expected:
        key = case_id.lower()
        deploy_pairs.append((ROOT / f"{key}/public-dashboard.v1.json", EN / f"dist/{key}/public-dashboard.v1.json"))
    for deployed, built in deploy_pairs:
        if not deployed.exists() or sha(deployed) != sha(built):
            errors.append(f"deployed root does not match verified build: {deployed.relative_to(ROOT)}")

    if errors:
        print("FAIL")
        for error in errors:
            print(f"- {error}")
        return 1
    print("PASS: English dashboard is a presentation-only copy of the canonical production UI")
    print(f"canonical_source_css_sha256: {sha(TEMPLATE / 'src/styles.css')}")
    print(f"compiled_css_sha256: {sha(english_css)}")
    print(f"react_architecture_sha256: {architecture_signature(english_main)}")
    print("component_available: true")
    print("case_wired: true")
    print("technical_verified: pending_browser_and_live_canary")
    print("clinician_accepted: false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
