# HematoBoard — English Clinical Projection

This repository publishes a presentation-only English copy of the canonical
HematoBoard React/MUI dashboard for CASE001–003. It preserves the production
layout, navigation, overview, Clinical Spine timeline, fact-to-hypothesis
graph, data table, gaps, reasoning log, source drawer, and responsive behavior.

Each case remains a source-pinned candidate for clinician review. The site does
not present a confirmed diagnosis or treatment recommendation.

The Ukrainian public packages remain the source projections. Translation does
not change case identity, candidate SHA-256, ranks, relations, workup, gaps,
source identity, or clinician status.

## Rebuild

```bash
python3 scripts/build_translation.py \
  --source-root ../hematoboard-pages \
  --output-root data \
  --cache scripts/translation-cache.json

python3 scripts/localize_production_ui.py \
  --template-root ../hematoboard-v2/ui \
  --output-root source-ui \
  --english-data-root data \
  --cache scripts/translation-cache.json

npm --prefix source-ui ci
npm --prefix source-ui run build:app
python3 scripts/validate_publication.py
python3 scripts/validate_exact_copy.py
```

The root GitHub Pages files are copied from `source-ui/dist` after all gates pass.
