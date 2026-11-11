// Local U2Netp (Apache-2.0) + ONNX Runtime Web 1.21.0 (MIT). No uploads.
import * as ort from './vendor/u2net/ort.wasm.min.mjs';
ort.env.wasm.numThreads=1;
ort.env.wasm.wasmPaths=new URL('./vendor/u2net/',import.meta.url).href;
let ready;
async function process(data){
  if(!ready)ready=ort.InferenceSession.create(new URL('./vendor/u2net/u2netp.onnx',import.meta.url).href,{executionProviders:['wasm'],graphOptimizationLevel:'all'}).catch(e=>{ready=null;throw e;});
  const model=await ready,blob=await(await fetch(data)).blob(),bitmap=await createImageBitmap(blob);
  const w=bitmap.width,h=bitmap.height,side=320,n=side*side;
  const input=new OffscreenCanvas(side,side),ic=input.getContext('2d');ic.drawImage(bitmap,0,0,side,side);
  const rgb=ic.getImageData(0,0,side,side).data,values=new Float32Array(3*n),means=[.485,.456,.406],std=[.229,.224,.225];
  let max=1;for(let i=0;i<n;i++)for(let c=0;c<3;c++)max=Math.max(max,rgb[i*4+c]);
  for(let i=0;i<n;i++)for(let c=0;c<3;c++)values[c*n+i]=(rgb[i*4+c]/max-means[c])/std[c];
  const result=await model.run({[model.inputNames[0]]:new ort.Tensor('float32',values,[1,3,side,side])});
  const mask=result[model.outputNames[0]].data;let lo=Infinity,hi=-Infinity;
  for(let i=0;i<n;i++){lo=Math.min(lo,mask[i]);hi=Math.max(hi,mask[i]);}
  if(!Number.isFinite(hi)||hi-lo<.01){bitmap.close();throw new Error('mask_invalid');}
  const matte=ic.createImageData(side,side);
  for(let i=0;i<n;i++){matte.data[i*4]=matte.data[i*4+1]=matte.data[i*4+2]=255;matte.data[i*4+3]=Math.round((mask[i]-lo)/(hi-lo)*255);}
  ic.putImageData(matte,0,0);
  const canvas=new OffscreenCanvas(w,h),ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
  ctx.globalCompositeOperation='destination-in';ctx.drawImage(input,0,0,w,h);
  const pixels=ctx.getImageData(0,0,w,h).data;let x0=w,y0=h,x1=0,y1=0,count=0;
  for(let i=0;i<w*h;i++)if(pixels[i*4+3]>128){const x=i%w,y=Math.floor(i/w);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);count++;}
  if(count<w*h*.015||count>w*h*.98)throw new Error('mask_invalid');
  const pad=8;x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);x1=Math.min(w,x1+pad+1);y1=Math.min(h,y1+pad+1);
  const out=new OffscreenCanvas(x1-x0,y1-y0);out.getContext('2d').drawImage(canvas,x0,y0,out.width,out.height,0,0,out.width,out.height);
  const bytes=new Uint8Array(await(await out.convertToBlob({type:'image/png'})).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return 'data:image/png;base64,'+btoa(binary);
}
self.onmessage=async({data:{id,data}})=>{try{self.postMessage({id,data:await process(data)});}catch(e){self.postMessage({id,error:String(e.message||'background_removal_failed').slice(0,300)});}};
