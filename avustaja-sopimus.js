'use strict';
// Shared bounded, content-only projection. No permissions, storage or network.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AjouraAssistantContract=api;})(globalThis,()=>{
class ValidationError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
const fail=(status,code)=>{throw new ValidationError(status,code);};
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const integer=v=>Number.isSafeInteger(v)&&v>=0&&v<=2000000;
const money=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100000;
const id=v=>typeof v==='string'&&/^[\w-]{1,40}$/.test(v);
const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o[k]!==undefined).map(k=>[k,o[k]]));
function project(car,profile){
  if(!car||!id(car.id)||car.kind&&car.kind!=='car'||!integer(car.km)||!Number.isInteger(car.year)||car.year<1930||car.year>2200||typeof car.fuel!=='string'||!['','Bensiini','Diesel','Sähkö','Kaasu','Hybridi (bensiini/sähkö)','Lataushybridi','Muu'].includes(car.fuel))fail(422,'unsupported');
  if(!profile||!Number.isInteger(profile.months)||profile.months<1||profile.months>120||!integer(profile.km)||profile.km<1)fail(422,'data');
  const fuels=car.fuels===undefined?[]:car.fuels,events=car.events;
  if(!Array.isArray(fuels)||fuels.length>2000||!Array.isArray(events)||events.length>10000)fail(422,'data');
  if([...fuels,...events].some(x=>!x||typeof x!=='object'||Array.isArray(x)))fail(422,'data');
  const validEventCost=v=>v===undefined||v===null||v===''||(typeof v==='number'&&money(v))||(typeof v==='string'&&/^\d+(?:\.\d+)?$/.test(v)&&money(Number(v)));
  const unique=xs=>new Set(xs.map(x=>x.id)).size===xs.length;
  if(!unique(fuels)||!unique(events))fail(422,'data');
  for(const f of fuels)if(!id(f.id)||!date(f.date)||!integer(f.km)||!Number.isFinite(f.qty)||f.qty<=0||f.qty>500||!(f.cost===null||money(f.cost))||typeof f.full!=='boolean'||f.skip!==undefined&&typeof f.skip!=='boolean'||f.el!==undefined&&typeof f.el!=='boolean'||f.grade!==undefined&&(typeof f.grade!=='string'||f.grade.length>24))fail(422,'data');
  for(const e of events)if(!id(e.id)||!date(e.date)||!(e.km===null||integer(e.km))||typeof e.type!=='string'||e.type.length>100||e.items!==undefined&&(!Array.isArray(e.items)||e.items.length>100||e.items.some(x=>typeof x!=='string'||x.length>100))||!validEventCost(e.cost))fail(422,'data');
  return {car:{...pick(car,['id','year','km','fuel']),events:events.map(e=>({...pick(e,['id','type','date','km','cost']),oil:(e.items||[]).includes('Moottoriöljy')})).map(({oil,...e})=>({...e,items:oil?['Moottoriöljy']:[]})),fuels:fuels.map(f=>pick(f,['id','date','km','qty','cost','full','skip','el','grade']))},profile:pick(profile,['months','km'])};
}
const canonical=v=>v&&typeof v==='object'?Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
return Object.freeze({project,canonical,id,pick,ValidationError});
});
