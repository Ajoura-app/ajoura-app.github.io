'use strict';
// The app keeps data on this device (IndexedDB + localStorage). Signed-in users also sync it to their account (sync.js).
(() => {
  // One fictional example car the website visitor can load into an empty garage.
  const samples = [
    {id:'touring',sample:true,name:'Volvo XC60',plate:'ABC-123',year:2020,km:184320,body:'suv',color:'#eef1f4',fuel:'Bensiini',events:[
      {id:'oil',type:'Moottoriöljyn vaihto',date:'2026-09-23',km:184320,cost:'129',note:'Öljy ja öljynsuodatin vaihdettu. Kuvitteellinen esimerkkimerkintä.'},
      {id:'filter',type:'Ilmansuodattimen vaihto',date:'2026-05-12',km:182450,cost:'35',note:'Moottorin ilmansuodatin vaihdettu.'},
      {id:'tyres',type:'Renkaiden vaihto',date:'2026-04-05',km:181900,cost:'50',note:'Kesärenkaat vaihdettu alle.'},
      {id:'inspection',type:'Katsastus',date:'2026-02-15',km:181120,cost:'75',note:'Määräaikaiskatsastus hyväksytty. Ei korjauskehotuksia. Kuvitteellinen merkintä.'},
      {id:'brakes',type:'Jarruhuolto',date:'2025-11-14',km:174860,cost:'485',note:'Etujarrulevyt ja -palat vaihdettu. Jarrujen toiminta tarkistettu koeajolla. Kuvitteellinen työ ja hinta.'},
      {id:'annual',type:'Vuosihuolto',date:'2025-09-18',km:169540,cost:'329',note:'Öljyn ja öljynsuodattimen vaihto, raitisilmasuodattimen vaihto sekä nesteiden ja valojen tarkistus. Kuvitteellinen huoltokäynti, ei valmistajan huolto-ohjelma.'},
      {id:'winter',type:'Renkaiden vaihto',date:'2024-10-28',km:151200,cost:'65',note:'Talvirenkaat asennettu. Rengaspaineet tarkistettu. Kuvitteellinen merkintä.'},
      {id:'service2024',type:'Vuosihuolto',date:'2024-09-12',km:148300,cost:'310',note:'Öljy ja öljynsuodatin vaihdettu. Alustan ja jarrujen silmämääräinen tarkistus. Kuvitteellinen huolto ja kustannus.'}
    ],fuels:[
      {id:'f1',date:'2026-08-20',km:182980,qty:58.2,cost:101.27,full:true},
      {id:'f2',date:'2026-09-02',km:183640,qty:52.4,cost:90.65,full:true},
      {id:'f3',date:'2026-09-14',km:184010,qty:20,cost:35.4,full:false},
      {id:'f4',date:'2026-09-24',km:184320,qty:41.9,cost:73.32,full:true}
    ]},
    {id:'city',sample:true,name:'Toyota Corolla',plate:'XYZ-789',year:2018,km:92450,body:'sedan',color:'#b9c1ca',fuel:'Bensiini',events:[
      {id:'service',type:'Huolto',date:'2026-08-17',km:92450,cost:'220',note:'Vuosihuolto. Kuvitteellinen esimerkkimerkintä.'},
      {id:'tyres2',type:'Renkaiden vaihto',date:'2026-04-07',km:89100,cost:'45',note:'Kesärenkaat vaihdettu alle.'}
    ]}
  ];
  // Simulated registry for the concept demo only. No real vehicle register is queried.
  const registry={
    'LMN-456':{name:'Volkswagen Golf',year:2015,body:'hatchback',fuel:'Bensiini',color:'#eef1f4'},
    'KLM-482':{name:'Toyota Corolla Touring Sports',year:2021,body:'wagon',fuel:'Hybridi (bensiini/sähkö)',color:'#b9c1ca'},
    'FIN-202':{name:'Škoda Octavia Combi',year:2019,body:'wagon',fuel:'Diesel',color:'#1e4f9c'},
    'MKV-310':{name:'Toyota RAV4',year:2022,body:'suv',fuel:'Hybridi (bensiini/sähkö)',color:'#6b737c'},
    'EKO-500':{name:'Kia Niro EV',year:2023,body:'suv',fuel:'Sähkö',color:'#2f5b45'},
    'RTX-118':{name:'Mazda 3',year:2020,body:'hatchback',fuel:'Bensiini',color:'#a8232d'},
    'VLV-240':{name:'Volvo 240 GL',year:1988,body:'wagon',fuel:'Bensiini',color:'#1e4f9c'}
  };
  const examplePlates=['LMN-456','FIN-202','MKV-310','VLV-240'];
  // Car event types (26.10.2026, v0.29): 17 types grouped into 11. Old entries keep their stored type; dispType shows the
  // renamed ones under the new name, and their items use the new group's list (oldGroup). Other vehicle kinds: kindPlan (v0.31).
  const kinds=['Huolto','Määräaikaishuolto','Vuosihuolto','Muu huolto','Renkaiden vaihto','Katsastus','Korjaus ja osan vaihto','Autohoito','Mittarilukeman päivitys','Omistajanvaihdos','Muu tapahtuma'];
  const checkItems=['Moottoriöljy','Öljynsuodatin','Ilmansuodatin','Raitisilmasuodatin','Polttoainesuodatin','Sytytystulpat','Jarruneste','Jäähdytysneste','Vaihteistoöljy','Jakohihna / -ketju','Apulaitehihna','Jarrupalat','Jarrulevyt','Akku tarkistettu','Valot tarkistettu','Pyyhkijät','Rengaspaineet','Huoltovälinäyttö nollattu'];
  // Done jobs by event type (cars). Huolto, Määräaikaishuolto and Vuosihuolto use checkItems. Stored items must be in allItems (validCar).
  const itemSets={'Muu huolto':['Moottoriöljy','Öljynsuodatin','Ilmansuodatin','Raitisilmasuodatin','Polttoainesuodatin','Sytytystulpat','Jarrupalat','Jarrulevyt','Jarruneste','Jäähdytysneste','Apulaitehihna','Jakohihna / -ketju','Akun vaihto','Polttimon vaihto','Pyyhkijät','Ilmastointihuolto'],'Renkaiden vaihto':['Kausivaihto','Uudet renkaat','Tasapainotus','Rengashotelli','Rengaspaineet'],'Katsastus':['Määräaikaiskatsastus','Jälkitarkastus','Muutoskatsastus'],'Korjaus ja osan vaihto':['Moottori','Vaihteisto ja kytkin','Jarrut','Jousitus','Ohjaus','Pakoputkisto','Sähkö ja valot','Ilmastointi','Kori ja maalaus','Lasit'],'Autohoito':['Käsinpesu','Konepesu','Sisäpuhdistus','Vanteiden pesu','Savipuhdistus','Kevytvaha','Kestovaha','Kiillotus','Pinnoite','Tuulilasin sadepinnoite','Muoviosien ja tiivisteiden hoito','Alustan pesu','Ruostesuojaus'],'Mittarilukeman päivitys':[],'Omistajanvaihdos':[],'Muu tapahtuma':[]};
  // Other vehicle kinds (26.10.2026, v0.31): own event list (ev, followed by kindTail), one job list for every service
  // event (svc) and a repair list (fix). Care is Pesu ja hoito, for boats Venehoito. Old entries keep their stored type.
  const landFix=['Moottori','Vaihteisto ja kytkin','Voimansiirto','Jarrut','Jousitus','Ohjaus','Pakoputkisto','Sähkö ja valot','Kori ja muoviosat'];
  const careSets={'Pesu ja hoito':['Pesu','Vahaus','Kiillotus','Pinnoite','Muoviosien hoito','Satulan / istuimen hoito','Alustan pesu','Ruostesuojaus'],'Venehoito':['Pesu','Vahaus','Kiillotus','Pohjan pesu','Pohjamaalaus','Teakin hoito','Kuomun ja pehmusteiden hoito','Sisätilojen puhdistus']};
  const kindTail=['Mittarilukeman päivitys','Omistajanvaihdos','Muu tapahtuma'];
  const kindPlan={
    mc:{ev:['Huolto','Kausihuolto','Muu huolto','Renkaiden vaihto','Katsastus','Korjaus ja osan vaihto','Pesu ja hoito','Talvisäilytykseen','Käyttöönotto keväällä'],svc:['Moottoriöljy','Öljynsuodatin','Ilmansuodatin','Sytytystulpat','Venttiilien säätö','Ketjun huolto','Jarrupalat','Jarruneste','Jäähdytysneste','Etuhaarukan öljy','Akku tarkistettu','Valot tarkistettu','Rengaspaineet'],fix:landFix},
    moped:{ev:['Huolto','Kausihuolto','Muu huolto','Renkaiden vaihto','Korjaus ja osan vaihto','Pesu ja hoito','Talvisäilytykseen','Käyttöönotto keväällä'],svc:['Moottoriöljy','Vaihteistoöljy','Ilmansuodatin','Sytytystulpat','Variaattorihihna','Variaattorin rullat','Ketjun huolto','Jarrupalat','Jarruneste','Akku tarkistettu','Valot tarkistettu','Rengaspaineet'],fix:landFix},
    microcar:{ev:['Huolto','Vuosihuolto','Muu huolto','Renkaiden vaihto','Katsastus','Korjaus ja osan vaihto','Pesu ja hoito'],svc:['Moottoriöljy','Öljynsuodatin','Ilmansuodatin','Polttoainesuodatin','Variaattorihihna','Jarrupalat','Jarruneste','Jäähdytysneste','Akku tarkistettu','Valot tarkistettu','Pyyhkijät','Rengaspaineet'],fix:landFix},
    atv:{ev:['Huolto','Vuosihuolto','Muu huolto','Renkaiden vaihto','Katsastus','Korjaus ja osan vaihto','Pesu ja hoito'],svc:['Moottoriöljy','Öljynsuodatin','Ilmansuodatin','Sytytystulpat','Vaihteistoöljy','Vetopyörästöjen öljyt','Variaattorihihna','Jarrupalat','Jarruneste','Jäähdytysneste','Rasvaus','Rengaspaineet'],fix:landFix},
    sled:{ev:['Huolto','Kausihuolto','Muu huolto','Korjaus ja osan vaihto','Pesu ja hoito','Kesäsäilytykseen','Käyttöönotto syksyllä'],svc:['Moottoriöljy','Sytytystulpat','Variaattorihihna','Variaattorin puhdistus','Ketjukotelon öljy','Telamaton kiristys','Liukupalat','Suksien kulutusraudat','Jarrupalat','Jarruneste','Jäähdytysneste','Rasvaus'],fix:[...landFix,'Telamatto','Sukset']},
    boat:{ev:['Huolto','Kausihuolto','Muu huolto','Korjaus ja osan vaihto','Venehoito','Vesillelasku','Nosto talvisäilytykseen'],svc:['Moottoriöljy','Öljynsuodatin','Polttoainesuodatin','Sytytystulpat','Vetolaitteen öljy','Siipipyörä','Anodit','Potkuri tarkistettu','Jäähdytysneste','Ohjauksen voitelu','Akku tarkistettu','Pilssipumppu tarkistettu'],fix:['Moottori','Vetolaite ja potkuri','Polttoainejärjestelmä','Ohjaus','Sähkö ja valot','Runko ja kansi','Takila ja purjeet']},
    tractor:{ev:['Huolto','Vuosihuolto','Muu huolto','Renkaiden vaihto','Katsastus','Korjaus ja osan vaihto','Pesu ja hoito','Talvisäilytykseen','Käyttöönotto keväällä'],svc:['Moottoriöljy','Öljynsuodatin','Ilmansuodatin','Polttoainesuodatin','Hydrauliöljy','Hydrauliöljyn suodatin','Vaihteistoöljy','Jäähdytysneste','Rasvaus','Terien teroitus','Hihnat','Akku tarkistettu'],fix:[...landFix,'Hydrauliikka','Leikkuulaite']},
    other:{ev:['Huolto','Vuosihuolto','Muu huolto','Renkaiden vaihto','Korjaus ja osan vaihto','Pesu ja hoito','Talvisäilytykseen','Käyttöönotto keväällä'],svc:['Moottoriöljy','Ilmansuodatin','Sytytystulpat','Polttoainesuodatin','Pyöränlaakerit','Jarrujen säätö','Valot tarkistettu','Rengaspaineet','Rasvaus','Akku tarkistettu'],fix:[...landFix,'Kytkentälaite']}
  };
  const allItems=[...new Set([...checkItems,...Object.values(itemSets).flat(),...Object.values(kindPlan).flatMap(k=>[...k.svc,...k.fix]),...Object.values(careSets).flat()])];
  // Old car types (before v0.29): which new group they belong to. Only renamed ones change their shown name.
  const oldGroup={'Moottoriöljyn vaihto':'Muu huolto','Jarruhuolto':'Muu huolto','Ilmansuodattimen vaihto':'Muu huolto','Pyyhkijänsulkien vaihto':'Muu huolto','Akun vaihto':'Muu huolto','Polttimon vaihto':'Muu huolto','Korjaus':'Korjaus ja osan vaihto','Osan vaihto':'Korjaus ja osan vaihto','Pesu ja vahaus':'Autohoito'};
  const renamed={'Korjaus':'Korjaus ja osan vaihto','Osan vaihto':'Korjaus ja osan vaihto','Pesu ja vahaus':'Autohoito'};
  // Illustrative reminder interval. Presented as a user's own setting, never as manufacturer guidance.
  // Muu huolto counts as a service (resets the service estimate) only when engine oil was changed (decision 26.10.2026).
  const isService=window.AjouraAnalytics.isService;
  // Other kinds (v0.31): renamed old types and the job list for each type. Old service-like types use the kind's service list.
  const planOf=c=>kindPlan[c.kind]||kindPlan.other,careOf=c=>c.kind==='boat'?'Venehoito':'Pesu ja hoito';
  const oldKindSvc=['Moottoriöljyn vaihto','Ilmansuodattimen vaihto','Akun vaihto','Jarruhuolto','Ketjun huolto','Variaattorihihnan vaihto','Telamaton vaihto','Liukupalojen vaihto','Siipipyörän vaihto','Perämoottorin huolto','Hydrauliöljyn vaihto','Terien teroitus'];
  const dispType=(c,t)=>isCar(c)?renamed[t]||t:t==='Pesu ja vahaus'?careOf(c):renamed[t]||t;
  const kindItems=(c,t)=>{const p=planOf(c);return isService({type:t})||t==='Muu huolto'||oldKindSvc.includes(t)?p.svc:t==='Korjaus ja osan vaihto'?p.fix:careSets[t]||(t==='Pohjamaalaus'?careSets.Venehoito:itemSets[t]&&/^(Renkaiden vaihto|Katsastus)$/.test(t)?itemSets[t]:[]);};
  const itemsFor=(c,t)=>!t?[]:!isCar(c)?kindItems(c,dispType(c,t)):itemSets[t]||itemSets[oldGroup[t]]||checkItems;
  // Order of the body-type picker; names come from car-render.js.
  const bodyOrder=['suv','wagon','sedan','hatchback','coupe','cabrio','van','panel','motorhome','pickup'];
  const guidance={
    'car-order':['06 / 06','Ajoneuvojen järjestys','Paina ajoneuvoa pitkään ja vedä se haluamaasi kohtaan.'],
    launcher:['01 / 06','Avaa sovellus.','Napauta puhelimen aloitusnäytöllä AJOURA-kuvaketta. Puhelimen alareunan palkista pääset takaisin aloitusnäyttöön.'],
    welcome:['02 / 06','Aloita käyttö.','Aloita suomenkielinen sovellus. Ilman kirjautumista tiedot tallentuvat vain tähän laitteeseen.'],
    home:['06 / 06','Oma etusivu.','Etusivu näyttää, mitä tänään kannattaa huomioida, jokaisen ajoneuvon seuraavan huollon ja pikanapit tankkaukseen ja merkintään. Huoltovälin säädät kohdasta Valikko → Asetukset.'],
    newcar:['03 / 06','Lisää oma auto.','Valitse rekisteritunnus tai käsin syöttäminen. Ensin auton tiedot, sitten mallin korimalli ja väri. Kokeile esimerkkitunnusta LMN-456.'],
    vehicle:['04 / 06','Auton päiväkirja.','Tässä on autosi oma historia. Paina Lisää merkintä ja kirjaa vaikka viimeisin huolto.'],
    event:['04 / 06','Yksityiskohdat tallessa.','Päivämäärä, mittarilukema ja muistiinpanot yhdessä näkymässä. Palaa historiaan vasemman yläkulman nuolesta.'],
    add:['05 / 06','Ensimmäinen merkintä.','Valitse tapahtuma, päivämäärä ja mittarilukema. Tallennuksen jälkeen merkintä löytyy auton historiasta.'],
    report:['04 / 06','Huoltohistoriaraportti.','Koko historia yhdellä sivulla. Tallenna se PDF-tiedostoksi vaikka auton myyntiä varten.'],
    notes:['04 / 06','Muistiinpanot.','Kirjaa auton pienet asiat talteen: renkaiden koot, hallipaikka, varaosanumerot. Jokainen muistiinpano saa päivämäärän.'],
    fuel:['04 / 06','Tankkaus.','Valitse ajoneuvo ja kirjaa tankkaukset tai lataukset. AJOURA näyttää kulutuksen kehityksen sekä polttoainekulut kuukausittain ja vuosittain.'],
    owner:['04 / 06','Omistajanvaihdos.','Kirjaa vaihdos historiaan, anna raportti ostajalle ja poista auto halutessasi.'],
    caredit:['04 / 06','Auton tiedot.','Korjaa tunnus, malli, kilometrit, käyttövoima tai ulkonäkö.'],
    edit:['05 / 06','Tarkenna merkintää.','Lisää jälkikäteen kilometrit, kulut, tehdyt toimenpiteet, kuitit ja kuvat.'],
    help:['06 / 06','Apua käyttöön.','Yleisimmät kysymykset valmiine vastauksineen. Hakukenttä löytää vastauksen nopeasti.'],
    me:['06 / 06','Varmuuskopio ja tiedot.','Tallenna tiedot tiedostoon ja palauta ne uudessa puhelimessa. Täältä voit myös poistaa kaikki tiedot.'],
    reports:['06 / 06','Raportit.','Jokaisen ajoneuvon huoltohistoriaraportti samassa paikassa. Avaa raportti ja tallenna se PDF-tiedostoksi.'],
    tips:['06 / 06','Kausi- ja huoltovinkit.','Vuodenajan vinkit vaihtuvat itsestään. Lisäksi jokaisen ajoneuvon omat huoltovinkit yhdessä paikassa.'],
    menu:['06 / 06','Valikko.','Asetukset, varmuuskopio, ohjeet ja palaute.'],
    settings:['06 / 06','Asetukset.','Huoltomuistutuksen väli, kieli ja ulkoasu.'],
    theme:['06 / 06','Teeman valinta.','Valitse sovelluksen ulkoasu: Alkuperäinen, Auto, Eko, Sininen ajoura tai Premium.'],
    feedback:['06 / 06','Anna palautetta.','Kerro, mikä toimi ja mikä ei. Palaute menee AJOURAn tekijöille.']
  };
  const guideStep={notes:'vehicle',launcher:'launcher',welcome:'welcome',home:'home',help:'home',tips:'home',newcar:'newcar',vehicle:'vehicle',event:'vehicle',add:'add',edit:'add',report:'vehicle',fuel:'vehicle',caredit:'vehicle',owner:'vehicle',me:'home',reports:'home',menu:'home',settings:'home',theme:'home',feedback:'home'};
  // Installed (home-screen) mode keeps data on this device only; the website demo stays in memory.
  const installed=document.documentElement.classList.contains('standalone'),storeKey='ajoura-app-v2';
  // 0.45 (AJ-25): on iPhone and iPad the home-screen app does not share data with Safari, so the texts differ there.
  const ios=/iP(hone|ad|od)/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
  // New ids end in a short tag of this device, so entries made on the phone and on the website never share an id when they sync.
  const devTag=(()=>{let d='';try{d=localStorage.getItem('ajoura-device')||'';if(!/^[a-z0-9]{4}$/.test(d)){d=Math.random().toString(36).slice(2,6).padEnd(4,'0');localStorage.setItem('ajoura-device',d);}}catch(e){d='';}return d;})();
  const uid=prefix=>prefix+(++sequence)+(devTag?'-'+devTag:'');
  const validAtt=a=>a===undefined||(Array.isArray(a)&&a.length<=12&&a.every(x=>typeof x==='string'&&/^data:image\/jpeg;base64,[\w+/=]+$/.test(x)));
  // Who did the work (0.38): {t:'self'|'shop'|'other', n name, tel, mail, addr, yt business id}. Entry times (0.38): created and updated, ISO strings from the phone's clock.
  const byLim={n:80,tel:30,mail:100,addr:120,yt:12},validBy=b=>b===undefined||(!!b&&typeof b==='object'&&!Array.isArray(b)&&['self','shop','other'].includes(b.t)&&Object.keys(b).every(k=>k==='t'||(k in byLim&&typeof b[k]==='string'&&b[k].length<=byLim[k])));
  const validStamp=v=>v===undefined||(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(v)&&Number.isFinite(Date.parse(v)));
  const numOrEmpty=v=>v===undefined||v===''||(typeof v==='string'&&Number.isFinite(Number(v))&&Number(v)>=0);
  const validCar=c=>c&&(c.gen===undefined||Number.isInteger(c.gen))&&(c.photo===undefined||(typeof c.photo==='string'&&/^data:image\/jpeg;base64,[\w+/=]+$/.test(c.photo)))&&/^[\w-]{1,40}$/.test(c.id)&&typeof c.name==='string'&&(c.nick===undefined||typeof c.nick==='string')&&(c.kind===undefined||c.kind==='car'?window.AjouraCar.bodies.includes(c.body):typeof c.kind==='string'&&typeof c.body==='string'&&(!window.AjouraKinds||(window.AjouraKinds.list.some(k=>k.id===c.kind)&&window.AjouraKinds.types(c.kind).includes(c.body))))&&(c.engine===undefined||(typeof c.engine==='string'&&c.engine.length<=40))&&typeof c.plate==='string'&&Number.isInteger(c.year)&&Number.isSafeInteger(c.km)&&Array.isArray(c.events)&&c.events.every(e=>e&&/^[\w-]{1,40}$/.test(e.id)&&typeof e.type==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&(e.km===null||Number.isSafeInteger(e.km))&&(e.parts===undefined||(Array.isArray(e.parts)&&e.parts.length<=30&&e.parts.every(x=>x&&typeof x.name==='string'&&typeof x.qty==='string'&&typeof x.price==='string')))&&(e.items===undefined||(Array.isArray(e.items)&&e.items.every(i=>allItems.includes(i))))&&validAtt(e.photos)&&validAtt(e.receipts)&&validBy(e.by)&&validStamp(e.created)&&validStamp(e.updated))&&(c.notes===undefined||(typeof c.notes==='string'&&c.notes.length<=5000))&&validAtt(c.gallery)&&(c.memos===undefined||(Array.isArray(c.memos)&&c.memos.length<=300&&c.memos.every(m=>m&&/^[\w-]{1,40}$/.test(m.id)&&/^\d{4}-\d{2}-\d{2}$/.test(m.date)&&typeof m.text==='string'&&m.text.length<=5000&&(m.title===undefined||(typeof m.title==='string'&&m.title.length<=80)))))&&(c.fuels===undefined||(Array.isArray(c.fuels)&&c.fuels.length<=2000&&c.fuels.every(validFill)));
  const validFill=f=>f&&(f.grade===undefined||(typeof f.grade==='string'&&f.grade.length<=24))&&/^[\w-]{1,40}$/.test(f.id)&&/^\d{4}-\d{2}-\d{2}$/.test(f.date)&&Number.isSafeInteger(f.km)&&typeof f.qty==='number'&&f.qty>0&&f.qty<=500&&(f.cost===null||(typeof f.cost==='number'&&f.cost>=0&&f.cost<=5000))&&typeof f.full==='boolean'&&(f.cur===undefined||(/^[A-Z]{3}$/.test(f.cur)&&typeof f.amt==='number'&&typeof f.rate==='number'))&&(f.amt===undefined||(typeof f.amt==='number'&&f.amt>=0&&f.amt<=100000))&&(f.rate===undefined||(typeof f.rate==='number'&&f.rate>0&&f.rate<1000))&&(f.country===undefined||/^[A-Z]{2}$/.test(f.country))&&(f.est===undefined||typeof f.est==='boolean')&&(f.skip===undefined||f.skip===true)&&(f.el===undefined||f.el===true);
  const defaultProfile={name:'',months:12,km:15000};
  const validProfile=p=>p&&typeof p.name==='string'&&p.name.length<=24&&Number.isInteger(p.months)&&p.months>=1&&p.months<=36&&Number.isInteger(p.km)&&p.km>=1000&&p.km<=60000;
  const tidy=list=>{if(Array.isArray(list))for(const c of list)if(c&&Array.isArray(c.fuels))c.fuels=c.fuels.filter(validFill);return list;};
  // A car that no longer passes the checks is left out instead of emptying the whole garage; the raw copy is kept aside.
  const dropBad=(data,raw)=>{if(data&&Array.isArray(data.cars)&&!data.cars.every(validCar)){try{localStorage.setItem('ajoura-rikki-'+Date.now(),raw||JSON.stringify(data));}catch(e){}data.cars=data.cars.filter(validCar);}return data;};
  function loadSaved(){try{const raw=localStorage.getItem(storeKey),data=dropBad(JSON.parse(raw),raw);if(data&&Array.isArray(tidy(data.cars))&&data.cars.every(validCar)&&Number.isSafeInteger(data.sequence)&&validProfile(data.profile))return data;}catch(e){}return null;}
  // The whole garage is kept in IndexedDB, which has room for hundreds of photos and receipts. localStorage keeps a
  // mirror (without images when it is full), so an older copy of the app or a blocked IndexedDB still finds the data.
  const idb=(()=>{let db=null;const open=()=>db||(db=new Promise((ok,no)=>{try{const r=indexedDB.open('ajoura',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);}catch(e){no(e);}}));
    const run=(mode,fn)=>open().then(d=>new Promise((ok,no)=>{const t=d.transaction('kv',mode),r=fn(t.objectStore('kv'));t.oncomplete=()=>ok(r.result);t.onerror=t.onabort=()=>no(t.error);}));
    return {get:k=>run('readonly',s=>s.get(k)),set:(k,v)=>run('readwrite',s=>s.put(v,k)),del:k=>run('readwrite',s=>s.delete(k))};})();
  let idbReady=false,idbWorks=false,touched=false,applying=false;
  const noImages=c=>({...c,photo:undefined,gallery:undefined,events:c.events.map(e=>({...e,photos:undefined,receipts:undefined}))});
  // The image-free mirror can be newer than IndexedDB (app closed before IndexedDB finished): keep its entries, take the images.
  const withPics=(list,from)=>list.map(c=>{const o=from.find(x=>x.id===c.id);if(!o)return c;const n={...c,events:c.events.map(e=>{const p=o.events.find(x=>x.id===e.id);return p?{...e,...(p.photos&&!e.photos?{photos:p.photos}:{}),...(p.receipts&&!e.receipts?{receipts:p.receipts}:{})}:e;})};if(o.photo&&!n.photo)n.photo=o.photo;if(o.gallery&&!n.gallery)n.gallery=o.gallery;return n;});
  function mirror(state){try{localStorage.setItem(storeKey,JSON.stringify(state));return true;}catch(e){}try{localStorage.setItem(storeKey,JSON.stringify({...state,lite:true,cars:state.cars.map(noImages)}));}catch(e){}return false;}
  function persist(){window.AjouraCarPhoto?.prune(cars.flatMap(c=>[c.photo,...(c.gallery||[])].filter(Boolean)));touched=true;if(window.AjouraSync&&!applying)window.AjouraSync.changed();const state={cars,sequence,profile,at:Date.now()};const full=mirror(state);if((idbReady&&!idbWorks)||(saved&&saved.lite&&!idbReady))return full;idb.set(storeKey,state).then(()=>{idbWorks=true;},()=>{idbWorks=false;});return full||idbWorks||!idbReady;}
  // Backup reminder: data lives only on this device, so nudge a backup a week after the first entries and monthly after that.
  const backupKey='ajoura-backup-at',sinceKey='ajoura-since',stamp=k=>{try{return Number(localStorage.getItem(k))||0;}catch(e){return 0;}};
  function backupDue(){if(!cars.some(c=>!c.sample&&(c.events.length||(c.fuels||[]).length)))return false;const last=stamp(backupKey),since=stamp(sinceKey),day=864e5;
    if(!since){try{localStorage.setItem(sinceKey,String(Date.now()));}catch(e){}return false;}return last?Date.now()-last>30*day:Date.now()-since>7*day;}
  const saved=loadSaved();
  const noName=p=>({...p,name:''});
  let loginNote=false;let cars=saved?saved.cars:[],sequence=saved?saved.sequence:0,profile=saved?noName(saved.profile):{...defaultProfile},notice='',draft=null,lookup=null;
  // 0.116: kirjautuneena autot ja merkinnät tallentuvat myös pilveen (sync.js); kuvat ja kuitit vain laitteeseen.
  const signedIn=()=>!!(window.AjouraSync&&window.AjouraSync.enabled&&window.AjouraSync.signedIn());
  const keepNote=()=>signedIn()?'Tiedot tallentuvat tähän laitteeseen ja tiliisi pilveen.':'Tiedot tallentuvat vain tähän laitteeseen.';
  const screen=document.getElementById('app-screen'),glass=document.querySelector('.device-glass');
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=value=>Number(value).toLocaleString('fi-FI',{maximumFractionDigits:2});
  const date=value=>new Intl.DateTimeFormat('fi-FI').format(new Date(value+'T12:00:00'));
  const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const addMonths=window.AjouraAnalytics.addMonths;
  const newest=(a,b)=>b.date.localeCompare(a.date)||b.km-a.km;
  const maxKm=c=>Math.max(0,...c.events.map(e=>e.km).filter(k=>k!==null),...(c.fuels||[]).map(f=>f.km));
  const costOf=events=>events.reduce((sum,e)=>sum+(e.cost!==''&&e.cost!=null&&Number.isFinite(Number(e.cost))?Number(e.cost):0),0);
  const Car=window.AjouraCar;
  // Render proportions follow the real make/model size class and the model year's styling era.
  const shapeOf=(c,body=c.body,gen=c.gen)=>{const M=window.AjouraModels,m=M.parse(c.name);return m.brand?M.shape(m.brand,m.model,body,c.year,gen):{year:Number(c.year)||undefined};};
  const colorName=hex=>(Car.colors.find(([,v])=>v===hex)||['Oma väri'])[0];
  const carName=c=>c.nick||c.name;
  // Vehicle kinds other than cars (vehicles.js). A car has no kind field, so existing data stays as it is.
  const Kinds=window.AjouraKinds,isCar=c=>!c.kind||c.kind==='car'||!Kinds,hourly=c=>!isCar(c)&&Kinds.unit(c.kind)==='h',ku=c=>hourly(c)?'h':'km';
  const art=(c,label)=>isCar(c)?Car.render(c.body,c.color,label,shapeOf(c)):Kinds.render(c.kind,c.body,c.color,label),typeOf=c=>isCar(c)?Car.names[c.body]:Kinds.typeName(c.kind,c.body),plateTxt=c=>escape(c.plate||typeOf(c)),meterLabel=c=>hourly(c)?'Tuntimittari (h)':'Mittarilukema (km)';
  const ownPhoto=source=>window.AjouraCarPhoto?.display(source)||source;
  const vehicleImage=c=>c.photo?`<div class="car-photo"><img src="${ownPhoto(c.photo)}" alt="${escape(carName(c))}, oma kuva"></div>`:`<div class="car-stage">${art(c,escape(carName(c))+', tyylitelty malli')}</div>`;
  // Finnish plates: 1–3 letters, a dash and 1–3 digits (ABC-123). The mask keeps typing in that shape.
  const plateOk=v=>/^[A-ZÅÄÖ]{1,3}-\d{1,3}$/.test(v);
  const maskPlate=value=>{const v=String(value).toUpperCase().replace(/[^A-ZÅÄÖ0-9]/g,''),letters=(v.match(/^[A-ZÅÄÖ]{0,3}/)||[''])[0],digits=letters?v.slice(letters.length).replace(/\D/g,'').slice(0,3):'';return letters+(digits||/-$/.test(value)&&letters.length?'-'+digits:'');};
  const normalPlate=value=>{const v=String(value).toUpperCase().replace(/\s+/g,'');return /^[A-ZÅÄÖ]{1,3}\d{1,3}$/.test(v)?v.replace(/^([A-ZÅÄÖ]+)/,'$1-'):v;};
  // 0.103 (Niklas): the AJOURA logo only on the home screen (top(true)); elsewhere the top is only Aloitussivu with
  // TESTIVERSIO under it at the right edge, beside the page title (.app-top.bare, app.css), so the page starts higher.
  // The welcome screen keeps the top on its own row (top('row')): its language and theme buttons sit under it.
  const top=(brand=false)=>brand===true?'<div class="app-top"><img class="app-brand" src="logo.svg" width="640" height="198" alt="AJOURA"><span class="demo-label">TESTIVERSIO</span></div>':`<div class="app-top ${brand==='row'?'row':'bare'}"><span class="demo-label">TESTIVERSIO</span></div>`;
  const back=(target,label)=>`<a class="app-back nav-back" href="#${target}">← ${label}</a>`;
  const compact=document.documentElement.classList.contains('fullscreen'),startView=saved?'home':installed||compact?'welcome':'launcher';
  const route=()=>{let [view=startView,id='',eventId='']=(location.hash.slice(1)||startView).split('/');if(installed&&view==='launcher')view='home';if(compact&&view==='launcher')view='welcome';return {view,id,eventId};};
  const go=target=>{if(location.hash==='#'+target)render();else location.hash=target;};
  const svg=paths=>`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const icons={palette:'<path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.1-4-7.5-9-7.5z"/><circle cx="7.5" cy="11.5" r="1.2"/><circle cx="10.5" cy="7.5" r="1.2"/><circle cx="15" cy="8" r="1.2"/>',doc:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6"/><path d="M12 17.2h.01"/>',
    wrench:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    oil:'<path d="M12 3.5s5.5 6 5.5 10a5.5 5.5 0 0 1-11 0c0-4 5.5-10 5.5-10z"/>',
    filter:'<path d="M4 5h16l-6 7.5V18l-4 2v-7.5z"/>',
    tyre:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    inspection:'<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="m9 12 2 2 4-4"/>',
    brake:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3"/>',
    repair:'<path d="m14 4 6 6-3 3-6-6zM11 7l-7 7 3 3 7-7"/><path d="m4 20 3-3"/>',
    part:'<path d="M5 8h13l-3-3M19 16H6l3 3"/>',
    gauge:'<path d="M4 17a8 8 0 1 1 16 0"/><path d="m12 17 4-5"/>',
    note:'<path d="M6 3.5h9l3 3V20.5H6z"/><path d="M9 11h6M9 15h6"/>',
    home:'<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/>',
    car:'<path d="M4 16v-4l2-5h12l2 5v4z"/><path d="M4 16v2.5M20 16v2.5M7 13h1.5M15.5 13H17"/>',
    user:'<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    leaf:'<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z"/><path d="M2 21c0-3 1.9-5.4 5.1-6C9.5 14.5 12 13 13 12"/>',
    snow:'<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="m9.5 4.5 2.5 2 2.5-2M9.5 19.5l2.5-2 2.5 2"/>',
    lock:'<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',spark:'<path d="M11 4.5 12.8 9.2 17.5 11 12.8 12.8 11 17.5 9.2 12.8 4.5 11 9.2 9.2z"/><path d="M18 3.5v4M16 5.5h4M18.5 16.5v3M17 18h3"/>',
    check:'<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.7 2.7L16.5 9.5"/>',
    cal:'<rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/><circle cx="12" cy="14.5" r="1.6"/>',
    fuel:'<path d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4h6A1.5 1.5 0 0 1 14 5.5V20M4 20h11M5 10h9"/><path d="M14 8l3 2.5V17a1.5 1.5 0 0 0 3 0V9l-2.5-2.5"/>',
    bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5h4"/>',
    chart:'<path d="M4.5 19.5h15"/><path d="M7.5 16v-4.5M12 16V6.5M16.5 16V9.5"/>',
    more:'<circle cx="5.5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
    gear:'<path d="M4 7.5h9M17 7.5h3M4 16.5h3M11 16.5h9"/><circle cx="15" cy="7.5" r="2"/><circle cx="9" cy="16.5" r="2"/>',
    save:'<path d="M12 4v10"/><path d="m8 10 4 4 4-4"/><path d="M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/>',
    play:'<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5 3.5-5 3.5z"/>',
    chat:'<path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 3.5v-3.5h.5a2 2 0 0 1-2-2z"/>',
    share:'<circle cx="17" cy="6" r="2.3"/><circle cx="7" cy="12" r="2.3"/><circle cx="17" cy="18" r="2.3"/><path d="m9 10.9 6-3.6M9 13.1l6 3.6"/>',
    camera:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    send:'<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
    mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>'
  };
  const iconFor={'Huolto':'wrench','Vuosihuolto':'wrench','Moottoriöljyn vaihto':'oil','Ilmansuodattimen vaihto':'filter','Renkaiden vaihto':'tyre','Katsastus':'inspection','Jarruhuolto':'brake','Korjaus':'repair','Osan vaihto':'part','Muu huolto':'wrench','Kausihuolto':'wrench','Korjaus ja osan vaihto':'repair','Mittarilukeman päivitys':'gauge','Omistajanvaihdos':'user'};
  const eventIcon=type=>svg(icons[iconFor[type]||'note']);
  const kmPart=(e,c)=>e.km===null?'':` · ${number(e.km)} ${c?ku(c):'km'}`;
  // Bottom tabs (22.10.2026; Ajoneuvot removed 26.10.2026, v0.28, because it repeated the home screen): Koti, Raportit
  // and Valikko. A vehicle page belongs to Koti, and old #vehicles links open the home screen. Settings, backup, help and feedback open from
  // Valikko as sub-pages, and the Valikko tab stays lit on them. Old #me and #help links still work.
  const menuViews=['menu','me','help','tips','settings','theme','feedback'],tabViews=['home','vehicle','event','fuel','reports',...menuViews];
  const tabOf=v=>['vehicle','event'].includes(v)?'home':menuViews.includes(v)?'menu':v,here=' aria-current="page"';
  // 0.68: the main tabs show only icons (the name stays as aria-label for screen readers); the fuel tab's icon is a pump
  // with a bolt, since fuel and charging are logged on the same tab.
  const fuelTabIcon='<path d="M3.5 20V5.5A1.5 1.5 0 0 1 5 4h6a1.5 1.5 0 0 1 1.5 1.5V20M2.5 20h11M3.5 10h9"/><path d="M19 5l-3.2 7h3L17.200 19l4-8.200h-3z"/>';
  // 0.75: the capsule sits on a dock (app.css .tab-dock) so content never shows around or under it.
  // 0.107 (Niklas): one floating ＋ button (FAB) for the three main tabs. It sits in the same sticky dock as the tab bar,
  // just above it (app.css .tab-fab), so it follows the dock's real height and the iPhone safe area and never scrolls away.
  // Koti: the Lisää ajoneuvo form (#newcar). Tankkaus: the existing fill-up sheet (data-quickfuel, same as the old top
  // button, so the vehicle and kind shown on the tab are the defaults). Raportit: a small menu with Lisää huolto (#add)
  // and Lisää muistiinpano (#notes); with Kaikki ajoneuvot and several vehicles the vehicle is chosen first (rpCarSheet).
  let fabFuel=null;
  const fabPlus='<svg class="fab-plus" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>';
  function fab(view){
    if(view==='home')return `<a class="tab-fab" href="#newcar" aria-label="Lisää ajoneuvo" title="Lisää ajoneuvo">${fabPlus}</a>`;
    if(view==='fuel'&&fabFuel&&cars.some(c=>c.id===fabFuel.id))return `<button type="button" class="tab-fab fl-add" data-quickfuel="${fabFuel.id}" data-kind="${fabFuel.kind}" aria-label="${fabFuel.name}" title="${fabFuel.name}">${fabPlus}</button>`;
    if(view==='reports'&&cars.length)return `<div class="fab-menu" id="fab-menu" role="menu" aria-label="Lisää merkintä" hidden><button type="button" role="menuitem" data-fab-act="svc"><span class="fab-mi-ico" aria-hidden="true">${svg(icons.wrench)}</span><span>Lisää huolto</span></button><button type="button" role="menuitem" data-fab-act="memo"><span class="fab-mi-ico" aria-hidden="true">${svg(icons.note)}</span><span>Lisää muistiinpano</span></button></div><button type="button" class="tab-fab" data-fab-menu aria-haspopup="menu" aria-expanded="false" aria-controls="fab-menu" aria-label="Lisää merkintä" title="Lisää merkintä">${fabPlus}</button>`;
    return '';}
  const tabBar=view=>`<div class="tab-dock">${fab(view)}${window.AjouraAvatar.floating()}<nav class="tab-bar four main-tabs" aria-label="Sovelluksen valikko"><a href="#home" aria-label="Koti"${tabOf(view)==='home'?here:''}>${svg(icons.home)}</a><a href="#fuel" aria-label="Tankkaus ja lataus"${tabOf(view)==='fuel'?here:''}>${svg(fuelTabIcon)}</a><a href="#reports" aria-label="Raportit"${tabOf(view)==='reports'?here:''}>${svg(icons.chart)}</a><a href="#menu" aria-label="Valikko"${tabOf(view)==='menu'?here:''}>${svg(icons.more)}</a></nav></div>`;
  // Help tab: the most common questions with ready answers, filtered by a search field.
  const faq=[
    ['Miten lisään auton?','Etusivu → sininen ＋ oikeassa alakulmassa. Valitse ensin merkki ja malli (tai hae rekisteritunnuksella), sitten korimalli ja väri. Mittarilukeman voit päivittää myöhemmin.'],
    ['Miten muutan ajoneuvojen järjestystä?','Pidä etusivulla ajoneuvon korttia painettuna, kunnes se kohoaa, ja vedä se haluamaasi kohtaan. Järjestys tallentuu heti ja säilyy myös varmuuskopiossa.'],
    ['Miten järjestän Tankkaus ja lataus -välilehden?','Pidä korttia, kaaviota tai listaa painettuna, kunnes se kohoaa, ja vedä se haluamaasi kohtaan. Järjestys tallentuu heti tähän laitteeseen. Alkuperäisen järjestyksen saat takaisin, kun napautat tunnusluvun kuvaketta ja valitset Palauta widgettien järjestys.'],
    ['Voiko tunnusluvulla olla oma aikaväli?','Voi. Napauta Tankkaus ja lataus -välilehdellä tunnusluvun sinistä kuvaketta ja valitse aikaväli, esimerkiksi Kuluva kuukausi tai Mukautettu. Kortti näyttää käyttämänsä aikavälin luvun alla. Käytä sivun aikaväliä palauttaa kortin seuraamaan sivun yläosan valintaa.'],
    ['Voinko lisätä moottoripyörän, veneen tai mopon?','Voit. Etusivu → sininen ＋ oikeassa alakulmassa ja valitse ensin ajoneuvolaji: auto, moottoripyörä, mopo, mopoauto, mönkijä, moottorikelkka, vene, traktori tai muu moottorilaite. Veneillä, traktoreilla ja muilla laitteilla seurataan käyttötunteja kilometrien sijaan.'],
    ['Miten kirjaan huollon tai korjauksen?','Avaa auto ja paina ＋ Lisää merkintä. Pakollisia ovat vain tyyppi ja päivämäärä. Kilometrit, kulut, tehdyt toimenpiteet, kuvat ja kuitit voit lisätä heti tai myöhemmin.'],
    ['Miten lisään kuitin tai kuvan?','Merkinnässä on erikseen Lisää kuvia ja Lisää kuitit. Voit ottaa kuvan kameralla tai valita sen kuvista. Kuvat pienennetään automaattisesti, jotta ne mahtuvat puhelimeen.'],
    ['Kuva ei lataudu. Mitä teen?','Kokeile toista kuvaa tai ota kuvasta kuvakaappaus ja lisää se. Jotkin kuvamuodot (esim. osa HEIC-kuvista) eivät aukea kaikissa selaimissa.'],
    ['Miten muokkaan tai poistan merkinnän?','Avaa merkintä aikajanalta. Muokkaa-, Tallenna PDF- ja Poista-painikkeet ovat merkinnän yläosassa. Kuvia ja kuitteja lisätään ja poistetaan Muokkaa-näkymässä.'],
    ['Miten saan huoltohistorian auton myyntiä varten?','Avaa Raportit-välilehti tai auto ja valitse Raportti. Tallenna PDF-raportti -painike tekee raportista PDF-tiedoston: puhelimessa avautuu jakovalikko, tietokoneella tiedosto latautuu.'],
    ['Seuraavan huollon arvio on väärin.','Huoltoväli on oletuksena 12 kuukautta. Vaihda se kohdasta Valikko → Asetukset → Huoltomuistutuksen väli. Arvio lasketaan viimeisimmästä huoltomerkinnästä.'],
    ['Rekisterihaku ei löytänyt autoani.','Rekisterihaku on vielä esimerkkiaineistoon perustuva demo. Valitse Syötä tiedot itse, niin pääset jatkamaan.'],
    ['Tallentuvatko tietoni?','Tiedot tallentuvat tähän laitteeseen, myös selaimessa. Jos kirjaudut sisään, autot, merkinnät, tankkaukset ja muistiinpanot tallentuvat myös pilveen ja siirtyvät uuteen laitteeseen; kuvat ja kuitit jäävät laitteeseen. Asenna sovellus kotivalikkoon ja ota välillä varmuuskopio, koska selain voi poistaa pitkään käyttämättömän sivun tiedot.'],
    ['Siirtyvätkö tiedot uuteen puhelimeen?','Kyllä, varmuuskopiolla. Valikko → Varmuuskopio ja tiedot → Tallenna varmuuskopio tallentaa tiedot tiedostoon. Siirrä tiedosto uuteen puhelimeen ja valitse siellä Palauta varmuuskopio.'],
    ['Miten saan huoltomuistutuksen puhelimeen?','Avaa auto ja paina Lisää muistutukset kalenteriin. Seuraavan huollon ja katsastuksen arviot tallentuvat puhelimen kalenteriin, ja kalenteri muistuttaa viikkoa ennen.'],
    ['Miten siirrän auton historian ostajalle?','Avaa auto → Omistajanvaihdos → Lähetä siirtotiedosto. Ostaja valitsee omassa AJOURAssaan Valikko → Varmuuskopio ja tiedot → Palauta varmuuskopio, ja historia siirtyy hänelle.'],
    ['Miten tankkauskirja toimii?','Avaa alavalikosta Tankkaus ja valitse ajoneuvo. Paina Uusi tankkaus ja kirjaa mittarilukema, litrat ja hinta. Kun tankkaat aina täyteen, AJOURA laskee keskikulutuksen, sen kehityksen kuukausittain ja ajon hinnan.'],
    ['Miten asennan AJOURAn puhelimeen?','iPhone: avaa sivu Safarilla → Jaa → Lisää Koti-valikkoon. Android: avaa Chromella → valikko ⋮ → Asenna sovellus.'],
    ['Sovellus näyttää vanhaa versiota.','Sulje sovellus kokonaan ja avaa se uudelleen. Uusi versio latautuu taustalla ja tulee käyttöön seuraavalla avauskerralla.'],
    ['Miten poistan kaikki tietoni?','Valikko → Varmuuskopio ja tiedot → Poista kaikki tiedot. Poisto koskee vain tätä laitetta, eikä sitä voi perua.']
  ];
  // Language and light/dark theme: per-device conveniences, chosen on the welcome screen or in settings.
  const prefGet=k=>{try{return localStorage.getItem(k)||'';}catch(e){return '';}},prefSet=(k,v)=>{try{localStorage.setItem(k,v);}catch(e){}};
  // Text that never reaches the DOM (calendar file, share sheet) goes through the language layer by hand.
  // 0.104: PDFs and files get no soft hyphens (a word-break hint for the screen, e.g. Medel\u00adförbrukning).
  const tl=s=>{const v=window.AjouraI18n?window.AjouraI18n.t(s):s;return typeof v==='string'?v.replace(/\u00ad/g,''):v;};
  const lang=()=>window.AjouraI18n?window.AjouraI18n.lang:'fi',theme=()=>prefGet('ajoura-theme')==='dark'?'dark':'light';
  // v0.110 Teemat (Asetukset → Teeman valinta): laitteen näkymäasetus localStorage ajoura-ulkoasu (ei varmuuskopiossa).
  // Alkuperäinen (id nykyinen, oletus) on sovelluksen alkuperäinen ilme, jossa myös tumma tila (ajoura-theme);
  // muiden teemojen värit ja piirteet ovat teemat.css:ssä (html[data-theme]). Sama valinta tehdään app.html:n alussa.
  const THEMES=[['nykyinen','Alkuperäinen','AJOURAn sininen perusilme. Myös tumma tila.','#f5f8fc'],['auto','Auto','Grafiitinharmaa ja kupari. Tumma ajoneuvokortti ja alavalikko.','#f5f4f2'],['eko','Eko','Raikas salvia ja metsänvihreä, pehmeät muodot.','#f3f7f2'],['blue-track','Sininen ajoura','Tumma laivastonsininen ja turkoosi korostus.','#091d30'],['premium','Premium','Lämmin hiekka ja terrakotta, pehmeä syvyys.','#f3ece6'],["garage", "Garage", "Tumma talli ja turkoosi korostus.", "#071110"],["copilot", "Copilot", "Syvä yönsininen ja laventeli.", "#0e1025"],["nordic", "Nordic", "Vaalea, rauhallinen ja pohjoismainen.", "#f3f7f5"],["journey", "Journey", "Metsänvihreä ja lämmin kulta.", "#101916"]];
  const look=()=>{const v=prefGet('ajoura-ulkoasu');return THEMES.some(x=>x[0]===v)?v:'nykyinen';};
  function applyLook(){const u=look(),h=document.documentElement,dark=u==='nykyinen'&&prefGet('ajoura-theme')==='dark';if(u==='nykyinen')h.removeAttribute('data-theme');else h.setAttribute('data-theme',u);h.classList.toggle('dark',dark);document.querySelector('meta[name=theme-color]')?.setAttribute('content',dark?'#0b1119':THEMES.find(x=>x[0]===u)[3]);}
  function setTheme(t){prefSet('ajoura-theme',t);applyLook();}
  applyLook();
  const seg=(name,cur,opts)=>`<div class="seg" role="group" aria-label="${name}">${opts.map(([v,l])=>`<button type="button" data-pref="${name}" data-value="${v}" aria-pressed="${v===cur}"${name==='Kieli'?' translate="no"':''}>${l}</button>`).join('')}</div>`;
  const prefsBar=compact=>compact&&look()==='nykyinen'?`<div class="prefs compact">${seg('Teema',theme(),[['light','☀︎'],['dark','☾']])}</div>`:'';
  // Teeman valinta: kortti per teema (havainnekuva, nimi, kuvaus). Napautus valitsee, Ota käyttöön vaihtaa teeman heti.
  let themeSel=null,themeDone='';
  const themeLabel=()=>{const u=look();return `<span>${THEMES.find(x=>x[0]===u)[1]}</span>${u==='nykyinen'?` · <span>${theme()==='dark'?'Tumma':'Vaalea'}</span>`:''}`;};
  function themePage(){const cur=[look(),theme()];if(!themeSel)themeSel=cur.slice();const [sel,mode]=themeSel;
    const card=([id,name,desc])=>{const on=sel===id,isCur=cur[0]===id,changed=on&&(id!==cur[0]||(id==='nykyinen'&&mode!==cur[1]));
      return `<div class="th-opt${on?' on':''}"><button type="button" class="th-pick" role="radio" aria-checked="${on}" data-th-pick="${id}"><img class="th-img" src="teemakuvat/${id}-pieni.webp" alt="" width="300" height="400" loading="lazy"><span class="th-txt"><strong${['garage','copilot','nordic','journey'].includes(id)?' translate="no"':''}>${name}</strong>${isCur?'<span class="th-cur">Käytössä</span>':''}<small>${desc}</small></span><span class="th-mark" aria-hidden="true">${on?svg(icons.check):''}</span></button><div class="th-more">${id==='nykyinen'?`<div class="seg" role="group" aria-label="Vaalea tai tumma">${[['light','☀︎ Vaalea'],['dark','☾ Tumma']].map(([v,l])=>`<button type="button" data-th-mode="${v}" aria-pressed="${on&&mode===v}">${l}</button>`).join('')}</div>`:''}<button type="button" class="link-button th-full" data-th-full="${id}">Näytä koko kuva</button>${changed?`<button type="button" class="app-button th-apply" data-th-apply>Ota käyttöön</button>`:''}${isCur&&themeDone===id?'<p class="success-note" role="status">Teema otettu käyttöön.</p>':''}</div></div>`;};
    return `${back('settings','Asetukset')}<h2 class="app-heading">Teeman valinta</h2><p class="app-subtitle">Valitse sovelluksen ulkoasu. Valinta koskee vain tätä laitetta, eivätkä tietosi muutu.</p><div class="th-list" role="radiogroup" aria-label="Teemat"><h3>AI-first-teemat</h3>${THEMES.filter(x=>['garage','copilot','nordic','journey'].includes(x[0])).map(card).join('')}<h3>Aiemmat teemat</h3>${THEMES.filter(x=>!['garage','copilot','nordic','journey'].includes(x[0])).map(card).join('')}</div><p class="app-fineprint th-note">Kuvat ovat havainnekuvia. Sovellus näyttää aina omat ajoneuvosi ja tietosi.</p>`;}
  function themeFull(id){const t=THEMES.find(x=>x[0]===id);if(!t)return;const d=document.createElement('dialog');d.className='att-viewer th-viewer';d.innerHTML=`<img src="teemakuvat/${id}.webp" alt="${escape(tl('Havainnekuva')+': '+tl(t[1]))}"><button type="button" class="app-button secondary">Sulje</button>`;document.body.appendChild(d);d.addEventListener('close',()=>d.remove());d.addEventListener('click',ev=>{if(ev.target===d||ev.target.closest('button'))d.close();});d.showModal();}
  function help(){return `${back('menu','Valikko')}<h2 class="app-heading">Ohjeet ja kysymykset</h2><p class="app-subtitle">Yleisimmät kysymykset ja vastaukset.</p><button class="app-button secondary help-guide" type="button" data-tutorial><span aria-hidden="true">▶</span> Katso käyttöönoton opas</button><label class="help-search"><span class="sr-only">Hae ohjeista</span><input type="search" id="help-search" placeholder="Hae, esim. kuitti tai raportti" autocomplete="off"></label><div class="faq-list">${faq.map(([q,a])=>`<details class="faq"><summary>${q}</summary><p>${a}</p></details>`).join('')}</div><p class="faq-empty" id="faq-empty" hidden>Ei osumia. Kokeile toista sanaa tai kysy meiltä.</p><div class="help-contact"><strong>Etkö löytänyt vastausta? Kerro meille.</strong><p>AJOURA on testivaiheessa, ja jokainen palaute auttaa.</p>${notice?`<p class="success-note" role="status">${escape(notice)}</p>`:''}${feedbackForm()}</div>`;}
  // Valikko → Kausi- ja huoltovinkit (v0.35): the season now, vehicles still without a tyre change, every vehicle's own
  // tips (the same list as the vehicle page) and the other seasons. Texts and their EN/SV are in tips.js.
  function tipsPage(){const T=window.AjouraTips,s=seasonNow(),tyre=s.tyre?tyreInfo():null,li=t=>`<li>${escape(t)}</li>`,parse=window.AjouraModels&&window.AjouraModels.parse;
    const todo=tyre?`<div class="season-todo"><strong>Renkaanvaihto kirjaamatta</strong>${tyre.todo.map(c=>`<a href="#add/${c.id}"><span>${escape(carName(c))}</span><span class="season-go">Kirjaa →</span></a>`).join('')}</div>`:'';
    const now=`<section class="season-card"><div class="season-head"><span class="event-symbol" aria-hidden="true">${svg(icons[s.icon])}</span><div><span class="mini-label">NYT AJANKOHTAISTA</span><h3>${s.title.fi}</h3><small>${s.when.fi}</small></div></div><ul>${s.items.map(t=>li(t.fi)).join('')}</ul>${todo}</section>`;
    const own=cars.map(c=>({c,list:T?T.forCar(c,parse):[]})).filter(x=>x.list.length);
    const per=own.length?`<h3 class="menu-h">Huoltovinkit ajoneuvoittain</h3><div class="faq-list">${own.map(({c,list})=>`<details class="faq tips-faq"><summary><span>${escape(carName(c))} <span class="tips-n">(<span>${list.length}</span>)</span></span></summary><ul>${list.map(li).join('')}</ul></details>`).join('')}</div>`:'';
    const others=(T&&T.seasons||[]).filter(x=>x.id!==s.id);
    const rest=others.length?`<h3 class="menu-h">Muut vuodenajat</h3><div class="faq-list">${others.map(x=>`<details class="faq tips-faq"><summary><span><span>${x.title.fi}</span> <span class="tips-n">${x.when.fi}</span></span></summary><ul>${x.items.map(t=>li(t.fi)).join('')}</ul></details>`).join('')}</div>`:'';
    return `${back('menu','Valikko')}<h2 class="app-heading">Kausi- ja huoltovinkit</h2><p class="app-subtitle">Vinkit vaihtuvat vuodenajan mukaan.</p>${now}${per}${rest}<p class="app-note">Yleisiä vinkkejä. Valmistajan huolto-ohjelma ja voimassa olevat säännöt ovat aina ensisijaisia.</p>`;}
  function nextService(){
    let next=null;
    for(const c of cars){const last=[...c.events].filter(isService).sort(newest)[0];if(!last)continue;const due=addMonths(last.date,profile.months);if(!next||due<next.due)next={c,last,due,dueKm:last.km===null||hourly(c)?null:last.km+profile.km};}
    return next;
  }
  // Decorative home-screen icons. Only the AJOURA icon is interactive.
  const homeApps=[['Kalenteri','#7d8fa6','<rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>'],['Kuvat','#8a99ab','<rect x="4" y="5" width="16" height="14" rx="2.5"/><path d="m4.5 17 5-5 4 4 2.5-2.5 3.5 3.5"/><circle cx="15.5" cy="9" r="1.4"/>'],['Kartat','#6f9a92','<path d="M12 20.5s6-5.6 6-10.5a6 6 0 0 0-12 0c0 4.9 6 10.5 6 10.5z"/><circle cx="12" cy="10" r="2.2"/>'],['Sää','#7f9fc4','<circle cx="12" cy="12" r="4"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6"/>'],['Musiikki','#a08ea8','<path d="M9 17.5V6l10-2v11.5"/><circle cx="7" cy="17.5" r="2.2"/><circle cx="17" cy="15.5" r="2.2"/>'],['Kello','#8d97a3','<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>'],['Asetukset','#8e98a2','<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.5M12 18v2.5M3.5 12H6M18 12h2.5M6 6l1.8 1.8M16.2 16.2 18 18M6 18l1.8-1.8M16.2 7.8 18 6"/>']];
  const dockApps=[['Puhelin','#5f9c7f','<path d="M7 4h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 5 6a2 2 0 0 1 2-2z"/>'],['Viestit','#6f8fc4','<path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 3.5v-3.5h.5a2 2 0 0 1-2-2z"/>'],['Selain','#7c97b3','<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16"/>'],['Kamera','#8a96a3','<path d="M4 8.5a2 2 0 0 1 2-2h2l1.5-2h5l1.5 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>']];
  const homeIcon=([name,tint,paths])=>`<span class="home-app" aria-hidden="true"><i style="--tint:${tint}">${svg(paths)}</i><small>${name}</small></span>`;
  function launcher(){const now=new Date(),day=new Intl.DateTimeFormat('fi-FI',{weekday:'long',day:'numeric',month:'long'}).format(now);return `<div class="launcher"><div class="home-clock"><strong>${String(now.getHours()).padStart(2,'0')}.${String(now.getMinutes()).padStart(2,'0')}</strong><span>${day}</span></div><div class="home-grid"><button class="home-app ajoura-app" type="button" data-launch aria-label="Avaa AJOURA-sovellus"><i><img src="mark.svg" alt="" width="64" height="64"></i><small>AJOURA</small></button>${homeApps.map(homeIcon).join('')}</div><p class="launch-hint"><span aria-hidden="true">↑</span> Napauta AJOURA-kuvaketta</p><div class="home-dock">${dockApps.map(homeIcon).join('')}</div></div>`;}
  let launchTimer=0;
  // The car on the opening screens: a Volvo wagon, light silver since v0.83 (blue until v0.82, Hannes 13.10.2026).
  const heroCar=label=>Car.render('wagon','#d5dbe2',label,window.AjouraModels?window.AjouraModels.shape('Volvo','V60','wagon',2020):undefined);
  // v0.83: receipts blown up by the car's slipstream fly into the logo (paths and timing in app.css, .rc).
  // v0.87: five smaller receipts puffed out of the exhaust with a little smoke.
  const introReceipts='<span class="intro-receipts" aria-hidden="true"><i class="rc"><i><i><svg class="rc-p" viewBox="0 0 26 38"><use href="#ajr-fuel"/></svg></i></i></i><i class="rc"><i><i><svg class="rc-p" viewBox="0 0 26 38"><use href="#ajr-serv"/></svg></i></i></i><i class="rc"><i><i><svg class="rc-p" viewBox="0 0 26 38"><use href="#ajr-fuel"/></svg></i></i></i><i class="rc"><i><i><svg class="rc-p" viewBox="0 0 26 38"><use href="#ajr-serv"/></svg></i></i></i><i class="rc"><i><i><svg class="rc-p" viewBox="0 0 26 38"><use href="#ajr-fuel"/></svg></i></i></i><svg class="rc-defs" width="0" height="0" aria-hidden="true"><defs><linearGradient id="ajr-paper" x1="0" x2="1"><stop offset="0" stop-color="#e9eef4"/><stop offset=".3" stop-color="#fff"/><stop offset=".72" stop-color="#fbfcfe"/><stop offset="1" stop-color="#dfe6ee"/></linearGradient><linearGradient id="ajr-fold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9d4e0" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".8"/></linearGradient><symbol id="ajr-fuel" viewBox="0 0 26 38"><path d="M1.00 1.80 L4.00 0.60 L7.00 1.80 L10.00 0.60 L13.00 1.80 L16.00 0.60 L19.00 1.80 L22.00 0.60 L25.00 1.80 Q25.7 19 25 36.2 L22.00 37.40 L19.00 36.20 L16.00 37.40 L13.00 36.20 L10.00 37.40 L7.00 36.20 L4.00 37.40 L1.00 36.20 Q0.3 19 1 1.8Z" transform="translate(1.1 1.5)" fill="#0b2846" opacity=".16"/><path d="M1.00 1.80 L4.00 0.60 L7.00 1.80 L10.00 0.60 L13.00 1.80 L16.00 0.60 L19.00 1.80 L22.00 0.60 L25.00 1.80 Q25.7 19 25 36.2 L22.00 37.40 L19.00 36.20 L16.00 37.40 L13.00 36.20 L10.00 37.40 L7.00 36.20 L4.00 37.40 L1.00 36.20 Q0.3 19 1 1.8Z" fill="url(#ajr-paper)" stroke="#c3cedb" stroke-width=".35"/><path d="M1.2 19.6h23.6v2.4H1.2z" fill="url(#ajr-fold)"/><g fill="#1464e8"><rect x="10.6" y="3.4" width="3.6" height="4.6" rx=".5"/><rect x="11.2" y="4" width="2.4" height="1.5" fill="#fff"/><path d="M14.2 4.6h1.1l.9 1v2.2a.55.55 0 0 0 1.1 0V5.2l-.8-.9" fill="none" stroke="#1464e8" stroke-width=".5"/></g><rect x="8" y="10" width="10" height="1.3" rx=".4" fill="#30465e"/><g fill="#9fb0c2"><rect x="4" y="13" width="9" height=".8" rx=".3"/><rect x="19" y="13" width="3" height=".8" rx=".3"/><rect x="4" y="15" width="7" height=".8" rx=".3"/><rect x="18.5" y="15" width="3.5" height=".8" rx=".3"/><rect x="4" y="17" width="10" height=".8" rx=".3"/><rect x="19.5" y="17" width="2.5" height=".8" rx=".3"/><rect x="4" y="23" width="8" height=".8" rx=".3"/><rect x="19" y="23" width="3" height=".8" rx=".3"/></g><path d="M4 26.3h18" stroke="#9fb0c2" stroke-width=".4" stroke-dasharray=".9 .6"/><rect x="4" y="27.5" width="4.5" height="1.3" rx=".3" fill="#30465e"/><text x="22" y="29.1" text-anchor="end" font-size="2.5" font-weight="700" fill="#22364c" font-family="ui-monospace,Menlo,monospace">64,90 €</text><path d="M5.0 30.6h0.5v3.4h-0.5zM5.8 30.6h0.8v3.4h-0.8zM7.2 30.6h0.3v3.4h-0.3zM7.8 30.6h0.3v3.4h-0.3zM8.5 30.6h0.3v3.4h-0.3zM9.4 30.6h0.3v3.4h-0.3zM10.0 30.6h0.3v3.4h-0.3zM10.7 30.6h0.8v3.4h-0.8zM11.8 30.6h0.3v3.4h-0.3zM12.4 30.6h0.8v3.4h-0.8zM13.5 30.6h0.3v3.4h-0.3zM14.1 30.6h0.3v3.4h-0.3zM15.0 30.6h0.8v3.4h-0.8zM16.1 30.6h0.3v3.4h-0.3zM16.7 30.6h0.3v3.4h-0.3zM17.4 30.6h0.8v3.4h-0.8zM18.5 30.6h0.3v3.4h-0.3zM19.4 30.6h0.5v3.4h-0.5zM20.5 30.6h0.3v3.4h-0.3z" fill="#2a3c50"/><rect x="6.5" y="34.5" width="13" height=".55" fill="#b3c0ce"/></symbol><symbol id="ajr-serv" viewBox="0 0 26 38"><path d="M1.00 1.80 L4.00 0.60 L7.00 1.80 L10.00 0.60 L13.00 1.80 L16.00 0.60 L19.00 1.80 L22.00 0.60 L25.00 1.80 Q25.7 19 25 36.2 L22.00 37.40 L19.00 36.20 L16.00 37.40 L13.00 36.20 L10.00 37.40 L7.00 36.20 L4.00 37.40 L1.00 36.20 Q0.3 19 1 1.8Z" transform="translate(1.1 1.5)" fill="#0b2846" opacity=".16"/><path d="M1.00 1.80 L4.00 0.60 L7.00 1.80 L10.00 0.60 L13.00 1.80 L16.00 0.60 L19.00 1.80 L22.00 0.60 L25.00 1.80 Q25.7 19 25 36.2 L22.00 37.40 L19.00 36.20 L16.00 37.40 L13.00 36.20 L10.00 37.40 L7.00 36.20 L4.00 37.40 L1.00 36.20 Q0.3 19 1 1.8Z" fill="url(#ajr-paper)" stroke="#c3cedb" stroke-width=".35"/><path d="M1.2 19.6h23.6v2.4H1.2z" fill="url(#ajr-fold)"/><path d="M15.6 3.3a2 2 0 0 0-2.5 2.6l-3 3a.7.7 0 0 0 1 1l3-3a2 2 0 0 0 2.6-2.5l-1.1 1.1-1-.3-.3-1z" fill="#19a6c9"/><rect x="8" y="10" width="10" height="1.3" rx=".4" fill="#30465e"/><g fill="#9fb0c2"><rect x="4" y="13" width="10" height=".8" rx=".3"/><rect x="18" y="13" width="4" height=".8" rx=".3"/><rect x="4" y="15" width="8" height=".8" rx=".3"/><rect x="19" y="15" width="3" height=".8" rx=".3"/><rect x="4" y="17" width="6" height=".8" rx=".3"/><rect x="18.5" y="17" width="3.5" height=".8" rx=".3"/><rect x="4" y="23" width="9" height=".8" rx=".3"/><rect x="18" y="23" width="4" height=".8" rx=".3"/></g><path d="M4 26.3h18" stroke="#9fb0c2" stroke-width=".4" stroke-dasharray=".9 .6"/><rect x="4" y="27.5" width="4.5" height="1.3" rx=".3" fill="#30465e"/><text x="22" y="29.1" text-anchor="end" font-size="2.5" font-weight="700" fill="#22364c" font-family="ui-monospace,Menlo,monospace">189,00 €</text><path d="M5.0 30.6h0.3v3.4h-0.3zM5.7 30.6h0.3v3.4h-0.3zM6.6 30.6h0.3v3.4h-0.3zM7.5 30.6h0.3v3.4h-0.3zM8.4 30.6h0.3v3.4h-0.3zM9.1 30.6h0.8v3.4h-0.8zM10.3 30.6h0.8v3.4h-0.8zM11.7 30.6h0.8v3.4h-0.8zM12.9 30.6h0.5v3.4h-0.5zM13.7 30.6h0.3v3.4h-0.3zM14.6 30.6h0.3v3.4h-0.3zM15.2 30.6h0.5v3.4h-0.5zM16.3 30.6h0.8v3.4h-0.8zM17.5 30.6h0.8v3.4h-0.8zM18.7 30.6h0.3v3.4h-0.3zM19.3 30.6h0.8v3.4h-0.8zM20.4 30.6h0.5v3.4h-0.5z" fill="#2a3c50"/><rect x="6.5" y="34.5" width="13" height=".55" fill="#b3c0ce"/></symbol></defs></svg></span>';
  const introHtml=label=>window.AjouraLaunch.html(label);
  // The intro starts paused until its images are decoded and two frames are painted.
  // The bounded wait also lets a slow device continue without getting stuck.
  const runIntro=(el,started)=>{el.classList.add('intro-wait');const imgs=[...el.querySelectorAll('img')].map(i=>i.decode?i.decode().catch(()=>{}):0);
    Promise.race([Promise.all(imgs),new Promise(r=>setTimeout(r,500))]).then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!el.isConnected)return;el.classList.remove('intro-wait');started();})));};
  function launch(icon){
    if(launchTimer)return;const quick=window.AjouraLaunch.duration()===200;if(!quick)icon.classList.add('launching');
    launchTimer=setTimeout(()=>{screen.innerHTML=introHtml('Testiversio');glass.classList.remove('launcher-mode');runIntro(screen.querySelector('.ai-intro'),()=>{launchTimer=setTimeout(()=>{launchTimer=0;go('welcome');},window.AjouraLaunch.duration());});},quick?0:260);
  }
  let welcomeStep='';
  function welcome(){
    const R=window.AjouraRoles,shopRole=R&&R.role()==='huolto',started=cars.some(c=>!c.sample);
    // Back on the start page after using the app: one tap continues where the user left off, nothing is lost.
    return top('row')+window.AjouraWelcome.render({prefs:prefsBar(true),content:`<div class="welcome-choices">${shopRole?'<a class="app-button" href="#shop">Jatka autohuoltoon <span aria-hidden="true">→</span></a>'+(cars.some(c=>!c.sample)?'<a class="app-button secondary" href="#home">Jatka omaan talliin <span aria-hidden="true">→</span></a>':''):started?'<a class="app-button" href="#home">Jatka omaan talliin <span aria-hidden="true">→</span></a>':''}${started&&!shopRole?'':`<button class="app-button${shopRole?' secondary':''}" type="button" data-start>Aloita ilman kirjautumista</button>`}${window.AjouraSync&&window.AjouraSync.enabled?(window.AjouraSync.signedIn()?'':'<a class="app-button secondary" href="#login">Kirjaudu sisään</a>'):'<button class="app-button secondary" type="button" data-welcome="login">Kirjaudu sisään <small class="soon-tag">tulossa</small></button>'}</div><details class="ai-welcome-video"><summary>Katso nykyisten toimintojen esittelyvideo</summary><div class="video-embed welcome-video" data-video="phone" role="button" tabindex="0" aria-label="Toista AJOURA-esittelyvideo"><img src="media/ajoura-esittely-poster.jpg" alt="" loading="lazy"><span class="video-play" aria-hidden="true">▶</span><span class="video-caption">Esittelyvideo · 0:46</span></div></details>${welcomeStep==='login'?'<p class="login-note" role="status"><strong>Kirjautuminen on tulossa.</strong> Tili tallentaa autosi ja merkintäsi turvallisesti, ja ne siirtyvät mukanasi uuteen puhelimeen. Sitä ennen voit jatkaa ilman kirjautumista.</p>':''}${signedIn()?'<p class="app-fineprint">Kirjautuneena tallisi synkronoituu pilveen. Kuvat ja kuitit säilyvät laitteella.</p>':'<p class="app-fineprint">Ilman kirjautumista tiedot tallentuvat vain tähän laitteeseen.</p>'}`});}
  const emptyGarage=()=>`<div class="empty-garage"><div class="car-stage">${heroCar('Sininen Volvo-farmari')}</div><h3>Lisää ensimmäinen ajoneuvosi</h3><p>Rekisteritunnuksella tai käsin. Valitset auton korimallin ja värin, ja päiväkirja on valmis.</p><a class="app-button" href="#newcar">＋ Lisää ajoneuvo</a>${installed?'':'<button class="app-back sample-link" type="button" data-sample>tai kokeile valmiilla esimerkkiautolla →</button>'}${installed&&ios?'<p class="eg-restore">Käytitkö AJOURAa ensin Safarissa? Asennettu sovellus aloittaa tyhjänä. <a href="#me"><span>Palauta tiedot varmuuskopiosta</span> <span aria-hidden="true">→</span></a></p>':''}</div>`;
  // Tyre season in Finland (tieliikennelaki 729/2018, since 1.6.2020): winter tyres are required 1.11.–31.3. whenever
  // the weather or road calls for them; studs are allowed 1.11.–31.3. and at other times only if conditions require.
  function tyreInfo(){const t=today(),m=Number(t.slice(5,7)),d=Number(t.slice(8,10));
    const winter=(m===10&&d>=1)||m===11,spring=(m===3&&d>=15)||m===4;if(!winter&&!spring)return null;
    const since=t.slice(0,4)+(winter?'-09-01':'-03-01'),own=cars.filter(c=>!c.sample&&isCar(c)),todo=own.filter(c=>!c.events.some(e=>e.type==='Renkaiden vaihto'&&e.date>=since));return todo.length?{winter,todo}:null;}
  // Season of today for the seasonal guide (tips.js). The old tyre row on the home screen was removed in v0.35 (Niklas):
  // the season chip and Valikko → Kausi- ja huoltovinkit replace it, and tyreInfo still lists the vehicles without a tyre change.
  const seasonNow=()=>window.AjouraTips&&window.AjouraTips.season?window.AjouraTips.season(today().slice(5)):{id:'',icon:'wrench',chip:{fi:'Huolto'},title:{fi:''},when:{fi:''},items:[]};
  // One line per garage card: what is due next for this vehicle, so an owner of several cars sees at a glance which one needs attention.
  function carStatus(c){const d=dueDates(c).sort((a,b)=>a.due.localeCompare(b.due))[0],t=today();
    if(d?.what==='Katsastus')return `<span class="car-due"><span>Katsastusarvio</span> · <span>${date(d.due)}</span></span>`;
    if(d){const late=d.due<t||(d.km!==null&&c.km>=d.km);return `<span class="car-due${late?' late':d.due<=addMonths(t,1)?' soon':''}">${late?d.what+' · myöhässä':d.what+' · '+date(d.due)}</span>`;}
    return c.events.length?'':'<span class="car-due empty">Ei vielä merkintöjä.</span>';}
  // Home screen after Niklas's mockups of 17.10.2026: what needs attention today, one row per vehicle with how much is
  // left until the next service, and shortcuts to a fill-up or an entry. The garage-wide cost total was dropped as
  // misleading; costs are shown per vehicle instead.
  function dueInfo(c){const t=today(),d=dueDates(c).sort((a,b)=>a.due.localeCompare(b.due))[0];if(!d)return null;
    const days=Math.round(dayNum(d.due)-dayNum(t)),span=Math.max(1,dayNum(d.due)-dayNum(d.from)),kmLeft=d.km===null?null:d.km-c.km;
    // Share of the interval still left, by time and by kilometres; whichever runs out first sets the bar and the text under it.
    const tLeft=days/span,kLeft=kmLeft===null?null:kmLeft/profile.km,by=kLeft!==null&&kLeft<tLeft?'km':'time';
    const left=Math.max(0,Math.min(1,by==='km'?kLeft:tLeft)),late=days<0||(kmLeft!==null&&kmLeft<=0),soon=!late&&(days<=31||left<=.15);
    return {...d,days,kmLeft,left,by,tone:late?'late':soon?'soon':d.what==='Katsastus'?'info':'ok'};}
  const dueWord=(list,late)=>{const insp=list.every(r=>r.d.what==='Katsastus'),one=list.length===1;return (insp?(one?'katsastus':'katsastusta'):(one?'huolto':'huoltoa'))+(late?' myöhässä':' lähestyy');};
  const carCost=(c,year)=>costOf(c.events.filter(e=>e.date.startsWith(year)))+(c.fuels||[]).filter(f=>f.date.startsWith(year)&&f.cost!==null).reduce((m,f)=>m+f.cost,0);
  const statusHead={late:{Huolto:'Huolto myöhässä',Katsastus:'Katsastus myöhässä'},soon:{Huolto:'Seuraava huolto',Katsastus:'Seuraava katsastus'},ok:{Huolto:'Huolto kunnossa',Katsastus:'Katsastus kunnossa'},info:{Huolto:'Huolto kunnossa',Katsastus:'Seuraava katsastus'}};
  // Each piece of text sits in its own element so the language layer can translate the words and leave numbers alone.
  function rowStatus(c,d){
    // 0.88: no reminder is told apart by the data: no entries at all (history missing) or entries without a service or
    // inspection (nothing to count a reminder from). The reminder logic itself is unchanged.
    if(d?.what==='Katsastus')return `<span class="row-status info inspection-estimate"><span class="row-ico" aria-hidden="true">${svg(icons.cal)}</span><span class="row-txt"><b>Katsastusarvio</b><strong><span>Arvio</span>: <span>${date(d.due)}</span></strong><small>Virallinen määräpäivä ei ole tiedossa.</small></span></span>`;
    if(!d)return `<span class="row-status none"><span class="row-ico" aria-hidden="true">${svg(icons.cal)}</span><span class="row-txt"><b>${c.events.length?'Ei huoltomuistutuksia':'Huoltohistoria puuttuu'}</b><strong>Kirjaa viimeisin huolto</strong><small>Niin AJOURA laskee seuraavan.</small></span></span>`;
    const urgent=d.tone==='late'||d.tone==='soon',pct=Math.round(d.left*100);
    const when=urgent?`<strong><span>${date(d.due)}</span>${d.km!==null?` <span>tai</span> <span>${number(d.km)} km</span>`:''}</strong>`:`<strong><span>${d.what==='Katsastus'?'Seuraava katsastus':'Seuraava huolto'}</span> <span>${date(d.due)}</span></strong>`;
    // Time and kilometres are shown as separate facts. When the service is overdue, the limit that has passed comes first
    // and the other one under it, so "late by date but 800 km still to go" reads plainly instead of a bare "0 % left" (0.25).
    const kmOver=d.kmLeft!==null&&d.kmLeft<=0,timeOver=d.days<0;
    const timeTxt=timeOver?`<span>Myöhässä</span> <span>${number(-d.days)}</span> <span>pv</span>`:d.days<62?`<span>Aikaa jäljellä</span> <span>${number(d.days)}</span> <span>pv</span>`:`<span>Aikaa jäljellä n.</span> <span>${number(Math.round(d.days/30.4))}</span> <span>kk</span>`;
    const kmTxt=d.kmLeft===null?'':kmOver?(d.kmLeft<0?`<span>Kilometriraja ylitetty</span> <span>${number(-d.kmLeft)} km</span>`:'<span>Kilometriraja on ylittynyt.</span>'):`<span>${timeOver?'Kilometrirajaan n.':'Ajettavaa jäljellä n.'}</span> <span>${number(d.kmLeft)} km</span>`;
    if(d.tone==='late'){const line=(t,over)=>t?`<small class="${over?'lim-over':'lim'}">${t}</small>`:'',lines=timeOver?line(timeTxt,true)+line(kmTxt,kmOver):line(kmTxt,true)+line(timeTxt,false);
      return `<span class="row-status late"><span class="row-ico" aria-hidden="true">${svg(icons.wrench)}</span><span class="row-txt"><b>${statusHead.late[d.what]}</b>${when}${lines}</span></span>`;}
    const rest=d.by==='km'?`<small><span>Ajettavaa jäljellä n.</span> <span>${number(d.kmLeft)} km</span></small>`:`<small>${timeTxt}</small>`;
    return `<span class="row-status ${d.tone}"><span class="row-ico" aria-hidden="true">${svg(urgent?icons.wrench:d.tone==='ok'?icons.check:icons.cal)}</span><span class="row-txt"><b>${statusHead[d.tone][d.what]}</b>${when}${rest}</span><span class="row-bar" aria-hidden="true"><i style="width:${Math.max(3,pct)}%;background:${barColor(d.left)}"></i></span><em class="row-pct" style="color:${barColor(d.left,.6)}"><span>${pct} %</span> <span>jäljellä</span></em></span>`;}
  // Bar colour slides from green (all left) through yellow (half) to red (nothing left). shade<1 darkens it for readable text.
  function barColor(left,shade=1){const stops=[[226,85,85],[242,182,31],[47,179,111]],x=Math.max(0,Math.min(1,left))*2,i=Math.min(1,Math.floor(x)),f=x-i;
    return 'rgb('+stops[i].map((v,k)=>Math.round((v+(stops[i+1][k]-v)*f)*shade)).join(',')+')';}
  // 0.88 (Niklas): the card's actions are compact icon buttons. The plus is a small badge pinned to the icon's lower right
  // corner (absolute position inside .act-ico), so icon and plus read as one symbol. The fill-up button uses the same
  // pump-and-bolt icon as the Tankkaus tab; its name says what it opens. 0.89 (Niklas): the buttons are back under the
  // service status, three side by side: fill-up/charge, service entry (wrench) and a note (the notes page, form on top).
  const actIcon=paths=>`<span class="act-ico" aria-hidden="true">${svg(paths)}<span class="act-plus"><svg viewBox="0 0 12 12" focusable="false"><path d="M6 3.4v5.2M3.4 6h5.2"/></svg></span></span>`;
  function garageActions(c){const ev=unitOf(c)==='kWh',kinds=chargeKinds(c);
    const fillName=kinds.length>1&&kinds.includes('el')?'Lisää tankkaus tai lataus':ev?'Lisää lataus':'Lisää tankkaus';
    return `<div class="row-actions"><button class="row-btn fuel" type="button" data-quickfuel="${c.id}" aria-label="${fillName}" title="${fillName}">${actIcon(fuelTabIcon)}</button><a class="row-btn note" href="#add/${c.id}" aria-label="Lisää huoltomerkintä" title="Lisää huoltomerkintä">${actIcon(icons.wrench)}</a><a class="row-btn memo" href="#notes/${c.id}" aria-label="Lisää muistiinpano" title="Lisää muistiinpano">${actIcon(icons.note)}</a></div>`;
  }
  function garageRow(c,d,year){const cost=Math.round(carCost(c,year));
    const pic=c.photo?`<span class="car-photo"><img src="${ownPhoto(c.photo)}" alt=""></span>`:`<span class="car-stage">${art(c,'')}</span>`;
    return `<div class="garage-row" data-car="${c.id}"><a class="row-pic" href="#vehicle/${c.id}" tabindex="-1" aria-hidden="true">${pic}</a><a class="row-info" href="#vehicle/${c.id}"><span class="row-name"><strong>${escape(carName(c))}</strong></span><small class="row-meta">${plateTxt(c)} · <span class="nw">${number(c.km)} ${ku(c)}</span></small>${cost?`<small class="row-cost fuel-cost-row"><span>Kulut</span> <span>${year}</span> <b>${number(cost)} €</b></small>`:''}</a><a class="row-wide" href="#vehicle/${c.id}">${rowStatus(c,d)}</a>${garageActions(c)}</div>`;}
  // Home presentation reuses the same images, status calculation and write-path hooks as garageRow.
  function homeVehicle(c,year){const d=dueInfo(c),cost=Math.round(carCost(c,year));
    return {image:vehicleImage(c),name:carName(c),plate:c.plate||typeOf(c),meter:`${number(c.km)} ${ku(c)}`,year,cost:cost?number(cost):'',
      statusLabel:d?.what==='Katsastus'?'Katsastusarvio':d?statusHead[d.tone][d.what]:c.events.length?'Ei huoltomuistutuksia':'Huoltohistoria puuttuu',
      statusValue:d?date(d.due):'Kirjaa viimeisin huolto',estimated:d?.what==='Katsastus',tone:d?.tone||'none',
      status:rowStatus(c,d),actions:garageActions(c)};
  }
  // Decorative scene for the "today" card: mountains, pines and a road. Snowy from October to March, green otherwise.
  const scene=()=>{const m=Number(today().slice(5,7)),w=m>=10||m<=3;return `<svg class="today-scene${w?' winter':''}" viewBox="0 0 220 110" aria-hidden="true" focusable="false"><circle class="sun" cx="176" cy="26" r="13"/><path class="far" d="M40 92 92 34l22 22 26-36 40 44 40 28z"/><path class="snow" d="m92 34 10 12-6-2-6 7-6-5zm48-14 12 14-7-3-5 6-6-6z"/><path class="near" d="M0 110 54 66l26 20 34-30 50 40 56-14v28z"/><g class="pines"><path d="m150 92 7-20 7 20zM166 96l6-17 6 17zM180 90l8-24 8 24zM198 98l6-18 6 18zM120 98l5-14 5 14z"/></g><path class="road" d="M210 110c-40-6-66-14-60-24s40-12 52-20"/><path class="road-line" d="M210 110c-40-6-66-14-60-24s40-12 52-20"/></svg>`;};
  function todayCard(rows){const due=rows.filter(r=>r.d&&(r.d.tone==='late'||r.d.tone==='soon')),late=due.filter(r=>r.d.tone==='late'),lateFirst=late.length?late:due,tyre=tyreInfo(),noData=rows.every(r=>!r.d),n=lateFirst.length;
    const headline=n?`<strong><b>${n}</b> <span>${dueWord(lateFirst,!!late.length)}</span></strong>`:noData?'<strong>Tervetuloa talliin</strong>':'<strong>Kaikki kunnossa</strong>';
    const others=due.length-n;
    const sub=tyre?(n?'ja 1 kausimuistutus on ajankohtainen.':'Kausimuistutus on ajankohtainen.'):others?`<span>Lisäksi</span> <span>${others}</span> <span>lähestyy.</span>`:n?'Muut ajoneuvot ovat kunnossa.':noData?'Kirjaa viimeisin huolto, niin AJOURA muistuttaa ajoissa.':'Ei huomioitavaa tänään. Hyvää matkaa!';
    const chipIn=`<span class="chip-ico" aria-hidden="true">${svg(n?icons.wrench:icons.check)}</span><span class="chip-txt">${n?`<b>${n}</b><small>${dueWord(lateFirst,!!late.length)}</small>`:'<strong>Huollot</strong><small>ei kiireellisiä</small>'}</span>`,chips=[n?`<a class="today-chip ${late.length?'alert':'warn'}" href="#vehicle/${lateFirst[0].c.id}">${chipIn}</a>`:`<button class="today-chip good" type="button" data-scroll-to="garage" data-scroll-block="start">${chipIn}</button>`];
    // Season chip (v0.35, Niklas): always shown and changes with the season; opens Valikko → Kausi- ja huoltovinkit.
    // In the tyre seasons it keeps the class tyre-chip, so the Rengaskausimuistutus switch (roles.js) still hides it.
    // The backup reminder no longer gets a chip; its own card stays at the bottom of the home screen.
    {const s=seasonNow();chips.push(`<a class="today-chip cold season-chip${s.tyre?' tyre-chip':''}" href="#tips"><span class="chip-ico" aria-hidden="true">${svg(icons[s.icon])}</span><span class="chip-txt"><strong>${s.chip.fi}</strong><small>kausivinkit</small></span></a>`);}
    chips.push(`<button class="today-chip" type="button" data-scroll-to="garage" data-scroll-block="start"><span class="chip-ico" aria-hidden="true">${svg(icons.car)}</span><span class="chip-txt"><b>${cars.length}</b><small>${cars.length===1?'ajoneuvo tallissa':'ajoneuvoa tallissa'}</small></span></button>`);
    return `<section class="today-card" aria-label="Tänään huomioitavaa">${scene()}<div class="today-top"><span class="today-bell" aria-hidden="true">${svg(icons.bell)}</span><div><span class="mini-label">TÄNÄÄN HUOMIOITAVAA</span>${headline}<p>${sub}</p></div></div><div class="today-chips n${chips.length}">${chips.join('')}</div></section>`;}
  function garageOrder(){const year=today().slice(0,4);return `${back('home','Koti')}${top()}<h2 class="app-heading">Ajoneuvojen järjestys</h2><p class="app-subtitle">Paina ajoneuvoa pitkään ja vedä se haluamaasi kohtaan.</p><div class="garage-rows">${cars.map(c=>garageRow(c,dueInfo(c),year)).join('')}</div>`;}
  function home(){
    if(!cars.length)return `${top(true)}<h2 class="app-heading home-heading">Etusivu</h2>${emptyGarage()}`;
    const year=today().slice(0,4),rows=cars.map(c=>({c,d:dueInfo(c)}));
    const backupCard=backupDue()?`<div class="reminder-card backup-due"><span class="event-symbol" aria-hidden="true">${svg(icons.bell)}</span><div><span class="mini-label">VARMUUSKOPIO</span><strong>${stamp(backupKey)?'Edellisestä varmuuskopiosta on yli kuukausi':'Ota ensimmäinen varmuuskopio'}</strong><small>Tiedot ovat vain tässä puhelimessa. Tallenna ne tiedostoon, niin ne säilyvät, vaikka puhelin vaihtuisi tai hajoaisi.</small><button class="link-button" type="button" data-backup>Tallenna varmuuskopio →</button></div></div>`:'';
    // 0.45 (AJ-01, AJ-21, AJ-25): in a browser tab the data can be deleted (Safari: a week without a visit), so while the
    // garage holds own vehicles a card asks to install and to take a backup. It replaces the backup reminder there and
    // cannot be hidden on purpose: the people who lose data are the ones who visit rarely.
    const when=backupWhen(),browserCard=!installed&&cars.some(c=>!c.sample)?`<div class="reminder-card browser-data"><span class="event-symbol" aria-hidden="true">${svg(icons.save)}</span><div><span class="mini-label">TIEDOT TÄSSÄ SELAIMESSA</span><strong>Asenna AJOURA, niin tiedot pysyvät tallessa</strong><small>${ios?'Safari voi poistaa tiedot, jos AJOURAa ei avata viikkoon. Asennettu sovellus aloittaa tyhjänä, joten tallenna ensin varmuuskopio ja palauta se sovelluksessa.':'Selain voi poistaa tiedot, jos AJOURAa ei avata pitkään aikaan. Asennettuna ne ovat paremmin tallessa. Ota myös varmuuskopio.'}</small>${when?`<small class="bk-last">${when}</small>`:''}<div class="bd-actions"><button class="link-button" type="button" data-install-open>Näin asennat →</button><button class="link-button" type="button" data-backup>Tallenna varmuuskopio →</button></div></div></div>`:'';
    return `${top(true)}<h2 class="app-heading home-heading">Etusivu</h2>${notice?`<p class="success-note" role="status">${escape(notice)}</p>`:''}${window.AjouraSecretary.render({cars,card:c=>garageRow(c,dueInfo(c),year),vehicle:c=>homeVehicle(c,year),due:dueInfo,dates:c=>dueDates(c).map(d=>({...d,intervalKm:profile.km})),insights:c=>window.AjouraInsights.analyze(c,dueDates(c),fuelParts(c),today()),today:today(),ai:aiScanOn(),speech:!!speechApi(),unit:ku})}${browserCard||backupCard}`;
  }
  // Quick fill-up from the home screen (Niklas 17.10.2026): a sheet from the bottom with only what a fill-up needs.
  // 0.67: every fuel can be picked on every vehicle (a diesel car is sometimes filled with HVO100, a petrol car with E85, a
  // gas car also runs on petrol); the vehicle's own fuel is listed first and is the default. Electricity has no grade.
  const gasGrades=['Biokaasu','Maakaasu'];
  const grades=c=>{if(c.fuel==='Sähkö')return [];if(c.fuel==='Kaasu')return gasGrades;const d=c.fuel==='Diesel';return d?['Diesel','HVO100','95 E10','98 E5','E85']:['95 E10','98 E5','E85','Diesel','HVO100'];};
  // 0.67: a fill-up is fuel (litres), gas (0.69: kilograms, as natural gas and biogas are sold by weight) or electricity
  // (kWh, stored as el: true; a pure electric vehicle needs no mark). Gas is told by its grade (Biokaasu, Maakaasu), so
  // nothing new is stored for it. Petrol and diesel vehicles log fuel only, gas vehicles gas and fuel (petrol back-up),
  // electric ones electricity only; hybrids and the rest fuel and electricity. fcar gives a copy of the vehicle that holds
  // only one kind (fuel "Sähkö", "Kaasu" or, for fuel, a petrol vehicle), so consumption, costs, charts and the PDF
  // work on one unit at a time without being rewritten.
  const {fillKind,chargeKinds,fcar}=window.AjouraAnalytics;
  const pickKind=(c,pref)=>{const k=chargeKinds(c);return k.includes(pref)?pref:k[0];};
  const usedKinds=c=>new Set((c.fuels||[]).map(f=>fillKind(c,f)));
  const fillWord=c=>{const k=usedKinds(c);return k.has('el')&&k.size>1?'Tankkaus / lataus':k.has('el')||c.fuel==='Sähkö'?'Lataus':'Tankkaus';};
  const costWord=c=>{const k=usedKinds(c);return k.has('el')&&k.size>1?'Polttoaine ja lataus':k.has('el')||c.fuel==='Sähkö'?'Latauskulut':'Polttoaine';};
  const fuelParts=c=>window.AjouraAnalytics.fuelParts(c,{hourlyValue:hourly(c)});
  const bolt='<path d="M13 3 6 13h5l-1 8 7-10h-5z"/>';
  // One fill-up sheet (0.41, AJ-12): the everyday fields first (odometer, price, total, litres, full tank, date, grade);
  // a fill-up abroad and the price estimate are behind Lisävalinnat. The same sheet edits a fill-up (0.40): its values
  // filled in, the sum and price in the currency it was paid in. Replaces the long form of the old tankkauskirja page.
  function quickFuel(c0,f,kind){const kd=f?fillKind(c0,f):kind||pickKind(c0),c=fcar(c0,kd),mixed=chargeKinds(c0).length>1&&!f,ev=unitOf(c)==='kWh',un=unitOf(c),fills=[...(c.fuels||[])].sort((a,b)=>a.date.localeCompare(b.date)||a.km-b.km),last=fills[fills.length-1],g=grades(c),pick=f?(f.grade||''):last&&last.grade&&g.includes(last.grade)?last.grade:g[0];
    const country=f?(f.country||'FI'):last&&last.country&&dayNum(today())-dayNum(last.date)<=3?last.country:'FI',cur=curOf(country),sym=cur==='EUR'?'€':cur,rate=cur==='EUR'?'':f&&f.cur===cur&&f.rate?f.rate:rateFor(c,cur);
    const sum=!f?null:f.cur?(f.amt!=null?f.amt:f.cost!==null?Math.round(f.cost*f.rate*100)/100:null):f.cost,ppu=f&&sum!==null&&f.qty>0?sum/f.qty:null;
    const gl=f&&f.grade&&!g.includes(f.grade)?[f.grade,...g]:g,opts=(f&&!f.grade?['']:[]).concat(gl),xtra=!!(f&&((f.country&&f.country!=='FI')||f.est))||country!=='FI';
    const prevF=f?fills.filter(x=>x!==f&&(x.date<f.date||(x.date===f.date&&x.km<f.km))).pop():last,word=ev?'latauksesta':'tankkauksesta',kmNow=f?f.km:Math.max(c.km,last?.km||0),gap=prevF&&kmNow>prevF.km?kmNow-prevF.km:null;
    const lbl=(t,unit)=>`<span>${t}</span> <small>(<span data-cur>${sym}</span>${unit})</small>`;
    return `<div class="sheet-backdrop" data-sheet-close></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><span class="sheet-grip" aria-hidden="true"></span><div class="sheet-head"><h2 id="sheet-title">${f?(ev?'Muokkaa latausta':'Muokkaa tankkausta'):(ev?'Uusi lataus':'Uusi tankkaus')}</h2><button class="sheet-x" type="button" data-sheet-close aria-label="Sulje">×</button></div>${window.AjouraAvatar.sheet()}
      ${mixed?`<div class="rp-tabs sf-kinds" role="group" aria-label="Kirjauksen laji">${chargeKinds(c0).map(k=>`<button type="button" data-sheet-kind="${k}" aria-pressed="${kd===k}">${svg(k==='el'?bolt:icons.fuel)}<span>${k==='el'?'Lataus':k==='gas'?'Kaasu':'Tankkaus'}</span></button>`).join('')}</div>`:''}<p class="sheet-car"><span class="sheet-thumb">${rpThumb(c)}</span><span class="sheet-ctxt"><strong translate="no">${escape(carName(c))}</strong> <span translate="no">· ${plateTxt(c)}</span>${prevF?`<small><span>${ev?'Edellinen lataus':'Edellinen tankkaus'}</span> <span>${dm(prevF.date)}</span> · <span class="nw"><span>${number(prevF.km)}</span> <span>${ku(c)}</span></span></small>`:''}</span></p>
      ${!f&&aiScanOn()?`${aiPanel()}<div class="sf-ai" hidden><button type="button" class="sf-ai-btn" data-ai-scan><span class="sf-ai-ico" aria-hidden="true">${svg(icons.spark)}</span><span class="sf-ai-txt"><span>Täytä kuvasta</span><small>Kuitti, tankkausmittari tai mittaristo</small></span></button><input type="file" accept="image/*" class="sr-only" data-ai-file tabindex="-1" aria-hidden="true"><p class="sf-ai-note" role="status" hidden></p></div>`:''}
      <form class="app-form sheet-form" id="quickfuel-form"${!f&&aiScanOn()?' hidden':''} novalidate data-car="${c.id}" data-unit="${un}"${prevF?` data-prev="${prevF.km}"`:''}${f?` data-edit="${f.id}" data-user="${sum!==null?'qty,ppu':'qty'}"${sum!==null?' data-auto="cost"':''}`:''}>
      <label class="sf-km">${meterLabel(c)}<input name="km" type="number" enterkeyhint="next" required min="0" max="2000000" inputmode="numeric" value="${kmNow}"><small class="sf-gap"${gap?'':' hidden'}><span data-gap>${gap?number(gap):''}</span> <span>${ku(c)}</span> <span>${ev?'edellisestä latauksesta':'edellisestä tankkauksesta'}</span></small></label>
      <div class="form-row three sf-calc"><label>${lbl(un==='l'?'Litrahinta':'Hinta','/'+un)}<input name="ppu" type="text" enterkeyhint="next" inputmode="decimal" autocomplete="off" maxlength="9" placeholder="${ev?'0,30':un==='kg'?'1,60':'1,85'}" value="${ppu!==null?dec(ppu,3):''}"></label><label>${lbl('Summa','')}<input name="cost" type="text" enterkeyhint="next" inputmode="decimal" autocomplete="off" maxlength="10" placeholder="89,40" value="${sum!==null?dec(sum,2):''}"></label><label><span>${un==='l'?'Litrat':un}</span><input name="qty" type="text" enterkeyhint="done" inputmode="decimal" autocomplete="off" maxlength="9" placeholder="${ev?'45':un==='kg'?'15':'48,2'}" value="${f?dec(f.qty,2):''}"></label></div>
      <p class="field-help sheet-help">Anna kaksi kolmesta, niin kolmas lasketaan.</p><input type="hidden" name="est" value="${f&&f.est?'1':''}"><input type="hidden" name="kind" value="${kd}">
      <div class="sheet-opts"><label class="check-line"><input type="checkbox" name="full"${!f||f.full?' checked':''}> ${ev?'Ladattu täyteen':'Tankki täyteen'}</label><label class="sheet-opt">${svg(icons.cal)}<span>Päivä</span><input name="date" type="date" required value="${f?f.date:today()}" max="${today()}"></label>${g.length?`<label class="sheet-opt">${svg(icons.fuel)}<span>Polttoaine</span><select name="grade">${opts.map(x=>`<option value="${escape(x)}"${x===pick?' selected':''}>${x?escape(x):'–'}</option>`).join('')}</select></label>`:''}</div>
      <div class="sf-skip"><label class="check-line"><input type="checkbox" name="skip"${f&&f.skip?' checked':''}> <span>Älä huomioi kulutuksessa</span></label><small>${ev?'Esim. joku muu latasi välissä etkä tiedä määrää. Tämän ja edellisen latauksen väliä ei lasketa kulutukseen, kulut lasketaan.':'Esim. joku muu tankkasi välissä etkä tiedä määrää. Tämän ja edellisen tankkauksen väliä ei lasketa kulutukseen, kulut lasketaan.'}</small></div>
      <details class="sheet-xtra"${xtra?' open':''}><summary><span class="sx-t"><b>Lisävalinnat</b><small>${ev?'Ladattu ulkomailla · hinta ei muistu':'Tankattu ulkomailla · hinta ei muistu'}</small></span>${chev}</summary>
        <div class="form-row sx-row"><label>Maa<select name="country">${countries.map(([k,n,cu])=>`<option value="${k}"${k===country?' selected':''}>${n}${cu!=='EUR'?' ('+cu+')':''}</option>`).join('')}</select></label><label class="fx-rate"${cur==='EUR'?' hidden':''}><span>Kurssi: 1 € =</span> <span data-cur>${sym}</span><input name="rate" type="text" inputmode="decimal" autocomplete="off" maxlength="9" value="${rate}"></label></div>
        <button class="app-back fuel-guess" type="button" data-fuel-guess>Arvioi hinta, jos et muista sitä →</button></details>
      <p class="error-note" role="alert"></p><button class="app-button" type="submit">${f?'Tallenna muutokset':ev?'Tallenna lataus':'Tallenna tankkaus'}</button>${f?`<button class="app-back danger-link sheet-del" type="button" data-fl-del="${f.id}">${ev?'Poista lataus':'Poista tankkaus'}</button>`:route().view==='fuel'?'':`<a class="app-back sheet-more" href="#fuel/${c.id}" data-fl-kindlink="${kd}">Avaa Tankkaus-välilehti →</a>`}</form></div>`;}
  // 0.113 Kuittitunnistus (Ajoura Plus): painike näkyy vain, kun AjouraAccess sallii (Plus ja tekoäly päällä; kiintiön
  // loppuminen kerrotaan painettaessa). Kuva pienennetään laitteessa (shrink, JPEG) ja lähtee vain AjouraAccess.recognize-
  // reitin kautta palvelimelle. Tulos vain esitäyttää lomakkeen: käyttäjä tarkistaa ja tallentaa itse.
  const aiScanOn=()=>{const A=window.AjouraAccess;if(!A)return false;const r=A.check('ai.receipt').reason;return r===''||r==='quota';};
  const aiMsg={quota:'Tämän kuun tunnistukset on käytetty. Kirjaa tiedot käsin.',plan:'Plus-oikeutta ei voitu vahvistaa. Kirjaa tiedot käsin.',off:'Tekoälyavustaja on pois käytöstä.'};
  const dataUrlBlob=d=>{const b=atob(d.slice(d.indexOf(',')+1)),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return new Blob([u],{type:'image/jpeg'});};
  const normFuel=v=>String(v||'').toLowerCase().replace(/[^a-z0-9åäö]/g,'');
  // Päivä, polttoaine ja kaksi kolmesta (summa, määrä, litrahinta) lomakkeelle; kolmas lasketaan (fuelCalc).
  function fillFuelFrom(f,r,withDate){const el=f.elements,unitOk=!r.unit||r.unit===f.dataset.unit,eur=!r.currency||r.currency==='EUR';
    if(withDate&&r.date&&r.date<=today())el.date.value=r.date;
    if(el.grade&&r.fuel){const o=[...el.grade.options].find(o=>o.value&&normFuel(r.fuel).includes(normFuel(o.value)));if(o)el.grade.value=o.value;}
    const vals={cost:eur?r.total:null,qty:unitOk?r.quantity:null,ppu:eur&&unitOk?r.price_per_unit:null},use=['cost','qty','ppu'].filter(n=>vals[n]!=null).slice(0,2);
    for(const n of ['qty','ppu','cost'])if(use.includes(n))el[n].value=dec(vals[n],n==='ppu'?3:2).replace(/\s/g,'');
    if(use.length){f.dataset.user=use.join(',');f.dataset.auto='';fuelCalc(f);}
    return {unitOk,eur,use};}
  // 1.20 Tekoälytila: uusi tankkaus alkaa tekoälystä (kuva tai kirjoitettu teksti), kun tekoäly on käytettävissä. Tulos avaa tutun
  // lomakkeen esitäytettynä, ja käyttäjä tarkistaa ja tallentaa itse. "Täytä käsin" avaa lomakkeen heti. Ilman tekoälyä (ei
  // kirjautumista, tekoäly pois) ja muokatessa avautuu suoraan lomake. Mikrofoni tulee myöhemmin.
  const aiPanel=()=>`<div class="ai-mode" data-ai-mode><p class="ai-lead">${speechApi()?'Kerro tankkaus kuvalla, puheella tai kirjoittamalla. Tarkistat tiedot ennen tallennusta.':'Kerro tankkaus kuvalla tai kirjoittamalla. Tarkistat tiedot ennen tallennusta.'}</p><button type="button" class="sf-ai-btn ai-cam" data-ai-cam><span class="sf-ai-ico" aria-hidden="true">${svg(icons.camera)}</span><span class="sf-ai-txt"><span>Ota tai valitse kuva</span><small>Kuitti, tankkausmittari tai mittaristo</small></span></button><input type="file" accept="image/*" class="sr-only" data-ai-cam-file tabindex="-1" aria-hidden="true"><div class="app-form ai-say"><input type="text" id="ai-say-in" maxlength="300" autocomplete="off" enterkeyhint="send" aria-label="Kirjoita tankkauksen tiedot" placeholder="Esim. 45,6 l dieseliä 84,77 € mittari 218450">${speechApi()?`<button type="button" class="ai-mic" data-ai-mic aria-pressed="false" aria-label="Sanele tankkauksen tiedot">${svg(icons.mic)}</button>`:''}<button type="button" class="ai-send" data-ai-send aria-label="Lähetä">${svg(icons.send)}</button></div><p class="ai-note" role="status" hidden></p><button type="button" class="app-back ai-manual" data-ai-manual>Täytä käsin →</button></div>`;
  // Tekoälyn tulos lomakkeelle (r.kind: receipt, pump, odometer = kuva; text = tekoälytilan teksti; other = ei tunnistettu).
  // Palauttaa [viesti, onnistui, täytettiinkö jotain]. Ristiriitaiset tai epäselvät luvut eivät täytä mitään.
  function aiTask(f,filled){
    if(filled)f.dataset.taskAi='1';
    window.AjouraTasks.ai(f.dataset.car,f.dataset.taskAi?'awaiting_confirmation':'expired');
    if(f.dataset.taskAi&&!f.querySelector('.task-ai-pending')){
      const note=document.createElement('p');note.className='task-ai-pending info-note';note.setAttribute('role','status');
      note.textContent=tl('AI-luonnos odottaa tarkistustasi ja tallennusta.');f.prepend(note);
    }
  }
  function applyAi(f,r){const el=f.elements,k=r&&r.kind,car=cars.find(x=>x.id===f.dataset.car)||{},low='Luettu lukema on pienempi kuin edellisessä tankkauksessa. Tarkista se.';
    // Kokonaiskilometrit kilometrikenttään: ei maileja (ei muunneta arvaamalla) eikä tuntimittarille. '' = ei täytetty.
    const km=()=>{if(r.odometer==null||r.odometer_unit==='mi'||hourly(car))return '';const lo=Number(f.dataset.prev)>0&&r.odometer<Number(f.dataset.prev);el.km.value=String(r.odometer);el.km.dispatchEvent(new Event('input',{bubbles:true}));return lo?'low':'ok';};
    if(k==='receipt'){const {unitOk,eur,use}=fillFuelFrom(f,r,true);
      return [!unitOk?'Kuitin yksikkö ei vastaa tätä ajoneuvoa: määrää ei täytetty.':!eur?'Kuitti ei ole euroissa: hintaa ei täytetty. Valitse maa Lisävalinnoista.':use.length?'Tiedot luettu kuitista. Tarkista ne ja lisää mittarilukema.':'Kuitista ei saatu määrää eikä hintaa. Kirjaa ne käsin.',use.length&&unitOk&&eur,use.length>0];}
    if(k==='pump'){// Tankkausmittari: ei päivää. Jos litrahinta × määrä ei vastaa summaa, palvelin merkitsee luvut epäluotettaviksi (mismatch).
      if(r.mismatch)return ['Mittarin luvut eivät täsmää keskenään. Kokeile uutta kuvaa tai kirjaa tiedot käsin.',false,false];
      const {unitOk,eur,use}=fillFuelFrom(f,r,false);
      return [!unitOk?'Mittarin yksikkö ei vastaa tätä ajoneuvoa: määrää ei täytetty.':!eur?'Mittarin hinta ei ole euroissa: hintaa ei täytetty. Valitse maa Lisävalinnoista.':use.length?'Tiedot luettu tankkausmittarista. Tarkista ne ja lisää mittarilukema.':'Mittarista ei saatu määrää eikä hintaa. Kirjaa ne käsin.',use.length&&unitOk&&eur,use.length>0];}
    if(k==='odometer'){
      if(hourly(car))return ['Tämän ajoneuvon mittari on tuntimittari. Kirjoita lukema käsin.',false,false];
      if(r.odometer==null)return ['Mittaristosta ei saatu luettua kokonaiskilometrejä. Kirjoita lukema käsin.',false,false];
      if(r.odometer_unit==='mi')return ['Mittari näyttää maileja. Kirjoita kilometrit käsin.',false,false];
      const st=km();return [st==='low'?low:'Kilometrilukema luettu mittaristosta. Tarkista se.',st==='ok',true];}
    if(k==='text'){// Teksti voi kertoa sekä tankkauksen että mittarilukeman (ja päivän, esim. "eilen").
      if(r.mismatch)return ['Tekstin luvut eivät täsmää keskenään (litrahinta × litrat ≠ summa). Tarkista ja kirjoita uudelleen.',false,false];
      const {unitOk,eur,use}=fillFuelFrom(f,r,true),st=km();
      if(!use.length&&!st)return ['Tekstistä ei löytynyt tankkauksen tietoja. Kirjoita esimerkiksi litrat, hinta ja mittarilukema.',false,false];
      return [!unitOk?'Yksikkö ei vastaa tätä ajoneuvoa: määrää ei täytetty.':!eur?'Hinta ei ole euroissa: hintaa ei täytetty. Valitse maa Lisävalinnoista.':st==='low'?low:st?'Tiedot luettu tekstistä. Tarkista ne.':'Tiedot luettu tekstistä. Tarkista ne ja lisää mittarilukema.',unitOk&&eur&&st!=='low',true];}
    return ['Kuvasta ei löytynyt kuittia, tankkausmittaria eikä mittaristoa.',false,false];}
  // Lomakkeen Täytä kuvasta (1.19): kuva pienennetään laitteessa (shrink, JPEG) ja lähtee vain AjouraAccess.recognize-reitin kautta.
  async function scanImage(f,l,file){const A=window.AjouraAccess,btn=l.querySelector('[data-ai-scan]'),note=l.querySelector('.sf-ai-note');if(!A||!btn)return;
    const say=(t,ok)=>{note.hidden=false;note.textContent=t;note.classList.toggle('ok',!!ok);};
    btn.disabled=true;window.AjouraAvatar.react('checking');window.AjouraTasks.ai(f.dataset.car,'draft');say('Luetaan kuvaa…');
    const d=await shrink(file,1568,.85);if(!f.isConnected)return;if(!d){btn.disabled=false;aiTask(f,false);window.AjouraAvatar.react('attention');say('Kuvaa ei voitu lukea. Kokeile toista kuvaa.');return;}
    let r;try{r=await A.recognize('ai.receipt',dataUrlBlob(d));}catch(e){btn.disabled=false;if(f.isConnected)aiTask(f,false);if(f.isConnected)window.AjouraAvatar.react('attention');say(aiMsg[e&&e.reason]||'Kuvaa ei voitu lukea nyt. Kirjaa tiedot käsin.');return;}
    btn.disabled=false;if(!f.isConnected)return;const [m,ok,filled]=applyAi(f,r);aiTask(f,filled);window.AjouraAvatar.react(filled?'neutral':'attention');say(m,ok);if(filled)f.elements.km.focus({preventScroll:true});}
  // Tekoälytilasta lomakkeeseen (tulos tai Täytä käsin).
  function showForm(l,f){stopListen();const p=l.querySelector('[data-ai-mode]');if(p)p.hidden=true;const sa=l.querySelector('.sf-ai');if(sa)sa.hidden=false;f.hidden=false;}
  const panelSay=(l,t)=>{const n=l.querySelector('.ai-note');if(n){n.hidden=false;n.textContent=t;}};
  // Yksi pyyntö tekoälytilasta. Jos mitään ei täytetty (ei tunnistettu, ristiriita, virhe, kiintiö), tila pysyy auki viestin kanssa.
  async function panelAsk(f,l,blob,busy,fail,none){const A=window.AjouraAccess,p=l.querySelector('[data-ai-mode]');if(!A||!p||!f.isConnected)return;
    stopListen();const parts=[...p.querySelectorAll('[data-ai-cam],[data-ai-send],[data-ai-mic],#ai-say-in')],lock=on=>parts.forEach(x=>{x.disabled=on;});
    lock(true);window.AjouraAvatar.react('checking');window.AjouraTasks.ai(f.dataset.car,'draft');panelSay(l,busy);
    let r;try{r=await A.recognize('ai.receipt',blob);}catch(e){lock(false);if(f.isConnected)aiTask(f,false);if(l.isConnected)window.AjouraAvatar.react('attention');panelSay(l,aiMsg[e&&e.reason]||fail);return;}
    lock(false);if(!f.isConnected)return;const [m,ok,filled]=applyAi(f,r);aiTask(f,filled);
    window.AjouraAvatar.react(filled?'neutral':'attention');if(!filled){panelSay(l,r&&r.kind==='other'&&none?none:m);return;}
    showForm(l,f);const n=l.querySelector('.sf-ai-note');if(n){n.hidden=false;n.textContent=m;n.classList.toggle('ok',!!ok);}f.elements.km.focus({preventScroll:true});}
  async function panelImage(f,l,file){const d=await shrink(file,1568,.85);if(!d){panelSay(l,'Kuvaa ei voitu lukea. Kokeile toista kuvaa.');return;}
    await panelAsk(f,l,dataUrlBlob(d),'Luetaan kuvaa…','Kuvaa ei voitu lukea nyt. Kirjaa tiedot käsin.');}
  // 1.21 Mikrofoni: selaimen oma puheentunnistus (Web Speech API; maksuton, ei uutta palvelua). Selaimesta riippuen puhe voidaan
  // käsitellä selaimen valmistajan palvelussa (Safari: Apple, Chrome: Google); AJOURA ei saa ääntä. Puhe muuttuu tekstiksi
  // tekstikenttään, jonka käyttäjä näkee ja voi korjata; mitään ei lähetetä ennen Lähetä-painiketta. Painike näkyy vain, jos selain
  // tukee puheentunnistusta. Toinen painallus lopettaa kuuntelun; ikkunan sulkeminen, lähetys ja Täytä käsin keskeyttävät sen.
  const speechApi=()=>window.SpeechRecognition||window.webkitSpeechRecognition||null;
  let aiRec=null;
  // Keskeytys (sulkeminen, lähetys, Täytä käsin): ei viestiä, ajastimet pois.
  function stopListen(){const r=aiRec;aiRec=null;if(r)try{r.__cancel?r.__cancel():r.abort();}catch(e){}}
  const micMsg={'not-allowed':'Mikrofonin käyttö on estetty. Salli mikrofoni selaimen asetuksista, kirjoita teksti tai käytä näppäimistön sanelua.','service-not-allowed':'Puheentunnistus ei ole käytettävissä tässä selaimessa. Kirjoita teksti tai käytä näppäimistön sanelua.','no-speech':'Puhetta ei kuulunut. Yritä uudelleen tai kirjoita teksti.','audio-capture':'Mikrofonia ei löytynyt. Kirjoita teksti tai käytä näppäimistön sanelua.','network':'Puheentunnistus tarvitsee verkkoyhteyden. Kirjoita teksti tai käytä näppäimistön sanelua.','language-not-supported':'Puheentunnistus ei tue tätä kieltä tällä laitteella. Kirjoita teksti tai käytä näppäimistön sanelua.'};
  // 1.22: iPhonen Safari voi aloittaa kuuntelun antamatta koskaan tulosta, virhettä tai lopetusta. Siksi:
  // - jos ääntä tai tulosta ei tule 6 sekunnissa, kuuntelu keskeytetään ja käyttäjää neuvotaan käyttämään näppäimistön sanelua,
  // - kuuntelu lopetetaan viimeistään 20 sekunnissa,
  // - toinen painallus lopettaa (stop, jolloin Safari antaa tuloksen); jos selain ei päätä 2 sekunnissa, kuuntelu katkaistaan ja
  //   jo kuultu teksti jää kenttään.
  const micWait=6000,micMax=20000,micEnd=2000;
  function panelListen(l){const SR=speechApi(),btn=l.querySelector('[data-ai-mic]'),inp=l.querySelector('#ai-say-in');if(!SR||!btn||!inp)return;
    if(aiRec){if(aiRec.__stop)aiRec.__stop();else stopListen();return;}
    const rec=new SR(),base=inp.value.trim(),fail='Puheentunnistus ei onnistunut. Kirjoita teksti tai käytä näppäimistön sanelua.';
    let heard='',alive=false,done=false,t1=0,t2=0,t3=0;
    const kill=()=>{try{rec.abort();}catch(e){}};
    // Yksi lopetus kaikille poluille: msg undefined = tavallinen loppu (tulos tai "ei kuulunut"), '' = hiljainen keskeytys.
    const finish=msg=>{if(done)return;done=true;clearTimeout(t1);clearTimeout(t2);clearTimeout(t3);if(aiRec===rec)aiRec=null;btn.setAttribute('aria-pressed','false');
      if(!l.isConnected)return;window.AjouraAvatar.react(msg||(!heard&&msg===undefined)?'attention':'neutral');if(msg!==undefined){if(msg)panelSay(l,msg);return;}
      if(heard){panelSay(l,'Tarkista teksti ja paina Lähetä.');const sb=l.querySelector('[data-ai-send]');if(sb)sb.focus({preventScroll:true});}else panelSay(l,'Puhetta ei kuulunut. Yritä uudelleen tai kirjoita teksti.');};
    rec.__stop=()=>{try{rec.stop();}catch(e){}clearTimeout(t3);t3=setTimeout(()=>{kill();finish();},micEnd);};
    rec.__cancel=()=>{kill();finish('');};
    rec.lang={en:'en-US',sv:'sv-SE'}[(window.AjouraI18n||{}).lang]||'fi-FI';rec.interimResults=true;rec.continuous=false;rec.maxAlternatives=1;
    rec.onaudiostart=rec.onspeechstart=()=>{alive=true;};
    rec.onresult=e=>{alive=true;let t='';for(let i=0;i<e.results.length;i++)t+=e.results[i][0].transcript;heard=t.trim();inp.value=(base?base+' ':'')+heard;};
    rec.onerror=e=>{const er=e&&e.error;finish(er==='aborted'?'':micMsg[er]||fail);};
    rec.onend=()=>finish();
    aiRec=rec;window.AjouraAvatar.react('listening');btn.setAttribute('aria-pressed','true');panelSay(l,'Kuunnellaan… Puhu ja paina mikrofonia uudelleen, kun olet valmis.');
    t1=setTimeout(()=>{if(!alive){kill();finish('Puheentunnistus ei vastaa tällä laitteella. Kirjoita teksti tai käytä näppäimistön sanelua (mikrofoni näppäimistössä).');}},micWait);
    t2=setTimeout(()=>{if(aiRec===rec)rec.__stop();},micMax);
    try{rec.start();}catch(e){finish(fail);}}
  // Kirjoitettu teksti ja laitteen päivä (sanoja kuten "eilen" varten) palvelimelle JSONina; enintään 300 merkkiä.
  function panelText(f,l){const inp=l.querySelector('#ai-say-in'),t=inp?inp.value.trim():'';if(!inp)return;
    if(!t){panelSay(l,'Kirjoita ensin tankkauksen tiedot, esimerkiksi litrat, hinta ja mittarilukema.');inp.focus();return;}
    panelAsk(f,l,new Blob([JSON.stringify({text:t.slice(0,300),today:today()})],{type:'application/json'}),'Luetaan tekstiä…','Tekstiä ei voitu lukea nyt. Kirjaa tiedot käsin.','Tekstistä ei löytynyt tankkauksen tietoja. Kirjoita esimerkiksi litrat, hinta ja mittarilukema.');}
  // AJ-04: the sheet is a real dialog. Focus moves into it, Tab stays inside it, the page behind it is inert, and
  // closing it (×, Escape, the backdrop or saving) returns the focus to the button that opened it.
  // After a save the screen is drawn again, so the opener is found again by what it opens (sheetSel).
  let sheetBack=null,sheetSel='';
  function closeSheet(){stopListen();const l=glass.querySelector('.sheet-layer');if(!l)return;const taskCar=l.querySelector('#quickfuel-form')?.dataset.car;if(taskCar&&window.AjouraTasks.snapshot().some(x=>x.car===taskCar&&x.kind==='ai'&&x.state!=='done'))window.AjouraTasks.ai(taskCar,'expired');l.remove();window.AjouraAvatar.react('neutral');screen.inert=false;if(sheetBack&&sheetBack.isConnected)sheetBack.focus({preventScroll:true});sheetBack=null;}
  function refocusSheet(){const el=sheetSel&&(screen.querySelector(sheetSel)||screen.querySelector('.fl-add'));sheetSel='';if(el)el.focus({preventScroll:true});}
  const focusables=root=>[...root.querySelectorAll('a[href],button:not([disabled]),input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea,summary,[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null||x.tagName==='SUMMARY');
  function openSheet(c,from,fill,kind){const kd=fill?fillKind(c,fill):kind||pickKind(c),cv=fcar(c,kd);closeSheet();sheetBack=from||null;sheetSel=!from?'':from.classList.contains('fl-add')?'.fl-add':from.dataset.flEdit?`[data-fl-edit="${from.dataset.flEdit}"]`:from.dataset.quickfuel?`[data-quickfuel="${from.dataset.quickfuel}"]`:'';const l=document.createElement('div');l.className='sheet-layer';l.innerHTML=quickFuel(c,fill,kd);glass.appendChild(l);screen.inert=true;
    const f=l.querySelector('#quickfuel-form');f.addEventListener('submit',e=>{e.preventDefault();saveFuel(f,cars.find(x=>x.id===c.id)||c);});
    const order=['km','ppu','cost','qty'];f.addEventListener('keydown',e=>{const i=order.indexOf(e.target.name);if(e.key==='Enter'&&i>=0&&i<order.length-1){e.preventDefault();f.elements[order[i+1]].focus();}});
    // Price per litre + total gives the litres (Niklas 19.10.2026); any two of the three fill in the third.
    f.addEventListener('input',e=>{if(['qty','ppu','cost'].includes(e.target.name))fuelCalc(f,e.target.name);if(e.target.name==='rate'&&f.elements.est.value==='1'&&Number(decIn(e.target.value))>0)fuelGuess(f,cv);
      if(e.target.name==='km'){const p=Number(f.dataset.prev),k=Number(e.target.value),gp=f.querySelector('.sf-gap');if(gp){const ok=f.dataset.prev&&k>p;gp.hidden=!ok;if(ok)gp.querySelector('[data-gap]').textContent=number(k-p);}}});
    l.addEventListener('change',e=>{const inp=e.target.closest('[data-ai-file],[data-ai-cam-file]');if(inp&&inp.files&&inp.files[0]){const file=inp.files[0];inp.value='';(inp.hasAttribute('data-ai-cam-file')?panelImage:scanImage)(f,l,file);}});
    l.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='ai-say-in'){e.preventDefault();panelText(f,l);}});
    f.addEventListener('change',e=>{if(e.target.name!=='country')return;const cur=curOf(e.target.value),fx=f.querySelector('.fx-rate');f.querySelectorAll('[data-cur]').forEach(x=>x.textContent=cur==='EUR'?'€':cur);fx.hidden=cur==='EUR';f.elements.rate.value=cur==='EUR'?'':rateFor(c,cur);if(f.elements.est.value==='1')fuelGuess(f,cv);});
    const label=f.querySelector('[type=submit]').textContent;f.addEventListener('input',e=>{if(f.dataset.confirmed&&(e.target.name==='km'||e.target.name==='date')){delete f.dataset.confirmed;f.querySelector('[type=submit]').textContent=label;}});
    l.addEventListener('click',e=>{if(e.target.closest('[data-ai-scan]')){l.querySelector('[data-ai-file]').click();return;}if(e.target.closest('[data-ai-cam]')){l.querySelector('[data-ai-cam-file]').click();return;}if(e.target.closest('[data-ai-send]')){panelText(f,l);return;}if(e.target.closest('[data-ai-mic]')){panelListen(l);return;}if(e.target.closest('[data-ai-manual]')){showForm(l,f);f.elements.ppu.focus({preventScroll:true});return;}const sk=e.target.closest('[data-sheet-kind]');if(sk){openSheet(c,sheetBack,null,sk.dataset.sheetKind);return;}const del=e.target.closest('[data-fl-del]');if(del){const id=del.dataset.flDel;closeSheet();removeFill(id);return;}if(e.target.closest('[data-fuel-guess]')){fuelGuess(f,cv);return;}if(e.target.closest('[data-sheet-close]'))closeSheet();else if(e.target.closest('.sheet-more'))closeSheet();});
    l.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const list=focusables(l.querySelector('.sheet'));if(!list.length)return;const first=list[0],lastEl=list[list.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();lastEl.focus();}else if(!e.shiftKey&&document.activeElement===lastEl){e.preventDefault();first.focus();}});
    requestAnimationFrame(()=>{l.classList.add('open');const q=l.dataset.secretaryMode==='text'?l.querySelector('#ai-say-in'):fill?l.querySelector('.sheet-x'):l.querySelector('[data-ai-mode]')?l.querySelector('[data-ai-cam]'):f.elements.ppu;if(q)q.focus({preventScroll:true});});}
  const fuels=['Bensiini','Diesel','Hybridi (bensiini/sähkö)','Lataushybridi','Sähkö','Kaasu','Muu'];
  function methodStep(){return `${kindsOn()?'<button class="app-back nav-back" type="button" data-step-to="kind">← Ajoneuvolaji</button>':back('home','Koti')}<h2 class="app-heading">Uusi ajoneuvo</h2><p class="app-subtitle">Miten haluat lisätä autosi?</p><div class="method-list"><button class="method-card" type="button" data-method="plate"><span class="plate-badge" aria-hidden="true"><b>FIN</b>ABC-123</span><strong>Rekisteritunnuksella</strong><small>Haku on vielä demo. Omalla tunnuksella jatkat täyttämällä tiedot itse.</small></button><button class="method-card" type="button" data-method="manual"><span class="method-icon" aria-hidden="true">${svg(icons.note)}</span><strong>Lisää manuaalisesti</strong><small>Kirjoitat auton tiedot itse.</small></button></div><p class="app-fineprint">Mallin valinnan jälkeen valitset vielä korimallin ja värin.</p>`;}
  function plateStep(){const pending=lookup&&lookup.pending;return `<button class="app-back nav-back" type="button" data-step-to="method">← Takaisin</button><h2 class="app-heading">Rekisteritunnus</h2><p class="app-subtitle">Syötä rekisteritunnus, niin AJOURA tunnistaa auton ja täyttää perustiedot.</p><form class="app-form" id="plate-form" novalidate><label for="plate-input">Rekisteritunnus</label><div class="plate-field"><span class="plate-country" aria-hidden="true">FIN</span><input id="plate-input" name="plate" maxlength="7" autocomplete="off" autocapitalize="characters" inputmode="text" spellcheck="false" placeholder="ABC-123" value="${escape(lookup?.plate||'')}"${pending?' disabled':''}></div><p class="error-note" id="form-error" role="alert">${lookup?.error?escape(lookup.error):''}</p><button class="app-button" type="submit"${pending?' disabled':''}>${pending?'<span class="spinner" aria-hidden="true"></span> Haetaan ajoneuvoa…':'Hae ajoneuvo'}</button><p class="field-help plate-examples"><span>Kokeile esimerkkitunnuksia:</span>${examplePlates.map(p=>`<button type="button" class="plate-chip" data-plate="${p}">${p}</button>`).join('')}</p><button class="app-back manual-link" type="button" data-method="manual">Syötä tiedot itse →</button><p class="app-fineprint">Simuloitu haku: demossa ei tehdä oikeaa rekisterihakua. Tunnistus perustuu kuvitteelliseen esimerkkiaineistoon.</p></form>`;}
  const preview=d=>d.body?`${Car.render(d.body,d.color||'#b9c1ca','Esikatselu',shapeOf(d))}<span>${Car.names[d.body]} · ${d.color?colorName(d.color):'valitse väri'}</span>`:'<p class="preview-empty">Valitse korimalli alta</p>';
  const bodyChoices=d=>{const m=d.source==='lookup'?Models.parse(d.name):d,list=Models.bodiesFor(m.brand,m.model,d.year);return list.length?list:bodyOrder;};
  // Gentle check that the model year fits the model, e.g. a Volvo 240 from 2015 is probably a typo.
  const yearHint=d=>{const m=d.source==='lookup'?Models.parse(d.name):d,span=m.model&&Models.years(m.brand,m.model),y=Number(d.year);if(!span||!y||(y>=span[0]&&y<=span[1]))return '';return `<p class="info-note" role="status">Huom: ${escape(m.brand+" "+m.model)} valmistettiin ${span[1]>=2099?'vuodesta '+span[0]+' alkaen':'vuosina '+span[0]+'–'+span[1]}. Tarkista vuosimalli.</p>`;};
  // When two generations were sold around the chosen year, the user picks the one that looks like their car.
  const genChoices=d=>{const m=d.source==='lookup'?Models.parse(d.name):d;return d.body&&m.model?Models.gens(m.brand,m.model,d.body,d.year):[];};
  const genOf=d=>{const list=genChoices(d);return list.length?(list.find(g=>g[0]===d.gen)||list.find(g=>g[2])||list[list.length-1])[0]:undefined;};
  function genPicker(d){const list=genChoices(d);if(!list.length)return '';const sel=genOf(d);return `<fieldset class="body-picker gen-picker"><legend>Sukupolvi</legend><p class="field-help">Vuoden ${escape(String(d.year))} tienoilla myytiin ${list.length===2?'kahta':list.length} sukupolvea. Valitse, kumpi näyttää autoltasi.</p><div>${list.map(([a,z])=>`<label><input type="radio" name="gen" value="${a}"${a===sel?' checked':''}><span class="body-tile">${Car.render(d.body,'#a9b8c8',a+'–'+(z>=2099?'':z),shapeOf(d,d.body,a))}<small>${a}–${z>=2099?'':z}</small></span></label>`).join('')}</div></fieldset>`;}
  function lookStep(d){const choices=bodyChoices(d),known=choices!==bodyOrder;return `<button class="app-back nav-back" type="button" data-step-to="details">← Tiedot</button><p class="step-count">Vaihe 2 / 2</p><h2 class="app-heading">Korimalli ja väri</h2><p class="app-subtitle">${escape(d.name)}${known?choices.length>1?`: valitse, mikä näistä ${choices.length} korimallista autosi on.`:` on ${Car.names[choices[0]].toLowerCase()}. Valitse vielä väri.`:': valitse lähin korimalli.'}</p>${yearHint(d)}<div class="car-preview" id="car-preview">${preview(d)}</div><form class="app-form" id="look-form" novalidate><fieldset class="body-picker${choices.length===1?' single':''}"><legend>Korimalli</legend><div>${choices.map(b=>`<label><input type="radio" name="body" value="${b}"${b===d.body?' checked':''}><span class="body-tile">${Car.render(b,'#a9b8c8',Car.names[b],shapeOf(d,b))}<small>${Car.names[b]}</small></span></label>`).join('')}</div></fieldset>${genPicker(d)}<fieldset class="color-picker"><legend>Ulkoväri</legend><div>${Car.colors.map(([n,v])=>`<label title="${n}"><input type="radio" name="color" value="${v}"${v===d.color?' checked':''}><span style="--swatch:${v}"></span><small>${n}</small></label>`).join('')}</div></fieldset><p class="error-note" id="form-error" role="alert"></p><div class="form-actions"><button class="app-button" type="submit">Tallenna ajoneuvo</button></div><p class="app-fineprint">Mallikuva on tyylitelty kuvitus, ei valokuva autostasi.<br>${keepNote()}</p></form>`;}
  const Models=window.AjouraModels,opt=(v,sel,label=v)=>`<option value="${escape(v)}"${v===sel?' selected':''}>${escape(label)}</option>`;
  function modelOptions(d){const list=Models.models(d.brand);return list.length?'<option value="">Valitse malli</option>'+list.map(m=>opt(m.name,d.model)).join('')+opt('__other',d.model,'Muu malli…'):'';}
  function versionOptions(d){const m=Models.models(d.brand).find(m=>m.name===d.model);return m&&m.versions.length?'<option value="">Valitse versio (valinnainen)</option>'+m.versions.map(v=>opt(v,d.version)).join(''):'';}
  function makeFields(d){const known=Models.brands.includes(d.brand),mo=modelOptions(d),vo=versionOptions(d),otherBrand=d.brand==='__other',otherModel=d.model==='__other'||otherBrand;
    return `<div class="make-fields"><div class="make-search"><label for="make-search">Hae merkki tai malli</label><input id="make-search" type="search" data-make-search autocomplete="off" enterkeyhint="search" placeholder="Esim. Volvo tai Octavia"><div class="make-results" role="listbox" aria-label="Hakutulokset"></div></div><label>Merkki<select name="brand" data-make="brand"><option value="">Valitse merkki</option><optgroup label="Suosituimmat">${Models.top.map(b=>opt(b,d.brand)).join('')}</optgroup><optgroup label="Kaikki merkit">${Models.brands.map(b=>opt(b,d.brand)).join('')}</optgroup>${opt('__other',d.brand,'Muu merkki…')}</select></label>${otherBrand?`<label>Merkki <small>· kirjoita</small><input name="brandText" maxlength="20" autocomplete="off" placeholder="Esim. Lada" value="${escape(d.brandText||'')}"></label>`:''}<label${known?'':' hidden'}>Malli<select name="model" data-make="model"${known?'':' disabled'}>${mo}</select></label>${otherModel?`<label>Malli <small>· kirjoita</small><input name="modelText" maxlength="30" autocomplete="off" placeholder="Esim. Niva" value="${escape(d.modelText||'')}"></label>`:''}<label${vo?'':' hidden'}>Versio / moottori <small>· valinnainen</small><select name="version" data-make="version"${vo?'':' disabled'}>${vo}</select></label></div>`;}
  // Brand and model search: typing "octa" offers "Škoda Octavia"; accents and case don't matter.
  const fold=t=>String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  function makeMatches(q){const f=fold(q);if(!f)return [];const out=[],words=f.split(' ');
    // A make can also be found by its other name (SsangYong = KGM), see AjouraModels.alias.
    for(const b of Models.brands){const names=[b,...((Models.alias||{})[b]||[])].map(fold),hit=names.some(n=>n.startsWith(f)),fb=names.join(' ');if(hit||(f.length>1&&fb.includes(f)))out.push({brand:b,model:'',rank:hit?0:2});
      const bw=fb.split(' '),mw=words.filter(w=>!bw.some(x=>x.startsWith(w)));
      for(const m of Models.models(b)){if(/^Muu /.test(m.name))continue;const fm=fold(m.name),full=fb+' '+fm,fw=fm.split(' ');if(!words.every(w=>full.includes(w))||!mw.every(w=>fm.includes(w)))continue;
        out.push({brand:b,model:m.name,rank:fm.startsWith(f)||names.some(n=>(n+' '+fm).startsWith(f))||(mw.length&&mw.every(w=>fw.some(x=>x.startsWith(w))))?1:3});}}
    return out.sort((a,b)=>a.rank-b.rank||a.brand.localeCompare(b.brand,'fi')||a.model.localeCompare(b.model,'fi')).slice(0,8);}
  function showMatches(input){const box=input.parentElement.querySelector('.make-results'),list=makeMatches(input.value);
    box.innerHTML=list.length?list.map(r=>`<button type="button" role="option" data-pick-brand="${escape(r.brand)}" data-pick-model="${escape(r.model)}">${escape(r.brand)}${r.model?' <strong>'+escape(r.model)+'</strong>':' <small>· kaikki mallit</small>'}</button>`).join(''):input.value.trim()?'<p>Ei osumia. Valitse alta “Muu merkki…”.</p>':'';}
  // Model years as a list, newest first.
  const yearOptions=sel=>{const max=new Date().getFullYear()+1;let o='<option value="">Valitse vuosi</option>';for(let y=max;y>=1930;y--)o+=`<option${String(y)===String(sel)?' selected':''}>${y}</option>`;return o;};
  function makeName(d){const brand=d.brand==='__other'?(d.brandText||'').trim():d.brand,model=d.model==='__other'||d.brand==='__other'?(d.modelText||'').trim():d.model;return [brand,model,d.model!=='__other'&&d.version?d.version:''].filter(Boolean).join(' ').replace(/\s+/g,' ').slice(0,60);}
  function detailsStep(){const d=draft,year=new Date().getFullYear();return `<button class="app-back nav-back" type="button" data-step-to="${d.source==='lookup'||d.missed?'plate':'method'}">← Takaisin</button><p class="step-count">Vaihe 1 / 2</p><h2 class="app-heading">Ajoneuvon tiedot</h2>${d.source==='lookup'?`<p class="success-note" role="status">✓ ${escape(d.plate)}: ${escape(d.name)}, ${d.year}. Tarkista tiedot ja lisää mittarilukema.</p>`:d.missed?`<p class="info-note" role="status">Tunnuksella ${escape(d.plate)} ei löytynyt esimerkkiautoa. Syötä tiedot itse.</p>`:'<p class="app-subtitle">Valitse ensin merkki ja malli. Seuraavaksi näet sen korimallit.</p>'}<form class="app-form" id="car-form" novalidate><label>Rekisteritunnus<input name="plate" required maxlength="7" autocomplete="off" autocapitalize="characters" inputmode="text" value="${escape(d.plate)}"></label>${d.source==="lookup"?`<label>Merkki ja malli<input name="name" required minlength="2" maxlength="60" autocomplete="off" placeholder="Esim. Skoda Octavia" value="${escape(d.name)}"></label>`:makeFields(d)}<label>Lempinimi <small>· valinnainen</small><input name="nick" enterkeyhint="next" maxlength="24" autocomplete="off" placeholder="Esim. Perheauto" value="${escape(d.nick||'')}"></label><div class="form-row"><label>Vuosimalli<select name="year" required>${yearOptions(d.year)}</select></label><label>Mittarilukema (km)<input name="km" type="number" enterkeyhint="next" required min="0" max="2000000" step="1" inputmode="numeric" placeholder="120000" value="${escape(d.km||'')}"></label></div><label>Käyttövoima <small>· valinnainen</small><select name="fuel"><option value="">Valitse</option>${fuels.map(f=>`<option${f===d.fuel?' selected':''}>${f}</option>`).join('')}</select></label><p class="field-help">${d.source==='lookup'?'Perustiedot tulevat simuloidusta esimerkkirekisteristä. Mittarilukeman syötät itse.':'Lempinimi näkyy etusivulla auton nimenä.'}</p><p class="error-note" id="form-error" role="alert"></p><div class="form-actions"><button class="app-button" type="submit">Jatka <span aria-hidden="true">→</span></button><a class="app-button secondary" href="#home">Peruuta</a></div></form>`;}
  // Other vehicle kinds (vehicles.js): motorcycles, mopeds, ATVs, snowmobiles, boats, tractors… The add flow asks
  // the kind first. A car goes on to the car flow as before; other kinds get their own two steps in the same style.
  const kindsOn=()=>!!Kinds&&(!window.AjouraRoles||window.AjouraRoles.feature('kinds'));
  let carPicked=false;
  function kindStep(){return `${back('home','Koti')}<h2 class="app-heading">Uusi ajoneuvo</h2><p class="app-subtitle">Mikä ajoneuvo on kyseessä?</p><div class="kind-list">${Kinds.list.map(k=>`<button class="kind-card" type="button" data-kind="${k.id}"><span class="kind-art" aria-hidden="true">${k.id==='car'?Car.render('suv','#eef1f4','',{img:'autokuvat/hf_20261012_115346_738cdd8e-8e30-41d5-9f50-e2154aac6af5.webp',dimsOf:{L:4.69,WB:2.87,fo:.92,wd:.74}}):Kinds.icon(k.id)}</span><strong>${k.name}</strong><small>${k.hint}</small></button>`).join('')}</div><p class="app-fineprint">Kaikki ajoneuvosi näkyvät samassa tallissa.</p>`;}
  const fuelSelect=f=>`<label>Käyttövoima <small>· valinnainen</small><select name="fuel"><option value="">Valitse</option>${fuels.map(x=>`<option${x===f?' selected':''}>${x}</option>`).join('')}</select></label>`;
  const engineField=(kindId,v)=>kindId==='boat'||kindId==='other'?`<label>Moottori <small>· valinnainen</small><input name="engine" maxlength="40" autocomplete="off" placeholder="${kindId==='boat'?'Esim. Yamaha F60':'Esim. Honda GX160'}" value="${escape(v||'')}"></label>`:'';
  const regField=v=>`<label>Rekisteritunnus <small>· valinnainen</small><input name="reg" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${escape(v||'')}"></label>`;
  function kindDetails(d){const k=Kinds.kind(d.kind),list=Kinds.brands(d.kind),other=d.brand==='__other',models=other?[]:Kinds.models(d.kind,d.brand),h=k.unit==='h';
    return `<button class="app-back nav-back" type="button" data-step-to="kind">← Ajoneuvolaji</button><p class="step-count">Vaihe 1 / 2</p><h2 class="app-heading">Ajoneuvon tiedot</h2><p class="kind-chip"><span aria-hidden="true">${Kinds.icon(d.kind)}</span>${k.name}</p><p class="app-subtitle">Valitse merkki ja malli. Listalla ovat yleisimmät, muut voit kirjoittaa itse.</p><form class="app-form" id="kind-form" data-kind="${d.kind}" novalidate>
    <label>Merkki<select name="brand" required><option value="">Valitse merkki</option>${list.map(b=>`<option${b===d.brand?' selected':''}>${escape(b)}</option>`).join('')}<option value="__other"${other?' selected':''}>Muu merkki</option></select></label><label class="kind-brand-text"${other?'':' hidden'}>Kirjoita merkki<input name="brandText" maxlength="30" autocomplete="off" value="${escape(d.brandText||'')}"></label>
    <label>Malli <small>· valinnainen</small><input name="model" maxlength="40" autocomplete="off" list="kind-models" placeholder="${models[0]?'Esim. '+escape(models[0]):'Mallin nimi'}" value="${escape(d.model||'')}"><datalist id="kind-models">${models.map(m=>`<option value="${escape(m)}">`).join('')}</datalist></label>
    ${regField(d.plate)}<label>Lempinimi <small>· valinnainen</small><input name="nick" maxlength="24" autocomplete="off" value="${escape(d.nick||'')}"></label>
    <div class="form-row"><label>Vuosimalli<select name="year" required>${yearOptions(d.year)}</select></label><label>${h?'Tuntimittari (h)':'Mittarilukema (km)'}<input name="km" type="number" min="0" max="2000000" step="1" inputmode="numeric" placeholder="0" value="${d.km===''||d.km===undefined?'':escape(String(d.km))}"></label></div>
    ${fuelSelect(d.fuel)}${engineField(d.kind,d.engine)}<p class="error-note" id="form-error" role="alert"></p><div class="form-actions"><button class="app-button" type="submit">Jatka</button><a class="app-button secondary" href="#home">Peruuta</a></div></form>`;}
  // Brand picked: show the free-text field for "Muu merkki" and offer that brand's models.
  function kindBrand(sel){const f=sel.form,o=sel.value==='__other',box=f.querySelector('.kind-brand-text'),dl=f.querySelector('#kind-models'),m=o||!sel.value?[]:Kinds.models(f.dataset.kind,sel.value);if(box)box.hidden=!o;if(dl)dl.innerHTML=m.map(x=>`<option value="${escape(x)}">`).join('');if(f.elements.model)f.elements.model.placeholder=tl(m[0]?'Esim. '+m[0]:'Mallin nimi');if(o&&f.elements.brandText)f.elements.brandText.focus();}
  const tidyText=(v,n)=>String(v||'').trim().replace(/\s+/g,' ').slice(0,n);
  function readKind(form){const d=new FormData(form),b=String(d.get('brand')||''),brand=b==='__other'?tidyText(d.get('brandText'),30):b,model=tidyText(d.get('model'),40),kmRaw=String(d.get('km')??'').trim(),max=new Date().getFullYear()+1;
    const v={brand:b,brandText:b==='__other'?brand:'',model,name:(brand+' '+model).trim(),plate:tidyText(d.get('reg'),12).toUpperCase(),nick:tidyText(d.get('nick'),24),year:Number(d.get('year')),yearRaw:String(d.get('year')||''),km:kmRaw===''?0:Number(kmRaw),kmRaw,fuel:String(d.get('fuel')||''),engine:tidyText(d.get('engine'),40)};
    v.err=!brand?(b==='__other'?'Kirjoita merkki.':'Valitse merkki.'):v.name.length<2?'Kirjoita merkki ja malli.':!Number.isInteger(v.year)||v.year<1930||v.year>max?`Vuosimallin pitää olla väliltä 1930–${max}.`:!Number.isSafeInteger(v.km)||v.km<0||v.km>2000000?'Tarkista mittarilukema.':v.fuel!==''&&!fuels.includes(v.fuel)?'Valitse käyttövoima listasta.':'';return v;}
  function syncKind(form){if(!draft||!draft.kind)return;const v=readKind(form);Object.assign(draft,{brand:v.brand,brandText:v.brandText,model:v.model,name:v.name,plate:v.plate,nick:v.nick,year:v.yearRaw,km:v.kmRaw,fuel:v.fuel,engine:v.engine});}
  function saveKind(form){const v=readKind(form),err=document.getElementById('form-error');if(v.err){err.textContent=v.err;return;}syncKind(form);Object.assign(draft,{year:v.year,km:v.km,step:'look'});if(!Kinds.types(draft.kind).includes(draft.body))draft.body=Kinds.types(draft.kind)[0];render();screen.scrollTop=0;}
  const kindPreview=d=>`${Kinds.render(d.kind,d.body,d.color||'#b9c1ca','Esikatselu')}<span>${Kinds.typeName(d.kind,d.body)} · ${d.color?colorName(d.color):'valitse väri'}</span>`;
  function kindLook(d){const ts=Kinds.types(d.kind);return `<button class="app-back nav-back" type="button" data-step-to="details">← Tiedot</button><p class="step-count">Vaihe 2 / 2</p><h2 class="app-heading">${ts.length>1?'Tyyppi ja väri':'Väri'}</h2><p class="app-subtitle">${escape(d.name)}: ${ts.length>1?'valitse lähin tyyppi ja väri.':'valitse väri.'}</p><div class="car-preview" id="kind-preview">${kindPreview(d)}</div><form class="app-form" id="klook-form" novalidate>${ts.length>1?`<fieldset class="body-picker"><legend>Tyyppi</legend><div>${ts.map(t=>`<label><input type="radio" name="body" value="${t}"${t===d.body?' checked':''}><span class="body-tile">${Kinds.render(d.kind,t,'#a9b8c8',Kinds.typeName(d.kind,t))}<small>${Kinds.typeName(d.kind,t)}</small></span></label>`).join('')}</div></fieldset>`:`<input type="hidden" name="body" value="${ts[0]}">`}<fieldset class="color-picker"><legend>Väri</legend><div>${Car.colors.map(([n,v])=>`<label title="${n}"><input type="radio" name="color" value="${v}"${v===d.color?' checked':''}><span style="--swatch:${v}"></span><small>${n}</small></label>`).join('')}</div></fieldset><p class="error-note" id="form-error" role="alert"></p><div class="form-actions"><button class="app-button" type="submit">Tallenna ajoneuvo</button></div><p class="app-fineprint">Kuva on piirretty kuvitus, ei valokuva ajoneuvostasi.<br>${keepNote()}</p></form>`;}
  function syncKindLook(form){const f=new FormData(form),b=String(f.get('body')),c=String(f.get('color'));if(Kinds.types(draft.kind).includes(b))draft.body=b;if(Car.colors.some(([,v])=>v===c))draft.color=c;const box=document.getElementById('kind-preview');if(box)box.innerHTML=kindPreview(draft);const e=document.getElementById('form-error');if(e)e.textContent='';}
  function saveKindLook(form){syncKindLook(form);const d=draft,err=document.getElementById('form-error');if(!Car.colors.some(([,v])=>v===d.color)){err.textContent='Valitse väri.';return;}
    const id=uid('new-car'),car={id,kind:d.kind,name:d.name,nick:d.nick,plate:d.plate,year:d.year,km:d.km,body:d.body,color:d.color,fuel:d.fuel,...(d.engine?{engine:d.engine}:{}),events:[]};if(!validCar(car)){err.textContent='Tarkista tiedot.';return;}
    cars.push(car);draft=null;notice='✓ '+(d.nick||d.name)+' lisätty talliin.';document.getElementById('demo-announcement').textContent=(d.nick||d.name)+' lisätty ajoneuvoihin';persist();go('vehicle/'+id);}
  // Editing another kind: the same fields as a car, with the kind's own types and an optional registration.
  function kindEdit(c){const h=hourly(c);return `${back('vehicle/'+c.id,'Ajoneuvo')}<h2 class="app-heading">Muokkaa ajoneuvoa</h2><p class="kind-chip"><span aria-hidden="true">${Kinds.icon(c.kind)}</span>${Kinds.kind(c.kind).name}</p><form class="app-form" id="caredit-form" novalidate><label>Merkki ja malli<input name="name" required minlength="2" maxlength="60" autocomplete="off" value="${escape(c.name)}"></label>${regField(c.plate)}<label>Lempinimi <small>· valinnainen</small><input name="nick" enterkeyhint="next" maxlength="24" autocomplete="off" value="${escape(c.nick||'')}"></label><div class="form-row"><label>Vuosimalli<select name="year" required>${yearOptions(c.year)}</select></label><label>${h?'Tuntimittari (h)':'Mittarilukema (km)'}<input name="km" type="number" enterkeyhint="next" required min="0" max="2000000" inputmode="numeric" value="${c.km}"></label></div>${fuelSelect(c.fuel)}${engineField(c.kind,c.engine)}<div class="form-row"><label>Tyyppi<select name="body">${Kinds.types(c.kind).map(t=>`<option value="${t}"${t===c.body?' selected':''}>${Kinds.typeName(c.kind,t)}</option>`).join('')}</select></label><label>Väri<select name="color">${Car.colors.map(([n,v])=>`<option value="${v}"${v===c.color?' selected':''}>${n}</option>`).join('')}</select></label></div><p class="error-note" id="form-error" role="alert"></p><div class="form-actions"><button class="app-button" type="submit">Tallenna muutokset</button><a class="app-button secondary" href="#vehicle/${c.id}">Peruuta</a><a class="owner-link" href="#owner/${c.id}">${svg(icons.user)} Omistajanvaihdos</a><button class="app-back danger-link" type="button" data-remove="${c.id}">Poista ajoneuvo</button></div></form>`;}
  function saveKindEdit(form,c){const d=new FormData(form),err=document.getElementById('form-error'),name=tidyText(d.get('name'),60),year=Number(d.get('year')),kmRaw=String(d.get('km')).trim(),km=Number(kmRaw),fuel=String(d.get('fuel')||''),body=String(d.get('body')),color=String(d.get('color')),max=new Date().getFullYear()+1;
    if(name.length<2){err.textContent='Kirjoita merkki ja malli.';return;}if(!Number.isInteger(year)||year<1930||year>max){err.textContent=`Vuosimallin pitää olla väliltä 1930–${max}.`;return;}if(kmRaw===''){err.textContent='Syötä nykyinen mittarilukema.';return;}if(!Number.isSafeInteger(km)||km<0||km>2000000){err.textContent='Tarkista mittarilukema.';return;}
    if(!Kinds.types(c.kind).includes(body)||!Car.colors.some(([,v])=>v===color)||(fuel!==''&&!fuels.includes(fuel))){err.textContent='Tarkista valinnat.';return;}if(km<maxKm(c)){err.textContent=`Lukema ei voi olla pienempi kuin historiaan kirjattu ${number(maxKm(c))} ${ku(c)}. Korjaa tarvittaessa ensin väärä merkintä.`;return;}
    const engine=tidyText(d.get('engine'),40);Object.assign(c,{name,plate:tidyText(d.get('reg'),12).toUpperCase(),nick:tidyText(d.get('nick'),24),year,km,fuel,body,color});if(engine)c.engine=engine;else delete c.engine;persist();notice='✓ Tiedot päivitetty.';go('vehicle/'+c.id);}
  // Entry types: cars keep their list; other kinds get the ones that fit them.
  const kindsFor=c=>isCar(c)?kinds:[...planOf(c).ev,...kindTail];
  function newcar(){if(draft&&draft.kind)return draft.step==='look'?kindLook(draft):kindDetails(draft);return !draft?(lookup?plateStep():carPicked||!kindsOn()?methodStep():kindStep()):draft.step==='look'?lookStep(draft):detailsStep();}
  const kind=t=>/katsastus/i.test(t)?'inspect':/rengas|renkai/i.test(t)?'tyres':/jarru/i.test(t)?'repair':/huolto|öljy|suodat/i.test(t)?'service':'repair';
  function timeline(c,sorted){let last='';const kinds2=[['all','Kaikki'],['service','Huollot'],['repair','Korjaukset'],['inspect','Katsastukset'],['tyres','Renkaat']].filter(([k])=>k==='all'||sorted.some(e=>kind(e.type)===k));return `${sorted.length>=4&&kinds2.length>2?`<div class="timeline-filter" role="group" aria-label="Suodata historiaa">${kinds2.map(([k,l])=>`<button type="button" data-tl="${k}" aria-pressed="${k==='all'}">${l}</button>`).join('')}</div>`:''}<ol class="timeline">${sorted.map(e=>{const y=e.date.slice(0,4),head=y!==last?`<li class="timeline-year" data-y="${y}">${y}</li>`:'';last=y;return head+`<li class="timeline-item ${kind(e.type)}" data-y="${y}" data-cost="${e.cost&&Number.isFinite(Number(e.cost))?Number(e.cost):0}"><a href="#event/${c.id}/${e.id}"><span class="timeline-dot" aria-hidden="true"></span><span class="timeline-body"><strong>${escape(dispType(c,e.type))}</strong><small>${date(e.date)}${kmPart(e,c)}${e.items?.length?' · '+e.items.length+' toimenpidettä':''}${e.photos?.length?' · '+e.photos.length+' kuva'+(e.photos.length>1?'a':''):''}${e.receipts?.length?' · '+e.receipts.length+' kuitti'+(e.receipts.length>1?'a':''):''}</small></span>${e.cost?`<span class="timeline-cost">${number(e.cost)} €</span>`:''}</a></li>`;}).join('')}</ol><div class="timeline-total"><span>Yhteensä</span><strong id="tl-total">${number(costOf(sorted))} €</strong></div><a class="fab" href="#add/${c.id}" aria-label="Lisää merkintä">＋</a>`;}
  // Legacy estimate using model year and recorded history, not the official inspection schedule.
  // First-use date, vehicle class and other legal conditions are not available here.
  const inspMonths=window.AjouraAnalytics.inspMonths;
  function firstInspection(c){const y=Number(c.year);return y&&y+4>=Number(today().slice(0,4))?y+4:null;}
  function upcoming(c){const ev=[...c.events].sort(newest),svc=ev.find(isService),insp=ev.find(e=>e.type==='Katsastus'),t=today(),first=insp?null:firstInspection(c);
    const row=(label,last,months,km)=>{if(!last&&label==='Katsastus'&&first)return `<li><span class="up-dot"></span><span><strong>${label}</strong><small>Ensimmäinen katsastus arviolta vuonna ${first}, kun auto täyttää 4 vuotta.</small></span></li>`;if(!last)return `<li><span class="up-dot"></span><span><strong>${label}</strong><small>Kirjaa viimeisin, niin AJOURA arvioi seuraavan.</small></span></li>`;const due=addMonths(last.date,months),dueKm=km&&last.km!==null?last.km+km:null,late=due<t||(dueKm!==null&&c.km>=dueKm);return `<li class="${late&&label!=='Katsastus'?'late':''}"><span class="up-dot"></span><span><strong>${label}${label==='Katsastus'?' · arvio':late?' · myöhässä':''}</strong><small>Arvio: ${date(due)}${dueKm!==null?' tai '+number(dueKm)+' km':''}</small></span></li>`;};
    return `<div class="upcoming"><h3>Seuraavaksi</h3><ul>${row('Huolto',svc,profile.months,hourly(c)?0:profile.km)}${isCar(c)?row('Katsastus',insp,insp?inspMonths(c,insp):12,0):''}</ul>${isCar(c)?'<p>Huoltoarvio perustuu merkintöihisi ja huoltoväliin (Valikko → Asetukset).</p><p>Katsastuksen päivä on kirjaushistoriasta laskettu arvio. Virallinen määräpäivä ei ole tiedossa.</p><p><a href="https://www.traficom.fi/fi/autoilijat/tarkista-milloin-ajoneuvosi-maaraaikaiskatsastettava" target="_blank" rel="noopener noreferrer">Tarkista määräpäivä Traficomista</a></p>':`<p>Huoltoarvio perustuu merkintöihisi ja huoltoväliin${hourly(c)?' kuukausina, koska laitteessa on tuntimittari':''}. Huoltovälin voi vaihtaa kohdassa Valikko → Asetukset.</p>`}${svc||insp?`<button class="app-button secondary cal-button" type="button" data-ics="${c.id}">${svg(icons.bell)} Lisää muistutukset kalenteriin</button>`:''}</div>`;}
  // Calendar reminders: an .ics file with the estimated service and inspection dates, each with an alert a week
  // before. The phone's calendar does the reminding, so it works without a server or notifications permission.
  const dueDates=c=>window.AjouraAnalytics.dueDates(c,profile,{hourlyValue:hourly(c),isCarValue:isCar(c)});
  function calendar(id){const c=cars.find(c=>c.id===id);if(!c)return;const items=dueDates(c);if(!items.length)return;const stamp=new Date().toISOString().replace(/[-:]/g,'').slice(0,15)+'Z',esc=v=>String(v).replace(/[\\,;]/g,m=>'\\'+m).replace(/\n/g,'\\n');
    const day=d=>d.replace(/-/g,''),next=d=>{const t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+1);return t.toISOString().slice(0,10).replace(/-/g,'');};
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//AJOURA//Huoltomuistutus//FI','CALSCALE:GREGORIAN'];
    const t=today();for(const x of items.map(x=>x.due<t?{...x,due:t,late:true}:x))lines.push('BEGIN:VEVENT','UID:'+c.id+'-'+encodeURIComponent(x.what).replace(/%/g,'')+'@ajoura','DTSTAMP:'+stamp,'DTSTART;VALUE=DATE:'+day(x.due),'DTEND;VALUE=DATE:'+next(x.due),'SUMMARY:'+esc(x.what==='Katsastus'?'AJOURA: '+tl('Katsastusarvio')+' – '+carName(c):tl(`AJOURA: ${x.what}${x.late?' (myöhässä)':''} – ${carName(c)}`)),'DESCRIPTION:'+esc(tl(`AJOURAn arvio omien merkintöjesi perusteella${x.km?`, viimeistään ${number(x.km)} km`:''}.`)),'BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+esc(x.what==='Katsastus'?tl('Tarkista katsastuksen määräpäivä')+' – '+carName(c):tl(`${x.what} lähestyy: ${carName(c)}`)),((new Date(x.due)-new Date(t))/864e5<7?'TRIGGER:PT9H':'TRIGGER:-P7D'),'END:VALARM','END:VEVENT');
    lines.push('END:VCALENDAR');saveFile(new File([lines.join('\r\n')],'ajoura-muistutus-'+(c.plate.replace(/[^\wÅÄÖ]/g,'')||c.id)+'.ics',{type:'text/calendar'}),false);}
  // Due within 30 days or already late, across all cars, shown on top of the garage list.
  // Hands a file to the user: download where possible; with share=true the phone's share sheet is tried first.
  // Resolves false only when the user cancels the share sheet (0.44: the backup date is stamped only on true).
  async function saveFile(file,share){if(share&&navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:file.name});return true;}catch(e){if(e&&e.name==='AbortError')return false;}}
    const a=document.createElement('a');a.href=URL.createObjectURL(file);a.download=file.name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);return true;}
  // Company details printed on reports. The business ID is a placeholder until the company is registered.
  // Fill id and email once the company and its address exist; empty values are left off the report.
  const company={name:'AJOURA by DRONEX',id:'',web:'ajoura-app.github.io',email:''};
  const appVersion='2.02 (testiversio)';
  const isOil=e=>e.type==='Moottoriöljyn vaihto'||(e.items||[]).includes('Moottoriöljy');
  const monthsBetween=(a,b)=>(new Date(b)-new Date(a))/2629800000;
  // Average gap in months and km between consecutive events of one kind (oldest first).
  function gaps(list){const m=[],k=[];for(let i=1;i<list.length;i++){m.push(monthsBetween(list[i-1].date,list[i].date));if(list[i].km!==null&&list[i-1].km!==null)k.push(list[i].km-list[i-1].km);}const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;return {months:avg(m),km:avg(k)};}
  const fmtMonths=m=>m===null?'–':m<1.5?'alle 2 kk':Math.round(m)+' kk';
  // Analysis figures, shared by the screen report and the PDF (0.33).
  function anCalc(c,ev,total){
    const oil=ev.filter(isOil),svc=ev.filter(e=>isService(e)||isOil(e)),insp=ev.filter(e=>e.type==='Katsastus'),owners=ev.filter(e=>e.type==='Omistajanvaihdos');
    const og=gaps(oil),kmEv=ev.filter(e=>e.km!==null),span=ev.length>1?monthsBetween(ev[0].date,ev[ev.length-1].date)/12:0,kmSpan=kmEv.length>1?kmEv[kmEv.length-1].km-kmEv[0].km:0;
    const lastOil=oil[oil.length-1],biggest=ev.filter(e=>e.cost!==''&&e.cost!==undefined).sort((a,b)=>Number(b.cost)-Number(a.cost))[0];
    const perYearCost={},perYearFuel={};for(const e of ev)if(e.cost!==''&&e.cost!==undefined)perYearCost[e.date.slice(0,4)]=(perYearCost[e.date.slice(0,4)]||0)+Number(e.cost);for(const f of c.fuels||[])if(f.cost!==null){const y=f.date.slice(0,4);perYearFuel[y]=(perYearFuel[y]||0)+f.cost;perYearCost[y]=(perYearCost[y]||0)+f.cost;}const hasFuel=Object.keys(perYearFuel).length>0;
    const yrs=Object.keys(perYearCost).sort(),maxY=Math.max(1,...Object.values(perYearCost));
    return {oil,svc,insp,owners,og,span,kmSpan,lastOil,biggest,perYearCost,perYearFuel,hasFuel,yrs,maxY};}
  function analysis(c,ev,total){const {oil,svc,insp,owners,og,span,kmSpan,lastOil,biggest,perYearCost,perYearFuel,hasFuel,yrs,maxY}=anCalc(c,ev,total);
    const kpi=(v,l,sub='')=>`<div><strong>${v}</strong><span>${l}</span>${sub?`<small>${sub}</small>`:''}</div>`;
    return `<h3 class="report-h">Analyysi</h3><div class="report-kpis">${kpi(oil.length,oil.length===1?'Öljynvaihto':'Öljynvaihtoa',lastOil?'viimeksi '+date(lastOil.date):'ei kirjattu')}${kpi(og.months===null?'–':fmtMonths(og.months),'Öljynvaihtojen väli',og.km&&!hourly(c)?'noin '+number(Math.round(og.km/500)*500)+' km':'')}${kpi(svc.length,svc.length===1?'Huolto':'Huoltoa',insp.length?insp.length+(insp.length===1?' katsastus':' katsastusta'):'')}${kpi(span>=0.5?number(Math.round(total/span))+' €':'–','Kulut / vuosi',kmSpan>=1000&&!hourly(c)?number(Math.round(total/kmSpan*1000))+' € / 1000 km':'')}</div>
    <dl class="report-facts">${lastOil&&og.months?`<div><dt>Seuraava öljynvaihto arviolta</dt><dd>${date(addMonths(lastOil.date,Math.round(og.months)))}${lastOil.km!==null&&og.km&&!hourly(c)?' / '+number(lastOil.km+Math.round(og.km/500)*500)+' km':''}</dd></div>`:''}${biggest?`<div><dt>Suurin yksittäinen kulu</dt><dd>${escape(dispType(c,biggest.type))} · ${number(biggest.cost)} €</dd></div>`:''}${insp.length?`<div><dt>Viimeisin katsastus</dt><dd>${date(insp[insp.length-1].date)}</dd></div>`:''}<div><dt>Omistajanvaihdoksia kirjattu</dt><dd>${owners.length}</dd></div></dl>
    ${yrs.length>1?`<div class="report-bars${hasFuel?' split':''}" aria-label="Kulut vuosittain">${yrs.map(y=>`<div><span style="--h:${Math.max(4,Math.round(perYearCost[y]/maxY*100))}%">${perYearFuel[y]?`<i style="--f:${Math.round(perYearFuel[y]/perYearCost[y]*100)}%"></i>`:''}</span><b>${number(Math.round(perYearCost[y]))} €</b><small>${y}</small></div>`).join('')}</div>${hasFuel?'<p class="report-legend"><span class="lg-service"></span>Huolto ja korjaus <span class="lg-fuel"></span>Polttoaine</p>':''}`:''}`;}
  // Vehicle report figures (0.33): one calculation for the screen report and its PDF (vehicleDoc), so they always match.
  function repCalc(c){const ev=[...c.events].sort((a,b)=>a.date.localeCompare(b.date)),total=costOf(ev),receipts=ev.reduce((n,e)=>n+(e.receipts?.length||0),0),kmEv=ev.filter(e=>e.km!==null),first=kmEv[0],last=kmEv[kmEv.length-1];
    const years=first&&last&&last!==first?(new Date(last.date)-new Date(first.date))/31557600000:0,perYear=years>=0.5?Math.round((last.km-first.km)/years/(hourly(c)?10:100))*(hourly(c)?10:100):null;
    const byType={};for(const e of ev){const k=dispType(c,e.type),t=byType[k]||(byType[k]={n:0,cost:0});t.n++;t.cost+=e.cost!==''&&e.cost!==undefined?Number(e.cost):0;}
    const printed=date(today()),reportId='AJ-'+(c.plate.replace(/[^\wÅÄÖ]/g,'')||c.id.replace(/\D/g,''))+'-'+today().replace(/-/g,'');
    return {ev,total,receipts,perYear,byType,printed,reportId};}
  function report(c,from){const {ev,total,receipts,perYear,byType,printed,reportId}=repCalc(c);
    return `${from==='raportit'?back('reports','Raportit'):back('vehicle/'+c.id,'Ajoneuvo')}<div class="report" id="report"><header class="report-head"><img src="logo.svg" alt="AJOURA" width="640" height="198"><div><strong>Huoltohistoriaraportti</strong><span>Raportti ${reportId}</span><span>Tulostettu ${printed}</span></div></header><h2 class="app-heading">${escape(carName(c))}</h2><p class="app-subtitle">${c.nick?escape(c.name)+' · ':''}${c.plate?escape(c.plate)+' · ':''}vm. ${c.year} · ${typeOf(c)}${c.fuel?' · '+escape(c.fuel):''}${c.engine?' · '+escape(c.engine):''}</p>
    <div class="app-stats three"><div><strong>${ev.length}</strong><span>Merkintää</span></div><div><strong>${number(c.km)}</strong><span>${hourly(c)?'Tunnit nyt':'Km nyt'}</span></div><div><strong>${number(total)} <small>€</small></strong><span>Kulut</span></div></div>
    <dl class="report-facts">${ev.length?`<div><dt>Aikaväli</dt><dd>${date(ev[0].date)} – ${date(ev[ev.length-1].date)}</dd></div>`:''}${perYear!==null?`<div><dt>Ajoa keskimäärin</dt><dd>noin ${number(perYear)} ${ku(c)} / vuosi</dd></div>`:''}<div><dt>Kuitteja tallessa</dt><dd>${receipts} kpl</dd></div>${fuelFacts(c)}</dl>
    ${ev.length?analysis(c,ev,total):''}
    ${Object.keys(byType).length?`<h3 class="report-h">Yhteenveto</h3><table class="report-table"><thead><tr><th>Tyyppi</th><th>Kpl</th><th>€</th></tr></thead><tbody>${Object.entries(byType).sort((a,b)=>b[1].n-a[1].n).map(([t,v])=>`<tr><td>${escape(t)}</td><td>${v.n}</td><td>${number(v.cost)}</td></tr>`).join('')}</tbody></table>`:''}
    <div class="report-charts">${kmChart(c)}${fuelParts(c).map(p=>p.s.series.length>=2?fuelChart(p.v,p.s):'').join('')}</div>
    <h3 class="report-h">Kaikki merkinnät</h3>${ev.length?`<table class="report-table"><thead><tr><th>Pvm</th><th>Tapahtuma</th><th>${hourly(c)?'h':'Km'}</th><th>€</th></tr></thead><tbody>${[...ev].reverse().map(e=>`<tr><td>${date(e.date)}</td><td><strong>${escape(dispType(c,e.type))}</strong>${e.items?.length?`<small>${e.items.map(escape).join(', ')}</small>`:''}${e.note?`<small translate="no">${escape(e.note)}</small>`:''}${(m=>m?`<small class="rep-meta">${m}</small>`:'')(evMetaHtml(e))}</td><td>${e.km===null?'–':number(e.km)}</td><td>${e.cost!==''&&e.cost!==undefined?number(e.cost):'–'}</td></tr>`).join('')}</tbody></table>`:'<p class="app-empty">Ei vielä merkintöjä.</p>'}
    ${ev.some(e=>e.parts?.length)?`<h3 class="report-h">Käytetyt varaosat</h3><table class="report-table"><thead><tr><th>Pvm</th><th>Osa</th><th>Määrä</th><th>€</th></tr></thead><tbody>${[...ev].reverse().flatMap(e=>(e.parts||[]).map(x=>`<tr><td>${date(e.date)}</td><td translate="no">${escape(x.name)}</td><td>${escape(x.qty)||'–'}</td><td>${x.price?number(x.price):'–'}</td></tr>`)).join('')}</tbody></table>`:''}
    <p class="report-note">Raportti perustuu omistajan omiin merkintöihin${c.sample?' (esimerkkiauto, kuvitteelliset tiedot)':''}. Se ei korvaa valmistajan tai korjaamon virallista huoltokirjaa.</p>${ev.some(e=>e.created||e.updated)?'<p class="report-note">Lisäys- ja muokkausajat ovat puhelimen kellon mukaan.</p>':''}
    <footer class="report-foot"><div><strong>${company.name}</strong>${company.id?`<span>Y-tunnus ${company.id}</span>`:'<span>Kehitysvaiheen sovellus</span>'}</div><div><span>${company.web}</span>${company.email?`<span>${company.email}</span>`:''}</div><div><span>Tulostettu ${printed}</span><span>${reportId}</span></div></footer></div><button class="app-button no-print" type="button" data-vehicle-pdf="${c.id}">Tallenna PDF-raportti</button>${c.events.length?`<button class="app-button secondary no-print" type="button" data-sale="${c.id}">Jaa historia linkkinä</button><p class="app-fineprint no-print">Ostaja avaa linkin millä tahansa selaimella, sovellusta ei tarvita. Linkissä ovat auton tiedot ja merkinnät, myös merkintöjen muistiinpanot ja työn tekijä (vain yrityksen nimi tai ”Itse”). Kuvat, kuitit, yrityksen yhteystiedot ja Muistiinpanot-sivu eivät siirry. Jaettua linkkiä ei voi perua: kuka tahansa, jolla linkki on, voi avata sen. Linkki ei päivity: luo uusi, kun lisäät merkintöjä.</p>`:''}${notice?`<p class="success-note no-print" role="status">${escape(notice)}</p>`:''}<p class="app-fineprint no-print">Puhelimessa avautuu jakovalikko: tallenna raportti Tiedostoihin, tulosta se tai lähetä se esimerkiksi auton ostajalle. Tietokoneella PDF-tiedosto latautuu.</p>`;}
  // Ownership change: log it on the timeline, hand the history to the buyer as a report, then optionally remove the car.
  function owner(c){return `${back('vehicle/'+c.id,'Ajoneuvo')}<h2 class="app-heading">Omistajanvaihdos</h2><p class="app-subtitle">${escape(carName(c))} · ${plateTxt(c)}<br>Kolme vaihetta, kun myyt tai luovutat auton.</p><ol class="owner-steps"><li><strong>Kirjaa vaihdos</strong><span>Päivä ja mittarilukema jäävät auton historiaan.</span><form class="app-form" id="owner-form" novalidate><div class="form-row"><label>Päivämäärä<input name="date" type="date" required value="${today()}" max="${today()}"></label><label>${meterLabel(c)}<input name="km" type="number" min="${c.km}" max="2000000" inputmode="numeric" value="${c.km}"></label></div><label>Muistiinpano <small>· valinnainen</small><input name="note" maxlength="120" placeholder="Esim. myyty yksityiselle"></label><p class="error-note" id="form-error" role="alert"></p><button class="app-button" type="submit">Kirjaa omistajanvaihdos</button></form></li><li><strong>Anna historia uudelle omistajalle</strong><span>Lähetä ostajalle siirtotiedosto. Ostaja avaa omassa AJOURAssaan Valikko → Varmuuskopio ja tiedot → Palauta varmuuskopio, ja koko historia kuitteineen siirtyy hänelle. Raportti PDF:nä sopii ostajalle, jolla ei ole AJOURAa.</span><small class="bk-priv">Tiedostoa ei ole salattu. Siinä ovat myös kuvat, kuitit ja työn tekijöiden yhteystiedot, ja kuiteissa voi näkyä nimesi ja osoitteesi. Lähetä se vain ostajalle.</small><button class="app-button" type="button" data-transfer="${c.id}">Lähetä siirtotiedosto</button><button class="app-button secondary" type="button" data-sale="${c.id}">Jaa historia linkkinä</button><a class="app-button secondary" href="#report/${c.id}">Avaa raportti</a>${notice?`<p class="success-note" role="status">${escape(notice)}</p>`:''}</li><li><strong>Poista auto tallistasi</strong><span>Valinnainen. Poista vasta, kun olet tallentanut raportin.</span><button class="app-button secondary danger" type="button" data-remove="${c.id}">Poista ajoneuvo</button></li></ol>`;}
  function saveOwner(form){const c=cars.find(c=>c.id===route().id);if(!c)return;const d=new FormData(form),err=document.getElementById('form-error'),dt=String(d.get('date')),kmRaw=String(d.get('km')).trim(),km=kmRaw===''?null:Number(kmRaw),note=String(d.get('note')).trim().slice(0,120);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dt)||dt>today()){err.textContent='Tarkista päivämäärä.';return;}if(km!==null&&(!Number.isSafeInteger(km)||km<0||km>2000000)){err.textContent='Tarkista mittarilukema.';return;}if(km!==null&&km<maxKm(c)){err.textContent=`Lukema ei voi olla pienempi kuin auton kirjattu ${number(maxKm(c))} km.`;return;}if(c.events.some(e=>e.type==='Omistajanvaihdos'&&e.date===dt)){err.textContent='Omistajanvaihdos on jo kirjattu tälle päivälle.';return;}
    c.events.push({id:uid('new'),type:'Omistajanvaihdos',date:dt,km,cost:'',note,created:new Date().toISOString()});if(km!==null&&km>c.km)c.km=km;
    persist();notice='✓ Omistajanvaihdos kirjattu historiaan.';go('vehicle/'+c.id);}
  // Fuel log: fills (or charges) per car. Consumption is measured between full-tank fills, so a partial
  // fill in between is added to the next full one, the way a trip computer would.
  const unitOf=window.AjouraAnalytics.unitOf;
  const dec=(v,d=1)=>Number(v).toLocaleString('fi-FI',{minimumFractionDigits:d,maximumFractionDigits:d});
  const per=c=>hourly(c)?'h':'100 km';
  const susMax={l:40,kWh:80,kg:30};
  const fuelStats=c=>window.AjouraAnalytics.fuelStats(c,{hourlyValue:hourly(c)});
  // Small inline SVG line charts (no library). pts: [{x,y,cls?,tip}] in data units; avg draws a dashed level line.
  function lineChart(pts,{yFmt,xLabels,avg,avgLabel,line=true,cls=''}){if(pts.length<2)return '';const W=320,H=150,L=38,R=10,T=12,B=22;
    const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y).concat(avg!=null?[avg]:[]);let x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);if(x1===x0)x1=x0+1;const pad=(y1-y0)*.15||Math.abs(y1)*.1||1;y0=Math.max(0,y0-pad);y1+=pad;
    const X=v=>L+(v-x0)/(x1-x0)*(W-L-R),Y=v=>T+(1-(v-y0)/(y1-y0))*(H-T-B),r=v=>Math.round(v*10)/10;
    const grid=[0,.5,1].map(k=>{const v=y0+(y1-y0)*k;return `<line x1="${L}" x2="${W-R}" y1="${r(Y(v))}" y2="${r(Y(v))}" class="ch-grid"/><text x="${L-5}" y="${r(Y(v))+3}" text-anchor="end" class="ch-ax">${yFmt(v)}</text>`;}).join('');
    const path=line?`<polyline class="ch-line" points="${pts.map(p=>r(X(p.x))+','+r(Y(p.y))).join(' ')}"/>`:'';
    const av=avg!=null?`<line x1="${L}" x2="${W-R}" y1="${r(Y(avg))}" y2="${r(Y(avg))}" class="ch-avg"/><text x="${W-R}" y="${r(Y(avg))-4}" text-anchor="end" class="ch-avg-t">${avgLabel}</text>`:'';
    const dots=pts.map(p=>`<circle cx="${r(X(p.x))}" cy="${r(Y(p.y))}" r="${p.big?4:2.6}" class="ch-dot ${p.cls||''}"><title>${escape(p.tip)}</title></circle>`).join('');
    const xl=`<text x="${L}" y="${H-6}" class="ch-ax">${xLabels[0]}</text><text x="${W-R}" y="${H-6}" text-anchor="end" class="ch-ax">${xLabels[1]}</text>`;
    return `<svg class="chart ${cls}" viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="xMidYMid meet">${grid}${av}${path}${dots}${xl}</svg>`;}
  // Make/model-aware maintenance tips (tips.js): two shown, the rest behind a tap.
  function tipsCard(c){const T=window.AjouraTips;if(!T)return '';const list=T.forCar(c,window.AjouraModels&&window.AjouraModels.parse);if(!list.length)return '';const li=t=>`<li>${escape(t)}</li>`;
    return `<div class="tips-card"><h3>${svg(icons.wrench)} Huoltovinkit</h3><ul>${list.slice(0,2).map(li).join('')}</ul>${list.length>2?`<details><summary>Näytä kaikki vinkit (${list.length})</summary><ul>${list.slice(2).map(li).join('')}</ul></details>`:''}<p class="tips-note">Yleisiä vinkkejä merkin, mallin ja vuosimallin mukaan. Valmistajan huolto-ohjelma on aina ensisijainen.</p></div>`;}
  const dayNum=d=>Date.parse(d+'T12:00:00Z')/864e5;
  // Consumption per full-to-full interval, with the overall average as a dashed line.
  function fuelChart(c,s){const u=unitOf(c);if(s.series.length<2)return s.fills.length?`<p class="app-note chart-note">Kulutuskaavio näkyy, kun täysiä ${u==='kWh'?'latauksia':'tankkauksia'} on vähintään kolme.</p>`:'';
    const pts=s.series.map(p=>({x:p.km,y:p.v,tip:`${date(p.date)} · ${dec(p.v)} ${u}/${per(c)}`}));
    return `<div class="chart-card"><h3>Kulutus</h3>${lineChart(pts,{yFmt:v=>dec(v),xLabels:[number(s.series[0].km)+' '+ku(c),number(s.series[s.series.length-1].km)+' '+ku(c)],avg:s.avg,avgLabel:'Keskikulutus '+dec(s.avg)})}<p class="chart-legend"><span class="lg-line"></span>${u}/${per(c)} täysien ${u==='kWh'?'latausten':'tankkausten'} välillä <span class="lg-avg"></span>keskikulutus</p></div>`;}
  // Odometer over time: every km reading (entries and fill-ups), entries marked by kind.
  const kmKind=t=>/^(Omistajanvaihdos|Mittarilukeman päivitys|Muu tapahtuma|Pesu ja vahaus|Autohoito|Talvisäilytykseen|Käyttöönotto keväällä|Vesillelasku|Nosto talvisäilytykseen|Pohjamaalaus|Pesu ja hoito|Venehoito|Kesäsäilytykseen|Käyttöönotto syksyllä)$/.test(t)?'other':kind(t);
  // Odometer points for the chart, shared by the screen and the PDF (0.33); null when there is nothing to draw.
  function kmData(c){const pts=[...c.events.filter(e=>e.km!==null&&e.km!==undefined).map(e=>({x:dayNum(e.date),y:e.km,cls:'k-'+kmKind(e.type),big:true,tip:`${date(e.date)} · ${dispType(c,e.type)} · ${number(e.km)} ${ku(c)}`})),...(c.fuels||[]).map(f=>({x:dayNum(f.date),y:f.km,cls:'k-fuel',tip:`${date(f.date)} · ${fillKind(c,f)==='el'?'Lataus':'Tankkaus'} · ${number(f.km)} ${ku(c)}`}))].sort((a,b)=>a.x-b.x||a.y-b.y);
    if(pts.length<2||pts[0].x===pts[pts.length-1].x)return null;const first=pts[0],lastP=pts[pts.length-1],years=(lastP.x-first.x)/365.25,st=hourly(c)?10:100,per=years>=.25?Math.round((lastP.y-first.y)/years/st)*st:null;
    return {pts,first,lastP,per};}
  function kmChart(c){const k=kmData(c);if(!k)return '';const {pts,first,lastP,per}=k;
    const has=k=>pts.some(p=>p.cls==='k-'+k),lg=[['service','Huolto'],['repair','Korjaus'],['inspect','Katsastus'],['tyres','Renkaat'],['other','Muu merkintä'],['fuel',fillWord(c)]].filter(([k])=>has(k)).map(([k,l])=>`<span class="lg-dot k-${k}"></span>${l}`).join(' ');
    const fmtDate=x=>date(new Date(x*864e5).toISOString().slice(0,10));
    return `<div class="chart-card"><h3>${hourly(c)?'Käyttötuntien kehitys':'Kilometrien kehitys'}</h3>${per!==null&&per>0?`<p class="chart-sub">Keskimäärin ${number(per)} ${ku(c)} vuodessa</p>`:''}${lineChart(pts,{yFmt:v=>{const r=Math.max(...pts.map(p=>p.y))-Math.min(...pts.map(p=>p.y)),st=r>=20000?1000:r>=2000?100:r>=200?10:1;return number(Math.round(v/st)*st);},xLabels:[fmtDate(first.x),fmtDate(lastP.x)],cls:'km-chart'})}<p class="chart-legend">${lg}</p></div>`;}
  // Free-form notes about the car (tyre sizes, garage spot, part numbers…). Saved as the user types.
  // Notes: several dated notes per car on their own page. An older single note (c.notes) becomes the first one.
  function memosOf(c){if(typeof c.notes==='string'){if(c.notes.trim())(c.memos||(c.memos=[])).push({id:uid('memo'),date:today(),text:c.notes.slice(0,5000)});delete c.notes;}return c.memos||[];}
  const notesCard=c=>{const m=[...memosOf(c)].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)),first=m[0];return `<a class="fuel-link notes-link" href="#notes/${c.id}"><span class="event-symbol" aria-hidden="true">${svg(icons.note)}</span><span><strong>Muistiinpanot${m.length?' · '+m.length:''}</strong><small>${first?'Uusin: '+escape(memoTitle(first)):(isCar(c)?'Esim. renkaiden koot, hallipaikka, varaosanumerot':'Esim. säilytyspaikka, varaosanumerot, öljylaatu')}</small></span><span class="chevron" aria-hidden="true">›</span></a>`;};
  const memoTitle=m=>(m.title||'').trim()||m.text.trim().split('\n')[0].slice(0,80)||'Muistiinpano';
  let memoEdit='';const memoView=()=>prefGet('ajoura-memo-view')==='grid'?'grid':'list';
  function notesPage(c){const m=[...memosOf(c)].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
    return `${back('vehicle/'+c.id,'Ajoneuvo')}<h2 class="app-heading">Muistiinpanot</h2><p class="app-subtitle">${escape(carName(c))} · ${plateTxt(c)}</p>${notice?`<p class="success-note" role="status">${escape(notice)}</p>`:''}<form class="app-form memo-new" id="memo-form" novalidate><label>Otsikko<input name="title" maxlength="80" required autocomplete="off" placeholder="Esim. Renkaat, Hallipaikka, Varaosat"></label><label>Muistiinpano<textarea name="text" rows="3" maxlength="5000" placeholder="Esim. talvirenkaat 205/55 R16, hallipaikka 12, pyyhkijät 60 cm"></textarea></label><p class="error-note" id="form-error" role="alert"></p><button class="app-button" type="submit">Tallenna muistiinpano</button></form>
    ${m.length>1?`<div class="memo-bar"><span>${m.length} muistiinpanoa</span><div class="seg" role="group" aria-label="Näkymä">${[['list','☰ Lista'],['grid','▦ Ruudukko']].map(([v,l])=>`<button type="button" data-memo-view="${v}" aria-pressed="${v===memoView()}">${l}</button>`).join('')}</div></div>`:''}${m.length?`<ul class="memo-list${memoView()==='grid'?' grid':''}">${m.map(x=>x.id===memoEdit?`<li class="memo editing"><form class="app-form" id="memo-edit-form" data-id="${x.id}" novalidate><input name="title" maxlength="80" required autocomplete="off" aria-label="Otsikko" placeholder="Otsikko" value="${escape(x.title||'')}"><textarea name="text" rows="4" maxlength="5000" aria-label="Muokkaa muistiinpanoa">${escape(x.text)}</textarea><p class="error-note" id="edit-error" role="alert"></p><div class="memo-actions"><button class="app-button" type="submit">Tallenna</button><button class="app-button secondary" type="button" data-memo-cancel>Peruuta</button></div></form></li>`:`<li class="memo"><h3${(x.title||'').trim()||x.text.trim()?' translate="no"':''}>${escape(memoTitle(x))}</h3><small>${date(x.date)}</small><p translate="no">${escape(x.text)}</p><div class="memo-actions"><button class="link-button" type="button" data-memo-edit="${x.id}">Muokkaa</button><button class="link-button danger-text" type="button" data-memo-del="${x.id}">Poista</button></div></li>`).join('')}</ul>`:'<p class="app-empty">Ei vielä muistiinpanoja. Kirjoita ensimmäinen yllä.</p>'}<p class="app-fineprint">Muistiinpanot ovat vain sinun: ne eivät siirry ostajalle siirtotiedostossa eivätkä historialinkissä.</p>`;}
  function saveMemo(form){const c=cars.find(c=>c.id===route().id);if(!c)return;const f=new FormData(form),title=String(f.get('title')).trim().replace(/\s+/g,' ').slice(0,80),text=String(f.get('text')).trim().slice(0,5000),err=document.getElementById('form-error');if(!title){err.textContent='Anna muistiinpanolle otsikko, niin löydät sen helpommin.';form.elements.title.focus();return;}if(!text){err.textContent='Kirjoita ensin muistiinpano.';form.elements.text.focus();return;}memosOf(c);if((c.memos||[]).length>=300){err.textContent='Autolla voi olla enintään 300 muistiinpanoa. Poista ensin vanhoja.';return;}(c.memos||(c.memos=[])).push({id:uid('memo'),date:today(),title,text});persist();notice='✓ Muistiinpano tallennettu.';render();}
  function saveMemoEdit(form){const c=cars.find(c=>c.id===route().id),x=c&&memosOf(c).find(m=>m.id===form.dataset.id);if(!x)return;const f=new FormData(form),title=String(f.get('title')).trim().replace(/\s+/g,' ').slice(0,80),text=String(f.get('text')).trim().slice(0,5000),err=document.getElementById('edit-error');if(!title){err.textContent='Anna muistiinpanolle otsikko.';form.elements.title.focus();return;}if(!text){err.textContent='Muistiinpano ei voi olla tyhjä.';form.elements.text.focus();return;}x.title=title;x.text=text;memoEdit='';persist();notice='✓ Muutokset tallennettu.';const y=screen.scrollTop;render();screen.scrollTop=y;}
  function deleteMemo(id){const c=cars.find(c=>c.id===route().id);if(!c||!confirm('Poistetaanko muistiinpano?'))return;c.memos=memosOf(c).filter(m=>m.id!==id);if(!c.memos.length)delete c.memos;persist();notice='Muistiinpano poistettu.';const y=screen.scrollTop;render();screen.scrollTop=y;}
  function fuelCard(c){const ps=fuelParts(c),mixed=chargeKinds(c).length>1,u=unitOf(c),one=ps.length===1?ps[0]:null;
    const small=mixed&&ps.length?ps.map(p=>p.s.avg!==null?`<span class="nw">${dec(p.s.avg)} ${p.u}/${per(c)}</span>`:`<span>${p.s.fills.length} kirjausta</span>`).join(' · '):one&&one.s.avg!==null?`Keskikulutus ${dec(one.s.avg)} ${one.u}/${per(c)}`:one?`${one.s.fills.length} kirjausta`:mixed&&chargeKinds(c).includes('el')?'Kirjaa tankkaukset ja lataukset':'Kirjaa tankkaukset ja näe kulutus';
    return `<a class="fuel-link" href="#fuel/${c.id}/ajoneuvo" data-fl-kindlink="${ps.length?ps[0].k:chargeKinds(c)[0]}"><span class="event-symbol" aria-hidden="true">${svg(icons.fuel)}</span><span><strong>${mixed&&chargeKinds(c).includes('el')?'Tankkaus ja lataus':u==='kWh'?'Latauskirja':'Tankkauskirja'}</strong><small>${small}</small></span><span class="chevron" aria-hidden="true">›</span></a>`;}
  function fuelFacts(c){const ps=fuelParts(c);return ps.map(({k,s,u})=>`${s.avg!==null?`<div><dt>${ps.length>1?(k==='el'?'Keskikulutus, sähkö':'Keskikulutus, polttoaine'):'Keskikulutus'}</dt><dd>${dec(s.avg)} ${u}/${per(c)}</dd></div>`:''}<div><dt>${u==='kWh'?'Latauskulut':'Polttoainekulut'}</dt><dd>${number(Math.round(s.cost))} € · ${s.fills.length} kirjausta</dd></div>`).join('');}
  // Fill-ups abroad: the amount is typed in the local currency and stored in euros with the rate used.
  const countries=[['FI','Suomi','EUR'],['SE','Ruotsi','SEK'],['NO','Norja','NOK'],['EE','Viro','EUR'],['LV','Latvia','EUR'],['LT','Liettua','EUR'],['DK','Tanska','DKK'],['DE','Saksa','EUR'],['PL','Puola','PLN'],['EU','Muu euromaa','EUR']];
  const baseRates={SEK:11,NOK:11.7,DKK:7.46,PLN:4.25};
  const curOf=code=>(countries.find(x=>x[0]===code)||countries[0])[2];
  const rateFor=(c,cur)=>{const f=[...(c.fuels||[])].reverse().find(x=>x.cur===cur&&x.rate);return f?f.rate:baseRates[cur]||1;};
  // Price per litre/kWh in euros for a date: the user's own priced fill-ups nearest in time, else a rough typical price.
  function priceGuess(c,dt){const priced=(c.fuels||[]).filter(f=>f.cost!==null&&f.qty>0&&!f.est).sort((a,b)=>Math.abs(dayNum(a.date)-dayNum(dt))-Math.abs(dayNum(b.date)-dayNum(dt))).slice(0,3);
    if(priced.length)return {v:priced.reduce((n,f)=>n+f.cost/f.qty,0)/priced.length,own:true};return {v:{Diesel:1.8,'Sähkö':.3,Kaasu:1.6}[c.fuel]||1.85,own:false};}
  // Litres, price per unit and total: any two give the third. The field typed last two times wins; the third is filled in.
  // Litres, price per unit and total: when two are typed the third is filled in. A field the user typed is never
  // overwritten; only the filled-in one is recalculated.
  const decIn=v=>String(v==null?'':v).replace(/[\s\u00a0]/g,'').replace(',','.');
  // 0.114: laskettu arvo desimaalipilkulla kuten käyttäjän kirjoittamat (decIn lukee molemmat).
  function fuelCalc(form,changed){const el=form.elements,F=['qty','ppu','cost'],num=n=>{const v=decIn(el[n].value);return v===''?null:Number(v);};let user=(form.dataset.user||'').split(',').filter(Boolean);const auto=form.dataset.auto||'';
    if(changed&&F.includes(changed)){user=user.filter(n=>n!==changed);if(el[changed].value!=='')user.push(changed);if(changed===auto)form.dataset.auto='';if(changed==='ppu')el.est.value='';else if(el.est.value==='1'&&user.includes('qty')&&user.includes('cost')){user=user.filter(n=>n!=='ppu');el.est.value='';}}
    form.dataset.user=user.join(',');const r=(v,d)=>String(Math.round(v*10**d)/10**d);
    if(user.length!==2){if(user.length<2&&form.dataset.auto&&form.dataset.auto!==changed){el[form.dataset.auto].value='';form.dataset.auto='';}return;}
    const target=F.find(n=>!user.includes(n)),q=num('qty'),p=num('ppu'),t=num('cost');let v=null;
    if(target==='cost'&&q>0&&p!==null)v=r(q*p,2);else if(target==='ppu'&&q>0&&t!==null)v=r(t/q,3);else if(target==='qty'&&p>0&&t!==null)v=r(t/p,2);
    if(v!==null){el[target].value=v.replace('.',',');form.dataset.auto=target;}}
  function fuelGuess(form,c){if(!c)return;const el=form.elements,h=form.querySelector('.sheet-help'),user=(form.dataset.user||'').split(',');
    if(user.includes('qty')&&user.includes('cost')){if(h)h.textContent=tl('Hinta on jo laskettu litroista ja summasta.');return;}
    const cur=curOf(el.country.value),rate=cur==='EUR'?1:Number(decIn(el.rate.value))||1,g=priceGuess(c,String(el.date.value||today()));
    el.ppu.value=String(Math.round(g.v*rate*1000)/1000).replace('.',',');fuelCalc(form,'ppu');el.est.value='1';if(h)h.textContent=[g.own?'Arvio omien lähimpien tankkaustesi hinnasta.':'Karkea keskihinta, koska aiempia hintoja ei ole.',user.includes('qty')||user.includes('cost')?'':'Kirjoita vielä litrat tai summa.','Korjaa, jos muistat oikean.'].filter(Boolean).map(tl).join(' ');}
  function saveFuel(form,c=cars.find(x=>x.id===route().id)){if(!c)return;const edit=form.dataset.edit?(c.fuels||[]).find(x=>x.id===form.dataset.edit):null,d=new FormData(form),kd=c.fuel==='Sähkö'||d.get('kind')==='el'?'el':'fuel',err=form.querySelector('[role=alert]'),dt=String(d.get('date')),km=Number(d.get('km')),qty=Number(decIn(d.get('qty'))||NaN),costRaw=decIn(d.get('cost')),country=String(d.get('country')||'FI'),cur=curOf(country),rate=cur==='EUR'?1:Number(decIn(d.get('rate'))||NaN),amt=costRaw===''?null:Number(costRaw),cost=amt===null?null:amt/rate;if(cur!=='EUR'&&!(rate>0&&rate<1000)){err.textContent='Tarkista valuuttakurssi.';return;}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dt)||dt>today()){err.textContent='Tarkista päivämäärä.';return;}if(String(d.get('km')).trim()===''){err.textContent='Syötä nykyinen mittarilukema.';return;}if(!Number.isSafeInteger(km)||km<0||km>2000000){err.textContent='Tarkista mittarilukema.';return;}if(!(Math.round(qty*100)/100>0&&qty<=500)){err.textContent=kd==='el'?'Kirjoita ladattu määrä (kWh).':kd==='gas'?'Kirjoita tankattu määrä (kg).':'Kirjoita tankatut litrat.';return;}if(cost!==null&&!(cost>=0&&cost<=5000&&amt<=100000)){err.textContent='Tarkista hinta.';return;}
    const clash=(c.fuels||[]).find(f=>f!==edit&&(f.km===km||(f.date<dt&&f.km>km)||(f.date>dt&&f.km<km))),sig=dt+'|'+km;if(clash&&form.dataset.confirmed!==sig){form.dataset.confirmed=sig;err.textContent=`Lukema ${number(km)} ${ku(c)} ei sovi yhteen kirjauksen ${date(clash.date)} (${number(clash.km)} ${ku(c)}) kanssa. Tarkista lukema tai tallenna silti.`;const b=form.querySelector('[type=submit]');if(b)b.textContent='Tallenna silti';return;}
    if(!edit&&(c.fuels||[]).length>=2000){err.textContent='Tankkauksia voi olla enintään 2 000. Poista ensin vanhoja.';return;}
    const fill={id:edit?edit.id:uid('fuel'),date:dt,km,qty:Math.round(qty*100)/100,cost:cost===null?null:Math.round(cost*100)/100,full:d.get('full')==='on',...(country!=='FI'?{country}:{}),...(cur!=='EUR'&&amt!==null?{cur,amt:Math.round(amt*100)/100,rate}:{}),...(d.get('est')==='1'&&cost!==null?{est:true}:{}),...(d.get('grade')?{grade:String(d.get('grade')).slice(0,24)}:{}),...(d.get('skip')==='on'?{skip:true}:{}),...(kd==='el'&&c.fuel!=='Sähkö'?{el:true}:{})};if(!validFill(fill)){err.textContent='Tarkista määrä ja hinta.';return;}
    // 0.77: a fill-up that would make an impossible interval (fuelStats susMax, e.g. the odometer reading left unchanged)
    // asks once, like a clashing reading; "Tallenna silti" saves it, and the screens then mark it.
    {const cv=fcar(c,fillKind(c,fill)),had=new Set(fuelStats(cv).sus.map(x=>x.id)),bad=fuelStats({...cv,fuels:[...(cv.fuels||[]).filter(x=>x!==edit),fill]}).sus.find(x=>!had.has(x.id)),sg='c|'+sig+'|'+fill.qty;
      if(bad&&form.dataset.confirmed!==sg){form.dataset.confirmed=sg;err.textContent=`Kulutus olisi ${number(Math.round(bad.v))} ${unitOf(cv)}/100 km edellisestä täydestä ${unitOf(cv)==='kWh'?'latauksesta':'tankkauksesta'}. Tarkista mittarilukema tai tallenna silti.`;const sb=form.querySelector('[type=submit]');if(sb)sb.textContent='Tallenna silti';return;}}if(edit){for(const k of ['country','cur','amt','rate','est','grade','skip','el'])if(!(k in fill))delete edit[k];Object.assign(edit,fill);}else (c.fuels||(c.fuels=[])).push(fill);if(km>c.km)c.km=km;
    const avatarSaved=persist();if(avatarSaved&&form.dataset.taskAi)window.AjouraTasks.ai(c.id,'done');notice=kd==='el'?(edit?'✓ Lataus päivitetty.':'✓ Lataus tallennettu.'):(edit?'✓ Tankkaus päivitetty.':'✓ Tankkaus tallennettu.');if(form.id==='quickfuel-form')closeSheet();const y=screen.scrollTop;render();screen.scrollTop=y;refocusSheet();window.AjouraAvatar.react(avatarSaved?'success':'attention');}
  function removeFill(id){const c=cars.find(c=>c.id===route().id);if(!c||!c.fuels)return;if(!confirm('Poistetaanko tämä kirjaus?'))return;c.fuels=c.fuels.filter(x=>x.id!==id);persist();const y=screen.scrollTop;render();screen.scrollTop=y;refocusSheet();}
  // Tankkaus tab (0.40, Niklas 28.10.2026; havainnekuva hyväksytty). One vehicle at a time: consumption by month against the
  // same months a year earlier (winter raises consumption, so the month before would mislead), fuel costs by month and by
  // year, every fill-up grouped by month, editing a fill-up, and the fuel log as a PDF. The period works as on Raportit
  // (rpRange, rpPrev: Tämä vuosi, 12 kk, Kaikki) and the costs are the same sum of fill-ups as costsOf, so both
  // tabs show the same euros. Consumption comes from fuelStats (full tank to full tank) and belongs to the month in which
  // the interval ends. The choices (period, vehicle) are a view setting on this device; nothing here changes stored data.
  const flKey='ajoura-fuel';let flPick=null,flPickFor='',flAll=false,flCm=null,flFromTab=false,flCmOpen=false;
  // 0.99 (Niklas): seven periods in a fixed order (flPeriods), Mukautettu with the user's own dates, an own period for each
  // of the four key-figure cards (kp: missing = the page's period) and the order of the widgets (w). All of it is a view
  // setting in this browser's localStorage, like the rest of the Tankkaus choices: not part of the saved garage nor the
  // backup. An older version reads the same key and falls back to 12 kk for a period it does not know.
  const flPeriods=[['year','Tämä vuosi'],['prev','Edellinen vuosi'],['12','12 kk'],['month','Kuluva kuukausi'],['pmonth','Edellinen kuukausi'],['custom','Mukautettu'],['all','Kaikki']];
  const flKpis=['avg','price','cost','n'],flWidgets=[...flKpis,'trend','list','pdf'];
  const flOkD=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&x>='1950-01-01'&&x<=today();
  // One period setting {p,cf,ct,cu}: Mukautettu only with two valid dates in order (cu), otherwise the fallback.
  const flPer=(x,fb)=>{x=x&&typeof x==='object'?x:{};const cu=flOkD(x.cf)&&flOkD(x.ct)&&x.cf<=x.ct?{from:x.cf,to:x.ct}:null,ok=flPeriods.some(([k])=>k===x.p)&&(x.p!=='custom'||cu);
    return ok?{p:x.p,cf:cu?cu.from:'',ct:cu?cu.to:'',cu:x.p==='custom'?cu:null}:fb;};
  function flPrefs(){let o={};try{o=JSON.parse(prefGet(flKey)||'{}')||{};}catch(e){}const pg=flPer(o,{p:'12',cf:'',ct:'',cu:null}),kp={};
    if(o.kp&&typeof o.kp==='object')for(const k of flKpis){const v=flPer(o.kp[k],null);if(v)kp[k]=v;}
    const w=Array.isArray(o.w)?[...new Set(o.w.filter(x=>flWidgets.includes(x)))]:[];for(const x of flWidgets)if(!w.includes(x))w.push(x);
    return {p:pg.p,cf:pg.cf,ct:pg.ct,cu:pg.cu,kp,w,k:['all','fuel','gas','el'].includes(o.k)?o.k:'',car:typeof o.car==='string'?o.car.slice(0,40):'',t:o.t==='cmp'?'cmp':'car',off:Array.isArray(o.off)?o.off.filter(x=>typeof x==='string').slice(0,500):[],m:['cons','price','cost'].includes(o.m)?o.m:'cons',cm:flCm};}
  // Return the keyboard focus to the same control after a redraw. On a touch screen a drop-down list (select)
  // is left unfocused: iPhone opens the list again whenever a select gets the focus (v0.61).
  function refocus(sel){const f=sel&&screen.querySelector(sel);if(!f)return;if((f.tagName==='SELECT'||f.type==='date')&&matchMedia('(pointer: coarse)').matches)return;f.focus({preventScroll:true});}
  const flKeep=o=>{const {cm,cu,...keep}=o;keep.kp=Object.fromEntries(Object.entries(o.kp||{}).map(([k,v])=>[k,v.p==='custom'?{p:v.p,cf:v.cf,ct:v.ct}:{p:v.p}]));if(keep.p!=='custom'){delete keep.cf;delete keep.ct;}return JSON.stringify(keep);};
  function flSave(o,focus){prefSet(flKey,flKeep(o));const y=screen.scrollTop;render();screen.scrollTop=y;refocus(focus);}
  const monthNames=['tammikuu','helmikuu','maaliskuu','huhtikuu','toukokuu','kesäkuu','heinäkuu','elokuu','syyskuu','lokakuu','marraskuu','joulukuu'];
  const ucFirst=s=>s.charAt(0).toUpperCase()+s.slice(1),ymOf=d=>d.slice(0,7),mName=k=>monthNames[Number(k.slice(5,7))-1];
  const monthEnd=k=>{const [y,m]=k.split('-').map(Number);return k+'-'+String(new Date(y,m,0).getDate()).padStart(2,'0');};
  const dm=s=>Number(s.slice(8))+'.'+Number(s.slice(5,7))+'.';
  // Consumption changes are small, so they get one decimal; money changes stay whole per cent as on Raportit.
  const pct1=(now,was)=>was>0&&Number.isFinite(now)?Math.round((now-was)/was*1000)/10:null;
  const niceStep=x=>{const e=Math.pow(10,Math.floor(Math.log10(x>0?x:1))),f=x/e;return (f<=1?1:f<=2?2:f<=5?5:10)*e;};
  // All figures of the tab (and of its PDF) for one vehicle and period.
  function flCalc(c,p,cu){const s=fuelStats(c),fk=hourly(c)?1:100,t=today(),first=s.fills.length?s.fills.map(f=>f.date).sort()[0]:t,inP=(d,a,b)=>d>=a&&d<=b;
    const r=p==='all'?{from:first,to:t}:rpRange(p,cu),prev=rpPrev(p,cu),sum=(l,f)=>l.reduce((m,x)=>m+f(x),0);
    const part=(a,b)=>{const fl=s.fills.filter(f=>inP(f.date,a,b)),pr=fl.filter(f=>f.cost!==null),cost=sum(pr,f=>f.cost),pq=sum(pr,f=>f.qty),ser=s.series.filter(x=>inP(x.date,a,b)),sd=sum(ser,x=>x.d),avg=sd>0?sum(ser,x=>x.q)/sd*fk:null;
      return {fills:fl,cost,qty:sum(fl,f=>f.qty),price:pq>0?cost/pq:null,avg,per100:avg!==null&&pq>0?avg*cost/pq:null,ser,km:drivenIn(c,a,b)};};
    const now=part(r.from,r.to),was=prev?part(prev.from,prev.to):null;
    const mFrom=p!=='all'?r.from:(now.fills.filter(f=>f.cost).map(f=>f.date).sort()[0]||r.to),months=monthsIn(mFrom,r.to),pMonths=prev?monthsIn(prev.from,prev.to):1;
    // 0.76: costs are compared only when fill-ups were logged from the start of the comparison period (covers).
    const cov=!!prev&&!!s.fills.length&&[...s.fills].map(f=>f.date).sort()[0]<=addDays(prev.from,31);
    const keys=[];{let [y,m]=r.from.split('-').map(Number);const [ey,em]=r.to.split('-').map(Number);while(y<ey||(y===ey&&m<=em)){keys.push(y+'-'+String(m).padStart(2,'0'));if(++m>12){m=1;y++;}}}
    const bucket=(k,a,b)=>{const fl=s.fills.filter(f=>ymOf(f.date)===k&&inP(f.date,a,b)),ser=s.series.filter(x=>ymOf(x.date)===k&&inP(x.date,a,b)),sd=sum(ser,x=>x.d),pr=fl.filter(f=>f.cost!==null),pq=sum(pr,f=>f.qty),cost=sum(pr,f=>f.cost);
      return {k,n:fl.length,qty:sum(fl,f=>f.qty),cost,price:pq>0?cost/pq:null,avg:sd>0?sum(ser,x=>x.q)/sd*fk:null,ser};};
    // A month that is only partly in the period (its start, or the month going on) is marked, so its bar is not read as a whole month.
    const mon=keys.map(k=>({...bucket(k,r.from,r.to),prev:p==='all'?null:bucket((Number(k.slice(0,4))-1)+k.slice(4),'','9999').avg,partial:(k===ymOf(r.from)&&r.from.slice(8)!=='01')||(k===ymOf(r.to)&&r.to<monthEnd(k))}));
    const years=[];if(s.fills.length)for(let y=Number(first.slice(0,4));y<=Number(t.slice(0,4));y++){const a=y+'-01-01',e=y+'-12-31',b=e<t?e:t,pt=part(a,b);if(!pt.fills.length&&!pt.ser.length)continue;const st=a<first?first:a,partial=st>y+'-02-01'||b!==e;
      years.push({y,cost:pt.cost,avg:pt.avg,km:pt.km,n:pt.fills.length,qty:pt.qty,price:pt.price,months:partial?monthsIn(st,b):12,partial});}
    return {s,fk,p,from:r.from,to:r.to,prev,now,was,months,pMonths,mon,years,cov};}
  // Long histories (Kaikki over two years) are drawn by year instead of by month.
  const flBuckets=d=>d.mon.length>24?d.years.map(y=>({k:String(y.y),year:true,avg:y.avg,prev:null,cost:y.cost,qty:y.qty,price:y.price,partial:y.partial,ser:[],n:y.n})):d.mon;
  // Kulutuksen kehitys (0.96, compact): one blue line of the measured months (or years), the line broken where a month
  // has no full-to-full interval (no invented values). A tapped point (or the latest) shows the month's figures.
  function flLine(c,b,sel){const W=320,H=150,L=30,R=6,T=10,B=22,pw=W-L-R,ph=H-T-B,n=b.length,sw=pw/n,cx=i=>L+sw*(i+.5),r=v=>Math.round(v*10)/10,u=unitOf(c),pu=`${u}/${per(c)}`,ev=u==='kWh';
    const vals=b.map(x=>x.avg).filter(v=>v!=null);if(vals.length<2)return '';
    let y0=Math.min(...vals),y1=Math.max(...vals);const pad=(y1-y0)*.15||y1*.08||1;y0=Math.max(0,y0-pad);y1+=pad;const st=niceStep((y1-y0)/3);y0=Math.floor(y0/st)*st;y1=Math.ceil(y1/st)*st;
    const Y=v=>T+(1-(v-y0)/(y1-y0))*ph;let g='';
    for(let v=y0;v<=y1+st/1e3;v+=st)g+=`<line class="g" x1="${L}" x2="${W-R}" y1="${r(Y(v))}" y2="${r(Y(v))}"/><text class="ax" x="${L-5}" y="${r(Y(v))+4}" text-anchor="end">${dec(v,st<.1?2:st<1?1:0)}</text>`;
    // Year changes inside a monthly chart: a dashed line and the new year (the first year is left out when the new year
    // starts within two months, so the two labels never overlap).
    const jan=b.findIndex((x,i)=>i&&x.k.slice(5)==='01');if(!b[0].year)b.forEach((x,i)=>{if((i===0&&!(jan>0&&jan<3))||(i&&x.k.slice(5)==='01')){const lx=i?L+sw*i:L;if(i)g+=`<line class="yr" x1="${r(lx)}" x2="${r(lx)}" y1="${T}" y2="${H-B}"/>`;g+=`<text class="ax" x="${r(lx+4)}" y="${T+11}">${x.k.slice(0,4)}</text>`;}});
    {let out='',pts=[];const flush=()=>{if(pts.length>1)out+=`<polyline class="cur" points="${pts.join(' ')}"/>`;pts=[];};b.forEach((x,i)=>{if(x.avg==null)flush();else pts.push(r(cx(i))+','+r(Y(x.avg)));});flush();g+=out;}
    g+=b.map((x,i)=>x.avg==null||i===sel?'':`<circle class="pt" cx="${r(cx(i))}" cy="${r(Y(x.avg))}" r="3.2"/>`).join('');
    const every=n>13?2:1;g+=b.map((x,i)=>i%every&&i!==sel?'':`<text class="ax${i===sel?' on':''}" x="${r(cx(i))}" y="${H-6}" text-anchor="middle">${x.year?x.k:Number(x.k.slice(5))}</text>`).join('');
    const s=b[sel];if(s&&s.avg!=null){const x=cx(sel),bw=134,bx=x+10+bw<=W?x+9:x-9-bw,yr=s.year?s.k:s.k.slice(0,4),k=s.n;
      g+=`<line class="guide" x1="${r(x)}" x2="${r(x)}" y1="${T}" y2="${H-B}"/><circle class="sel" cx="${r(x)}" cy="${r(Y(s.avg))}" r="5.5"/>`;
      g+=`<rect class="tip" x="${r(bx)}" y="${T}" width="${bw}" height="52" rx="9"/><text class="tt b" x="${r(bx+10)}" y="${T+16}">${s.year?`<tspan>${yr}</tspan>`:`<tspan>${ucFirst(mName(s.k))}</tspan> <tspan>${yr}</tspan>`}</text><text class="tt b" x="${r(bx+10)}" y="${T+31}">${dec(s.avg)} ${pu}</text>`;
      g+=`<text class="tt" x="${r(bx+10)}" y="${T+45}"><tspan>${k}</tspan> <tspan>${ev?(k===1?'lataus':'latausta'):(k===1?'tankkaus':'tankkausta')}</tspan> · <tspan>${dec(s.cost,0)} €</tspan></text>`;}
    g+=b.map((x,i)=>`<rect class="hit" data-fl-m="${i}" x="${r(L+sw*i)}" y="${T}" width="${r(sw)}" height="${ph}"/>`).join('');
    return `<svg class="fl-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kulutuksen kehitys">${g}</svg>`;}
  // 0.77: what was done with an impossible interval (fuelStats sus): the date and value, and that the reading is checked.
  // 0.95: readings against the dates (fuelStats ord) get their own note: which readings, and that they are not used.
  function ordNote(c,s,ev){if(!s.ord||!s.ord.length)return '';
    return `<p class="fl-warn fl-ord" role="note"><b>Mittarilukemat ristiriidassa päivämäärien kanssa</b> <span>${s.ord.map(x=>`<span class="nw">${dm(x.date)} ${number(x.km)} ${ku(c)}</span>`).join(', ')}.</span> <span>Suurempi lukema on kirjattu aiemmalle päivälle kuin pienempi, joten näitä välejä ei käytetä kulutuksessa.</span> <span>${ev?'Tarkista lataus alla olevasta listasta.':'Tarkista tankkaus alla olevasta listasta.'}</span></p>`;}
  function susNote(c,s,ev){const on=ordNote(c,s,ev);if(!s.sus.length)return on;return on+susNote0(c,s,ev);}
  function susNote0(c,s,ev){const pu=`${unitOf(c)}/${per(c)}`,join=s.sus.some(x=>x.how==='join'),drop=s.sus.some(x=>x.how==='drop');
    return `<p class="fl-warn" role="note"><b>${s.sus.length===1?'Epätodennäköinen kulutusväli':'Epätodennäköisiä kulutusvälejä'}</b> <span>${s.sus.map(x=>`<span class="nw">${dm(x.date)} (${dec(x.v,0)} ${pu})</span>`).join(', ')}.</span> <span>${join&&!drop?'Mittarilukema on todennäköisesti väärin, joten väli on laskettu yhdessä seuraavan kanssa.':drop&&!join?'Mittarilukema on todennäköisesti väärin, joten väli on jätetty pois kulutuksesta.':'Mittarilukema on todennäköisesti väärin, joten väli on yhdistetty seuraavaan tai jätetty pois kulutuksesta.'}</span> <span>${ev?'Tarkista lataus alla olevasta listasta.':'Tarkista tankkaus alla olevasta listasta.'}</span></p>`;}
  // 0.96 (Niklas, havainnekuva): the tab's new look. Top: the title with a small Uusi tankkaus icon button (the style of
  // the home screen's quick actions), the vehicles as a row of picture buttons (one tap changes the vehicle; the compare
  // button turns the row into a multi-select) and the period on the same row. Then consumption and the average price as
  // two cards, a low summary line, a compact consumption trend and the fill-ups by month. The big Ajoneuvo/Vertailu
  // tabs, the vehicle drop-down list, the cost bars and the year table were dropped. All figures still come from flCalc
  // (fuelStats); the price is the cost of the priced fill-ups / their litres, i.e. weighted by the amount bought.
  const flCk='<svg viewBox="0 0 10 10" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5.2 4.2 7.3 8 3"/></svg>';
  const flEuro='<path d="M17.5 7A6 6 0 1 0 17.5 17"/><path d="M5 10.5h8M5 13.5h8"/>';
  const flTag='<path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9z"/><circle cx="8" cy="8" r="1.4"/>',flDrop='<path d="M12 3.5s6 6.4 6 10.8a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5z"/>';
  const flCmpIcon='<path d="M7 4v13M7 17l-3-3M7 17l3-3"/><path d="M17 20V7M17 7l-3 3M17 7l3 3"/>';
  // 0.98 (Niklas): the top is one row of three boxes: the vehicles (a list: a tap on a vehicle's name shows that vehicle,
  // its tick adds it next to the others, and two or more ticked vehicles show the comparison; flCmOpen keeps the list
  // open while ticking), the period in the middle and the Uusi tankkaus button at the right edge.
  const flPic=x=>`<span class="fv-vpic" aria-hidden="true">${x.photo?`<img src="${x.photo}" alt="">`:`<span class="fv-vart">${art(x,'')}</span>`}</span>`;
  function flBar(o,c,pPick,cmp,add){const fueled=cars.filter(x=>(x.fuels||[]).length),open=flCmOpen;flCmOpen=false;
    const sel=cmp?fueled.filter(x=>!o.off.includes(x.id)):[c];
    const shown=cmp?`<span class="rp-pick-t">${sel.length===fueled.length?'<span>Kaikki</span>':`<span>${sel.length}</span> <span>valittu</span>`}</span>`:`${flPic(c)}<span class="rp-pick-t" translate="no">${escape(c.plate||carName(c))}</span>`;
    const items=cars.map(x=>{const has=(x.fuels||[]).length,on=cmp?!!has&&!o.off.includes(x.id):x.id===c.id,i=cars.indexOf(x)%flCol.length;
      return `<div class="fv-mi${on?' on':''}"><button type="button" class="fv-mck" data-fl-cmpcar="${x.id}" aria-pressed="${on}"${has?'':' disabled'}><span class="fl-mck" aria-hidden="true">${on?flCk:''}</span><span class="sr-only">Vertailuun</span> <span class="sr-only" translate="no">${escape(carName(x))}</span></button><button type="button" class="fv-mname" data-fl-car="${x.id}"${!cmp&&x.id===c.id?' aria-current="true"':''}>${flPic(x)}<span class="fv-mtxt"><span class="fl-mn" translate="no">${escape(carName(x))}</span>${x.plate||!has?`<small>${x.plate?`<span translate="no">${escape(x.plate)}</span>`:''}${x.plate&&!has?' · ':''}${has?'':'<span>ei tankkauksia</span>'}</small>`:''}</span>${cmp&&on?`<i class="fl-sw" aria-hidden="true" style="border-top-color:${flCol[i]}${flDash[i]?';border-top-style:'+(flDash[i].startsWith('1.5')?'dotted':'dashed'):''}"></i>`:''}</button></div>`;}).join('');
    const veh=`<details class="rp-pick fl-cmenu fv-veh"${open?' open':''}><summary><span class="sr-only">Ajoneuvot</span>${shown}${chev}</summary><div class="fl-cmenu-list fv-mlist" role="group" aria-label="Ajoneuvot">${items}${fueled.length>1?'<p class="fv-mhint">Napauta ajoneuvoa, niin näet sen tiedot. Ruksi useampi, niin voit vertailla niitä.</p>':''}</div></details>`;
    // 0.101: Mukautettu's two dates under the row, not inside it (in 0.99 they pushed the Uusi tankkaus button down).
    return `<div class="fv-bar">${veh}${pPick}${add}</div>${o.p==='custom'?flDates('data-fl-custom',o.cf,o.ct):''}`;}
  function fuel(c,from){const o=flPrefs();fabFuel=null;
    const head=()=>`${from==='ajoneuvo'&&c?back('vehicle/'+c.id,'Ajoneuvo'):from==='raportit'?back('reports','Raportit'):''}<div class="rp-head fv-head"><div class="rp-titles"><h2 class="app-heading">Tankkaus</h2></div></div>`;
    if(!c)return `${top()}${head()}${emptyGarage()}`;
    // A link to one vehicle's fuel log (vehicle page, Raportit, the quick sheet) opens that vehicle, not the comparison;
    // the tab itself (#fuel) keeps the view the user left.
    if(o.t==='cmp'&&(!flFromTab&&lastKey!==location.hash||cars.filter(x=>(x.fuels||[]).length&&!o.off.includes(x.id)).length<2))o.t='car';
    if(o.car!==c.id||o.t!==flPrefs().t){o.car=c.id;prefSet(flKey,flKeep(o));}
    // 0.99: Mukautettu opens the two dates under the top row (the same form as on Raportit); the end can not be set
    // before the start (min) and a wrong pair is not saved.
    const pPick=rpPick('data-fl-period','Jakso',pLabel(o.p),flPeriods.map(([k,n])=>[k,k==='custom'?'Mukautettu…':n]),o.p),msg=notice?`<p class="success-note" role="status">${escape(notice)}</p>`:'';
    // 0.107: the add button is the floating ＋ (fab); flBar no longer has a third box.
    const addB=(id,k,name)=>{fabFuel={id,kind:k,name};return '';};
    if(o.t==='cmp')return fuelCompare(o,head(),flBar(o,c,pPick,true,addB(c.id,'',chargeKinds(c).includes('el')?(chargeKinds(c).length>1?'Lisää tankkaus tai lataus':'Lisää lataus'):'Lisää tankkaus')),msg);
    const real=c,kinds=chargeKinds(real),kd=kinds.includes(o.k)?o.k:kinds.length>1?'all':kinds[0];c=kd==='all'?real:fcar(real,kd);
    const kindTabs=kinds.length>1?`<div class="rp-tabs fl-kinds" role="group" aria-label="Laji"><button type="button" data-fl-kind="all" aria-pressed="${kd==='all'}">${svg(icons.chart)}<span>Yhteensä</span></button>${kinds.map(k=>`<button type="button" data-fl-kind="${k}" aria-pressed="${kd===k}">${svg(k==='el'?bolt:icons.fuel)}<span>${k==='el'?'Sähkö':k==='gas'?'Kaasu':'Polttoaine'}</span></button>`).join('')}</div>`:'';
    const u=unitOf(c),ev=u==='kWh',pu=`${u}/${per(c)}`;
    const addName=kd==='all'?(kinds.includes('el')?'Lisää tankkaus tai lataus':'Lisää tankkaus'):ev?'Lisää lataus':'Lisää tankkaus';
    const bar=flBar(o,real,pPick,false,addB(real.id,kd==='all'?'':kd,addName));
    const sample=c.sample?'<p class="app-note">Esimerkkiauto: kuvitteelliset tankkaukset ja hinnat.</p>':'';
    if(kd==='all')return `${top()}${head()}${bar}${kindTabs}${msg}${fuelAll(real,kinds,o)}${sample}`;
    const d=flCalc(c,o.p,o.cu),{s,now}=d,pName=flPName(o),n=now.fills.length;
    if(!s.fills.length)return `${top()}${head()}${bar}${kindTabs}${msg}<div class="rp-card"><p class="rp-empty">${ev?'Ei vielä latauksia. Kirjaa ensimmäinen, niin näet kulutuksen ja kulut kuukausittain.':'Ei vielä tankkauksia. Kirjaa ensimmäinen, niin näet kulutuksen ja kulut kuukausittain.'}</p></div>${sample}`;
    // Key figures: average consumption and the average unit price, as two cards side by side. A figure that cannot be
    // counted reliably (no two full fill-ups, or every interval left out) says so instead of showing a number.
    const ico=svg(ev?bolt:icons.fuel);
    // 0.99: each card can have its own period (o.kp). Its icon is the button for the card's settings, and the period in
    // use is shown under the figure. A card that follows the page's period uses the same figures as the rest of the page.
    const kv=k=>{const x=o.kp[k]||o;return {x,now:x.p===o.p&&(x.p!=='custom'||x.cf===o.cf&&x.ct===o.ct)?now:flCalc(c,x.p,x.cu).now};};
    const card=(k,icon,lab,fn)=>{const {x,now:v}=kv(k);return kpiCard({k,set:'data-fl-set',setLab:flSetT[k],icon,lab,val:fn(v),per:flPName(x),own:!!o.kp[k],cls:k==='avg'?' fl-big':''});};
    // 0.98 (Niklas): four key figures as equal cards (2 × 2): consumption, average price, costs, fill-ups and litres.
    const kc={avg:card('avg',ev?bolt:icons.fuel,'Keskikulutus',v=>v.avg!==null?`<b>${dec(v.avg)}</b> <span class="nw">${pu}</span>`:'<b class="fv-na">Ei riittävästi tietoa</b>'),
      price:card('price',flTag,'Keskihinta',v=>v.price!==null?`<b>${dec(v.price,ev?2:3)}</b> <span class="nw">€/${u}</span>`:'<b class="fv-na">Ei hintatietoa</b>'),
      cost:card('cost',flEuro,'Kulut yhteensä',v=>`<b>${number(Math.round(v.cost))}</b> <span>€</span>`),
      n:card('n',ev?bolt:flDrop,ev?'Lataukset':'Tankkaukset',v=>`<b>${v.fills.length}</b> <span class="nw">/ ${dec(v.qty,0)} ${u}</span>`)};
    // Kulutuksen kehitys: the measured months of the period (years for a long history). Fewer than two measured months
    // gives a short note instead of a chart.
    const b=flBuckets(d);if(flPickFor!==c.id+'|'+o.p+'|'+kd){flPick=null;flPickFor=c.id+'|'+o.p+'|'+kd;}
    let sel=flPick!==null&&flPick<b.length?flPick:-1;if(sel<0){for(let i=b.length-1;i>=0;i--)if(b[i].avg!=null){sel=i;break;}}
    const chart=flLine(c,b,sel),yb=b[0].year;
    const trend=`<section class="rp-card fv-trend fv-w fv-wide" data-fw="trend" aria-labelledby="fv-h2"><div class="rp-hrow"><h3 class="rp-h" id="fv-h2">Kulutuksen kehitys</h3><small class="fl-unit">${pu}</small></div>${chart?`${chart}<p class="fl-note">${yb?'Napauta vuotta, niin näet tarkat luvut.':'Napauta kuukautta, niin näet tarkat luvut.'}</p>`:`<p class="fl-note">${ev?'Kehitys näkyy, kun kulutus on laskettu täysien latausten väliltä vähintään kahdelta kuukaudelta.':'Kehitys näkyy, kun kulutus on laskettu täysien tankkausten väliltä vähintään kahdelta kuukaudelta.'}</p>`}</section>`;
    // Fill-ups of the period by month, newest first; the two latest months open. A tap opens the fill-up for editing.
    const cons=new Map(s.series.map(x=>[x.id,x.v])),susIds=new Set([...s.sus,...s.ord].map(x=>x.id)),groups=[];for(const f of [...now.fills].sort((a,b2)=>b2.date.localeCompare(a.date)||b2.km-a.km)){const k=ymOf(f.date);let g=groups[groups.length-1];if(!g||g.k!==k){g={k,list:[]};groups.push(g);}g.list.push(f);}
    const fType=f=>f.grade||(ev?'Sähkö':c.fuel)||'';
    const row=f=>{const cv=cons.get(f.id),cn=f.country&&f.country!=='FI'?(countries.find(k=>k[0]===f.country)||['','',''])[1]:'',t=fType(f);
      const sub=[`<span class="nw"><span>${number(f.km)}</span> <span>${ku(c)}</span></span>`,t?`<span>${escape(t)}</span>`:'',`<span class="nw">${dec(f.qty,2)} ${u}</span>`,cv!=null?`<span class="nw">${dec(cv)} ${pu}</span>`:'',!f.full?'<span>osatankkaus</span>':'',cn?`<span>${escape(cn)}</span>`:'',f.est?'<span>hinta-arvio</span>':'',f.skip?'<span class="fl-skip">ei kulutukseen</span>':'',susIds.has(f.id)?'<span class="fl-sus">Tarkista mittarilukema</span>':''].filter(Boolean).join(' · ');
      return `<button type="button" class="fl-row fv-row" data-fl-edit="${f.id}"><span class="fv-rico" aria-hidden="true">${ico}</span><span class="fl-rl"><b>${date(f.date)}</b><small>${sub}</small></span><span class="fl-rm"><b class="nw">${f.cost!==null?dec(f.cost,2)+' €':'–'}</b>${f.cost!==null&&f.qty>0?`<small class="nw">${dec(f.cost/f.qty,3)} €/${u}</small>`:''}</span><span class="sr-only">Muokkaa</span></button>`;};
    const gHtml=(g,i)=>{const e=g.list.filter(f=>f.cost!==null).reduce((m,f)=>m+f.cost,0);
      return `<details class="fl-g fv-g"${i<2?' open':''}><summary><span class="fl-gt"><span>${ucFirst(mName(g.k))}</span> <span>${g.k.slice(0,4)}</span></span><b class="fv-gsum nw">${dec(e,2)} €</b>${chev}</summary>${g.list.map(row).join('')}</details>`;};
    const list=`<section class="rp-card fl-list fv-list fv-w fv-wide" data-fw="list" aria-labelledby="fl-h3"><div class="rp-hrow"><h3 class="rp-h" id="fl-h3">${ev?'Lataukset kuukausittain':'Tankkaukset kuukausittain'}</h3></div>${!n?`<p class="rp-empty">${ev?'Ei latauksia valitulla jaksolla.':'Ei tankkauksia valitulla jaksolla.'}</p>`:''}${(flAll?groups:groups.slice(0,6)).map(gHtml).join('')}${!flAll&&groups.length>6?`<button type="button" class="fl-moreb" data-fl-all><span>Näytä vanhemmat kuukaudet</span> <span>(${groups.length-6})</span></button>`:''}<p class="fl-sub">${ev?'Napauta latausta, niin voit muokata tai poistaa sen.':'Napauta tankkausta, niin voit muokata tai poistaa sen.'}</p></section>`;
    const pdf=`<div class="fv-w fv-wide fv-pdfw" data-fw="pdf"><button type="button" class="rp-card rp-pdf" data-fl-pdf="${c.id}"><span class="rp-pdf-ico" aria-hidden="true">${svg(icons.doc)}</span><span class="rp-rtxt"><strong>${ev?'Tallenna latauskirja':'Tallenna tankkauskirja'}</strong><small><span translate="no">${escape(carName(c))}</span> · <span class="nw">${pName}</span> · <span class="nw">PDF-tiedosto</span></small></span><span class="chevron" aria-hidden="true">›</span></button><p class="fl-fine">Puhelimessa avautuu jakovalikko: tallenna tiedostoihin, tulosta tai lähetä. Tietokoneella PDF latautuu.</p></div>`;
    // 0.99: the seven widgets in one grid in the user's order (o.w): a key-figure card takes one column, the others two.
    const wid={...kc,trend,list,pdf};
    return `${top()}${head()}${bar}${kindTabs}${msg}${susNote(c,s,ev)}<div class="fv-grid fl-sum" data-fl-grid data-w-grid="fuel">${o.w.map(k=>wid[k]).join('')}</div>${sample}`;}
  // 0.70: a vehicle that uses fuel and electricity (or gas and fuel) shows both on one page, so the real cost of driving
  // is seen: each kind's consumption in its own unit (litres, kWh and kg cannot be added), the costs added together
  // and divided by the kilometres driven. The charts and fill-up lists of one kind are behind its own button.
  function fuelAll(c,kinds,o){const parts=kinds.map(k=>{const v=fcar(c,k),d=flCalc(v,o.p,o.cu);return {k,v,d,u:unitOf(v)};}),d0=parts[0].d,fk=hourly(c)?1:100;
    if(!(c.fuels||[]).length)return `<div class="rp-card"><p class="rp-empty">Ei vielä tankkauksia. Kirjaa ensimmäinen, niin näet kulutuksen ja kulut kuukausittain.</p></div>`;
    const sum=(l,f)=>l.reduce((m,x)=>m+f(x),0),tot=sum(parts,x=>x.d.now.cost),wasTot=parts.some(x=>x.d.was)&&parts.filter(x=>x.d.now.cost>0).every(x=>x.d.cov)?sum(parts,x=>x.d.was?x.d.was.cost:0):null,km=drivenIn(c,d0.from,d0.to),run=km>0&&tot>0?tot/km*fk:null,
      wasKm=d0.prev?drivenIn(c,d0.prev.from,d0.prev.to):0,wasRun=wasKm>0&&wasTot>0?wasTot/wasKm*fk:null,pName=flPName(o),lab={el:'Sähkö',gas:'Kaasu',fuel:'Polttoaine'};
    const dl=(a,b)=>a!==null&&b!==null?`<em class="rp-dl">${rpDelta(pctOf(a,b),a===run)}</em>`:'';
    const rows=parts.map(x=>`<tr><th scope="row">${lab[x.k]}</th><td>${x.d.now.avg!==null?`<span class="nw">${dec(x.d.now.avg)} ${x.u}/${per(c)}</span>`:'–'}</td><td><span class="nw">${dec(x.d.now.qty,0)} ${x.u}</span></td><td><b>${eur(x.d.now.cost)}</b></td></tr>`).join('');
    return `<section class="rp-card fl-sum fl-all" aria-labelledby="fl-all"><h3 class="rp-h fl-allh" id="fl-all"><span>Todellinen kulutus</span> · <span>${pName}</span></h3>
      <div class="rp-kpis"><div><small>Kulut yhteensä</small><b class="big">${eur(tot)}</b>${dl(tot,wasTot)}</div><div><small>Ajon hinta</small><b>${run!==null?dec2(run):'–'}</b>${run!==null?`<em>€/${per(c)}</em>`:''}${dl(run,wasRun)}</div><div><small>${hourly(c)?'Käyttötunnit':'Ajetut kilometrit'}</small><b>${km?number(km):'–'}</b>${km?`<em>${ku(c)}</em>`:''}</div></div>
      <div class="fl-allbody"><table class="fl-table"><thead><tr><th scope="col">Laji</th><th scope="col">Kulutus</th><th scope="col">Määrä</th><th scope="col">€</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="fl-note">Ajon hinta on kaikkien lajien kulut yhteensä jaettuna ajetuilla kilometreillä. Kaaviot ja kirjaukset näet napauttamalla lajia yllä.</p></div></section>`;}
  function fuelClick(t){const o=flPrefs(),y=screen.scrollTop;
    // 0.98: a tap outside the open vehicle list closes it (the list stays open while ticking).
    {const om=screen.querySelector('.fv-veh[open]');if(om&&!om.contains(t))om.open=false;}
    const kb=t.closest('[data-fl-kind]');if(kb){o.k=kb.dataset.flKind;flAll=false;flSave(o,`[data-fl-kind="${o.k}"]`);return true;}
    const tab=t.closest('[data-fl-tab]');if(tab){o.t=tab.dataset.flTab;flCm=null;flSave(o,'.fv-cmp');return true;}
    const cc=t.closest('[data-fl-cmpcar]');if(cc&&!cc.disabled){const id=cc.dataset.flCmpcar,fu=cars.filter(c=>(c.fuels||[]).length).map(c=>c.id);
      // 0.98: the tick adds or removes a vehicle; one ticked vehicle is the single view, two or more the comparison.
      let sel=o.t==='cmp'?fu.filter(x=>!o.off.includes(x)):fu.filter(x=>x===o.car);sel=sel.includes(id)?sel.filter(x=>x!==id):[...sel,id];if(!sel.length)return true;
      flCmOpen=true;flCm=null;flAll=false;if(sel.length===1){o.t='car';o.car=sel[0];history.replaceState(null,'','#fuel/'+sel[0]);}else{o.t='cmp';o.off=fu.filter(x=>!sel.includes(x));}flSave(o,`[data-fl-cmpcar="${id}"]`);return true;}
    if(t.closest('[data-fl-cmpall]')){o.off=[];flCmOpen=true;flSave(o,'[data-fl-cmpcar]');return true;}
    const mt=t.closest('[data-fl-metric]');if(mt){o.m=mt.dataset.flMetric;flSave(o,`[data-fl-metric="${o.m}"]`);return true;}
    const cm=t.closest('[data-fl-cm]');if(cm){flCm=Number(cm.dataset.flCm);render();screen.scrollTop=y;return true;}
    const car=t.closest('[data-fl-car]');if(car){const id=car.dataset.flCar;if(!cars.some(c=>c.id===id))return true;o.car=id;o.t='car';flAll=false;flCm=null;history.replaceState(null,'','#fuel/'+id);flSave(o,'.fv-veh>summary');return true;}
    const m=t.closest('[data-fl-m]');if(m){flPick=Number(m.dataset.flM);render();screen.scrollTop=y;return true;}
    if(t.closest('[data-fl-all]')){flAll=true;render();screen.scrollTop=y;return true;}
    const pd=t.closest('[data-fl-pdf]');if(pd){fuelPdf(pd.dataset.flPdf);return true;}
    const st=t.closest('[data-fl-set]');if(st){flSheet(st.dataset.flSet,st);return true;}
    const ed=t.closest('[data-fl-edit]');if(ed){const c=cars.find(c=>c.id===route().id),f=c&&(c.fuels||[]).find(x=>x.id===ed.dataset.flEdit);if(f)openSheet(c,ed,f);return true;}
    return false;}
  function fuelChange(t){if(t.matches('[data-fl-carpick]')){const id=t.value;if(!cars.some(c=>c.id===id))return;const o=flPrefs();o.car=id;flAll=false;history.replaceState(null,'','#fuel/'+id);flSave(o,'[data-fl-carpick]');return;}
    // 0.99: Mukautettu starts from the 12 kk dates (never empty); a changed date is saved only as a valid pair.
    if(t.closest('[data-fl-custom]')&&(t.name==='cf'||t.name==='ct')){const f=t.closest('[data-fl-custom]'),a=f.querySelector('[name=cf]').value,b=f.querySelector('[name=ct]').value,e=flDateErr(a,b);f.querySelector('[role=alert]').textContent=e;if(e)return;
      const o=flPrefs();o.p='custom';o.cf=a;o.ct=b;flAll=false;flCm=null;flSave(o,`[data-fl-custom] [name=${t.name}]`);return;}
    if(!t.matches('[data-fl-period]')||!flPeriods.some(([k])=>k===t.value))return;const o=flPrefs();o.p=t.value;if(o.p==='custom'&&!o.cu){const r=rpRange('12');o.cf=r.from;o.ct=r.to;}flAll=false;flCm=null;flSave(o,'[data-fl-period]');}
  // 0.99: the two dates of Mukautettu (page and card settings). The end date can not be before the start (min, and the check).
  const flDates=(attr,cf,ct)=>`<div class="rp-custom" ${attr}><label><span>Alkaa</span><input type="date" name="cf" value="${cf}" max="${today()}" required></label><label><span>Päättyy</span><input type="date" name="ct" value="${ct}"${cf?` min="${cf}"`:''} max="${today()}" required></label><p class="error-note" role="alert"></p></div>`;
  const flDateErr=(a,b)=>!flOkD(a)||!flOkD(b)?'Tarkista päivämäärä.':a>b?'Alkupäivä on loppupäivän jälkeen.':'';
  // 0.99: the settings of one key-figure card in a bottom sheet (the fill-up sheet's frame, focus and Escape): its own
  // period or the page's period, Peruuta and Tallenna. Only that card changes. The sheet also holds Palauta widgettien
  // järjestys, which puts the widgets back in the default order and touches nothing else.
  // 0.101: one key-figure card for Tankkaus and Raportit: the icon is the card's settings button, the period in use is
  // under the figure (blue when the card has its own period).
  const kpiCard=({k,set,setLab,icon,lab,val,per,own,cls='',sub=''})=>`<section class="fv-card fv-w" data-fw="${k}" aria-labelledby="fv-k${k}"><button type="button" class="fv-ico fv-set" ${set}="${k}" aria-haspopup="dialog" aria-label="${setLab}">${svg(icon)}<span class="fv-dots" aria-hidden="true"></span></button><h3 class="fv-lab2" id="fv-k${k}">${lab}</h3><p class="fv-val${cls}">${val}</p><p class="fv-per${own?' own':''}">${per}</p>${sub}</section>`;
  const flSaveOrder=w=>{const o=flPrefs();o.w=w;flSave(o);};
  const flSetT={avg:'Keskikulutuksen asetukset',price:'Keskihinnan asetukset',cost:'Kulujen asetukset',n:'Tankkausten asetukset'};
  // 0.101: one settings sheet for the key-figure cards of Tankkaus and Raportit (kpiSheet). The caller gives the card's
  // current setting (x: own period or null = the page's), the page's period (pg) and what Tallenna and Palauta do.
  function kpiSheet({title,x,pg,back,sel,save,resetOrder}){const cur=x?x.p:'page',r12=rpRange('12'),cf=x&&x.cu?x.cf:pg.cu?pg.cf:r12.from,ct=x&&x.cu?x.ct:pg.cu?pg.ct:r12.to,opts=[['page','Käytä sivun aikaväliä'],...flPeriods];
    const radio=([v,n])=>`<label class="fk-opt"><input type="radio" name="fkp" value="${v}"${v===cur?' checked':''}><span>${n}</span>${v==='page'?`<small>${flPName(pg)}</small>`:''}</label>`;
    closeSheet();sheetBack=back||null;sheetSel=sel;const l=document.createElement('div');l.className='sheet-layer';
    l.innerHTML=`<div class="sheet-backdrop" data-sheet-close></div><div class="sheet fk-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><span class="sheet-grip" aria-hidden="true"></span><div class="sheet-head"><h2 id="sheet-title">${title}</h2><button class="sheet-x" type="button" data-sheet-close aria-label="Sulje">×</button></div>
      <form class="fk-form" novalidate><fieldset class="fk-set"><legend class="fk-leg">Aikaväli</legend>${opts.map(radio).join('')}</fieldset><div class="fk-cu"${cur==='custom'?'':' hidden'}>${flDates('data-fk-custom',cf,ct)}</div>
      <div class="fk-btns"><button type="button" class="app-button secondary" data-sheet-close>Peruuta</button><button type="submit" class="app-button">Tallenna</button></div></form>
      <div class="fk-more"><button type="button" class="link-button" data-fl-reset-w>Palauta widgettien järjestys</button><small>Palauttaa vain widgettien oletusjärjestyksen.</small></div></div>`;
    glass.appendChild(l);screen.inert=true;const f=l.querySelector('form'),cu=l.querySelector('.fk-cu'),err=l.querySelector('[role=alert]');
    f.addEventListener('change',e=>{if(e.target.name==='fkp'){cu.hidden=e.target.value!=='custom';err.textContent='';}if(e.target.name==='cf'){f.elements.ct.min=e.target.value;}if(e.target.name==='cf'||e.target.name==='ct')err.textContent='';});
    f.addEventListener('submit',e=>{e.preventDefault();const v=f.elements.fkp.value;let nx;
      if(v==='custom'){const a=f.elements.cf.value,b=f.elements.ct.value,m=flDateErr(a,b);if(m){err.textContent=m;return;}nx={p:'custom',cf:a,ct:b};}else nx=v==='page'?null:{p:v};
      closeSheet();save(nx);});
    l.addEventListener('click',e=>{if(e.target.closest('[data-fl-reset-w]')){closeSheet();resetOrder();return;}if(e.target.closest('[data-sheet-close]'))closeSheet();});
    l.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const list=focusables(l.querySelector('.sheet'));if(!list.length)return;const first=list[0],lastEl=list[list.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();lastEl.focus();}else if(!e.shiftKey&&document.activeElement===lastEl){e.preventDefault();first.focus();}});
    requestAnimationFrame(()=>{l.classList.add('open');const q=f.querySelector('input[name=fkp]:checked');if(q)q.focus({preventScroll:true});});}
  function flSheet(k,from){const o=flPrefs(),c0=cars.find(c=>c.id===o.car)||cars[0],ev=!!c0&&unitOf(fcar(c0,pickKind(c0,o.k)))==='kWh',sel=`[data-fl-set="${k}"]`;
    kpiSheet({title:k==='n'&&ev?'Latausten asetukset':flSetT[k],x:o.kp[k]||null,pg:o,back:from,sel,
      save:nx=>{const o2=flPrefs();if(nx)o2.kp[k]=nx;else delete o2.kp[k];flSave(o2,sel);},
      resetOrder:()=>{const o2=flPrefs();o2.w=[...flWidgets];notice='✓ Widgettien järjestys palautettu.';flSave(o2,sel);}});}
  // Vertailu (0.42, havainnekuva hyväksytty 28.10.2026): the chosen vehicles side by side for the same period, with the
  // figures of the Ajoneuvo view (flCalc), so the two never disagree. Consumption is compared only within one unit
  // (l/100 km, kWh/100 km, l/h): litres and kilowatt-hours are not on the same scale, so the cost of driving (€/100 km)
  // is the figure that compares every kind of vehicle. Each vehicle keeps its colour and line style everywhere.
  const flCol=['#0b5ed7','#0b7a6e','#7246d6','#c2185b','#8a6d00','#4f5f72'].map(c=>`var(--c-${c.slice(1)},${c})`),flDash=['','6 4','1.5 4','9 3 2 3','3 3','11 4'];
  const flMetrics=[['cons','Kulutus'],['price','Ajon hinta'],['cost','Kulut']];
  // 0.71: in Vertailu a vehicle that has fills of several kinds (hybrid, gas car with petrol) is counted as a whole: the
  // costs of all kinds added together and the cost of driving = all costs / kilometres. Its consumption cannot be added
  // (litres, kWh and kg), so it is left out of the consumption comparison. Returns the parts of flCalc that flCompare reads.
  function flMix(c,p,kinds,cu){const ds=kinds.map(k=>flCalc(fcar(c,k),p,cu)),d0=ds[0],fk=hourly(c)?1:100,sum=(l,f)=>l.reduce((m,x)=>m+f(x),0),km=drivenIn(c,d0.from,d0.to);
    const now={avg:null,cost:sum(ds,d=>d.now.cost)};now.per100=km>0&&now.cost>0?now.cost/km*fk:null;
    let was=null;if(d0.prev&&ds.some(d=>d.was)){const wk=drivenIn(c,d0.prev.from,d0.prev.to),wc=sum(ds,d=>d.was?d.was.cost:0);was={avg:null,cost:wc,per100:wk>0&&wc>0?wc/wk*fk:null};}
    const pr=l=>l.every(x=>x&&x.avg!=null&&x.price)?sum(l,x=>x.avg*x.price):null;
    const mon=d0.mon.map((b,i)=>{const bs=ds.map(d=>d.mon[i]);return {k:b.k,avg:pr(bs),price:1,n:sum(bs,x=>x.n),cost:sum(bs,x=>x.cost)};});
    const ys=[...new Set(ds.flatMap(d=>d.years.map(y=>y.y)))].sort(),years=ys.map(y=>{const l=ds.map(d=>d.years.find(x=>x.y===y));return {y,avg:pr(l),price:1,cost:sum(l.filter(Boolean),x=>x.cost)};});
    return {now,was,mon,years,cov:ds.filter(d=>d.now.cost>0).every(d=>d.cov)};}
  // 0.79: a vehicle's colour comes from its place in the garage, so it is the same here and on Raportit → Ajoneuvot.
  function flCompare(o){const fueled=cars.filter(c=>(c.fuels||[]).length),style=new Map(fueled.map(c=>[c.id,Math.max(0,cars.indexOf(c))%flCol.length]));
    const sel=fueled.filter(c=>!o.off.includes(c.id)),m=o.m,yrs=o.p==='all';
    const rows=sel.map(c0=>{const ks=chargeKinds(c0),used=ks.filter(k=>(c0.fuels||[]).some(f=>fillKind(c0,f)===k)),mix=used.length>1,c=fcar(c0,used[0]||ks[0]),d=mix?flMix(c0,o.p,used,o.cu):flCalc(c,o.p,o.cu),u=unitOf(c),hr=hourly(c),pu=mix?used.map(k=>unitOf(fcar(c0,k))).join(', ')+'/'+per(c):`${u}/${per(c)}`,was=d.was;
      const val=m==='cons'?d.now.avg:m==='price'?d.now.per100:d.now.cost,old=!was?null:m==='cons'?was.avg:m==='price'?was.per100:was.cost;
      const unit=m==='cons'?pu:m==='price'?`€/${per(c)}`:'€',ch=val!==null&&old!==null&&(m!=='cost'||d.cov)?(m==='cons'?pct1(val,old):pctOf(val,old)):null;
      // Months (or years for the whole history) on one shared axis; consumption, cost of driving or costs per bucket.
      const pts={};if(yrs)for(const y of d.years)pts[String(y.y)]=m==='cons'?y.avg:m==='price'?(y.avg!==null&&y.price?y.avg*y.price:null):y.cost;
        else for(const b of d.mon)pts[b.k]=m==='cons'?b.avg:m==='price'?(b.avg!=null&&b.price?b.avg*b.price:null):(b.n?b.cost:null);
      if(mix&&m==='cons')for(const k of Object.keys(pts))delete pts[k];
      return {c,d,u,hr,pu,unit,val,ch,pts,mix,mixCons:mix?used.map(k=>{const v=fcar(c0,k),a=flCalc(v,o.p,o.cu).now.avg;return a!==null?`${dec(a)} ${unitOf(v)}`:'';}).filter(Boolean).join(' · '):'',st:style.get(c.id)};});
    return {fueled,sel,rows,style};}
  function flCmpChart(rows,keys,sel,fmt){const vals=rows.flatMap(x=>keys.map(k=>x.pts[k])).filter(v=>v!=null);if(!vals.length)return '';
    let y0=Math.min(...vals),y1=Math.max(...vals);const pad=(y1-y0)*.12||y1*.08||1;y0=Math.max(0,y0-pad);y1+=pad;const st=niceStep((y1-y0)/4);y0=Math.floor(y0/st)*st;y1=Math.ceil(y1/st)*st;
    const W=320,H=180,L=Math.max(24,String(fmt(y1,st)).length*6.6+8),R=8,T=12,B=24,pw=W-L-R,ph=H-T-B,n=keys.length,sw=pw/n,cx=i=>L+sw*(i+.5),r=v=>Math.round(v*10)/10;
    const Y=v=>T+(1-(v-y0)/(y1-y0))*ph;let g='';
    for(let v=y0;v<=y1+st/1e3;v+=st)g+=`<line class="g" x1="${L}" x2="${L+pw}" y1="${r(Y(v))}" y2="${r(Y(v))}"/><text class="ax" x="${L-5}" y="${r(Y(v))+4}" text-anchor="end">${fmt(v,st)}</text>`;
    if(keys[0].length>4)keys.forEach((k,i)=>{if(i&&k.slice(5)==='01')g+=`<line class="yr" x1="${r(L+sw*i)}" x2="${r(L+sw*i)}" y1="${T}" y2="${H-B}"/>`;});
    if(sel>=0)g+=`<line class="guide" x1="${r(cx(sel))}" x2="${r(cx(sel))}" y1="${T}" y2="${H-B}"/>`;
    for(const x of rows){let pts=[],out='';const flush=()=>{if(pts.length>1)out+=`<polyline class="cl" points="${pts.join(' ')}" style="stroke:${flCol[x.st]}${flDash[x.st]?`;stroke-dasharray:${flDash[x.st]}`:''}"/>`;else if(pts.length===1){const [px,py]=pts[0].split(',');out+=`<circle cx="${px}" cy="${py}" r="2.8" style="fill:${flCol[x.st]}"/>`;}pts=[];};
      keys.forEach((k,i)=>{const v=x.pts[k];if(v==null)flush();else pts.push(r(cx(i))+','+r(Y(v)));});flush();g+=out;
      if(sel>=0&&x.pts[keys[sel]]!=null)g+=`<circle cx="${r(cx(sel))}" cy="${r(Y(x.pts[keys[sel]]))}" r="4" style="fill:${flCol[x.st]}" class="cdot"/>`;
}
    // 0.81: the vehicles' names are in the legend under the chart (whole names), not cut at the line ends.
    const every=n>13?2:1;g+=keys.map((k,i)=>i%every&&i!==sel?'':`<text class="ax${i===sel?' on':''}" x="${r(cx(i))}" y="${H-6}" text-anchor="middle">${k.length>4?Number(k.slice(5)):k}</text>`).join('');
    g+=keys.map((k,i)=>`<rect class="hit" data-fl-cm="${i}" x="${r(L+sw*i)}" y="${T}" width="${r(sw)}" height="${ph}"/>`).join('');
    return `<svg class="fl-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Vertailu kuukausittain">${g}</svg>`;}
  function fuelCompare(o,head,bar,msg){const {fueled,sel,rows}=flCompare(o),m=o.m,pName=flPName(o);
    // 0.96: the vehicles to compare are picked straight from the vehicle row (flBar in compare mode: each tap adds or
    // removes one; vehicles without fill-ups are greyed). At least two are needed; the compare button closes the mode.
    const hint='';
    const seg=`<div class="fl-seg" role="group" aria-label="Vertailtava luku">${flMetrics.map(([k,n])=>`<button type="button" data-fl-metric="${k}" aria-pressed="${k===m}">${n}</button>`).join('')}</div>`;
    if(fueled.length<2)return `${top()}${head}${bar}${msg}<div class="rp-card"><p class="rp-empty">Vertailu näkyy, kun vähintään kahdella ajoneuvolla on tankkauksia tai latauksia.</p></div>`;
    if(sel.length<2)return `${top()}${head}${bar}${hint}${msg}<div class="rp-card"><p class="rp-empty">Valitse vähintään kaksi ajoneuvoa.</p></div>`;
    const fmtV=v=>v===null?'–':m==='cons'?dec(v):m==='price'?dec2(v):eur(v);
    const chg=x=>x.ch===null?'<span class="fl-cc">–</span>':`<b class="fl-cc ${x.ch<0?'down':x.ch>0?'up':'flat'}">${x.ch>0?'+':x.ch<0?'−':''}${number(Math.abs(x.ch))}&nbsp;%</b>`;
    // Bars per unit group, longest bar = largest value in the group.
    const groups=[];for(const x of rows.filter(x=>!(x.mix&&m==='cons'))){let g=groups.find(z=>z.unit===x.unit);if(!g){g={unit:x.unit,list:[]};groups.push(g);}g.list.push(x);}
    groups.sort((a,b)=>b.list.length-a.list.length);const main=groups[0]||{unit:'',list:[]};
    // 0.81: every row has the vehicle's whole name (it may wrap), the value with its unit and a bar on the group's
    // scale. A missing value is said in words with the reason ("Ei tietoa"), never drawn as an empty (zero) bar.
    const why=x=>(x.mix?!(x.d.now.cost>0):!(x.d.now.fills&&x.d.now.fills.length))?'ei kirjauksia jaksolla':m==='cons'?'vähintään kaksi täyttä kirjausta tarvitaan':m==='price'?'ei laskettavaa kulutusta jaksolla':'';
    const bars=groups.map(g=>{const mx=Math.max(1e-9,...g.list.map(x=>x.val||0));return `${m!=='cost'?`<p class="fl-gunit">${g.unit}</p>`:''}${g.list.map(x=>`<div class="fl-bar"><div class="fl-bt"><span class="fl-bn"><i class="rp-vsw" aria-hidden="true" style="background:${flCol[x.st]}"></i><span translate="no">${escape(carName(x.c))}</span></span><span class="fl-bv">${x.val!==null?`<span class="nw">${fmtV(x.val)}</span> ${chg(x)}`:'<span class="fl-none">Ei tietoa</span>'}</span></div>${x.val!==null?`<div class="fl-btrack" aria-hidden="true"><i style="width:${Math.max(2,x.val/mx*100).toFixed(1)}%;background:${flCol[x.st]}"></i></div>`:`<small class="fl-why">${why(x)}</small>`}</div>`).join('')}`;}).join('');
    const susCars=sel.filter(c0=>chargeKinds(c0).some(k=>{const st=fuelStats(fcar(c0,k));return st.sus.length||st.ord.length;})),susTxt=susCars.length&&m!=='cost'?`<p class="fl-warn" role="note">${susCars.map(c0=>`<span translate="no">${escape(carName(c0))}</span>`).join(', ')}: <span>epätodennäköinen kulutusväli on korjattu laskennassa.</span> <span>Tarkista mittarilukema Ajoneuvo-näkymästä.</span></p>`:'';
    const mixNote=rows.some(x=>x.mix)?`<p class="fl-note">Useaa lajia käyttävän ajoneuvon kulutusta ei voi laskea yhteen. Sen Ajon hinta ja Kulut sisältävät kaikki lajit.</p>`:'';
    const multi=m==='cons'&&groups.length>1?`<p class="fl-note">Kilowattitunteja, litroja ja käyttötunteja ei voi verrata samalla asteikolla. Vertaa eri käyttövoimia kohdassa Ajon hinta.</p>`:m==='price'&&groups.length>1?`<p class="fl-note">Tuntimittarilliset ajoneuvot näkyvät omana ryhmänään (€/h).</p>`:'';
    const card1=`<section class="rp-card" aria-labelledby="fl-c1"><div class="rp-hrow"><h3 class="rp-h" id="fl-c1"><span>${m==='cons'?'Keskikulutus':m==='price'?'Ajon hinta':'Polttoainekulut'}</span> · <span>${pName}</span></h3></div><p class="rp-sub fl-crng">${o.p==='all'?'<span>Koko historia</span>':(r0=>`<span class="nw">${rng(r0.from,r0.to)}</span> · <span>muutos: sama jakso vuotta aiemmin</span>`)(rpRange(o.p))}</p>${bars}${multi}${mixNote}${susTxt}</section>`;
    // Line chart for the largest unit group.
    const keys=[...new Set(main.list.flatMap(x=>Object.keys(x.pts)))].sort(),fmtA=(v,st)=>m==='cost'?number(Math.round(v)):dec(v,st===undefined?(m==='price'?2:1):st<.1?2:st<1?1:0);
    let csel=o.cm!=null&&o.cm<keys.length?o.cm:-1;if(csel<0)for(let i=keys.length-1;i>=0;i--)if(main.list.some(x=>x.pts[keys[i]]!=null)){csel=i;break;}
    const chart=keys.length>1?flCmpChart(main.list,keys,csel,fmtA):'',kName=k=>k.length>4?`<span>${ucFirst(mName(k))}</span> <span>${k.slice(0,4)}</span>`:`<span>${k}</span>`;
    const partK=new Set(main.list.flatMap(x=>(x.d.mon||[]).filter(b=>b.partial).map(b=>b.k)));
    const selTxt=csel>=0?`<div class="fl-csel"><b>${kName(keys[csel])}</b>${partK.has(keys[csel])?' <span class="rp-part">– <span>keskeneräinen kuukausi</span></span>':''}<ul>${main.list.map(x=>`<li><i aria-hidden="true" style="background:${flCol[x.st]}"></i><span translate="no">${escape(carName(x.c))}</span> <b>${x.pts[keys[csel]]!=null?(m==='cost'?eur(x.pts[keys[csel]]):fmtA(x.pts[keys[csel]])):'–'}</b></li>`).join('')}</ul></div>`:'';
    const lgd=`<p class="rp-legend fl-lgd">${main.list.filter(x=>keys.some(k=>x.pts[k]!=null)).map(x=>`<span class="nw"><i class="fl-sw" aria-hidden="true" style="border-top-color:${flCol[x.st]}${flDash[x.st]?';border-top-style:'+(flDash[x.st].startsWith('1.5')?'dotted':'dashed'):''}"></i><span translate="no">${escape(carName(x.c))}</span></span>`).join('')}</p>`;
    const card2=chart?`<section class="rp-card" aria-labelledby="fl-c2"><div class="rp-hrow"><h3 class="rp-h" id="fl-c2">${o.p==='all'?(m==='cons'?'Kulutus vuosittain':m==='price'?'Ajon hinta vuosittain':'Kulut vuosittain'):(m==='cons'?'Kulutus kuukausittain':m==='price'?'Ajon hinta kuukausittain':'Kulut kuukausittain')}</h3><small class="fl-unit">${m==='cost'?'€':main.unit}</small></div>${chart}${lgd}${selTxt}<p class="fl-note">${o.p==='all'?'Napauta vuotta, niin näet luvut.':'Napauta kuukautta, niin näet luvut.'}${m==='cons'?' <span>Pisteet ovat mitattuja kuukausia; viiva yhdistää vain peräkkäiset kuukaudet.</span>':''}${groups.length>1?` <span>Kaaviossa ovat ajoneuvot, joiden yksikkö on</span> <span>${m==='cost'?'€':main.unit}</span>.`:''}</p></section>`:'';
    // 0.81: the summary as one compact row per vehicle (whole name; consumption, cost of driving and costs with their
    // units) instead of the four-column table whose names were cut on a phone; the total of the fuel and charging costs
    // under it. Consumption figures of different vehicles are never added together.
    const tot=rows.reduce((s,x)=>s+x.d.now.cost,0);
    const table=`<section class="rp-card" aria-labelledby="fl-c3"><h3 class="rp-h" id="fl-c3"><span>Yhteenveto</span> · <span>${pName}</span></h3><ul class="fl-srows">${rows.map(x=>{const d=x.d,cons=x.mix?(x.mixCons||''):d.now.avg!==null?`${dec(d.now.avg)} ${x.pu}`:'';
      return `<li><p class="fl-srn"><i class="rp-vsw" aria-hidden="true" style="background:${flCol[x.st]}"></i><span translate="no">${escape(carName(x.c))}</span><b>${eur(d.now.cost)}</b></p><p class="fl-srm"><span class="nw"><span>Kulutus</span> <b>${cons||'–'}</b></span> · <span class="nw"><span>Ajon hinta</span> <b>${d.now.per100!==null?`${dec2(d.now.per100)} €/${per(x.c)}`:'–'}</b></span></p></li>`;}).join('')}</ul>
      <p class="fl-stot"><span>${rows.some(x=>x.u==='kWh'||x.mix)?'Polttoaine- ja latauskulut yhteensä':'Polttoainekulut yhteensä'}</span><b>${eur(tot)}</b></p>
      <p class="fl-sub">Ajon hinta (€/100 km) on vertailukelpoinen eri käyttövoimien kesken.</p></section>`;
    return `${top()}${head}${bar}${hint}${msg}${seg}${card1}${card2}${table}`;}
  // Keeps the chosen vehicle's button in view in a long row of vehicles.
  function flScrollChips(){const row=screen.querySelector('.fv-cars'),on=row&&row.querySelector('[aria-pressed="true"]');if(!on)return;const a=row.getBoundingClientRect(),b=on.getBoundingClientRect();if(b.left<a.left||b.right>a.right)row.scrollLeft+=b.left-a.left-(b.left-a.left>0?a.width-b.width-16:16);}
  // The tankkauskirja as a PDF (0.40): the tab's period and figures (flCalc), every fill-up of the period, and how the
  // figures are counted. Same pdf-writer.js and share sheet as the other PDFs; app texts through tl().
  function fuelPdf(id){const P=window.AjouraPDF,c0=cars.find(c=>c.id===id);if(!P||!c0)return;const c=fcar(c0,pickKind(c0,flPrefs().k));let file;
    try{const fo=flPrefs(),d=flCalc(c,fo.p,fo.cu),tag=(c.plate||'').normalize('NFD').replace(/[^A-Za-z0-9]/g,'')||'ajoneuvo';
      file=new File([fuelDoc(P,c,d).blob()],'ajoura-'+tag+'-'+(unitOf(c)==='kWh'?'latauskirja':'tankkauskirja')+'-'+today()+'.pdf',{type:'application/pdf'});}
    catch(e){notice='PDF-tiedoston teko ei onnistunut. Yritä uudelleen.';const y=screen.scrollTop;render();screen.scrollTop=y;return;}
    saveFile(file,matchMedia('(pointer: coarse)').matches);}
  function fuelDoc(P,c,d){const {now,was,prev,mon,years,months,p}=d,T=tl,u=unitOf(c),ev=u==='kWh',hr=hourly(c),pu=`${u}/${per(c)}`,mu=ku(c),title=ev?'Latauskirja':'Tankkauskirja';
    const doc=P.create({title:'AJOURA – '+T(title)+' – '+carName(c)}),L=12,R=198,CW=R-L,BOT=277,grey='#4f5f72',hair='#d6dee8',blue='#1769f4',prevC='#8d99aa';
    const tag=(c.plate||'').normalize('NFD').replace(/[^A-Za-z0-9]/g,'').toUpperCase(),rid='AJ-'+(tag?tag+'-':'')+(ev?'LK':'TK')+'-'+today().replace(/-/g,'');
    const signed=v=>v===null?null:{t:(v>0?'+':v<0?'−':'')+number(Math.abs(v))+' %',c:grey};
    let y=0;
    const head=()=>{doc.page();doc.logo(L,12,46);doc.text(R,17,T(title),{size:12,bold:true,align:'right'});
      doc.text(R,21.5,T('Raportti '+rid),{size:8,color:grey,align:'right'});doc.text(R,25.5,T('Tulostettu '+date(today())),{size:8,color:grey,align:'right'});
      doc.rect(L,29.5,CW,.6,{fill:blue});y=37;};
    const room=(h,hdr)=>{if(y+h<=BOT)return;head();if(hdr)hdr();};
    const thead=cols=>{doc.rect(L,y,CW,6.5,{fill:'#eef2f7'});for(const [t,x,al] of cols)doc.text(x,y+4.4,t,{size:7.5,bold:true,color:grey,align:al});y+=6.5;};
    const h2=(s,need=26)=>{room(need);y+=5.5;doc.text(L,y,T(s),{size:12,bold:true});y+=3;};
    const rule=()=>doc.line(L,y,R,y,{color:hair,lw:.2});
    head();
    doc.text(L,y+4,doc.fit(carName(c),CW,18,true),{size:18,bold:true});y+=10.5;
    const sub=[c.nick?c.name:'',c.plate,T('vm. '+c.year),T(typeOf(c)),c.fuel?T(c.fuel):''].filter(Boolean).join(' · ');doc.text(L,y,doc.fit(sub,CW,9.5),{size:9.5,color:grey});y+=4.8;
    doc.text(L,y,(p==='all'?T('Koko historia'):`${T('Jakso')} ${date(d.from)}–${date(d.to)}`)+(prev?`   ·   ${T('Vertailujakso')} ${date(prev.from)}–${date(prev.to)}`:''),{size:9.5,color:grey});y+=4.5;
    const pc=(a,b)=>was&&a!==null&&b!==null?pctOf(a,b):null;
    y+=3;const tw=(CW-9)/4,th=19.5,tiles=[
      [T('Keskikulutus'),now.avg!==null?`${dec(now.avg)} ${pu}`:'–',signed(was&&now.avg!==null&&was.avg!==null?pct1(now.avg,was.avg):null)],
      [T(ev?'Latauskulut':'Polttoainekulut'),eur(now.cost),signed(pc(now.cost,was&&was.cost))],
      [T(hr?'Käytön hinta':'Ajon hinta'),now.per100!==null?`${dec2(now.per100)} €/${per(c)}`:'–',signed(pc(now.per100,was&&was.per100))],
      [T('Keskihinta'),now.price!==null?`${dec(now.price,3)} €/${u}`:'–',signed(pc(now.price,was&&was.price))]];
    tiles.forEach(([lab,val,sg],i)=>{const x=L+i*(tw+3);doc.rect(x,y,tw,th,{fill:'#f1f6fd',stroke:'#d9e6f4',r:2.5});
      doc.text(x+3.5,y+5.5,doc.fit(lab,tw-7,7.5,true),{size:7.5,bold:true,color:grey});doc.text(x+3.5,y+12,doc.fit(val,tw-7,13,true),{size:13,bold:true,color:blue});
      if(sg)doc.text(x+3.5,y+16.6,sg.t,{size:8,bold:true,color:sg.c});});
    y+=th+4;const n=now.fills.length;
    const info=[`${n} ${T(ev?(n===1?'lataus':'latausta'):(n===1?'tankkaus':'tankkausta'))}`,`${dec(now.qty,1)} ${u}`,now.km?`${number(now.km)} ${mu}`:'',`${eur(now.cost/months)} ${T('/ kk')}`].filter(Boolean).join(' · ');
    doc.text(L,y,doc.fit(info,CW,8.5),{size:8.5,color:grey});y+=2;
    // Consumption chart: the months (or years) with the same months a year earlier, the value written at each point.
    const b=flBuckets(d),yb=b.length&&b[0].year;
    if(b.some(x=>x.avg!=null)){h2(yb?'Kulutus vuosittain':'Kulutus kuukausittain',78);y+=1.5;const h=66,t0=y;doc.rect(L,t0,CW,h,{stroke:'#e0e9f2',r:2.5});
      doc.text(R-3,t0+5,pu,{size:7,color:grey,align:'right'});
      const pl=L+13,pr=R-5,pt=t0+8,pb=t0+h-15,k=b.length,sw=(pr-pl)/k,X=i=>pl+sw*(i+.5),vals=b.flatMap(x=>[x.avg,x.prev]).filter(v=>v!=null);
      let y0=Math.min(...vals),y1=Math.max(...vals);const pad=(y1-y0)*.15||y1*.1||1;y0=Math.max(0,y0-pad);y1+=pad;const st=niceStep((y1-y0)/4);y0=Math.floor(y0/st)*st;y1=Math.ceil(y1/st)*st;
      const Y=v=>pt+(1-(v-y0)/(y1-y0))*(pb-pt);
      for(let v=y0;v<=y1+st/1e3;v+=st){doc.line(pl,Y(v),pr,Y(v),{color:'#e6edf4',lw:.25});doc.text(pl-1.5,Y(v)+1.1,dec(v,st<.1?2:st<1?1:0),{size:6.5,color:grey,align:'right'});}
      const seg=(key,col,dash)=>{for(let i=1;i<k;i++){const a=b[i-1][key],z=b[i][key];if(a==null||z==null)continue;const x0=X(i-1),ya=Y(a),x1=X(i),yz=Y(z);
        if(!dash){doc.line(x0,ya,x1,yz,{color:col,lw:.6});continue;}const len=Math.hypot(x1-x0,yz-ya),m=Math.max(2,Math.round(len/1.6));for(let j=0;j<m;j+=2)doc.line(x0+(x1-x0)*j/m,ya+(yz-ya)*j/m,x0+(x1-x0)*(j+1)/m,ya+(yz-ya)*(j+1)/m,{color:col,lw:.45});}};
      seg('prev',prevC,true);seg('avg',blue,false);
      b.forEach((x,i)=>{if(x.avg==null)return;doc.rect(X(i)-1.1,Y(x.avg)-1.1,2.2,2.2,{fill:blue,stroke:'#ffffff',lw:.25,r:1.1});doc.text(X(i),Y(x.avg)+(x.prev!=null&&x.prev<x.avg?-2.2:4.4),dec(x.avg),{size:6.5,bold:true,align:'center'});});
      const every=k>13?2:1;b.forEach((x,i)=>{if(i%every&&i!==k-1)return;doc.text(X(i),pb+4.5,x.year?x.k:Number(x.k.slice(5))+'/'+x.k.slice(2,4),{size:6.5,color:grey,align:'center'});});
      let lx=L+4;const ly=t0+h-4;doc.line(lx,ly-1.1,lx+4,ly-1.1,{color:blue,lw:.6});lx+=5.5;const l1=T(yb?'vuosittain':p==='all'?'kuukausittain':'tämä jakso');doc.text(lx,ly,l1,{size:7,color:grey});lx+=doc.width(l1,7)+5;
      if(b.some(x=>x.prev!=null)){for(let a=0;a<4;a+=2)doc.line(lx+a,ly-1.1,lx+a+1.2,ly-1.1,{color:prevC,lw:.6});lx+=5.5;doc.text(lx,ly,T('vuotta aiemmin'),{size:7,color:grey});}
      y+=h;}
    // Month by month (or year by year) in a table, with the total of the period.
    const cols=()=>thead([[T(yb?'Vuosi':'Kuukausi'),L+2],[T(ev?'Latauksia':'Tankkauksia'),L+78,'right'],[ev?'kWh':T('Litrat'),L+100,'right'],[T('Kulut')+' €',L+124,'right'],['€/'+u,L+145,'right'],[pu,L+166,'right'],[T('Ed. vuosi'),R-2,'right']]);
    h2(yb?'Vuosiyhteenveto':'Kuukausiyhteenveto',30);y+=1.5;cols();
    for(const x of b){room(6,cols);const lab=x.year?x.k:`${T(ucFirst(mName(x.k)))} ${x.k.slice(0,4)}`;
      doc.text(L+2,y+4.2,lab+(x.partial?' *':''),{size:8.5,color:x.partial?grey:undefined});doc.text(L+78,y+4.2,String(x.n),{size:8.5,align:'right'});
      doc.text(L+100,y+4.2,x.n?dec(x.qty,1):'–',{size:8.5,align:'right'});doc.text(L+124,y+4.2,x.cost?dec2(x.cost):'–',{size:8.5,align:'right'});
      doc.text(L+145,y+4.2,x.price?dec(x.price,3):'–',{size:8.5,align:'right'});doc.text(L+166,y+4.2,x.avg!=null?dec(x.avg):'–',{size:8.5,bold:x.avg!=null,align:'right'});
      doc.text(R-2,y+4.2,x.prev!=null?dec(x.prev):'–',{size:8.5,color:grey,align:'right'});y+=6;rule();}
    room(7,cols);doc.text(L+2,y+4.6,T('Yhteensä'),{size:8.5,bold:true});doc.text(L+78,y+4.6,String(n),{size:8.5,bold:true,align:'right'});doc.text(L+100,y+4.6,dec(now.qty,1),{size:8.5,bold:true,align:'right'});
    doc.text(L+124,y+4.6,dec2(now.cost),{size:8.5,bold:true,align:'right'});doc.text(L+145,y+4.6,now.price!==null?dec(now.price,3):'–',{size:8.5,bold:true,align:'right'});doc.text(L+166,y+4.6,now.avg!==null?dec(now.avg):'–',{size:8.5,bold:true,align:'right'});
    doc.text(R-2,y+4.6,was&&was.avg!==null?dec(was.avg):'–',{size:8.5,bold:true,color:grey,align:'right'});y+=7;
    if(b.some(x=>x.partial)){doc.text(L+2,y+2,T(yb?'* Vajaa vuosi.':'* Vajaa kuukausi: mukana vain jakson päivät.'),{size:7,color:grey});y+=4;}
    // Year by year from the whole history (not only the period).
    if(years.length&&!yb){const yc=()=>thead([[T('Vuosi'),L+2],[T(ev?'Latauksia':'Tankkauksia'),L+70,'right'],[T('Kulut')+' €',L+100,'right'],[T('€/kk'),L+125,'right'],[pu,L+155,'right'],[mu,R-2,'right']]);
      h2('Vuosittain',20+years.length*6);y+=1.5;yc();
      for(const x of [...years].reverse()){room(6,yc);doc.text(L+2,y+4.2,String(x.y)+(x.partial?' *':''),{size:8.5,bold:true});doc.text(L+70,y+4.2,String(x.n),{size:8.5,align:'right'});doc.text(L+100,y+4.2,dec2(x.cost),{size:8.5,align:'right'});
        doc.text(L+125,y+4.2,dec2(x.cost/x.months),{size:8.5,align:'right'});doc.text(L+155,y+4.2,x.avg!==null?dec(x.avg):'–',{size:8.5,align:'right'});doc.text(R-2,y+4.2,x.km?number(x.km):'–',{size:8.5,color:grey,align:'right'});y+=6;rule();}
      if(years.some(x=>x.partial)){doc.text(L+2,y+3,T('* Vajaa vuosi: €/kk lasketaan vain kirjattujen kuukausien ajalta.'),{size:7,color:grey});y+=4;}}
    // Every fill-up of the period, newest first.
    const gc={};for(const f of now.fills)if(f.grade)gc[f.grade]=(gc[f.grade]||0)+1;const usual=Object.keys(gc).sort((a,b2)=>gc[b2]-gc[a])[0]||'';
    const cons=new Map(d.s.series.map(x=>[x.id,x.v])),fc=()=>thead([[T('Pvm'),L+2],[T(hr?'Tuntimittari':'Mittari'),L+46,'right'],[ev?'kWh':T('Litrat'),L+66,'right'],['€/'+u,L+86,'right'],['€',L+106,'right'],[pu,L+128,'right'],[T('Lisätieto'),L+133]]);
    h2(ev?'Kaikki lataukset':'Kaikki tankkaukset',24);y+=1.5;fc();
    for(const f of [...now.fills].sort((a,b2)=>b2.date.localeCompare(a.date)||b2.km-a.km)){room(6,fc);const cv=cons.get(f.id),cn=f.country&&f.country!=='FI'?(countries.find(k=>k[0]===f.country)||['','',''])[1]:'';
      const extra=[!f.full?T('osatankkaus'):'',f.grade&&f.grade!==usual?f.grade:'',cn?T(cn)+(f.cur&&f.amt!=null?` ${dec(f.amt,2)} ${f.cur}`:''):'',f.est?T('hinta-arvio'):'',f.skip?T('ei kulutukseen'):'',d.s.sus.some(x=>x.id===f.id)||d.s.ord.some(x=>x.id===f.id)?T('tarkista mittarilukema'):''].filter(Boolean).join(', ');
      doc.text(L+2,y+4.2,date(f.date),{size:8.5});doc.text(L+46,y+4.2,number(f.km),{size:8.5,align:'right'});doc.text(L+66,y+4.2,dec(f.qty,2),{size:8.5,align:'right'});
      doc.text(L+86,y+4.2,f.cost!==null&&f.qty>0?dec(f.cost/f.qty,3):'–',{size:8.5,align:'right'});doc.text(L+106,y+4.2,f.cost!==null?dec2(f.cost):'–',{size:8.5,bold:true,align:'right'});
      doc.text(L+128,y+4.2,cv!=null?dec(cv):'–',{size:8.5,align:'right'});if(extra)doc.text(L+133,y+4.2,doc.fit(extra,R-L-135,7.5),{size:7.5,color:grey});y+=6;rule();}
    const notes=[T(ev?'Kulutus lasketaan täysien latausten väliltä, ja osalataus lisätään seuraavaan täyteen lataukseen.':'Kulutus lasketaan täysien tankkausten väliltä, ja osatankkaus lisätään seuraavaan täyteen tankkaukseen.'),
      T(c.sample?'Luvut perustuvat omistajan omiin kirjauksiin (esimerkkiauto, kuvitteelliset tiedot).':'Luvut perustuvat omistajan omiin kirjauksiin.')];
    if(prev)notes.push(T('Muutos verrataan vertailujaksoon. Talvella kulutus on yleensä suurempi, joten kuukausia verrataan samoihin kuukausiin vuotta aiemmin.'));
    if(d.s.ord.length)notes.push(T('Osa mittarilukemista on ristiriidassa päivämäärien kanssa, joten niiden välejä ei käytetä kulutuksessa. Tarkista merkityt kirjaukset.'));if(d.s.sus.length)notes.push(T('Epätodennäköinen kulutusväli (mittarilukema todennäköisesti väärin) on yhdistetty seuraavaan väliin tai jätetty pois kulutuksesta. Tarkista merkityt kirjaukset.'));
    const nl=notes.flatMap(x=>doc.wrap(x,CW,8));room(nl.length*3.8+5);y+=5;for(const l of nl){doc.text(L,y,l,{size:8,color:grey});y+=3.8;}
    doc.each((i,k)=>{const fy=285;doc.line(L,fy-4.5,R,fy-4.5,{color:'#cbd9e8',lw:.25});
      doc.text(L,fy,company.name,{size:7.5,bold:true});doc.text(L,fy+3.3,company.id?`${T('Y-tunnus')} ${company.id}`:T('Kehitysvaiheen sovellus'),{size:7,color:grey});
      doc.text(105,fy,company.web,{size:7.5,color:grey,align:'center'});
      doc.text(R,fy,`${T('Sivu')} ${i} / ${k}`,{size:7.5,color:grey,align:'right'});doc.text(R,fy+3.3,rid,{size:7,color:grey,align:'right'});});
    return doc;}
  // Timeline filter: hides other kinds in place (no re-render) and keeps the total in step with what is shown.
  function filterTimeline(k){let sum=0;const items=[...screen.querySelectorAll('.timeline-item')];for(const li of items){const hit=k==='all'||li.classList.contains(k);li.hidden=!hit;if(hit)sum+=Number(li.dataset.cost)||0;}
    screen.querySelectorAll('.timeline-year').forEach(y=>{y.hidden=!items.some(li=>!li.hidden&&li.dataset.y===y.dataset.y);});screen.querySelectorAll('[data-tl]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tl===k)));const tot=document.getElementById('tl-total');if(tot)tot.textContent=number(sum)+' €';}
  // Backup: everything goes into one JSON file the user keeps. Restoring merges: a car with the same id is
  // replaced by the backup's version and new cars are added, so nothing already here is lost.
  // 0.44: the phone gets the share sheet (Save to Files), like the PDFs and the transfer file, because a download link is
  // unreliable in the installed iPhone app. The file format is unchanged. The date is stamped only when the file was handed
  // over, not when the user cancelled, so "Viimeisin varmuuskopio" tells the truth.
  // 0.44: shown on the Valikko row and the backup page. Same wording as before, so the existing translation pattern applies.
  const backupWhen=()=>stamp(backupKey)?'Viimeisin varmuuskopio: '+new Intl.DateTimeFormat('fi-FI').format(new Date(stamp(backupKey))):'';
  let backupBusy=false;
  async function backup(){if(backupBusy)return;const own=cars.filter(c=>!c.sample||c.events.some(e=>/^new/.test(e.id))||(c.fuels||[]).some(f=>/^fuel/.test(f.id)));if(!own.length){notice='Ei vielä tallennettavaa.';render();return;}const data=JSON.stringify({app:'AJOURA',version:1,saved:new Date().toISOString(),cars:own,profile},null,1);
    backupBusy=true;let ok=false;try{ok=await saveFile(new File([data],'ajoura-varmuuskopio-'+today()+'.json',{type:'application/json'}),matchMedia('(pointer: coarse)').matches);}catch(e){ok=false;}finally{backupBusy=false;}
    if(ok){try{localStorage.setItem(backupKey,String(Date.now()));}catch(e){}notice='✓ Varmuuskopio tallennettu tiedostoon.';}else notice='Varmuuskopiota ei tallennettu.';const y=screen.scrollTop;render();screen.scrollTop=y;}
  // Extra checks for backup files from outside: costs must be numbers, colour and fuel from the app's own lists.
  const validImport=c=>(c.fuel===undefined||c.fuel===''||fuels.includes(c.fuel))&&typeof c.color==='string'&&/^#[0-9a-f]{6}$/i.test(c.color)&&c.events.every(e=>numOrEmpty(e.cost)&&numOrEmpty(e.labor)&&numOrEmpty(e.other)&&(e.note===undefined||typeof e.note==='string'));
  // Restoring merges: entries added after the backup stay, the backup wins only on the same entry id.
  function mergeCar(mine,c){const join=(a,b)=>{const out=(a||[]).slice();for(const x of b||[]){const i=out.findIndex(y=>y.id===x.id);if(i>=0)out[i]=x;else out.push(x);}return out;};const m={...mine,...c,events:join(mine.events,c.events)};for(const k of ['fuels','memos']){const v=join(mine[k],c[k]);if(v.length)m[k]=v;else delete m[k];}if(!c.photo&&mine.photo){m.photo=mine.photo;if(mine.gallery)m.gallery=mine.gallery;}if(m.memos&&m.memos.length>300)m.memos=m.memos.slice(-300);if(m.fuels&&m.fuels.length>2000)m.fuels=m.fuels.slice(-2000);return m;}
  async function restore(input){const file=input.files[0];input.value='';if(!file)return;let data=null;try{if(file.size>40e6)throw 0;data=JSON.parse(await file.text());}catch(e){}
    const y=screen.scrollTop;if(!data||data.app!=='AJOURA'||!Array.isArray(data.cars)||!data.cars.every(c=>validCar(c)&&validImport(c))){notice='Tiedostoa ei voitu lukea. Valitse AJOURAn varmuuskopiotiedosto.';render();screen.scrollTop=y;return;}
    const seqOf=list=>{for(const c of list)for(const id of [c.id,...c.events.map(e=>e.id),...(c.fuels||[]).map(f=>f.id),...(c.memos||[]).map(m=>m.id)]){const m=/(\d+)(?:-[a-z0-9]{4})?$/.exec(id);if(m)sequence=Math.max(sequence,Number(m[1]));}};seqOf(cars);seqOf(data.cars);
    // Same id, kind and plate (or name when there is no plate) = the same vehicle; any other id clash gets a fresh id.
    const same=(x,c)=>x.id===c.id&&x.plate===c.plate&&(x.kind||'car')===(c.kind||'car')&&(x.plate!==''||x.name===c.name);
    let added=0,updated=0;for(const c of data.cars){delete c.sample;const i=cars.findIndex(x=>same(x,c));if(i>=0){cars[i]=mergeCar(cars[i],c);updated++;}else{if(cars.some(x=>x.id===c.id))c.id=uid('new-car');cars.push(c);added++;}}
    if(profile.months===defaultProfile.months&&profile.km===defaultProfile.km&&validProfile(data.profile))profile=noName(data.profile);persist();notice=`✓ Varmuuskopio palautettu: ${added} uutta, ${updated} päivitetty.`;render();screen.scrollTop=y;}
  // Shareable history: the car and its entries packed into the link itself (compressed, base64url), opened by
  // historia.html. Nothing is uploaded; photos, receipts and notes stay on the phone.
  const b64u=bytes=>{let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(out).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
  async function packHistory(c){const ev=[...c.events].sort((a,b)=>a.date.localeCompare(b.date)),fs=fuelStats(c);
    const data={v:1,at:today(),n:c.name,p:c.plate,y:c.year,km:c.km,b:c.body,c:c.color,f:c.fuel||'',...(isCar(c)?{}:{k:c.kind}),e:ev.map(e=>[e.date,dispType(c,e.type),e.km,e.cost===''||e.cost===undefined?null:Number(e.cost),e.note||'',e.items||[],(e.receipts||[]).length,(e.photos||[]).length,...(e.by&&e.by.t==='self'?[1]:e.by&&e.by.t==='shop'&&e.by.n?[e.by.n]:[])])};
    if(fs.avg!==null)data.fa=[Math.round(fs.avg*10)/10,unitOf(c),...(hourly(c)?['h']:[])];const raw=new TextEncoder().encode(JSON.stringify(data));
    if(window.CompressionStream){try{return 'z'+b64u(new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()));}catch(e){}}
    return 'j'+b64u(raw);}
  async function saleLink(id){const c=cars.find(c=>c.id===id);if(!c)return;const url=new URL('historia.html',location.href);url.search='';url.hash=await packHistory(c);const href=url.href,y=screen.scrollTop;
    if(navigator.share){try{await navigator.share({title:tl('Huoltohistoria: '+c.name),text:tl(`${c.name} (${c.plate}): huoltohistoria AJOURAsta.`),url:href});return;}catch(e){if(e&&e.name==='AbortError')return;}}
    try{await navigator.clipboard.writeText(href);notice='✓ Linkki kopioitu. Liitä se viestiin tai myynti-ilmoitukseen.';}catch(e){window.prompt('Kopioi linkki:',href);}render();screen.scrollTop=y;}
  // Feedback from test users: the phone's share sheet (or the clipboard) carries the message to whoever they choose.
  async function sendFeedback(form){const msg=String(new FormData(form).get('msg')).trim().slice(0,2000),err=form.querySelector('.error-note');if(msg.length<3){err.textContent='Kirjoita ensin palautteesi.';return;}
    const dev=(navigator.userAgent.match(/iPhone|iPad|Android|Windows|Macintosh|Linux/)||['laite'])[0],text=`AJOURA-palaute:\n${msg}\n\n(Versio ${appVersion} · ${dev} · ${installed?'asennettu sovellus':'selain'} · näkymä ${route().view} · autoja ${cars.length})`,y=screen.scrollTop;
    const R=window.AjouraRoles,sent=R?await R.sendFeedback(msg,`Versio ${appVersion} · ${dev} · ${installed?'asennettu':'selain'} · ${route().view} · autoja ${cars.length}`):false;const done=m=>{err.textContent='';let el=form.querySelector('.fb-note');if(!el){el=document.createElement('p');el.className='success-note fb-note';el.setAttribute('role','status');err.after(el);}el.textContent=m;el.scrollIntoView({block:'nearest'});};
    if(sent){form.reset();done('✓ Kiitos! Palaute meni suoraan AJOURAn tekijöille.');return;}
    if(navigator.share){try{await navigator.share({text});form.reset();done('✓ Kiitos palautteesta!');return;}catch(e){if(e&&e.name==='AbortError')return;}}
    try{await navigator.clipboard.writeText(text);done(R&&R.feedbackOnline()?'Suora lähetys ei onnistunut. Palaute kopioitiin: liitä se viestiin AJOURAn tekijöille.':'✓ Palaute kopioitu. Liitä se viestiin AJOURAn tekijöille.');}catch(e){window.prompt('Kopioi palaute:',text);done('Palautetta ei voitu lähettää suoraan. Lähetä kopioimasi teksti viestinä AJOURAn tekijöille.');}void y;}
  const feedbackForm=()=>`<form class="app-form feedback-form" id="feedback-form" novalidate><label>Mikä toimi, mikä ei, mitä puuttuu?<textarea name="msg" rows="4" maxlength="2000" placeholder="Esim. kuitin lisäys oli hankala, koska…"></textarea></label><p class="error-note" role="alert"></p><button class="app-button" type="submit">Lähetä palaute</button><small class="field-help">${window.AjouraRoles&&window.AjouraRoles.feedbackOnline()?'Palaute menee suoraan AJOURAn tekijöille.':'Palaute avautuu puhelimen jakovalikkoon, josta valitset vastaanottajan (esim. WhatsApp).'} Mukaan liitetään sovelluksen versio, laitetyyppi, avoinna ollut näkymä ja autojen määrä, ei autojesi tietoja.</small></form>`;
  // Ownership transfer: one car in the backup format, so the buyer imports it with Restore backup.
  function transfer(id){const c=cars.find(c=>c.id===id);if(!c)return;const data=JSON.stringify({app:'AJOURA',version:1,transfer:true,saved:new Date().toISOString(),cars:[{...c,sample:undefined,notes:undefined,memos:undefined}]});
    saveFile(new File([data],'ajoura-siirto-'+c.plate.replace(/-/g,'')+'.json',{type:'application/json'}),true);}
  async function shareApp(){const url='https://ajoura-app.github.io/';if(navigator.share){try{await navigator.share({title:'AJOURA',text:tl('AJOURA – autosi oma huoltokirja.'),url});}catch(e){}return;}
    try{await navigator.clipboard.writeText(url);notice='✓ Linkki kopioitu leikepöydälle.';}catch(e){notice=url;}const y=screen.scrollTop;render();screen.scrollTop=y;}
  function carEdit(c){if(!isCar(c))return kindEdit(c);const y=new Date().getFullYear();return `${back('vehicle/'+c.id,'Ajoneuvo')}<h2 class="app-heading">Muokkaa ajoneuvoa</h2><form class="app-form" id="caredit-form" novalidate><label>Rekisteritunnus<input name="plate" required maxlength="7" autocomplete="off" autocapitalize="characters" inputmode="text" value="${escape(c.plate)}"></label><label>Merkki ja malli<input name="name" required minlength="2" maxlength="60" autocomplete="off" value="${escape(c.name)}"></label><label>Lempinimi <small>· valinnainen</small><input name="nick" enterkeyhint="next" maxlength="24" autocomplete="off" value="${escape(c.nick||'')}"></label><div class="form-row"><label>Vuosimalli<select name="year" required>${yearOptions(c.year)}</select></label><label>Mittarilukema (km)<input name="km" type="number" enterkeyhint="next" required min="0" max="2000000" inputmode="numeric" value="${c.km}"></label></div><label>Käyttövoima <small>· valinnainen</small><select name="fuel"><option value="">Valitse</option>${fuels.map(f=>`<option${f===c.fuel?' selected':''}>${f}</option>`).join('')}</select></label><div class="form-row"><label>Korimalli<select name="body">${bodyOrder.map(b=>`<option value="${b}"${b===c.body?' selected':''}>${Car.names[b]}</option>`).join('')}</select></label><label>Väri<select name="color">${Car.colors.map(([n,v])=>`<option value="${v}"${v===c.color?' selected':''}>${n}</option>`).join('')}</select></label></div><p class="error-note" id="form-error" role="alert"></p><div class="form-actions"><button class="app-button" type="submit">Tallenna muutokset</button><a class="app-button secondary" href="#vehicle/${c.id}">Peruuta</a><a class="owner-link" href="#owner/${c.id}">${svg(icons.user)} Omistajanvaihdos</a><button class="app-back danger-link" type="button" data-remove="${c.id}">Poista ajoneuvo</button></div></form>`;}
  function saveCarEdit(form){const c=cars.find(c=>c.id===route().id);if(!c)return;if(!isCar(c))return saveKindEdit(form,c);const d=new FormData(form),err=document.getElementById('form-error'),plate=normalPlate(String(d.get('plate')).trim()),name=String(d.get('name')).trim().replace(/\s+/g,' '),nick=String(d.get('nick')).trim().slice(0,24),year=Number(d.get('year')),km=Number(d.get('km')),fuel=String(d.get('fuel')),body=String(d.get('body')),color=String(d.get('color')),max=new Date().getFullYear()+1;
    if(!plateOk(plate)){err.textContent='Tarkista rekisteritunnus.';return;}if(name.length<2||name.length>60){err.textContent='Kirjoita merkki ja malli.';return;}if(!Number.isInteger(year)||year<1930||year>max){err.textContent=`Vuosimallin pitää olla väliltä 1930–${max}.`;return;}if(String(d.get('km')).trim()===''){err.textContent='Syötä nykyinen mittarilukema.';return;}if(!Number.isSafeInteger(km)||km<0||km>2000000){err.textContent='Tarkista mittarilukema.';return;}if(!Car.bodies.includes(body)||!Car.colors.some(([,v])=>v===color)||(fuel!==''&&!fuels.includes(fuel))){err.textContent='Tarkista valinnat.';return;}if(km<maxKm(c)){err.textContent=`Mittarilukema ei voi olla pienempi kuin historiaan kirjattu ${number(maxKm(c))} km. Korjaa tarvittaessa ensin väärä merkintä.`;return;}
    if(c.gen&&(c.body!==body||c.year!==year||c.name!==name))delete c.gen;Object.assign(c,{plate,name,nick,year,km,fuel,body,color});persist();notice='✓ Tiedot päivitetty.';go('vehicle/'+c.id);}
  // Right after a vehicle is saved: the two things a new user usually wants next, so adding three cars is a quick loop.
  const addedNext=c=>`<div class="added-next"><h3>Mitä seuraavaksi?</h3><a class="app-button" href="#add/${c.id}">＋ Kirjaa viimeisin huolto</a><a class="app-button secondary" href="#newcar">＋ Lisää seuraava ajoneuvo</a><p>${isCar(c)?'Vanhoja huoltoja ei tarvitse kirjata heti. Viimeisin huolto ja katsastus riittävät muistutuksiin.':'Vanhoja huoltoja ei tarvitse kirjata heti. Viimeisin huolto riittää muistutukseen.'}</p></div>`;
  function vehicle(c){const sorted=[...c.events].sort(newest),year=today().slice(0,4);return `${back('home','Koti')}<div class="vehicle-hero">${vehicleImage(c)}<h2 class="app-heading">${escape(carName(c))}</h2><p>${c.nick?escape(c.name)+' · ':''}${[c.plate?escape(c.plate):'',c.year,typeOf(c),colorName(c.color),c.fuel?escape(c.fuel):'',c.engine?escape(c.engine):''].filter(Boolean).join(' · ')}</p><div class="photo-actions"><label class="photo-button">＋ ${c.photo?'Lisää kuvia':'Lisää omia kuvia'}<input type="file" accept="image/*" multiple data-car-photos="${c.id}" class="sr-only"></label>${c.photo?`<button type="button" class="photo-button plain" data-photo-remove="${c.id}">Poista pääkuva</button><button type="button" class="photo-button plain" data-photo-process="${c.id}">Poista kuvan tausta</button>`:''}<a class="photo-button" href="#caredit/${c.id}">Muokkaa tietoja</a></div>${carGallery(c)}</div>${notice?`<p class="success-note" role="status">${escape(notice)}</p>`:''}${notice&&/lisätty talliin\.$/.test(notice)?addedNext(c):''}<div class="app-stats"><div><strong>${number(c.km)} <small>${ku(c)}</small></strong><span>${hourly(c)?'Käyttötunnit':'Mittarilukema'}</span></div><div><strong>${c.events.length}</strong><span>Merkintää</span></div></div><div class="cost-line"><span>Kirjatut kulut yhteensä</span><strong>${number(costOf(c.events))} €</strong><small>Vuonna ${year}: ${number(costOf(c.events.filter(e=>e.date.startsWith(year))))} €</small>${(f=>f?`<small class="fuel-cost">${costWord(c)} ${year}: ${number(f)} €</small>`:'')((c.fuels||[]).filter(f=>f.date.startsWith(year)&&f.cost!==null).reduce((m,f)=>m+f.cost,0))}</div>${notesCard(c)}${fuelCard(c)}<a class="app-button" href="#add/${c.id}">＋ Lisää merkintä</a>${upcoming(c)}${tipsCard(c)}${kmChart(c)}<div class="history-heading"><h3>Huoltohistoria</h3><a href="#report/${c.id}">Raportti →</a></div>${sorted.length?timeline(c,sorted):'<p class="app-empty">Ei vielä tapahtumia. Lisää ensimmäinen merkintä yllä olevasta painikkeesta.</p>'}<p class="app-note">${c.sample?'Esimerkkiauto: kuvitteellinen historia, rekisteritunnus ja hinnat. ':''}${c.photo?'Kuva on omasi ja pysyy tässä laitteessa.':(isCar(c)?'Automalli on tyylitelty kuvitus valitsemastasi korimallista ja väristä. Voit vaihtaa tilalle oman kuvan.':'Kuva on piirretty kuvitus valitsemastasi tyypistä ja väristä. Voit vaihtaa tilalle oman kuvan.')}</p><button class="app-back danger-link" type="button" data-remove="${c.id}">Poista ajoneuvo</button>`;}
  // Own photos of the car: the first is the cover shown in the garage, the rest form a gallery under it.
  function carGallery(c){const g=c.gallery||[];if(!g.length)return '';return `<div class="car-gallery" aria-label="Kuvat autosta">${g.map((src,i)=>`<span class="att-thumb"><button type="button" class="att-open" data-view-src="${i}" data-view-kind="gallery" data-view-target="car:${c.id}" aria-label="Avaa kuva ${i+1}"><img src="${ownPhoto(src)}" alt=""></button><button type="button" class="att-remove" data-att-remove="gallery" data-att-index="${i}" data-att-target="car:${c.id}" aria-label="Poista kuva ${i+1}">×</button><button type="button" class="cover-pick" data-cover="${c.id}" data-cover-index="${i}" aria-label="Aseta kuva ${i+1} pääkuvaksi" title="Pääkuvaksi">★</button></span>`).join('')}</div><p class="gallery-help">${g.length+1} kuvaa · ★ vaihtaa pääkuvan</p>`;}
  async function addCarPhotos(input){const c=cars.find(c=>c.id===input.dataset.carPhotos);if(!c)return;const files=[...(input.files||[])];input.value='';if(!files.length)return;
    const before={photo:c.photo,gallery:[...(c.gallery||[])]},room=12-before.gallery.length+(c.photo?0:1),use=files.slice(0,Math.max(0,room));let bad=0,added=0,unprocessed=0;
    for(const f of use){let d=await shrink(f,900,.8);if(!d){bad++;continue;}try{d=await prepareVehiclePhoto(d);}catch(e){unprocessed++;}if(!c.photo)c.photo=d;else(c.gallery||(c.gallery=[])).push(d);added++;}
    if(added&&!savedOk()){c.photo=before.photo;if(!c.photo)delete c.photo;c.gallery=before.gallery;persist();notice='Kuvia ei voitu tallentaa: laitteen tila ei riitä.';}
    else notice=added?`✓ ${added===1?'Kuva':added+' kuvaa'} tallennettu.`+(files.length>use.length?' Autolle mahtuu enintään 13 kuvaa.':''):bad?'Kuvia ei voitu avata. Valitse kuvatiedostoja.':'Autolle mahtuu enintään 13 kuvaa.';
    if(unprocessed)notice+=' Taustanpoisto ei onnistunut. Alkuperäinen kuva säilytettiin. Voit yrittää uudelleen kuvan kohdalta.';if(c.gallery&&!c.gallery.length)delete c.gallery;const y=screen.scrollTop;render();screen.scrollTop=y;}
  function setCover(btn){const c=cars.find(c=>c.id===btn.dataset.cover),i=Number(btn.dataset.coverIndex);if(!c||!c.gallery||!c.gallery[i])return;const next=c.gallery[i];if(c.photo)c.gallery[i]=c.photo;else c.gallery.splice(i,1);c.photo=next;persist();notice='✓ Pääkuva vaihdettu.';const y=screen.scrollTop;render();screen.scrollTop=y;}
  // Photos and receipts on an event. Images are shrunk on the device and kept only in this device's storage.
  let pending={photos:[],receipts:[]},pendingFor='';const attInfo={photos:['Kuvat','＋ Lisää kuvia','Esim. vaihdetut osat tai työn jälki.',900,.75],receipts:['Kuitit','＋ Lisää kuitti','Ota kuva kuitista tai valitse se kuvista.',1400,.8]};
  const attThumbs=(kind,target,list)=>list.map((src,i)=>`<span class="att-thumb${kind==='receipts'?' receipt':''}"><button type="button" class="att-open" data-view-src="${i}" data-view-kind="${kind}" data-view-target="${target}" aria-label="Avaa ${kind==='receipts'?'kuitti':'kuva'} ${i+1}"><img src="${src}" alt=""></button><button type="button" class="att-remove" data-att-remove="${kind}" data-att-index="${i}" data-att-target="${target}" aria-label="Poista ${kind==='receipts'?'kuitti':'kuva'} ${i+1}">×</button></span>`).join('');
  function attSection(kind,target,list){const [title,button,help]=attInfo[kind];return `<fieldset class="att-set" id="att-${kind}"><legend>${title} <small>· ${list.length?list.length+' kpl':'valinnainen'}</small></legend><div class="att-grid">${attThumbs(kind,target,list)}<label class="att-add">${button}<input type="file" accept="image/*" multiple class="sr-only" data-att="${kind}" data-att-target="${target}"></label></div><p class="field-help">${help}</p></fieldset>`;}
  function attList(target,kind){if(target==='pending')return pending[kind];if(target.startsWith('car:')){const c=cars.find(c=>c.id===target.slice(4));return c?(c.gallery||(c.gallery=[])):null;}const [cid,eid]=target.split(':'),e=cars.find(c=>c.id===cid)?.events.find(e=>e.id===eid);if(!e)return null;return e[kind]||(e[kind]=[]);}
  function refreshAtt(target,kind,msg){if(target==='pending'){const el=document.getElementById('att-'+kind);if(el)el.outerHTML=attSection(kind,target,pending[kind]);const err=document.getElementById('form-error');if(err&&msg)err.textContent=msg;}else{if(msg)notice=msg;const y=screen.scrollTop;render();screen.scrollTop=y;}}
  function shrink(file,max,q){return new Promise(res=>{if(!/^image\//.test(file.type))return res(null);const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{const k=Math.min(1,max/Math.max(img.width,img.height)),cv=document.createElement('canvas');cv.width=Math.round(img.width*k);cv.height=Math.round(img.height*k);cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);URL.revokeObjectURL(url);if(!cv.width||!cv.height)return res(null);const d=cv.toDataURL('image/jpeg',q);res(/^data:image\/jpeg;base64,/.test(d)?d:null);};img.onerror=()=>{URL.revokeObjectURL(url);res(null);};img.src=url;});}
  function savedOk(){return persist();}
  async function addAtt(input){const kind=input.dataset.att,target=input.dataset.attTarget,list=attList(target,kind);if(!list)return;const [, , , max,q]=attInfo[kind],files=[...input.files].slice(0,12-list.length);let added=0,bad=0;for(const f of files){const d=await shrink(f,max,q);if(d){list.push(d);added++;}else bad++;}
    let msg=bad?'Osaa tiedostoista ei voitu avata. Valitse kuvatiedostoja.':'';if(input.files.length>files.length)msg=kind==='gallery'?'Enintään 12 lisäkuvaa autoa kohden.':'Enintään 12 kpl per tapahtuma.';
    if(target!=='pending'&&added){if(savedOk())msg=msg||'✓ Tallennettu.';else{list.splice(list.length-added,added);persist();msg='Ei tallennettu: laitteen tila ei riitä.';}}
    refreshAtt(target,kind,msg);}
  function removeAtt(btn){const kind=btn.dataset.attRemove,target=btn.dataset.attTarget,list=attList(target,kind);if(!list)return;list.splice(Number(btn.dataset.attIndex),1);if(target!=='pending')persist();refreshAtt(target,kind,target==='pending'?'':'Poistettu.');}
  function viewAtt(btn){const list=attList(btn.dataset.viewTarget,btn.dataset.viewKind);const src=list&&list[Number(btn.dataset.viewSrc)];if(!src)return;const d=document.createElement('dialog');d.className='att-viewer';d.innerHTML=`<img src="${btn.dataset.viewKind==='gallery'?ownPhoto(src):src}" alt="${btn.dataset.viewKind==='receipts'?'Kuitti':'Kuva'}"><button type="button" class="app-button secondary">Sulje</button>`;document.body.appendChild(d);d.addEventListener('close',()=>d.remove());d.addEventListener('click',ev=>{if(ev.target===d||ev.target.closest('button'))d.close();});d.showModal();}
  const partRow=(x={name:'',qty:'',price:''})=>`<div class="part-row"><input name="partName" maxlength="60" placeholder="Osa, merkki tai tuotenumero" value="${escape(x.name)}" aria-label="Osa"><input name="partQty" maxlength="12" placeholder="esim. 4 l" value="${escape(x.qty)}" aria-label="Määrä"><input name="partPrice" type="number" min="0" step="0.01" inputmode="decimal" placeholder="€" value="${escape(x.price)}" aria-label="Hinta euroina"></div>`;
  function partsSection(v){const parts=v.parts||[],has=parts.length||v.labor||v.other;return `<details class="check-set parts-set"${has?' open':''}><summary>Kulut eriteltyinä <small>· varaosat, työ, muut</small></summary><div class="part-head"><span>Varaosa</span><span>Määrä</span><span>€</span></div><div class="part-rows">${(parts.length?parts:[{name:'',qty:'',price:''},{name:'',qty:'',price:''}]).map(partRow).join('')}</div><button class="app-back" type="button" data-add-part>＋ Lisää rivi</button><div class="form-row"><label>Työ (€)<input name="labor" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0" value="${escape(v.labor||'')}"></label><label>Muut (€)<input name="other" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0" value="${escape(v.other||'')}"></label></div><p class="field-help" id="parts-total">Yhteensä lasketaan kustannukseen automaattisesti.</p></details>`;}
  function readParts(data){const n=data.getAll('partName'),q=data.getAll('partQty'),p=data.getAll('partPrice');return n.map((name,i)=>({name:String(name).trim().slice(0,60),qty:String(q[i]).trim().slice(0,12),price:String(p[i]).trim()})).filter(x=>x.name||x.price).slice(0,30);}
  function syncPartsTotal(form){const data=new FormData(form),parts=readParts(data),labor=String(data.get('labor')||''),other=String(data.get('other')||'');if(!parts.length&&!labor&&!other){const cost=form.elements.cost;if(cost.dataset.auto!==undefined&&Number(cost.dataset.auto)===Number(cost.value)){cost.value='';delete cost.dataset.auto;}return;}const sum=[...parts.map(x=>x.price),labor,other].reduce((a,v)=>a+(Number(v)||0),0);const cost=form.elements.cost,auto=Math.round(sum*100)/100;if(cost.value===''||(cost.dataset.auto!==undefined&&Number(cost.dataset.auto)===Number(cost.value))){if(auto>0){cost.value=auto;cost.dataset.auto=String(auto);document.getElementById('parts-total').textContent='Yhteensä '+number(sum)+' € (päivitetty kustannukseen).';}else{cost.value='';delete cost.dataset.auto;document.getElementById('parts-total').textContent='Lisää hinnat, niin summa päivittyy kustannukseen.';}}else document.getElementById('parts-total').textContent='Eriteltyjen summa '+number(sum)+' €. Kustannukseen kirjoittamasi summa säilyy.';}
  // Items shown for a type: that type's list plus anything already saved on the entry, so editing never drops a saved item.
  const itemList=(c,t,keep)=>[...itemsFor(c,t),...keep.filter(i=>!itemsFor(c,t).includes(i))];
  const itemBoxes=(list,on)=>list.map(i=>`<label class="check-item"><input type="checkbox" name="items" value="${i}"${on.includes(i)?' checked':''}><span>${i}</span></label>`).join('');
  function syncItems(form){const c=cars.find(x=>x.id===form.dataset.car);if(!c)return;const t=form.elements.type.value,set=form.querySelector('.items-set'),grid=set.querySelector('.check-grid');let keep=[];try{keep=JSON.parse(grid.dataset.keep||'[]');}catch(err){}
    const on=[...grid.querySelectorAll('input:checked')].map(x=>x.value),list=itemList(c,t,keep);grid.innerHTML=itemBoxes(list,on);set.hidden=!list.length;if(list.length)set.open=true;set.querySelector('.items-help').hidden=t!=='Muu huolto';}
  function add(c,e){const v=e||{type:'',date:today(),km:'',cost:'',note:'',items:[]},items=v.items||[],selType=dispType(c,v.type);if(e&&!pendingFor){pendingFor=e.id;pending={photos:[...(e.photos||[])],receipts:[...(e.receipts||[])]};}
    return `${back(e?'event/'+c.id+'/'+e.id:'vehicle/'+c.id,e?'Merkintä':'Ajoneuvo')}<h2 class="app-heading">${e?'Muokkaa merkintää':'Uusi merkintä'}</h2><p class="app-subtitle">${escape(carName(c))} · ${plateTxt(c)}<br>${e?'Tarkenna tietoja, lisää kuitit ja kuvat.':'Pakollisia ovat vain tyyppi ja päivämäärä. Loput voit lisätä myöhemmin.'}</p><form class="app-form" id="event-form" data-car="${c.id}"><label>Tapahtuma<select name="type" required><option value="">Valitse tapahtuman tyyppi</option>${[...kindsFor(c),...(v.type&&!kindsFor(c).includes(selType)?[v.type]:[])].map(k=>`<option${k===selType?' selected':''}>${escape(k)}</option>`).join('')}</select></label><label>Päivämäärä<input name="date" type="date" value="${v.date}" max="${today()}"${e?'':` min="${c.year-1}-01-01"`} required></label><label>${meterLabel(c)} <small>· valinnainen</small><input name="km" type="number" min="0" max="2000000" step="1" inputmode="numeric" placeholder="${c.km}" value="${v.km===null?'':v.km}"></label><p class="field-help">Viimeisin kirjattu lukema: ${number(c.km)} ${ku(c)}.</p><label>Kustannus (€) <small>· valinnainen</small><input name="cost" type="number" min="0" max="1000000" step="0.01" inputmode="decimal" placeholder="0,00" value="${escape(v.cost||'')}"${(()=>{const sum=Math.round([...(v.parts||[]).map(x=>x.price),v.labor,v.other].reduce((a,x)=>a+(Number(x)||0),0)*100)/100;return v.cost!==''&&v.cost!==undefined&&String(sum)===String(Number(v.cost))?` data-auto="${sum}"`:'';})()}></label>${partsSection(v)}<details class="check-set items-set"${items.length?' open':''}${itemList(c,selType,items).length?'':' hidden'}><summary>Tehdyt toimenpiteet <small>· ${items.length?items.length+' valittu':'valinnainen'}</small></summary><p class="field-help items-help"${selType==='Muu huolto'?'':' hidden'}>Kun valitset Moottoriöljy, seuraavan huollon arvio lasketaan tästä merkinnästä.</p><div class="check-grid" data-keep="${escape(JSON.stringify(items))}">${itemBoxes(itemList(c,selType,items),items)}</div></details>${byFields(v,selType)}<label>Muistiinpano <small>· valinnainen</small><textarea name="note" maxlength="300" rows="3" placeholder="Esim. öljy ja suodatin vaihdettu itse">${escape(v.note||'')}</textarea></label>${attSection("photos","pending",pending.photos)}${attSection("receipts","pending",pending.receipts)}<p class="error-note" id="form-error" role="alert"></p><div class="form-actions"><button class="app-button" type="submit">${e?'Tallenna muutokset':'Tallenna'}</button><a class="app-button secondary" href="#${e?'event/'+c.id+'/'+e.id:'vehicle/'+c.id}">Peruuta</a>${e?`<button class="app-back danger-link" type="button" data-delete-event="${e.id}">Poista merkintä</button>`:''}</div><p class="app-fineprint">${keepNote()}</p></form>`;}
  // Entry page (22.10.2026): summary card, key facts as tiles and the actions (edit, print, delete) at the top where they are found.
  // The same markup prints as an A4 sheet: #event-sheet is the only thing visible in print, .ev-print parts appear only on paper.
  const evIcons={edit:'<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',print:'<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'};
  // Entry context (22.10.2026): time and distance since the previous entry of the same kind (all service types count as one),
  // older/newer neighbours for browsing, and the next due date when this entry is the one the reminder is counted from.
  const evGroup=(c,e)=>isService(e)?'svc':dispType(c,e.type);
  const spanTxt=d=>d<62?`<span>${number(d)}</span> <span>pv</span>`:`<span>${number(Math.round(d/30.4))}</span> <span>kk</span>`;
  // Who did the work and when the entry was added or edited (0.38). The same words go to the screen, the report and the PDFs.
  // full=false (vehicle report, buyer link) leaves out another person's name: only a company name or "Itse" goes towards a buyer.
  const byKinds=[['self','Itse'],['shop','Yritys'],['other','Joku muu']],noBy=['Mittarilukeman päivitys','Omistajanvaihdos'];
  const byWho=(b,full)=>!b?null:b.t==='self'?{txt:'Itse'}:b.t==='shop'?(b.n?{txt:b.n,own:true}:{txt:'Yritys'}):full&&b.n?{txt:b.n,own:true}:{txt:'Joku muu'};
  const whoHtml=w=>w.own?`<span translate="no">${escape(w.txt)}</span>`:`<span>${w.txt}</span>`;
  const evTime=v=>{const d=new Date(v);return {d:new Intl.DateTimeFormat('fi-FI').format(d),t:d.getHours()+'.'+String(d.getMinutes()).padStart(2,'0')};};
  const evStamps=e=>[['created','Lisätty'],['updated','Muokattu']].filter(([k])=>e[k]).map(([k,w])=>({w,...evTime(e[k])}));
  const stampHtml=e=>evStamps(e).map((x,i,a)=>`<span class="nw"><span>${x.w}</span> <span>${x.d}</span> <span>klo</span> <span>${x.t}</span>${i<a.length-1?'&nbsp;·':''}</span>`).join(' ');
  const stampTxt=e=>evStamps(e).map(x=>`${tl(x.w)} ${x.d} ${tl('klo')} ${x.t}`).join(' · ');
  // One small line for the vehicle report and its PDF: who did the work (no contact details, no private names) and the times.
  const evMetaHtml=e=>{const w=byWho(e.by,false),st=stampHtml(e);return [w?`<span>Työn teki:</span> ${whoHtml(w)}`:'',st].filter(Boolean).join('&nbsp;· ');};
  const evMetaTxt=e=>{const w=byWho(e.by,false),st=stampTxt(e);return [w?`${tl('Työn teki:')} ${w.own?w.txt:tl(w.txt)}`:'',st].filter(Boolean).join(' · ');};
  // Companies used before, newest first, for the name suggestions and to fill in their contact details (no separate store).
  function knownShops(){const out=[],seen=new Set();for(const e of cars.filter(c=>!c.sample).flatMap(c=>c.events).filter(e=>e.by&&e.by.t==='shop'&&e.by.n).sort(newest)){const k=e.by.n.trim().toLowerCase();if(!seen.has(k)){seen.add(k);out.push(e.by);}}return out;}
  // Entry page: who did the work, with a company's contact details as links.
  function byBlock(e){const b=e.by,w=byWho(b,true);if(!w)return '';
    const bits=b.t==='shop'?[b.tel&&`<a class="nw" href="tel:${escape(b.tel.replace(/[^\d+]/g,''))}" translate="no">${escape(b.tel)}</a>`,b.mail&&`<a href="mailto:${escape(b.mail)}" translate="no">${escape(b.mail)}</a>`,b.addr&&`<span translate="no">${escape(b.addr)}</span>`,b.yt&&`<span class="nw"><span>Y-tunnus</span> <span translate="no">${escape(b.yt)}</span></span>`].filter(Boolean):[];
    return `<div class="ev-by"><span class="ev-by-k">Työn teki</span> <b>${whoHtml(w)}</b>${bits.length?`<small>${bits.join('&nbsp;· ')}</small>`:''}</div>`;}
  // Form fields: the kind first; a company's name (with earlier companies as suggestions) and optional contact details, or another person's name.
  function byFields(v,t){const b=v.by||{},shops=knownShops(),hide=noBy.includes(t),shop=b.t==='shop',val=k=>escape(b[k]||'');
    return `<div class="by-set"${hide?' hidden':''}><label>Kuka teki työn? <small>· valinnainen</small><select name="by">${[['','Ei merkitty'],...byKinds].map(([k,n])=>`<option value="${k}"${(b.t||'')===k?' selected':''}>${n}</option>`).join('')}</select></label>`
      +`<div class="by-shop"${shop?'':' hidden'}><label>Yrityksen nimi<input name="by_n" maxlength="80" autocomplete="off"${shops.length?' list="by-shops"':''} value="${shop?val('n'):''}"${shop&&!hide?' required':''}></label>${shops.length?`<datalist id="by-shops">${shops.map(x=>`<option value="${escape(x.n)}"></option>`).join('')}</datalist><p class="field-help">Aiemmin käytetyt yritykset tulevat ehdotuksina, ja niiden yhteystiedot täyttyvät valmiiksi.</p>`:''}`
      +`<details class="check-set by-contact"${shop&&(b.tel||b.mail||b.addr||b.yt)?' open':''}><summary>Yrityksen yhteystiedot <small>· valinnainen</small></summary><label>Puhelin<input name="by_tel" type="tel" maxlength="30" autocomplete="off" value="${shop?val('tel'):''}"></label><label>Sähköposti<input name="by_mail" type="email" maxlength="100" autocomplete="off" value="${shop?val('mail'):''}"></label><label>Osoite<input name="by_addr" maxlength="120" autocomplete="off" value="${shop?val('addr'):''}"></label><label>Y-tunnus<input name="by_yt" maxlength="12" autocomplete="off" inputmode="numeric" placeholder="1234567-8" value="${shop?val('yt'):''}"></label></details></div>`
      +`<div class="by-other"${b.t==='other'?'':' hidden'}><label>Nimi <small>· valinnainen</small><input name="by_o" maxlength="80" autocomplete="off" value="${b.t==='other'?val('n'):''}"></label></div></div>`;}
  function syncBy(form){const set=form.querySelector('.by-set');if(!set)return;const hide=noBy.includes(form.elements.type.value),t=form.elements.by.value;set.hidden=hide;set.querySelector('.by-shop').hidden=t!=='shop';set.querySelector('.by-other').hidden=t!=='other';form.elements.by_n.required=!hide&&t==='shop';}
  function fillShop(form){const n=form.elements.by_n.value.trim().toLowerCase(),x=n&&knownShops().find(s=>s.n.trim().toLowerCase()===n);if(!x)return;let any=false;for(const k of ['tel','mail','addr','yt']){const f=form.elements['by_'+k];if(f&&!f.value&&x[k]){f.value=x[k];any=true;}}if(any)form.querySelector('.by-contact').open=true;}
  // What the entry page says about the previous entry of the same group and the next due date; shared by the screen and the PDF.
  function evInfo(c,e){const ev=[...c.events].sort(newest),i=ev.findIndex(x=>x.id===e.id),g=evGroup(c,e),prev=ev.slice(i+1).find(x=>evGroup(c,x)===g);
    const word=g==='svc'?['Edellisestä huollosta','Ensimmäinen kirjattu huolto']:e.type==='Katsastus'?['Edellisestä katsastuksesta','Ensimmäinen kirjattu katsastus']:['Edellisestä kerrasta','Ensimmäinen kirjattu kerta'];
    const days=prev?Math.max(0,Math.round(dayNum(e.date)-dayNum(prev.date))):null,km=prev&&e.km!==null&&prev.km!==null&&e.km>=prev.km?e.km-prev.km:null;
    const due=dueDates(c).find(d=>d.from===e.date&&(d.what==='Huolto'?g==='svc':e.type==='Katsastus')),latest=ev.find(x=>evGroup(c,x)===g)?.id===e.id;
    return {ev,i,prev,word,days,km,due:due&&latest?due:null};}
  function evContext(c,e){const {ev,i,prev,word,days,km,due}=evInfo(c,e);
    let since;if(!prev)since=`<div class="ev-since first"><span class="ev-since-ico" aria-hidden="true">${svg(icons.cal)}</span><span class="ev-since-txt"><b>${word[1]}</b></span></div>`;
    else since=`<a class="ev-since" href="#event/${c.id}/${prev.id}"><span class="ev-since-ico" aria-hidden="true">${svg(icons.cal)}</span><span class="ev-since-txt"><b>${word[0]}</b><strong>${spanTxt(days)}${km!==null?` · <span>${number(km)} ${ku(c)}</span>`:''}</strong></span><span class="ev-since-prev"><span>${date(prev.date)}</span> <span class="no-print" aria-hidden="true">›</span></span></a>`;
    const next=due?`<p class="ev-next"><span>${due.what==='Huolto'?'Tämän huollon perusteella seuraava huolto':'Arvio seuraavasta katsastuksesta'}</span> <b><span>${date(due.due)}</span>${due.km!==null?` <span>tai</span> <span>${number(due.km)} km</span>`:''}</b></p>`:'';
    const nav=(x,cls,label)=>x?`<a class="ev-nav-btn ${cls}" href="#event/${c.id}/${x.id}"><span class="ev-nav-dir">${label}</span><small><span>${escape(dispType(c,x.type))}</span> · <span>${date(x.date)}</span></small></a>`:'<span class="ev-nav-btn empty"></span>';
    const older=ev[i+1],newer=i>0?ev[i-1]:null;
    return {since,next,nav:older||newer?`<nav class="ev-nav no-print" aria-label="Selaa merkintöjä">${nav(older,'older','‹ Edellinen')}${nav(newer,'newer','Seuraava ›')}</nav>`:''};}
  // View-only thumbnails: open full size, no remove button (adding and removing happens in the edit view, so a receipt is not lost by a stray tap).
  const viewThumbs=(kind,target,list)=>list.map((src,i)=>`<span class="att-thumb${kind==='receipts'?' receipt':''}"><button type="button" class="att-open" data-view-src="${i}" data-view-kind="${kind}" data-view-target="${target}" aria-label="Avaa ${kind==='receipts'?'kuitti':'kuva'} ${i+1}"><img src="${src}" alt=""></button></span>`).join('');
  function detail(c,e){const has=v=>v!==''&&v!=null&&Number.isFinite(Number(v)),parts=e.parts||[],photos=e.photos||[],receipts=e.receipts||[];
    const tile=(k,v,empty)=>`<div class="ev-tile${empty?' muted':''}"><dt>${k}</dt><dd>${v}</dd></div>`,sec=(k,body)=>`<section class="ev-sec"><h3>${k}</h3>${body}</section>`;
    const x=evContext(c,e),view=(kind,k,list)=>list.length?`<section class="ev-sec ev-view no-print"><h3>${k} <small>· ${list.length} kpl</small></h3><div class="att-grid ev-thumbs">${viewThumbs(kind,c.id+':'+e.id,list)}</div></section>`:'';
    const paper=(k,list)=>list.length?`<section class="ev-sec ev-print ev-att${k==='Kuitit'?' ev-receipts':''}"><h3>${k}</h3><div class="ev-gallery">${list.map(s=>`<img src="${s}" alt="">`).join('')}</div></section>`:'';
    return `${back('vehicle/'+c.id,'Huoltohistoria')}<div id="event-sheet"><header class="report-head ev-print"><img src="logo.svg" alt="AJOURA" width="640" height="198"><div><strong>Huoltomerkintä</strong><span>Tulostettu ${date(today())}</span></div></header>`
      +`<div class="ev-hero"><span class="ev-ico" aria-hidden="true">${eventIcon(dispType(c,e.type))}</span><div><h2 class="app-heading">${escape(dispType(c,e.type))}</h2><p class="app-subtitle">${escape(carName(c))} · ${plateTxt(c)}</p></div></div>`
      +`<dl class="ev-facts">${tile('PÄIVÄMÄÄRÄ',date(e.date))}${tile(hourly(c)?'TUNTIMITTARI':'MITTARILUKEMA',e.km===null?'Ei merkitty':number(e.km)+' '+ku(c),e.km===null)}${tile('KUSTANNUS',has(e.cost)?number(e.cost)+' €':'Ei merkitty',!has(e.cost))}</dl>${x.since}${x.next}${byBlock(e)}`
      +`<div class="ev-actions no-print"><a class="ev-act primary" href="#edit/${c.id}/${e.id}">${svg(evIcons.edit)}<span>Muokkaa</span></a><button class="ev-act" type="button" data-event-pdf="${e.id}" data-event-car="${c.id}">${svg(icons.doc)}<span>Tallenna PDF</span></button><button class="ev-act danger" type="button" data-delete-event="${e.id}">${svg(evIcons.trash)}<span>Poista</span></button></div>`
      +`${notice?`<p class="success-note no-print" role="status">${escape(notice)}</p>`:''}`
      +`${e.items?.length?sec('TEHDYT TOIMENPITEET',`<ul class="ev-chips">${e.items.map(i=>`<li>${i}</li>`).join('')}</ul>`):''}`
      +`${parts.length||e.labor||e.other?sec('KULUT ERITELTYINÄ',`<table class="ev-costs"><tbody>${parts.map(x=>`<tr><td><span translate="no">${escape(x.name)}</span>${x.qty?` <small>· ${escape(x.qty)}</small>`:''}</td><td>${x.price?number(x.price)+' €':''}</td></tr>`).join('')}${e.labor?`<tr><td>Työ</td><td>${number(e.labor)} €</td></tr>`:''}${e.other?`<tr><td>Muut</td><td>${number(e.other)} €</td></tr>`:''}</tbody></table>`):''}`
      +`${e.note?sec('MUISTIINPANO',`<p class="ev-note" translate="no">${escape(e.note)}</p>`):''}`
      +`${photos.length||receipts.length?`<div class="ev-views no-print">${view('photos','KUVAT',photos)}${view('receipts','KUITIT',receipts)}</div>`:''}${photos.length||receipts.length?'':`<a class="ev-add-att no-print" href="#edit/${c.id}/${e.id}">＋ Lisää kuvia tai kuitti</a>`}${paper('Kuvat',photos)}${paper('Kuitit',receipts)}${e.created||e.updated?`<p class="ev-stamp">${stampHtml(e)}</p>`:''}${x.nav}`
      +`<footer class="report-foot ev-print"><div><strong>${company.name}</strong><span>${company.web}</span></div><div><span>${escape(carName(c))}</span><span>${plateTxt(c)}</span></div><div><span>Tulostettu ${date(today())}</span></div></footer></div>`
      +`${c.sample&&!e.id.startsWith('new')?'<p class="app-fineprint">Kuvitteellinen esimerkkimerkintä.</p>':''}`;}
  function me(){return `${back('menu','Valikko')}<h2 class="app-heading">Varmuuskopio ja tiedot</h2>${notice?`<p class="success-note" role="status">${escape(notice)}</p>`:''}<div class="me-data"><h3>Varmuuskopio</h3><p>Tallenna autot, merkinnät ja tankkaukset tiedostoon. Palauttamalla tiedoston saat ne takaisin, myös uudessa puhelimessa. Palautus yhdistää tiedot: sama auto päivittyy ja uudet lisätään.</p><div class="backup-actions"><button class="app-button" type="button" data-backup>Tallenna varmuuskopio</button><label class="app-button secondary">Palauta varmuuskopio<input type="file" accept="application/json,.json" class="sr-only" data-restore></label></div><p class="bk-when">${backupWhen()||'Varmuuskopiota ei ole vielä otettu tällä laitteella.'}</p><p class="bk-note">iPhonessa avautuu jakovalikko: valitse Tallenna Tiedostoihin.</p><p class="bk-priv">Tiedostoa ei ole salattu. Siinä ovat kaikki ajoneuvot, merkinnät, muistiinpanot, kuitit, kuvat ja työn tekijöiden yhteystiedot. Säilytä sitä kuin henkilökohtaisia papereita, esimerkiksi iCloud Drivessa tai Google Drivessa, eikä vain puhelimessa.</p></div>${window.AjouraSync&&window.AjouraSync.enabled?window.AjouraSync.meCard():`<div class="me-data"><h3>Tili <small class="soon-tag">tulossa</small></h3><p>Myöhemmin kirjautumalla autosi ja merkintäsi tallentuvat turvallisesti ja siirtyvät mukanasi uuteen puhelimeen. Siihen asti käytä varmuuskopiota.</p><button class="app-button secondary" type="button" data-login>Kirjaudu sisään <small class="soon-tag">tulossa</small></button>${loginNote?'<p class="login-note" role="status"><strong>Kirjautuminen on tulossa.</strong> Sitä ennen tiedot pysyvät tässä laitteessa.</p>':''}</div>`}<div class="me-data"><h3>Tietosi</h3><p>${signedIn()?'Autot ja merkinnät tallentuvat tähän laitteeseen ja tiliisi pilveen (Supabase, EU). Kuvat ja kuitit ovat vain tässä laitteessa.':'Autot ja merkinnät tallentuvat vain tähän laitteeseen. Niitä ei lähetetä palvelimelle.'}${installed?'':' Asenna AJOURA puhelimen kotivalikkoon: selain voi muuten poistaa tiedot, jos sivulla ei käydä pitkään aikaan. Ota myös varmuuskopio.'}</p><button class="app-button secondary danger" type="button" data-reset>Poista kaikki tiedot</button></div>`;}
  function settings(){return `${back('menu','Valikko')}<h2 class="app-heading">Asetukset</h2>${notice?`<p class="success-note" role="status">${escape(notice)}</p>`:''}<form class="app-form" id="me-form" novalidate><fieldset class="interval-set"><legend>Huoltomuistutuksen väli</legend><div class="form-row"><label>Kuukautta<input name="months" type="number" required min="1" max="36" step="1" inputmode="numeric" value="${profile.months}"></label><label>Kilometriä<input name="km" type="number" enterkeyhint="next" required min="1000" max="60000" step="500" inputmode="numeric" value="${profile.km}"></label></div><p class="field-help">Tarkista oikea väli autosi huolto-ohjelmasta. Muistutus tulee sen mukaan, kumpi täyttyy ensin.</p></fieldset><p class="error-note" id="form-error" role="alert"></p><button class="app-button" type="submit">Tallenna asetukset</button></form><div class="me-data"><h3>Ulkoasu</h3>${prefsBar()}<div class="menu-group th-row">${menuRow('#theme','palette','Teeman valinta',themeLabel())}</div></div>${window.AjouraAvatar.settings()}${aiSection()}`;}
  // 0.111 Uudet ominaisuudet: Tekoälyavustaja (Ajoura Plus). Oikeus, käyttäjän valinta ja kiintiö tulevat vain
  // access.js:stä (window.AjouraAccess); tässä ei ole omia Plus-ehtoja. Plus-käyttäjälle kytkin (oletus pois),
  // muille lukko ja maksumuuri. Kytkin päivittää vain tämän osion, joten keskeneräinen huoltovälin muutos säilyy.
  function aiSection(){const A=window.AjouraAccess;if(!A)return '';const ok=A.entitled('ai.receipt'),on=ok&&A.aiEnabled(),q=ok?A.quota('ai'):null;
    const head=`<span class="event-symbol" aria-hidden="true">${svg(icons.spark)}</span><span class="ai-txt"><strong><span>Tekoälyavustaja</span> <span class="plus-tag" translate="no">PLUS</span></strong><small>Kuittien ja huoltokirjojen älykäs tunnistus</small></span>`;
    // 0.116: kirjautumaton → kirjautumaan (testivaiheessa maksuton); kirjautunut ilman oikeutta → maksumuuri.
    const lock=`<div class="menu-row ai-row">${head}<span class="ai-lock">${svg(icons.lock)}<span class="sr-only">Lukittu</span></span></div>`;
    const rows=ok?`<label class="menu-row ai-row">${head}<input class="ai-switch" type="checkbox" role="switch" data-ai-toggle aria-label="Tekoälyavustaja" aria-describedby="ai-note"${on?' checked':''}></label>`
      :!A.account()&&A.serviceReady()?`${lock}<a class="menu-row ai-more" href="#login"><span>Kirjaudu ja kokeile maksutta</span><span class="chevron" aria-hidden="true">›</span></a>`
      :`${lock}<button class="menu-row ai-more" type="button" data-plus-open="ai.receipt"><span>Tutustu Ajoura Plussaan</span><span class="chevron" aria-hidden="true">›</span></button>`;
    const notes=ok?`<p class="ai-note" id="ai-note">${on?'Tekoälyavustaja on käytössä.':'Tekoälyavustaja on pois käytöstä. Kuvia ei lähetetä tekoälylle, ja kirjaukset toimivat kuten ennen.'}</p>${q&&q.limit!==null?`<p class="ai-note ai-quota"><span>Tunnistuksia jäljellä tässä kuussa:</span> ${q.left} / ${q.limit}</p>`:''}${A.trial()?'<p class="ai-note">Testivaiheessa maksuton kirjautuneille.</p>':''}`
      :!A.account()&&A.serviceReady()?'<p class="ai-note">Testivaiheessa kirjautuneet voivat kokeilla tekoälyavustajaa maksutta.</p>'
      :A.status()==='error'?'<p class="ai-note">Plus-tilaa ei voitu tarkistaa. Yritä uudelleen, kun verkkoyhteys toimii.</p>':'';
    return `<div class="me-data set-new"><h3>Uudet ominaisuudet</h3><div class="menu-group">${rows}</div>${notes}</div>`;}
  function paintAi(){if(route().view==='home'&&!glass.querySelector('.sheet-layer')){render();return;}const el=screen.querySelector('.set-new');if(!el)return;const f=document.activeElement&&document.activeElement.matches('[data-ai-toggle]');el.outerHTML=aiSection();if(f)screen.querySelector('[data-ai-toggle]')?.focus({preventScroll:true});}
  // 0.111 Maksumuuri: Free-käyttäjä yritti Plus-ominaisuutta. Tilausta ei voi vielä ostaa, joten painike kertoo vain,
  // että Plus on tulossa (kuten Kirjaudu sisään). Ei hintaa eikä ostoa. Teksti ominaisuuden ryhmän mukaan (ai.*).
  const plusTexts={ai:['Tekoälyavustaja kuuluu Ajoura Plussaan','Tunnista tankkauskuitit, kilometrilukemat ja vanhat huoltomerkinnät automaattisesti.']};
  function plusSheet(feature,from){const [title,lead]=plusTexts[String(feature).split('.')[0]]||plusTexts.ai;closeSheet();sheetBack=from||null;sheetSel=from&&from.dataset.plusOpen?`[data-plus-open="${from.dataset.plusOpen}"]`:'';const l=document.createElement('div');l.className='sheet-layer';
    l.innerHTML=`<div class="sheet-backdrop" data-sheet-close></div><div class="sheet plus-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><span class="sheet-grip" aria-hidden="true"></span><div class="sheet-head"><span class="plus-tag" translate="no">PLUS</span><button class="sheet-x" type="button" data-sheet-close aria-label="Sulje">×</button></div><span class="plus-hero" aria-hidden="true">${svg(icons.spark)}</span><h2 id="sheet-title">${title}</h2><p class="plus-lead">${lead}</p><button class="app-button" type="button" data-plus-more>Tutustu Ajoura Plussaan <small class="soon-tag">tulossa</small></button><p class="login-note plus-soon" role="status" hidden><strong>Ajoura Plus on tulossa myöhemmin.</strong> Tilausta ei voi vielä ostaa.</p></div>`;
    glass.appendChild(l);screen.inert=true;
    l.addEventListener('click',e=>{if(e.target.closest('[data-plus-more]')){l.querySelector('.plus-soon').hidden=false;return;}if(e.target.closest('[data-sheet-close]'))closeSheet();});
    l.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const fl=focusables(l.querySelector('.sheet'));if(!fl.length)return;const first=fl[0],lastEl=fl[fl.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();lastEl.focus();}else if(!e.shiftKey&&document.activeElement===lastEl){e.preventDefault();first.focus();}});
    requestAnimationFrame(()=>{l.classList.add('open');l.querySelector('[data-plus-more]').focus({preventScroll:true});});}
  function feedbackPage(){return `${back('menu','Valikko')}<h2 class="app-heading">Anna palautetta</h2><p class="app-subtitle">Testaatko AJOURAa? Kerro, mikä toimi ja mikä ei.</p><div class="feedback-page">${feedbackForm()}</div>`;}
  // Valikko tab: rows like a phone's settings list. Each opens a sub-page with a back link, because the installed
  // iPhone app has no browser back button.
  const menuRow=(to,icon,title,sub)=>`${to.startsWith('data-')?`<button class="menu-row" type="button" ${to}>`:`<a class="menu-row" href="${to}">`}<span class="event-symbol" aria-hidden="true">${svg(icons[icon])}</span><span><strong>${title}</strong><small>${sub}</small></span><span class="chevron" aria-hidden="true">›</span>${to.startsWith('data-')?'</button>':'</a>'}`;
  function menu(){return `${top()}<h2 class="app-heading">Valikko</h2>${notice?`<p class="success-note" role="status">${escape(notice)}</p>`:''}<div class="menu-group">${menuRow('#settings','gear','Asetukset','Huoltoväli ja ulkoasu')}${menuRow('#me','save','Varmuuskopio ja tiedot',backupWhen()||'Varmuuskopiota ei ole vielä otettu')}</div><h3 class="menu-h">Ohjeet ja tuki</h3><div class="menu-group">${(s=>menuRow('#tips',s.icon,'Kausi- ja huoltovinkit',`<span>Nyt:</span> <span>${s.chip.fi}</span>`))(seasonNow())}${menuRow('#help','help','Ohjeet ja kysymykset','Yleisimmät kysymykset ja haku')}${menuRow('data-tutorial','play','Käyttöönoton opas','Lyhyt esittely sovelluksesta')}${menuRow('#feedback','chat','Anna palautetta','Kerro, mikä toimi ja mikä ei')}${menuRow('data-share-app','share','Suosittele AJOURAa','Jaa linkki kaverille')}</div><h3 class="menu-h">Tietoa</h3><div class="menu-group">${menuRow('tietosuoja.html','inspection','Tietosuoja','Mitä tietoja sovellus käsittelee')}</div><p class="app-fineprint menu-version">AJOURA ${appVersion}</p>`;}
  // Raportit tab: every vehicle's report in one place. Comparing vehicles comes next (pala B).
  // Raportit 0.27 (Niklas 25.10.2026): costs for a chosen period, vehicles and cost types, as key figures and a bar per vehicle.
  // costKind, costsOf and drivenIn are the one shared cost calculation: the vehicle page's Kulut tab must use them too,
  // so the same car never shows two different sums. Nothing here changes stored data.
  const costKinds=[['fuel','Polttoaine'],['service','Huollot'],['repair','Korjaukset'],['inspect','Katsastukset'],['tyres','Renkaat'],['other','Muut']];
  // Same rules as the service-book filter (kind), except that washes, odometer updates and other non-repair entries are "Muut".
  const costKind=t=>/katsastus/i.test(t)?'inspect':/rengas|renkai/i.test(t)?'tyres':/jarru/i.test(t)?'repair':/huolto|öljy|suodat/i.test(t)?'service':/korjau|vaihto|vika|vaurio/i.test(t)?'repair':'other';
  const evCost=e=>e.cost!==''&&e.cost!=null&&Number.isFinite(Number(e.cost))?Number(e.cost):0;
  function costsOf(c,from,to){const s={fuel:0,service:0,repair:0,inspect:0,tyres:0,other:0},inP=d=>d>=from&&d<=to;
    for(const e of c.events)if(inP(e.date))s[costKind(e.type)]+=evCost(e);
    for(const f of c.fuels||[])if(inP(f.date)&&f.cost!==null)s.fuel+=f.cost;return s;}
  // 0.76: distance (or engine hours) in a period from the odometer readings: entries, fill-ups and the vehicle's current
  // reading (as today's). The odometer at the period's start and end is interpolated between the nearest readings on both
  // sides, so one reading years before the period no longer puts years of driving into one period (the old drivenIn took
  // the last reading before the period as the start). The figure is reliable (ok) only when the readings around both ends
  // are at most 92 days apart, or when the vehicle's records start inside the period (then the distance and the costs both
  // start from the first reading). Otherwise the screens say "Ei riittävästi tietoja" instead of showing a guess.
  const addDays=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
  function kmIn(c,from,to){const out={d:0,ok:false,start:'',gap:0};
    const r=[...c.events.filter(e=>Number.isFinite(e.km)&&e.km>=0).map(e=>[e.date,e.km]),...(c.fuels||[]).filter(f=>Number.isFinite(f.km)&&f.km>=0).map(f=>[f.date,f.km])];
    if(Number.isFinite(c.km)&&c.km>0)r.push([today(),c.km]);r.sort((a,b)=>a[0].localeCompare(b[0])||a[1]-b[1]);
    if(r.length<2)return out;const day=x=>dayNum(x),ip=(a,b,x)=>a[1]+(b[1]-a[1])*(day(x)-day(a[0]))/Math.max(1,day(b[0])-day(a[0]));
    const A=r.filter(x=>x[0]<from).pop(),B=r.find(x=>x[0]>=from),C=r.filter(x=>x[0]<=to).pop(),D=r.find(x=>x[0]>to);
    if(!B||!C||B[0]>to)return out;
    let k0,g0;if(A){k0=ip(A,B,from);g0=B[0]===from?0:day(B[0])-day(A[0]);}else{k0=B[1];g0=c.events.some(e=>e.date>=from&&e.date<B[0])?9999:0;out.start=B[0];}
    let k1,g1;if(D){k1=ip(C,D,to);g1=C[0]===to?0:day(D[0])-day(C[0]);}else{k1=C[1];g1=day(to)-day(C[0]);}
    out.d=Math.max(0,Math.round(k1-k0));out.gap=Math.max(g0,g1);out.ok=out.d>0&&k1>=k0&&out.gap<=92;return out;}
  const drivenIn=(c,from,to)=>{const k=kmIn(c,from,to);return k.ok?k.d:0;};
  // 0.76: months in a period counted by the calendar: every whole month is 1 and a partial month its share of days
  // (1.1.–3.11. = 10 + 3/30 = 10,1 kk). The monthly average (€/kk) is the period's costs divided by this.
  function monthsIn(a,b){if(!a||!b||b<a)return 1;let n=0,[y,m]=a.split('-').map(Number);const [ey,em]=b.split('-').map(Number);
    while(y<ey||(y===ey&&m<=em)){const k=y+'-'+String(m).padStart(2,'0'),last=monthEnd(k),dim=Number(last.slice(8)),s0=k===a.slice(0,7)?Number(a.slice(8)):1,e0=k===b.slice(0,7)?Number(b.slice(8)):dim;n+=(e0-s0+1)/dim;if(++m>12){m=1;y++;}}
    return Math.max(n,1/31);}
  // 0.76: a change from the comparison period is shown only when the vehicle's records cover that period: its first
  // entry or fill-up is at most a month after the comparison period starts, and when fuel costs are compared, its first
  // fill-up too. Otherwise a cost would look like a rise only because it was not yet being recorded (e.g. fill-ups logged
  // from October 2026 compared with a year with no fill-ups logged).
  const firstRec=c=>[...c.events.map(e=>e.date),...(c.fuels||[]).map(f=>f.date)].sort()[0]||'',firstFill=c=>(c.fuels||[]).map(f=>f.date).sort()[0]||'';
  const covers=(c,pf,fuel)=>{const lim=addDays(pf,31),a=firstRec(c);return !!a&&a<=lim&&(!fuel||(!!firstFill(c)&&firstFill(c)<=lim));};
  // Raportit 0.30 (Niklas 26.10.2026): new look after Niklas's picture. Summary tab: key figures with the change from the
  // previous period, costs by type and one card per vehicle. Vehicles tab: each vehicle's own report. The 0.27 vehicle and
  // cost-type choices and the table are kept behind "Näytä tarkemmin". Every figure comes from the user's own entries.
  // The choices are a view setting kept on this device only (not part of the backup); everything starts selected.
  const rpKey='ajoura-reports';
  // 0.102 (Niklas): Raportit like Tankkaus. One vehicle or all (car: '' = all; until 0.101 a multi-select offCars, of
  // which exactly one chosen vehicle carries over), the seven periods of Tankkaus (flPeriods, flPer), an own period for
  // each of the four key-figure cards (kp), the order of the widgets (w), the cost types hidden from the charts (offKinds:
  // only the charts, never the totals) and the sort of the vehicles. A view setting on this device, not in the backup.
  const rpGroups=[['fuel','Polttoaine ja lataus'],['service','Huollot'],['repair','Korjaukset'],['other','Muut']];
  // The report's four cost groups from costsOf's six types: inspections and tyres are "Muut" (the vehicle page keeps six).
  const rpG=x=>({fuel:x.fuel,service:x.service,repair:x.repair,other:x.inspect+x.tyres+x.other}),rpGOf=k=>k==='inspect'||k==='tyres'?'other':k;
  const rpKpis=['tot','mon','fuel','svc'],rpWidgets=[...rpKpis,'months','dist','cars','exp'];
  function rpPrefs(){let o={};try{o=JSON.parse(prefGet(rpKey)||'{}')||{};}catch(e){}const list=a=>Array.isArray(a)?a.filter(x=>typeof x==='string').slice(0,500):[];
    const pg=flPer(o,{p:'year',cf:'',ct:'',cu:null}),kp={};if(o.kp&&typeof o.kp==='object')for(const k of rpKpis){const v=flPer(o.kp[k],null);if(v)kp[k]=v;}
    const w=Array.isArray(o.w)?[...new Set(o.w.filter(x=>rpWidgets.includes(x)))]:[];for(const x of rpWidgets)if(!w.includes(x))w.push(x);
    let car=typeof o.car==='string'&&cars.some(c=>c.id===o.car)?o.car:'';
    if(o.car===undefined&&Array.isArray(o.offCars)&&o.offCars.length){const on=cars.filter(c=>!o.offCars.includes(c.id));if(on.length===1)car=on[0].id;}
    return {p:pg.p,cf:pg.cf,ct:pg.ct,cu:pg.cu,kp,w,car,offKinds:list(o.offKinds).filter(k=>rpGroups.some(([x])=>x===k)),s:['cost','costa','name','km'].includes(o.s)?o.s:'cost'};}
  // 0.76: 12 kk is twelve calendar months, the month going on included (3.11.2026: 1.12.2025–3.11.2026). Until 0.75 it was
  // the 365 days back from today, which touched 13 calendar months and drew 13 month bars.
  // 0.80: Edellinen vuosi (prev) and Mukautettu (custom: the dates the user chose, kept with the Raportit choices).
  const rpRange=(p,cu)=>{const t=today(),y=Number(t.slice(0,4));if(p==='year')return {from:t.slice(0,4)+'-01-01',to:t};if(p==='prev')return {from:(y-1)+'-01-01',to:(y-1)+'-12-31'};if(p==='custom'&&cu)return {from:cu.from,to:cu.to};if(p==='month')return {from:t.slice(0,8)+'01',to:t};if(p==='pmonth'){let m=Number(t.slice(5,7))-1,py=y;if(m<1){m=12;py--;}const k=py+'-'+String(m).padStart(2,'0');return {from:k+'-01',to:monthEnd(k)};}if(p==='12'){let y=Number(t.slice(0,4)),m=Number(t.slice(5,7))-11;if(m<1){m+=12;y--;}return {from:y+'-'+String(m).padStart(2,'0')+'-01',to:t};}return {from:'',to:t};};
  const yBack=s=>{const md=s.slice(5);return (Number(s.slice(0,4))-1)+'-'+(md==='02-29'?'02-28':md);};
  // 0.76: both periods are compared with the same dates a year earlier (until 0.75 12 kk was compared with the 12 months
  // before it, which were longer than the period going on).
  const rpPrev=(p,cu)=>{if(p==='all')return null;const {from,to}=rpRange(p,cu);return {from:yBack(from),to:yBack(to)};};
  const pctOf=(now,was)=>was>0&&Number.isFinite(now)?Math.round((now-was)/was*100):null;
  // 0.76: a change is not marked good or bad (no green or red): less driving or lower costs are not a success by
  // themselves. The arrow and the sign show the direction.
  const rpDelta=(v,pill)=>v===null?'':`<span class="rp-delta ${v<0?'down':v>0?'up':'flat'}${pill?' pill':''}"><span aria-hidden="true">${v<0?'↓':v>0?'↑':'→'}</span> <span>${v>0?'+':v<0?'−':''}${number(Math.abs(v))} %</span></span>`;
  const eur=v=>`${number(Math.round(v))} €`,dec2=v=>v.toLocaleString('fi-FI',{minimumFractionDigits:2,maximumFractionDigits:2});
  // 0.55: a user's own photo fills the box (no blurred side bars as in 0.50). Phone photos of a vehicle are usually
  // portrait with the vehicle in the lower middle, so the crop keeps the lower middle (CSS .own-ph). Used on
  // Tankkaus, Raportit and the fill-up sheet.
  const rpThumb=c=>c.photo?`<img class="own-ph" src="${ownPhoto(c.photo)}" alt="">`:art(c,'');
  const rpIcon={fuel:'fuel',service:'wrench',repair:'repair',inspect:'inspection',tyres:'tyre',other:'more'};
  const chev='<svg class="rp-chev" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 4.5 3 3 3-3"/></svg>';
  // A native select under a styled label: the phone shows its own picker, and the 16 px font keeps iPhone from zooming.
  const rpPick=(attr,label,shown,opts,cur)=>`<label class="rp-pick"><span class="rp-pick-t">${shown}</span>${chev}<select ${attr} aria-label="${label}">${opts.map(([v,n])=>`<option value="${v}"${v===cur?' selected':''}>${n}</option>`).join('')}</select></label>`;
  // The Raportit figures in one place: the screen and the PDF report (0.32) use the same numbers.
  function rpCalc(o){
    const {from,to}=rpRange(o.p,o.cu),prev=rpPrev(o.p,o.cu),kinds=rpGroups.map(([k])=>k),sel=o.car?cars.filter(c=>c.id===o.car):cars;
    const kn=k=>rpGroups.find(([x])=>x===k)[1];
    const pick=(s,ks)=>{const r={};let t=0;for(const k of ks){r[k]=s[k];t+=s[k];}return [r,t];};
    const rows=sel.map(c=>{const [s,t]=pick(rpG(costsOf(c,from,to)),kinds),u=ku(c),d=drivenIn(c,from,to),min=u==='h'?1:100;
      let pt=0,pd=0;if(prev){[,pt]=pick(rpG(costsOf(c,prev.from,prev.to)),kinds);pd=drivenIn(c,prev.from,prev.to);}
      const first=firstRec(c),cmp=!!prev&&covers(c,prev.from,kinds.includes('fuel')&&s.fuel>0);
      return {c,s,t,d,u,per:d>=min&&t?t/d:null,pt,pd,cmp,late:o.p!=='all'&&first>from?first:''};});
    const sorts={cost:(a,b)=>b.t-a.t,costa:(a,b)=>a.t-b.t||carName(a.c).localeCompare(carName(b.c),'fi'),name:(a,b)=>carName(a.c).localeCompare(carName(b.c),'fi'),km:(a,b)=>(b.per??-1)-(a.per??-1)||b.t-a.t};rows.sort(sorts[o.s]);
    const sum=rows.reduce((m,r)=>m+r.t,0),perKm=rows.filter(r=>!hourly(r.c)&&r.d>=100),km=perKm.reduce((m,r)=>m+r.d,0),kmCost=perKm.reduce((m,r)=>m+r.t,0);
    // Months for the monthly average: the period, or for the whole history from the first cost on.
    const mFrom=o.p!=='all'?from:rows.flatMap(r=>[...r.c.events.filter(e=>evCost(e)>0).map(e=>e.date),...(r.c.fuels||[]).filter(f=>f.cost).map(f=>f.date)]).sort()[0]||to;
    const months=monthsIn(mFrom,to);
    // Change from the previous period: shown only when that period has costs (or driving) to compare with.
    // €/km is compared only over the vehicles driven at least 100 km in both periods, so a vehicle without old readings
    // does not skew it.
    // 0.76: only when every vehicle with costs has records from the whole comparison period (covers), and €/km only over
    // vehicles with reliable distances in both periods.
    const pSum=rows.reduce((m,r)=>m+r.pt,0),cmpOk=!!prev&&rows.every(r=>!r.t||r.cmp),both=rows.filter(r=>r.cmp&&!hourly(r.c)&&r.d>=100&&r.pd>=100),sumOf=f=>both.reduce((m,r)=>m+f(r),0);
    const dMonth=cmpOk?pctOf(sum/months,pSum/monthsIn(prev.from,prev.to)):null,dKm=cmpOk&&both.length&&sumOf(r=>r.pt)?pctOf(sumOf(r=>r.t)/sumOf(r=>r.d),sumOf(r=>r.pt)/sumOf(r=>r.pd)):null;
    const filtered=!!o.car;
    const kmCars=perKm.length,costCars=rows.filter(r=>r.t>0&&!hourly(r.c)).length,dSum=cmpOk&&pSum>0?pctOf(sum,pSum):null;
    return {from,to,prev,kinds,sel,kn,rows,sum,km,kmCost,months,dMonth,dKm,dSum,filtered,cmpOk,pSum,kmCars,costCars};}
  // 0.102 (Niklas, havainnekuva): Raportit in the look of Tankkaus. Top: the vehicle (Kaikki ajoneuvot or one vehicle),
  // the period (the seven of Tankkaus; Mukautettu's dates under the row) and Lisää merkintä. Then eight widgets in one
  // grid in the user's order: four key-figure cards (each can have its own period), costs by month, the split by cost
  // type, the vehicles and the exports. Every figure comes from rpCalc (costsOf, the four groups of rpG), so the total
  // is always fuel + services + repairs + other. Hiding a cost type affects the month chart only, never a total.
  const rpSetT={tot:'Kokonaiskulujen asetukset',mon:'Kuukausikulujen asetukset',fuel:'Polttoaine- ja latauskulujen asetukset',svc:'Huoltojen ja korjausten asetukset'};
  const rpCal='<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>';
  const rpAllPic=`<span class="fv-vpic fv-vall" aria-hidden="true">${svg('<path d="M3 16.5v-3l2-4.5h9l3 4.5v3z"/><path d="M8 9V7.5h8.5l2.5 4h1.5v4H18"/><circle cx="6.5" cy="16.5" r="1.5"/><circle cx="13.5" cy="16.5" r="1.5"/>')}</span>`;
  function reports(){if(!cars.length)return `${top()}<h2 class="app-heading">Raportit</h2>${emptyGarage()}`;
    const o=rpPrefs(),d=rpCalc(o),{from,to,kinds,sel,kn,rows,sum}=d,one=!!o.car,c1=one?sel[0]:null,pName=flPName(o),msg=notice?`<p class="success-note" role="status">${escape(notice)}</p>`:'';
    const head=`<div class="rp-head fv-head"><div class="rp-titles"><h2 class="app-heading">Raportit</h2></div></div>`;
    // The vehicle list: Kaikki ajoneuvot first, then the garage. One tap chooses and closes the list.
    const item=(id,pic,name,sub,on)=>`<div class="fv-mi rp-vmi${on?' on':''}"><button type="button" class="fv-mname" data-rp-car="${id}"${on?' aria-current="true"':''}>${pic}<span class="fv-mtxt"><span class="fl-mn"${id?' translate="no"':''}>${name}</span>${sub?`<small translate="no">${sub}</small>`:''}</span><span class="rp-vck" aria-hidden="true">${on?flCk:''}</span></button></div>`;
    const items=item('',rpAllPic,'Kaikki ajoneuvot','',!one)+cars.map(c=>item(c.id,flPic(c),escape(carName(c)),c.plate?escape(c.plate):'',one&&c.id===o.car)).join('');
    const shown=one?`${flPic(c1)}<span class="rp-pick-t" translate="no">${escape(c1.plate||carName(c1))}</span>`:`${rpAllPic}<span class="rp-pick-t">Kaikki</span>`;
    const veh=`<details class="rp-pick fl-cmenu fv-veh rp-veh"><summary><span class="sr-only">Ajoneuvot</span>${shown}${chev}</summary><div class="fl-cmenu-list fv-mlist" role="group" aria-label="Ajoneuvot">${items}</div></details>`;
    const pPick=rpPick('data-rp-period','Jakso',pLabel(o.p),flPeriods.map(([k,n])=>[k,k==='custom'?'Mukautettu…':n]),o.p);
    const bar=`<div class="fv-bar">${veh}${pPick}</div>${o.p==='custom'?flDates('data-rp-custom',o.cf,o.ct):''}`;
    // Key figures. A card with its own period gets its own rpCalc (same vehicle, its period).
    const kv=k=>{const x=o.kp[k]||o,same=x.p===o.p&&(x.p!=='custom'||x.cf===o.cf&&x.ct===o.ct);return {x,d:same?d:rpCalc({...o,p:x.p,cu:x.cu})};};
    const gsum=(dd,ks)=>dd.rows.reduce((m,r)=>m+ks.reduce((n,k)=>n+r.s[k],0),0),eB=v=>`<b>${number(Math.round(v))}</b> <span>€</span>`;
    const kc=(k,icon,lab,fn,sub)=>{const {x,d:dd}=kv(k);return kpiCard({k,set:'data-rp-set',setLab:rpSetT[k],icon,lab,val:fn(dd),per:flPName(x),own:!!o.kp[k],sub:sub?sub(dd):''});};
    // The monthly average divides by the months of the period: whole calendar months count 1 and a month going on (or
    // the ends of Mukautettu) its share of days (monthsIn). The divisor is shown under the period.
    const mTxt=v=>{const r=Math.round(v*10)/10;return dec(r,r%1?1:0);};
    const w={tot:kc('tot',flEuro,'Kokonais\u00adkulut',dd=>eB(dd.sum)),
      mon:kc('mon',rpCal,'Keskimäärin / kk',dd=>eB(dd.sum/dd.months),dd=>`<p class="rp-basis"><span>${mTxt(dd.months)}</span> <span>kk:n ajalta</span></p>`),
      fuel:kc('fuel',fuelTabIcon,'Polttoaine ja lataus',dd=>eB(gsum(dd,['fuel']))),
      svc:kc('svc',icons.wrench,'Huollot ja korjaukset',dd=>eB(gsum(dd,['service','repair'])))};
    // Costs by month (by year for a long history), stacked by cost group; a tapped bar shows the month's breakdown.
    const vis=kinds.filter(k=>!o.offKinds.includes(k)),allTot={};for(const k of kinds)allTot[k]=rows.reduce((m,r)=>m+r.s[k],0);
    const mList=rpMonths(o,{from,to,sel,kinds:vis}),yb=!!(mList[0]&&mList[0].year);
    const legend=`<p class="rp-legend">${vis.filter(k=>allTot[k]>0).map(k=>`<span class="nw"><i class="rp-dot rpk-${k}" aria-hidden="true"></i><span>${kn(k)}</span></span>`).join('')}</p>`;
    const chart=!sum?'<p class="rp-empty">Ei kirjattuja kuluja valitulla ajanjaksolla.</p>':!vis.length?'<p class="rp-empty">Kaikki kululajit on piilotettu kaaviosta.</p>':rpMonthCard(mList,vis,kn,legend)||'<p class="rp-empty">Näkyvillä kululajeilla ei ole kuluja valitulla ajanjaksolla.</p>';
    w.months=`<section class="rp-card rp-cats fv-w fv-wide" data-fw="months" aria-labelledby="rp-hc"><div class="rp-hrow"><h3 class="rp-h" id="rp-hc">${yb?'Kulut vuosittain':'Kulut kuukausittain'}</h3><small class="fl-unit">€</small></div>${chart}</section>`;
    // The split always over the whole total: a type hidden from the chart keeps its euros and share here.
    const share=rpShares(kinds.filter(k=>allTot[k]>0).map(k=>[k,allTot[k]]));
    w.dist=`<section class="rp-card rp-dist fv-w fv-wide" data-fw="dist" aria-labelledby="rp-hd"><div class="rp-hrow"><h3 class="rp-h" id="rp-hd">Kulujen jakautuminen</h3></div>
      <ul class="rp-drows">${kinds.map(k=>{const on=!o.offKinds.includes(k),wd=sum?allTot[k]/sum*100:0;return `<li><button type="button" class="rp-drow${on?'':' off'}" data-rp-kind="${k}" aria-pressed="${on}"><span class="rp-dt"><i class="rp-dot rpk-${k}" aria-hidden="true"></i><span class="rp-dn">${kn(k)}</span><b>${eur(allTot[k])}</b><em>${share[k]||'0 %'}</em></span><span class="rp-dbar" aria-hidden="true">${wd?`<i class="rp-c rpk-${k}" style="width:${Math.max(1,wd).toFixed(1)}%"></i>`:''}</span>${on?'':'<small class="rp-doff">Piilotettu kaaviosta</small>'}</button></li>`;}).join('')}</ul>
      <p class="fl-note rp-cnote">Napauta kululajia, niin voit piilottaa sen kaaviosta tai tuoda takaisin. Summat eivät muutu.</p></section>`;
    // The vehicles: all of them side by side, or the chosen one with its reports and a way back to all.
    const card=r=>{const c=r.c,on=kinds.filter(k=>r.s[k]>0),pu=`€/${r.u}`;
      const meta=!r.t?'<span>Ei kirjattuja kuluja valitulla ajanjaksolla.</span>':r.per!==null?`<span class="nw"><span>${r.per<.01?'< 0,01':dec2(r.per)}</span> <span>${pu}</span></span>`:`<span class="nw">${pu}:</span> <span>ei riittävästi tietoja</span>`;
      const inner=`<span class="rp-vpic" aria-hidden="true">${rpThumb(c)}</span><span class="rp-vbody"><span class="rp-vtop"><strong translate="no">${escape(carName(c))}</strong><b>${r.t?eur(r.t):'–'}</b>${one?'':'<span class="chevron" aria-hidden="true">›</span>'}</span>${r.t?`<span class="rp-bar" aria-hidden="true">${on.map(k=>`<i class="rp-c rpk-${k}" style="flex:${r.s[k].toFixed(2)}"></i>`).join('')}</span>`:''}<span class="rp-vmid"><small>${meta}</small></span></span>`;
      return `<li>${one?`<div class="rp-vcard">${inner}</div>`:`<a class="rp-vcard" href="#reports" data-rp-open="${c.id}">${inner}</a>`}</li>`;};
    const sortNames=[['cost','Kulut: suurin ensin'],['costa','Kulut: pienin ensin'],['name','Nimi A–Ö'],['km','€/km']];
    const fpo=flPrefs(),fuelRow=(c0,k)=>{const c=fcar(c0,k),el=unitOf(c)==='kWh',gs=k==='gas',dd=(c.fuels||[]).length?flCalc(c,fpo.p,fpo.cu):null;return `<a class="rp-rep" href="#fuel/${c0.id}/raportit" data-fl-kindlink="${k}"><span class="rp-ri fuel" aria-hidden="true">${svg(el?bolt:icons.fuel)}</span><span class="rp-rtxt"><strong>${el?'Latauskirja':gs?'Kaasukirja':'Tankkauskirja'}</strong><small>${!dd?(el?'<span>Ei vielä latauksia</span>':'<span>Ei vielä tankkauksia</span>'):[dd.now.avg!==null?`<span class="nw">${dec(dd.now.avg)} ${unitOf(c)}/${per(c)}</span>`:'',`<span class="nw">${eur(dd.now.cost)}</span>`,`<span class="nw">${flPName(fpo)}</span>`,'<span>PDF</span>'].filter(Boolean).join(' · ')}</small></span><span class="chevron" aria-hidden="true">›</span></a>`;};
    const reps=c=>`<div class="rp-vlinks"><a class="rp-rep" href="#report/${c.id}/raportit"><span class="rp-ri" aria-hidden="true">${svg(icons.doc)}</span><span class="rp-rtxt"><strong>Huoltohistoriaraportti</strong><small><span>Huollot, kulut ja tunnusluvut</span> · <span>PDF</span></small></span><span class="chevron" aria-hidden="true">›</span></a>${(ks=>(ks.length?ks:[pickKind(c)]))(chargeKinds(c).filter(k=>(c.fuels||[]).some(f=>fillKind(c,f)===k))).map(k=>fuelRow(c,k)).join('')}</div>`;
    w.cars=`<section class="rp-vsec fv-w fv-wide" data-fw="cars" aria-labelledby="rp-hv"><div class="rp-hrow"><h3 class="rp-h2" id="rp-hv">Ajoneuvokohtaiset kulut</h3>${rows.length>1?rpPick('data-rp-sort','Järjestä',`<span>Järjestä:</span> <span>${sortNames.find(x=>x[0]===o.s)[1]}</span>`,sortNames,o.s):''}</div><ul class="rp-vlist">${rows.map(card).join('')}</ul>${one?`${reps(c1)}${cars.length>1?`<button type="button" class="rp-card rp-pdf rp-toall" data-rp-car=""><span class="rp-pdf-ico fl-ico" aria-hidden="true">${svg('<path d="M4 8h14l-3-3"/><path d="M20 16H6l3 3"/>')}</span><span class="rp-rtxt"><strong>Vertaa kaikkia ajoneuvoja</strong><small><span>Kaikki ajoneuvot</span> <span>(${cars.length})</span></small></span><span class="chevron" aria-hidden="true">›</span></button>`:''}`:''}</section>`;
    // Exports (0.32, 0.43): the page's vehicle and period, all cost types; the cards' own periods do not apply here.
    const nRows=rpCsvRows(o,{from,to,sel,kinds}).length,who=one?`<span translate="no">${escape(carName(c1))}</span>`:`<span>Kaikki ajoneuvot</span> <span>(${sel.length})</span>`,pTxt=o.p==='all'?'Koko historia':rng(from,to);
    w.exp=`<section class="rp-card rp-export fv-w fv-wide" data-fw="exp" aria-labelledby="rp-he"><h3 class="rp-h" id="rp-he">Raporttien vienti</h3><p class="rp-sub">${who} · <span class="nw">${pTxt}</span></p>
      <div class="rp-xrow"><button type="button" class="rp-xbtn" data-rp-pdf${sum?'':' disabled'}><span class="rp-pdf-ico" aria-hidden="true">${svg(icons.doc)}</span><span class="rp-rtxt"><strong>PDF</strong><small>Kulujen yhteenveto</small></span></button><button type="button" class="rp-xbtn" data-rp-csv${nRows?'':' disabled'}><span class="rp-pdf-ico csv" aria-hidden="true">${svg('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9.5h16M4 15h16M10 4v16"/>')}</span><span class="rp-rtxt"><strong>CSV</strong><small><span>${number(nRows)}</span> <span>${nRows===1?'rivi':'riviä'}</span></small></span></button></div>
      <p class="fl-fine rp-csvnote">${sum?'<span>PDF: tunnusluvut ja kulut lajeittain ja ajoneuvoittain.</span> ':''}${nRows?'<span>CSV: jokainen merkintä ja tankkaus omalla rivillään; aukeaa Excelissä, Numbersissa ja Google Sheetsissä.</span>':'<span>Valitulla ajanjaksolla ei ole vietäviä kirjauksia.</span>'}</p></section>`;
    return `${top()}${head}${bar}${msg}<div class="fv-grid rp-wgrid" data-w-grid="reports">${o.w.map(k=>w[k]).join('')}</div>`;}
  const rng=(a,b)=>a.slice(0,4)===b.slice(0,4)?`${dm(a)}–${date(b)}`:`${date(a)}–${date(b)}`;
  const pLabel=p=>({year:'Tämä vuosi',prev:'Edellinen vuosi','12':'12 kk',month:'Kuluva kuukausi',pmonth:'Edellinen kuukausi',custom:'Mukautettu'})[p]||'Koko historia';
  // 0.99: a Mukautettu period is named by its dates (1.3.2026–15.4.2026), the others by their name.
  const flPName=x=>x.p==='custom'&&x.cu?`${date(x.cu.from)}–${date(x.cu.to)}`:pLabel(x.p);
  // Largest-remainder rounding of shares to whole per cents (they add up to 100); a share under 0.5 % reads "< 1 %".
  function rpShares(list){const tot=list.reduce((m,[,v])=>m+v,0),out={};if(!tot)return out;const raw=list.map(([k,v])=>[k,v/tot*100]),fl=raw.map(([k,x])=>[k,Math.floor(x),x-Math.floor(x)]);
    let left=100-fl.reduce((m,x)=>m+x[1],0);for(const x of [...fl].sort((a,b)=>b[2]-a[2])){if(left<=0)break;x[1]++;left--;}
    for(const [k,p] of fl){const x=raw.find(r=>r[0]===k)[1];out[k]=x>0&&x<.5?'< 1 %':`${number(p)} %`;}return out;}
  // Raportit 0.43: costs by month in "Näytä tarkemmin" (stacked bars in the cost-type colours, the total written on each
  // bar, a tapped month's amounts by type as text) and the period's entries as a CSV file for Excel. Both use the page's
  // period and choices, and the same rules as costsOf, so every sum matches the summary above.
  let rpMonth=null;
  // The cost-type colours for the PDF; the screen uses the same values as CSS classes (.rpk-*, app.css).
  const rpKc={fuel:'#2a78d6',service:'#1baf7a',repair:'#6250d6',inspect:'#eda100',tyres:'#e87ba4',other:'#808b9a'};
  function rpMonths(o,d){const {from,to,sel,kinds}=d,first=sel.flatMap(c=>[...c.events.map(e=>e.date),...(c.fuels||[]).map(f=>f.date)]).sort()[0]||to,start=o.p==='all'?first:from;
    const keys=[];{let [y,m]=start.split('-').map(Number);const [ey,em]=to.split('-').map(Number);while(y<ey||(y===ey&&m<=em)){keys.push(y+'-'+String(m).padStart(2,'0'));if(++m>12){m=1;y++;}}}
    const byYear=keys.length>24,list=byYear?[...new Set(keys.map(k=>k.slice(0,4)))]:keys;
    return list.map(k=>{const a0=byYear?k+'-01-01':k+'-01',b0=byYear?k+'-12-31':monthEnd(k),a=a0<start?start:a0,b=b0>to?to:b0,s={};let t=0;
      for(const kd of kinds)s[kd]=0;for(const c of sel){const x=rpG(costsOf(c,a,b));for(const kd of kinds){s[kd]+=x[kd];t+=x[kd];}}
      return {k,year:byYear,s,t,a,b,partial:a!==a0||b!==b0};});}
  // 0.78: the month chart as HTML bars instead of SVG, so the cost-type colours are the same classes (.rpk-*) as in the
  // split and the vehicle rows, also in the dark theme (the page's invert filter is undone for them), and every month is
  // a real button (tap, keyboard, screen reader). Bars are stacked by cost type with a 2 px gap; the y axis has round
  // steps; a month that is only partly in the period is lighter and named "keskeneräinen" in its breakdown.
  function rpMonthCard(list,kinds,kn,legend=''){if(!list.length||!list.some(x=>x.t>0))return '';
    let sel=rpMonth!==null&&rpMonth<list.length?rpMonth:-1;if(sel<0)for(let i=list.length-1;i>=0;i--)if(list[i].t>0){sel=i;break;}
    const mx=Math.max(1,...list.map(x=>x.t)),st=niceStep(mx/3),top=Math.ceil(mx/st)*st,grid=[];for(let v=0;v<=top+st/1e3;v+=st)grid.push(v);
    const name=x=>x.year?`<span>${x.k}</span>`:`<span>${ucFirst(mName(x.k))}</span> <span>${x.k.slice(0,4)}</span>`,every=list.length>13?2:1;
    const cols=list.map((x,i)=>`<button type="button" class="rp-col${x.partial?' part':''}" data-rp-m="${i}" data-rp-t="${Math.round(x.t)}" aria-pressed="${i===sel}"><span class="rp-plot"><span class="rp-stk" style="height:${(x.t/top*100).toFixed(2)}%">${kinds.filter(k=>x.s[k]>0).map(k=>`<i class="rp-c rpk-${k}" style="flex-grow:${x.s[k].toFixed(2)}"></i>`).join('')}</span></span><span class="rp-ml" aria-hidden="true">${i%every&&i!==sel?'':x.year?x.k.slice(2):Number(x.k.slice(5))}</span><span class="sr-only">${name(x)}: ${eur(x.t)}</span></button>`).join('');
    const x=list[sel],items=kinds.filter(k=>x.s[k]>0);
    return `<div class="rp-chart"><div class="rp-grid" aria-hidden="true">${grid.map(v=>`<span style="bottom:${(v/top*100).toFixed(2)}%"><i>${number(Math.round(v))}</i></span>`).join('')}</div><div class="rp-cols" role="group" aria-label="${list[0].year?'Vuodet':'Kuukaudet'}">${cols}</div></div>${legend}
      <div class="rp-msel" aria-live="polite"><p class="rp-mh"><b>${name(x)}</b>${x.partial?` <span class="rp-part">– <span>${x.year?'keskeneräinen vuosi':'keskeneräinen kuukausi'}</span></span>`:''}</p><p class="rp-mtot"><span>Kulut yhteensä</span> <b class="rp-mt">${eur(x.t)}</b></p>${items.length?`<ul class="rp-mlist">${items.map(k=>`<li><i class="rp-dot rpk-${k}" aria-hidden="true"></i><span>${kn(k)}</span><b>${eur(x.s[k])}</b></li>`).join('')}</ul>`:`<p class="rp-mnone">${x.year?'Ei kirjattuja kuluja tänä vuonna.':'Ei kirjattuja kuluja tänä kuukautena.'}</p>`}
      <p class="fl-note">${list[0].year?'Napauta pylvästä, niin näet vuoden erittelyn.':'Napauta pylvästä, niin näet kuukauden erittelyn.'}${list.some(m=>m.partial)?` <span>${list[0].year?'Vaalea pylväs on keskeneräinen vuosi.':'Vaalea pylväs on keskeneräinen kuukausi.'}</span>`:''}</p></div>`;}
  // CSV for Excel: one row per entry or fill-up of the period, for the chosen vehicles and cost types. Finnish and Swedish
  // Excel read semicolons and decimal commas; the English file uses commas and decimal points. The BOM tells Excel the
  // file is UTF-8 (ä, ö). A cell that would start a formula (=, +, -, @) gets a leading apostrophe, so a note typed in
  // the app can never run as a formula in Excel.
  function rpCsvRows(o,d){const {from,to,sel,kinds}=d,inP=x=>(o.p==='all'||x>=from)&&x<=to,rows=[];
    for(const c of sel){const u=ku(c),fu=unitOf(c);
      for(const e of c.events)if(inP(e.date)&&kinds.includes(rpGOf(costKind(e.type))))rows.push({date:e.date,c,kind:rpGOf(costKind(e.type)),what:dispType(c,e.type),km:e.km,u,cost:e.cost!==''&&e.cost!=null&&Number.isFinite(Number(e.cost))?Number(e.cost):null,qty:null,qu:'',ppu:null,note:e.note||''});
      if(kinds.includes('fuel'))for(const f of c.fuels||[])if(inP(f.date))rows.push({date:f.date,c,kind:'fuel',what:fillKind(c,f)==='el'?'Lataus':'Tankkaus',km:f.km,u,cost:f.cost,qty:f.qty,qu:{el:'kWh',gas:'kg',fuel:'l'}[fillKind(c,f)],ppu:f.cost!==null&&f.qty>0?f.cost/f.qty:null,note:[f.full?'':'osatankkaus',f.grade||'',f.country&&f.country!=='FI'?(countries.find(k=>k[0]===f.country)||['','',''])[1]:'',f.est?'hinta-arvio':'',f.skip?'ei kulutukseen':''].filter(Boolean).map(tl).join(', ')});}
    return rows.sort((a,b)=>a.date.localeCompare(b.date)||carName(a.c).localeCompare(carName(b.c),'fi'));}
  function rpCsv(){const o=rpPrefs(),d=rpCalc(o),rows=rpCsvRows(o,d);if(!rows.length)return;
    const en=lang()==='en',sep=en?',':';',num=(v,k)=>v===null||v===undefined||v===''?'':(en?(Math.round(v*10**k)/10**k).toFixed(k):(Math.round(v*10**k)/10**k).toFixed(k).replace('.',','));
    const cell=v=>{let s=String(v==null?'':v);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return s.includes(sep)||/["\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
    const head=['Päivämäärä','Ajoneuvo','Rekisteritunnus','Kululaji','Tapahtuma','Mittarilukema','Yksikkö','Summa (€)','Määrä','Määrän yksikkö','Yksikköhinta (€)','Lisätieto'].map(tl);
    const lines=[head.map(cell).join(sep),...rows.map(r=>[r.date,carName(r.c),r.c.plate||'',tl(d.kn(r.kind)),tl(r.what),r.km==null?'':r.km,r.u,num(r.cost,2),num(r.qty,2),r.qu,num(r.ppu,3),r.note].map(cell).join(sep))];
    const file=new File(['﻿'+lines.join('\r\n')+'\r\n'],'ajoura-kulut-'+today()+'.csv',{type:'text/csv'});saveFile(file,matchMedia('(pointer: coarse)').matches);}
  function rpSave(o,focus){prefSet(rpKey,flKeep(o));const y=screen.scrollTop;render();screen.scrollTop=y;
    // Keep the keyboard focus on the same control after the screen is redrawn.
    refocus(focus);}
  const rpSaveOrder=w=>{const o=rpPrefs();o.w=w;rpSave(o);};
  function reportsChange(t){const o=rpPrefs();
    if(t.matches('[data-rp-period]')&&flPeriods.some(([k])=>k===t.value)){o.p=t.value;rpMonth=null;
      // Mukautettu starts from the 12 kk dates, so the dates are never empty (as on Tankkaus).
      if(o.p==='custom'&&!o.cu){const r=rpRange('12');o.cf=r.from;o.ct=r.to;}rpSave(o,'[data-rp-period]');return;}
    if(t.closest('[data-rp-custom]')&&(t.name==='cf'||t.name==='ct')){const f=t.closest('[data-rp-custom]'),a=f.querySelector('[name=cf]').value,b=f.querySelector('[name=ct]').value,e=flDateErr(a,b);f.querySelector('[role=alert]').textContent=e;if(e)return;
      o.p='custom';o.cf=a;o.ct=b;rpMonth=null;rpSave(o,`[data-rp-custom] [name=${t.name}]`);return;}
    if(t.matches('[data-rp-sort]')&&['cost','costa','name','km'].includes(t.value)){o.s=t.value;rpSave(o,'[data-rp-sort]');}}
  // The settings of one key-figure card: the same sheet as on Tankkaus (kpiSheet).
  function rpSheet(k,from){const o=rpPrefs(),sel=`[data-rp-set="${k}"]`;
    kpiSheet({title:rpSetT[k],x:o.kp[k]||null,pg:o,back:from,sel,
      save:nx=>{const o2=rpPrefs();if(nx)o2.kp[k]=nx;else delete o2.kp[k];rpSave(o2,sel);},
      resetOrder:()=>{const o2=rpPrefs();o2.w=[...rpWidgets];notice='✓ Widgettien järjestys palautettu.';rpSave(o2,sel);}});}
  // 0.107: Lisää huolto or Lisää muistiinpano from the Raportit ＋ menu. With one vehicle chosen (or only one in the
  // garage) the form opens straight away; with Kaikki ajoneuvot the vehicle is picked first in this small sheet.
  const fabGo=(act,c)=>go((act==='memo'?'notes/':'add/')+c.id);
  function rpCarSheet(act,from){closeSheet();sheetBack=from||null;sheetSel='[data-fab-menu]';const l=document.createElement('div');l.className='sheet-layer';
    l.innerHTML=`<div class="sheet-backdrop" data-sheet-close></div><div class="sheet fk-sheet rp-addsheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><span class="sheet-grip" aria-hidden="true"></span><div class="sheet-head"><h2 id="sheet-title">${act==='memo'?'Lisää muistiinpano':'Lisää huolto'}</h2><button class="sheet-x" type="button" data-sheet-close aria-label="Sulje">×</button></div>
      <p class="rp-addq">Valitse ajoneuvo</p><div class="rp-addopts">${cars.map(c=>`<button type="button" class="rp-addopt" data-rp-pickcar="${c.id}"><span class="rp-pdf-ico rp-addthumb" aria-hidden="true">${rpThumb(c)}</span><span class="rp-rtxt"><strong translate="no">${escape(carName(c))}</strong>${c.plate?`<small translate="no">${escape(c.plate)}</small>`:''}</span><span class="chevron" aria-hidden="true">›</span></button>`).join('')}</div></div>`;
    glass.appendChild(l);screen.inert=true;
    l.addEventListener('click',e=>{const b=e.target.closest('[data-rp-pickcar]');if(b){const c=cars.find(x=>x.id===b.dataset.rpPickcar);sheetBack=null;closeSheet();if(c)fabGo(act,c);return;}if(e.target.closest('[data-sheet-close]'))closeSheet();});
    l.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const fl=focusables(l.querySelector('.sheet'));if(!fl.length)return;const first=fl[0],lastEl=fl[fl.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();lastEl.focus();}else if(!e.shiftKey&&document.activeElement===lastEl){e.preventDefault();first.focus();}});
    requestAnimationFrame(()=>{l.classList.add('open');const q=l.querySelector('[data-rp-pickcar]');if(q)q.focus({preventScroll:true});});}
  // The ＋ menu: the first tap opens it, a second tap, a tap outside, Escape, a choice or leaving the tab closes it.
  function fabMenu(open,focus){const b=screen.querySelector('[data-fab-menu]'),m=screen.querySelector('#fab-menu');if(!b||!m)return;
    m.hidden=!open;b.setAttribute('aria-expanded',String(open));b.classList.toggle('open',open);
    if(open&&focus!==false)m.querySelector('[role=menuitem]').focus({preventScroll:true});else if(!open&&focus)b.focus({preventScroll:true});}
  function fabAct(act,from){fabMenu(false);const o=rpPrefs(),one=cars.find(c=>c.id===o.car)||(cars.length===1?cars[0]:null);if(one)fabGo(act,one);else if(cars.length)rpCarSheet(act,from);}
  function reportsClick(t){const o=rpPrefs(),flip=(l,v)=>l.includes(v)?l.filter(x=>x!==v):[...l,v];
    if(t.closest('[data-rp-pdf]:not([disabled])')){fleetPdf();return true;}
    if(t.closest('[data-rp-csv]:not([disabled])')){rpCsv();return true;}
    const rm=t.closest('[data-rp-m]');if(rm){rpMonth=Number(rm.dataset.rpM);const y=screen.scrollTop;render();screen.scrollTop=y;return true;}
    const st=t.closest('[data-rp-set]');if(st){rpSheet(st.dataset.rpSet,st);return true;}
    // A vehicle from the list (or "Vertaa kaikkia"), or a tap on a vehicle's row: the whole page shows that vehicle.
    const car=t.closest('[data-rp-car]');if(car){const id=car.dataset.rpCar;if(id&&!cars.some(c=>c.id===id))return true;rpMonth=null;o.car=id;rpSave(o,'.rp-veh>summary');return true;}
    const op=t.closest('[data-rp-open]');if(op){const id=op.dataset.rpOpen;if(!cars.some(c=>c.id===id))return true;rpMonth=null;o.car=id;prefSet(rpKey,flKeep(o));render();screen.scrollTop=0;refocus('.rp-veh>summary');return true;}
    const kd=t.closest('[data-rp-kind]');if(kd){rpMonth=null;o.offKinds=flip(o.offKinds,kd.dataset.rpKind);rpSave(o,`[data-rp-kind="${kd.dataset.rpKind}"]`);return true;}
    return false;}
  // PDF report of the Raportit summary (0.32, Niklas 26.10.2026). The installed iPhone app ignores window.print(), so the
  // report is built as a PDF file on the device (pdf-writer.js) and handed out: phones get the share sheet (print, save to
  // Files, send), computers download it. Same figures and choices as the screen (rpCalc); labels go through tl(), so the
  // PDF follows the app's language. Built in one go without waiting, so the phone still lets the share sheet open.
  function fleetPdf(){const P=window.AjouraPDF,o=rpPrefs(),d=rpCalc(o);if(!P||!d.sum||!d.sel.length||!d.kinds.length)return;let file;
    try{file=new File([fleetDoc(P,o,d).blob()],'ajoura-kulut-'+today()+'.pdf',{type:'application/pdf'});}
    catch(e){notice='PDF-tiedoston teko ei onnistunut. Yritä uudelleen.';rpSave(o);return;}
    saveFile(file,matchMedia('(pointer: coarse)').matches);}
  function fleetDoc(P,o,d){const {from,to,prev,kinds,sel,kn,rows,sum,km,kmCost,months,dMonth,dKm}=d,T=tl;
    const doc=P.create({title:'AJOURA – '+T('Kulujen yhteenveto')}),L=12,R=198,CW=R-L,BOT=277;
    const grey='#4f5f72',hair='#d6dee8',blue='#1769f4',kc=rpKc;
    const rid='AJ-TALLI-'+today().replace(/-/g,''),tot={};for(const k of kinds)tot[k]=rows.reduce((m,r)=>m+r.s[k],0);const used=kinds.filter(k=>tot[k]>0);
    // Change with its sign written out, in grey: a change is not marked good or bad (0.76, the same as the screen).
    const signed=v=>v===null?null:{t:(v>0?'+':v<0?'−':'')+number(Math.abs(v))+' %',c:grey};
    let y=0;
    const head=()=>{doc.page();doc.logo(L,12,46);doc.text(R,17,T('Kulujen yhteenveto'),{size:12,bold:true,align:'right'});
      doc.text(R,21.5,T('Raportti '+rid),{size:8,color:grey,align:'right'});doc.text(R,25.5,T('Tulostettu '+date(today())),{size:8,color:grey,align:'right'});
      doc.rect(L,29.5,CW,.6,{fill:blue});y=37;};
    // A new page when the next block would not fit; again draws the table's header row when one is given.
    const room=(h,hdr)=>{if(y+h<=BOT)return;head();if(hdr)hdr();};
    const thead=(cols,h=6.5)=>{doc.rect(L,y,CW,h,{fill:'#eef2f7'});for(const [t,x,al,w] of cols){const ls=w?doc.wrap(t,w,7.5,true):[t];ls.forEach((l,i)=>doc.text(x,y+h-2.1-(ls.length-1-i)*3.1,l,{size:7.5,bold:true,color:grey,align:al}));}y+=h;};
    const h2=s=>{room(26);y+=5.5;doc.text(L,y,T(s),{size:12,bold:true});y+=3;};
    const rule=()=>doc.line(L,y,R,y,{color:hair,lw:.2});
    head();
    doc.text(L,y+4,o.car&&sel.length===1?carName(sel[0]):T(sel.length<cars.length?'Valitut ajoneuvot':'Kaikki ajoneuvot'),{size:18,bold:true});y+=10.5;
    doc.text(L,y,(o.p==='all'?T('Koko historia'):`${T('Jakso')} ${date(from)}–${date(to)}`)+(prev?`   ·   ${T('Vertailujakso')} ${date(prev.from)}–${date(prev.to)}`:''),{size:9.5,color:grey});y+=4.5;
    if(d.filtered){const parts=[];if(sel.length<cars.length)parts.push(`${T('Ajoneuvot')}: ${sel.map(carName).join(', ')}`);if(kinds.length<rpGroups.length)parts.push(`${T('Kululajit')}: ${kinds.map(k=>T(kn(k))).join(', ')}`);
      for(const l of doc.wrap(`${T('Rajaus')} – ${parts.join('; ')}`,CW,8.5)){doc.text(L,y+0.5,l,{size:8.5,color:grey});y+=4;}}
    // Key figures as four tiles.
    y+=3;const tw=(CW-9)/4,th=19.5,tiles=[
      [T('Kokonaiskulut'),eur(sum),d.dSum!==null?signed(d.dSum):{t:`${sel.length} ${T(sel.length===1?'ajoneuvo':'ajoneuvoa')}`,c:grey}],
      [`${T('Keskimäärin')} ${T('/ kk')}`,eur(sum/months),{t:`${dec(months)} ${T('kk:n ajalta')}`,c:grey}],
      [T('Ajetut kilometrit'),km?`${number(km)} km`:'–',km?(d.kmCars<d.costCars?{t:`${d.kmCars}/${d.costCars} ${T('ajoneuvoa')}`,c:grey}:null):{t:T('Ei riittävästi tietoja'),c:grey}],
      [T('Kulut / km'),km?`${dec2(kmCost/km)} €/km`:'–',signed(dKm)]];
    tiles.forEach(([lab,val,sub],i)=>{const x=L+i*(tw+3);doc.rect(x,y,tw,th,{fill:'#f1f6fd',stroke:'#d9e6f4',r:2.5});
      doc.text(x+3.5,y+5.5,doc.fit(lab,tw-7,7.5,true),{size:7.5,bold:true,color:grey});
      doc.text(x+3.5,y+12,doc.fit(val,tw-7,14,true),{size:14,bold:true,color:blue});
      if(sub)doc.text(x+3.5,y+16.6,doc.fit(sub.t,tw-7,8,sub.c!==grey),{size:8,bold:sub.c!==grey,color:sub.c});});
    y+=th+1.5;
    // Costs by type: one bar and a table.
    h2('Kulujen jakautuminen');y+=1.5;let bx=L;for(const k of used){const w=CW*tot[k]/sum;doc.rect(bx,y,w,4.5,{fill:kc[k]});bx+=w;}y+=7.5;
    const shr=rpShares(used.map(k=>[k,tot[k]]));
    thead([[T('Kululaji'),L+2],['€',R-32,'right'],[T('Osuus'),R-2,'right']]);
    for(const k of used){doc.rect(L+2,y+1.7,3,3,{fill:kc[k],r:.6});doc.text(L+7.5,y+4.3,T(kn(k)),{size:9.5});doc.text(R-32,y+4.3,eur(tot[k]),{size:9.5,align:'right'});doc.text(R-2,y+4.3,shr[k],{size:9.5,color:grey,align:'right'});y+=6;rule();}
    doc.text(L+2,y+4.8,T('Yhteensä'),{size:9.5,bold:true});doc.text(R-32,y+4.8,eur(sum),{size:9.5,bold:true,align:'right'});doc.text(R-2,y+4.8,'100 %',{size:9.5,bold:true,color:grey,align:'right'});y+=7;
    // One row per vehicle, in the order chosen on the screen.
    const vcols=()=>thead([[T('Ajoneuvo'),L+2],[T('Ajettu'),L+112,'right'],['€/km',L+140,'right'],[T('Kulut'),L+168,'right'],[T('Muutos'),R-2,'right']]);
    h2('Ajoneuvokohtaiset kulut');y+=1.5;vcols();
    for(const r of rows){room(9.5,vcols);const sg=signed(r.cmp?pctOf(r.t,r.pt):null);
      doc.text(L+2,y+4.4,doc.fit(carName(r.c),80,9.5,true),{size:9.5,bold:true});
      doc.text(L+2,y+8.2,doc.fit([r.c.plate||T(typeOf(r.c)),r.late?`${T('tiedot alkaen')} ${date(r.late)}`:''].filter(Boolean).join(' · '),80,7.5),{size:7.5,color:grey});
      doc.text(L+112,y+4.4,r.d>0?`${number(r.d)} ${r.u}`:'–',{size:9.5,align:'right'});
      doc.text(L+140,y+4.4,r.per!==null?`${dec2(r.per)} €/${r.u}`:'–',{size:9.5,align:'right'});
      // 0.82: no recorded costs is '–' as on the screen (0.78), not 0 €: a missing entry is not a cost of zero.
      doc.text(L+168,y+4.4,r.t?eur(r.t):'–',{size:9.5,bold:true,align:'right'});
      doc.text(R-2,y+4.4,sg?sg.t:'–',{size:9.5,bold:!!sg,color:sg?sg.c:grey,align:'right'});y+=9.5;rule();}
    // Vehicles by cost type, when there is more than one of each to compare.
    if(rows.length>1&&used.length>1){const nw=54,cw=(CW-nw)/(used.length+1),col=i=>L+nw+cw*(i+1)-1.5,hh=Math.max(...used.map(k=>doc.wrap(T(kn(k)),cw-2,7.5,true).length))>1?9.6:6.5;
      const mcols=()=>thead([[T('Ajoneuvo'),L+2],...used.map((k,i)=>[T(kn(k)),col(i),'right',cw-2]),[T('Yhteensä'),col(used.length),'right',cw-2]],hh);
      h2('Kulut ajoneuvoittain ja lajeittain');y+=1.5;mcols();
      for(const r of rows){room(6,mcols);doc.text(L+2,y+4.1,doc.fit(carName(r.c),nw-4,8.5,true),{size:8.5,bold:true});
        used.forEach((k,i)=>doc.text(col(i),y+4.1,r.s[k]?number(Math.round(r.s[k])):'–',{size:8.5,align:'right',color:r.s[k]?undefined:grey}));
        doc.text(col(used.length),y+4.1,r.t?number(Math.round(r.t)):'–',{size:8.5,bold:true,align:'right'});y+=6;rule();}
      room(7,mcols);doc.text(L+2,y+4.6,T('Yhteensä'),{size:8.5,bold:true});used.forEach((k,i)=>doc.text(col(i),y+4.6,number(Math.round(tot[k])),{size:8.5,bold:true,align:'right'}));
      doc.text(col(used.length),y+4.6,number(Math.round(sum)),{size:8.5,bold:true,align:'right'});y+=7;
      doc.text(R-2,y+1.5,T('Summat euroina.'),{size:7,color:grey,align:'right'});y+=2;}
    // How the figures are counted.
    const notes=[T('Luvut perustuvat omiin merkintöihisi ja tankkauksiisi. Kulut / km lasketaan ajoneuvoista, joiden mittarilukemat kattavat jakson (lukemat enintään 3 kk:n välein jakson alussa ja lopussa) ja joilla on ajettu vähintään 100 km.')];
    if(rows.some(r=>hourly(r.c)))notes.push(T('Tuntimittarilliset ajoneuvot, kuten vene, eivät ole mukana kilometreissä.'));
    if(prev)notes.push(T('Muutos verrataan samaan jaksoon vuotta aiemmin. Muutos näytetään vain, kun kirjauksia on koko vertailujaksolta.'));
    // The notes stay together on one page.
    const nl=notes.flatMap(n=>doc.wrap(n,CW,8));room(nl.length*3.8+5);y+=5;for(const l of nl){doc.text(L,y,l,{size:8,color:grey});y+=3.8;}
    doc.each((i,n)=>{const fy=285;doc.line(L,fy-4.5,R,fy-4.5,{color:'#cbd9e8',lw:.25});
      doc.text(L,fy,company.name,{size:7.5,bold:true});doc.text(L,fy+3.3,company.id?`${T('Y-tunnus')} ${company.id}`:T('Kehitysvaiheen sovellus'),{size:7,color:grey});
      doc.text(105,fy,company.web,{size:7.5,color:grey,align:'center'});
      doc.text(R,fy,`${T('Sivu')} ${i} / ${n}`,{size:7.5,color:grey,align:'right'});doc.text(R,fy+3.3,rid,{size:7,color:grey,align:'right'});});
    return doc;}
  // PDF of one vehicle's service history report (0.33, Niklas 27.10.2026). Replaces window.print() on the report page,
  // which the installed iPhone app ignores. Same content and figures as the screen report (repCalc, anCalc, kmData,
  // fuelStats); the charts are drawn into the PDF. App texts go through tl(); the user's own texts (names, notes, parts)
  // are printed as written. Built in one go without waiting, so the phone still lets the share sheet open.
  function vehiclePdf(id){const P=window.AjouraPDF,c=cars.find(c=>c.id===id);if(!P||!c)return;let file;
    try{const r=repCalc(c),tag=(c.plate||'').normalize('NFD').replace(/[^A-Za-z0-9]/g,'')||'ajoneuvo';
      file=new File([vehicleDoc(P,c,r).blob()],'ajoura-'+tag+'-'+today()+'.pdf',{type:'application/pdf'});}
    catch(e){notice='PDF-tiedoston teko ei onnistunut. Yritä uudelleen.';render();return;}
    saveFile(file,matchMedia('(pointer: coarse)').matches);}
  function vehicleDoc(P,c,r){const {ev,total,receipts,perYear,byType,printed,reportId}=r,T=tl,hr=hourly(c),u=ku(c),fp=fuelParts(c),fm=fp.find(p=>p.s.series.length>=2)||fp[0],fu=fm?fm.u:unitOf(c),fs=fm?fm.s:fuelStats(c),an=ev.length?anCalc(c,ev,total):null,kd=kmData(c);
    const doc=P.create({title:'AJOURA – '+T('Huoltohistoriaraportti')+' – '+carName(c)}),L=12,R=198,CW=R-L,BOT=277;
    const grey='#4f5f72',hair='#d6dee8',blue='#1769f4';
    let y=0;
    const head=()=>{doc.page();doc.logo(L,12,46);doc.text(R,17,T('Huoltohistoriaraportti'),{size:12,bold:true,align:'right'});
      doc.text(R,21.5,T('Raportti '+reportId),{size:8,color:grey,align:'right'});doc.text(R,25.5,T('Tulostettu '+printed),{size:8,color:grey,align:'right'});
      doc.rect(L,29.5,CW,.6,{fill:blue});y=37;};
    // A new page when the next block would not fit; again draws the table's header row when one is given.
    const room=(h,hdr)=>{if(y+h<=BOT)return;head();if(hdr)hdr();};
    const thead=cols=>{doc.rect(L,y,CW,6.5,{fill:'#eef2f7'});for(const [t,x,al] of cols)doc.text(x,y+4.4,t,{size:7.5,bold:true,color:grey,align:al});y+=6.5;};
    const h2=(s,need=26)=>{room(need);y+=5.5;doc.text(L,y,T(s),{size:12,bold:true});y+=3;};
    const rule=()=>doc.line(L,y,R,y,{color:hair,lw:.2});
    // Label–value rows like the screen's fact list.
    const facts=list=>{for(const [k,v] of list){room(6.5);doc.text(L+1,y+4.4,k,{size:9,color:grey});doc.text(R-1,y+4.4,doc.fit(v,CW-70,9,true),{size:9,bold:true,align:'right'});y+=6.5;rule();}};
    // Key figures as tiles: [value, label, small line].
    const tiles=list=>{const n=list.length,tw=(CW-3*(n-1))/n,th=list.some(t=>t[2])?19.5:16;room(th+2);
      list.forEach(([val,lab,sub],i)=>{const x=L+i*(tw+3);doc.rect(x,y,tw,th,{fill:'#f1f6fd',stroke:'#d9e6f4',r:2.5});
        doc.text(x+3.5,y+7.5,doc.fit(String(val),tw-7,14,true),{size:14,bold:true,color:blue});
        doc.text(x+3.5,y+12.3,doc.fit(lab,tw-7,8,true),{size:8,bold:true,color:grey});
        if(sub)doc.text(x+3.5,y+16.4,doc.fit(sub,tw-7,7.5),{size:7.5,color:grey});});y+=th+2;};
    head();
    // Title and the vehicle's details.
    doc.text(L,y+4,doc.fit(carName(c),CW,18,true),{size:18,bold:true});y+=10.5;
    const sub=[c.nick?c.name:'',c.plate,T('vm. '+c.year),T(typeOf(c)),c.fuel?T(c.fuel):'',c.engine||''].filter(Boolean).join(' · ');
    for(const l of doc.wrap(sub,CW,9.5)){doc.text(L,y,l,{size:9.5,color:grey});y+=4.5;}y+=2;
    tiles([[String(ev.length),T('Merkintää')],[number(c.km),T(hr?'Tunnit nyt':'Km nyt')],[number(total)+' €',T('Kulut')]]);y+=1;
    const f1=[];if(ev.length)f1.push([T('Aikaväli'),`${date(ev[0].date)} – ${date(ev[ev.length-1].date)}`]);
    if(perYear!==null)f1.push([T('Ajoa keskimäärin'),T(`noin ${number(perYear)} ${u} / vuosi`)]);f1.push([T('Kuitteja tallessa'),T(`${receipts} kpl`)]);
    for(const p of fp){if(p.s.avg!==null)f1.push([T(fp.length>1?(p.k==='el'?'Keskikulutus, sähkö':'Keskikulutus, polttoaine'):'Keskikulutus'),`${dec(p.s.avg)} ${p.u}/${per(c)}`]);f1.push([T(p.u==='kWh'?'Latauskulut':'Polttoainekulut'),T(`${number(Math.round(p.s.cost))} € · ${p.s.fills.length} kirjausta`)]);}
    rule();facts(f1);
    // Analysis: four tiles, a few facts and the costs per year.
    if(an){const {oil,svc,insp,owners,og,span,kmSpan,lastOil,biggest,perYearCost,perYearFuel,hasFuel,yrs,maxY}=an;
      h2('Analyysi',40);y+=1.5;
      tiles([[String(oil.length),T(oil.length===1?'Öljynvaihto':'Öljynvaihtoa'),lastOil?T('viimeksi '+date(lastOil.date)):T('ei kirjattu')],
        [og.months===null?'–':T(fmtMonths(og.months)),T('Öljynvaihtojen väli'),og.km&&!hr?T('noin '+number(Math.round(og.km/500)*500)+' km'):''],
        [String(svc.length),T(svc.length===1?'Huolto':'Huoltoa'),insp.length?T(insp.length+(insp.length===1?' katsastus':' katsastusta')):''],
        [span>=0.5?number(Math.round(total/span))+' €':'–',T('Kulut / vuosi'),kmSpan>=1000&&!hr?T(number(Math.round(total/kmSpan*1000))+' € / 1000 km'):'']]);
      const f2=[];if(lastOil&&og.months)f2.push([T('Seuraava öljynvaihto arviolta'),date(addMonths(lastOil.date,Math.round(og.months)))+(lastOil.km!==null&&og.km&&!hr?' / '+number(lastOil.km+Math.round(og.km/500)*500)+' km':'')]);
      if(biggest)f2.push([T('Suurin yksittäinen kulu'),`${T(dispType(c,biggest.type))} · ${number(biggest.cost)} €`]);if(insp.length)f2.push([T('Viimeisin katsastus'),date(insp[insp.length-1].date)]);
      f2.push([T('Omistajanvaihdoksia kirjattu'),String(owners.length)]);rule();facts(f2);
      if(yrs.length>1){const bh=40;room(bh+10);y+=4;doc.rect(L,y,CW,bh,{stroke:'#e0e9f2',r:2.5});const sw=(CW-6)/yrs.length,top=y+4,ph=bh-15;
        yrs.forEach((yr,i)=>{const cx=L+3+sw*(i+.5),bw=Math.min(sw*.7,14),h=Math.max(ph*.04,ph*perYearCost[yr]/maxY),by=top+ph-h;
          doc.rect(cx-bw/2,by,bw,h,{fill:'#1464e8',r:Math.min(1,bw/4)});if(perYearFuel[yr]){const fh=h*perYearFuel[yr]/perYearCost[yr];doc.rect(cx-bw/2,by+h-fh,bw,fh,{fill:'#19b1c8'});}
          doc.text(cx,top+ph+4,doc.fit(number(Math.round(perYearCost[yr]))+' €',sw-1,6.5,true),{size:6.5,bold:true,color:'#3d5670',align:'center'});
          doc.text(cx,top+ph+7.5,yr,{size:6.5,color:grey,align:'center'});});
        y+=bh+1.5;if(hasFuel){room(6);doc.rect(L+1,y+1.2,2.6,2.6,{fill:'#1464e8',r:.5});let x=L+5+doc.text(L+5,y+3.6,T('Huolto ja korjaus'),{size:7.5,color:grey})+4;
          doc.rect(x,y+1.2,2.6,2.6,{fill:'#19b1c8',r:.5});doc.text(x+4,y+3.6,T('Polttoaine'),{size:7.5,color:grey});y+=5;}}}
    // Count and cost per type.
    const types=Object.entries(byType).sort((a,b)=>b[1].n-a[1].n);
    if(types.length){const tc=()=>thead([[T('Tyyppi'),L+2],[T('Kpl'),R-40,'right'],['€',R-2,'right']]);h2('Yhteenveto',Math.min(19+types.length*6,90));y+=1.5;tc();
      for(const [t,v] of types){room(6,tc);doc.text(L+2,y+4.2,doc.fit(T(t),CW-50,9),{size:9});doc.text(R-40,y+4.2,String(v.n),{size:9,align:'right'});doc.text(R-2,y+4.2,number(v.cost),{size:9,align:'right'});y+=6;rule();}}
    // Line charts drawn with lines and dots, scaled like the screen (lineChart).
    const chart=(x,w,title,subT,pts,{yFmt,xLabels,avg,avgLabel,lineCol,dotCol,legend})=>{const h=62,t0=y;doc.rect(x,t0,w,h,{stroke:'#e0e9f2',r:2.5});
      doc.text(x+4,t0+6.5,doc.fit(title,w-8,10,true),{size:10,bold:true});if(subT)doc.text(x+4,t0+10.8,doc.fit(subT,w-8,8),{size:8,color:grey});
      // Legend rows first, so the plot leaves room for a second row when the labels do not fit on one.
      const lgw=([,lab,dash])=>(dash?4:2.4)+1.5+doc.width(lab,7)+3.5,rows=[[]];let acc=0;for(const it of legend){if(acc&&x+4+acc+lgw(it)-3.5>x+w-3){rows.push([]);acc=0;}rows[rows.length-1].push(it);acc+=lgw(it);}
      const ex=(rows.length-1)*3.6,pl=x+17,pr=x+w-4,pt=t0+14,pb=t0+h-15-ex,xs=pts.map(p=>p.x),ys=pts.map(p=>p.y).concat(avg!=null?[avg]:[]);
      let x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);if(x1===x0)x1=x0+1;const pad=(y1-y0)*.15||Math.abs(y1)*.1||1;y0=Math.max(0,y0-pad);y1+=pad;
      const X=v=>pl+(v-x0)/(x1-x0)*(pr-pl),Y=v=>pt+(1-(v-y0)/(y1-y0))*(pb-pt);
      for(const k of [0,.5,1]){const v=y0+(y1-y0)*k;doc.line(pl,Y(v),pr,Y(v),{color:'#e6edf4',lw:.25});doc.text(pl-1.5,Y(v)+1.1,yFmt(v),{size:6.5,color:grey,align:'right'});}
      if(avg!=null){for(let a=pl;a<pr;a+=2.4)doc.line(a,Y(avg),Math.min(a+1.4,pr),Y(avg),{color:'#d9822b',lw:.45});}
      for(let i=1;i<pts.length;i++)doc.line(X(pts[i-1].x),Y(pts[i-1].y),X(pts[i].x),Y(pts[i].y),{color:lineCol,lw:.5});
      for(const p of pts){const d=p.big?2.1:1.4;doc.rect(X(p.x)-d/2,Y(p.y)-d/2,d,d,{fill:dotCol(p),stroke:'#ffffff',lw:.25,r:d/2});}
      if(avg!=null){const aw=doc.width(avgLabel,6.5,true);doc.rect(pr-aw-1,Y(avg)-4.2,aw+1.5,3.6,{fill:'#ffffff',r:.8});doc.text(pr,Y(avg)-1.4,avgLabel,{size:6.5,bold:true,color:'#b86a1d',align:'right'});}
      doc.text(pl,pb+4.5,xLabels[0],{size:6.5,color:grey});doc.text(pr,pb+4.5,xLabels[1],{size:6.5,color:grey,align:'right'});
      rows.forEach((row,ri)=>{let lx=x+4;const ly=t0+h-5-ex+ri*3.6;for(const [col,lab,dash] of row){
        if(dash==='line')doc.line(lx,ly-1.1,lx+4,ly-1.1,{color:col,lw:.6});else if(dash)for(let a=0;a<4;a+=2)doc.line(lx+a,ly-1.1,lx+a+1.2,ly-1.1,{color:col,lw:.6});else doc.rect(lx,ly-2.3,2.4,2.4,{fill:col,r:1.2});
        lx+=(dash?4:2.4)+1.5;doc.text(lx,ly,lab,{size:7,color:grey});lx+=doc.width(lab,7)+3.5;}});};
    const fuelOn=fs.series.length>=2;
    if(kd||fuelOn){room(66);y+=4;const both=kd&&fuelOn,w=both?(CW-4)/2:CW;let x=L;
      if(kd){const {pts,first,lastP,per:pk}=kd,col={service:'#0b5ed7',inspect:'#1f9a62',tyres:'#7a8ca0',repair:'#d9822b',other:'#a7b1bc',fuel:'#b9c7d6'},rg=Math.max(...pts.map(p=>p.y))-Math.min(...pts.map(p=>p.y)),stp=rg>=20000?1000:rg>=2000?100:rg>=200?10:1;
        const fmtD=v=>date(new Date(v*864e5).toISOString().slice(0,10)),has=k=>pts.some(p=>p.cls==='k-'+k);
        chart(x,w,T(hr?'Käyttötuntien kehitys':'Kilometrien kehitys'),pk!==null&&pk>0?T(`Keskimäärin ${number(pk)} ${u} vuodessa`):'',pts,{yFmt:v=>number(Math.round(v/stp)*stp),xLabels:[fmtD(first.x),fmtD(lastP.x)],lineCol:'#9fb3c8',dotCol:p=>col[p.cls.slice(2)]||'#a7b1bc',
          legend:[['service','Huolto'],['repair','Korjaus'],['inspect','Katsastus'],['tyres','Renkaat'],['other','Muu merkintä'],['fuel',fillWord(c)]].filter(([k])=>has(k)).map(([k,l])=>[col[k],T(l)])});x+=w+4;}
      if(fuelOn){const s=fs,cp=s.series.map(p=>({x:p.km,y:p.v}));
        chart(x,w,T('Kulutus'),'',cp,{yFmt:v=>dec(v),xLabels:[number(s.series[0].km)+' '+u,number(s.series[s.series.length-1].km)+' '+u],avg:s.avg,avgLabel:T('Keskikulutus '+dec(s.avg)),lineCol:blue,dotCol:()=>blue,
          legend:[[blue,T(`${fu}/${per(c)} täysien ${fu==='kWh'?'latausten':'tankkausten'} välillä`),'line'],['#d9822b',T('keskikulutus'),'dash']]});}
      y+=62;}
    // Every entry, newest first; done jobs and the owner's note under the type.
    const ec=()=>thead([[T('Pvm'),L+2],[T('Tapahtuma'),L+27],[T(hr?'h':'Km'),R-24,'right'],['€',R-2,'right']]),tw=R-24-L-27-22;
    h2('Kaikki merkinnät',30);
    if(ev.length){y+=1.5;ec();
      for(const e of [...ev].reverse()){const its=e.items?.length?doc.wrap(e.items.map(T).join(', '),tw,7.5):[],nt=e.note?doc.wrap(e.note,tw,7.5):[],mt=(m=>m?doc.wrap(m,tw,7.5):[])(evMetaTxt(e)),h=6.6+(its.length+nt.length+mt.length)*3.4+(its.length||nt.length||mt.length?.8:0);
        room(h,ec);doc.text(L+2,y+4.4,date(e.date),{size:9});doc.text(L+27,y+4.4,doc.fit(T(dispType(c,e.type)),tw,9,true),{size:9,bold:true});
        doc.text(R-24,y+4.4,e.km===null?'–':number(e.km),{size:9,align:'right'});doc.text(R-2,y+4.4,e.cost!==''&&e.cost!==undefined?number(e.cost):'–',{size:9,align:'right'});
        let ly=y+8.2;for(const l of [...its,...nt,...mt]){doc.text(L+27,ly,l,{size:7.5,color:grey});ly+=3.4;}y+=h;rule();}}
    else{y+=6;doc.text(L,y,T('Ei vielä merkintöjä.'),{size:9,color:grey});y+=2;}
    // Parts used, when any were logged.
    if(ev.some(e=>e.parts?.length)){const pc=()=>thead([[T('Pvm'),L+2],[T('Osa'),L+27],[T('Määrä'),R-40,'right'],['€',R-2,'right']]);h2('Käytetyt varaosat');y+=1.5;pc();
      for(const e of [...ev].reverse())for(const x of e.parts||[]){room(6,pc);doc.text(L+2,y+4.2,date(e.date),{size:9});doc.text(L+27,y+4.2,doc.fit(x.name,R-40-L-27-20,9),{size:9});
        doc.text(R-40,y+4.2,doc.fit(x.qty||'–',18,9),{size:9,align:'right'});doc.text(R-2,y+4.2,x.price?number(x.price):'–',{size:9,align:'right'});y+=6;rule();}}
    // The same closing note as the screen; it stays together on one page.
    const nl=doc.wrap(T(`Raportti perustuu omistajan omiin merkintöihin${c.sample?' (esimerkkiauto, kuvitteelliset tiedot)':''}. Se ei korvaa valmistajan tai korjaamon virallista huoltokirjaa.`)+(ev.some(e=>e.created||e.updated)?' '+T('Lisäys- ja muokkausajat ovat puhelimen kellon mukaan.'):''),CW,8);
    room(nl.length*3.8+6);y+=6;for(const l of nl){doc.text(L,y,l,{size:8,color:grey});y+=3.8;}
    doc.each((i,n)=>{const fy=285;doc.line(L,fy-4.5,R,fy-4.5,{color:'#cbd9e8',lw:.25});
      doc.text(L,fy,company.name,{size:7.5,bold:true});doc.text(L,fy+3.3,company.id?`${T('Y-tunnus')} ${company.id}`:T('Kehitysvaiheen sovellus'),{size:7,color:grey});
      doc.text(105,fy,company.web,{size:7.5,color:grey,align:'center'});
      doc.text(R,fy,`${T('Sivu')} ${i} / ${n}`,{size:7.5,color:grey,align:'right'});doc.text(R,fy+3.3,reportId,{size:7,color:grey,align:'right'});});
    return doc;}
  // One entry as a PDF with its photos and receipts (0.34), handed over like the reports: share sheet on a phone, download on a computer.
  function eventPdf(carId,id){const P=window.AjouraPDF,c=cars.find(c=>c.id===carId),e=c?.events.find(e=>e.id===id);if(!P||!e)return;let file;
    try{const tag=(c.plate||'').normalize('NFD').replace(/[^A-Za-z0-9]/g,'')||'ajoneuvo';
      file=new File([eventDoc(P,c,e).blob()],'ajoura-'+tag+'-merkinta-'+e.date+'.pdf',{type:'application/pdf'});}
    catch(err){notice='PDF-tiedoston teko ei onnistunut. Yritä uudelleen.';render();return;}
    saveFile(file,matchMedia('(pointer: coarse)').matches);}
  function eventDoc(P,c,e){const T=tl,hr=hourly(c),u=ku(c),x=evInfo(c,e),printed=date(today()),has=v=>v!==''&&v!=null&&Number.isFinite(Number(v));
    const doc=P.create({title:'AJOURA – '+T('Huoltomerkintä')+' – '+carName(c)}),L=12,R=198,CW=R-L,BOT=277;
    const grey='#4f5f72',hair='#d6dee8',blue='#1769f4';
    let y=0;
    const head=()=>{doc.page();doc.logo(L,12,46);doc.text(R,17,T('Huoltomerkintä'),{size:12,bold:true,align:'right'});
      doc.text(R,21.5,T('Tulostettu '+printed),{size:8,color:grey,align:'right'});doc.rect(L,29.5,CW,.6,{fill:blue});y=37;};
    const room=h=>{if(y+h>BOT)head();};
    const rule=()=>doc.line(L,y,R,y,{color:hair,lw:.2});
    // Section title like the screen's small capitals; need keeps it on the same page as the first lines below it.
    const h3=(s,need)=>{room(need+11);y+=6;doc.text(L,y+3,T(s),{size:8.5,bold:true,color:grey});y+=6;};
    // Label on the left, value on the right; the label gives way when the value is long.
    const row=(k,v)=>{room(7);const vw=v?Math.min(doc.width(v,9,true),CW*.6):0;doc.text(L+1,y+4.6,doc.fit(k,CW-vw-8,9),{size:9,color:grey});if(v)doc.text(R-1,y+4.6,doc.fit(v,CW*.6,9,true),{size:9,bold:true,align:'right'});y+=7;rule();};
    head();
    doc.text(L,y+4,doc.fit(T(dispType(c,e.type)),CW,18,true),{size:18,bold:true});y+=10.5;
    doc.text(L,y,doc.fit(carName(c)+' · '+(c.plate||T(typeOf(c))),CW,9.5),{size:9.5,color:grey});y+=6;
    // Date, meter and cost as tiles.
    const tiles=[[date(e.date),T('PÄIVÄMÄÄRÄ')],[e.km===null?T('Ei merkitty'):number(e.km)+' '+u,T(hr?'TUNTIMITTARI':'MITTARILUKEMA'),e.km===null],[has(e.cost)?number(e.cost)+' €':T('Ei merkitty'),T('KUSTANNUS'),!has(e.cost)]],tw=(CW-6)/3;
    tiles.forEach(([v,k,empty],i)=>{const tx=L+i*(tw+3);doc.rect(tx,y,tw,16,{fill:'#f1f6fd',stroke:'#d9e6f4',r:2.5});
      doc.text(tx+3.5,y+6,doc.fit(k,tw-7,7.5,true),{size:7.5,bold:true,color:grey});doc.text(tx+3.5,y+12.5,doc.fit(v,tw-7,empty?10:13,true),{size:empty?10:13,bold:true,color:empty?grey:blue});});
    y+=19;rule();
    // Time and distance since the previous entry of the same kind, and the next due date.
    if(x.prev){const t=x.days<62?`${number(x.days)} ${T('pv')}`:`${number(Math.round(x.days/30.4))} ${T('kk')}`;row(T(x.word[0]),`${t}${x.km!==null?` · ${number(x.km)} ${u}`:''} (${date(x.prev.date)})`);}
    else row(T(x.word[1]),'');
    if(x.due)row(T(x.due.what==='Huolto'?'Tämän huollon perusteella seuraava huolto':'Arvio seuraavasta katsastuksesta'),`${date(x.due.due)}${x.due.km!==null?` ${T('tai')} ${number(x.due.km)} km`:''}`);
    // Who did the work (0.38): a company's contact details on their own rows, then the entry's times in small print.
    const by=e.by,who=byWho(by,true);if(who){row(T('Työn teki'),who.own?who.txt:T(who.txt));if(by.t==='shop')for(const [k,w] of [['tel','Puhelin'],['mail','Sähköposti'],['addr','Osoite'],['yt','Y-tunnus']])if(by[k])row(T(w),by[k]);}
    const st=stampTxt(e);if(st){room(7);doc.text(L+1,y+4.6,doc.fit(st,CW-2,8),{size:8,color:grey});y+=7;}
    // Done jobs in two columns.
    if(e.items?.length){const cw=(CW-6)/2,list=e.items.map(T),half=Math.ceil(list.length/2);h3('TEHDYT TOIMENPITEET',5.5);
      for(let r=0;r<half;r++){room(5.5);[list[r],list[r+half]].forEach((it,ci)=>{if(it===undefined)return;const cx=L+ci*(cw+6);doc.rect(cx+1,y+1.9,1.6,1.6,{fill:blue,r:.8});doc.text(cx+4.5,y+3.8,doc.fit(it,cw-5,9),{size:9});});y+=5.5;}}
    // Itemised costs: parts (the owner's own names stay untranslated), labour and other.
    const parts=e.parts||[];
    if(parts.length||e.labor||e.other){h3('KULUT ERITELTYINÄ',6.5);
      const line=(name,qty,price)=>{room(6.5);let lx=L+1+doc.text(L+1,y+4.4,doc.fit(name,CW-50,9),{size:9});if(qty)doc.text(lx+1.5,y+4.4,doc.fit('· '+qty,R-30-lx,8),{size:8,color:grey});
        doc.text(R-1,y+4.4,price,{size:9,align:'right'});y+=6.5;rule();};
      rule();for(const p of parts)line(p.name,p.qty,p.price?number(p.price)+' €':'');if(e.labor)line(T('Työ'),'',number(e.labor)+' €');if(e.other)line(T('Muut'),'',number(e.other)+' €');}
    // The owner's note as written, line breaks kept.
    if(e.note){const nl=String(e.note).split(/\r?\n/).flatMap(p=>p.trim()?doc.wrap(p,CW-2,9):['']);h3('MUISTIINPANO',Math.min(nl.length,3)*4.4);
      for(const l of nl){room(4.4);if(l)doc.text(L+1,y+3.4,l,{size:9});y+=4.4;}}
    // Photos three to a row and receipts two to a row and up to a page tall (close to real size, so the text can be read); each keeps its shape and a row moves to the next page when it does not fit.
    const grid=(title,list,cols,boxH)=>{const cw=(CW-4*(cols-1))/cols,items=list.map(src=>({src,s:doc.imageSize(src)})).filter(i=>i.s);if(!items.length)return;
      const rows=[];for(let i=0;i<items.length;i+=cols)rows.push(items.slice(i,i+cols).map(it=>{const k=Math.min(cw/it.s.w,boxH/it.s.h);return {...it,w:it.s.w*k,h:it.s.h*k};}));
      const rh=r=>Math.max(...r.map(i=>i.h));h3(title,rh(rows[0]));y+=1;
      for(const r of rows){room(rh(r));r.forEach((it,ci)=>{const ix=L+ci*(cw+4)+(cw-it.w)/2;doc.image(it.src,ix,y,it.w,it.h);doc.rect(ix,y,it.w,it.h,{stroke:hair,lw:.2});});y+=rh(r)+4;}};
    grid('KUVAT',e.photos||[],3,62);grid('KUITIT',e.receipts||[],2,225);
    if(c.sample&&!e.id.startsWith('new')){room(8);y+=6;doc.text(L,y,T('Kuvitteellinen esimerkkimerkintä.'),{size:8,color:grey});}
    doc.each((i,n)=>{const fy=285;doc.line(L,fy-4.5,R,fy-4.5,{color:'#cbd9e8',lw:.25});
      doc.text(L,fy,company.name,{size:7.5,bold:true});doc.text(L,fy+3.3,company.id?`${T('Y-tunnus')} ${company.id}`:T('Kehitysvaiheen sovellus'),{size:7,color:grey});
      doc.text(105,fy,company.web,{size:7.5,color:grey,align:'center'});doc.text(105,fy+3.3,doc.fit(carName(c)+(c.plate?' · '+c.plate:''),70,7),{size:7,color:grey,align:'center'});
      doc.text(R,fy,`${T('Sivu')} ${i} / ${n}`,{size:7.5,color:grey,align:'right'});doc.text(R,fy+3.3,T('Tulostettu '+printed),{size:7,color:grey,align:'right'});});
    return doc;}
  // Each screen remembers its scroll position, so going back (or re-rendering after a choice) does not jump to the top.
  const scrollMem={};let lastKey='';const keepScroll=['home','vehicle','help','tips','me','report','event','notes','fuel','reports','menu','settings','theme'];
  function render(){if(lastKey)scrollMem[lastKey]=screen.scrollTop;let {view,id,eventId}=route();const R=window.AjouraRoles;if(R){const to=R.redirect(view,id);if(to){history.replaceState(null,'','#'+to);({view,id,eventId}=route());}}if(R&&R.owns(view)){clearTimeout(launchTimer);launchTimer=0;glass.classList.remove('launcher-mode');draft=null;lookup=null;R.paint(screen,view,id);lastKey='';notice='';screen.focus({preventScroll:true});return;}const S=window.AjouraSync;if(S&&S.owns(view)){clearTimeout(launchTimer);launchTimer=0;glass.classList.remove('launcher-mode');draft=null;lookup=null;S.paint(screen,view);lastKey='';notice='';screen.focus({preventScroll:true});if(R)R.after(view);return;}let c=cars.find(c=>c.id===id);flFromTab=view==='fuel'&&!c;if(view==='fuel'&&!c&&cars.length){c=cars.find(x=>x.id===flPrefs().car)||cars[0];history.replaceState(null,'','#fuel/'+c.id);}if(!guidance[view]||(['vehicle','add','event','edit','report','caredit','owner','fuel','notes'].includes(view)&&!c&&!(view==='fuel'&&!cars.length))){history.replaceState(null,'','#home');view='home';}let e=c?.events.find(e=>e.id===eventId);if((view==='event'||view==='edit')&&!e){history.replaceState(null,'','#vehicle/'+c.id);view='vehicle';}if(view!=='newcar'){draft=null;lookup=null;carPicked=false;}if(view!=='notes')memoEdit='';if(view!=='welcome')welcomeStep='';if(view!=='theme'){themeSel=null;themeDone='';}if(view!=='add'&&view!=='edit'){pending={photos:[],receipts:[]};pendingFor='';}clearTimeout(launchTimer);launchTimer=0;const now=new Date();document.getElementById('status-time').textContent=now.getHours()+'.'+String(now.getMinutes()).padStart(2,'0');glass.classList.toggle('launcher-mode',view==='launcher');let html=view==='launcher'?launcher():view==='welcome'?welcome():view==='home'?home():view==='car-order'?garageOrder():view==='newcar'?newcar():view==='vehicle'?vehicle(c):view==='add'?add(c):view==='edit'?add(c,e):view==='report'?report(c,eventId):view==='caredit'?carEdit(c):view==='owner'?owner(c):view==='fuel'?fuel(c,eventId):view==='notes'?notesPage(c):view==='me'?me():view==='help'?help():view==='tips'?tipsPage():view==='reports'?reports():view==='menu'?menu():view==='settings'?settings():view==='theme'?themePage():view==='feedback'?feedbackPage():detail(c,e);screen.innerHTML=view==='launcher'?html:'<div class="screen-content">'+html+'</div>'+(tabViews.includes(view)?tabBar(view):'');if(view==='fuel'||view==='reports')flScrollChips();const key=location.hash||view;screen.scrollTop=keepScroll.includes(view)?(scrollMem[key]||0):(key===lastKey?scrollMem[key]||0:0);lastKey=key;screen.focus({preventScroll:true});const done=view==='vehicle'&&c&&c.events&&c.events.length,g=done?guidance.home:guidance[view],stepKey=done?'home':guideStep[view];document.getElementById('guide-number').textContent=g[0];document.getElementById('guide-title').textContent=g[1];document.getElementById('guide-copy').textContent=g[2];document.querySelectorAll('[data-step]').forEach(el=>el.classList.toggle('active',el.dataset.step===stepKey));document.title='AJOURA App — '+({launcher:'Aloitusnäyttö',welcome:'Tervetuloa',home:'Etusivu','car-order':'Ajoneuvojen järjestys',newcar:'Uusi ajoneuvo',me:'Varmuuskopio ja tiedot',help:'Ohjeet',reports:'Raportit',menu:'Valikko',settings:'Asetukset',feedback:'Palaute',vehicle:c&&carName(c),add:'Uusi merkintä',edit:'Muokkaa merkintää',report:'Raportti',caredit:'Muokkaa ajoneuvoa',owner:'Omistajanvaihdos',fuel:'Tankkaus',notes:'Muistiinpanot',event:e?.type}[view]);notice='';if(R)R.after(view);}
  function saveEvent(form){
    if(!form.reportValidity())return;const r=route(),c=cars.find(c=>c.id===r.id);if(!c)return;const editing=r.view==='edit'?c.events.find(e=>e.id===r.eventId):null;
    const data=new FormData(form),kmRaw=String(data.get('km')).trim(),km=kmRaw===''?null:Number(kmRaw),when=String(data.get('date')),type=String(data.get('type')),cost=String(data.get('cost')),items=data.getAll('items').map(String).filter(i=>allItems.includes(i));const error=document.getElementById('form-error'),submit=form.querySelector('[type=submit]');
    if(!(kindsFor(c).includes(type)||(editing&&type===editing.type))||(km!==null&&(!Number.isSafeInteger(km)||km<0||km>2000000))||!/^\d{4}-\d{2}-\d{2}$/.test(when)||when>today()||(!editing&&when<(c.year-1)+'-01-01')||(cost!==''&&(!Number.isFinite(Number(cost))||Number(cost)<0))){error.textContent='Tarkista tyyppi, päivämäärä ja mittarilukema.';return;}
    // Odometer readings should grow with time. A conflict is a warning the user can override, not a hard block.
    const conflict=km===null?null:c.events.find(e=>e!==editing&&e.km!==null&&((e.date<when&&e.km>km)||(e.date>when&&e.km<km))),signature=when+'|'+km;
    if(conflict&&form.dataset.confirmed!==signature){form.dataset.confirmed=signature;error.textContent=`Lukema ${number(km)} ${ku(c)} ei sovi yhteen tapahtuman ”${dispType(c,conflict.type)}” (${date(conflict.date)}, ${number(conflict.km)} ${ku(c)}) kanssa. Tarkista lukema tai tallenna silti.`;submit.textContent='Tallenna silti';return;}
    const parts=readParts(data),labor=String(data.get('labor')||''),other=String(data.get('other')||'');if([...parts.map(x=>x.price),labor,other].some(v=>v!==''&&(!Number.isFinite(Number(v))||Number(v)<0))){error.textContent='Tarkista hinnat.';return;}
    // Who did the work (0.38). Not asked for odometer readings and ownership changes; a company needs a name.
    const byT=noBy.includes(type)?'':String(data.get('by')||''),bv=k=>String(data.get(k)||'').trim().slice(0,byLim[k.slice(3)]||80),by=byT==='self'?{t:'self'}:byT==='shop'?{t:'shop',n:bv('by_n')}:byT==='other'?{t:'other',...(bv('by_o')?{n:bv('by_o').slice(0,80)}:{})}:null;
    if(by&&by.t==='shop'){if(!by.n){error.textContent='Kirjoita yrityksen nimi.';form.elements.by_n.focus();return;}for(const k of ['tel','mail','addr','yt']){const x=bv('by_'+k);if(x)by[k]=x;}
      if(by.yt&&!/^\d{7}-\d$/.test(by.yt)){error.textContent='Tarkista Y-tunnus (muoto 1234567-8).';form.elements.by_yt.focus();return;}}
    const before=JSON.stringify({cars,sequence}),ev=editing||{id:uid('new')},canon=o=>JSON.stringify(Object.keys(o).filter(k=>k!=='updated').sort().map(k=>[k,o[k]])),was=editing?canon(editing):'';Object.assign(ev,{type,date:when,km,cost,note:String(data.get('note')).trim().slice(0,300)});
    for(const k of ['items','photos','receipts','parts','labor','other'])delete ev[k];if(items.length)ev.items=items;if(parts.length)ev.parts=parts;if(labor)ev.labor=labor;if(other)ev.other=other;if(pending.photos.length)ev.photos=[...pending.photos];if(pending.receipts.length)ev.receipts=[...pending.receipts];
    delete ev.by;if(by)ev.by=by;
    // The times come from the phone's clock. An edit that changes nothing keeps the old time.
    if(!editing)ev.created=new Date().toISOString();else if(canon(ev)!==was)ev.updated=new Date().toISOString();
    if(!editing)c.events.push(ev);if(km!==null)c.km=Math.max(c.km,km);
    if(!savedOk()){window.AjouraAvatar.react('attention');const old=JSON.parse(before);cars=old.cars;sequence=old.sequence;persist();error.textContent='Tallennus ei onnistunut: laitteen tila ei riitä. Poista osa kuvista ja yritä uudelleen.';return;}
    pending={photos:[],receipts:[]};pendingFor='';notice=editing?'✓ Muutokset tallennettu.':'✓ Merkintä tallennettu.';document.getElementById('demo-announcement').textContent=dispType(c,type)+(editing?' päivitetty':' lisätty ajoneuvolle '+carName(c));go(editing?'event/'+c.id+'/'+ev.id:'vehicle/'+c.id);window.AjouraAvatar.react('success');
  }
  function deleteEvent(id){const c=cars.find(c=>c.id===route().id),e=c&&c.events.find(e=>e.id===id);if(!e||!confirm(tl(dispType(c,e.type))+' · '+date(e.date)+'\n\n'+tl('Poistetaanko merkintä kuvineen ja kuitteineen?')+'\n'+tl('Poistoa ei voi perua. Seuraavan huollon arvio lasketaan uudelleen.')))return;c.events=c.events.filter(e=>e.id!==id);persist();notice='Merkintä poistettu.';go('vehicle/'+c.id);}

  function startLookup(raw){
    const plate=normalPlate(raw);
    if(!plateOk(plate)){lookup={plate:String(raw).trim(),error:'Tarkista rekisteritunnus, esim. ABC-123.'};render();document.getElementById('plate-input')?.focus();return;}
    const token={plate,pending:true};lookup=token;render();
    // A short pause stands in for a network lookup; the result comes from the fictional registry above.
    setTimeout(()=>{if(lookup!==token||route().view!=='newcar')return;const found=registry[plate];draft=found?{...found,plate,source:'lookup',step:'details'}:{plate,name:'',year:'',body:'',fuel:'',color:'',source:'manual',missed:true,step:'details'};lookup=null;document.getElementById('demo-announcement').textContent=found?'Ajoneuvo tunnistettu: '+found.name:'Esimerkkiautoa ei löytynyt. Syötä tiedot itse.';render();},700);
  }
  function syncLook(form){
    const data=new FormData(form),body=String(data.get('body')),color=String(data.get('color')),gen=Number(data.get('gen')),was=draft.body;
    if(Car.bodies.includes(body))draft.body=body;if(Car.colors.some(([,v])=>v===color))draft.color=color;if(gen)draft.gen=gen;
    if(draft.body!==was&&(genChoices(draft).length||document.querySelector('.gen-picker'))){const y=screen.scrollTop;render();screen.scrollTop=y;return;}
    const box=document.getElementById('car-preview');if(box)box.innerHTML=preview(draft);document.getElementById('form-error').textContent='';
  }
  function syncDetails(form){const data=new FormData(form);for(const key of ['plate','name','nick','year','km','fuel','brand','brandText','model','modelText','version'])if(data.has(key))draft[key]=String(data.get(key)??'');if(draft.source!=='lookup')draft.name=makeName(draft);}
  function saveLook(form){syncLook(form);const error=document.getElementById('form-error'),{name,nick,plate,year,km,fuel,body,color}=draft;
    if(!bodyChoices(draft).includes(body)||!Car.colors.some(([,v])=>v===color)){error.textContent=!bodyChoices(draft).includes(body)?'Valitse auton korimalli.':'Valitse auton väri.';return;}
    const id=uid('new-car'),gen=genOf(draft);cars.push({id,name,nick,plate,year,km,body,color,fuel,...(gen?{gen}:{}),events:[]});draft=null;notice='✓ '+(nick||name)+' lisätty talliin.';document.getElementById('demo-announcement').textContent=(nick||name)+' lisätty ajoneuvoihin';persist();go('vehicle/'+id);
  }
  function saveCar(form){
    syncDetails(form);
    const data=new FormData(form),name=(draft.source==='lookup'?String(data.get('name')):draft.name).trim().replace(/\s+/g,' '),nick=String(data.get('nick')).trim().replace(/\s+/g,' ').slice(0,24),plate=normalPlate(String(data.get('plate')).trim()),year=Number(data.get('year')),km=Number(data.get('km')),max=new Date().getFullYear()+1;const error=document.getElementById('form-error');
    const fuel=String(data.get('fuel'));
    if(!plateOk(plate)){error.textContent='Tarkista rekisteritunnus, esim. ABC-123.';return;}
    if(name.length<2||name.length>60){error.textContent=draft.source==='lookup'?'Kirjoita auton merkki ja malli.':!draft.brand?'Valitse auton merkki.':'Valitse tai kirjoita auton malli.';return;}if(draft.source!=='lookup'&&(!draft.brand||(!draft.model&&draft.brand!=='__other')||((draft.model==='__other'||draft.brand==='__other')&&!(draft.modelText||'').trim()))){error.textContent=!draft.brand?'Valitse auton merkki.':'Valitse tai kirjoita auton malli.';return;}
    if(!Number.isInteger(year)||year<1930||year>max){error.textContent=`Vuosimallin pitää olla väliltä 1930–${max}.`;return;}
    if(String(data.get('km')).trim()===''){error.textContent='Syötä nykyinen mittarilukema.';return;}if(!Number.isSafeInteger(km)||km<0||km>2000000){error.textContent='Tarkista mittarilukema.';return;}
    if(fuel!==''&&!fuels.includes(fuel)){error.textContent='Valitse käyttövoima listasta.';return;}
    Object.assign(draft,{name,nick,plate,year,km,fuel});const choices=bodyChoices(draft);if(!choices.includes(draft.body))draft.body=choices[0];draft.step='look';render();screen.scrollTop=0;
  }
  function startGuest(){go(cars.length?'home':'newcar');}
  // The short guide is voluntary and can be opened from Welcome, Help or Menu.
  function tutorial(){if(!window.AjouraTutorial||(window.AjouraRoles&&!window.AjouraRoles.feature('tutorial')))return;window.AjouraTutorial.open({onClose:()=>{prefSet('ajoura-tutorial','1');screen.focus({preventScroll:true});}});}
  function saveMe(form){
    const data=new FormData(form),months=Number(data.get('months')),km=Number(data.get('km')),error=document.getElementById('form-error');
    if(!Number.isInteger(months)||months<1||months>36){error.textContent='Kuukausia voi olla 1–36.';return;}
    if(!Number.isInteger(km)||km<1000||km>60000){error.textContent='Kilometrejä voi olla 1 000–60 000.';return;}
    profile={name:'',months,km};notice='✓ Asetukset tallennettu.';persist();render();
  }
  function removeCar(id){const c=cars.find(c=>c.id===id);if(!c||!confirm(`Poistetaanko ${carName(c)} ja sen koko historia?`))return;cars=cars.filter(x=>x!==c);notice='Ajoneuvo poistettu.';persist();go('home');}
  function addSample(){if(cars.length)return;cars.push(structuredClone(samples[0]));persist();notice='✓ Esimerkkiauto lisätty.';go('vehicle/'+samples[0].id);}

  const submitters={'plate-form':form=>startLookup(form.elements.plate.value),'look-form':saveLook,'car-form':saveCar,'event-form':saveEvent,'me-form':saveMe,'caredit-form':saveCarEdit,'owner-form':saveOwner,'kind-form':saveKind,'klook-form':saveKindLook,'memo-form':saveMemo,'memo-edit-form':saveMemoEdit,'feedback-form':sendFeedback};
  function removePhoto(id){const c=cars.find(c=>c.id===id);if(!c)return;delete c.photo;if(c.gallery&&c.gallery.length){c.photo=c.gallery.shift();if(!c.gallery.length)delete c.gallery;notice='Pääkuva poistettu. Seuraava kuva on nyt pääkuva.';}else notice='Kuva poistettu. Näytetään tyylitelty malli.';persist();render();}
  let photoBusy=false;
  async function prepareVehiclePhoto(data){
    if(photoBusy)throw new Error('busy');photoBusy=true;
    const status=document.createElement('p');status.className='photo-processing';status.setAttribute('role','status');status.textContent='Poistetaan kuvan taustaa laitteessa… Ensimmäinen kerta lataa noin 17 Mt kuvamallin ja laskentaohjelmiston. Tämä voi kestää hetken.';document.body.append(status);
    try{const image=await window.AjouraCarPhoto.process(data);await window.AjouraCarPhoto.remember(data,image);return data;}finally{photoBusy=false;status.remove();}
  }
  async function retryVehiclePhoto(id){const c=cars.find(c=>c.id===id);if(!c?.photo||photoBusy)return;const prev=c.photo;
    try{const next=await prepareVehiclePhoto(prev);if(c.photo!==prev)return;c.photo=next;if(!savedOk()){c.photo=prev;persist();notice='Kuvaa ei voitu tallentaa: laitteen tila ei riitä.';}else notice='✓ Kuvan tausta poistettu.';}catch(e){notice='Taustanpoisto ei onnistunut. Alkuperäinen kuva säilytettiin. Tarkista verkkoyhteys ja yritä uudelleen.';}render();}
  async function setPhoto(input){const c=cars.find(c=>c.id===input.dataset.photo),file=input.files?.[0];if(!c||!file||photoBusy)return;let d=await shrink(file,900,.8);if(!d){notice='Valitse kuvatiedosto.';render();return;}let failed=false;try{d=await prepareVehiclePhoto(d);}catch(e){failed=true;}const prev=c.photo;c.photo=d;if(!savedOk()){if(prev)c.photo=prev;else delete c.photo;persist();notice='Kuvaa ei voitu tallentaa: laitteen tila ei riitä.';}else notice=failed?'Taustanpoisto ei onnistunut. Alkuperäinen kuva säilytettiin.':'✓ Kuva tallennettu.';render();}

  screen.addEventListener('click',event=>{const b=event.target.closest('[data-photo-process]');if(b)retryVehiclePhoto(b.dataset.photoProcess);});
  screen.addEventListener('change',event=>{const att=event.target.closest('[data-att]');if(att){addAtt(att);return;}const cp=event.target.closest('[data-car-photos]');if(cp){addCarPhotos(cp);return;}if(event.target.matches('[data-restore]')){restore(event.target);return;}const mk=event.target.closest('[data-make]');if(mk&&draft){const form=mk.form;if(mk.dataset.make==='brand'){draft.model='';draft.version='';draft.modelText='';}if(mk.dataset.make==='model')draft.version='';syncDetails(form);if(mk.dataset.make==='version')return;const y=screen.scrollTop;render();screen.scrollTop=y;const next=document.querySelector(mk.dataset.make==='brand'?(draft.brand==='__other'?'[name=brandText]':'[name=model]'):(draft.model==='__other'?'[name=modelText]':'[name=version]:not([disabled])'));if(next)next.focus({preventScroll:true});return;}const input=event.target.closest('[data-photo]');if(input)setPhoto(input);});
  screen.addEventListener('change',event=>{if(event.target.matches('#event-form [name=type]')){syncItems(event.target.form);syncBy(event.target.form);}if(event.target.matches('#event-form [name=by]'))syncBy(event.target.form);if(event.target.matches('#event-form [name=by_n]'))fillShop(event.target.form);});
  screen.addEventListener('input',event=>{if(event.target.matches('#event-form [name=by_n]'))fillShop(event.target.form);});
  // 0.92 (Niklas): the garage order can be changed on the home screen. A long press (0.45 s) on a card lifts it, dragging
  // moves it and the other cards make room, and letting go saves the new order. The order is simply the order of the cars
  // list, so the saved data and the backup keep their format. Moving the finger before the press is long enough is a
  // normal scroll; the buttons on the card keep their own taps. Near the top or bottom edge the screen scrolls along.
  {let timer=0,drag=null,ptr=null,blockClick=0;const HOLD=450,MOVE=8;
    const end=save=>{clearTimeout(timer);timer=0;if(!drag)return;const d=drag;drag=null;cancelAnimationFrame(d.raf);
      d.list.classList.remove('sorting');d.rows.forEach(r=>{r.style.transform='';r.classList.remove('dragging');});
      try{d.row.releasePointerCapture(d.pid);}catch(e){}blockClick=performance.now();
      if(save&&d.to!==d.from){const id=d.row.dataset.car,i=cars.findIndex(c=>c.id===id);if(i>=0){const [c]=cars.splice(i,1),others=d.rows.filter(r=>r!==d.row).map(r=>r.dataset.car),after=others[d.to-1];cars.splice(after?cars.findIndex(x=>x.id===after)+1:0,0,c);persist();const y=screen.scrollTop;render();screen.scrollTop=y;}}};
    const place=()=>{const d=drag;if(!d)return;const top=d.list.getBoundingClientRect().top,dy=(ptr.y-top)-d.grab;
      d.row.style.transform=`translateY(${(dy-d.tops[d.from])/d.z}px) scale(1.02)`;const mid=dy+d.hs[d.from]/2;let to=0;
      d.rows.forEach((r,i)=>{if(i!==d.from&&d.tops[i]+d.hs[i]/2<mid)to++;});d.to=to;
      d.rows.forEach((r,i)=>{if(i===d.from)return;const shift=d.from<to&&i>d.from&&i<=to?-1:to<d.from&&i>=to&&i<d.from?1:0;r.style.transform=shift?`translateY(${shift*d.step/d.z}px)`:'';});};
    const tick=()=>{const d=drag;if(!d)return;const r=screen.getBoundingClientRect(),dock=screen.querySelector('.tab-dock'),bottom=dock?dock.getBoundingClientRect().top:r.bottom;
      const v=ptr.y<r.top+70?-Math.ceil((r.top+70-ptr.y)/6):ptr.y>bottom-50?Math.ceil((ptr.y-bottom+50)/6):0;if(v){screen.scrollTop+=v;place();}d.raf=requestAnimationFrame(tick);};
    const start=(row,e)=>{const list=row.parentElement,rows=[...list.children].filter(r=>r.classList.contains('garage-row'));if(rows.length<2)return;
      const top=list.getBoundingClientRect().top,rects=rows.map(r=>r.getBoundingClientRect()),tops=rects.map(q=>q.top-top),hs=rects.map(q=>q.height);
      // Visual pixels per CSS pixel of a transform (the screen is zoomed 1.12× or 1.3× on wider phones).
      row.style.transform='translateY(100px)';const z=(row.getBoundingClientRect().top-rects[rows.indexOf(row)].top)/100||1;row.style.transform='';
      const from=rows.indexOf(row),step=hs[from]+(tops[1]-tops[0]-hs[0]);
      drag={row,list,rows,tops,hs,z,from,to:from,step,pid:e.pointerId,grab:e.clientY-top-tops[from],raf:0};
      try{row.setPointerCapture(e.pointerId);}catch(err){}list.classList.add('sorting');row.classList.add('dragging');place();drag.raf=requestAnimationFrame(tick);};
    screen.addEventListener('pointerdown',e=>{if(drag||e.button>0||!e.isPrimary)return;const row=e.target.closest('.garage-rows>.garage-row');if(!row||e.target.closest('.row-actions'))return;
      ptr={x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY};const ev={pointerId:e.pointerId,clientY:e.clientY};clearTimeout(timer);timer=setTimeout(()=>{timer=0;ev.clientY=ptr.y;start(row,ev);},HOLD);});
    screen.addEventListener('pointermove',e=>{if(!ptr)return;ptr.x=e.clientX;ptr.y=e.clientY;if(timer&&Math.hypot(ptr.x-ptr.x0,ptr.y-ptr.y0)>MOVE){clearTimeout(timer);timer=0;}if(drag){e.preventDefault();place();}});
    screen.addEventListener('pointerup',()=>{end(true);ptr=null;});
    screen.addEventListener('pointercancel',()=>{end(false);ptr=null;});
    // While a card is lifted the page must not scroll under the finger (iPhone needs a non-passive touchmove for that).
    screen.addEventListener('touchmove',e=>{if(drag)e.preventDefault();},{passive:false});
    // The release after a drag is not a tap on the card, and a long press does not open the link menu or start a link drag.
    screen.addEventListener('click',e=>{if(blockClick&&performance.now()-blockClick<400&&e.target.closest('.garage-rows')){e.preventDefault();e.stopPropagation();}},true);
    screen.addEventListener('contextmenu',e=>{if(e.target.closest('.garage-rows>.garage-row'))e.preventDefault();});
    screen.addEventListener('dragstart',e=>{if(e.target.closest&&e.target.closest('.garage-rows'))e.preventDefault();});
    window.addEventListener('hashchange',()=>end(false));}
  // 0.99 (Niklas): the Tankkaus widgets (0.102: also Raportit, data-w-grid) are ordered the same way: the same long press (0.45 s), the same 8 px of movement
  // that keeps it a scroll, the same lifted look, scrolling along at the top and bottom edges, and the release saves at
  // once. The widgets sit in a two-column grid (key figures one column, the rest two), so the lifted widget changes
  // places with the widget under the finger and the others slide to their new places (measured before and after, FLIP).
  // The order is a view setting (flPrefs().w); the fill-ups are not touched. A tap on a card's icon opens its settings;
  // after a long press the release is not a tap, so the settings do not open.
  {let timer=0,drag=null,ptr=null,blockClick=0;const HOLD=450,MOVE=8;
    const items=g=>[...g.children].filter(x=>x.classList.contains('fv-w'));
    const boxes=g=>new Map(items(g).map(x=>[x,{x:x.offsetLeft,y:x.offsetTop,w:x.offsetWidth,h:x.offsetHeight}]));
    const end=save=>{clearTimeout(timer);timer=0;if(!drag)return;const d=drag;drag=null;cancelAnimationFrame(d.raf);
      d.grid.classList.remove('sorting');items(d.grid).forEach(r=>{r.style.transform='';r.style.transition='';r.classList.remove('dragging');});
      try{d.w.releasePointerCapture(d.pid);}catch(e){}blockClick=performance.now();
      const ord=items(d.grid).map(x=>x.dataset.fw);if(save&&ord.join()!==d.from)(d.grid.dataset.wGrid==='reports'?rpSaveOrder:flSaveOrder)(ord);};
    // The lifted widget follows the finger from its own place in the grid; the grid is zoomed on wider phones (z).
    const follow=()=>{const d=drag,b=boxes(d.grid).get(d.w),gr=d.grid.getBoundingClientRect(),z=gr.width/d.grid.offsetWidth||1;
      d.w.style.transform=`translate(${(ptr.x-gr.left)/z-d.gx-b.x}px,${(ptr.y-gr.top)/z-d.gy-b.y}px) scale(1.02)`;return {gr,z};};
    const place=()=>{const d=drag;if(!d)return;const {gr,z}=follow(),px=(ptr.x-gr.left)/z,py=(ptr.y-gr.top)/z,bx=boxes(d.grid),list=items(d.grid);
      // The widget under the finger; the gaps between widgets (10 px) count to the nearest one.
      let hit=null,best=7;for(const [x,b] of bx){if(x===d.w)continue;const dd=Math.hypot(Math.max(b.x-px,0,px-b.x-b.w),Math.max(b.y-py,0,py-b.y-b.h));if(dd<best){best=dd;hit=x;}}
      if(!hit){const last=list[list.length-1],lb=bx.get(last);if(last!==d.w&&py>lb.y+lb.h)hit=last;else{const first=list[0],fb=bx.get(first);if(first!==d.w&&py<fb.y)hit=first;}}
      if(!hit)return;const i=list.indexOf(d.w),j=list.indexOf(hit),hb=bx.get(hit),wb=bx.get(d.w),row=hb.y===wb.y;
      // Only past the middle of the widget under the finger (across in the same row, otherwise up or down), so a
      // widget does not jump back and forth at the edge.
      if((j>i?(row?px<hb.x+hb.w/2:py<hb.y+hb.h/2):(row?px>hb.x+hb.w/2:py>hb.y+hb.h/2)))return;
      // Move in the DOM, then let every other widget slide from where it was to its new place.
      d.grid.insertBefore(d.w,j>i?hit.nextSibling:hit);const after=boxes(d.grid);
      for(const [x,b] of bx){if(x===d.w)continue;const a=after.get(x),dx=b.x-a.x,dy=b.y-a.y;if(!dx&&!dy)continue;x.style.transition='none';x.style.transform=`translate(${dx}px,${dy}px)`;x.getBoundingClientRect();x.style.transition='';x.style.transform='';}
      follow();};
    const tick=()=>{const d=drag;if(!d)return;const r=screen.getBoundingClientRect(),dock=screen.querySelector('.tab-dock'),bottom=dock?dock.getBoundingClientRect().top:r.bottom;
      const v=ptr.y<r.top+70?-Math.ceil((r.top+70-ptr.y)/6):ptr.y>bottom-50?Math.ceil((ptr.y-bottom+50)/6):0;if(v){const y0=screen.scrollTop;screen.scrollTop+=v;if(screen.scrollTop!==y0)place();}d.raf=requestAnimationFrame(tick);};
    const start=(w,e)=>{const grid=w.parentElement;if(items(grid).length<2||!w.isConnected)return;const gr=grid.getBoundingClientRect(),z=gr.width/grid.offsetWidth||1,b=boxes(grid).get(w);
      drag={w,grid,from:items(grid).map(x=>x.dataset.fw).join(),pid:e.pointerId,gx:(e.clientX-gr.left)/z-b.x,gy:(e.clientY-gr.top)/z-b.y,raf:0};
      try{w.setPointerCapture(e.pointerId);}catch(err){}grid.classList.add('sorting');w.classList.add('dragging');
      // A short buzz where the phone supports it (Android); iPhone's Safari has no vibration for web pages.
      try{navigator.vibrate&&navigator.vibrate(12);}catch(err){}place();drag.raf=requestAnimationFrame(tick);};
    screen.addEventListener('pointerdown',e=>{if(drag||e.button>0||!e.isPrimary)return;const w=e.target.closest('[data-w-grid]>.fv-w');if(!w||document.querySelector('.sheet-layer'))return;
      ptr={x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY};const ev={pointerId:e.pointerId,clientX:e.clientX,clientY:e.clientY};clearTimeout(timer);timer=setTimeout(()=>{timer=0;ev.clientX=ptr.x;ev.clientY=ptr.y;start(w,ev);},HOLD);});
    screen.addEventListener('pointermove',e=>{if(!ptr)return;ptr.x=e.clientX;ptr.y=e.clientY;if(timer&&Math.hypot(ptr.x-ptr.x0,ptr.y-ptr.y0)>MOVE){clearTimeout(timer);timer=0;}if(drag){e.preventDefault();place();}});
    screen.addEventListener('pointerup',()=>{end(true);ptr=null;});
    screen.addEventListener('pointercancel',()=>{end(false);ptr=null;});
    screen.addEventListener('touchmove',e=>{if(drag)e.preventDefault();},{passive:false});
    screen.addEventListener('click',e=>{if(blockClick&&performance.now()-blockClick<400&&e.target.closest('[data-w-grid]')){e.preventDefault();e.stopPropagation();}},true);
    screen.addEventListener('contextmenu',e=>{if(e.target.closest('[data-w-grid]>.fv-w'))e.preventDefault();});
    screen.addEventListener('dragstart',e=>{if(e.target.closest&&e.target.closest('[data-w-grid]'))e.preventDefault();});
    window.addEventListener('hashchange',()=>end(false));}
  screen.addEventListener('click',event=>{const k=event.target.closest('.kind-card[data-kind]');if(!k)return;const id=k.dataset.kind;if(id==='car')carPicked=true;else draft={kind:id,step:'details',brand:'',brandText:'',model:'',name:'',plate:'',nick:'',year:'',km:'',fuel:'',engine:'',body:Kinds.types(id)[0],color:'#b9c1ca'};render();screen.scrollTop=0;});
  screen.addEventListener('change',event=>{if(event.target.matches('#kind-form [name=brand]'))kindBrand(event.target);const kf=event.target.closest('#kind-form');if(kf)syncKind(kf);const kl=event.target.closest('#klook-form');if(kl&&draft&&draft.kind)syncKindLook(kl);});
  screen.addEventListener('input',event=>{const kf=event.target.closest('#kind-form');if(kf)syncKind(kf);});
  screen.addEventListener('submit',event=>{const handler=submitters[event.target.id];if(!handler)return;event.preventDefault();handler(event.target);});
  screen.addEventListener('input',event=>{if(event.target.matches('[data-make-search]'))showMatches(event.target);});
  screen.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('[data-make-search]')){event.preventDefault();const first=event.target.parentElement.querySelector('[data-pick-brand]');if(first)first.click();return;}
    // The phone keyboard's Enter/Go key must not jump to the look step before fuel is chosen: it moves to the next field instead; only Jatka continues.
    if(event.key==='Enter'&&event.target.matches('#car-form input,#kind-form input,#event-form input,#caredit-form input,#me-form input,#memo-form input,#owner-form input')&&event.target.type!=='checkbox'){event.preventDefault();const fields=[...event.target.form.querySelectorAll('input:not([type=hidden]):not([disabled]),select:not([disabled])')].filter(f=>f.offsetParent),next=fields[fields.indexOf(event.target)+1];if(next)next.focus();else event.target.blur();}});
  screen.addEventListener('click',event=>{const pick=event.target.closest('[data-pick-brand]');if(!pick||!draft)return;const form=pick.closest('form');syncDetails(form);draft.brand=pick.dataset.pickBrand;draft.model=pick.dataset.pickModel;draft.version='';draft.modelText='';draft.brandText='';
    const y=screen.scrollTop;render();screen.scrollTop=y;const next=document.querySelector(draft.model?'[name=version]:not([disabled])':'[name=model]');if(next)next.focus({preventScroll:true});});
  let notesTimer;
  screen.addEventListener('input',event=>{const n=event.target.closest('[data-notes]');if(n){const c=cars.find(c=>c.id===n.dataset.notes);if(c){c.notes=n.value.slice(0,5000);if(!c.notes)delete c.notes;clearTimeout(notesTimer);notesTimer=setTimeout(persist,400);}return;}});
  screen.addEventListener('input',event=>{const pl=event.target;if(pl.id==='plate-input'||(pl.name==='plate'&&pl.form)){const m=maskPlate(pl.value);if(m!==pl.value){pl.value=m;pl.setSelectionRange?.(m.length,m.length);}}if(event.target.id==='help-search'){const raw=event.target.value.trim().toLowerCase(),q=raw.length>5?raw.slice(0,raw.length-2):raw;let n=0;screen.querySelectorAll('.faq').forEach(d=>{const hit=!q||d.textContent.toLowerCase().includes(q);d.hidden=!hit;if(hit)n++;if(q&&hit)d.open=true;});document.getElementById('faq-empty').hidden=n>0;return;}if(event.target.closest('.parts-set')){const f=event.target.closest('#event-form');if(f)syncPartsTotal(f);}const look=event.target.closest('#look-form');if(look&&draft)syncLook(look);const carForm=event.target.closest('#car-form');if(carForm&&draft)syncDetails(carForm);const form=event.target.closest('#event-form');if(form&&form.dataset.confirmed){delete form.dataset.confirmed;form.querySelector('[type=submit]').textContent='Tallenna';document.getElementById('form-error').textContent='';}});
  // Swipe left/right on a main screen to move between the bottom tabs.
  const tabOrder=['home','fuel','reports','menu'];let touch=null;
  screen.addEventListener('touchstart',e=>{const t=e.touches[0];touch=e.touches.length===1&&!e.target.closest('input,select,textarea,.garage-strip,.secretary-vehicle,.check-grid,video,.report-table,.fl-cars,.fl-chart')?{x:t.clientX,y:t.clientY,at:Date.now()}:null;},{passive:true});
  screen.addEventListener('touchend',e=>{if(!touch)return;const t=e.changedTouches[0],dx=t.clientX-touch.x,dy=t.clientY-touch.y,fast=Date.now()-touch.at<600;touch=null;if(!fast||Math.abs(dx)<70||Math.abs(dx)<Math.abs(dy)*2)return;
    const v=route().view,cur=tabOrder.indexOf(tabOf(v));if(cur<0)return;const next=tabOrder[cur+(dx<0?1:-1)];if(!next)return;screen.dataset.swipe=dx<0?'left':'right';go(next);setTimeout(()=>delete screen.dataset.swipe,400);},{passive:true});
  function reset(){if(!confirm('Poistetaanko kaikki autot ja merkinnät?'))return;cars=[];profile={...defaultProfile};sequence=0;notice='';draft=null;lookup=null;window.AjouraCarPhoto?.clear();try{[storeKey,backupKey,sinceKey].forEach(k=>localStorage.removeItem(k));}catch(e){}idb.del(storeKey).catch(()=>{});if(window.AjouraSync)window.AjouraSync.forget();document.getElementById('demo-announcement').textContent='Kaikki tiedot poistettu.';go(installed?'welcome':'launcher');}
  screen.addEventListener('click',event=>{const kl=event.target.closest('[data-fl-kindlink]');if(kl){const o=flPrefs();o.k=kl.dataset.flKindlink;prefSet(flKey,flKeep(o));}const q=event.target.closest('[data-quickfuel]');if(q){const c=cars.find(c=>c.id===q.dataset.quickfuel);if(c){openSheet(c,q,null,q.dataset.kind);const mode=q.dataset.secretaryMode,l=glass.querySelector('.sheet-layer');
      if(mode&&l){l.dataset.secretaryMode=mode;const target={manual:'[data-ai-manual]',photo:'[data-ai-cam]',speech:'[data-ai-mic]'}[mode];if(target)l.querySelector(target)?.click();if(mode==='text')l.querySelector('#ai-say-in')?.focus();}}return;}const to=event.target.closest('[data-scroll-to]');if(to){const el=document.getElementById(to.dataset.scrollTo);if(el)el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:to.dataset.scrollBlock||'center'});}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&glass.querySelector('.sheet-layer'))closeSheet();});
  // 0.107: the Raportit ＋ menu (fab). A tap outside closes it before the tap is handled (capture).
  document.addEventListener('click',e=>{const m=screen.querySelector('#fab-menu');if(m&&!m.hidden&&!e.target.closest('#fab-menu,[data-fab-menu]'))fabMenu(false,false);},true);
  screen.addEventListener('click',e=>{const b=e.target.closest('[data-fab-menu]');if(b){fabMenu(b.getAttribute('aria-expanded')!=='true',e.detail===0);return;}const a=e.target.closest('[data-fab-act]');if(a)fabAct(a.dataset.fabAct,screen.querySelector('[data-fab-menu]'));});
  screen.addEventListener('keydown',e=>{const m=screen.querySelector('#fab-menu');if(!m||m.hidden)return;
    if(e.key==='Escape'){e.preventDefault();fabMenu(false,true);return;}
    const items=[...m.querySelectorAll('[role=menuitem]')],i=items.indexOf(document.activeElement);
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();items[(i+(e.key==='ArrowDown'?1:items.length-1))%items.length].focus();}
    else if(e.key==='Home'||e.key==='End'){e.preventDefault();items[e.key==='Home'?0:items.length-1].focus();}
    else if(e.key==='Tab'&&i>=0)fabMenu(false,false);});
  window.addEventListener('hashchange',closeSheet);
  screen.addEventListener('change',event=>{const a=event.target.closest('[data-ai-toggle]');if(a&&window.AjouraAccess)window.AjouraAccess.setAiEnabled(a.checked);});
  document.addEventListener('ajoura-access',paintAi);
  // 0.62: an open vehicle list (Raportit, Vertailu) closes with a tap outside it or with Escape. The check runs before
  // the tap is handled (capture), because a tap inside the list redraws the page and the old list is then gone.
  document.addEventListener('click',e=>{for(const d of document.querySelectorAll('details.fl-cmenu[open]'))if(!d.contains(e.target))d.open=false;},true);
  document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const d=document.querySelector('details.fl-cmenu[open]');if(d){d.open=false;d.querySelector('summary').focus();}});
  screen.addEventListener('click',event=>{if(route().view==='reports'&&reportsClick(event.target)&&event.target.closest('a[data-rp-open]'))event.preventDefault();});
  screen.addEventListener('click',event=>{if(route().view==='fuel')fuelClick(event.target);});
  screen.addEventListener('change',event=>{if(route().view==='fuel')fuelChange(event.target);});
  screen.addEventListener('change',event=>{if(route().view==='reports')reportsChange(event.target);});
  document.getElementById('reset-demo').addEventListener('click',reset);
  document.getElementById('home-button').addEventListener('click',()=>go('launcher'));
  screen.addEventListener('click',event=>{const t=event.target;if(t.closest('[data-login]')){loginNote=true;const y=screen.scrollTop;render();screen.scrollTop=y;return;}const thp=t.closest('[data-th-pick],[data-th-mode]');if(thp){const cur=themeSel||[look(),theme()];themeSel=thp.dataset.thMode?['nykyinen',thp.dataset.thMode]:[thp.dataset.thPick,thp.dataset.thPick==='nykyinen'&&cur[0]!=='nykyinen'?theme():cur[1]];themeDone='';const y=screen.scrollTop;render();screen.scrollTop=y;screen.querySelector('.th-opt.on [data-th-apply]')?.focus({preventScroll:true});return;}
    if(t.closest('[data-th-apply]')&&themeSel){prefSet('ajoura-ulkoasu',themeSel[0]);if(themeSel[0]==='nykyinen')prefSet('ajoura-theme',themeSel[1]);applyLook();themeDone=themeSel[0];const y=screen.scrollTop;render();screen.scrollTop=y;screen.querySelector('.th-opt.on .th-pick')?.focus({preventScroll:true});return;}
    const thf=t.closest('[data-th-full]');if(thf){themeFull(thf.dataset.thFull);return;}
    const po=t.closest('[data-plus-open]');if(po){plusSheet(po.dataset.plusOpen,po);return;}
    const pref=t.closest('[data-pref]');if(pref){const v=pref.dataset.value;if(pref.dataset.pref==='Teema')setTheme(v);else if(window.AjouraI18n)window.AjouraI18n.set(v);const y=screen.scrollTop;render();screen.scrollTop=y;return;}const icon=t.closest('[data-launch]');if(icon)launch(icon);if(t.closest('[data-reset]'))reset();const chip=t.closest('[data-plate]');if(chip)startLookup(chip.dataset.plate);const method=t.closest('[data-method]');if(method){if(method.dataset.method==='plate'){draft=null;lookup={plate:''};}else{draft={plate:lookup?.plate||'',name:'',year:'',body:'',fuel:'',color:'',source:'manual',step:'details'};lookup=null;}render();}
    const to=t.closest('[data-step-to]');if(to){const step=to.dataset.stepTo;if(step==='method'||step==='kind'){draft=null;lookup=null;if(step==='kind')carPicked=false;}else if(step==='plate'){lookup={plate:draft?.plate||''};draft=null;}else if(draft)draft.step=step;render();}
    if(t.closest('[data-add-part]')){const rows=screen.querySelector('.part-rows');if(rows&&rows.children.length<30){rows.insertAdjacentHTML('beforeend',partRow());rows.lastElementChild.querySelector('input').focus();}}
    if(t.closest('[data-print]'))window.print();const vp=t.closest('[data-vehicle-pdf]');if(vp)vehiclePdf(vp.dataset.vehiclePdf);const ep=t.closest('[data-event-pdf]');if(ep)eventPdf(ep.dataset.eventCar,ep.dataset.eventPdf);if(t.closest('[data-tutorial]'))tutorial();const tl=t.closest('[data-tl]');if(tl)filterTimeline(tl.dataset.tl);if(t.closest('[data-backup]'))backup();const ics=t.closest('[data-ics]');if(ics)calendar(ics.dataset.ics);const tr=t.closest('[data-transfer]');if(tr)transfer(tr.dataset.transfer);if(t.closest('[data-share-app]'))shareApp();const sl=t.closest('[data-sale]');if(sl)saleLink(sl.dataset.sale);
    const fr=t.closest('[data-fuel-remove]');if(fr)removeFill(fr.dataset.fuelRemove);const mv=t.closest('[data-memo-view]');if(mv){prefSet('ajoura-memo-view',mv.dataset.memoView);const y=screen.scrollTop;render();screen.scrollTop=y;return;}const me=t.closest('[data-memo-edit]');if(me){memoEdit=me.dataset.memoEdit;const y=screen.scrollTop;render();screen.scrollTop=y;screen.querySelector('#memo-edit-form textarea')?.focus({preventScroll:true});}if(t.closest('[data-memo-cancel]')){memoEdit='';const y=screen.scrollTop;render();screen.scrollTop=y;}const md=t.closest('[data-memo-del]');if(md)deleteMemo(md.dataset.memoDel);const cv=t.closest('[data-cover]');if(cv)setCover(cv);
    const de=t.closest('[data-delete-event]');if(de)deleteEvent(de.dataset.deleteEvent);
    const ar=t.closest('[data-att-remove]');if(ar)removeAtt(ar);const av=t.closest('[data-view-src]');if(av)viewAtt(av);
    const w=t.closest('[data-welcome]');if(w){welcomeStep=w.dataset.welcome;render();}if(t.closest('[data-start]'))startGuest();const pr=t.closest('[data-photo-remove]');if(pr)removePhoto(pr.dataset.photoRemove);
    if(t.closest('[data-sample]'))addSample();const remove=t.closest('[data-remove]');if(remove)removeCar(remove.dataset.remove);});
  document.querySelector('.skip-link').addEventListener('click',event=>{event.preventDefault();screen.focus();});
  window.addEventListener('hashchange',render);
  // Small bridge for roles.js (workshop and team views): read the garage and add a service sent by a workshop.
  // 0.76: the shared period and distance rules for the tests (testit/test_laskenta.py); they only read.
  window.AjouraCalc={kmIn,monthsIn,rpRange,rpPrev,covers};
  window.AjouraApp={version:appVersion,cars:()=>cars,refresh:()=>render(),notify:msg=>{notice=msg;},
    // For sync.js: the whole garage, and a merged garage coming back from the account (checked before it is used).
    state:()=>({cars,sequence,profile}),
    apply(next){const list=tidy(next&&next.cars);if(!Array.isArray(list)||!list.every(validCar)||!Number.isSafeInteger(next.sequence)||!validProfile(next.profile))return false;
      cars=list;sequence=Math.max(sequence,next.sequence);profile=noName(next.profile);applying=true;try{persist();}finally{applying=false;}const y=screen.scrollTop;render();screen.scrollTop=y;return true;},
    importService(d){let c=cars.find(x=>!x.sample&&isCar(x)&&x.plate===d.plate);if(c&&c.events.some(e=>e.ref===d.ref))return {car:c.id};
      if(!c){const year=d.year||Number(d.event.date.slice(0,4)),m=Models.parse(d.car),list=m.brand?Models.bodiesFor(m.brand,m.model,year):[];c={id:uid('new-car'),name:d.car||'Auto '+d.plate,plate:d.plate,year,km:d.event.km||0,body:list[0]||'sedan',color:'#b9c1ca',fuel:'',events:[]};if(!validCar(c))return null;cars.push(c);}
      const e=d.event,shop=[d.shop.name,d.shop.phone].filter(Boolean).join(', '),ev={id:uid('new'),ref:d.ref,type:e.type,date:e.date,km:e.km,cost:e.cost,note:(by=>[String(e.note||'').slice(0,by?299-by.length:300),by].filter(Boolean).join('\n'))(shop?'Tehnyt: '+shop:''),...(e.items.length?{items:e.items}:{}),...(e.parts.length?{parts:e.parts}:{}),...(e.labor?{labor:e.labor}:{}),...(e.other?{other:e.other}:{}),created:new Date().toISOString()};
      c.events.push(ev);if(!validCar(c)){c.events.pop();return null;}if(e.km!==null)c.km=Math.max(c.km,e.km);persist();return {car:c.id,event:ev.id};}};
  render();
  // localStorage is written on every save, so it is the newest copy unless it had to drop images (lite) or is missing.
  idb.get(storeKey).then(state=>{idbReady=true;idbWorks=true;
    if(state&&Array.isArray(state.cars)&&!state.cars.every(validCar))state={...state,cars:state.cars.filter(validCar)};
    const ok=state&&Array.isArray(tidy(state.cars))&&state.cars.every(validCar)&&Number.isSafeInteger(state.sequence)&&validProfile(state.profile);
    if(ok&&saved&&saved.lite&&saved.at&&state.at<saved.at){if(!touched){cars=withPics(cars,state.cars);persist();const y=screen.scrollTop;render();screen.scrollTop=y;}}
    else if(ok&&(!saved||saved.lite||(saved.at&&state.at>saved.at))){if(!touched||(saved&&saved.lite)){cars=state.cars;sequence=state.sequence;profile=noName(state.profile);const y=screen.scrollTop;render();screen.scrollTop=y;}}
    else if(saved&&!touched)idb.set(storeKey,{...saved,at:saved.at||Date.now()}).catch(()=>{idbWorks=false;});},()=>{idbReady=true;idbWorks=false;}).finally(()=>{if(window.AjouraSync)window.AjouraSync.start();});
  // Ask the browser not to clear AJOURA's storage when the device runs low on space (granted silently or not at all).
  if(navigator.storage&&navigator.storage.persist)navigator.storage.persisted().then(p=>p||navigator.storage.persist()).catch(()=>{});
  if((installed||compact)&&!sessionStorageGet('ajoura-intro')){const o=document.createElement('div');o.className='intro-overlay';o.innerHTML=introHtml('');document.body.appendChild(o);sessionStorageSet('ajoura-intro');const close=()=>{if(!o.isConnected)return;o.classList.add('done');setTimeout(()=>o.remove(),160);};o.addEventListener('click',close);runIntro(o.querySelector('.ai-intro'),()=>setTimeout(close,window.AjouraLaunch.duration()));}
  function sessionStorageGet(k){try{return sessionStorage.getItem(k);}catch(e){return null;}}
  function sessionStorageSet(k){try{sessionStorage.setItem(k,'1');}catch(e){}}
})();

window.AjouraCarPhoto?.ready.then(hasImages=>{if(!hasImages||document.querySelector('.sheet-layer'))return;const view=location.hash.split('/')[0];if(['#home','#vehicle','#car-order','#fuel','#reports'].includes(view))window.AjouraApp?.refresh();});
