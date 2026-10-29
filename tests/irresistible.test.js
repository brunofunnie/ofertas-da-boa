import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isIrresistible } from '../src/irresistible.js';
import { Database, createApp } from '../server.js';
import { createSession } from '../auth/index.js';

test('limite inclui descontos anunciados e de clube, não preços históricos', () => {
  assert.equal(isIrresistible({price:800,regular_price:1000},20),true);
  assert.equal(isIrresistible({price:801,regular_price:1000},20),false);
  assert.equal(isIrresistible({price:1000,club_price:800},20),true);
  assert.equal(isIrresistible({price:800,previous_price:1000},20),false);
  assert.equal(isIrresistible({price:800,regular_price:700},20),false);
});

test('somente admin pode alterar o limite persistente e público', async () => {
  const db = new Database(':memory:');
  const app = createApp(db, []); await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const root = `http://127.0.0.1:${app.address().port}`;
  const cookie = user => `ofertas_session=${createSession(db.db,user)}`;
  const admin = cookie({sub:'admin',name:'Admin',email:'brunodeoliveira@gmail.com'});
  const user = cookie({sub:'user',name:'User',email:'user@example.com'});
  const post = (value,c) => fetch(`${root}/api/offer-settings`,{method:'POST',headers:{'content-type':'application/json',...(c ? {cookie:c} : {})},body:JSON.stringify({irresistible_percent:value})});
  try {
    assert.equal((await (await fetch(root+'/api/data')).json()).irresistible_percent,20);
    assert.equal((await post(35)).status,401);
    assert.equal((await post(35,user)).status,403);
    for (const value of [0,101,1.5,'20',null]) assert.equal((await post(value,admin)).status,400);
    assert.equal((await post(35,admin)).status,200);
    assert.equal((await (await fetch(root+'/api/data')).json()).irresistible_percent,35);
  } finally { await new Promise(resolve=>app.close(resolve)); db.close(); }
});
