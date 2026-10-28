'use strict';
// Vehicle kinds other than cars: motorcycles, mopeds, microcars, ATVs, snowmobiles, boats, tractors and other
// motorised gear. Each kind has its own types (the "body" of a car), common makes and models, a unit for the
// meter (km or engine hours) and a drawn side view in the same 400×170 frame as car-render.js (facing right,
// standing on y ≈ 150). Cars keep using car-render.js, car-models.js and the model images.
(() => {
  const clamp = n => Math.max(0, Math.min(255, Math.round(n)));
  const rgb = h => { const v = parseInt(h.slice(1), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; };
  const mix = (a, b, t) => '#' + rgb(a).map((n, i) => clamp(n + (rgb(b)[i] - n) * t).toString(16).padStart(2, '0')).join('');
  const lum = h => { const [r, g, b] = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

  const KINDS = [
    { id: 'car', name: 'Auto', hint: 'Henkilö-, paketti-, maasto- tai asuntoauto', unit: 'km' },
    { id: 'mc', name: 'Moottoripyörä', hint: 'Katu-, matka-, custom- tai crossipyörä', unit: 'km', types: { street: 'Katupyörä', sport: 'Sport', custom: 'Custom', touring: 'Matkapyörä', adventure: 'Seikkailupyörä', cross: 'Cross / enduro' } },
    { id: 'moped', name: 'Mopo tai skootteri', hint: 'Myös kevytmoottoripyörä', unit: 'km', types: { scooter: 'Skootteri', moped: 'Mopo', light: 'Kevytmoottoripyörä' } },
    { id: 'microcar', name: 'Mopoauto', hint: 'Kevyt nelipyörä', unit: 'km', types: { hatchback: 'Mopoauto', pickup: 'Lava-mopoauto' } },
    { id: 'atv', name: 'Mönkijä', hint: 'Myös UTV ja side-by-side', unit: 'km', types: { atv: 'Mönkijä', utv: 'UTV / side-by-side' } },
    { id: 'sled', name: 'Moottorikelkka', hint: 'Retki-, työ- tai urheilukelkka', unit: 'km', types: { trail: 'Retkikelkka', utility: 'Työkelkka', mountain: 'Urheilu- ja vuorikelkka' } },
    { id: 'boat', name: 'Vene', hint: 'Moottori- ja purjeveneet, vesiskootterit', unit: 'h', types: { open: 'Avomoottorivene', cabin: 'Kajuuttavene', small: 'Pieni perämoottorivene', sail: 'Purjevene', jet: 'Vesiskootteri' } },
    { id: 'tractor', name: 'Traktori', hint: 'Myös pihatraktori ja ruohonleikkuri', unit: 'h', types: { farm: 'Traktori', garden: 'Pihatraktori' } },
    { id: 'other', name: 'Muu moottorilaite', hint: 'Esim. aggregaatti, perävaunu tai asuntovaunu', unit: 'h', types: { engine: 'Moottorilaite', trailer: 'Perävaunu / asuntovaunu' } }
  ];
  // Common makes and models in Finland; anything else can be typed in.
  const MAKES = {
    mc: {
      Honda: ['CB500F', 'CB650R', 'CBR500R', 'CBR600RR', 'CBR1000RR', 'NC750X', 'CRF1100L Africa Twin', 'Gold Wing', 'Rebel 500', 'Transalp', 'Hornet'],
      Yamaha: ['MT-07', 'MT-09', 'MT-10', 'YZF-R7', 'YZF-R1', 'Tracer 7', 'Tracer 9', 'Ténéré 700', 'XSR700', 'XSR900', 'XV950', 'FJR1300'],
      Kawasaki: ['Z650', 'Z900', 'Ninja 650', 'Ninja ZX-6R', 'Ninja ZX-10R', 'Versys 650', 'Versys 1000', 'Vulcan S', 'KLR650'],
      Suzuki: ['SV650', 'GSX-8S', 'GSX-S1000', 'GSX-R750', 'GSX-R1000', 'V-Strom 650', 'V-Strom 1050', 'Hayabusa', 'Bandit 650', 'Intruder'],
      BMW: ['R 1250 GS', 'R 1300 GS', 'R 1250 RT', 'F 750 GS', 'F 900 R', 'S 1000 RR', 'R nineT', 'G 310 R', 'K 1600 GT'],
      'Harley-Davidson': ['Sportster', 'Softail', 'Fat Boy', 'Street Bob', 'Road King', 'Street Glide', 'Electra Glide', 'Pan America'],
      KTM: ['390 Duke', '790 Duke', '890 Duke', '1290 Super Duke R', '390 Adventure', '890 Adventure', '1290 Super Adventure', 'EXC'],
      Ducati: ['Monster', 'Scrambler', 'Panigale V2', 'Panigale V4', 'Multistrada V4', 'Diavel', 'Hypermotard'],
      Triumph: ['Street Triple', 'Speed Triple', 'Trident 660', 'Bonneville', 'Tiger 900', 'Tiger 1200', 'Rocket 3'],
      Husqvarna: ['Svartpilen 401', 'Vitpilen 401', 'Norden 901', 'FE', 'TE'],
      'Royal Enfield': ['Classic 350', 'Meteor 350', 'Himalayan', 'Interceptor 650', 'Continental GT 650'],
      'Moto Guzzi': ['V7', 'V85 TT', 'Stelvio'], Aprilia: ['RS 660', 'Tuono V4', 'Tuareg 660'], 'MV Agusta': ['Brutale', 'F3']
    },
    moped: {
      Yamaha: ['Aerox', "Neo's", 'Jog', 'DT50', 'TZR50'], Piaggio: ['Zip', 'Liberty', 'Typhoon', 'Medley'], Vespa: ['Primavera', 'Sprint', 'GTS', 'LX'],
      Derbi: ['Senda', 'GPR'], Peugeot: ['Kisbee', 'Speedfight', 'Tweet', 'Django'], Honda: ['Vision', 'PCX 125', 'SH125', 'Monkey', 'MSX 125'],
      Aprilia: ['SR 50', 'SX 50', 'RX 50', 'RS 125'], Rieju: ['MRT 50', 'RS3', 'Marathon'], Beta: ['RR 50', 'RR 125'], Sherco: ['SE-R 50', 'SM-R 50'],
      Kymco: ['Agility', 'Super 8', 'Like'], 'Suzuki': ['PV', 'Address'], Tunturi: ['Super Sport', 'Pappa-Tunturi', 'Tunturi Sport'], Solifer: ['Speed', 'Export'],
      KTM: ['125 Duke', '125 SMC R'], Kawasaki: ['Ninja 125', 'Z125']
    },
    microcar: {
      Aixam: ['City', 'Coupé', 'Crossover', 'Crossline', 'e-City', 'D-Truck'], Ligier: ['JS50', 'JS60', 'Myli'], Microcar: ['M.Go', 'Dué', 'M8'],
      Chatenet: ['CH40', 'CH46'], JDM: ['Roxsy', 'Xheos'], Bellier: ['Opale', 'Jade'], Citroën: ['Ami'], Opel: ['Rocks-e'], Renault: ['Twizy']
    },
    atv: {
      'Can-Am': ['Outlander', 'Renegade', 'Defender', 'Maverick', 'Commander'], Polaris: ['Sportsman', 'Scrambler', 'Ranger', 'RZR', 'General'],
      CFMOTO: ['CForce 450', 'CForce 520', 'CForce 625', 'CForce 850', 'CForce 1000', 'UForce 600', 'UForce 1000', 'ZForce'],
      Yamaha: ['Grizzly', 'Kodiak', 'Wolverine'], Honda: ['TRX Foreman', 'TRX Rancher', 'TRX Rubicon', 'Pioneer'], Suzuki: ['KingQuad'],
      Kawasaki: ['Brute Force', 'Mule', 'Teryx'], 'Arctic Cat': ['Alterra', 'Prowler'], Segway: ['Snarler', 'Fugleman'], TGB: ['Blade'], Linhai: ['M565', 'T-Boss'], Access: ['Shade Xtreme']
    },
    sled: {
      Lynx: ['Rave', 'Commander', 'Xtrim', 'Adventure', '49 Ranger', '59 Ranger', 'Boondocker', 'Shredder'], 'Ski-Doo': ['MXZ', 'Renegade', 'Summit', 'Expedition', 'Skandic', 'Tundra', 'Grand Touring', 'Backcountry'],
      Polaris: ['Indy', 'Switchback', 'RMK', 'Titan', 'Voyageur'], 'Arctic Cat': ['ZR', 'Riot', 'M 8000', 'Bearcat', 'Norseman'], Yamaha: ['Sidewinder', 'VK540', 'Viking', 'Transporter', 'SRViper']
    },
    boat: {
      Buster: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Magnum', 'Super Magnum', 'Cabin', 'Phantom', 'SuperMagnum Pro'], Yamarin: ['46 SC', '56 BR', '59 DC', '63 BR', '63 DC', '68 DC', 'Cross 63', 'Cross 75'],
      Finnmaster: ['T6', 'T7', 'T8', 'Husky R6', 'Husky R7', 'Pilot 8'], Terhi: ['385', '410', '450 C', '475 BR', 'Nordic 6020'], Bella: ['500', '600', '620 DC', '700', '7700'],
      Silver: ['Fox', 'Hawk', 'Eagle', 'Shark', 'Raptor', 'Condor'], XO: ['240', '270', '270 RS', '300'], Faster: ['395', '485', '540'], Flipper: ['600 DC', '640 DC', '670 ST', '900 ST'],
      Kimple: ['Cruiser', 'Hunter'], Quicksilver: ['Activ 455', 'Activ 555', 'Activ 605', 'Activ 675'], AMT: ['160', '190', '210'], Grandezza: ['28 OC', '34 OC'], Askeladden: ['C61', 'P60'],
      'Sea-Doo': ['Spark', 'GTI', 'GTX', 'RXT', 'Wake'], Yamaha: ['WaveRunner VX', 'WaveRunner FX', 'EX'], Bavaria: ['C38', 'C42'], Beneteau: ['Oceanis 30.1', 'First 27'], Hallberg: ['Hallberg-Rassy 31'], Nauticat: ['331', '37']
    },
    tractor: {
      Valtra: ['A-sarja', 'N-sarja', 'T-sarja', 'G-sarja', 'Q-sarja'], 'John Deere': ['5M', '6M', '6R', '7R', 'X-sarja (piha)'], 'Massey Ferguson': ['5S', '6S', '7S', '35'],
      'New Holland': ['T5', 'T6', 'T7'], Zetor: ['Major', 'Proxima', 'Forterra'], Kubota: ['B-sarja', 'L-sarja', 'M-sarja'], Fendt: ['300 Vario', '700 Vario'], 'Case IH': ['Farmall', 'Puma'],
      Ferguson: ['TE20'], Belarus: ['MTZ-82'], Husqvarna: ['TC 138', 'TC 242', 'R 216', 'Automower'], Stiga: ['Estate', 'Park'], 'Cub Cadet': ['XT1', 'XT2']
    },
    other: { Honda: ['EU22i', 'EU32i'], Yamaha: ['EF2000iS'], Respo: ['Perävaunu'], Tiki: ['Perävaunu'], Brenderup: ['Perävaunu'], Hobby: ['Asuntovaunu'], Kabe: ['Asuntovaunu'], Solifer: ['Asuntovaunu'], Adria: ['Asuntovaunu'] }
  };

  const kind = id => KINDS.find(k => k.id === id) || KINDS[0];
  const types = id => Object.keys(kind(id).types || {});
  const typeName = (id, t) => (kind(id).types || {})[t] || '';
  const brands = id => Object.keys(MAKES[id] || {}).sort((a, b) => a.localeCompare(b, 'fi'));
  const models = (id, b) => (MAKES[id] || {})[b] || [];

  // ---- Drawings -------------------------------------------------------------------------------------
  let seq = 0;
  const wheel = (x, y, r, o = {}) => {
    const tyre = `<circle cx="${x}" cy="${y}" r="${r}" fill="#15191e"/>`;
    const tread = o.knobby ? Array.from({ length: 18 }, (_, i) => { const a = i * Math.PI / 9; return `<rect x="${(x + Math.cos(a) * (r - 1) - 2).toFixed(1)}" y="${(y + Math.sin(a) * (r - 1) - 2).toFixed(1)}" width="4" height="4" rx="1" fill="#0b0e11" transform="rotate(${(a * 180 / Math.PI).toFixed(0)} ${(x + Math.cos(a) * (r - 1)).toFixed(1)} ${(y + Math.sin(a) * (r - 1)).toFixed(1)})"/>`; }).join('') : '';
    const rr = r * (o.rim || 0.66);
    const spokes = o.spokes ? Array.from({ length: o.spokes }, (_, i) => { const a = i * Math.PI * 2 / o.spokes; return `<path d="M${x} ${y}L${(x + Math.cos(a) * rr).toFixed(1)} ${(y + Math.sin(a) * rr).toFixed(1)}" stroke="#c9d1d9" stroke-width="${o.spokes > 12 ? .8 : 2.2}"/>`; }).join('') : '';
    return `${tyre}${tread}<circle cx="${x}" cy="${y}" r="${rr.toFixed(1)}" fill="${o.spokes ? '#3a434d' : '#c3ccd5'}" stroke="#8d99a6" stroke-width="1.2"/>${spokes}<circle cx="${x}" cy="${y}" r="${(r * 0.16).toFixed(1)}" fill="#e6ebf0" stroke="#7d8996" stroke-width="1"/>`;
  };
  const shadow = (id, cx, rx) => `<ellipse cx="${cx}" cy="152" rx="${rx}" ry="8" fill="url(#vsh${id})"/>`;
  const defs = (id, c) => {
    const light = mix(c, '#ffffff', lum(c) < 0.3 ? 0.35 : 0.25), dark = mix(c, '#000000', 0.25);
    return `<defs><linearGradient id="vp${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset=".45" stop-color="${c}"/><stop offset="1" stop-color="${dark}"/></linearGradient>` +
      `<linearGradient id="vg${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fa5ba" stop-opacity=".85"/><stop offset="1" stop-color="#3d5064" stop-opacity=".9"/></linearGradient>` +
      `<linearGradient id="vw${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe0f2"/><stop offset="1" stop-color="#7fb4d6"/></linearGradient>` +
      `<radialGradient id="vsh${id}"><stop offset="0" stop-color="#0d1b2a" stop-opacity=".3"/><stop offset="1" stop-color="#0d1b2a" stop-opacity="0"/></radialGradient></defs>`;
  };
  const ink = '#1d2833', metal = '#9aa6b2', dark = '#262e37';

  function motorcycle(id, t, P) {
    const cross = t === 'cross', custom = t === 'custom', sport = t === 'sport', tour = t === 'touring', adv = t === 'adventure';
    const r = cross ? 33 : 30, rx = custom ? 96 : 108, fx = custom ? 308 : 292, wy = 150 - r;
    const sp = { spokes: cross || adv || custom ? 18 : 5, rim: cross || adv ? .78 : .68, knobby: cross };
    let s = shadow(id, 200, 125) + wheel(rx, wy, r, sp) + wheel(fx, wy, r, sp);
    const head = custom ? [262, 52] : cross ? [262, 44] : adv ? [266, 40] : [268, 56];
    // Fork, swingarm, engine
    s += `<path d="M${fx} ${wy}L${head[0]} ${head[1]}" stroke="${metal}" stroke-width="${custom ? 4 : 6}" stroke-linecap="round"/>`;
    s += `<path d="M${rx} ${wy}L${200} ${wy - 6}" stroke="${dark}" stroke-width="7" stroke-linecap="round"/>`;
    s += cross ? `<path d="M178 ${wy - 22}h44v30h-40z" fill="#4a535d" stroke="${ink}" stroke-width="1.5"/>` : `<path d="M165 ${wy - 32}h62l8 26-14 18h-48l-10-20z" fill="#59636e" stroke="${ink}" stroke-width="1.5"/><path d="M172 ${wy - 24}h46M172 ${wy - 14}h50" stroke="#838e99" stroke-width="2"/>`;
    // Exhaust
    s += custom ? `<path d="M150 ${wy + 8}H60" stroke="#c9d1d9" stroke-width="7" stroke-linecap="round"/>` : cross ? `<path d="M190 ${wy - 18}Q150 ${wy - 30} 120 ${wy - 52}" stroke="#c9d1d9" stroke-width="6" fill="none" stroke-linecap="round"/>` : `<path d="M175 ${wy + 4}Q140 ${wy + 6} 118 ${wy - 14}" stroke="#c9d1d9" stroke-width="8" fill="none" stroke-linecap="round"/>`;
    // Panniers / top box
    if (tour || adv) s += `<rect x="${rx - 38}" y="${wy - 56}" width="46" height="36" rx="6" fill="${adv ? '#5c6670' : P}" stroke="${ink}" stroke-width="1.6"/>` + (tour ? `<rect x="${rx - 30}" y="${wy - 86}" width="40" height="28" rx="7" fill="${P}" stroke="${ink}" stroke-width="1.6"/>` : '');
    // Bodywork
    if (sport) s += `<path d="M150 ${wy - 52}L190 ${wy - 66}H240L282 ${wy - 92}Q300 ${wy - 70} 296 ${wy - 46}L268 ${wy - 10}H214L200 ${wy - 40}Z" fill="${P}" stroke="${ink}" stroke-width="1.8"/><path d="M272 ${wy - 88}L290 ${wy - 104}" stroke="url(#vg${id})" stroke-width="9" stroke-linecap="round"/><path d="M120 ${wy - 58}L170 ${wy - 54}L160 ${wy - 46}H118Z" fill="${P}" stroke="${ink}" stroke-width="1.6"/><path d="M150 ${wy - 56}H192" stroke="${dark}" stroke-width="7" stroke-linecap="round"/>`;
    else if (custom) s += `<path d="M178 ${wy - 50}Q205 ${wy - 74} 248 ${wy - 58}Q246 ${wy - 44} 226 ${wy - 40}H186Z" fill="${P}" stroke="${ink}" stroke-width="1.8"/><path d="M110 ${wy - 34}Q140 ${wy - 52} 182 ${wy - 46}" stroke="${dark}" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M${rx - 34} ${wy - 6}Q${rx - 30} ${wy - 40} ${rx + 10} ${wy - 36}L${rx + 22} ${wy - 26}" fill="none" stroke="${P}" stroke-width="9" stroke-linecap="round"/><path d="M256 ${head[1] - 6}Q262 ${head[1] - 26} 248 ${head[1] - 30}" stroke="${metal}" stroke-width="4" fill="none"/><circle cx="${head[0] + 14}" cy="${head[1] + 14}" r="9" fill="#e9eef3" stroke="${ink}" stroke-width="1.5"/>`;
    else if (cross) s += `<path d="M168 ${wy - 66}L246 ${wy - 74}L256 ${wy - 56}L208 ${wy - 40}Z" fill="${P}" stroke="${ink}" stroke-width="1.8"/><path d="M110 ${wy - 70}L176 ${wy - 70}" stroke="${dark}" stroke-width="8" stroke-linecap="round"/><path d="M88 ${wy - 66}Q110 ${wy - 74} 128 ${wy - 70}" stroke="${P}" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M${fx - 26} ${wy - 40}Q${fx} ${wy - 52} ${fx + 22} ${wy - 40}" stroke="${P}" stroke-width="7" fill="none" stroke-linecap="round"/><rect x="${head[0] - 2}" y="${head[1] + 8}" width="18" height="22" rx="4" fill="#f2f4f6" stroke="${ink}" stroke-width="1.5" transform="rotate(-25 ${head[0]} ${head[1]})"/>`;
    else s += `<path d="M178 ${wy - 56}Q208 ${wy - 76} 250 ${wy - 62}L244 ${wy - 40}H190Z" fill="${P}" stroke="${ink}" stroke-width="1.8"/><path d="M120 ${wy - 44}Q150 ${wy - 58} 186 ${wy - 52}" stroke="${dark}" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M96 ${wy - 52}L136 ${wy - 46}L130 ${wy - 38}H100Z" fill="${P}" stroke="${ink}" stroke-width="1.5"/>${adv ? `<path d="M262 ${head[1] + 4}L296 ${head[1] + 24}L270 ${head[1] + 34}Z" fill="${P}" stroke="${ink}" stroke-width="1.5"/><path d="M260 ${head[1]}L268 ${head[1] - 26}" stroke="url(#vg${id})" stroke-width="10" stroke-linecap="round"/>` : tour ? `<path d="M240 ${wy - 62}L290 ${wy - 70}L292 ${wy - 40}L250 ${wy - 34}Z" fill="${P}" stroke="${ink}" stroke-width="1.6"/><path d="M276 ${wy - 70}L282 ${wy - 104}" stroke="url(#vg${id})" stroke-width="12" stroke-linecap="round"/>` : `<circle cx="${head[0] + 12}" cy="${head[1] + 10}" r="9" fill="#e9eef3" stroke="${ink}" stroke-width="1.5"/>`}`;
    // Handlebar and front mudguard
    s += `<path d="M${head[0] - 8} ${head[1] - 4}L${head[0] - 22} ${head[1] - 10}" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`;
    if (!cross) s += `<path d="M${fx - 30} ${wy - 26}Q${fx} ${wy - 40} ${fx + 30} ${wy - 22}" stroke="${P}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    return s;
  }
  function moped(id, t, P) {
    if (t !== 'scooter') return motorcycle(id, t === 'light' ? 'street' : 'cross', P).replace(/r="3[03]"/g, m => m);
    const r = 21, rx = 128, fx = 286, wy = 150 - r;
    let s = shadow(id, 205, 110) + wheel(rx, wy, r, { rim: .6 }) + wheel(fx, wy, r, { rim: .6 });
    s += `<path d="M${fx} ${wy}L262 52" stroke="${metal}" stroke-width="6" stroke-linecap="round"/>`;
    s += `<path d="M92 ${wy - 22}Q86 ${wy - 66} 128 ${wy - 74}H196Q208 ${wy - 74} 206 ${wy - 52}L200 ${wy - 18}H232L248 ${wy - 12}L262 ${wy - 84}Q268 ${wy - 96} 280 ${wy - 92}L284 ${wy - 60}Q286 ${wy - 30} 268 ${wy - 6}H122Q100 ${wy - 6} 92 ${wy - 22}Z" fill="${P}" stroke="${ink}" stroke-width="1.8"/>`;
    s += `<path d="M112 ${wy - 74}Q150 ${wy - 92} 200 ${wy - 78}" stroke="${dark}" stroke-width="11" fill="none" stroke-linecap="round"/>`;
    s += `<path d="M258 46L280 40" stroke="${ink}" stroke-width="4" stroke-linecap="round"/><path d="M262 48Q276 40 290 50L286 58H264Z" fill="${P}" stroke="${ink}" stroke-width="1.5"/><circle cx="288" cy="${wy - 70}" r="6" fill="#e9eef3" stroke="${ink}" stroke-width="1.2"/>`;
    s += `<path d="M${fx - 24} ${wy - 22}Q${fx} ${wy - 34} ${fx + 22} ${wy - 18}" stroke="${P}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M96 ${wy - 40}h-10" stroke="#d64545" stroke-width="5" stroke-linecap="round"/>`;
    return s;
  }
  function atv(id, t, P) {
    const utv = t === 'utv', r = 27, rx = utv ? 96 : 112, fx = utv ? 304 : 288, wy = 150 - r;
    let s = shadow(id, 200, 132) + wheel(rx, wy, r, { knobby: true, rim: .55 }) + wheel(fx, wy, r, { knobby: true, rim: .55 });
    s += `<path d="M${rx} ${wy}L${fx} ${wy}" stroke="${dark}" stroke-width="6"/><rect x="${rx + 40}" y="${wy - 34}" width="${fx - rx - 80}" height="30" rx="5" fill="#535d68" stroke="${ink}" stroke-width="1.5"/>`;
    if (utv) {
      s += `<path d="M150 ${wy - 46}L162 ${wy - 108}H262L282 ${wy - 52}" fill="none" stroke="${dark}" stroke-width="6" stroke-linejoin="round"/><path d="M160 ${wy - 100}H262" stroke="${P}" stroke-width="8" stroke-linecap="round"/>`;
      s += `<path d="M64 ${wy - 22}L70 ${wy - 50}H150L156 ${wy - 22}Z" fill="${P}" stroke="${ink}" stroke-width="1.6"/><path d="M160 ${wy - 22}V${wy - 52}H250L262 ${wy - 22}Z" fill="url(#vp${id})" stroke="${ink}" stroke-width="1.6"/><path d="M172 ${wy - 52}Q170 ${wy - 82} 192 ${wy - 82}" stroke="${dark}" stroke-width="9" fill="none" stroke-linecap="round"/>`;
      s += `<path d="M262 ${wy - 22}L272 ${wy - 58}Q300 ${wy - 64} 334 ${wy - 46}L338 ${wy - 22}Z" fill="${P}" stroke="${ink}" stroke-width="1.6"/><rect x="316" y="${wy - 50}" width="16" height="8" rx="3" fill="#f2f6fa" stroke="${ink}"/>`;
    } else {
      s += `<path d="M70 ${wy - 18}Q74 ${wy - 50} 108 ${wy - 52}Q144 ${wy - 52} 152 ${wy - 22}Z" fill="${P}" stroke="${ink}" stroke-width="1.6"/><path d="M248 ${wy - 22}Q256 ${wy - 54} 290 ${wy - 54}Q326 ${wy - 52} 330 ${wy - 18}Z" fill="${P}" stroke="${ink}" stroke-width="1.6"/>`;
      s += `<path d="M150 ${wy - 40}H246L252 ${wy - 26}H146Z" fill="url(#vp${id})" stroke="${ink}" stroke-width="1.5"/><path d="M146 ${wy - 50}Q190 ${wy - 62} 232 ${wy - 52}" stroke="${dark}" stroke-width="12" fill="none" stroke-linecap="round"/>`;
      s += `<path d="M78 ${wy - 58}H138M84 ${wy - 58}V${wy - 50}M132 ${wy - 58}V${wy - 50}M262 ${wy - 62}H318" stroke="${dark}" stroke-width="4" stroke-linecap="round"/><path d="M240 ${wy - 54}L250 ${wy - 84}" stroke="${metal}" stroke-width="5"/><path d="M236 ${wy - 86}H262" stroke="${ink}" stroke-width="4" stroke-linecap="round"/><rect x="308" y="${wy - 48}" width="18" height="9" rx="3" fill="#f2f6fa" stroke="${ink}"/>`;
    }
    return s;
  }
  function sled(id, t, P) {
    const util = t === 'utility', mtn = t === 'mountain', rear = util ? 64 : mtn ? 80 : 92;
    let s = shadow(id, 205, 140);
    // Track and ski
    s += `<rect x="${rear}" y="122" width="${236 - rear}" height="28" rx="14" fill="#1a1f25"/>` + Array.from({ length: Math.floor((236 - rear) / 13) }, (_, i) => `<path d="M${rear + 8 + i * 13} 124v24" stroke="#38414b" stroke-width="3"/>`).join('') + `<circle cx="${rear + 14}" cy="136" r="9" fill="#5b6570"/><circle cx="222" cy="136" r="9" fill="#5b6570"/><circle cx="${(rear + 222) / 2}" cy="140" r="7" fill="#5b6570"/>`;
    s += `<path d="M262 148H338Q356 148 352 132" stroke="${ink}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M296 148V122" stroke="${metal}" stroke-width="6"/>`;
    // Body
    s += `<path d="M${rear - 8} 124Q${rear - 10} 104 ${rear + 10} 102H216L238 76Q262 62 300 80Q336 98 342 118L330 128H${rear}Z" fill="url(#vp${id})" stroke="${ink}" stroke-width="1.8"/>`;
    s += `<path d="M232 80L250 44Q262 40 266 50L256 80Z" fill="url(#vg${id})" stroke="${ink}" stroke-width="1.4"/><path d="M226 80L222 68H246" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    s += `<path d="M${rear + 6} 102Q${rear + 30} 88 214 92L222 102Z" fill="${dark}" stroke="${ink}" stroke-width="1.4"/><path d="M300 92L326 104" stroke="#f2f6fa" stroke-width="6" stroke-linecap="round"/><path d="M${rear + 40} 116H300" stroke="${mix(P, '#ffffff', .4)}" stroke-width="3" stroke-opacity=".7"/>`;
    if (util) s += `<path d="M${rear - 6} 98H${rear + 38}V92" stroke="${dark}" stroke-width="4" fill="none"/><rect x="${rear - 18}" y="112" width="12" height="12" rx="2" fill="${dark}"/>`;
    if (mtn) s += `<path d="M${rear + 8} 102L${rear - 4} 84" stroke="${ink}" stroke-width="3"/>`;
    return s;
  }
  function boat(id, t, P) {
    let s = `<rect x="0" y="132" width="400" height="38" fill="url(#vw${id})" opacity=".55"/><path d="M0 136Q20 130 40 136T80 136T120 136T160 136T200 136T240 136T280 136T320 136T360 136T400 136" stroke="#ffffff" stroke-width="2" fill="none" opacity=".8"/>`;
    if (t === 'jet') {
      s += `<path d="M110 118H300Q326 116 334 104L320 132Q300 142 250 142H122Q104 140 110 118Z" fill="url(#vp${id})" stroke="${ink}" stroke-width="1.8"/><path d="M130 118Q170 100 226 104L240 118Z" fill="${dark}" stroke="${ink}" stroke-width="1.4"/><path d="M236 104L258 86" stroke="${metal}" stroke-width="5"/><path d="M250 84H272" stroke="${ink}" stroke-width="4" stroke-linecap="round"/><path d="M118 132H320" stroke="#ffffff" stroke-width="2.5" opacity=".7"/>`;
      return s;
    }
    const small = t === 'small', sail = t === 'sail', x0 = small ? 110 : 64, x1 = small ? 300 : 346, deck = small ? 108 : 96;
    // Hull: raised bow on the right
    s += `<path d="M${x0} ${deck}H${x1 - 30}Q${x1 - 4} ${deck - 2} ${x1 + 6} ${deck - 12}L${x1 - 14} ${deck + 26}Q${x1 - 70} 144 ${x0 + 70} 144H${x0 + 6}Z" fill="url(#vp${id})" stroke="${ink}" stroke-width="1.8"/>`;
    s += `<path d="M${x0 + 4} ${deck + 8}H${x1 - 26}Q${x1 - 6} ${deck + 6} ${x1 + 2} ${deck - 4}" stroke="#ffffff" stroke-width="3" fill="none" opacity=".75"/>`;
    if (!sail) s += `<path d="M${x0 - 4} ${deck - 14}h-14v${small ? 34 : 44}h10l4 10h6v-54z" fill="#2f3842" stroke="${ink}" stroke-width="1.4"/><path d="M${x0 - 22} ${deck - 22}h22q6 0 6 8v6h-30z" fill="#3d4752" stroke="${ink}" stroke-width="1.4"/>`;
    if (t === 'cabin') s += `<path d="M150 ${deck}L162 58H252L282 ${deck}Z" fill="#f3f6f9" stroke="${ink}" stroke-width="1.6"/><path d="M172 64H226V86H166Z" fill="url(#vg${id})" stroke="${ink}" stroke-width="1.2"/><path d="M234 64H250L268 86H234Z" fill="url(#vg${id})" stroke="${ink}" stroke-width="1.2"/><path d="M150 56H258" stroke="${dark}" stroke-width="5" stroke-linecap="round"/>`;
    if (t === 'open') s += `<path d="M206 ${deck}L214 72H246L252 ${deck}Z" fill="#f3f6f9" stroke="${ink}" stroke-width="1.5"/><path d="M216 74L238 58" stroke="url(#vg${id})" stroke-width="8" stroke-linecap="round"/><path d="M140 ${deck - 8}H196" stroke="${dark}" stroke-width="9" stroke-linecap="round"/>`;
    if (small) s += `<path d="M150 ${deck - 6}H210M226 ${deck - 6}H262" stroke="${dark}" stroke-width="6" stroke-linecap="round"/>`;
    if (sail) s += `<path d="M206 ${deck}V8" stroke="${metal}" stroke-width="4"/><path d="M210 12L212 ${deck - 10}H300Z" fill="#fbfcfd" stroke="${ink}" stroke-width="1.4"/><path d="M202 18L118 ${deck - 10}H202Z" fill="#f2f5f8" stroke="${ink}" stroke-width="1.4"/><path d="M118 ${deck - 10}H206" stroke="${dark}" stroke-width="3"/>`;
    return s;
  }
  function tractor(id, t, P) {
    if (t === 'garden') {
      let s = shadow(id, 205, 120) + wheel(126, 124, 26, { rim: .55, knobby: true }) + wheel(296, 132, 18, { rim: .55 });
      s += `<path d="M150 136H290" stroke="#3d4650" stroke-width="10" stroke-linecap="round"/><path d="M200 112H322Q338 112 340 124L336 134H196Z" fill="url(#vp${id})" stroke="${ink}" stroke-width="1.6"/><path d="M100 104Q110 94 154 94L170 118H96Z" fill="${P}" stroke="${ink}" stroke-width="1.6"/>`;
      s += `<path d="M118 92Q114 70 136 72L150 94" fill="${dark}" stroke="${ink}" stroke-width="1.4"/><path d="M196 112L214 80" stroke="${metal}" stroke-width="4"/><ellipse cx="216" cy="78" rx="12" ry="4" fill="none" stroke="${ink}" stroke-width="3"/>`;
      return s;
    }
    let s = shadow(id, 205, 135) + wheel(128, 106, 44, { knobby: true, rim: .6 }) + wheel(304, 124, 26, { knobby: true, rim: .55 });
    s += `<path d="M166 116H312" stroke="#3a434d" stroke-width="12"/><path d="M178 78H322Q338 78 340 92L338 114H180Z" fill="url(#vp${id})" stroke="${ink}" stroke-width="1.8"/><path d="M322 84V108" stroke="${ink}" stroke-opacity=".5" stroke-width="2"/><path d="M190 90H300M190 100H300" stroke="${mix(P, '#000000', .3)}" stroke-width="1.6" opacity=".7"/>`;
    s += `<path d="M262 78V36" stroke="#3a434d" stroke-width="7" stroke-linecap="round"/><path d="M76 74Q86 50 128 50Q170 50 180 78" fill="${P}" stroke="${ink}" stroke-width="1.8"/>`;
    s += `<path d="M96 18H200L204 24V78H92V24Z" fill="url(#vg${id})" stroke="${ink}" stroke-width="1.8"/><path d="M92 14H206Q210 14 210 20H88Q88 14 92 14Z" fill="${P}" stroke="${ink}" stroke-width="1.6"/><path d="M150 24V78M98 30H198" stroke="${ink}" stroke-width="2.2" opacity=".75"/>`;
    return s;
  }
  function other(id, t, P) {
    if (t === 'trailer') {
      let s = shadow(id, 190, 120) + wheel(190, 128, 22, { rim: .6 });
      s += `<path d="M90 48Q90 36 104 36H276Q292 36 292 52V118H90Z" fill="url(#vp${id})" stroke="${ink}" stroke-width="1.8"/><rect x="120" y="58" width="56" height="30" rx="6" fill="url(#vg${id})" stroke="${ink}" stroke-width="1.4"/><rect x="214" y="56" width="40" height="58" rx="4" fill="${mix(P, '#000000', .1)}" stroke="${ink}" stroke-width="1.4"/><path d="M292 108H346" stroke="${dark}" stroke-width="6" stroke-linecap="round"/><circle cx="350" cy="108" r="6" fill="${dark}"/><path d="M330 112V146" stroke="${dark}" stroke-width="4"/>`;
      return s;
    }
    let s = shadow(id, 200, 100);
    s += `<path d="M120 146V74H280V146" fill="none" stroke="${dark}" stroke-width="7" stroke-linejoin="round"/><rect x="132" y="56" width="136" height="30" rx="10" fill="url(#vp${id})" stroke="${ink}" stroke-width="1.8"/><rect x="146" y="92" width="78" height="46" rx="6" fill="#59636e" stroke="${ink}" stroke-width="1.6"/><path d="M156 104H214M156 116H214M156 128H214" stroke="#838e99" stroke-width="2"/><circle cx="246" cy="114" r="14" fill="#3d4650" stroke="${ink}" stroke-width="1.5"/><circle cx="246" cy="114" r="5" fill="#9aa6b2"/>`;
    return s;
  }
  const DRAW = { mc: motorcycle, moped, atv, sled, boat, tractor, other };
  // One picture per type (0.23): white vehicle, background removed, file ajoneuvokuvat/<kind>-<type>.webp. Made with an
  // image generator from one reference sheet, so prototype quality. car-render.js tints it to the chosen colour like the
  // car model images; the drawing stays underneath as the fallback (offline before first view, file missing).
  // The sailboat has no picture yet (the generated one was cropped badly), so it keeps the drawing.
  const PICS = { mc: ['street', 'sport', 'custom', 'touring', 'adventure', 'cross'], moped: ['scooter', 'moped', 'light'], microcar: ['hatchback', 'pickup'],
    atv: ['atv', 'utv'], sled: ['trail', 'utility', 'mountain'], boat: ['open', 'cabin', 'small', 'jet'], tractor: ['farm', 'garden'], other: ['engine', 'trailer'] };
  const pic = (k, t) => (PICS[k] || []).includes(t) ? `ajoneuvokuvat/${k}-${t}.webp` : '';
  function render(kindId, t, color, label) {
    const C = window.AjouraCar, c = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#b9c1ca', tt = types(kindId).includes(t) ? t : types(kindId)[0];
    const url = C && C.photo ? pic(kindId, tt) : '', open = `<svg class="car-render kind-render" viewBox="0 0 400 170" role="img" aria-label="${label || 'Tyylitelty kuva'}" xmlns="http://www.w3.org/2000/svg">`;
    let own;
    // A microcar is a very short car: car-render.js draws it from microcar dimensions.
    if (kindId === 'microcar' && C) {
      own = C.render(tt === 'pickup' ? 'pickup' : 'hatchback', color, label, { size: 'a', dims: tt === 'pickup' ? [3.0, 1.55, 1.9] : [2.75, 1.52, 1.75] });
      if (!url) return own;
      own = own.replace('<svg class="car-render"', '<svg aria-hidden="true"');
    } else {
      const id = 'v' + (++seq), fn = DRAW[kindId] || other;
      own = defs(id, c) + fn(id, tt, `url(#vp${id})`);
      if (!url) return open + own + '</svg>';
    }
    // lo 190: mainly the white paint takes the colour; darker grey parts stay as they are (190 gave the most even paint).
    return open + `<g class="car-own" display="none">${own}</g>` + C.photo(url, c, { L: 0, WB: 0, fo: 0, wd: 0, lo: 190 }, [20, 10, 360, 142]) + '</svg>';
  }
  // A small icon for the kind picker: the first type's picture, white like the car on the Auto card.
  const icon = id => id === 'car' ? '' : render(id, types(id)[0], '#eef1f4', '');
  window.AjouraKinds = { list: KINDS, kind, types, typeName, brands, models, render, icon, unit: id => kind(id).unit };
})();
