import React, { useEffect, useRef, useState } from 'react';
import { IconRefresh, IconX, IconExternalLink, IconChevronUp, IconChevronDown } from '@tabler/icons-react';
const money = value => (value / 100).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
export async function post(path, data = {}) {
  const response = await fetch(`/api/${path}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
  const result = await response.json();
  if (!response.ok) throw Error(result.error);
  return result;
}
function Icon({ icon: Component, size = 18, className }) { return <Component aria-hidden="true" className={className} size={size} stroke={1.8}/>; }
function OfferSettingsPanel({ percent, onSaved }) {
  const [value, setValue] = useState(String(percent)), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await post('offer-settings', { irresistible_percent: Number(value) }); await onSaved(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <form className="admin-form ai-panel" onSubmit={save}>
    <label htmlFor="irresistible-percent">Desconto mínimo para ofertas irresistíveis (%)</label><input id="irresistible-percent" type="number" min="1" max="100" step="1" value={value} onChange={event => setValue(event.target.value)} required /><button className="primary" type="submit" disabled={busy}>Salvar</button>{error && <p className="store-error" role="alert">{error}</p>}
  </form>;
}

function RefreshIcon({ spinning }) { return <Icon icon={IconRefresh} className={spinning ? 'refresh-spin' : undefined}/>; }

function Toast({ text, top = false }) { return text ? <div className={`store-toast${top ? ' store-toast-top' : ''}`} role="status">{text}</div> : null; }

function StoreSourceList({ sources, formatDate }) {
  if (sources.length < 2) return null;
  const labels = {ok:'Atualizado',error:'Falhou',running:'Atualizando',unknown:'Sem atualização',unconfigured:'Não configurado'};
  return <div className="store-source-list" aria-label="Fontes de dados">{sources.map(source => <div className="store-source" key={source.source}><span className={`status-dot status-${source.state}`} aria-hidden="true"/><span className="store-source-content"><strong>{source.name}</strong><small>{labels[source.state] || 'Sem atualização'}{source.state === 'ok' && source.total != null ? ` · ${source.total} produtos` : ''}{source.updated && source.state !== 'running' ? ` · ${formatDate(source.updated)}` : ''}</small>{source.state === 'error' && source.status && <small className="store-error">{source.status}</small>}</span></div>)}</div>;
}
function AiSettingsPanel({onSaved}) {
  const [config,setConfig]=useState(null), [provider,setProvider]=useState('gemini'), [baseUrl,setBaseUrl]=useState('https://api.openai.com/v1'), [model,setModel]=useState(''), [key,setKey]=useState(''), [models,setModels]=useState([]), [error,setError]=useState(''), [busy,setBusy]=useState(false);
  useEffect(() => { fetch('/api/ai-config').then(r => {if(!r.ok) throw Error('Não foi possível carregar a configuração.');return r.json();}).then(data => {setConfig(data);setProvider(data.provider);setBaseUrl(data.openai.base_url);setModel(data[data.provider].model);}).catch(e => setError(e.message)); }, []);
  function selectProvider(value) {setProvider(value);setModel(config?.[value]?.model || '');setKey('');setModels([]);setError('');}
  const data = () => ({provider,base_url:baseUrl,model,api_key:key});
  async function fetchModels() {setBusy(true);setError('');try {const result=await post('ai-models',data());setModels(result.models);if(!result.models.length)setError('Nenhum modelo disponível.');}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function save(e) {e.preventDefault();setBusy(true);setError('');try {const result=await post('ai-config',data());setConfig(result);setKey('');onSaved();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <form className="admin-form ai-panel" onSubmit={save}><label htmlFor="ai-provider">Provedor</label><select id="ai-provider" value={provider} onChange={e=>selectProvider(e.target.value)} disabled={!config || busy}><option value="gemini">Gemini</option><option value="openai">OpenAI compatível</option></select>{provider==='openai' && <><label htmlFor="ai-url">URL da API</label><input id="ai-url" type="url" value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" required /></>}<label htmlFor="ai-key">Chave da API</label><input id="ai-key" type="password" autoComplete="new-password" value={key} onChange={e=>setKey(e.target.value)} placeholder={config?.[provider]?.has_key ? 'Chave configurada' : 'Opcional se o provedor não exigir'} /><label htmlFor="ai-model">Modelo</label><div className="ai-model-row"><input id="ai-model" list="ai-models" value={model} onChange={e=>setModel(e.target.value)} placeholder="Digite ou escolha" required /><button type="button" className="cookies-open" disabled={busy || !config} onClick={fetchModels}>Listar</button></div><datalist id="ai-models">{models.map(item=><option key={item} value={item}/>)}</datalist>{error && <p className="store-error" role="alert">{error}</p>}<button className="primary w-full" disabled={busy || !config}>{busy ? 'Aguarde…' : 'Salvar'}</button></form>;
}
function InstagramCookiesDialog({ onClose, onSaved }) {
  const dialog = useRef(null), [value, setValue] = useState(''), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  useEffect(() => { dialog.current.showModal(); }, []);
  async function save(e) {
    e.preventDefault(); setSaving(true); setError('');
    try { await post('instagram-cookies', {cookies:value}); onSaved(); dialog.current.close(); }
    catch (e) { setError(e.message); } finally { setSaving(false); }
  }
  return <dialog ref={dialog} className="cookies-dialog" aria-labelledby="cookies-title" onClose={e => { e.stopPropagation(); onClose(); }} onClick={e => { if (e.target === dialog.current && !saving) dialog.current.close(); }}><form className="cookies-panel" onSubmit={save}><div className="stores-heading"><h2 id="cookies-title">Cookies do Instagram</h2><button type="button" className="icon" aria-label="Fechar" disabled={saving} onClick={() => dialog.current.close()}><Icon icon={IconX} size={16}/></button></div><label htmlFor="instagram-cookies">Novo JSON de cookies</label><textarea id="instagram-cookies" value={value} onChange={e => setValue(e.target.value)} placeholder="Cole o JSON aqui" spellCheck="false" autoCapitalize="off" autoComplete="off" required autoFocus/><p className="cookies-hint">Cole o JSON completo para substituir a sessão atual.</p>{error && <p className="store-error" role="alert">{error}</p>}<button className="primary w-full" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button></form></dialog>;
}
function StoresPanel({ data, refreshing, onRefresh, onRefreshAll, busy, onCookiesSaved }) {
  const [expanded, setExpanded] = useState(null), [editingCookies, setEditingCookies] = useState(false);
  const formatDate = value => value ? new Date(value.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Ainda não atualizada';
  return <><div className="admin-store-actions"><button type="button" className="cookies-open" onClick={onRefreshAll} disabled={busy || Object.values(refreshing).some(Boolean)}><RefreshIcon spinning={busy}/> Atualizar todos</button></div><div className="stores-list">{Object.entries(data.stores).map(([id, value]) => {
    const source = data.sources.find(s => s.store === id), state = refreshing[id] || source?.state === 'running' ? 'running' : source?.state || 'unknown';
    const stateLabel = {ok:'Atualizado',error:'Falhou',running:'Atualizando',unknown:'Sem atualização'}[state] || 'Sem atualização';
    return <section className="store-entry" key={id}><div className="store-entry-row"><button type="button" className="store-info" aria-expanded={expanded === id} onClick={() => setExpanded(expanded === id ? null : id)}><span className={`status-dot status-${state}`} aria-hidden="true"/><span className="store-info-text"><strong>{value[0]}</strong><small>{stateLabel} · {formatDate(source?.last_success)}</small></span><span className="store-chevron" aria-hidden="true"><Icon icon={expanded === id ? IconChevronUp : IconChevronDown} size={12}/></span></button><a className="store-link" href={value[1]} target="_blank" rel="noopener noreferrer" aria-label={`Abrir site de ${value[0]} em nova aba`} title={`Abrir site de ${value[0]}`}><Icon icon={IconExternalLink} size={16}/></a>{data.user?.admin && <button type="button" className="store-refresh" disabled={state === 'running'} onClick={() => onRefresh(id)} aria-label={`Atualizar ${value[0]}`} title={`Atualizar ${value[0]}`}><RefreshIcon spinning={state === 'running'}/></button>}</div>{expanded === id && <div className="store-detail">{source?.total != null ? <><div className="store-metrics"><span><strong>{source.total}</strong> consultados</span><span><strong>{source.new_count}</strong> novos</span><span><strong>{source.changed_count}</strong> alterados</span></div>{source?.state === 'error' && !source?.status?.startsWith('Atualização parcial:') && <small>Contagens da última atualização concluída.</small>}</> : <span>Sem contagens disponíveis.</span>}{source?.state === 'error' && <p className="store-error">{source.status}</p>}<StoreSourceList sources={(data.store_sources || []).filter(item => item.store === id)} formatDate={formatDate}/>{data.user?.admin && (id === 'santo-clube' || id === 'doma') && <button type="button" className="cookies-open" onClick={() => setEditingCookies(true)}>Cookies do Instagram</button>}</div>}</section>;
  })}</div>{editingCookies && <InstagramCookiesDialog onClose={() => setEditingCookies(false)} onSaved={onCookiesSaved}/>}</>;
}

export { OfferSettingsPanel, AiSettingsPanel, StoresPanel, Toast };
