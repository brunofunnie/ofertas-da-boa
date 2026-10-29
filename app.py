import json, os, re, sqlite3, subprocess, tempfile, urllib.request
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

STORES = {'tauste': ('Tauste', 'https://tauste.com.br/sorocaba2'), 'bom-lugar': ('Bom Lugar', 'https://www.redebomlugar.com.br/ofertas')}
CATEGORIES = {'Carnes': r'carne|frango|bovina|suína|suino|coxa|asa |tilápia|tilapia|linguiça', 'Hortifruti': r'mamão|mamao|melão|melao|abóbora|abobora|banana|tomate|fruta|legume|verdura', 'Limpeza': r'detergente|sabão|sabao|amaciante|desinfetante|limpeza|sanitária', 'Higiene': r'sabonete|shampoo|dental|fralda|desodorante', 'Bebidas': r'vinho|cerveja|refrigerante|suco|água mineral', 'Frios e laticínios': r'leite|queijo|iogurte|manteiga|requeijão', 'Padaria': r'pão|pao|bolo|panettone'}
def categorize(name):
    return next((category for category, pattern in CATEGORIES.items() if re.search(pattern, name, re.I)), 'Mercearia')
def parse_price(value):
    m = re.search(r'(\d[\d.]*)\s*,\s*(\d{2})', value)
    return int(m.group(1).replace('.', '')) * 100 + int(m.group(2)) if m else None

class Database:
    def __init__(self, path):
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS offers(id INTEGER PRIMARY KEY, store TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL, price INTEGER NOT NULL, previous_price INTEGER, url TEXT, updated TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(store,name));
        CREATE TABLE IF NOT EXISTS lists(id INTEGER PRIMARY KEY, name TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS items(list_id INTEGER NOT NULL, offer_id INTEGER NOT NULL, checked INTEGER DEFAULT 0, PRIMARY KEY(list_id,offer_id), FOREIGN KEY(list_id) REFERENCES lists(id) ON DELETE CASCADE, FOREIGN KEY(offer_id) REFERENCES offers(id));
        CREATE TABLE IF NOT EXISTS sources(store TEXT PRIMARY KEY, status TEXT, updated TEXT);
        PRAGMA foreign_keys=ON;''')
    def save_offers(self, store, offers):
        with self.db:
            for o in offers:
                self.db.execute('''INSERT INTO offers(store,name,category,price,url) VALUES(?,?,?,?,?) ON CONFLICT(store,name) DO UPDATE SET previous_price=CASE WHEN offers.price != excluded.price THEN offers.price ELSE offers.previous_price END, price=excluded.price,category=excluded.category,url=excluded.url,updated=CURRENT_TIMESTAMP''', (store,o['name'],o.get('category') or categorize(o['name']),o['price'],o.get('url','')))
    def offers(self): return [dict(r) for r in self.db.execute('SELECT * FROM offers ORDER BY updated DESC, name')]
    def create_list(self, name):
        with self.db: return self.db.execute('INSERT INTO lists(name) VALUES(?)',(name,)).lastrowid
    def add_item(self, list_id, offer_id):
        with self.db: self.db.execute('INSERT OR IGNORE INTO items(list_id,offer_id) VALUES(?,?)',(list_id,offer_id))
    def lists(self):
        return [dict(r, items=[dict(i) for i in self.db.execute('SELECT offers.*, items.checked FROM items JOIN offers ON offers.id=items.offer_id WHERE list_id=? ORDER BY checked, name',(r['id'],))]) for r in self.db.execute('SELECT * FROM lists ORDER BY id DESC')]
    def status(self, store, status):
        with self.db: self.db.execute('INSERT INTO sources VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(store) DO UPDATE SET status=excluded.status,updated=excluded.updated',(store,status))

class ProductParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.depth=0; self.capture=None; self.buffer=''; self.current=None; self.products=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs); classes=a.get('class','')
        if 'product-item-info' in classes and not self.current: self.current={'name':'','price':None,'url':''}; self.depth=1; return
        if not self.current: return
        if tag not in ('img','input','br','hr','meta','link','source','wbr'): self.depth+=1
        if 'product-item-link' in classes: self.capture='name'; self.buffer=''; self.current['url']=a.get('href','')
        if 'price-wrapper' in classes and a.get('data-price-amount'):
            try: self.current['price']=round(float(a['data-price-amount'])*100)
            except ValueError: pass
        if 'price' in classes.split() and self.current['price'] is None: self.capture='price'; self.buffer=''
    def handle_data(self, data):
        if self.capture: self.buffer+=data
    def handle_endtag(self, tag):
        if not self.current: return
        if self.capture and tag in ('a','span'):
            if self.capture=='name': self.current['name']=' '.join(self.buffer.split())
            elif not self.current['price']: self.current['price']=parse_price(self.buffer)
            self.capture=None
        self.depth-=1
        if self.depth<=0:
            if self.current['name'] and self.current['price']: self.products.append(self.current)
            self.current=None

def fetch(url):
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 OfertasDaBoa/1.0'})
    with urllib.request.urlopen(req,timeout=20) as response: return response.read().decode('utf-8','replace')

def import_tauste():
    parser=ProductParser(); parser.feed(fetch(STORES['tauste'][1])); return parser.products

def import_bom_lugar():
    # shortcut: folhetos exigem revisão humana, até haver OCR capaz de associar preços aos produtos com segurança.
    fetch(STORES['bom-lugar'][1])
    raise ValueError('Ofertas em imagens: abra o folheto e cadastre os produtos conferidos.')

IMPORTERS={'tauste':import_tauste,'bom-lugar':import_bom_lugar}
db=Database(os.environ.get('DATABASE_PATH','ofertas.sqlite3'))
class Handler(BaseHTTPRequestHandler):
    def send_json(self, data, status=200):
        content=json.dumps(data,ensure_ascii=False).encode(); self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(content))); self.end_headers(); self.wfile.write(content)
    def do_GET(self):
        path=urlparse(self.path).path
        if path=='/api/data': return self.send_json({'offers':db.offers(),'lists':db.lists(),'sources':[dict(r) for r in db.db.execute('SELECT * FROM sources')], 'stores':STORES})
        files={'/':'static/index.html','/app.js':'static/app.js','/style.css':'static/style.css'}
        if path not in files: return self.send_json({'error':'Não encontrado'},404)
        content=open(files[path],'rb').read(); self.send_response(200); self.send_header('Content-Type',{'/':'text/html','/app.js':'text/javascript','/style.css':'text/css'}[path]+'; charset=utf-8'); self.end_headers(); self.wfile.write(content)
    def do_POST(self):
        try:
            length=int(self.headers.get('Content-Length','0'))
            if length>100000: raise ValueError('Pedido muito grande')
            data=json.loads(self.rfile.read(length) or b'{}'); path=urlparse(self.path).path
            if path=='/api/refresh':
                results={}
                for store, importer in IMPORTERS.items():
                    try:
                        offers=importer()
                        if not offers: raise ValueError('Nenhum produto encontrado na página.')
                        db.save_offers(store,offers); message=f'{len(offers)} produtos atualizados'
                    except Exception as e: message=f'Não atualizado: {e}'
                    db.status(store,message); results[store]=message
                return self.send_json(results)
            if path=='/api/offer':
                name=str(data.get('name','')).strip(); store=data.get('store'); price=parse_price(str(data.get('price','')))
                if not name or store not in STORES or not price: raise ValueError('Informe produto, supermercado e preço válido (ex.: 12,90).')
                db.save_offers(store,[{'name':name,'price':price,'category':data.get('category') or categorize(name),'url':STORES[store][1]}]); return self.send_json({'ok':True})
            if path=='/api/list':
                name=str(data.get('name','')).strip()
                if not name: raise ValueError('Informe o nome da lista.')
                return self.send_json({'id':db.create_list(name)})
            if path=='/api/item': db.add_item(int(data['list_id']),int(data['offer_id'])); return self.send_json({'ok':True})
            if path=='/api/check':
                with db.db: db.db.execute('UPDATE items SET checked=? WHERE list_id=? AND offer_id=?',(int(bool(data['checked'])),int(data['list_id']),int(data['offer_id'])))
                return self.send_json({'ok':True})
            if path=='/api/remove':
                with db.db: db.db.execute('DELETE FROM items WHERE list_id=? AND offer_id=?',(int(data['list_id']),int(data['offer_id'])))
                return self.send_json({'ok':True})
            if path=='/api/delete-list':
                with db.db: db.db.execute('DELETE FROM lists WHERE id=?',(int(data['id']),))
                return self.send_json({'ok':True})
            return self.send_json({'error':'Não encontrado'},404)
        except (ValueError, KeyError, TypeError, sqlite3.IntegrityError, json.JSONDecodeError) as e: return self.send_json({'error':str(e)},400)

if __name__=='__main__':
    port=int(os.environ.get('PORT','8000')); print(f'Ofertas da Boa: http://localhost:{port}',flush=True); HTTPServer(('0.0.0.0',port),Handler).serve_forever()
