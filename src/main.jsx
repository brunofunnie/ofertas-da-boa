import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { groupListItems } from './list-groups.js';
import { priceTrend, chartPoints } from './price-history.js';
import { isIrresistible } from './irresistible.js';
import { groupStorePrices } from './offer-prices.js';

const categories = ['Todos', 'Carnes', 'Hortifruti', 'Mercearia', 'Limpeza', 'Higiene', 'Frios e laticínios', 'Padaria', 'Bebidas'];
const PAGE_SIZE = 24;
const money = value => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
async function post(path, data = {}) {
  const response = await fetch(`/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw Error(result.error);
  return result;
}
function AccountMenu({ user, onLogout, onSettings }) {
  const menu = useRef(null);
  return <details ref={menu} className="account-menu" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }} onKeyDown={event => { if (event.key === 'Escape') { menu.current.open = false; menu.current.querySelector('summary')?.focus(); } }}>
    <summary className="account-avatar" aria-label="Menu da conta" title={user.name}><span aria-hidden="true">{(user.name || user.email || '?').trim().charAt(0).toLocaleUpperCase()}</span>{user.picture && <img src={user.picture} alt="" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }}/>}</summary>
    <div className="account-popover">{user.admin && <button type="button" onClick={() => { menu.current.open = false; onSettings(); }}>Configurações</button>}<button type="button" onClick={() => { menu.current.open = false; onLogout(); }}>Sair</button></div>
  </details>;
}
function OfferSettingsDialog({ percent, onClose, onSaved }) {
  const dialog = useRef(null), [value, setValue] = useState(String(percent)), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { dialog.current.showModal(); }, []);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await post('offer-settings', { irresistible_percent: Number(value) }); await onSaved(); dialog.current.close(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="cookies-dialog" aria-labelledby="offer-settings-title" onClose={onClose} onClick={event => { if (event.target === dialog.current && !busy) dialog.current.close(); }}><form className="cookies-panel ai-panel" onSubmit={save}><div className="stores-heading"><h2 id="offer-settings-title">Configurações</h2><button type="button" className="icon" aria-label="Fechar" disabled={busy} onClick={() => dialog.current.close()}>×</button></div><label htmlFor="irresistible-percent">Desconto mínimo para ofertas irresistíveis (%)</label><input id="irresistible-percent" type="number" min="1" max="100" step="1" value={value} onChange={event => setValue(event.target.value)} required /><button className="primary" type="submit" disabled={busy}>Salvar</button>{error && <p className="store-error" role="alert">{error}</p>}</form></dialog>;
}
function ProductImage({ src, name, onOpen }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const fallback = <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>;
  if (!src || failed) return <span className="product-image" aria-hidden="true">{fallback}</span>;
  return <button type="button" className="product-image" aria-label={`Ampliar imagem de ${name}`} onClick={() => onOpen({src, name})}>{fallback}<img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /></button>;
}
function ImageLightbox({ image, onClose }) {
  const dialog = useRef(null);
  useEffect(() => { dialog.current.showModal(); }, []);
  return <dialog ref={dialog} className="image-lightbox" aria-label={`Imagem de ${image.name}`} onClose={onClose} onClick={e => { if (e.target === dialog.current) dialog.current.close(); }}><div className="image-lightbox-panel"><div className="image-lightbox-header"><span>{image.name}</span><button className="icon" type="button" aria-label="Fechar imagem" onClick={() => dialog.current.close()} autoFocus>×</button></div><img src={image.src} alt={image.name} referrerPolicy="no-referrer" /></div></dialog>;
}
function SearchIcon() { return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/></svg>; }
function ViewIcon({grid}) { return grid ? <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h2M10 6h10M4 12h2M10 12h10M4 18h2M10 18h10"/></svg> : <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>; }
function StoreIcon() { return <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10V8l2-4h14l2 4v2M5 10v10h14V10M3 10a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 2 0M9 20v-6h6v6"/></svg>; }
function RefreshIcon({ spinning }) { return <svg aria-hidden="true" className={spinning ? 'refresh-spin' : ''} width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5A7 7 0 0 0 18.4 15"/></svg>; }
function Toast({ text }) { return text ? <div className="store-toast" role="status">{text}</div> : null; }
function ReviewDialog({offers, currentOffers, stores, onReview, onClose}) {
  const dialog=useRef(null), [busy,setBusy]=useState(null), [error,setError]=useState('');
  useEffect(() => {dialog.current.showModal();}, []);
  async function decide(id, decision) {setBusy(id);setError('');try {await onReview(id,decision);}catch(e){setError(e.message);}finally{setBusy(null);}}
  return <dialog ref={dialog} className="stores-dialog" aria-labelledby="review-title" onClose={onClose} onClick={e=>{if(e.target===dialog.current && busy===null)dialog.current.close();}}><div className="stores-panel"><div className="stores-heading"><h2 id="review-title">Revisar ofertas</h2><button type="button" className="icon" aria-label="Fechar revisão" disabled={busy!==null} onClick={()=>dialog.current.close()}>×</button></div><div className="review-list">{error && <p className="store-error" role="alert">{error}</p>}{offers.length ? offers.map(offer=>{const current=currentOffers.find(item=>item.store===offer.store && item.name===offer.name);return <article className="review-offer" key={offer.id}><div className="review-name">{offer.name}</div><div className="review-meta">{stores[offer.store]?.[0] || offer.store} · até {offer.valid_until?.split('-').reverse().join('/') || 'sem data'}</div><div className="review-price">{money(offer.price)}{offer.club_price && <small>Clube {money(offer.club_price)}</small>}</div>{current && <div className="review-meta">Preço atual: {money(current.price)}</div>}{offer.url && <a className="review-link" href={offer.url} target="_blank" rel="noopener noreferrer">Ver folheto ou publicação ↗</a>}<div className="review-actions"><button type="button" disabled={busy!==null} onClick={()=>decide(offer.id,'reject')} aria-label={`Rejeitar ${offer.name}`}>Rejeitar</button><button type="button" disabled={busy!==null} onClick={()=>decide(offer.id,'approve')} aria-label={`Aprovar ${offer.name}`}>Aprovar</button></div></article>;}) : <p className="review-empty">Nenhuma oferta pendente.</p>}</div></div></dialog>;
}
function StoreSourceList({ sources, formatDate }) {
  if (sources.length < 2) return null;
  const labels = {ok:'Atualizado',error:'Falhou',running:'Atualizando',unknown:'Sem atualização',unconfigured:'Não configurado'};
  return <div className="store-source-list" aria-label="Fontes de dados">{sources.map(source => <div className="store-source" key={source.source}><span className={`status-dot status-${source.state}`} aria-hidden="true"/><span className="store-source-content"><strong>{source.name}</strong><small>{labels[source.state] || 'Sem atualização'}{source.state === 'ok' && source.total != null ? ` · ${source.total} produtos` : ''}{source.updated && source.state !== 'running' ? ` · ${formatDate(source.updated)}` : ''}</small>{source.state === 'error' && source.status && <small className="store-error">{source.status}</small>}</span></div>)}</div>;
}
function AiSettingsDialog({onClose, onSaved}) {
  const dialog=useRef(null), [config,setConfig]=useState(null), [provider,setProvider]=useState('gemini'), [baseUrl,setBaseUrl]=useState('https://api.openai.com/v1'), [model,setModel]=useState(''), [key,setKey]=useState(''), [models,setModels]=useState([]), [error,setError]=useState(''), [busy,setBusy]=useState(false);
  useEffect(() => { dialog.current.showModal(); fetch('/api/ai-config').then(r => {if(!r.ok) throw Error('Não foi possível carregar a configuração.');return r.json();}).then(data => {setConfig(data);setProvider(data.provider);setBaseUrl(data.openai.base_url);setModel(data[data.provider].model);}).catch(e => setError(e.message)); }, []);
  function selectProvider(value) {setProvider(value);setModel(config?.[value]?.model || '');setKey('');setModels([]);setError('');}
  const data = () => ({provider,base_url:baseUrl,model,api_key:key});
  async function fetchModels() {setBusy(true);setError('');try {const result=await post('ai-models',data());setModels(result.models);if(!result.models.length)setError('Nenhum modelo disponível.');}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function save(e) {e.preventDefault();setBusy(true);setError('');try {await post('ai-config',data());onSaved();dialog.current.close();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <dialog ref={dialog} className="cookies-dialog" aria-labelledby="ai-title" onClose={onClose} onClick={e => {if(e.target===dialog.current&&!busy)dialog.current.close();}}><form className="cookies-panel ai-panel" onSubmit={save}><div className="stores-heading"><h2 id="ai-title">Provedor de IA</h2><button type="button" className="icon" aria-label="Fechar" disabled={busy} onClick={() => dialog.current.close()}>×</button></div><label htmlFor="ai-provider">Provedor</label><select id="ai-provider" value={provider} onChange={e=>selectProvider(e.target.value)} disabled={!config || busy}><option value="gemini">Gemini</option><option value="openai">OpenAI compatível</option></select>{provider==='openai' && <><label htmlFor="ai-url">URL da API</label><input id="ai-url" type="url" value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" required /></>}<label htmlFor="ai-key">Chave da API</label><input id="ai-key" type="password" autoComplete="new-password" value={key} onChange={e=>setKey(e.target.value)} placeholder={config?.[provider]?.has_key ? 'Chave configurada' : 'Opcional se o provedor não exigir'} /><label htmlFor="ai-model">Modelo</label><div className="ai-model-row"><input id="ai-model" list="ai-models" value={model} onChange={e=>setModel(e.target.value)} placeholder="Digite ou escolha" required /><button type="button" className="cookies-open" disabled={busy || !config} onClick={fetchModels}>Listar</button></div><datalist id="ai-models">{models.map(item=><option key={item} value={item}/>)}</datalist>{error && <p className="store-error" role="alert">{error}</p>}<button className="primary w-full" disabled={busy || !config}>{busy ? 'Aguarde…' : 'Salvar'}</button></form></dialog>;
}
function InstagramCookiesDialog({ onClose, onSaved }) {
  const dialog = useRef(null), [value, setValue] = useState(''), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  useEffect(() => { dialog.current.showModal(); }, []);
  async function save(e) {
    e.preventDefault(); setSaving(true); setError('');
    try { await post('instagram-cookies', {cookies:value}); onSaved(); dialog.current.close(); }
    catch (e) { setError(e.message); } finally { setSaving(false); }
  }
  return <dialog ref={dialog} className="cookies-dialog" aria-labelledby="cookies-title" onClose={e => { e.stopPropagation(); onClose(); }} onClick={e => { if (e.target === dialog.current && !saving) dialog.current.close(); }}><form className="cookies-panel" onSubmit={save}><div className="stores-heading"><h2 id="cookies-title">Cookies do Instagram</h2><button type="button" className="icon" aria-label="Fechar" disabled={saving} onClick={() => dialog.current.close()}>×</button></div><label htmlFor="instagram-cookies">Novo JSON de cookies</label><textarea id="instagram-cookies" value={value} onChange={e => setValue(e.target.value)} placeholder="Cole o JSON aqui" spellCheck="false" autoCapitalize="off" autoComplete="off" required autoFocus/><p className="cookies-hint">Cole o JSON completo para substituir a sessão atual.</p>{error && <p className="store-error" role="alert">{error}</p>}<button className="primary w-full" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button></form></dialog>;
}
function StoresDialog({ data, refreshing, onRefresh, onClose, toast }) {
  const dialog = useRef(null), [expanded, setExpanded] = useState(null), [editingCookies, setEditingCookies] = useState(false), [cookiesSaved, setCookiesSaved] = useState(false);
  useEffect(() => { dialog.current.showModal(); }, []);
  useEffect(() => { if (!cookiesSaved) return; const timer = setTimeout(() => setCookiesSaved(false), 6000); return () => clearTimeout(timer); }, [cookiesSaved]);
  const formatDate = value => value ? new Date(value.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Ainda não atualizada';
  return <dialog ref={dialog} className="stores-dialog" aria-labelledby="stores-title" onClose={onClose} onClick={e => { if (e.target === dialog.current) dialog.current.close(); }}><div className="stores-panel"><div className="stores-heading"><h2 id="stores-title">Supermercados</h2><button type="button" className="icon" aria-label="Fechar supermercados" onClick={() => dialog.current.close()} autoFocus>×</button></div><div className="stores-list">{Object.entries(data.stores).map(([id, value]) => {
    const source = data.sources.find(s => s.store === id), state = refreshing[id] || source?.state === 'running' ? 'running' : source?.state || 'unknown';
    const stateLabel = {ok:'Atualizado',error:'Falhou',running:'Atualizando',unknown:'Sem atualização'}[state] || 'Sem atualização';
    return <section className="store-entry" key={id}><div className="store-entry-row"><button type="button" className="store-info" aria-expanded={expanded === id} onClick={() => setExpanded(expanded === id ? null : id)}><span className={`status-dot status-${state}`} aria-hidden="true"/><span className="store-info-text"><strong>{value[0]}</strong><small>{stateLabel} · {formatDate(source?.last_success)}</small></span><span className="store-chevron" aria-hidden="true">{expanded === id ? '⌃' : '⌄'}</span></button><a className="store-link" href={value[1]} target="_blank" rel="noopener noreferrer" aria-label={`Abrir site de ${value[0]} em nova aba`} title={`Abrir site de ${value[0]}`}><svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 5h6v6M19 5l-9 9"/><path d="M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4"/></svg></a>{data.user?.admin && <button type="button" className="store-refresh" disabled={state === 'running'} onClick={() => onRefresh(id)} aria-label={`Atualizar ${value[0]}`} title={`Atualizar ${value[0]}`}><RefreshIcon spinning={state === 'running'}/></button>}</div>{expanded === id && <div className="store-detail">{source?.total != null ? <><div className="store-metrics"><span><strong>{source.total}</strong> consultados</span><span><strong>{source.new_count}</strong> novos</span><span><strong>{source.changed_count}</strong> alterados</span></div>{source?.state === 'error' && !source?.status?.startsWith('Atualização parcial:') && <small>Contagens da última atualização concluída.</small>}</> : <span>Sem contagens disponíveis.</span>}{source?.state === 'error' && <p className="store-error">{source.status}</p>}<StoreSourceList sources={(data.store_sources || []).filter(item => item.store === id)} formatDate={formatDate}/>{data.user?.admin && id === 'santo-clube' && <button type="button" className="cookies-open" onClick={() => { setCookiesSaved(false); setEditingCookies(true); }}>Cookies do Instagram</button>}</div>}</section>;
  })}</div></div>{editingCookies && <InstagramCookiesDialog onClose={() => setEditingCookies(false)} onSaved={() => setCookiesSaved(true)}/>}<Toast text={toast || (cookiesSaved ? 'Cookies salvos' : '')}/></dialog>;
}
function PriceChart({ history }) {
  if (!history || history.length < 2) return null;
  const values = history.map(point => point.price), min = Math.min(...values), max = Math.max(...values);
  const points = values.map((value, i) => `${2 + i * 60 / (values.length - 1)},${max === min ? 10 : 18 - (value - min) * 16 / (max - min)}`).join(' ');
  const change = values.at(-1) - values.at(-2);
  const label = `${change > 0 ? 'Subiu' : change < 0 ? 'Caiu' : 'Sem mudança'}: ${money(values.at(-2))} para ${money(values.at(-1))}`;
  return <span className="inline-flex items-center gap-1 text-xs text-[#98623d]" title={label} aria-label={label} role="img"><svg aria-hidden="true" width="64" height="20" viewBox="0 0 64 20"><polyline points={points} fill="none" stroke={change > 0 ? '#328147' : change < 0 ? '#b93422' : '#987766'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>;
}
function PriceTrend({history}) {
  const change=priceTrend(history);
  if (!change) return null;
  const label=`${change > 0 ? 'Subiu' : 'Caiu'} de ${money(history.at(-2).price)} para ${money(history.at(-1).price)}`;
  return <span className={`price-trend ${change > 0 ? 'price-up' : 'price-down'}`} title={label} aria-label={label} role="img">{change > 0 ? '↑' : '↓'}</span>;
}
function HistoryButton({offer, onOpen}) { return <button type="button" className="history-button" onClick={() => onOpen(offer)} aria-label={`Ver histórico de ${offer.name}`} title="Histórico de preços"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5M4 19h16M8 15l4-4 3 2 4-6"/></svg></button>; }
function AddIcon() { return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>; }
function HistoryDialog({offer, store, onClose}) {
  const dialog=useRef(null), history=offer.history || [], points=chartPoints(history);
  useEffect(() => {dialog.current.showModal();}, []);
  const date=value => {const parsed=new Date(`${(value || '').replace(' ','T')}Z`);return Number.isNaN(parsed.getTime()) ? 'Data indisponível' : parsed.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});};
  return <dialog ref={dialog} className="stores-dialog" aria-labelledby="history-title" onClose={onClose} onClick={e=>{if(e.target===dialog.current)dialog.current.close();}}><div className="stores-panel"><div className="stores-heading"><h2 id="history-title">Histórico de preços</h2><button type="button" className="icon" aria-label="Fechar histórico" onClick={()=>dialog.current.close()} autoFocus>×</button></div><div className="history-content"><div className="history-name">{offer.name}</div><div className="history-subtitle">{store}{offer.condition ? ` · ${offer.condition}` : ''} · até 20 registros</div>{history.length ? <><div className="history-chart"><div className="history-chart-scale"><span>Máx. {money(Math.max(...history.map(item=>item.price)))}</span><span>Mín. {money(Math.min(...history.map(item=>item.price)))}</span></div><svg viewBox="0 0 320 140" role="img" aria-label={`Gráfico com ${history.length} ${history.length===1?'preço registrado':'preços registrados'}`}><path d="M18 20H302M18 70H302M18 120H302" stroke="#f1dfd0" strokeWidth="1"/><polyline points={points.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#c3532c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>{points.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="4" fill="#b93422"/>)}</svg><div className="history-dates"><span>{date(history[0].observed_at)}</span>{history.length>1 && <span>{date(history.at(-1).observed_at)}</span>}</div></div><div className="history-observations">{[...history].reverse().map((item,i)=><div key={i}><span>{date(item.observed_at)}</span><strong>{money(item.price)}</strong></div>)}</div></> : <p className="history-empty">Nenhum preço registrado.</p>}</div></div></dialog>;
}
function StorePrice({ storeGroup, allGroups, stores, onAdd, onHistory, onPreview, grid }) {
  const [index, setIndex] = useState(0), [paused, setPaused] = useState(false);
  const prices = storeGroup.prices, current = prices[index % prices.length], offer = current.offer;
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer;
    const update = () => { clearInterval(timer); if (prices.length > 1 && !paused && !motion.matches) timer = setInterval(() => setIndex(value => (value + 1) % prices.length), 5000); };
    update(); motion.addEventListener('change', update);
    return () => { clearInterval(timer); motion.removeEventListener('change', update); };
  }, [prices.length, paused]);
  const other = allGroups.filter(group => group.store !== storeGroup.store && (group.unit || 'un') === (storeGroup.unit || 'un')).flatMap(group => group.prices).filter(price => price.label === current.label).sort((a,b) => a.price-b.price)[0];
  const nav = prices.length > 1 && <div className="price-pages" aria-label={`Preços de ${stores[storeGroup.store]?.[0] || storeGroup.store}`}>{prices.map((price,i) => <button type="button" key={i} aria-label={`Preço ${i+1}: ${price.label || 'Comum'} ${money(price.price)}`} aria-pressed={i === index % prices.length} onClick={() => setIndex(i)}>{i+1}</button>)}</div>;
  const price = <div key={`${current.priceType}:${current.price}:${current.label}`} className="price-slide"><div className={grid ? 'grid-price-main' : 'list-price-main'}><strong>{money(current.price)}{offer.price_unit === 'kg' && <small>/kg</small>}</strong>{current.priceType !== 'club' && <PriceTrend history={offer.history}/>}</div>{current.label && <div className="grid-offer-note">{current.label}</div>}{current.priceType !== 'club' && offer.regular_price && <del>{money(offer.regular_price)}</del>}</div>;
  const history = current.priceType === 'club' ? <button type="button" className="history-button" disabled title="Histórico de clube indisponível" aria-label="Histórico de clube indisponível">—</button> : <HistoryButton offer={offer} onOpen={onHistory}/>;
  const add = <button type="button" className="add" onClick={() => onAdd(offer.id,current.priceType)} aria-label={`Adicionar ${offer.name} à lista${current.label ? ` · ${current.label}` : ''}`}><AddIcon/></button>;
  const comparison = other && <div className="grid-offer-note">{current.price < other.price ? 'Mais barato' : current.price > other.price ? 'Mais caro' : 'Mesmo preço'} · {stores[other.offer.store]?.[0]} {money(other.price)}</div>;
  const interaction = { onMouseEnter:()=>setPaused(true), onMouseLeave:()=>setPaused(false), onFocus:()=>setPaused(true), onBlur:event=>{if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);} };
  if (grid) return <article className="grid-offer" {...interaction}><div className="grid-offer-store">{stores[storeGroup.store]?.[0] || storeGroup.store}</div>{offer.valid_until && <div className="grid-offer-note">até {offer.valid_until.slice(8,10)}/{offer.valid_until.slice(5,7)}</div>}<div className="grid-offer-price">{price}</div>{nav}{current.priceType !== 'club' && offer.history?.length >= 2 && <PriceChart history={offer.history}/>} {comparison}<div className="grid-buttons">{history}{add}</div></article>;
  return <article className="product-row" {...interaction}><ProductImage src={offer.image_url} name={offer.name} onOpen={onPreview}/><div className="min-w-0 flex-1"><div className="item-name text-sm font-semibold text-[#482c22]">{offer.url ? <a href={offer.url} target="_blank" rel="noreferrer">{offer.name}</a> : offer.name}</div><div className="mt-1 text-xs text-[#886959]">{stores[storeGroup.store]?.[0] || storeGroup.store}{offer.valid_until && ` · até ${offer.valid_until.slice(8,10)}/${offer.valid_until.slice(5,7)}`}</div><div className="offer-actions"><div>{price}{nav}{comparison}</div><div className="offer-buttons">{history}{add}</div></div></div></article>;
}
function GridProduct({group, stores, onPreview, onAdd, onHistory}) {
  const product=group[0], storeGroups=groupStorePrices(group);
  return <section className="grid-product"><ProductImage src={product.image_url} name={product.name} onOpen={onPreview}/><div className="grid-product-body"><div className="grid-product-name">{product.url ? <a href={product.url} target="_blank" rel="noreferrer">{product.name}</a> : product.name}</div>{product.image_source && <a className="grid-image-source" href={product.image_source} target="_blank" rel="noreferrer">Fonte da imagem</a>}<div className="grid-offers">{storeGroups.map(g => <StorePrice key={`${g.store}:${g.unit}`} storeGroup={g} allGroups={storeGroups} stores={stores} onPreview={onPreview} onAdd={onAdd} onHistory={onHistory} grid/>)}</div></div></section>;
}
function App() {
  const [data, setData] = useState({ offers: [], lists: [], sources: [], stores: {}, user:null });
  useEffect(() => { const splash = document.getElementById('splash'); const timer = setTimeout(() => splash?.remove(), 2200); return () => clearTimeout(timer); }, []);
  const [irresistibleOnly, setIrresistibleOnly] = useState(false), [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState('ofertas'), [category, setCategory] = useState('Todos'), [query, setQuery] = useState(''), [store, setStore] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const moreOffers = useRef(null);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [category, store, query, irresistibleOnly]);
  const [gridView, setGridView] = useState(() => { try {return localStorage.getItem('offers-view') === 'grid';} catch {return false;} });
  function toggleGrid() {setGridView(current => {const next=!current;try {localStorage.setItem('offers-view',next?'grid':'list');} catch {}return next;});}
  const [showTop, setShowTop] = useState(false);
  useEffect(() => { const update = () => setShowTop(window.scrollY > 200); update(); window.addEventListener('scroll', update, {passive:true}); return () => window.removeEventListener('scroll', update); }, []);
  const searchTrigger = useRef(null);
  const [activeListId, setActiveListId] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [historyOffer, setHistoryOffer] = useState(null);
  const [removal, setRemoval] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [modal, setModal] = useState(''), [selected, setSelected] = useState(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [storesOpen, setStoresOpen] = useState(false), [refreshing, setRefreshing] = useState({}), [toast, setToast] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  useEffect(() => {const url=new URL(window.location.href);if(url.searchParams.get('login')==='erro'){setMessage('Não foi possível entrar com o Google. Tente novamente.');url.searchParams.delete('login');window.history.replaceState(null,'',url.pathname+url.search+url.hash);}}, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 6000); return () => clearTimeout(timer); }, [toast]);
  async function load() { const response = await fetch('/api/data'); if (!response.ok) throw Error('Não foi possível carregar os dados.'); setData(await response.json()); }
  function chooseOffer(id, priceType = 'regular') { if (!data.user) {setModal('login');return;} setSelected({id,priceType}); setModal('choose'); }
  function startLogin(e) {if (data.login_available === false) {e.preventDefault();setMessage('Login Google ainda não configurado.');setModal('');}}
  async function logout() { try {await post('logout');setActiveListId(null);setSelected(null);await load();} catch(e){setMessage(e.message);} }
  useEffect(() => { if (!busy && !Object.values(refreshing).some(Boolean)) return; load().catch(() => {}); const timer = setInterval(() => load().catch(() => {}), 2000); return () => clearInterval(timer); }, [busy, refreshing]);
  useEffect(() => { load().catch(e => setMessage(e.message)); const timer = setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 30000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!query.trim()) { setSearchResults(null); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) throw Error('Não foi possível buscar produtos.');
        setSearchResults(await response.json());
      } catch (e) { if (e.name !== 'AbortError') setMessage(e.message); }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, data.offers]);
  function closeSearch() { setQuery(''); setSearchResults(null); setSearchOpen(false); searchTrigger.current?.focus({preventScroll:true}); }
  async function action(fn) { try { await fn(); await load(); } catch (e) { setMessage(e.message); } }
  async function refresh() { setBusy(true); try { const result = await post('refresh'); await load(); const failed = Object.values(result).filter(status => status.startsWith('Não atualizado:') || status.startsWith('Atualização parcial:')).length; setToast(failed ? `Atualização concluída · ${failed} com falha` : 'Supermercados atualizados'); } catch (e) { setToast(`Falha na atualização: ${e.message}`); } finally { setBusy(false); } }
  async function refreshStore(id) {
    setRefreshing(current => ({...current, [id]:true}));
    try { const result = await post('refresh-store', {store:id}); await load(); setToast(result.state === 'ok' ? `${data.stores[id][0]} atualizado · ${result.new_count} novos, ${result.changed_count} alterados` : result.status.startsWith('Atualização parcial:') ? `${data.stores[id][0]}: atualização parcial` : `${data.stores[id][0]}: falha na atualização`); }
    catch (e) { setToast(`Falha na atualização: ${e.message}`); }
    finally { setRefreshing(current => ({...current, [id]:false})); }
  }
  async function createList(e) { e.preventDefault(); const form = e.currentTarget; await action(async () => { const result = await post('list', { name: new FormData(form).get('name') }); if (selected) await post('item', { list_id: result.id, offer_id: selected.id, price_type: selected.priceType }); setActiveListId(result.id); setSelected(null); setModal(''); }); }
  const matchingKeys = query.trim() ? new Set((searchResults || []).map(o => o.product_key || `offer:${o.id}`)) : null;
  const threshold = data.irresistible_percent ?? 20;
  const hasIrresistible = data.offers.some(offer => isIrresistible(offer, threshold));
  useEffect(() => { if (!hasIrresistible) setIrresistibleOnly(false); }, [hasIrresistible]);
  const offers = data.offers.filter(o => (!irresistibleOnly || isIrresistible(o, threshold)) && (category === 'Todos' || o.category === category) && (!store || o.store === store) && (!matchingKeys || matchingKeys.has(o.product_key || `offer:${o.id}`)));
  const groups = [...offers.reduce((map, offer) => {
    const key = offer.product_key || `offer:${offer.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(offer);
    return map;
  }, new Map()).values()];
  useEffect(() => {
    if (view !== 'ofertas' || visibleCount >= groups.length || !moreOffers.current || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) setVisibleCount(count => Math.min(count + PAGE_SIZE, groups.length)); }, {rootMargin:'300px 0px'});
    observer.observe(moreOffers.current);
    return () => observer.disconnect();
  }, [view, visibleCount, groups.length]);
  const activeList = data.lists.find(list => list.id === activeListId) || data.lists[0];
  const listGroups = activeList ? groupListItems(activeList.items, data.stores) : [];
  const listTotal = listGroups.reduce((sum, group) => sum + group.total, 0);
  return <div className="mx-auto min-h-screen max-w-3xl px-4 pb-12 sm:px-6">
    <div className="app-header"><header className="flex h-[52px] items-center justify-between border-b border-[#f3ded0]"><div className="flex items-center gap-2.5"><img src="/logo.svg" alt="" width="32" height="32" className="size-8 shrink-0" /><h1 className="text-lg font-bold tracking-tight">Ofertas da Boa</h1></div><div className="header-actions">{data.user?.admin && <><button type="button" className="ai-trigger" onClick={() => setAiOpen(true)} aria-label="Configurar provedor de IA" title="Configurar IA">IA</button><button className="icon" onClick={refresh} disabled={busy} aria-label="Atualizar preços" title="Atualizar preços">↻</button></>}{data.user ? <AccountMenu user={data.user} onLogout={logout} onSettings={() => setSettingsOpen(true)} /> : <a href="/auth/google" onClick={startLogin} className="account-button">Entrar</a>}</div></header>
    <nav className="flex items-center gap-5 border-b border-[#f3ded0]" aria-label="Navegação">{[['ofertas','Ofertas'],['listas',`Listas (${data.lists.length})`]].map(([id,label]) => <button key={id} className={`tab ${view === id ? 'active' : ''}`} onClick={() => setView(id)}>{label}</button>)}<div className="nav-actions">{view === 'ofertas' && <button type="button" className="search-trigger" ref={searchTrigger} aria-label={searchOpen ? 'Fechar busca' : 'Abrir busca'} aria-expanded={searchOpen} onClick={() => { if (searchOpen) closeSearch(); else setSearchOpen(true); }}><SearchIcon /></button>}{view === 'ofertas' && <button type="button" className="search-trigger" onClick={toggleGrid} aria-pressed={gridView} aria-label={gridView ? 'Mostrar em lista' : 'Mostrar em grade'} title={gridView ? 'Mostrar em lista' : 'Mostrar em grade'}><ViewIcon grid={gridView}/></button>}<button type="button" className="stores-trigger" onClick={() => setStoresOpen(true)} aria-label="Supermercados e atualizações" title="Supermercados"><StoreIcon /></button></div></nav>
      {view === 'ofertas' && searchOpen && <div className="search-dock"><div className="search flex min-w-0 items-center gap-2"><SearchIcon /><input autoFocus value={query} onChange={e => { setSearchResults(null); setQuery(e.target.value); }} onKeyDown={e => { if (e.key === 'Escape') closeSearch(); }} placeholder="Buscar produto" aria-label="Buscar produto" className="w-full min-w-0 outline-none" /><button className="search-close" type="button" aria-label="Fechar busca" onClick={closeSearch}>×</button></div></div>}
    </div>
    <div className="price-notice">Preços sujeitos a alterações conforme estoque e loja.</div>
    {message && <div className="mt-3 flex items-start justify-between gap-2 rounded-lg bg-[#fff1d6] px-3 py-2 text-xs text-[#824425]" role="status"><span>{message}</span><button onClick={() => setMessage('')} aria-label="Fechar aviso">×</button></div>}
    {view === 'ofertas' ? <main className="offers-content">

      <div className="scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">{categories.map(c => <button key={c} onClick={() => setCategory(c)} className={`chip ${category === c ? 'selected' : ''}`}>{c}</button>)}</div>
      <div className="my-2 flex items-center justify-between gap-2 text-xs text-[#92705c]"><div className="offer-count"><span>{groups.length} {groups.length === 1 ? 'produto' : 'produtos'}</span>{hasIrresistible && <button type="button" className={`irresistible-filter${irresistibleOnly ? ' active' : ''}`} aria-pressed={irresistibleOnly} onClick={() => setIrresistibleOnly(current => !current)}><svg className="irresistible-bolt" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h7l-1 8 10-12h-7l0-8Z"/></svg>Irresistíveis</button>}</div><div className="flex min-w-0 items-center gap-1"><select aria-label="Supermercado" value={store} onChange={e => setStore(e.target.value)} className="min-w-0 max-w-48 bg-transparent py-2 font-semibold text-[#a53f25]"><option value="">Todos os mercados</option>{Object.entries(data.stores).map(([id, value]) => <option key={id} value={id}>{value[0]}</option>)}</select></div></div>
      {!!data.pending_offers?.length && <button type="button" className="review-trigger" onClick={()=>setReviewOpen(true)}>Revisar ofertas · {data.pending_offers.length}</button>}
      <div className={gridView && groups.length ? "products-grid" : "space-y-2"}>{groups.length ? groups.slice(0,visibleCount).map(group => gridView ? <GridProduct key={group[0].product_key || group[0].id} group={group} stores={data.stores} onPreview={setPreviewImage} onHistory={setHistoryOffer} onAdd={chooseOffer} /> : <section key={group[0].product_key || group[0].id} className="overflow-hidden rounded-xl border border-[#f1dfd0] bg-white">{groupStorePrices(group).map((storeGroup,_,allGroups) => <StorePrice key={`${storeGroup.store}:${storeGroup.unit}`} storeGroup={storeGroup} allGroups={allGroups} stores={data.stores} onPreview={setPreviewImage} onAdd={chooseOffer} onHistory={setHistoryOffer}/>)}</section>) : <div className="rounded-xl border border-[#f1dfd0] bg-white px-4 py-12 text-center text-sm text-[#987766]">Nenhum produto encontrado.</div>}</div>
      {visibleCount < groups.length && <button ref={moreOffers} type="button" className="load-more" onClick={() => setVisibleCount(count => Math.min(count + PAGE_SIZE, groups.length))}>Carregar mais</button>}

    </main> : <main className={activeList ? 'list-content' : ''}>
      <div className="my-4 flex items-center justify-between gap-2"><h2 className="font-bold">Minhas listas</h2>{data.user && <button className="primary" onClick={() => { setSelected(null); setModal('list'); }}>+ Lista</button>}</div>
      {!data.user ? <div className="login-prompt"><p>Entre para criar suas listas.</p><a href="/auth/google" onClick={startLogin} className="primary login-link">Entrar com Google</a></div> : activeList ? <>
        <div className="mb-4 flex items-center gap-2"><label className="min-w-0 flex-1"><span className="sr-only">Lista de compras</span><select className="list-select" value={activeList.id} onChange={e => { setRemoval(null); setActiveListId(Number(e.target.value)); }}>{data.lists.map(list => <option key={list.id} value={list.id}>{list.name} · {list.items.length} itens</option>)}</select></label><button className="edit-list" onClick={() => setModal('rename')} aria-label={`Renomear ${activeList.name}`}>Editar</button><button className="icon" aria-label={`Excluir ${activeList.name}`} onClick={() => { if (confirm('Excluir esta lista?')) action(() => post('delete-list', { id: activeList.id })); }}>×</button></div>
        {listGroups.length ? <div className="space-y-3">{listGroups.map(group => <section key={group.id} className="list-group"><div className="store-total"><span>{group.name}<small>{group.items.length} {group.items.length === 1 ? 'item' : 'itens'}</small></span><strong>{money(group.total)}</strong></div>{group.items.map(item => <div key={item.id} className="shopping-item relative border-t border-[#f7e9de]" onKeyDown={e => { if (e.key === 'Escape' && !removing) setRemoval(null); }}><div className="flex items-center gap-2 px-3" inert={removal?.listId === activeList.id && removal?.itemId === item.id ? true : undefined}><label className="check-target"><input className="size-5 accent-[#c14424]" type="checkbox" checked={!!item.checked} aria-label={`Marcar ${item.name}`} onChange={e => { const checked = e.target.checked; action(() => post('check', { list_id: activeList.id, offer_id: item.id, checked })); }} /></label><ProductImage src={item.image_url} name={item.name} onOpen={setPreviewImage} /><div className={`min-w-0 flex-1 text-sm ${item.checked ? 'text-[#ad9689] line-through' : ''}`}><div className="item-name">{item.name}</div>{(item.condition || item.valid_until || item.image_source) && <div className="text-xs text-[#987766]">{[item.condition, item.valid_until && `até ${item.valid_until.slice(8,10)}/${item.valid_until.slice(5,7)}`].filter(Boolean).join(' · ')}{item.image_source && <>{(item.condition || item.valid_until) && ' · '}<a href={item.image_source} target="_blank" rel="noreferrer" className="underline">Fonte da imagem</a></>}</div>}</div><button className="quantity-button" aria-label={`Editar quantidade de ${item.name}`} onClick={() => { setEditingItem(item); setModal('quantity'); }}><span>{item.price_unit === 'kg' ? `${item.quantity} kg` : `Qtd. ${item.quantity}`}</span><strong>{money(item.price * item.quantity)}</strong></button><button className="icon" aria-label={`Remover ${item.name}`} onClick={() => setRemoval({listId:activeList.id,itemId:item.id})}>×</button></div>{removal?.listId === activeList.id && removal?.itemId === item.id && <div className="remove-confirm" role="group" aria-label={`Confirmar remoção de ${item.name}`}><span>Remover item?</span><button autoFocus disabled={removing} onClick={() => setRemoval(null)}>Cancelar</button><button className="remove-confirm-action" disabled={removing} onClick={async () => { setRemoving(true); try { await post('remove', {list_id:activeList.id, offer_id:item.id}); setRemoval(null); await load(); } catch (e) { setMessage(e.message); } finally { setRemoving(false); } }}>Remover</button></div>}</div>)}</section>)}</div> : <div className="rounded-xl border border-[#f1dfd0] bg-white px-4 py-12 text-center text-sm text-[#987766]">Nenhum item nesta lista.</div>}
        <div className={`list-total-bar ${showTop ? 'has-top-button' : ''}`}><div><span>Total da lista</span><strong>{money(listTotal)}</strong></div></div>
      </> : <div className="rounded-xl border border-[#f1dfd0] bg-white px-4 py-12 text-center text-sm text-[#987766]">Nenhuma lista criada.</div>}
    </main>}
    {showTop && <button type="button" className={`scroll-top ${view === 'listas' && activeList ? 'in-list-footer' : ''}`} aria-label="Voltar ao topo" onClick={() => window.scrollTo({top:0, behavior:'instant'})}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>}
    {settingsOpen && data.user?.admin && <OfferSettingsDialog percent={threshold} onClose={() => setSettingsOpen(false)} onSaved={async () => { await load(); setToast('Configuração salva'); }}/>}
    {aiOpen && <AiSettingsDialog onClose={() => setAiOpen(false)} onSaved={() => setToast('Configuração de IA salva')}/>}
    {reviewOpen && <ReviewDialog offers={data.pending_offers || []} currentOffers={data.offers} stores={data.stores} onClose={()=>setReviewOpen(false)} onReview={async (id,decision)=>{await post('review-offer',{id,decision});await load();}}/>}
    {storesOpen && <StoresDialog data={data} refreshing={refreshing} onRefresh={refreshStore} onClose={() => setStoresOpen(false)} toast={toast} />}
    {!storesOpen && <Toast text={toast}/>}
    {historyOffer && <HistoryDialog offer={historyOffer} store={data.stores[historyOffer.store]?.[0] || historyOffer.store} onClose={()=>setHistoryOffer(null)}/>}
    {previewImage && <ImageLightbox image={previewImage} onClose={() => setPreviewImage(null)} />}
    {modal && <div className="modal" onMouseDown={e => { if (e.target === e.currentTarget) setModal(''); }}><div role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="modal-panel"><div className="mb-4 flex items-center justify-between"><h2 id="dialog-title" className="font-bold">{modal === 'login' ? 'Entrar' : modal === 'list' ? 'Nova lista' : modal === 'rename' ? 'Renomear lista' : modal === 'quantity' ? 'Editar quantidade' : 'Adicionar à lista'}</h2><button className="icon" onClick={() => setModal('')} aria-label="Fechar">×</button></div>
      {modal === 'login' && <div className="login-prompt"><p>Entre para criar suas listas.</p><a href="/auth/google" onClick={startLogin} className="primary login-link">Entrar com Google</a></div>}
      {modal === 'list' && <form className="space-y-3" onSubmit={createList}><label>Nome<input name="name" required autoFocus placeholder="Ex.: Compra da semana" /></label><button className="primary w-full">Criar lista</button></form>}
      {modal === 'rename' && <form className="space-y-3" onSubmit={e => { e.preventDefault(); const name = new FormData(e.currentTarget).get('name'); action(async () => { await post('rename-list', {id:activeList.id, name}); setModal(''); }); }}><label>Nome<input name="name" defaultValue={activeList.name} maxLength="100" required autoFocus /></label><button className="primary w-full">Salvar</button></form>}
      {modal === 'quantity' && editingItem && <form className="space-y-3" onSubmit={e => { e.preventDefault(); const quantity = Number(new FormData(e.currentTarget).get('quantity')); action(async () => { await post('quantity', {list_id:activeList.id, offer_id:editingItem.id, quantity}); setModal(''); }); }}><p className="text-sm">{editingItem.name}</p><label>{editingItem.price_unit === 'kg' ? 'Quantidade (kg)' : 'Quantidade'}<input name="quantity" type="number" inputMode="numeric" min="1" max="999" step="1" defaultValue={editingItem.quantity} required autoFocus /></label><button className="primary w-full">Salvar</button></form>}
      {modal === 'choose' && <div className="space-y-2">{data.lists.map(list => <button key={list.id} className="choose" onClick={() => action(async () => { await post('item', { list_id: list.id, offer_id: selected.id, price_type: selected.priceType }); setModal(''); setSelected(null); setMessage('Produto adicionado.'); })}>{list.name} <span className="text-xs text-[#987766]">· {list.items.length} itens</span></button>)}<button className="primary w-full" onClick={() => setModal('list')}>+ Nova lista</button></div>}
    </div></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
