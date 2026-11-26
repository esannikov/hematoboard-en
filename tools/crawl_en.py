import functools, threading, re, json, sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/en-site'
class Q(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
B = f'http://127.0.0.1:{srv.server_port}/'
cyr = re.compile('[А-Яа-яІіЇїЄєҐґ]')
GRAB = """()=>{document.querySelectorAll('details').forEach(d=>d.open=true);
 const t=[document.body.innerText];
 document.querySelectorAll('[aria-label],[title],[placeholder],[alt]').forEach(e=>{for(const a of ['aria-label','title','placeholder','alt']){const v=e.getAttribute(a); if(v) t.push(v)}});
 t.push(document.title); return t.join('\\n')}"""
found = {}; errors = []
def add(txt, where):
    for l in txt.split('\n'):
        l = l.strip()
        if l and cyr.search(l) and l not in found:
            found[l] = where
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1440, 'height': 900})
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    for c in ['case029', 'case027', 'case001']:
        pg.goto(B + f'?case={c}&view=overview'); pg.wait_for_selector('.hb-case-strip', timeout=15000); pg.wait_for_timeout(800)
        hs = pg.evaluate("()=>[...document.querySelectorAll('[data-hypothesis-id]')].map(b=>b.dataset.hypothesisId)")
        hs = list(dict.fromkeys(hs)) or ['']
        for v in ['overview', 'timeline', 'data', 'graph', 'gaps', 'reasoning']:
            for h in (hs if v in ('overview', 'reasoning', 'graph') else ['']):
                pg.goto(B + f'?case={c}&view={v}' + (f'&hypothesis={h}' if h else '')); pg.wait_for_selector('.hb-case-strip', timeout=15000); pg.wait_for_timeout(500)
                add(pg.evaluate(GRAB), f'{c}/{v}/{h}'); print(c, v, h, len(found), flush=True)
                if v == 'data':
                    for _ in range(40):
                        nxt = pg.locator('button[aria-label*="next" i]').last
                        if nxt.count() == 0 or nxt.is_disabled(): break
                        nxt.click(); pg.wait_for_timeout(200); add(pg.evaluate(GRAB), f'{c}/data/page')
                    for tab in ['#history-tab-sources', '#history-tab-events']:
                        if pg.locator(tab).count():
                            pg.evaluate(f"()=>document.querySelector('{tab}').click()"); pg.wait_for_timeout(500); add(pg.evaluate(GRAB), f'{c}/data{tab}')
                if v == 'timeline':
                    pg.evaluate("()=>document.querySelector('[data-mode=calendar]')?.click()"); pg.wait_for_timeout(500); add(pg.evaluate(GRAB), f'{c}/calendar')
                if v == 'reasoning':
                    pg.evaluate("()=>{const f=document.querySelector('[data-ofilter=all]'); f&&f.click()}"); pg.wait_for_timeout(300); add(pg.evaluate(GRAB), f'{c}/reasoning/all')
                    pg.evaluate("()=>document.querySelector('[data-smode=supports]')?.click()"); pg.wait_for_timeout(400); add(pg.evaluate(GRAB), f'{c}/supports/{h}')
                if v == 'graph':
                    nodes = pg.locator('[class*="graph"] button').count()
                    for k in range(min(nodes, 25) if h == hs[0] else 0):
                        try:
                            pg.locator('[class*="graph"] button').nth(k).click(timeout=1500); pg.wait_for_timeout(150)
                            add(pg.evaluate(GRAB), f'{c}/graph-node')
                        except Exception: pass
        print(c, 'cyrillic lines so far', len(found), flush=True)
    b.close()
json.dump({'lines': found, 'errors': errors[:50]}, open('/home/claude/tr/crawl_left.json', 'w'), ensure_ascii=False, indent=1)
print('TOTAL', len(found), sum(map(len, found)), 'errors', len(errors))
