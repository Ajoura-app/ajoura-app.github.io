'use strict';
// Device-only appearance preferences. No account, entitlement, network or garage writes.
(() => {
  const KEY='ajoura-hahmo', MOTION='ajoura-hahmo-motion';
  const characters={emma:'Emma',mikko:'Mikko',ankka:'Bottiankka'};
  const states={neutral:'',listening:'Kuunnellaan…',checking:'Tarkistetaan tietoja…',success:'Kirjaus tallennettu.',attention:'Tarkista tiedot.'};
  const get=k=>{try{return localStorage.getItem(k);}catch(e){return null;}};
  let character=Object.hasOwn(characters,get(KEY))?get(KEY):'emma', motion=get(MOTION)!=='0', state='neutral', timer=0;
  const t=s=>window.AjouraI18n?window.AjouraI18n.t(s):s;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const image=(id,size)=>`hahmot/${id}${size==='large'?'':'_128'}.webp`;
  function avatar(size='large',id=character,live=true){
    return `<span class="assistant-avatar avatar-${size}" data-avatar${live?' data-avatar-live':''} data-avatar-state="${live?state:'neutral'}" data-avatar-motion="${motion?'on':'off'}"><img src="${image(id,size)}" alt="" width="${size==='large'?88:56}" height="${size==='large'?88:56}"><span class="avatar-badge" aria-hidden="true"></span></span>`;
  }
  const feedback=()=>`<span class="avatar-feedback" data-avatar-feedback role="status" aria-live="polite">${esc(t(states[state]))}</span>`;
  function paint(){
    document.querySelectorAll('[data-avatar-live]').forEach(el=>{
      el.dataset.avatarState=state;el.dataset.avatarMotion=motion?'on':'off';
      const img=el.querySelector('img');img.setAttribute('src',image(character,el.classList.contains('avatar-large')?'large':'small'));
    });
    document.querySelectorAll('[data-avatar-name]').forEach(el=>{el.textContent=characters[character];});
    document.querySelectorAll('[data-avatar-feedback]').forEach(el=>{el.textContent=t(states[state]);});
    document.querySelectorAll('[data-avatar-shortcut]').forEach(el=>{el.setAttribute('aria-label',t('Avustajan hahmo')+': '+characters[character]);});
  }
  function react(next){
    if(!Object.hasOwn(states,next))return;
    clearTimeout(timer);state=next;paint();
    if(next==='success'||next==='attention')timer=setTimeout(()=>{state='neutral';paint();},4000);
  }
  function settings(){return `<section class="me-data avatar-settings" data-avatar-settings><h3>${esc(t('Avustajan hahmo'))}</h3><p>${esc(t('Hahmo ja animaatiot ovat tämän laitteen asetuksia. Kaikilla hahmoilla on samat toiminnot.'))}</p><div class="avatar-choices" role="group" aria-label="${esc(t('Avustajan hahmo'))}">${Object.entries(characters).map(([id,name])=>`<button type="button" data-avatar-choice="${id}" aria-pressed="${id===character}">${avatar('choice',id,false)}<span translate="no">${name}</span></button>`).join('')}</div><label class="avatar-motion"><input type="checkbox" data-avatar-motion-toggle${motion?' checked':''}><span>${esc(t('Hahmon animaatiot'))}</span></label><p class="avatar-save-note" data-avatar-save-note role="status"></p></section>`;}
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-avatar-shortcut]')){
      const root=document.getElementById('app-screen');
      const focus=()=>{const section=document.querySelector('[data-avatar-settings]');if(!section)return false;section.scrollIntoView({block:'start'});section.querySelector('[aria-pressed=true]')?.focus({preventScroll:true});return true;};
      const observer=new MutationObserver(()=>{if(focus())observer.disconnect();});observer.observe(root,{childList:true,subtree:true});
      setTimeout(()=>{if(focus())observer.disconnect();},0);
    }
    const b=e.target.closest('[data-avatar-choice]');if(!b)return;
    const id=b.dataset.avatarChoice;if(!Object.hasOwn(characters,id))return;
    character=id;react('neutral');let stored=true;
    try{localStorage.setItem(KEY,id);}catch(e){stored=false;}
    const section=document.querySelector('[data-avatar-settings]');if(section)section.outerHTML=settings();
    paint();document.querySelector(`[data-avatar-choice="${id}"]`)?.focus({preventScroll:true});
    if(!stored)document.querySelector('[data-avatar-save-note]').textContent=t('Valinta toimii nyt, mutta sitä ei voitu tallentaa tälle laitteelle.');
  });
  document.addEventListener('change',e=>{
    if(!e.target.matches('[data-avatar-motion-toggle]'))return;
    motion=e.target.checked;try{localStorage.setItem(MOTION,motion?'1':'0');}catch(err){document.querySelector('[data-avatar-save-note]').textContent=t('Valinta toimii nyt, mutta sitä ei voitu tallentaa tälle laitteelle.');}paint();
  });
  window.AjouraAvatar=Object.freeze({avatar,feedback,settings,react,motion:()=>motion,name:()=>characters[character],
    floating:()=>`<a class="avatar-shortcut" href="#settings" data-avatar-shortcut aria-label="${esc(t('Avustajan hahmo')+': '+characters[character])}">${avatar('small')}</a>`,
    sheet:()=>`<div class="avatar-sheet">${avatar('small')}<span translate="no" data-avatar-name>${characters[character]}</span>${feedback()}</div>`});
})();
