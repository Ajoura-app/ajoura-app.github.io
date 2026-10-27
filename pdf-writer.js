// AJOURA PDF writer (v0.32, 26.10.2026). Builds a real A4 PDF file on the device itself: no library, no network.
// Why: the iPhone app installed on the Home Screen ignores window.print(), so reports are handed out as a PDF file
// (share sheet on phones, download on computers). Text uses the PDF's built-in Helvetica with WinAnsi encoding:
// Finnish, Swedish and € work; characters outside it (emoji, Cyrillic…) print as "?".
// Coordinates are millimetres from the page's top-left corner; text y is the baseline. Everything is synchronous, so the
// file is ready within the same tap and the phone still allows the share sheet to open.
(() => {
  'use strict';
  // Glyph widths per 1000 units for WinAnsi codes 32–255 (Adobe Helvetica metrics).
  const W=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
  const WB=[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];
  // Unicode → WinAnsi for the characters outside Latin-1; spaces of other widths become plain spaces.
  const MAP={8364:128,8218:130,402:131,8222:132,8230:133,8224:134,8225:135,710:136,8240:137,352:138,8249:139,338:140,381:142,8216:145,8217:146,8220:147,8221:148,8226:149,8211:150,8212:151,732:152,8482:153,353:154,8250:155,339:156,382:158,376:159,8722:150,8209:45,8208:45,160:32,8239:32,8201:32,8199:32,8202:32};
  const enc=s=>{let o='';for(const ch of String(s??'')){const c=ch.codePointAt(0);o+=String.fromCharCode(c<32?32:c<127?c:c>160&&c<256?c:MAP[c]||63);}return o;};
  const K=72/25.4,PW=595.28,PH=841.89;
  const num=v=>{const r=Math.round(v*100)/100;return String(Object.is(r,-0)?0:r);};
  const rgb=h=>{const m=/^#?([0-9a-f]{6})$/i.exec(h||'');const v=m?parseInt(m[1],16):0;return [v>>16&255,v>>8&255,v&255].map(x=>num(x/255)).join(' ');};
  const esc=s=>s.replace(/[\\()]/g,m=>'\\'+m);
  const wEnc=(s,size,bold)=>{const t=bold?WB:W;let u=0;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);u+=c>=32?t[c-32]||0:0;}return u*size/1000/K;};
  // The AJOURA logo (logo.svg) as PDF drawing operators in the SVG's own units; the gradients are solid colours.
  const LOGO='0.106 0.561 0.902 rg 58 -10 m 150 -44 232 -78 320 -80 c 396 -82 448 -58 494 -32 c 446 -50 394 -70 320 -69 c 234 -67 152 -38 58 -10 c h f 418 -37 m 500 -40 566 -29 622 -9 c 562 -22 500 -31 418 -31 c h f 0.464 0.736 0.941 rg 128 -20 m 206 -38 266 -46 336 -46 c 266 -42 206 -34 128 -20 c h f q 1 0 -0.2126 1 22 0 cm 0.102 0.455 0.902 rg 0 100 m 37 0 l 59 0 l 96 100 l 74 100 l 66 77 l 30 77 l 22 100 l h 36 59 m 60 59 l 48 25 l h f* 20 w 0.102 0.478 0.91 RG 161 0 m 161 58 l 161 79.33 150.33 90 129 90 c 108 90 l S 226 10 m 246 10 l 262.57 10 276 23.43 276 40 c 276 60 l 276 76.57 262.57 90 246 90 c 226 90 l 209.43 90 196 76.57 196 60 c 196 40 l 196 23.43 209.43 10 226 10 c h S 0.09 0.133 0.204 RG 312 0 m 312 58 l 312 79.33 322.67 90 344 90 c 351 90 l 372.33 90 383 79.33 383 58 c 383 0 l S 420 100 m 420 10 l 458 10 l 479.33 10 490 19.33 490 38 c 490 56.67 479.33 66 458 66 c 420 66 l 454 66 m 494 100 l S 0.09 0.133 0.204 rg 506 100 m 543 0 l 565 0 l 602 100 l 580 100 l 572 77 l 536 77 l 528 100 l h 542 59 m 566 59 l 554 25 l h f* Q';
  // JPEG size and colour channels from its header, so the image can go into the PDF as it is.
  function jpeg(url){const m=/^data:image\/jpe?g;base64,(.+)$/.exec(url||'');if(!m)return null;let b;try{b=atob(m[1]);}catch(e){return null;}
    if(b.charCodeAt(0)!==255||b.charCodeAt(1)!==216)return null;let i=2;
    while(i+9<b.length){if(b.charCodeAt(i)!==255){i++;continue;}const t=b.charCodeAt(i+1),len=b.charCodeAt(i+2)*256+b.charCodeAt(i+3);
      if(t>=192&&t<=207&&t!==196&&t!==200&&t!==204)return {data:b,h:b.charCodeAt(i+5)*256+b.charCodeAt(i+6),w:b.charCodeAt(i+7)*256+b.charCodeAt(i+8),n:b.charCodeAt(i+9)};
      if(t===216||t===1||(t>=208&&t<=215)){i+=2;continue;}i+=2+len;}
    return null;}
  function create(meta){
    const pages=[],imgs=[];let cur=null;
    const X=mm=>num(mm*K),Y=mm=>num(PH-mm*K),put=s=>{cur.ops.push(s);};
    const path=(x,y,w,h,r)=>{if(!r)return `${X(x)} ${Y(y+h)} ${num(w*K)} ${num(h*K)} re`;r=Math.min(r,w/2,h/2);const k=.5523*r;
      return [`${X(x+r)} ${Y(y)} m`,`${X(x+w-r)} ${Y(y)} l`,`${X(x+w-r+k)} ${Y(y)} ${X(x+w)} ${Y(y+r-k)} ${X(x+w)} ${Y(y+r)} c`,`${X(x+w)} ${Y(y+h-r)} l`,
        `${X(x+w)} ${Y(y+h-r+k)} ${X(x+w-r+k)} ${Y(y+h)} ${X(x+w-r)} ${Y(y+h)} c`,`${X(x+r)} ${Y(y+h)} l`,`${X(x+r-k)} ${Y(y+h)} ${X(x)} ${Y(y+h-r+k)} ${X(x)} ${Y(y+h-r)} c`,
        `${X(x)} ${Y(y+r)} l`,`${X(x)} ${Y(y+r-k)} ${X(x+r-k)} ${Y(y)} ${X(x+r)} ${Y(y)} c`,'h'].join(' ');};
    const doc={
      W:210,H:297,
      page(){cur={ops:[],img:[]};pages.push(cur);return pages.length;},
      get pages(){return pages.length;},
      // Runs fn on every page in turn (for footers that need the page count).
      each(fn){const keep=cur;pages.forEach((p,i)=>{cur=p;fn(i+1,pages.length);});cur=keep;},
      width:(s,size,bold)=>wEnc(enc(s),size,bold),
      // Shortens the text with "…" to fit the width.
      fit(s,w,size,bold){let t=String(s??'');if(doc.width(t,size,bold)<=w)return t;while(t.length>1&&doc.width(t+'…',size,bold)>w)t=t.slice(0,-1);return t.replace(/\s+$/,'')+'…';},
      // Splits the text into lines that fit the width (long single words are shortened).
      wrap(s,w,size,bold){const out=[];let line='';for(const word of String(s??'').split(/ +/)){const t=line?line+' '+word:word;if(!line||wEnc(enc(t),size,bold)<=w)line=t;else{out.push(line);line=word;}}if(line)out.push(line);return out.map(l=>doc.fit(l,w,size,bold));},
      text(x,y,s,o={}){const size=o.size||10,t=enc(s),w=wEnc(t,size,o.bold);const x0=o.align==='right'?x-w:o.align==='center'?x-w/2:x;
        put(`BT /${o.bold?'F2':'F1'} ${num(size)} Tf ${rgb(o.color||'#15263f')} rg ${X(x0)} ${Y(y)} Td (${esc(t)}) Tj ET`);return w;},
      rect(x,y,w,h,o={}){const p=path(x,y,w,h,o.r);if(o.fill&&o.stroke)put(`${rgb(o.fill)} rg ${rgb(o.stroke)} RG ${num((o.lw||.25)*K)} w ${p} B`);else if(o.stroke)put(`${rgb(o.stroke)} RG ${num((o.lw||.25)*K)} w ${p} S`);else put(`${rgb(o.fill||'#000000')} rg ${p} f`);},
      line(x1,y1,x2,y2,o={}){put(`${rgb(o.color||'#000000')} RG ${num((o.lw||.25)*K)} w ${X(x1)} ${Y(y1)} m ${X(x2)} ${Y(y2)} l S`);},
      logo(x,y,w){const s=w*K/640;put(`q ${num(s)} 0 0 ${num(-s)} ${X(x)} ${num(PH-y*K-88*s)} cm ${LOGO} Q`);return w*198/640;},
      // Pixel size of a JPEG data URL ({w,h}), or null when it can't be read; lets the caller plan rows before drawing.
      imageSize(url){const j=jpeg(url);return j&&j.w&&j.h?{w:j.w,h:j.h}:null;},
      // A JPEG (data URL) fitted inside the box, keeping its shape; returns false when it isn't a JPEG.
      image(url,x,y,w,h){const j=jpeg(url);if(!j||!j.w||!j.h)return false;let n=imgs.findIndex(i=>i.url===url);if(n<0){imgs.push({url,...j});n=imgs.length-1;}
        const k=Math.min(w/j.w,h/j.h),iw=j.w*k,ih=j.h*k;if(!cur.img.includes(n))cur.img.push(n);
        put(`q ${num(iw*K)} 0 0 ${num(ih*K)} ${X(x+(w-iw)/2)} ${Y(y+(h-ih)/2+ih)} cm /Im${n} Do Q`);return true;},
      blob(){
        // Objects: 1 catalog, 2 page tree, 3–4 fonts, 5 info, then the images, then each page and its content.
        const objs=[],ref=i=>i+' 0 R',add=s=>{objs.push(s);return objs.length;};
        add('');add('');add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
        const t=String(meta&&meta.title||'AJOURA');let hex='FEFF';for(let i=0;i<t.length;i++)hex+=t.charCodeAt(i).toString(16).padStart(4,'0');
        const d=new Date(),p2=v=>String(v).padStart(2,'0');
        add(`<< /Title <${hex}> /Producer (AJOURA) /Creator (AJOURA) /CreationDate (D:${d.getFullYear()}${p2(d.getMonth()+1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}) >>`);
        const imgId=imgs.map(j=>add(`<< /Type /XObject /Subtype /Image /Width ${j.w} /Height ${j.h} /ColorSpace /${j.n===1?'DeviceGray':j.n===4?'DeviceCMYK':'DeviceRGB'}${j.n===4?' /Decode [1 0 1 0 1 0 1 0]':''} /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.data.length} >>\nstream\n${j.data}\nendstream`));
        const kids=pages.map(p=>{const body=p.ops.join('\n'),c=add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
          const xo=p.img.length?` /XObject << ${p.img.map(n=>`/Im${n} ${ref(imgId[n])}`).join(' ')} >>`:'';
          return add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo} >> /Contents ${ref(c)} >>`);});
        objs[0]='<< /Type /Catalog /Pages 2 0 R >>';objs[1]=`<< /Type /Pages /Kids [${kids.map(ref).join(' ')}] /Count ${kids.length} >>`;
        let out='%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';const at=[];
        objs.forEach((o,i)=>{at.push(out.length);out+=`${i+1} 0 obj\n${o}\nendobj\n`;});
        const xref=out.length;out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+at.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('');
        out+=`trailer\n<< /Size ${objs.length+1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
        const u=new Uint8Array(out.length);for(let i=0;i<out.length;i++)u[i]=out.charCodeAt(i)&255;
        return new Blob([u],{type:'application/pdf'});}
    };
    return doc;}
  window.AjouraPDF={create};
})();
