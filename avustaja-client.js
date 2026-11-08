'use strict';
// Local prototype UI. No service URL or live provider; never rendered on the public origin.
(() => {
  const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  const transport=local&&window.AjouraAssistantFixtureTransport;
  if(!transport||typeof transport.request!=='function'||typeof transport.ready!=='function')return;
  const ready=car=>transport.ready(car)&&(transport.fixture===true||window.AjouraSync?.analysisReady?.());
  const key='ajoura-avustaja-local',t=s=>window.AjouraI18n?.t(s)||s;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let epoch=0,current='',busy=false;
  const enabled=()=>{try{return localStorage.getItem(key)==='1';}catch(e){return false;}};
  async function localDigest(car){const state=window.AjouraApp.state(),c=state.cars.find(x=>x.id===car);const text=window.AjouraAssistantContract.canonical(window.AjouraAssistantContract.project(c,state.profile));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
  function invalidate(){epoch++;busy=false;document.querySelector('.assistant-local-result')?.replaceChildren();}
  document.addEventListener('ajoura-session',invalidate);
  document.addEventListener('ajoura-lang',invalidate);
  window.addEventListener('hashchange',invalidate);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)invalidate();});
  document.addEventListener('change',e=>{if(e.target.matches('[data-assistant-opt]')){try{localStorage.setItem(key,e.target.checked?'1':'0');}catch(e){}invalidate();window.AjouraApp.refresh();}});
  document.addEventListener('click',async e=>{
    if(e.target.closest('[data-secretary-car]'))invalidate();
    if(!e.target.closest('[data-assistant-send]')||busy||!enabled())return;
    const box=e.target.closest('.assistant-local'),car=box?.dataset.assistantCar,input=box?.querySelector('input[type=text]'),result=box?.querySelector('.assistant-local-result');
    if(!box||!input.value.trim())return;
    if(!ready(car)){result.textContent=t('Synkronoi ajoneuvon tiedot ensin.');return;}
    const turn=++epoch,lang=document.documentElement.lang||'fi';busy=true;
    result.textContent=t('Muodostetaan vastausta…');
    const valid=()=>turn===epoch&&current===car&&box.isConnected&&enabled()&&ready(car);
    try{
      const p=await transport.request({action:'prepare',vehicleId:car,lang});if(!valid())return;
      if(p.status!==200)throw new Error('prepare');
      if(await localDigest(car)!==p.body.localDigest||!valid()){if(valid())result.textContent=t('Synkronoi ajoneuvon tiedot ensin.');return;}
      const r=await transport.request({action:'answer',vehicleId:car,lang,optIn:true,question:input.value.trim(),snapshotToken:p.body.snapshotToken,idempotencyKey:crypto.randomUUID()});if(!valid())return;
      if(await localDigest(car)!==p.body.localDigest||!valid()){if(valid())result.textContent=t('Synkronoi ajoneuvon tiedot ensin.');return;}
      if(r.status!==200||r.body.vehicleId!==car||typeof r.body.text!=='string')throw new Error('answer');
      result.textContent=r.body.text;
    }catch(error){if(valid())result.textContent=t('Vastausta ei saatu. Tarkista yhteys ja käyttöoikeus.');}
    finally{if(turn===epoch)busy=false;}
  });
  window.AjouraAssistant=Object.freeze({card(c){if(current!==c.id){invalidate();current=c.id;}return `<section class="secretary-task assistant-local" data-assistant-car="${esc(c.id)}"><h3>${esc(t('Ajoneuvoavustajan paikallinen kokeilu'))}</h3><label class="avatar-motion"><input type="checkbox" data-assistant-opt${enabled()?' checked':''}>${esc(t('Ota ajoneuvoavustaja käyttöön'))}</label>${enabled()?`<label>${esc(t('Kysymys valitusta ajoneuvosta'))}<input type="text" maxlength="500" aria-label="${esc(t('Kysymys valitusta ajoneuvosta'))}"></label><button type="button" data-assistant-send>${esc(t('Kysy avustajalta'))}</button>`:''}<p class="assistant-local-result" role="status"></p></section>`;}});
})();
