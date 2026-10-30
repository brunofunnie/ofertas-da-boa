const clock = new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function nextRefreshDelay(date = new Date()) {
  const parts=Object.fromEntries(clock.formatToParts(date).map(part=>[part.type,part.value]));
  return ((4-Number(parts.hour)%4)*3600-Number(parts.minute)*60-Number(parts.second))*1000-date.getMilliseconds();
}
export function startRefreshScheduler(providers,refresh,{now=()=>new Date(),setTimer=setTimeout,clearTimer=clearTimeout,log=entry=>console.log(JSON.stringify(entry))}={}) {
  let timer, running=false, stopped=false;
  function schedule() {
    if (stopped) return;
    const current=now(), delay=nextRefreshDelay(current);
    log({type:'scheduled-refresh',state:'scheduled',next_at:new Date(current.getTime()+delay).toISOString()});
    timer=setTimer(async()=>{
      schedule();
      if (running) {log({type:'scheduled-refresh',state:'skipped'});return;}
      running=true;
      try {
        for (const provider of providers) {
          if (stopped) break;
          try {const result=await refresh(provider);log({type:'scheduled-refresh',store:provider.id || provider,state:result?.state || 'ok'});}
          catch {log({type:'scheduled-refresh',store:provider.id || provider,state:'error'});}
        }
      } finally {running=false;}
    },delay);
    timer?.unref?.();
  }
  schedule();
  return ()=>{stopped=true;clearTimer(timer);};
}
