'use strict';
// Shared pure browser/server arithmetic; no storage, network or DOM.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AjouraAnalytics=api;})(globalThis,()=>{
const gasGrades=['Biokaasu','Maakaasu'];
const susMax={l:40,kWh:80,kg:30};
const unitOf=c=>c.fuel==='Sähkö'?'kWh':c.fuel==='Kaasu'?'kg':'l';
  const serviceKinds=['Huolto','Määräaikaishuolto','Vuosihuolto','Moottoriöljyn vaihto','Kausihuolto','Perämoottorin huolto'];
const isService=e=>serviceKinds.includes(e.type)||(e.type==='Muu huolto'&&(e.items||[]).includes('Moottoriöljy'));
  const addMonths=(value,months)=>{const [y,m,d]=value.split('-').map(Number);const t=new Date(Date.UTC(y,m-1+months,1));const last=new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth()+1,0)).getUTCDate();return `${t.getUTCFullYear()}-${String(t.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`;};

const newest=(a,b)=>b.date.localeCompare(a.date)||b.km-a.km;
// Legacy model-year approximation; never an official inspection deadline.
const inspMonths=(c,last)=>Number(last.date.slice(0,4))-Number(c.year)<8?24:12;
  function fuelStats(c,{hourlyValue=false}={}){const fk=hourlyValue?1:100,f=[...(c.fuels||[])].sort((a,b)=>a.km-b.km||a.date.localeCompare(b.date)),full=f.map((x,i)=>x.full?i:-1).filter(i=>i>=0);
    const sumQty=(a,b)=>f.slice(a+1,b+1).reduce((n,x)=>n+x.qty,0);let avg=null,lastCons=null;
    
    const priced=f.filter(x=>x.cost!==null),cost=priced.reduce((n,x)=>n+x.cost,0),qty=priced.reduce((n,x)=>n+x.qty,0);
    // 0.58: an interval that holds a fill-up marked "Älä huomioi kulutuksessa" (skip: e.g. someone else filled up in between
    // and the amount is unknown) is left out of consumption; its litres and costs still count everywhere else.
    // 0.77: an interval that cannot be real (over 40 l, 80 kWh or 30 kg per 100 km; e.g. 50 l over 10 km = 500 l/100 km)
    // comes from an odometer reading that does not match, typically the reading the fill-up sheet fills in left unchanged.
    // Its end reading is then left out: the interval is joined to the next one (litres and km added together, as if that
    // fill-up had been partial), which gives the right consumption when only that one reading is wrong. If the joined
    // interval is still impossible, or there is no next interval, the interval is left out like skip. Stored data is not
    // changed; the fill-up is marked "Tarkista mittarilukema" (sus) and the screens and the PDF say what was done.
    const lim=hourlyValue?Infinity:susMax[unitOf(c)]||Infinity,sus=[];let carry=null;
    // 0.95: readings that contradict the dates (a larger reading on an earlier day than a smaller one, e.g. 156 850 km on
    // 28.10. and 156 848 km on 1.11.) cannot both be right, and it is not known which one is wrong. Every interval that
    // touches such a fill-up is left out of consumption (not joined: a join would hide the error in a plausible number).
    // Stored data is not changed; the fill-ups are listed in ord and marked "Tarkista mittarilukema" like sus.
    const bad=new Set();{let mx='';f.forEach((x,i)=>{if(mx&&x.date<mx)bad.add(i);if(x.date>mx)mx=x.date;});let mn='9999';for(let i=f.length-1;i>=0;i--){if(f[i].date>mn)bad.add(i);if(f[i].date<mn)mn=f[i].date;}}
    const ord=[...bad].sort((a,b)=>a-b).map(i=>({id:f[i].id,date:f[i].date,km:f[i].km}));
    const series=[];let sq=0,sd=0;for(let k=1;k<full.length;k++){const p=full[k-1],b=full[k],d=f[b].km-f[p].km;
      if(!(d>0)||f.slice(p+1,b+1).some(x=>x.skip)||(bad.size&&[...bad].some(i=>i>=p&&i<=b))){if(carry){sus.push({...carry.s,how:'drop'});carry=null;}continue;}
      let q=sumQty(p,b),dd=d;const one={id:f[b].id,date:f[b].date,v:q/d*fk};
      if(carry){const jv=(q+carry.q)/(dd+carry.d)*fk;if(jv<=lim){q+=carry.q;dd+=carry.d;sus.push({...carry.s,how:'join'});}else sus.push({...carry.s,how:'drop'});carry=null;}
      if(q/dd*fk>lim){carry={q,d:dd,s:one};continue;}
      sq+=q;sd+=dd;series.push({date:f[b].date,km:f[b].km,v:q/dd*fk,q,d:dd,id:f[b].id});}
    if(carry)sus.push({...carry.s,how:'drop'});if(sd>0){avg=sq/sd*fk;lastCons=series[series.length-1].v;}
    return {fills:f,avg,lastCons,cost,price:qty>0?cost/qty:null,per100:avg!==null&&qty>0?avg*cost/qty:null,series,sus,ord};}
  const fillKind=(c,f)=>c.fuel==='Sähkö'||f.el===true?'el':gasGrades.includes(f.grade)||(!f.grade&&c.fuel==='Kaasu')?'gas':'fuel';
  const chargeKinds=c=>{const k=c.fuel==='Sähkö'?['el']:c.fuel==='Kaasu'?['gas','fuel']:['Bensiini','Diesel'].includes(c.fuel)?['fuel']:['fuel','el'];for(const f of c.fuels||[]){const x=fillKind(c,f);if(!k.includes(x))k.push(x);}return k;};
  const fcar=(c,k)=>{const all=c.fuels||[],fl=all.filter(f=>fillKind(c,f)===k),fu=k==='el'?'Sähkö':k==='gas'?'Kaasu':c.fuel==='Kaasu'||c.fuel==='Sähkö'?'Bensiini':c.fuel;return fl.length===all.length&&fu===c.fuel?c:{...c,fuels:fl,fuel:fu};};
  function dueDates(c,profile,{hourlyValue=false,isCarValue=true}={}){const ev=[...c.events].sort(newest),svc=ev.find(isService),insp=ev.find(e=>e.type==='Katsastus'),out=[];
    if(svc)out.push({what:'Huolto',from:svc.date,due:addMonths(svc.date,profile.months),km:svc.km===null||hourlyValue?null:svc.km+profile.km});if(insp&&isCarValue)out.push({what:'Katsastus',from:insp.date,due:addMonths(insp.date,inspMonths(c,insp)),km:null});return out;}

const fuelParts=(c,options)=>chargeKinds(c).map(k=>{const v=fcar(c,k);return {k,v,s:fuelStats(v,options),u:unitOf(v)};}).filter(x=>x.s.fills.length);
return Object.freeze({version:'analytics-1',fuelStats,fillKind,chargeKinds,fcar,fuelParts,dueDates,unitOf,isService,addMonths,inspMonths});
});
