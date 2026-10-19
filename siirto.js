'use strict';
// Receives a garage moved from the old address (mestarihannes.github.io/Ajoura/). The old address runs muutto.js:
// it packs that device's AJOURA data (localStorage keys + the IndexedDB 'ajoura' store), gzips it and sends it here
// in the URL fragment, in pieces when it is large. Fragments never reach the server. Each piece is kept in IndexedDB
// until the last one arrives, then the whole is checked and written into this address's storage.
(() => {
  const OLD = 'https://mestarihannes.github.io/Ajoura/';
  const SKIP = ['ajoura-session', 'ajoura-sync-base', 'ajoura-synced-at'];
  const out = document.getElementById('siirto');
  const lang = (() => { const l = new URLSearchParams(location.hash.slice(1)).get('l'); return l === 'sv' || l === 'en' ? l : 'fi'; })();
  const T = {
    fi: { moving: 'Siirretään tietojasi uuteen osoitteeseen…', part: 'Osa {i} / {n}', done: 'Valmis! Autosi ja merkintäsi ovat nyt uudessa osoitteessa.', open: 'Avaa AJOURA',
      install: 'Jos olit lisännyt AJOURAn kotivalikkoon, lisää se uudelleen tästä osoitteesta. Vanha kuvake ei enää toimi. Jos olit kirjautunut, kirjaudu uudelleen.',
      both: 'Tässä selaimessa on jo AJOURA-tietoja uudessa osoitteessa. Mitkä tiedot pidetään?', keepNew: 'Pidä nykyiset', takeOld: 'Ota vanhan osoitteen tiedot',
      kept: 'Nykyiset tiedot pidettiin. Vanhan osoitteen tiedot tallennettiin varalle tähän selaimeen.', fail: 'Siirto ei onnistunut.', retry: 'Yritä uudelleen',
      failHelp: 'Tietosi ovat yhä tallessa vanhassa osoitteessa. Voit myös avata vanhan osoitteen ja tallentaa varmuuskopion.', nothing: 'Siirrettävää ei löytynyt.' },
    sv: { moving: 'Dina uppgifter flyttas till den nya adressen…', part: 'Del {i} / {n}', done: 'Klart! Dina bilar och anteckningar finns nu på den nya adressen.', open: 'Öppna AJOURA',
      install: 'Om du hade lagt till AJOURA på hemskärmen, lägg till den igen från den här adressen. Den gamla ikonen fungerar inte längre. Om du var inloggad, logga in igen.',
      both: 'Den här webbläsaren har redan AJOURA-uppgifter på den nya adressen. Vilka ska behållas?', keepNew: 'Behåll nuvarande', takeOld: 'Ta uppgifterna från den gamla adressen',
      kept: 'De nuvarande uppgifterna behölls. Uppgifterna från den gamla adressen sparades som reserv i den här webbläsaren.', fail: 'Flytten misslyckades.', retry: 'Försök igen',
      failHelp: 'Dina uppgifter finns kvar på den gamla adressen. Du kan också öppna den gamla adressen och spara en säkerhetskopia.', nothing: 'Inget att flytta hittades.' },
    en: { moving: 'Moving your data to the new address…', part: 'Part {i} / {n}', done: 'Done! Your cars and entries are now at the new address.', open: 'Open AJOURA',
      install: 'If you had added AJOURA to your home screen, add it again from this address. The old icon no longer works. If you were signed in, sign in again.',
      both: 'This browser already has AJOURA data at the new address. Which data should be kept?', keepNew: 'Keep current', takeOld: 'Use the data from the old address',
      kept: 'Your current data was kept. The data from the old address was saved as a spare copy in this browser.', fail: 'The move did not work.', retry: 'Try again',
      failHelp: 'Your data is still safe at the old address. You can also open the old address and save a backup.', nothing: 'Nothing to move was found.' }
  }[lang];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const show = html => { out.innerHTML = html; };
  const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };

  const openDb = (name, store) => new Promise((ok, no) => { const r = indexedDB.open(name, 1); r.onupgradeneeded = () => r.result.createObjectStore(store); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const tx = (db, store, mode, fn) => new Promise((ok, no) => { const t = db.transaction(store, mode), r = fn(t.objectStore(store)); t.oncomplete = () => ok(r && r.result); t.onerror = t.onabort = () => no(t.error); });

  const p = new URLSearchParams(location.hash.slice(1));
  const id = p.get('id') || '', i = Number(p.get('i')), n = Number(p.get('n')), h = p.get('h') || '', z = p.get('z') === '1', data = p.get('d') || '';
  const toRaw = p.get('to') || '';
  const to = /^(?:[\w-]+\.html)?(?:\?[\w=&%.-]*)?(?:#[\w/%.=&-]*)?$/.test(toRaw) ? toRaw : 'app.html';
  const target = to;
  history.replaceState(null, '', location.pathname);

  const failed = err => {
    try { console.error(err); } catch (e) {}
    show(`<h1>${esc(T.fail)}</h1><p>${esc(T.failHelp)}</p><p><a class="btn" href="${OLD}app.html#ajoura-muutto-uudelleen">${esc(T.retry)}</a></p>`);
  };

  async function gunzip(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
  const fromB64 = s => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); const u = new Uint8Array(b.length); for (let k = 0; k < b.length; k++) u[k] = b.charCodeAt(k); return u; };

  async function hasGarage() {
    try { const d = JSON.parse(localStorage.getItem('ajoura-app-v2')); if (d && Array.isArray(d.cars) && d.cars.length) return true; } catch (e) {}
    try { const db = await openDb('ajoura', 'kv'); const d = await tx(db, 'kv', 'readonly', s => s.get('ajoura-app-v2')); db.close(); if (d && Array.isArray(d.cars) && d.cars.length) return true; } catch (e) {}
    return false;
  }

  async function apply(pack) {
    for (const [k, v] of Object.entries(pack.ls)) { if (SKIP.includes(k)) continue; try { localStorage.setItem(k, v); } catch (e) {} }
    const keys = Object.keys(pack.kv);
    if (keys.length) { const db = await openDb('ajoura', 'kv'); await tx(db, 'kv', 'readwrite', s => { keys.forEach(k => s.put(pack.kv[k], k)); }); db.close(); }
  }

  async function spare(pack) {
    const db = await openDb('ajoura-siirto', 'c');
    await tx(db, 'c', 'readwrite', s => s.put(pack, 'vanhan-osoitteen-tiedot-' + new Date().toISOString().slice(0, 10)));
    db.close();
  }

  const finished = () => {
    try { localStorage.setItem('ajoura-siirretty', String(Date.now())); } catch (e) {}
    show(`<h1>${esc(T.done)}</h1><p>${esc(T.install)}</p><p><a class="btn" href="${esc(target || 'app.html')}">${esc(T.open)}</a></p>`);
  };

  async function run() {
    if (!/^[a-z0-9]{8,24}$/.test(id) || !Number.isInteger(i) || !Number.isInteger(n) || n < 1 || n > 400 || i < 0 || i >= n || !/^[\w-]*$/.test(data)) {
      show(`<h1>${esc(T.nothing)}</h1><p><a class="btn" href="app.html">${esc(T.open)}</a></p>`); return;
    }
    show(`<h1>${esc(T.moving)}</h1>${n > 1 ? `<p>${esc(T.part.replace('{i}', i + 1).replace('{n}', n))}</p>` : ''}`);
    const db = await openDb('ajoura-siirto', 'c');
    await tx(db, 'c', 'readwrite', s => s.put(data, id + ':' + i));
    if (i + 1 < n) { db.close(); location.replace(`${OLD}app.html#ajoura-muutto=${id}.${i + 1}`); return; }
    const parts = [];
    for (let k = 0; k < n; k++) { const part = await tx(db, 'c', 'readonly', s => s.get(id + ':' + k)); if (typeof part !== 'string') throw new Error('missing part ' + k); parts.push(part); }
    const whole = parts.join('');
    if (fnv(whole) !== h) throw new Error('checksum');
    const bytes = fromB64(whole);
    const text = z ? await gunzip(bytes) : new TextDecoder().decode(bytes);
    const pack = JSON.parse(text);
    if (!pack || pack.v !== 1 || typeof pack.ls !== 'object' || typeof pack.kv !== 'object') throw new Error('format');
    Object.keys(pack.ls).forEach(k => { if (!/^ajoura-/.test(k) || typeof pack.ls[k] !== 'string') delete pack.ls[k]; });
    await tx(db, 'c', 'readwrite', s => { for (let k = 0; k < n; k++) s.delete(id + ':' + k); });
    db.close();
    if (await hasGarage()) {
      show(`<h1>${esc(T.both)}</h1><p><button class="btn" data-k="new">${esc(T.keepNew)}</button></p><p><button class="btn ghost" data-k="old">${esc(T.takeOld)}</button></p>`);
      out.addEventListener('click', async ev => {
        const b = ev.target.closest('[data-k]'); if (!b) return;
        try {
          if (b.dataset.k === 'old') { await apply(pack); finished(); }
          else { await spare(pack); try { localStorage.setItem('ajoura-siirretty', String(Date.now())); } catch (e) {} show(`<h1>${esc(T.kept)}</h1><p><a class="btn" href="${esc(target || 'app.html')}">${esc(T.open)}</a></p>`); }
        } catch (e) { failed(e); }
      });
      return;
    }
    await apply(pack);
    finished();
  }
  run().catch(failed);
})();
