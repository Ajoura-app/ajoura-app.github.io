// Local, dependency-injected prototype. No listener, live provider, Supabase adapter or deploy entrypoint.
import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
import Analytics from '../analytiikka.js';
const CAP='ai.assistant', COST=656000;
const fail=(status,code)=>{throw Object.assign(new Error(code),{status,code});};
import Contract from '../avustaja-sopimus.js';
const {project,canonical,id,pick}=Contract;
export {project};
const labels={fi:{service:'Seuraava huolto',consumption:'Keskikulutus',costs:'Kirjatut kulut',missing:'Tietoja ei ole riittävästi.'},en:{service:'Next service',consumption:'Average consumption',costs:'Recorded costs',missing:'Not enough records.'},sv:{service:'Nästa service',consumption:'Medelförbrukning',costs:'Registrerade kostnader',missing:'Uppgifterna räcker inte.'}};
export function summary(context,intent,today){
  const {car,profile}=context;
  if(intent==='service')return {intent,dates:Analytics.dueDates(car,profile).filter(x=>x.what==='Huolto').map(x=>pick(x,['due','km']))};
  if(intent==='consumption')return {intent,energy:Analytics.fuelParts(car).map(p=>({kind:p.k,unit:p.u,average:p.s.avg,quality:{sus:p.s.sus.length,ord:p.s.ord.length},intervals:p.s.series.slice(-12).map(x=>pick(x,['date','v','d']))}))};
  if(intent==='costs'){
    const end=Date.parse(today+'T00:00:00Z'),start=end-89*864e5;
    const inside=x=>Date.parse(x.date+'T00:00:00Z')>=start&&Date.parse(x.date+'T00:00:00Z')<=end;
    const value=car.events.filter(inside).reduce((n,x)=>n+Number(x.cost||0),0)+car.fuels.filter(inside).reduce((n,x)=>n+(x.cost||0),0);
    return {intent,from:new Date(start).toISOString().slice(0,10),to:today,eur:Math.round(value*100)/100};
  }fail(422,'unsupported');
}
export function render(result,lang){
  const l=labels[lang];if(!['fi','en','sv'].includes(lang))fail(422,'language');
  if(result.intent==='service')return l.service+': '+(result.dates.length?result.dates.map(x=>x.due+(x.km===null?'':' / '+x.km+' km')).join('; '):l.missing);
  if(result.intent==='consumption')return l.consumption+': '+(result.energy.length?result.energy.map(x=>x.average===null?l.missing:x.average.toFixed(1)+' '+x.unit+'/100 km').join('; '):l.missing);
  return l.costs+': '+result.eur.toFixed(2)+' EUR ('+result.from+' – '+result.to+')';
}
// Atomic only within a single Node process. NOT a production database/replicated ledger.
export class MemoryLedger{
  constructor({limit=20,budget=10000000000,dailyLimit=5,minuteLimit=3}={}){if([limit,budget,dailyLimit,minuteLimit].some(x=>!Number.isSafeInteger(x)||x<0))throw new Error('Invalid limits');this.limit=limit;this.budget=budget;this.dailyLimit=dailyLimit;this.minuteLimit=minuteLimit;this.rows=new Map();this.usage=new Map();this.spent=new Map();this.rate=new Map();}
  reserve(user,key,hash,now){
    const period=new Date(now).toISOString().slice(0,7),id=canonical([user,CAP,key]),existing=this.rows.get(id);
    if(existing){if(existing.hash!==hash)fail(409,'key_conflict');return {row:existing,fresh:false};}
    const dayKey=canonical([user,'day',new Date(now).toISOString().slice(0,10)]),minuteKey=canonical([user,'minute',Math.floor(now/60000)]);
    if((this.rate.get(dayKey)||0)>=this.dailyLimit||(this.rate.get(minuteKey)||0)>=this.minuteLimit)fail(429,'rate');
    const bucket=canonical([user,CAP,period]),used=this.usage.get(bucket)||0,total=this.spent.get(period)||0;
    if(used>=this.limit)fail(429,'quota');if(total+COST>this.budget)fail(429,'budget');
    this.rate.set(dayKey,(this.rate.get(dayKey)||0)+1);this.rate.set(minuteKey,(this.rate.get(minuteKey)||0)+1);
    const row={hash,period,bucket,state:'reserved',cost:COST,answer:null,until:0};this.rows.set(id,row);this.usage.set(bucket,used+1);this.spent.set(period,total+COST);return {row,fresh:true};
  }
  complete(row,answer,now){row.state='completed';row.answer=structuredClone(answer);row.until=now+300000;const timer=setTimeout(()=>{row.answer=null;},300000);timer.unref?.();}
  reject(row){if(row.state==='reserved'){row.state='failed';this.spent.set(row.period,this.spent.get(row.period)-row.cost);}else row.state='unknown';if(!row.refunded){this.usage.set(row.bucket,this.usage.get(row.bucket)-1);row.refunded=true;}row.answer=null;}
  purge(now){for(const row of this.rows.values())if(row.until&&row.until<=now)row.answer=null;}
}
export function createAssistant({enabled=false,secret,authenticate,readVehicle,entitled,provider,ledger=new MemoryLedger(),now=Date.now,deadlineMs=5000}={}){
  if(!enabled)return async()=>new Response(JSON.stringify({error:'disabled'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(typeof secret!=='string'||secret.length<32||![authenticate,readVehicle,entitled,provider?.classify,provider?.explain].every(x=>typeof x==='function'))throw new Error('Missing local dependencies');
  const mac=text=>createHmac('sha256',secret).update(text).digest('base64url');
  const snapshot=(u,owner,vehicle,digest,expires)=>{const body=Buffer.from(JSON.stringify({u,owner,vehicle,digest,expires,version:Analytics.version})).toString('base64url');return body+'.'+mac(body);};
  function verify(token){try{const [body,sig,...rest]=token.split('.');const expected=mac(body),b=Buffer.from(sig||'');if(rest.length||b.length!==expected.length||!timingSafeEqual(b,Buffer.from(expected)))fail(409,'snapshot');const s=JSON.parse(Buffer.from(body,'base64url'));if(s.expires<=now()||s.version!==Analytics.version)fail(409,'snapshot');return s;}catch(e){fail(409,'snapshot');}}
  async function context(user,vehicle){if(!await entitled(user,CAP))fail(403,'access');const v=await readVehicle(user,vehicle);if(!v||typeof v.owner!=='string')fail(403,'access');const data=project(v.car,v.profile);if(data.car.id!==vehicle)fail(403,'access');return {data,owner:v.owner,digest:mac(canonical(data)),localDigest:createHash('sha256').update(canonical(data)).digest('hex')};}
  const bounded=async fn=>{let timer;try{return await Promise.race([fn(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),deadlineMs);})]);}finally{clearTimeout(timer);}};
  return async req=>{
    let row;
    try{
      ledger.purge(now());
      if(req.method!=='POST')fail(405,'method');
      if(!req.headers.get('content-type')?.startsWith('application/json'))fail(415,'type');
      const auth=req.headers.get('authorization')||'',user=await authenticate(auth);if(typeof user!=='string'||!user)fail(401,'auth');
      const reader=req.body?.getReader();let size=0,chunks=[];if(!reader)fail(400,'body');
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();fail(413,'size');}chunks.push(value);}
      let b;try{b=JSON.parse(Buffer.concat(chunks));}catch(e){fail(400,'body');}
      if(!b||typeof b!=='object'||!id(b.vehicleId)||!['fi','en','sv'].includes(b.lang)||!['prepare','answer'].includes(b.action))fail(400,'body');
      const ctx=await context(user,b.vehicleId);
      if(b.action==='prepare')return reply(200,{snapshotToken:snapshot(user,ctx.owner,b.vehicleId,ctx.digest,now()+120000),version:Analytics.version,localDigest:ctx.localDigest});
      if(typeof b.snapshotToken!=='string'||b.snapshotToken.length>2048||typeof b.question!=='string'||!b.question.trim()||b.question.length>500||!id(b.idempotencyKey)||b.optIn!==true)fail(400,'body');
      const s=verify(b.snapshotToken);
      const validate=c=>{if(s.u!==user||s.owner!==c.owner||s.vehicle!==b.vehicleId)fail(403,'access');if(s.digest!==c.digest)fail(409,'snapshot');};validate(ctx);
      const hash=mac(canonical({s,question:b.question,lang:b.lang,version:Analytics.version}));
      const reservation=ledger.reserve(user,b.idempotencyKey,hash,now());row=reservation.row;
      if(!reservation.fresh){row=null;const old=reservation.row;if(old.state==='completed'&&old.answer)return reply(200,old.answer);if(['reserved','in_flight'].includes(old.state))return reply(202,{status:'pending'});fail(409,'request_finished');}
      row.state='in_flight';
      const intent=await bounded(()=>provider.classify({question:b.question,allowed:['service','consumption','costs','unsupported'],maxInputTokens:1000,maxOutputTokens:64}));
      if(!['service','consumption','costs'].includes(intent))fail(422,'unsupported');
      validate(await context(user,b.vehicleId));
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Helsinki',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now()));
      const result=summary(ctx.data,intent,today);
      const explanation=await bounded(()=>provider.explain({intent,result,allowed:['summary'],maxInputTokens:3000,maxOutputTokens:448}));
      if(!explanation||Object.keys(explanation).length!==1||!Object.hasOwn(explanation,'code')||explanation.code!=='summary')fail(502,'output');
      validate(await context(user,b.vehicleId));
      if(s.expires<=now())fail(409,'snapshot');
      const answer={version:Analytics.version,vehicleId:b.vehicleId,text:render(result,b.lang),result};ledger.complete(row,answer,now());row=null;return reply(200,answer);
    }catch(e){if(row)ledger.reject(row);return reply(e.status||502,{error:e.code||'provider'});}
  };
}
function reply(status,body){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
