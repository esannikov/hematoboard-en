import functools, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
class Q(SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Q,directory='/home/claude/en-site')); threading.Thread(target=srv.serve_forever,daemon=True).start()
B=f'http://127.0.0.1:{srv.server_port}/'
fails=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    for vw,vh,tag in [(1440,900,'d'),(390,844,'m')]:
        pg=b.new_page(viewport={'width':vw,'height':vh})
        pg.on('response', lambda r: r.status>=400 and fails.append(r.url))
        for c,v,extra in [('case029','overview','&hypothesis=H1'),('case029','timeline',''),('case029','graph',''),('case027','reasoning',''),('case001','gaps',''),('case001','data','')]:
            pg.goto(B+f'?case={c}&view={v}{extra}'); pg.wait_for_selector('.hb-case-strip'); pg.wait_for_timeout(900)
            pg.screenshot(path=f'shots/{tag}-{c}-{v}.png', full_page=False)
        pg.close()
    b.close()
print(set(fails))
