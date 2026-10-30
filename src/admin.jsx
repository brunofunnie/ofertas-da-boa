import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {IconBuildingStore, IconClipboardCheck, IconRobot, IconAdjustments, IconLogout, IconExternalLink, IconShieldLock} from '@tabler/icons-react';
import {OfferSettingsPanel, ReviewPanel, AiSettingsPanel, StoresPanel, Toast, post} from './admin-panels.jsx';
import './style.css';
import './admin.css';

const tabs = [
  {id:'stores',label:'Supermercados',short:'Mercados',icon:IconBuildingStore},
  {id:'review',label:'Revisão',icon:IconClipboardCheck},
  {id:'ai',label:'IA',icon:IconRobot},
  {id:'offers',label:'Ofertas',icon:IconAdjustments},
];

function AdminApp() {
  const [data,setData] = useState(null), [status,setStatus] = useState('loading'), [tab,setTab] = useState('stores');
  const [busy,setBusy] = useState(false), [refreshing,setRefreshing] = useState({}), [toast,setToast] = useState('');
  const [loginError] = useState(() => new URLSearchParams(location.search).get('login') === 'erro');
  async function load() {
    const response = await fetch('/api/admin/data', {cache:'no-store'});
    if (response.status === 401 || response.status === 403) {setData(null);setStatus('login');return;}
    if (!response.ok) throw Error('Não foi possível carregar a administração.');
    setData(await response.json());setStatus('ready');
  }
  useEffect(() => {load().catch(()=>setStatus('error'));const timer=setInterval(()=>{if(!document.hidden)load().catch(()=>{});},30000);return()=>clearInterval(timer);},[]);
  useEffect(() => {if(!busy && !Object.values(refreshing).some(Boolean))return;const timer=setInterval(()=>load().catch(()=>{}),2000);return()=>clearInterval(timer);},[busy,refreshing]);
  useEffect(() => {if(!toast)return;const timer=setTimeout(()=>setToast(''),6000);return()=>clearTimeout(timer);},[toast]);
  async function logout() {try {await post('admin/logout');setData(null);setStatus('login');}catch(error){setToast(error.message);}}
  async function refresh() {
    setBusy(true);try {const result=await post('refresh');await load();const failed=Object.values(result).filter(value=>value.startsWith('Não atualizado:') || value.startsWith('Atualização parcial:')).length;setToast(failed ? `Atualização concluída · ${failed} com falha` : 'Supermercados atualizados');}
    catch(error){setToast(`Falha na atualização: ${error.message}`);}finally{setBusy(false);}
  }
  async function refreshStore(id) {
    setRefreshing(current=>({...current,[id]:true}));
    try {const result=await post('refresh-store',{store:id});await load();const name=data.stores[id]?.[0] || id;setToast(result.state === 'ok' ? `${name} atualizado · ${result.new_count} novos, ${result.changed_count} alterados` : result.status?.startsWith('Atualização parcial:') ? `${name}: atualização parcial` : `${name}: falha na atualização`);}
    catch(error){setToast(`Falha na atualização: ${error.message}`);}finally{setRefreshing(current=>({...current,[id]:false}));}
  }
  if (status !== 'ready') return <main className="backoffice-login"><div className="backoffice-login-card"><img src="/logo.svg" alt="" width="48" height="48"/><h1>Administração</h1>{status === 'loading' ? <p>Carregando…</p> : status === 'error' ? <><p>Não foi possível carregar a administração.</p><button className="primary" onClick={()=>{setStatus('loading');load().catch(()=>setStatus('error'));}}>Tentar novamente</button></> : <>{loginError && <p role="alert">Não foi possível entrar. Verifique a conta e tente novamente.</p>}<a className="primary backoffice-login-link" href="/auth/google/admin"><IconShieldLock size={18} aria-hidden="true"/> Entrar com Google</a></>}<a className="backoffice-return" href="/">Voltar às ofertas</a></div></main>;
  const current=tabs.find(item=>item.id===tab);
  return <div className="backoffice"><header className="backoffice-header"><a className="backoffice-brand" href="/admin/"><img src="/logo.svg" alt="" width="36" height="36"/><span>Ofertas da Boa <small>Administração</small></span></a><div className="backoffice-header-actions"><a href="/" title="Ver site" aria-label="Ver site"><IconExternalLink size={20} aria-hidden="true"/></a><button type="button" onClick={logout} aria-label="Sair da administração" title="Sair"><IconLogout size={20} aria-hidden="true"/></button></div></header><div className="backoffice-body"><nav className="backoffice-nav" aria-label="Administração">{tabs.map(({id,label,short,icon:TabIcon})=><button key={id} type="button" className={tab===id?'active':''} aria-current={tab===id?'page':undefined} onClick={()=>setTab(id)}><TabIcon size={18} aria-hidden="true"/><span>{short || label}</span>{id==='review' && !!data.pending_offers?.length && <b>{data.pending_offers.length}</b>}</button>)}</nav><main className="backoffice-main"><div className="backoffice-heading"><div><span>Administração</span><h1>{current.label}</h1></div>{tab==='stores' && <div className="backoffice-count">{data.total_products.toLocaleString('pt-BR')} produtos</div>}</div><div className="backoffice-content">{tab==='stores' && <StoresPanel data={data} refreshing={refreshing} onRefresh={refreshStore} onRefreshAll={refresh} busy={busy} onCookiesSaved={()=>setToast('Cookies salvos')}/>}{tab==='review' && <ReviewPanel offers={data.pending_offers || []} currentOffers={data.offers} stores={data.stores} onReview={async(id,decision)=>{await post('review-offer',{id,decision});await load();}}/>}{tab==='ai' && <AiSettingsPanel onSaved={()=>setToast('Configuração de IA salva')}/>}{tab==='offers' && <OfferSettingsPanel percent={data.irresistible_percent ?? 20} onSaved={async()=>{await load();setToast('Configuração salva');}}/>}</div></main></div><Toast text={toast}/></div>;
}

createRoot(document.getElementById('root')).render(<AdminApp/>);
