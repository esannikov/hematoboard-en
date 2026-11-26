/* 00-core.js */
// HB UX core — shared helpers for the Premium shell overlay.
// The overlay reads the same public package the renderer reads; it never writes data.
(() => {
  const cache = {};
  const decode = b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  };
  // Synchronous read keeps every enhancement a pure function of the current DOM + package.
  function loadCase(id) {
    if (!/^case\d{3,}(?:-v\d+)?$/.test(id || '')) return null;
    if (cache[id] !== undefined) return cache[id];
    const key = id + '/public-dashboard.v1.json';
    let text = null;
    try {
      if (location.protocol === 'file:') {
        // Offline catalog arrives asynchronously; do not cache a miss before it is ready.
        if (!window.hbFileCatalog) return null;
        const enc = window.hbFileCatalog[key];
        if (typeof enc === 'string') text = decode(enc);
      } else {
        const x = new XMLHttpRequest();
        x.open('GET', new URL('./' + key, document.baseURI).href, false);
        x.send();
        if (x.status === 200) text = x.responseText;
      }
      cache[id] = text ? JSON.parse(text) : null;
    } catch (e) { cache[id] = null; }
    return cache[id];
  }

  // Short bibliographic handle: organisation acronym + year when the title names one,
  // otherwise the first words of the title. Full title always stays available.
  const ORGS = [
    [/American Society of Hematology/i, 'ASH'], [/International Myeloma Working Group/i, 'IMWG'],
    [/European Hematology Association/i, 'EHA'], [/European Society for Medical Oncology|\bESMO\b/, 'ESMO'],
    [/\bNCCN\b|National Comprehensive Cancer Network/, 'NCCN'], [/\(PDQ®?\)|\bPDQ\b/, 'NCI PDQ'],
    [/Society of Skeletal Radiology/i, 'SSR'], [/\bISUOG\b/, 'ISUOG'], [/\bWFNS\b/, 'WFNS'],
    [/European Expert Panel/i, 'European Expert Panel'], [/AO Spine/i, 'AO Spine'],
    [/World Health Organization|\bWHO\b/, 'WHO'], [/International Consensus Classification|\bICC\b/, 'ICC'],
  ];
  function shortCitation(title, year) {
    const t = String(title || '');
    for (const [re, name] of ORGS) if (re.test(t)) return name + (year ? ' ' + year : '');
    const w = t.split(/\s+/).filter(Boolean);
    const head = w.length > 6 ? w.slice(0, 6).join(' ') + '…' : t;
    return head + (year ? ', ' + year : '');
  }

  window.HBUX = {
    loadCase,
    shortCitation,
    caseId: () => (new URLSearchParams(location.search).get('case') || '').toLowerCase(),
    view: () => new URLSearchParams(location.search).get('view'),
    esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    plural: (n, one, few, many) => n + ' ' + (n === 1 ? one : many),
    // setTimeout, not requestAnimationFrame: rAF pauses in background tabs.
    observe(fn, opts) {
      let queued = false;
      const run = () => { queued = false; try { fn(); } catch (e) { console.warn('[hb-ux]', e); } };
      new MutationObserver(() => { if (!queued) { queued = true; setTimeout(run, 16); } })
        .observe(document.documentElement, Object.assign({ subtree: true, childList: true }, opts || {}));
      run();
      return () => { if (!queued) { queued = true; setTimeout(run, 16); } };
    },
  };
})();

/* 10-a11y.js */
// HB UX FIX: a11y — readiness chip is not an emergency; role="alert" made screen readers
// interrupt on every load. Downgrade to a polite status. Survives React re-renders.
(() => {
  const fix = () => document.querySelectorAll('.hb-readiness[role="alert"]')
    .forEach(el => { el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); });
  new MutationObserver(fix).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['role'] });
  fix();
})();

/* 20-evidence.js */
// HB UX FIX: evidence block tidy-up (text nodes only, re-applied after React renders)
(() => {
  const tidy = () => {
    document.querySelectorAll('.hb-arg__source').forEach(b => {
      const t = (b.textContent || '').trim();
      if (t === 'Source' && b.dataset.generic !== 'true') b.dataset.generic = 'true';
    });
    document.querySelectorAll('.hb-arg__text strong').forEach(s => {
      for (const n of s.childNodes) if (n.nodeType === 3 && /:\s*-\s+/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/:\s*-\s+/, ': ');
    });
    document.querySelectorAll('.hb-item-evidence__support, .hb-item-evidence__refute, .hb-item-neutral').forEach(sec => {
      const h = sec.querySelector(':scope > .hb-item-heading'); if (!h) return;
      const n = String(sec.querySelectorAll('.hb-arg').length);
      if (sec.dataset.empty !== 'true' && h.dataset.count !== n) h.dataset.count = n;
    });
  };
  new MutationObserver(tidy).observe(document.documentElement, { subtree: true, childList: true });
  tidy();
})();

/* 30-history.js */
// HB UX FIX: "Хронологія" — vertical case journey (CASE028-style) on the timeline view
(() => {
  const KIND = {
    laboratory_panel:   { label: 'Labs',      cls: 'lab' },
    imaging_study:      { label: 'Imaging', cls: 'img' },
    pathology_procedure:{ label: 'Morphology',   cls: 'path' },
    consultation:       { label: 'Consultations', cls: 'cons' },
  };
  const kindOf = k => KIND[k] || { label: 'Other', cls: 'other' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dmy = d => d ? d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4) : '';
  const dm = d => d ? d.slice(8, 10) + '.' + d.slice(5, 7) : '';
  const plural = (n, one, few, many) => n + ' ' + (n === 1 ? one : many);
    let filter = 'all';

  const params = () => new URLSearchParams(location.search);
  const caseId = () => (params().get('case') || '').toLowerCase();
  const isTimeline = () => params().get('view') === 'timeline';
  let curMode = 'journey';
  const mode = () => curMode;

  const load = id => { const d = window.HBUX.loadCase(id); return d ? d.clinical_history || null : null; };


  function model(h) {
    const findings = {};
    for (const f of h.findings || []) (findings[f.event_id] ||= []).push(f);
    return (h.events || []).map(e => {
      const adm = (e.administrative_dates || []).map(a => a.date).filter(Boolean).sort()[0] || null;
      const fs = findings[e.id] || [];
      let snippet = '';
      const f = fs.find(x => x.finding_type_label === 'clinical description') || fs[0];
      if (f && f.text) {
        snippet = f.text;
        const lit = (e.literal || '').trim();
        if (lit && snippet.startsWith(lit)) snippet = snippet.slice(lit.length).replace(/^[\s:.–—-]+/, '');
        if (snippet.length > 190) snippet = snippet.slice(0, 186).replace(/\s+\S*$/, '') + '…';
      }
      return {
        id: e.id, title: e.literal, kind: e.event_kind,
        date: e.date || null, docDate: e.date ? null : adm,
        sortDate: e.date || adm || '9999-99-99',
        obs: e.observation_count || 0, finds: e.finding_count || fs.length, snippet,
      };
    }).sort((a, b) => a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title, 'en'));
  }

  function cardHTML(ev) {
    const k = kindOf(ev.kind);
    const meta = [ev.obs ? plural(ev.obs, 'value', 'values', 'values') : '', ev.finds ? plural(ev.finds, 'description', 'descriptions', 'descriptions') : ''].filter(Boolean).join(' · ');
    return `<article class="hbj-card hbj-${k.cls}" data-kind="${esc(ev.kind)}">
      <div class="hbj-card__main">
        <span class="hbj-tag">${esc(k.label)}</span>
        <h4>${esc(ev.title)}</h4>
        ${ev.snippet ? `<p>${esc(ev.snippet)}</p>` : ''}
        ${meta ? `<small>${esc(meta)}</small>` : ''}
      </div>
      <button type="button" class="hbj-open" data-event="${esc(ev.id)}" data-date="${esc(ev.date || '')}">Record and source<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    </article>`;
  }

  function render(root, h) {
    const all = model(h);
    const counts = {};
    for (const e of all) counts[e.kind] = (counts[e.kind] || 0) + 1;
    const list = all.filter(e => filter === 'all' || e.kind === filter);
    const dated = list.filter(e => e.date || e.docDate);
    const undated = list.filter(e => !e.date && !e.docDate);
    const exact = all.filter(e => e.date).map(e => e.date).sort();
    const period = exact.length ? `${dmy(exact[0])} — ${dmy(exact.at(-1))}` : '';

    // group: year -> date -> events
    const years = new Map();
    for (const e of dated) {
      const y = e.sortDate.slice(0, 4);
      if (!years.has(y)) years.set(y, new Map());
      const key = (e.date ? 'x' : 'd') + e.sortDate;
      const g = years.get(y);
      if (!g.has(key)) g.set(key, []);
      g.get(key).push(e);
    }

    const chips = [['all', 'All', all.length], ...Object.keys(KIND).filter(k => counts[k]).map(k => [k, KIND[k].label, counts[k]])]
      .map(([k, l, n]) => `<button type="button" class="hbj-chip${filter === k ? ' is-on' : ''}" data-filter="${k}" aria-pressed="${filter === k}">${esc(l)}<b>${n}</b></button>`).join('');

    let body = '';
    for (const [y, groups] of years) {
      body += `<section class="hbj-year"><h3>${y}</h3><ol>`;
      for (const [key, evs] of groups) {
        const isDoc = key[0] === 'd';
        const d = evs[0].sortDate;
        body += `<li class="hbj-row${isDoc ? ' is-doc' : ''}">
          <div class="hbj-when"><time datetime="${d}">${dm(d)}</time>${isDoc ? '<small>document date</small>' : ''}<i class="hbj-node" aria-hidden="true"></i></div>
          <div class="hbj-stack">${evs.map(cardHTML).join('')}</div></li>`;
      }
      body += `</ol></section>`;
    }
    if (undated.length) body += `<section class="hbj-year hbj-undated"><h3>Undated</h3><ol><li class="hbj-row is-doc"><div class="hbj-when"><time>—</time><i class="hbj-node" aria-hidden="true"></i></div><div class="hbj-stack">${undated.map(cardHTML).join('')}</div></li></ol></section>`;
    if (!list.length) body = '<p class="hbj-empty">No records of this type.</p>';

    root.innerHTML = `<header class="hbj-head">
        <div><h2>Chronology</h2><p>${esc(period)}${period ? ' · ' : ''}${plural(all.length, 'record', 'records', 'records')}</p></div>
        <div class="hbj-switch" role="group" aria-label="History view">
          <button type="button" data-mode="journey" aria-pressed="true">Chronology</button>
          <button type="button" data-mode="calendar" aria-pressed="false">Calendar</button>
        </div>
      </header>
      <div class="hbj-filters" role="group" aria-label="Record type">${chips}</div>
      <div class="hbj-body">${body}</div>
      <p class="hbj-note">Filled dot — date of the study. Hollow — only the document date (issue or registration) is known.</p>`;
  }

  function calendarSwitch(ws) {
    if (ws.querySelector('.hbj-back')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'hbj-back'; b.textContent = '← Chronology';
    b.addEventListener('click', () => { (curMode = 'journey'); sync(); window.scrollTo({ top: 0 }); });
    ws.prepend(b);
  }

  function openRecord(id, date) {
    (curMode = 'calendar'); sync();
    const tryClick = (n) => {
      let btn = document.querySelector(`.hb-time-workspace .hb-time-event[data-event-id="${CSS.escape(id)}"]`);
      if (!btn && date) {
        const chip = document.querySelector(`.hb-time-workspace button[data-month="${date.slice(0, 7)}"]`);
        if (chip && chip.getAttribute('aria-pressed') !== 'true') chip.click();
      }
      if (!btn) { if (n < 12) return setTimeout(() => tryClick(n + 1), 80); return; }
      btn.click();
      setTimeout(() => {
        const detail = document.querySelector('.hb-time-workspace .mui-timeline__detail') || btn;
        detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    };
    tryClick(0);
  }

  function sync() {
    const ws = document.querySelector('.hb-time-workspace');
    let root = document.getElementById('hb-journey');
    const on = isTimeline() && ws;
    if (!on) { if (root) root.remove(); document.documentElement.classList.remove('hbj-on'); return; }
    const h = load(caseId());
    if (!h || !(h.events || []).length) { if (root) root.remove(); document.documentElement.classList.remove('hbj-on'); return; }
    calendarSwitch(ws);
    if (!root) {
      root = document.createElement('section');
      root.id = 'hb-journey'; root.className = 'hbj';
      root.addEventListener('click', ev => {
        const t = ev.target.closest('button'); if (!t) return;
        if (t.dataset.mode) { (curMode = t.dataset.mode); sync(); }
        else if (t.dataset.filter) { filter = t.dataset.filter; root.dataset.case = ''; sync(); }
        else if (t.dataset.event) openRecord(t.dataset.event, t.dataset.date);
      });
    }
    if (root.nextElementSibling !== ws) ws.parentNode.insertBefore(root, ws);
    if (root.dataset.caseId !== caseId()) { filter = 'all'; root.dataset.caseId = caseId(); }
    const sig = caseId() + '|' + filter;
    if (root.dataset.case !== sig) { render(root, h); root.dataset.case = sig; }
    document.documentElement.classList.toggle('hbj-on', mode() === 'journey');
  }

  let queued = false;
  const schedule = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; sync(); }, 16); };
  new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true });
  for (const fn of ['pushState', 'replaceState']) { const o = history[fn]; history[fn] = function () { const r = o.apply(this, arguments); schedule(); return r; }; }
  addEventListener('popstate', schedule);
  schedule();
})();

/* 40-naming.js */
// HB UX FIX: naming — «Перебіг» (що і коли) vs «Дані й джерела» (цифри й документи)
(() => {
  const RAIL = { 'Timeline': 'Course', 'History': 'Data & sources' };
  const MOBILE = { 'Timeline': 'Course', 'History': 'Data' };
  const HEAD = { 'History': 'Data & sources', 'Medical history': 'Calendar' };
  const swapText = (el, map) => {
    for (const n of el.childNodes) if (n.nodeType === 3) { const t = n.nodeValue.trim(); if (map[t]) n.nodeValue = n.nodeValue.replace(t, map[t]); }
  };
  const fix = () => {
    document.querySelectorAll('.hb-rail .MuiListItemButton-root').forEach(b => {
      const a = b.getAttribute('aria-label'); if (RAIL[a]) b.setAttribute('aria-label', RAIL[a]);
      b.querySelectorAll('span').forEach(s => swapText(s, RAIL));
    });
    document.querySelectorAll('.hb-mobile-nav .MuiBottomNavigationAction-label').forEach(s => swapText(s, MOBILE));
    document.querySelectorAll('.MuiTooltip-tooltip').forEach(t => swapText(t, RAIL));
    document.querySelectorAll('main h1, main h2').forEach(h => { if (h.closest('.hb-case-strip')) return; swapText(h, HEAD); });
    const st = document.getElementById('history-tab-sources');
    if (st) swapText(st, { 'Sources': 'Documents' });
    document.querySelectorAll('.hb-case-strip .hb-case-count').forEach(btn => {
      for (const n of btn.childNodes) if (n.nodeType === 3 && /\bsources?\b/i.test(n.nodeValue))
        n.nodeValue = n.nodeValue.replace(/\bsources\b/i, 'documents').replace(/\bsource\b/i, 'document');
    });
    document.querySelectorAll('.hb-canvas > .hb-run-id').forEach(el => {
      const pending = /not yet recorded/.test(el.textContent || '') ? 'true' : 'false';
      if (el.dataset.pending !== pending) el.dataset.pending = pending;
    });
    const ev = document.getElementById('history-tab-events');
    if (ev) {
      ev.style.display = 'none';
      if (ev.getAttribute('aria-selected') === 'true') document.getElementById('history-tab-measurements')?.click();
    }
  };
  let q = false;
  new MutationObserver(() => { if (q) return; q = true; setTimeout(() => { q = false; fix(); }, 16); })
    .observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  fix();
})();

/* 50-supports.js */
// HB UX FIX: «Джерельні опори» — положення джерел, на які спирається кандидатне міркування
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return n + ' ' + (m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c); };
  const P = () => new URLSearchParams(location.search);
  const caseId = () => (P().get('case') || '').toLowerCase();
  const view = () => P().get('view');
  const load = id => window.HBUX.loadCase(id);


  const TYPE = { guideline: ['Guideline', 'guide'], evidence_summary: ['Evidence summary', 'review'], pmid: ['PubMed publication', 'pub'] };
  const STATE = {
    present: ['present in data', 'ok'], assessed_absent: ['checked: absent', 'ok'], not_reported: ['not described', 'gap'],
    indeterminate: ['indeterminate', 'gap'], conflicting: ['conflicting', 'warn'],
  };
  const DISC = { specific: ['discriminates hypotheses', 'spec'], shared: ['shared feature', 'shared'], undetermined: ['discriminating value not established', 'undet'] };

  function model(d) {
    const c = d?.projection?.candidate; if (!c || !(c.evidence_matrix || []).length) return null;
    const lib = d.reasoning_log?.source_library || [];
    const byTitle = new Map(lib.map(x => [x.title, x]));
    const ev = new Map((c.external_evidence || []).map(e => {
      const L = byTitle.get(e.title) || {};
      const [tLabel, tCls] = TYPE[e.source_type] || [L.type_label || 'Source', 'other'];
      return [e.id, { id: e.id, thesis: e.proposition, applicability: e.applicability, title: e.title, year: e.year || L.year,
        url: L.url || (/^PMID:/.test(L.bibliographic_id || '') ? 'https://pubmed.ncbi.nlm.nih.gov/' + L.bibliographic_id.slice(5) + '/' : ''),
        pmid: (L.bibliographic_id || '').replace(/^PMID:/, ''), tLabel, tCls,
        short: window.HBUX.shortCitation(e.title, e.year || L.year) }];
    }));
    const hyp = new Map((c.hypotheses || []).map(h => [h.id, h]));
    const work = new Map((c.workup || []).map(w => [w.id, w]));
    return { c, ev, hyp, work, matrix: c.evidence_matrix, pubs: new Set([...ev.values()].map(e => e.title)).size };
  }

  // positions that support a given hypothesis: matrix rows + workup steps discriminating it
  function forHypothesis(m, hid) {
    const ids = new Set();
    for (const r of m.matrix) if ((r.hypothesis_ids || []).includes(hid)) (r.evidence_refs || []).forEach(x => ids.add(x));
    return [...ids].map(i => m.ev.get(i)).filter(Boolean);
  }
  const shortTitle = t => { const w = String(t || '').split(/\s+/); return w.length > 7 ? w.slice(0, 7).join(' ') + '…' : t; };
  const hLabel = h => h ? (h.rank ? h.rank + ' · ' : '') + (h.short_label || h.label) : '';

  function citeHTML(e) {
    return `<div class="hbs-cite"><span class="hbs-type hbs-type--${e.tCls}">${esc(e.tLabel)}</span>
      <b class="hbs-short">${esc(e.short)}</b><span class="hbs-title" title="${esc(e.title)}">${esc(shortTitle(e.title))}</span>
      ${e.url ? `<a class="hbs-link" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${e.pmid ? 'PMID ' + esc(e.pmid) : 'Source'}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3H3v10h10v-3M9 3h4v4M13 3L7 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></a>` : ''}</div>`;
  }
  function thesisHTML(e) {
    return `<li class="hbs-thesis" id="hbs-${esc(e.id)}"><p>${esc(e.thesis)}</p>${citeHTML(e)}
      ${e.applicability ? `<details class="hbs-why"><summary>Why it applies to the case</summary><p>${esc(e.applicability)}</p></details>` : ''}</li>`;
  }

  let filter = 'all';
  function render(root, m) {
    const diag = [...m.hyp.values()].filter(h => m.matrix.some(r => (r.hypothesis_ids || []).includes(h.id)))
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
    const wf = filter.startsWith('w:') ? filter.slice(2) : null;
    const rows = m.matrix.filter(r => filter === 'all' || (wf ? (r.workup_refs || []).includes(wf) : (r.hypothesis_ids || []).includes(filter)));
    const usedInRows = new Set(m.matrix.flatMap(r => r.evidence_refs || []));
    const other = [...m.ev.values()].filter(e => !usedInRows.has(e.id));
    const chips = [['all', 'All questions', m.matrix.length], ...diag.map(h => [h.id, hLabel(h), m.matrix.filter(r => (r.hypothesis_ids || []).includes(h.id)).length])]
      .map(([k, l, n]) => `<button type="button" class="hbj-chip${filter === k ? ' is-on' : ''}" data-hfilter="${esc(k)}" aria-pressed="${filter === k}">${esc(l)}<b>${n}</b></button>`).join('')
      + (wf && m.work.get(wf) ? `<button type="button" class="hbj-chip is-on" data-hfilter="all" aria-pressed="true">Plan step: ${esc(m.work.get(wf).label)} ✕</button>` : '');

    const cards = rows.map(r => {
      const [sL, sC] = STATE[r.patient_state] || [r.patient_state, 'gap'];
      const [dL, dC] = DISC[r.discriminating_value] || ['', 'undet'];
      const evs = (r.evidence_refs || []).map(i => m.ev.get(i)).filter(Boolean);
      const hs = (r.hypothesis_ids || []).map(i => m.hyp.get(i)).filter(Boolean);
      const ws = (r.workup_refs || []).map(i => m.work.get(i)).filter(Boolean);
      return `<article class="hbs-card" id="hbs-row-${esc(r.id)}">
        <header class="hbs-card__head">
          <h3>${esc(r.discriminator)}</h3>
          <div class="hbs-meta"><span class="hbs-disc hbs-disc--${dC}">${esc(dL)}</span>${hs.map(h => `<span class="hbs-hyp">${esc(hLabel(h))}</span>`).join('')}</div>
        </header>
        <div class="hbs-cols">
          <section class="hbs-patient"><h4>In the patient <span class="hbs-state hbs-state--${sC}">${esc(sL)}</span></h4>
            <p>${esc(r.patient_interpretation)}</p>
            ${(r.missing_data || []).length ? `<p class="hbs-missing"><b>Missing:</b> ${esc(r.missing_data.join(' '))}</p>` : ''}</section>
          <section class="hbs-sources"><h4>What the sources say <span class="hbs-count">${plural(evs.length, 'statement', 'statements', 'statements')}</span></h4>
            <ol>${evs.map(thesisHTML).join('')}</ol></section>
        </div>
        ${ws.length ? `<footer class="hbs-next"><span>What to check:</span>${ws.map(w => `<button type="button" class="hbs-step" data-workup="${esc(w.id)}">${esc(w.label)}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`).join('')}</footer>` : ''}
      </article>`;
    }).join('');

    root.innerHTML = `<header class="hbj-head">
        <div><h2>Source supports</h2>
        <p>${plural(m.matrix.length, 'discriminating question', 'discriminating questions', 'discriminating questions')} · ${plural(m.ev.size, 'statement', 'statements', 'statements')} from ${plural(m.pubs, 'publication', 'publications', 'publications')}</p></div>
        <div class="hbj-switch" role="group" aria-label="Reasoning view">
          <button type="button" data-smode="article" aria-pressed="false">Analysis</button>
          <button type="button" data-smode="supports" aria-pressed="true">Source supports</button>
        </div>
      </header>
      <p class="hbs-rule">A guideline defines a rule or action. Only the patient's data confirm whether a feature is present — so they stand side by side, not merged.</p>
      <div class="hbj-filters" role="group" aria-label="Hypothesis">${chips}</div>
      <div class="hbs-list">${cards || '<p class="hbj-empty">No discriminating questions for this hypothesis.</p>'}</div>
      ${other.length && filter === 'all' ? `<details class="hbs-other"><summary>Statements used only in answers and the plan · ${other.length}</summary><ol>${other.map(thesisHTML).join('')}</ol></details>` : ''}`;
  }

  // switch placed above the article
  function articleSwitch(m) {
    let sw = document.getElementById('hbs-article-switch');
    const art = document.querySelector('.hb-reasoning-article');
    if (!art) return;
    if (!sw) {
      sw = document.createElement('div'); sw.id = 'hbs-article-switch'; sw.className = 'hbs-article-switch';
      sw.innerHTML = `<div class="hbj-switch" role="group" aria-label="Reasoning view"><button type="button" data-smode="article" aria-pressed="true">Analysis</button><button type="button" data-smode="supports" aria-pressed="false">Source supports · ${m.ev.size}</button></div>`;
      sw.addEventListener('click', onClick);
    }
    const header = art.querySelector('.hb-reasoning-article__header');
    if (header && sw.parentNode !== header) header.appendChild(sw);
  }

  let mode = 'article';
  function onClick(ev) {
    const t = ev.target.closest('button'); if (!t) return;
    if (t.dataset.smode) { mode = t.dataset.smode; sync(); window.scrollTo({ top: 0 }); }
    else if (t.dataset.hfilter) { filter = t.dataset.hfilter; const r = document.getElementById('hb-supports'); if (r) r.dataset.sig = ''; sync(); }
    else if (t.dataset.workup) {
      try { sessionStorage.setItem('hb-scroll-to', 'workup-' + t.dataset.workup); } catch (e) {}
      const u = new URL(location.href); u.searchParams.set('view', 'gaps'); u.searchParams.delete('hb_support'); location.href = u.href;
    }
  }

  // hypothesis card on overview: "Спирається на"
  function overviewLink(m) {
    const card = document.querySelector('.hb-overview-differential .hb-v1-leading');
    if (!card) return;
    const sel = document.querySelector('.hb-overview-differential .hb-v1-diff__row[aria-pressed="true"]');
    const hid = sel?.dataset.hypothesisId || P().get('hypothesis');
    if (!hid) return;
    const evs = forHypothesis(m, hid);
    let box = card.querySelector('.hbs-onhyp');
    if (!evs.length) { if (box) box.remove(); return; }
    if (box && box.dataset.h === hid) return;
    if (!box) { box = document.createElement('div'); box.className = 'hbs-onhyp'; }
    box.dataset.h = hid;
    const pubs = [...new Map(evs.map(e => [e.title, e])).values()];
    box.innerHTML = `<span class="hbs-onhyp__label">Source supports</span>
      <span class="hbs-onhyp__list">${pubs.slice(0, 3).map(e => `<span class="hbs-onhyp__item"><span class="hbs-type hbs-type--${e.tCls}">${esc(e.tLabel)}</span> <span title="${esc(e.title)}">${esc(e.short)}</span></span>`).join('')}${pubs.length > 3 ? `<span class="hbs-onhyp__item hbs-onhyp__more">and ${plural(pubs.length - 3, 'more source', 'more sources', 'more sources')}</span>` : ''}</span>
      <button type="button" class="hbs-onhyp__go" data-goto-supports="${esc(hid)}">${plural(evs.length, 'statement', 'statements', 'statements')}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
    const anchor = card.querySelector('.hb-v1-leading__headline');
    if (anchor && box.parentNode !== anchor) anchor.appendChild(box);
  }
  function planLinks(m) {
    document.querySelectorAll('article.hb-workup-item[id^="workup-W"]').forEach(a => {
      const wid = a.id.slice(7); if (a.querySelector('.hbs-onstep')) return;
      const n = m.matrix.filter(r => (r.workup_refs || []).includes(wid)).length;
      const w = m.work.get(wid); const nEv = w ? (w.evidence_refs || []).length : 0;
      if (!n && !nEv) return;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'hbs-onstep';
      if (n) b.dataset.gotoSupports = wid;
      b.textContent = 'Source supports · ' + plural(nEv || n, 'statement', 'statements', 'statements');
      if (!n) b.disabled = true;
      a.appendChild(b);
    });
  }
  document.addEventListener('click', ev => {
    const t = ev.target.closest('[data-goto-supports]'); if (!t) return;
    const u = new URL(location.href); u.searchParams.set('view', 'reasoning'); u.searchParams.set('hb_support', t.dataset.gotoSupports); location.href = u.href;
  });

  function sync() {
    const d = load(caseId()); const m = d && model(d);
    if (!m) return;
    if (view() === 'overview') overviewLink(m);
    if (view() === 'gaps') planLinks(m);
    const art = document.querySelector('.hb-reasoning-article');
    let root = document.getElementById('hb-supports');
    if (view() !== 'reasoning' || !art) { if (root) root.remove(); document.documentElement.classList.remove('hbs-on'); return; }
    const deep = P().get('hb_support');
    if (deep && !sync.deepDone) { sync.deepDone = true; mode = 'supports'; if (m.hyp.has(deep)) filter = deep; else if (/^W\d+$/.test(deep) && m.work.has(deep)) filter = 'w:' + deep; }
    articleSwitch(m);
    if (!root) { root = document.createElement('section'); root.id = 'hb-supports'; root.className = 'hbj hbs'; root.addEventListener('click', onClick); }
    const host = art.parentNode;
    if (root.parentNode !== host || root.nextElementSibling !== art) host.insertBefore(root, art);
    const sig = caseId() + '|' + filter;
    if (root.dataset.sig !== sig) { render(root, m); root.dataset.sig = sig; }
    document.documentElement.classList.toggle('hbs-on', mode === 'supports');
  }

  // scroll to a remembered target after navigation (e.g. plan step)
  function pendingScroll() {
    let id = null; try { id = sessionStorage.getItem('hb-scroll-to'); } catch (e) {}
    if (!id) return;
    const el = document.getElementById(id);
    if (el) { try { sessionStorage.removeItem('hb-scroll-to'); } catch (e) {} setTimeout(() => { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.focus?.({ preventScroll: true }); el.classList.add('hbs-flash'); setTimeout(() => el.classList.remove('hbs-flash'), 2200); }, 150); }
  }

  let q = false;
  const schedule = () => { if (q) return; q = true; setTimeout(() => { q = false; sync(); pendingScroll(); }, 16); };
  new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed'] });
  addEventListener('popstate', schedule);
  schedule();
})();

/* 55-observations.js */
// HB UX FIX: «Розгляд даних» — grouped, filterable record review instead of one flat list.
// Clinically meaningful groups first; the bulk of non-specific records is folded by default.
(() => {
  const CATS = [
    ['Needs explanation', 'explain'],
    ['Linked to the argumentation', 'linked'],
    ['Separate process', 'separate'],
    ['Non-specific data', 'nonspecific'],
  ];
  const ORDER = new Map(CATS.map(([label, key], i) => [key, i + 1]));
  const keyOf = label => (CATS.find(([l]) => l === label) || [null, 'other'])[1];
  const { esc, plural } = window.HBUX;

  function enhance(box) {
    const arts = [...box.querySelectorAll(':scope > article')];
    if (!arts.length) return;
    const counts = {};
    let changed = false;
    for (const a of arts) {
      const cat = a.querySelector(':scope > p');
      const k = keyOf((cat?.textContent || '').trim());
      if (a.dataset.cat !== k) { a.dataset.cat = k; changed = true; }
      a.style.order = String(ORDER.get(k) || 9);
      counts[k] = (counts[k] || 0) + 1;
      const link = a.querySelector(':scope > a');
      if (link && !link.classList.contains('hbo-ext')) {
        link.classList.add('hbo-ext'); link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.setAttribute('aria-label', 'Open record in MedLens');
      }
    }
    // first article of each group carries the group heading
    const seen = new Set();
    [...arts].sort((x, y) => (ORDER.get(x.dataset.cat) || 9) - (ORDER.get(y.dataset.cat) || 9)).forEach(a => {
      const first = !seen.has(a.dataset.cat); seen.add(a.dataset.cat);
      if (first) { a.dataset.first = 'true'; a.dataset.count = String(counts[a.dataset.cat]); a.dataset.groupLabel = (CATS.find(([, k]) => k === a.dataset.cat) || ['Other'])[0]; }
      else if (a.dataset.first) { delete a.dataset.first; delete a.dataset.count; delete a.dataset.groupLabel; }
    });
    let bar = box.querySelector(':scope > .hbo-bar');
    if (!bar || changed) {
      if (!box.dataset.filter) box.dataset.filter = 'relevant';
      const relevant = arts.length - (counts.nonspecific || 0);
      const chips = [['relevant', 'Relevant to the reasoning', relevant], ...CATS.filter(([, k]) => counts[k]).map(([l, k]) => [k, l, counts[k]]), ['all', 'All', arts.length]]
        .map(([k, l, n]) => `<button type="button" class="hbj-chip${box.dataset.filter === k ? ' is-on' : ''}" data-ofilter="${k}" aria-pressed="${box.dataset.filter === k}">${esc(l)}<b>${n}</b></button>`).join('');
      if (!bar) {
        bar = document.createElement('div'); bar.className = 'hbo-bar';
        bar.addEventListener('click', ev => {
          const t = ev.target.closest('[data-ofilter]'); if (!t) return;
          box.dataset.filter = t.dataset.ofilter;
          bar.querySelectorAll('[data-ofilter]').forEach(b => { const on = b === t; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
          apply(box);
        });
        bar.addEventListener('input', ev => { if (ev.target.matches('.hbo-search')) { box.dataset.q = ev.target.value.trim().toLowerCase(); apply(box); } });
        const intro = box.querySelector(':scope > p');
        (intro || box.querySelector(':scope > summary')).after(bar);
      }
      bar.innerHTML = `<div class="hbj-filters" role="group" aria-label="Record group">${chips}</div>
        <input class="hbo-search" type="search" placeholder="Search records" aria-label="Search records" value="${esc(box.dataset.q || '')}">
        <p class="hbo-hint" aria-live="polite"></p>`;
    }
    apply(box);
  }

  function apply(box) {
    const f = box.dataset.filter || 'relevant', q = box.dataset.q || '';
    let shown = 0;
    box.querySelectorAll(':scope > article').forEach(a => {
      const inGroup = f === 'all' || (f === 'relevant' ? a.dataset.cat !== 'nonspecific' : a.dataset.cat === f);
      const hit = !q || a.textContent.toLowerCase().includes(q);
      const on = inGroup && hit;
      a.hidden = !on; if (on) shown++;
    });
    const hint = box.querySelector('.hbo-hint');
    if (hint) hint.textContent = `Showing ${plural(shown, 'record', 'records', 'records')}` + (f === 'relevant' ? ' · non-specific data collapsed' : '');
  }

  window.HBUX.observe(() => {
    const box = document.getElementById('reasoning-observations');
    if (box) enhance(box);
  });
})();

/* 60-text-tidy.js */
// HB UX FIX: tidy a source artifact ": - " in visible text
(() => {
  const fix = () => {
    const main = document.querySelector('main'); if (!main) return;
    const w = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, { acceptNode: n => /:\s+-\s+/.test(n.nodeValue) ? 1 : 2 });
    const list = []; while (w.nextNode()) list.push(w.currentNode);
    list.forEach(n => { n.nodeValue = n.nodeValue.replace(/:\s+-\s+/g, ': '); });
  };
  let q = false;
  new MutationObserver(() => { if (q) return; q = true; setTimeout(() => { q = false; fix(); }, 16); })
    .observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  fix();
})();

/* en notice */
(() => {
  const put = () => {
    const strip = document.querySelector('.hb-case-strip');
    if (!strip || strip.parentElement.querySelector('.hb-en-notice')) return;
    const p = document.createElement('p');
    p.className = 'hb-en-notice';
    p.textContent = 'Unofficial English translation of the Ukrainian HematoBoard projection. Not reviewed by a clinician; candidate reasoning for review, not a diagnosis.';
    strip.insertAdjacentElement('afterend', p);
  };
  new MutationObserver(() => setTimeout(put, 16)).observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(put, 200);
})();