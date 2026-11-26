#!/usr/bin/env python3
"""Build the English HematoBoard projection (CASE029, CASE027, CASE001) from the Ukrainian dist-public."""
import glob, hashlib, json, re, shutil, subprocess, sys
from pathlib import Path

SRC = Path('/mnt/user-data/uploads/Hematoboard/hematoboard-v2/ui/dist-public')
UX = Path('/home/claude/ux/premium-ux')
TR = Path('/home/claude/tr')
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else '/home/claude/en-site')
CASES = ['case029', 'case027', 'case001']
CYR = re.compile('[А-Яа-яІіЇїЄєҐґ]')
sys.path.insert(0, str(TR))
from overlay_en import SUBS, EN_PLURAL

# ---------- dictionary ----------
def load_dict():
    reg = json.load(open(TR / 'registry.json', encoding='utf-8'))
    out = {}
    for f in sorted(glob.glob(str(TR / 'out/b*.txt'))) + sorted(glob.glob(str(TR / 'out/x*.txt'))):
        for line in open(f, encoding='utf-8'):
            line = line.rstrip('\n')
            if line:
                i, _, t = line.partition('|')
                out[i] = t
    d = {}
    for k, uk in reg.items():
        en = out.get(k)
        if en is None:
            continue
        uk_r = uk.replace('\\n', '\n')
        en_r = en.replace('\\n', '\n')
        lead = uk_r[:len(uk_r) - len(uk_r.lstrip())]
        trail = uk_r[len(uk_r.rstrip()):]
        d[uk_r] = lead + en_r.strip() + trail
    for k, v in json.load(open(TR / 'extra.json', encoding='utf-8')).items():
        d[k] = v
    return d

D = load_dict()
D_STRIP = {k.strip(): v.strip() for k, v in D.items()}
D_LOWER = {}
for k, v in D.items():
    D_LOWER.setdefault(k.strip().lower(), v.strip().lower())
DATE_PFX = re.compile(r'^(\d{2}\.\d{2}\.\d{4}\.? ?)(.+)$', re.S)
SEPS = [' · ', '; ', ': ', '. ', ', ', ' — ', ' – ']

def tr_text(s, miss):
    if not CYR.search(s):
        return s
    if s in D:
        return D[s]
    st = s.strip()
    if st in D_STRIP:
        return s[:len(s) - len(s.lstrip())] + D_STRIP[st] + s[len(s.rstrip()):]
    if st.lower() == st and st in D_LOWER:
        return s[:len(s) - len(s.lstrip())] + D_LOWER[st] + s[len(s.rstrip()):]
    m = DATE_PFX.match(s)
    if m:
        r = tr_text(m.group(2), None)
        if not CYR.search(r):
            return m.group(1) + r
    for sep in SEPS:
        if sep in s:
            parts = s.split(sep)
            res = [tr_text(p, None) if p else p for p in parts]
            if not any(CYR.search(r) for r in res):
                return sep.join(res)
    if miss is not None:
        miss[s] = miss.get(s, 0) + 1
    return s

# ---------- renderer literals ----------
REGEX_PREV = set('(,=:[!&|?{};+-*%<>~^')

def make_tr_renderer():
    def run(code, miss):
        out = []
        n = len(code)
        pos = [0]
        def template(i):
            # i points just after opening backtick or after closing } of ${}; read until ` or ${
            seg_start = i
            buf = []
            while i < n:
                ch = code[i]
                if ch == '\\':
                    i += 2; continue
                if ch == '`':
                    raw = code[seg_start:i]
                    out.append(tr_text(raw, miss) if CYR.search(raw) else raw); out.append('`')
                    return i + 1, False
                if ch == '$' and i + 1 < n and code[i+1] == '{':
                    raw = code[seg_start:i]
                    out.append(tr_text(raw, miss) if CYR.search(raw) else raw); out.append('${')
                    return i + 2, True
                i += 1
            raise ValueError('unterminated template')
        i = 0; stack = []; last_sig = ''
        while i < n:
            c = code[i]
            if stack and c == '}' and stack[-1] == 0:
                stack.pop(); out.append('}')
                i, opened = template(i + 1)
                if opened: stack.append(0)
                last_sig = '`'
                continue
            if stack:
                if c == '{': stack[-1] += 1
                elif c == '}': stack[-1] -= 1
            if c in '"\'':
                j = i + 1
                while j < n and code[j] != c:
                    j += 2 if code[j] == '\\' else 1
                raw = code[i+1:j]
                out.append(c + (tr_text(raw, miss) if CYR.search(raw) else raw) + c)
                i = j + 1; last_sig = c; continue
            if c == '`':
                out.append('`')
                i, opened = template(i + 1)
                if opened: stack.append(0)
                last_sig = '`'; continue
            if c == '/' and (last_sig in REGEX_PREV or last_sig in ('', 'return')) and i + 1 < n and code[i+1] not in '/*':
                j = i + 1; cls = False
                while j < n:
                    ch = code[j]
                    if ch == '\\': j += 2; continue
                    if ch == '[': cls = True
                    elif ch == ']': cls = False
                    elif ch == '/' and not cls: break
                    elif ch == '\n': break
                    j += 1
                out.append(code[i:j+1]); i = j + 1; last_sig = 'r'; continue
            out.append(c)
            if not c.isspace():
                last_sig = c
                if code.startswith('return', i) : pass
            i += 1
        return ''.join(out)
    return run

TR_RENDERER = make_tr_renderer()

# ---------- data ----------
def apply_language_edition(pkg):
    lang = pkg.get('publication', {}).get('clinician_language_uk')
    if not lang:
        return None
    ed = lang['edition']
    for e in ed.get('edits', []):
        for path in e['paths']:
            cur = pkg
            for k in path[:-1]:
                cur = cur[k]
            last = path[-1]
            assert cur[last] == e['before'], ('edit mismatch', path)
            if path[0] == 'patient_projection':
                cur['display_label_uk'] = e['after']
            else:
                cur[last] = e['after']
    cards = ed.get('card_explanations')
    del pkg['publication']['clinician_language_uk']
    return cards

def walk(x, miss, key=None):
    if isinstance(x, dict):
        return {k: walk(v, miss, k) for k, v in x.items()}
    if isinstance(x, list):
        return [walk(v, miss, key) for v in x]
    if isinstance(x, str):
        return tr_text(x, miss)
    return x

def main():
    miss_r, miss_d, miss_ux = {}, {}, {}
    if OUT.exists():
        for p in OUT.iterdir():
            if p.name in ('.git',): continue
            shutil.rmtree(p) if p.is_dir() else p.unlink()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'assets').mkdir()

    # data
    idx = json.load(open(SRC / 'case-index.json', encoding='utf-8'))
    idx['cases'] = [c for c in idx['cases'] if c['key'] in CASES]
    idx['cases'].sort(key=lambda c: CASES.index(c['key']))
    for c in CASES:
        pkg = json.load(open(SRC / c / 'public-dashboard.v1.json', encoding='utf-8'))
        cards = apply_language_edition(pkg)
        pkg = walk(pkg, miss_d)
        if cards:
            pkg['publication']['english_translation'] = {
                'notice': 'Unofficial English translation of the Ukrainian clinician projection. Not reviewed by a clinician.',
                'card_explanations': {k: tr_text(v, miss_d) for k, v in cards.items()}}
        (OUT / c).mkdir()
        (OUT / c / 'public-dashboard.v1.json').write_text(json.dumps(pkg, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (OUT / 'case-index.json').write_text(json.dumps(walk(idx, miss_d), ensure_ascii=False, indent=1), encoding='utf-8')

    # overlay
    js_parts, css_parts = [], []
    for f in sorted(UX.iterdir()):
        t = f.read_text(encoding='utf-8')
        for a, b in SUBS.get(f.name, []):
            assert a in t, (f.name, a)
            t = t.replace(a, b)
        t = re.sub(r"\(n, one, few, many\) => \{[^\n]*?\};", EN_PLURAL + ";", t)
        t = re.sub(r"\(n, one, few, many\) => \{[^\n]*?\}(,)", EN_PLURAL + r"\1", t)
        # code comments may stay Ukrainian? translate check below ignores comments
        (js_parts if f.suffix == '.js' else css_parts).append(f'/* {f.name} */\n' + t)
    js_parts.append('''/* en notice */
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
})();''')
    css_parts.append('.hb-en-notice{margin:6px 0 0;font-size:.78rem;line-height:1.35;color:var(--hb-on-surface-variant,#5f5a66)}')
    ux_js = '\n'.join(js_parts); ux_css = '\n'.join(css_parts)
    for m in re.finditer(r"[^\n]*[А-Яа-яІіЇїЄєҐґ][^\n]*", ux_js + ux_css):
        line = m.group(0).strip()
        if not (line.startswith('//') or line.startswith('/*')):
            miss_ux[line[:160]] = 1
    hjs = hashlib.sha256(ux_js.encode()).hexdigest()[:16]
    hcss = hashlib.sha256(ux_css.encode()).hexdigest()[:16]
    (OUT / f'assets/ux-en-{hjs}.js').write_text(ux_js, encoding='utf-8')
    (OUT / f'assets/ux-en-{hcss}.css').write_text(ux_css, encoding='utf-8')
    subprocess.run(['node', '--check', str(OUT / f'assets/ux-en-{hjs}.js')], check=True)
    for a in (SRC / 'assets').glob('case-selector-*.css'):
        t = a.read_text(encoding='utf-8')
        (OUT / 'assets' / a.name).write_text(t, encoding='utf-8')

    # index / renderer
    h = (SRC / 'index.html').read_text(encoding='utf-8')
    m = re.search(r'(<script type="text/plain" id="premium-renderer">)(.*?)(</script>)', h, re.S)
    code = m.group(2)
    code = code.replace('Intl.DateTimeFormat(`uk-UA`', 'Intl.DateTimeFormat(`en-GB`')
    code = code.replace(',`uk`)', ',`en`)')
    code = code.replace('clinician_language_uk?.edition.card_explanations', 'english_translation?.card_explanations')
    code = TR_RENDERER(code, miss_r)
    PL = [
     ('n!==1&&r>1&&r<5?i=t.few:n!==1&&r===1&&(i=t.one)', 'e===1&&(i=t.one)'),
     ('return!n&&t===1?`year`:!n&&t>=2&&t<=4?`years`:`years`', 'return e===1?`year`:`years`'),
     ('i>=11&&i<=14?r:a===1?t:a>=2&&a<=4?n:r', 'e===1?t:r'),
    ]
    for a, b in PL:
        assert a in code, a
        code = code.replace(a, b)
    code = code.replace('`uk-UA`', '`en-GB`')
    (OUT / 'renderer.js.check').write_text(code, encoding='utf-8')
    subprocess.run(['node', '--check', '--input-type=module'], input=code.encode(), check=True)
    (OUT / 'renderer.js.check').unlink()
    h = h[:m.start(2)] + code + h[m.end(2):]
    h = re.sub(r'<html lang="uk"', '<html lang="en"', h)
    h = re.sub(r'assets/ux-[0-9a-f]{16}\.css', f'assets/ux-en-{hcss}.css', h)
    h = re.sub(r'assets/ux-[0-9a-f]{16}\.js', f'assets/ux-en-{hjs}.js', h)
    h = h.replace('Не вдалося відкрити каталог кейсів.', 'Could not open the case catalog.')
    h = h.replace('read-only клінічна проєкція з джерельними опорами та протоколом міркувань.', 'read-only clinical projection with source supports and a reasoning protocol (unofficial English translation).')
    # remaining Cyrillic in the html shell outside the renderer
    shell = h[:m.start(1)] + h[m.start(1) + len(m.group(1)) + len(code):]
    for mm in re.finditer(r"[^\n<>]*[А-Яа-яІіЇїЄєҐґ][^\n<>]*", shell):
        miss_ux['HTML: ' + mm.group(0).strip()[:160]] = 1
    (OUT / 'index.html').write_text(h, encoding='utf-8')

    # offline catalog
    import base64
    cat = {'case-index.json': base64.b64encode((OUT / 'case-index.json').read_bytes()).decode()}
    for c in CASES:
        cat[f'{c}/public-dashboard.v1.json'] = base64.b64encode((OUT / c / 'public-dashboard.v1.json').read_bytes()).decode()
    (OUT / 'file-catalog.js').write_text('window.hbFileCatalog=' + json.dumps(cat) + ';\n', encoding='utf-8')
    (OUT / '.nojekyll').write_text('')

    rep = {'renderer_missing': miss_r, 'data_missing': miss_d, 'ux_missing': miss_ux}
    json.dump(rep, open(TR / 'missing.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('renderer untranslated literals:', len(miss_r), ' data untranslated strings:', len(miss_d), ' ux:', len(miss_ux))

if __name__ == '__main__':
    main()
