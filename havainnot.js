'use strict';
// Pure read-only observations; consumption comes from app.js fuelStats, never recalculated here.
(() => {
  const day=d=>Date.parse(d+'T12:00:00Z')/864e5;
  function forecast(c,dates,today){
    if(c.kind&&c.kind!=='car')return {};
    const pts=[...(c.fuels||[]),...(c.events||[])].filter(x=>Number.isSafeInteger(x.km)&&x.km>=0&&day(x.date)<=day(today)&&day(x.date)>=day(today)-180).sort((a,b)=>a.date.localeCompare(b.date)||a.km-b.km);
    if(pts.length<4)return {};
    const unique=new Set(pts.map(p=>p.date));if(unique.size<4)return {};
    for(let i=1;i<pts.length;i++)if((pts[i].date!==pts[i-1].date&&(pts[i].km-pts[i-1].km)/(day(pts[i].date)-day(pts[i-1].date))>500)||pts[i].km<pts[i-1].km||(pts[i].date===pts[i-1].date&&pts[i].km!==pts[i-1].km))return {};
    const a=pts[0],b=pts[pts.length-1],span=day(b.date)-day(a.date),age=day(today)-day(b.date),rate=(b.km-a.km)/span;
    if(span<30||age>45||rate<5||rate>500)return {};
    const out={};for(const d of dates){const left=d.km-c.km;if(d.what!=='Huolto'||d.km===null||left<=0)continue;
      const days=left/rate;if(days>180)continue;
      const stamp=n=>new Date((day(today)+Math.ceil(n))*864e5).toISOString().slice(0,10);
      out[d.from]={from:stamp(days/1.25),to:stamp(days/.75)};
    }return out;
  }
  function analyze(c,dates,parts,today){
    const tasks=[];
    if(!c.kind||c.kind==='car')for(const part of parts){
      const s=part.s,series=s.series;
      if(s.sus.length||s.ord.length||s.fills.some(f=>f.skip)||new Set(s.fills.map(f=>f.km)).size!==s.fills.length||series.length<4)continue;
      const recent=series.slice(-4),base=recent.slice(0,3),last=recent[3];
      if(recent.some(x=>x.d<100||!Number.isFinite(x.v)||x.v<=0)||day(today)-day(last.date)>45||day(last.date)>day(today))continue;
      const distance=base.reduce((n,x)=>n+x.d,0);if(distance<600)continue;
      const avg=base.reduce((n,x)=>n+x.v*x.d,0)/distance,delta=last.v-avg,minimum=part.u==='kWh'?3:part.u==='kg'?.5:1;
      if(last.v<avg*1.2||delta<minimum)continue;
      tasks.push({key:`${c.id}:consumption:${part.k}:${last.id}`,car:c.id,kind:'consumption',state:'open',title:'Kulutus kasvoi vertailujaksoon nähden',href:`#fuel/${c.id}`,priority:3,comparison:{baseline:avg,current:last.v,unit:part.u}});
    }
    return {tasks,forecasts:parts.some(p=>p.s.sus.length||p.s.ord.length)?{}:forecast(c,dates,today)};
  }
  window.AjouraInsights=Object.freeze({analyze});
})();
