import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { IconSearch, IconAdjustmentsHorizontal, IconList, IconLayoutGrid, IconChartLine, IconPlus, IconBolt, IconArrowUp, IconArrowDown, IconX, IconTrash, IconShoppingBag, IconBrandWhatsapp } from '@tabler/icons-react';
import './style.css';
import { groupListItems } from './list-groups.js';
import { formatShoppingList } from './share-list.js';
import { priceTrend, chartPoints } from './price-history.js';
import { isIrresistible } from './irresistible.js';
import { groupEqualPrices } from './offer-prices.js';
import { parsePriceBound, matchesPriceRange } from './price-filter.js';
import { latestSuccessfulUpdate } from './last-update.js';

const categories = ['Todos', 'Carnes', 'Hortifruti', 'Mercearia', 'Limpeza', 'Higiene', 'Frios e laticínios', 'Padaria', 'Bebidas'];
const PAGE_SIZE = 24;
const money = value => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
async function post(path, data = {}) {
  const response = await fetch(`/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw Error(result.error);
  return result;
}
function CategoryBar({ selected, onSelect }) {
  const drag = useRef(null), suppressClick = useRef(false);
  return <div className="scrollbar category-bar mt-3 flex gap-2 overflow-x-auto pb-1"
    onPointerDown={event => { if (event.pointerType === 'mouse' && event.button === 0) drag.current = {x:event.clientX, scroll:event.currentTarget.scrollLeft, moved:false}; }}
    onPointerMove={event => { if (!drag.current) return; const distance = event.clientX - drag.current.x; if (Math.abs(distance) > 5) { drag.current.moved = true; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.scrollLeft = drag.current.scroll - distance; event.preventDefault(); } }}
    onPointerUp={event => { if (!drag.current) return; suppressClick.current = drag.current.moved; drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); if (suppressClick.current) setTimeout(() => { suppressClick.current = false; }, 0); }}
    onPointerCancel={() => { drag.current = null; }}
    onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
    {categories.map(category => <button key={category} onClick={() => onSelect(category)} className={`chip ${selected === category ? 'selected' : ''}`}>{category}</button>)}
  </div>;
}
function AccountMenu({ user, onLogout }) {
  const menu = useRef(null);
  return <details ref={menu} className="account-menu" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }} onKeyDown={event => { if (event.key === 'Escape') { menu.current.open = false; menu.current.querySelector('summary')?.focus(); } }}>
    <summary className="account-avatar" aria-label="Menu da conta" title={user.name}><span aria-hidden="true">{(user.name || user.email || '?').trim().charAt(0).toLocaleUpperCase()}</span>{user.picture && <img src={user.picture} alt="" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }}/>}</summary>
    <div className="account-popover"><div className="account-email">{user.email}</div><button type="button" onClick={() => { menu.current.open = false; onLogout(); }}>Sair</button></div>
  </details>;
}
function Icon({ icon: Component, size = 18, className }) { return <Component aria-hidden="true" className={className} size={size} stroke={1.8}/>; }
function ProductImage({ src, name, onOpen }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const fallback = <Icon icon={IconShoppingBag}/>;
  if (!src || failed) return <span className="product-image" aria-hidden="true">{fallback}</span>;
  return <button type="button" className="product-image" aria-label={`Ampliar imagem de ${name}`} onClick={() => onOpen({src, name})}>{fallback}<img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /></button>;
}
function ImageLightbox({ image, onClose }) {
  const dialog = useRef(null);
  useEffect(() => { dialog.current.showModal(); }, []);
  return <dialog ref={dialog} className="image-lightbox" aria-label={`Imagem de ${image.name}`} onClose={onClose} onClick={e => { if (e.target === dialog.current) dialog.current.close(); }}><div className="image-lightbox-panel"><div className="image-lightbox-header"><span>{image.name}</span><button className="icon" type="button" aria-label="Fechar imagem" onClick={() => dialog.current.close()} autoFocus><Icon icon={IconX} size={16}/></button></div><img src={image.src} alt={image.name} referrerPolicy="no-referrer" /></div></dialog>;
}
function SearchIcon() { return <Icon icon={IconSearch}/>; }
function PriceFilterIcon() { return <Icon icon={IconAdjustmentsHorizontal}/>; }
function ViewIcon({grid}) { return <Icon icon={grid ? IconList : IconLayoutGrid}/>; }
function Toast({ text, top = false }) { return text ? <div className={`store-toast${top ? ' store-toast-top' : ''}`} role="status">{text}</div> : null; }
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
  return <span className={`price-trend ${change > 0 ? 'price-up' : 'price-down'}`} title={label} aria-label={label} role="img"><Icon icon={change > 0 ? IconArrowUp : IconArrowDown} size={13}/></span>;
}
function HistoryButton({offer, onOpen}) { return <button type="button" className="history-button" onClick={() => onOpen(offer)} aria-label={`Ver histórico de ${offer.name}`} title="Histórico de preços"><Icon icon={IconChartLine}/></button>; }
function AddIcon() { return <Icon icon={IconPlus}/>; }
function HistoryDialog({offer, store, onClose}) {
  const dialog=useRef(null), history=offer.history || [], points=chartPoints(history);
  useEffect(() => {dialog.current.showModal();}, []);
  const date=value => {const parsed=new Date(`${(value || '').replace(' ','T')}Z`);return Number.isNaN(parsed.getTime()) ? 'Data indisponível' : parsed.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});};
  return <dialog ref={dialog} className="stores-dialog" aria-labelledby="history-title" onClose={onClose} onClick={e=>{if(e.target===dialog.current)dialog.current.close();}}><div className="stores-panel"><div className="stores-heading"><h2 id="history-title">Histórico de preços</h2><button type="button" className="icon" aria-label="Fechar histórico" onClick={()=>dialog.current.close()} autoFocus><Icon icon={IconX} size={16}/></button></div><div className="history-content"><div className="history-name">{offer.name}</div><div className="history-subtitle">{store}{offer.condition ? ` · ${offer.condition}` : ''} · até 20 registros</div>{history.length ? <><div className="history-chart"><div className="history-chart-scale"><span>Máx. {money(Math.max(...history.map(item=>item.price)))}</span><span>Mín. {money(Math.min(...history.map(item=>item.price)))}</span></div><svg viewBox="0 0 320 140" role="img" aria-label={`Gráfico com ${history.length} ${history.length===1?'preço registrado':'preços registrados'}`}><path d="M18 20H302M18 70H302M18 120H302" stroke="#f1dfd0" strokeWidth="1"/><polyline points={points.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#c3532c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>{points.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="4" fill="#b93422"/>)}</svg><div className="history-dates"><span>{date(history[0].observed_at)}</span>{history.length>1 && <span>{date(history.at(-1).observed_at)}</span>}</div></div></> : <p className="history-empty">Nenhum preço registrado.</p>}</div></div></dialog>;
}
function StorePrice({ storeGroup, allGroups, stores, onAdd, onHistory, onPreview, grid }) {
  const [selectedStore, setSelectedStore] = useState(storeGroup.offers[0].store), [club, setClub] = useState(false);
  const offer = storeGroup.offers.find(item => item.store === selectedStore) || storeGroup.offers[0];
  const other = allGroups.filter(group => group !== storeGroup && group.unit === storeGroup.unit && group.condition === storeGroup.condition).flatMap(group => group.offers).filter(item => item.store !== offer.store).sort((a,b) => a.price-b.price)[0];
  const names = storeGroup.offers.map(item => stores[item.store]?.[0] || item.store);
  const store = storeGroup.offers.length > 1 ? <><div className="same-price-stores">{names.join(' · ')}</div><select className="same-price-select" aria-label={`Escolher supermercado para ${offer.name}`} value={offer.store} onChange={event => { setSelectedStore(event.target.value); setClub(false); }}>{storeGroup.offers.map(item => <option key={item.store} value={item.store}>{stores[item.store]?.[0] || item.store}</option>)}</select></> : <div className="grid-offer-store">{names[0]}</div>;
  const clubButton = offer.club_price > 0 && offer.club_price !== offer.price && <button type="button" className={`club-price${club ? ' selected' : ''}`} aria-pressed={club} aria-label={`Selecionar preço de clube ${money(offer.club_price)} em ${names[storeGroup.offers.indexOf(offer)]}`} onClick={() => setClub(value => !value)}>Clube {money(offer.club_price)}</button>;
  const price = <div className="store-price"><div className={grid ? 'grid-price-main' : 'list-price-main'}><strong>{money(offer.price)}{offer.price_unit === 'kg' && <small>/kg</small>}</strong><PriceTrend history={offer.history}/></div>{offer.condition && <div className="grid-offer-note">{offer.condition}</div>}{offer.regular_price && <del>{money(offer.regular_price)}</del>}{clubButton}</div>;
  const add = <button type="button" className="add" onClick={() => onAdd(offer.id,club ? 'club' : 'regular')} aria-label={`Adicionar ${offer.name} à lista${club ? ' · Clube' : ''}`}><AddIcon/></button>;
  const comparison = other && <div className="grid-offer-note">{offer.price < other.price ? 'Mais barato' : 'Mais caro'} · {stores[other.store]?.[0]} {money(other.price)}</div>;
  if (grid) return <article className="grid-offer">{store}{offer.valid_until && <div className="grid-offer-note">até {offer.valid_until.slice(8,10)}/{offer.valid_until.slice(5,7)}</div>}<div className="grid-offer-price">{price}</div>{offer.history?.length >= 2 && <PriceChart history={offer.history}/>} {comparison}<div className="grid-buttons"><HistoryButton offer={offer} onOpen={onHistory}/>{add}</div></article>;
  return <article className="product-row"><ProductImage src={offer.image_url} name={offer.name} onOpen={onPreview}/><div className="min-w-0 flex-1"><div className="item-name text-sm font-semibold text-[#482c22]">{offer.url ? <a href={offer.url} target="_blank" rel="noreferrer">{offer.name}</a> : offer.name}</div>{store}{offer.valid_until && <div className="grid-offer-note">até {offer.valid_until.slice(8,10)}/{offer.valid_until.slice(5,7)}</div>}<div className="offer-actions"><div>{price}{comparison}</div><div className="offer-buttons"><HistoryButton offer={offer} onOpen={onHistory}/>{add}</div></div></div></article>;
}
function GridProduct({group, stores, onPreview, onAdd, onHistory}) {
  const product=group[0], storeGroups=groupEqualPrices(group);
  return <section className="grid-product"><ProductImage src={product.image_url} name={product.name} onOpen={onPreview}/><div className="grid-product-body"><div className="grid-product-name">{product.url ? <a href={product.url} target="_blank" rel="noreferrer">{product.name}</a> : product.name}</div>{product.image_source && <a className="grid-image-source" href={product.image_source} target="_blank" rel="noreferrer">Fonte da imagem</a>}<div className="grid-offers">{storeGroups.map(g => <StorePrice key={g.key} storeGroup={g} allGroups={storeGroups} stores={stores} onPreview={onPreview} onAdd={onAdd} onHistory={onHistory} grid/>)}</div></div></section>;
}
function App() {
  const [data, setData] = useState({ offers: [], lists: [], sources: [], stores: {}, user:null, total_products:null });
  useEffect(() => { const splash = document.getElementById('splash'); const timer = setTimeout(() => splash?.remove(), 2200); return () => clearTimeout(timer); }, []);
  const [irresistibleOnly, setIrresistibleOnly] = useState(false);
  const [view, setView] = useState('ofertas'), [category, setCategory] = useState('Todos'), [query, setQuery] = useState(''), [store, setStore] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false), [priceOpen, setPriceOpen] = useState(false);
  const [priceMin, setPriceMin] = useState(''), [priceMax, setPriceMax] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const moreOffers = useRef(null);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [category, store, query, irresistibleOnly, priceMin, priceMax]);
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
  const [modal, setModal] = useState(''), [selected, setSelected] = useState(null), [message, setMessage] = useState('');
  const [addedToast, setAddedToast] = useState(null);
  useEffect(() => {const url=new URL(window.location.href);if(url.searchParams.get('login')==='erro'){setMessage('Não foi possível entrar com o Google. Tente novamente.');url.searchParams.delete('login');window.history.replaceState(null,'',url.pathname+url.search+url.hash);}}, []);
  useEffect(() => { if (!addedToast) return; const timer = setTimeout(() => setAddedToast(null), 3500); return () => clearTimeout(timer); }, [addedToast]);
  async function load() { const response = await fetch('/api/data'); if (!response.ok) throw Error('Não foi possível carregar os dados.'); setData(await response.json()); }
  function chooseOffer(id, priceType = 'regular') { if (!data.user) {setModal('login');return;} setSelected({id,priceType}); setModal('choose'); }
  function startLogin(e) {if (data.login_available === false) {e.preventDefault();setMessage('Login Google ainda não configurado.');setModal('');}}
  async function logout() { try {await post('logout');setActiveListId(null);setSelected(null);await load();} catch(e){setMessage(e.message);} }
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
  async function createList(e) { e.preventDefault(); const form = e.currentTarget; await action(async () => { const name = new FormData(form).get('name'), result = await post('list', { name }); if (selected) { await post('item', { list_id: result.id, offer_id: selected.id, price_type: selected.priceType }); setAddedToast({text:`Adicionado à lista ${name}`}); } setActiveListId(result.id); setSelected(null); setModal(''); }); }
  const matchingKeys = query.trim() ? new Set((searchResults || []).map(o => o.product_key || `offer:${o.id}`)) : null;
  const threshold = data.irresistible_percent ?? 20;
  const hasIrresistible = data.offers.some(offer => isIrresistible(offer, threshold));
  useEffect(() => { if (!hasIrresistible) setIrresistibleOnly(false); }, [hasIrresistible]);
  const minPrice = parsePriceBound(priceMin), maxPrice = parsePriceBound(priceMax);
  const priceError = minPrice === undefined || maxPrice === undefined ? 'Use valores válidos, com até dois decimais.' : minPrice !== null && maxPrice !== null && minPrice > maxPrice ? 'O mínimo deve ser menor ou igual ao máximo.' : '';
  const offers = data.offers.filter(o => !priceError && matchesPriceRange(o, minPrice, maxPrice) && (!irresistibleOnly || isIrresistible(o, threshold)) && (category === 'Todos' || o.category === category) && (!store || o.store === store) && (!matchingKeys || matchingKeys.has(o.product_key || `offer:${o.id}`)));
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
  const lastUpdate = latestSuccessfulUpdate(data.sources, data.store_sources);
  const activeList = data.lists.find(list => list.id === activeListId) || data.lists[0];
  const listGroups = activeList ? groupListItems(activeList.items, data.stores) : [];
  const listTotal = listGroups.reduce((sum, group) => sum + group.total, 0);
  return <div className="mx-auto min-h-screen max-w-3xl px-4 pb-12 sm:px-6">
    <div className="app-header"><header className="flex h-[52px] items-center justify-between border-b border-[#f3ded0]"><div className="flex items-center gap-2.5"><img src="/logo.svg" alt="" width="32" height="32" className="size-8 shrink-0" /><div><h1 className="text-lg font-bold leading-none tracking-tight">Ofertas da Boa</h1><span className="block text-xs font-semibold leading-none text-[#a27660]">Sorocaba</span></div></div><div className="header-actions">{data.user ? <AccountMenu user={data.user} onLogout={logout} /> : <a href="/auth/google" onClick={startLogin} className="account-button">Entrar</a>}</div></header>
    <nav className="flex items-center gap-2 border-b border-[#f3ded0]" aria-label="Navegação">{[['ofertas','Ofertas'],['listas',`Listas (${data.lists.length})`]].map(([id,label]) => <button key={id} className={`tab ${view === id ? 'active' : ''}`} onClick={() => setView(id)}>{label}</button>)}<div className="nav-actions">{view === 'ofertas' && <button type="button" className="search-trigger" ref={searchTrigger} aria-label={searchOpen ? 'Fechar busca' : 'Abrir busca'} aria-expanded={searchOpen} onClick={() => { if (searchOpen) closeSearch(); else setSearchOpen(true); }}><SearchIcon /></button>}{view === 'ofertas' && <button type="button" className={`search-trigger price-filter-trigger${priceMin || priceMax ? ' active' : ''}`} aria-label={priceOpen ? 'Fechar filtro de preço' : 'Filtrar por preço'} aria-expanded={priceOpen} aria-controls="price-filter" onClick={() => setPriceOpen(current => !current)}><PriceFilterIcon /></button>}{view === 'ofertas' && <button type="button" className="search-trigger" onClick={toggleGrid} aria-pressed={gridView} aria-label={gridView ? 'Mostrar em lista' : 'Mostrar em grade'} title={gridView ? 'Mostrar em lista' : 'Mostrar em grade'}><ViewIcon grid={gridView}/></button>}</div></nav>
      {view === 'ofertas' && searchOpen && <div className="search-dock"><div className="search flex min-w-0 items-center gap-2"><SearchIcon /><input autoFocus value={query} onChange={e => { setSearchResults(null); setQuery(e.target.value); }} onKeyDown={e => { if (e.key === 'Escape') closeSearch(); }} placeholder="Buscar produto" aria-label="Buscar produto" className="w-full min-w-0 outline-none" /><button className="search-close" type="button" aria-label="Fechar busca" onClick={closeSearch}><Icon icon={IconX} size={16}/></button></div></div>}
      {view === 'ofertas' && priceOpen && <div id="price-filter" className="price-filter"><label>Preço mínimo <span className="price-input"><span>R$</span><input type="text" inputMode="decimal" placeholder="0,00" aria-label="Preço mínimo" value={priceMin} onChange={event => setPriceMin(event.target.value)} aria-invalid={!!priceError}/></span></label><label>Preço máximo <span className="price-input"><span>R$</span><input type="text" inputMode="decimal" placeholder="Sem limite" aria-label="Preço máximo" value={priceMax} onChange={event => setPriceMax(event.target.value)} aria-invalid={!!priceError}/></span></label><button type="button" className="price-filter-clear" onClick={() => {setPriceMin('');setPriceMax('');}}>Limpar</button>{priceError && <div className="price-filter-error" role="status">{priceError}</div>}</div>}
    </div>
    <div className="price-notice"><div className="price-notice-meta"><span>Atualizado: {lastUpdate ? lastUpdate.toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : 'sem data'}</span><span>·</span><span>{data.total_products == null ? '—' : data.total_products.toLocaleString('pt-BR')} {data.total_products === 1 ? 'produto' : 'produtos'}</span></div><div>Preços sujeitos a alterações conforme estoque e loja.</div></div>
    {message && <div className="mt-3 flex items-start justify-between gap-2 rounded-lg bg-[#fff1d6] px-3 py-2 text-xs text-[#824425]" role="status"><span>{message}</span><button onClick={() => setMessage('')} aria-label="Fechar aviso"><Icon icon={IconX} size={16}/></button></div>}
    {view === 'ofertas' ? <main className="offers-content">

      <CategoryBar selected={category} onSelect={setCategory} />
      <div className="my-2 flex items-center justify-between gap-2 text-xs text-[#92705c]"><div className="offer-count">{hasIrresistible && <button type="button" className={`irresistible-filter${irresistibleOnly ? ' active' : ''}`} aria-pressed={irresistibleOnly} onClick={() => setIrresistibleOnly(current => !current)}><Icon icon={IconBolt} className="irresistible-bolt" size={15}/>Irresistíveis</button>}</div><div className="flex min-w-0 items-center gap-1"><select aria-label="Supermercado" value={store} onChange={e => setStore(e.target.value)} className="min-w-0 max-w-48 bg-transparent py-2 font-semibold text-[#a53f25]"><option value="">Todos os mercados</option>{Object.entries(data.stores).map(([id, value]) => <option key={id} value={id}>{value[0]}</option>)}</select></div></div>
      <div className={gridView && groups.length ? "products-grid" : "space-y-2"}>{groups.length ? groups.slice(0,visibleCount).map(group => gridView ? <GridProduct key={group[0].product_key || group[0].id} group={group} stores={data.stores} onPreview={setPreviewImage} onHistory={setHistoryOffer} onAdd={chooseOffer} /> : <section key={group[0].product_key || group[0].id} className="overflow-hidden rounded-xl border border-[#f1dfd0] bg-white">{groupEqualPrices(group).map((storeGroup,_,allGroups) => <StorePrice key={storeGroup.key} storeGroup={storeGroup} allGroups={allGroups} stores={data.stores} onPreview={setPreviewImage} onAdd={chooseOffer} onHistory={setHistoryOffer}/>)}</section>) : <div className="rounded-xl border border-[#f1dfd0] bg-white px-4 py-12 text-center text-sm text-[#987766]">Nenhum produto encontrado.</div>}</div>
      {visibleCount < groups.length && <button ref={moreOffers} type="button" className="load-more" onClick={() => setVisibleCount(count => Math.min(count + PAGE_SIZE, groups.length))}>Carregar mais</button>}

    </main> : <main className={activeList ? 'list-content' : ''}>
      <div className="my-4 flex items-center justify-between gap-2"><h2 className="font-bold">Minhas listas</h2>{data.user && <button className="primary" onClick={() => { setSelected(null); setModal('list'); }}><Icon icon={IconPlus} size={12}/> Lista</button>}</div>
      {!data.user ? <div className="login-prompt"><p>Entre para criar suas listas.</p><a href="/auth/google" onClick={startLogin} className="primary login-link">Entrar com Google</a></div> : activeList ? <>
        <div className="mb-4 flex items-center gap-2"><label className="min-w-0 flex-1"><span className="sr-only">Lista de compras</span><select className="list-select" value={activeList.id} onChange={e => { setRemoval(null); setActiveListId(Number(e.target.value)); }}>{data.lists.map(list => <option key={list.id} value={list.id}>{list.name} · {list.items.length} itens</option>)}</select></label><a className="share-list" href={`https://wa.me/?text=${encodeURIComponent(formatShoppingList(activeList.name, listGroups))}`} target="_blank" rel="noopener noreferrer" aria-label="Compartilhar lista no WhatsApp" title="Compartilhar no WhatsApp"><Icon icon={IconBrandWhatsapp} size={20}/></a><button className="edit-list" onClick={() => setModal('rename')} aria-label={`Renomear ${activeList.name}`}>Editar</button><button className="icon" aria-label={`Excluir ${activeList.name}`} onClick={() => { if (confirm('Excluir esta lista?')) action(() => post('delete-list', { id: activeList.id })); }}><Icon icon={IconTrash} size={16}/></button></div>
        {listGroups.length ? <div className="space-y-3">{listGroups.map(group => <section key={group.id} className="list-group"><div className="store-total"><span>{group.name}<small>{group.items.length} {group.items.length === 1 ? 'item' : 'itens'}</small></span><strong>{money(group.total)}</strong></div>{group.items.map(item => <div key={item.id} className="shopping-item relative border-t border-[#f7e9de]" onKeyDown={e => { if (e.key === 'Escape' && !removing) setRemoval(null); }}><div className="flex items-center gap-2 px-3" inert={removal?.listId === activeList.id && removal?.itemId === item.id ? true : undefined}><label className="check-target"><input className="size-5 accent-[#c14424]" type="checkbox" checked={!!item.checked} aria-label={`Marcar ${item.name}`} onChange={e => { const checked = e.target.checked; action(() => post('check', { list_id: activeList.id, offer_id: item.id, checked })); }} /></label><ProductImage src={item.image_url} name={item.name} onOpen={setPreviewImage} /><div className={`min-w-0 flex-1 text-sm ${item.checked ? 'text-[#ad9689] line-through' : ''}`}><div className="item-name">{item.name}</div>{(item.condition || item.valid_until || item.image_source) && <div className="text-xs text-[#987766]">{[item.condition, item.valid_until && `até ${item.valid_until.slice(8,10)}/${item.valid_until.slice(5,7)}`].filter(Boolean).join(' · ')}{item.image_source && <>{(item.condition || item.valid_until) && ' · '}<a href={item.image_source} target="_blank" rel="noreferrer" className="underline">Fonte da imagem</a></>}</div>}</div><button className="quantity-button" aria-label={`Editar quantidade de ${item.name}`} onClick={() => { setEditingItem(item); setModal('quantity'); }}><span>{item.price_unit === 'kg' ? `${item.quantity} kg` : `Qtd. ${item.quantity}`}</span><strong>{money(item.price * item.quantity)}</strong></button><button className="icon" aria-label={`Remover ${item.name}`} onClick={() => setRemoval({listId:activeList.id,itemId:item.id})}><Icon icon={IconTrash} size={16}/></button></div>{removal?.listId === activeList.id && removal?.itemId === item.id && <div className="remove-confirm" role="group" aria-label={`Confirmar remoção de ${item.name}`}><span>Remover item?</span><button autoFocus disabled={removing} onClick={() => setRemoval(null)}>Cancelar</button><button className="remove-confirm-action" disabled={removing} onClick={async () => { setRemoving(true); try { await post('remove', {list_id:activeList.id, offer_id:item.id}); setRemoval(null); await load(); } catch (e) { setMessage(e.message); } finally { setRemoving(false); } }}>Remover</button></div>}</div>)}</section>)}</div> : <div className="rounded-xl border border-[#f1dfd0] bg-white px-4 py-12 text-center text-sm text-[#987766]">Nenhum item nesta lista.</div>}
        <div className={`list-total-bar ${showTop ? 'has-top-button' : ''}`}><div><span>Total da lista</span><strong>{money(listTotal)}</strong></div></div>
      </> : <div className="rounded-xl border border-[#f1dfd0] bg-white px-4 py-12 text-center text-sm text-[#987766]">Nenhuma lista criada.</div>}
    </main>}
    {view === 'ofertas' && (query.trim() || category !== 'Todos' || store || irresistibleOnly || priceMin || priceMax) && <div className="filter-result" role="status">{query.trim() && searchResults === null && !priceError ? 'Buscando…' : `${groups.length.toLocaleString('pt-BR')} ${groups.length === 1 ? 'produto encontrado' : 'produtos encontrados'}`}</div>}
    {showTop && <button type="button" className={`scroll-top ${view === 'listas' && activeList ? 'in-list-footer' : ''}`} aria-label="Voltar ao topo" onClick={() => window.scrollTo({top:0, behavior:'instant'})}><Icon icon={IconArrowUp}/></button>}
    <Toast text={addedToast?.text} top/>
    {historyOffer && <HistoryDialog offer={historyOffer} store={data.stores[historyOffer.store]?.[0] || historyOffer.store} onClose={() => setHistoryOffer(null)}/>}
    {previewImage && <ImageLightbox image={previewImage} onClose={() => setPreviewImage(null)} />}
    {modal && <div className="modal" onMouseDown={e => { if (e.target === e.currentTarget) setModal(''); }}><div role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="modal-panel"><div className="mb-4 flex items-center justify-between"><h2 id="dialog-title" className="font-bold">{modal === 'login' ? 'Entrar' : modal === 'list' ? 'Nova lista' : modal === 'rename' ? 'Renomear lista' : modal === 'quantity' ? 'Editar quantidade' : 'Adicionar à lista'}</h2><button className="icon" onClick={() => setModal('')} aria-label="Fechar"><Icon icon={IconX} size={16}/></button></div>
      {modal === 'login' && <div className="login-prompt"><p>Entre para criar suas listas.</p><a href="/auth/google" onClick={startLogin} className="primary login-link">Entrar com Google</a></div>}
      {modal === 'list' && <form className="space-y-3" onSubmit={createList}><label>Nome<input name="name" required autoFocus placeholder="Ex.: Compra da semana" /></label><button className="primary w-full">Criar lista</button></form>}
      {modal === 'rename' && <form className="space-y-3" onSubmit={e => { e.preventDefault(); const name = new FormData(e.currentTarget).get('name'); action(async () => { await post('rename-list', {id:activeList.id, name}); setModal(''); }); }}><label>Nome<input name="name" defaultValue={activeList.name} maxLength="100" required autoFocus /></label><button className="primary w-full">Salvar</button></form>}
      {modal === 'quantity' && editingItem && <form className="space-y-3" onSubmit={e => { e.preventDefault(); const quantity = Number(new FormData(e.currentTarget).get('quantity')); action(async () => { await post('quantity', {list_id:activeList.id, offer_id:editingItem.id, quantity}); setModal(''); }); }}><p className="text-sm">{editingItem.name}</p><label>{editingItem.price_unit === 'kg' ? 'Quantidade (kg)' : 'Quantidade'}<input name="quantity" type="number" inputMode="numeric" min="1" max="999" step="1" defaultValue={editingItem.quantity} required autoFocus /></label><button className="primary w-full">Salvar</button></form>}
      {modal === 'choose' && <div className="space-y-2">{data.lists.map(list => <button key={list.id} className="choose" onClick={() => action(async () => { await post('item', { list_id: list.id, offer_id: selected.id, price_type: selected.priceType }); setModal(''); setSelected(null); setAddedToast({text:`Adicionado à lista ${list.name}`}); })}>{list.name} <span className="text-xs text-[#987766]">· {list.items.length} itens</span></button>)}<button className="primary w-full" onClick={() => setModal('list')}><Icon icon={IconPlus} size={12}/> Nova lista</button></div>}
    </div></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
