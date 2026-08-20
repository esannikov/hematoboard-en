# HematoBoard — English Clinical Projection

This repository publishes English, read-only presentation translations of
HematoBoard CASE001–003. Each case remains a source-pinned candidate for
clinician review. The site does not present a confirmed diagnosis or treatment
recommendation.

The Ukrainian public packages remain the source projections. Translation does
not change case identity, candidate SHA-256, ranks, relations, workup, gaps,
source identity, or clinician status.

## Rebuild

```bash
python3 scripts/build_translation.py \
  --source-root ../hematoboard-pages \
  --output-root data \
  --cache scripts/translation-cache.json
```

Serve the repository root over HTTP and open `index.html`.
