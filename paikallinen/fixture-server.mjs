// Explicit loopback fixture harness. Fictional data only; not a deployment entrypoint.
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createAssistant} from './avustaja.mjs';
if(process.argv[2]!=='--fixture-only'||!process.argv[3])throw new Error('Use --fixture-only with a fictional JSON fixture');
const state=JSON.parse(readFileSync(process.argv[3],'utf8'));
let allowed=true;const calls=[];
const handler=createAssistant({enabled:true,secret:randomBytes(32).toString('hex'),authenticate:async h=>h==='Bearer fixture-user'?'fixture-user':null,entitled:async()=>allowed,readVehicle:async(u,id)=>{const car=state.cars.find(c=>c.id===id);return allowed&&car?{owner:'fixture-owner',car,profile:state.profile}:null;},provider:{classify:async p=>{calls.push(p);return /kulutus|consumption|förbrukning/i.test(p.question)?'consumption':/huolto|service/i.test(p.question)?'service':/kulu|cost|kostnad/i.test(p.question)?'costs':'unsupported';},explain:async p=>{calls.push(p);return {code:'summary'};}}});
const server=http.createServer(async(req,res)=>{
 try{
  if(req.url==='/calls'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(calls));return;}
  if(req.url==='/revoke'&&req.method==='POST'){allowed=false;res.end('{}');return;}
  if(req.url!=='/assistant'){res.statusCode=404;res.end();return;}
  const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>8192){res.statusCode=413;res.end();return;}chunks.push(c);}
  const request=new Request('http://localhost/assistant',{method:req.method,headers:req.headers,body:Buffer.concat(chunks)});
  const response=await handler(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
 }catch(e){res.statusCode=500;res.end('{"error":"fixture"}');}
});
server.listen(0,'127.0.0.1',()=>process.stdout.write(JSON.stringify({port:server.address().port})+'\n'));
