'use strict';
// On-device cutout. No image or image-derived data leaves this browser.
(() => {
  const workerUrl=new URL('car-photo-worker.js?v=ak-126',document.currentScript?.src||document.baseURI);
  let worker=null, next=0, idle=0;
  const pending=new Map();
  function stop(){worker?.terminate();worker=null;}
  const images=new Map();
  const database=new Promise(resolve=>{
    try{const request=indexedDB.open('ajoura-car-cutouts-v1',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('images',{keyPath:'key'});
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null);request.onblocked=()=>resolve(null);
    }catch(e){resolve(null);}
  });
  const ready=database.then(db=>new Promise(resolve=>{
    if(!db)return resolve();
    const request=db.transaction('images').objectStore('images').getAll();
    request.onsuccess=()=>{for(const row of request.result)if(typeof row.source==='string'&&typeof row.image==='string'&&row.image.startsWith('data:image/png;base64,'))images.set(row.source,{key:row.key,image:row.image});resolve(images.size>0);};request.onerror=()=>resolve();
  }));
  async function remember(source,image){
    await ready;const db=await database;if(!db)throw new Error('storage_unavailable');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
    const key=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
    await new Promise((resolve,reject)=>{const tx=db.transaction('images','readwrite');tx.objectStore('images').put({key,source,image});tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(new Error('storage_failed'));});
    images.set(source,{key,image});
  }
  function prune(sources){const keep=new Set(sources);database.then(db=>{if(!db)return;const tx=db.transaction('images','readwrite');for(const [source,row] of images)if(!keep.has(source)){images.delete(source);tx.objectStore('images').delete(row.key);}}).catch(()=>{});}
  async function clear(){images.clear();await ready;const db=await database;if(db)await new Promise(resolve=>{const tx=db.transaction('images','readwrite');tx.objectStore('images').clear();tx.oncomplete=tx.onerror=tx.onabort=resolve;});images.clear();}
  window.AjouraCarPhoto={ready,remember,prune,clear,display:source=>images.get(source)?.image||source,process(data){
    if(!window.Worker)return Promise.reject(new Error('worker_unavailable'));
    clearTimeout(idle);
    if(!worker){worker=new Worker(workerUrl,{type:'module'});
      worker.onmessage=({data:r})=>{const job=pending.get(r.id);if(!job)return;pending.delete(r.id);clearTimeout(job.timer);r.error?job.reject(new Error(r.error)):job.resolve(r.data);idle=setTimeout(stop,10000);};
      worker.onerror=()=>{for(const job of pending.values()){clearTimeout(job.timer);job.reject(new Error('processing_failed'));}pending.clear();stop();};}
    return new Promise((resolve,reject)=>{const id=++next;const timer=setTimeout(()=>{pending.delete(id);stop();reject(new Error('timeout'));},90000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,data});});
  }};
})();
