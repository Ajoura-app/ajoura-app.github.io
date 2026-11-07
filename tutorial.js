'use strict';
// Optional, manual steps. No audio, automatic advance, AI calls or garage writes.
(() => {
  let current=null;
  const t=s=>window.AjouraI18n?window.AjouraI18n.t(s):s;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function open(opts={}){
    if(current)return;
    const host=opts.host||document.querySelector('.device-glass')||document.body,back=document.activeElement;
    const el=document.createElement('div');el.className='tutorial ai-guide';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label',t('Lyhyt käyttöönoton opastus'));
    const others=[...host.children];for(let branch=host;branch.parentElement&&branch!==document.body;branch=branch.parentElement)others.push(...[...branch.parentElement.children].filter(e=>e!==branch));
    const siblings=[...new Set(others)].map(e=>[e,e.inert]);siblings.forEach(([e])=>{e.inert=true;});
    const steps=[['Lisää ajoneuvosi','Aloita lisäämällä ajoneuvo. Voit kirjata huollot ja tankkaukset käsin ilman tekoälyä.'],['Kirjaa omalla tavallasi','Tankkauksen voi täyttää myös kuvasta, tekstistä tai sanelusta tuetuissa selaimissa. Tekoäly edellyttää käyttöoikeutta ja omaa valintaasi. Tarkistat ja tallennat tiedot itse.'],['Seuraa ja muokkaa','Etusivulta pääset ajoneuvon tietoihin. Tankkaus näyttää kirjauksesi ja Raportit kulusi. Hahmoa ja teemaa voi vaihtaa asetuksista.']];
    let index=0;try{const n=Number(localStorage.getItem('ajoura-opastus-vaihe'));if(Number.isInteger(n)&&n>=0&&n<steps.length)index=n;}catch(e){}
    const remember=()=>{try{localStorage.setItem('ajoura-opastus-vaihe',String(index));}catch(e){}};
    const close=()=>{if(!current)return;el.remove();siblings.forEach(([e,inert])=>{e.inert=inert;});current=null;opts.onClose?.();if(back?.isConnected)back.focus({preventScroll:true});};
    const show=()=>{const [title,body]=steps[index];el.innerHTML=`<div class="ai-guide-top"><span>${index+1} / ${steps.length}</span><button type="button" data-guide-close>${esc(t('Ohita opastus'))}</button></div><div class="ai-guide-main" aria-live="polite">${window.AjouraAvatar.avatar()}<span translate="no">${window.AjouraAvatar.name()}</span><h2 tabindex="-1">${esc(t(title))}</h2><p>${esc(t(body))}</p></div><div class="ai-guide-actions"><button type="button" data-guide-prev${index===0?' disabled':''}>${esc(t('Edellinen'))}</button><button type="button" data-guide-next>${esc(t(index===steps.length-1?'Valmis':'Seuraava'))}</button></div>`;};
    el.addEventListener('click',e=>{if(e.target.closest('[data-guide-close]'))close();else if(e.target.closest('[data-guide-next]')){if(index===steps.length-1){index=0;remember();close();}else{index++;remember();show();el.querySelector('h2').focus();}}else if(e.target.closest('[data-guide-prev]')&&index>0){index--;remember();show();el.querySelector('h2').focus();}});
    el.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();return;}if(e.key!=='Tab')return;const focus=[...el.querySelectorAll('button:not([disabled])')],first=focus[0],last=focus[focus.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement.tagName==='H2')){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
    current={close};show();host.appendChild(el);el.querySelector('[data-guide-close]').focus({preventScroll:true});
  }
  window.AjouraTutorial=Object.freeze({open,close:()=>current?.close(),duration:0});
})();
