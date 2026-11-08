'use strict';
// Observations only. Garage data and backups remain owned by app.js.
(() => {
  const key='ajoura-tehtavat-v1', records=new Map();
  let choices={};
  try { const v=JSON.parse(localStorage.getItem(key)||'{}'); if(v&&typeof v==='object'&&!Array.isArray(v))choices=v; } catch(e){}
  const save=()=>{try{localStorage.setItem(key,JSON.stringify(choices));}catch(e){}};
  const validKm=v=>Number.isSafeInteger(v)&&v>=0;
  function observe(c,dates,today,insights={tasks:[],forecasts:{}}){
    const now=Date.parse(today+'T12:00:00Z'),out=[];
    for(const f of c.fuels||[])if(!validKm(f.km))out.push({key:`${c.id}:fuel:${f.id}`,car:c.id,kind:'fuel',source:f.id,state:'open',title:'Täydennä tankkauksen mittarilukema',href:`#fuel/${c.id}`,priority:0});
    for(const d of dates){
      const days=(Date.parse(d.due+'T12:00:00Z')-now)/864e5;
      const near=days<=31||(d.km!==null&&d.km-c.km<=Math.max(0,d.intervalKm*.15));
      if(!near)continue;
      out.push({key:`${c.id}:${d.what}:${d.from}:${d.due}:${d.km}`,car:c.id,kind:d.what,from:d.from,state:'open',title:d.what==='Katsastus'?'Tarkista tuleva katsastus':'Tarkista tuleva huolto',href:d.what==='Huolto'?`#add/${c.id}`:`#vehicle/${c.id}`,priority:days<0||(d.km!==null&&c.km>=d.km)?1:2});
    }
    for(const x of out)if(x.kind==='Huolto')x.forecast=insights.forecasts[x.from];
    out.push(...insights.tasks);
    const active=new Set(out.map(x=>x.key));
    for(const old of records.values())if(old.car===c.id&&old.kind!=='ai'&&!active.has(old.key)&&!['done','expired'].includes(old.state)){
      const fixed=old.kind==='fuel'?(c.fuels||[]).some(f=>f.id===old.source&&validKm(f.km)):
        dates.some(d=>d.what===old.kind&&d.from>old.from);
      old.state=fixed?'done':'expired';
      if(fixed)window.AjouraAvatar?.react('success');
    }
    for(const x of out){
      const choice=choices[x.key];
      if(choice==='dismissed')x.state='dismissed';
      else if(typeof choice==='number'&&choice>Date.now())x.later=true;
      records.set(x.key,x);
    }
    // Cap transient history and device choices without altering vehicle data.
    while(records.size>200)records.delete(records.keys().next().value);
    const entries=Object.entries(choices);if(entries.length>200){choices=Object.fromEntries(entries.slice(-200));save();}
    return out.filter(x=>x.state==='open'&&!x.later).sort((a,b)=>a.priority-b.priority||a.key.localeCompare(b.key)).slice(0,3);
  }
  function decide(id,action){if(!records.has(id))return;choices[id]=action==='later'?Date.now()+864e5:'dismissed';if(action==='dismiss')records.get(id).state='dismissed';save();}
  function reset(car){for(const id of Object.keys(choices))if(id.startsWith(car+':'))delete choices[id];save();}
  function ai(car,state){const id=`${car}:ai:current`,old=records.get(id);if(!old&&state==='expired')return;records.set(id,{key:id,car,kind:'ai',state});}
  window.AjouraTasks=Object.freeze({observe,decide,reset,ai,snapshot:()=>[...records.values()].map(x=>({...x})),coverage:c=>{const f=[...(c.fuels||[])].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)).slice(0,5);return {total:f.length,complete:f.filter(x=>validKm(x.km)).length};}});
})();
