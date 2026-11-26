# HematoBoard — English edition (unofficial)

Live: https://esannikov.github.io/hematoboard-en/

English translation of the public HematoBoard v2 clinician dashboard (v0.2.9.50) for three cases: **CASE029, CASE027, CASE001**.

- Everything visible in the interface and in the case data (including expanded details, tooltips and labels) was translated from Ukrainian.
- **This is not a clinician-reviewed translation.** The content is candidate reasoning for review, not a diagnosis.
- The Ukrainian originals and the Ukrainian publication are unchanged; this repository is a separate build.
- Audio narration is omitted (it is bound to the Ukrainian package).
- A few quoted source tokens (e.g. «МОС», «в/х») are kept as written in the source documents.

## Rebuild

`tools/build_en.py` takes the Ukrainian `ui/dist-public` and the `scripts/premium-ux` overlay, applies the dictionary
(`tools/registry.json` ids + `tools/translations.txt` + `tools/extra.json`) to case packages, the renderer and the overlay,
and writes a static site. `tools/crawl_en.py` opens every view with details expanded and reports any remaining Cyrillic text.
Paths at the top of `build_en.py` need adjusting for your machine.
