<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>O'Donnell Moonshine Drinks</title>
<style>
:root {
  --bg: #12100e;
  --card: #1c1815;
  --amber: #e5a03b;
  --amber-light: #ffba59;
  --text: #f5efe6;
  --muted: #a89f91;
  --green: #38a169;
  --red: #e53e3e;
  --bdr: #383028;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  padding: 14px;
  padding-bottom: 50px;
}
h1 {
  color: var(--amber-light);
  font-size: 1.4rem;
  text-align: center;
  margin: 10px 0 4px;
}
.sub {
  color: var(--muted);
  font-size: 0.8rem;
  text-align: center;
  margin-bottom: 14px;
}
.panel {
  background: var(--card);
  border: 1px solid var(--bdr);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 14px;
}
.panel-h {
  font-size: 0.9rem;
  font-weight: bold;
  color: var(--amber-light);
  margin-bottom: 8px;
  display: flex;
  justify-content: space-between;
}
.btn-l {
  font-size: 0.75rem;
  color: var(--amber);
  background: none;
  border: none;
  text-decoration: underline;
  cursor: pointer;
}
.lbl {
  font-size: 0.7rem;
  color: var(--amber);
  text-transform: uppercase;
  margin: 8px 0 4px;
  font-weight: bold;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.chip {
  background: #25201b;
  border: 1px solid var(--bdr);
  color: var(--muted);
  padding: 6px 9px;
  border-radius: 6px;
  font-size: 0.75rem;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.chip.active {
  background: #8c5310;
  border-color: var(--amber-light);
  color: #fff;
  font-weight: bold;
}
.tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}
.tab {
  flex: 1;
  background: var(--card);
  border: 1px solid var(--bdr);
  color: var(--muted);
  padding: 8px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: bold;
  cursor: pointer;
  text-align: center;
}
.tab.active {
  background: var(--amber);
  color: #12100e;
  border-color: var(--amber-light);
}
.search {
  width: 100%;
  background: #25201b;
  border: 1px solid var(--bdr);
  padding: 8px 10px;
  border-radius: 6px;
  color: #fff;
  font-size: 0.85rem;
  margin-bottom: 12px;
  outline: none;
}
.card {
  background: var(--card);
  border: 1px solid var(--bdr);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
}
.card.ready { border-left: 4px solid var(--green); }
.card.almost { border-left: 4px solid var(--amber); }
.card.missing { border-left: 4px solid #4a3e35; opacity: 0.75; }
.badge {
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: bold;
  text-transform: uppercase;
  display: inline-block;
  margin-bottom: 4px;
}
.b-rdy { background: rgba(56,161,105,0.2); color: #48bb78; border: 1px solid #48bb78; }
.b-alm { background: rgba(229,160,59,0.2); color: var(--amber-light); border: 1px solid var(--amber); }
.b-mis { background: #25201b; color: var(--muted); }
.card-t { font-size: 1rem; margin-bottom: 2px; }
.glass { font-size: 0.7rem; color: var(--amber); margin-bottom: 6px; }
ul { list-style: none; margin: 6px 0; font-size: 0.8rem; }
li { padding: 2px 0; }
li.has { color: #d1fae5; }
li.has::before { content: "\2713 "; color: var(--green); font-weight: bold; }
li.miss { color: #fca5a5; }
li.miss::before { content: "\2715 "; color: var(--red); font-weight: bold; }
.inst {
  font-size: 0.75rem;
  color: var(--muted);
  background: #14110e;
  padding: 8px;
  border-radius: 5px;
  margin-top: 6px;
  line-height: 1.3;
}
</style>
</head>
<body>

<h1>O'DONNELL FINDER</h1>
<p class="sub">W&auml;hle deine Sorten &amp; Hauszutaten</p>

<div class="panel">
  <div class="panel-h">
    <span>1. Deine O'Donnell Sorten</span>
    <button class="btn-l" onclick="clrM()">Reset</button>
  </div>
  <div class="chips" id="m-chips"></div>

  <div class="panel-h" style="margin-top:12px">
    <span>2. Zutaten im Haus</span>
    <div>
      <button class="btn-l" onclick="setBasics()">Basics an</button> | 
      <button class="btn-l" onclick="clrI()">Reset</button>
    </div>
  </div>
  <div class="lbl">Filler &amp; Softdrinks</div>
  <div class="chips" id="f-chips"></div>
  
  <div class="lbl">S&auml;fte &amp; Frisches</div>
  <div class="chips" id="j-chips"></div>
  
  <div class="lbl">Sirup, Milch &amp; Gew&uuml;rze</div>
  <div class="chips" id="s-chips"></div>
  
  <div class="lbl">Spirituosen</div>
  <div class="chips" id="sp-chips"></div>
</div>

<div class="tabs">
  <button class="tab active" id="t-mix" onclick="setTab('mixable')">Machbar (<span id="c-ready">0</span>)</button>
  <button class="tab" id="t-alm" onclick="setTab('almost')">Fehlt 1 (<span id="c-almost">0</span>)</button>
  <button class="tab" id="t-all" onclick="setTab('all')">Alle (<span id="c-all">0</span>)</button>
</div>

<input type="text" class="search" id="search" placeholder="&#x1F50D; Drink oder Zutat suchen..." oninput="render()">

<div id="grid"></div>

<script>
const SORTS = [
  "Harte Nuss", "High Proof", "Wilde Beere", "Toffee", "Bratapfel",
  "Sauer", "Pralle Kirsche", "Passionsfrucht", "Blutorange",
  "Aperitivo", "Rhabarber Ros\u00e9", "Strawberry & Cream", "Cookies",
  "Kaffee", "Vodka"
];

const GROUPS = {
  f: ["Eisw\u00fcrfel", "Ginger Ale", "Ginger Beer", "Tonic Water", "Sprudelwasser", "Sekt / Prosecco", "Bitter Lemon", "Cola"],
  j: ["Zitronensaft", "Limettensaft", "Maracujasaft", "Apfelsaft", "Orangensaft", "Blutorangensaft", "Minze", "Basilikum", "Frischer Apfel", "Ingwer"],
  s: ["Zuckersirup", "Vanillesirup", "Sahne", "Milch", "Kokosmilch", "Espresso / Kaffee", "Zimt"],
  sp: ["Whiskey / Bourbon", "Brauner Rum", "Cognac", "Averna / Kr\u00e4uterlik\u00f6r", "Roter Wermut", "Creme de Cacao", "Angostura Bitters"]
};

const RECIPES = [
  {
    n: "Knallharte Nuss",
    g: "Tumbler",
    m: ["Harte Nuss", "High Proof"],
    i: ["Eisw\u00fcrfel"],
    a: ["20ml Harte Nuss", "20ml High Proof", "Eisw\u00fcrfel"],
    t: "Eis ins Glas geben, beide Sorten hinzuf\u00fcgen und kurz umr\u00fchren."
  },
  {
    n: "Ginger Nut",
    g: "Highball / Mason Jar",
    m: ["Harte Nuss"],
    i: ["Ginger Ale", "Eisw\u00fcrfel", "Minze", "Ingwer"],
    a: ["5cl Harte Nuss", "10cl Ginger Ale", "Eisw\u00fcrfel", "Minze", "Ingwerscheibe"],
    t: "Alles auf Eis eingie\u00dfen, leicht umr\u00fchren und garnieren."
  },
  {
    n: "Nut Smash",
    g: "Tumbler",
    m: ["Harte Nuss"],
    i: ["Brauner Rum", "Limettensaft", "Minze", "Eisw\u00fcrfel"],
    a: ["50ml Harte Nuss", "50ml Brauner Rum", "20ml Limettensaft", "Minze", "Eisw\u00fcrfel"],
    t: "Zutaten auf Eis verr\u00fchren, mit frischer Minze dekorieren."
  },
  {
    n: "Berry Collins",
    g: "Highball",
    m: ["Wilde Beere"],
    i: ["Limettensaft", "Zuckersirup", "Sprudelwasser", "Minze", "Eisw\u00fcrfel"],
    a: ["50ml Wilde Beere", "20ml Limettensaft", "10ml Zuckersirup", "Sprudelwasser", "Minze"],
    t: "Wilde Beere, Limette und Sirup auf Eis geben, mit Sprudelwasser toppen."
  },
  {
    n: "Passionsfrucht Spritz",
    g: "Weinglas",
    m: ["Passionsfrucht"],
    i: ["Sekt / Prosecco", "Zitronensaft", "Minze", "Eisw\u00fcrfel"],
    a: ["100ml Passionsfrucht", "1 TL Zitronensaft", "Sekt zum Auff\u00fcllen", "Minze"],
    t: "Eis, Passionsfrucht und Zitrone ins Glas, mit kaltem Sekt aufgie\u00dfen."
  },
  {
    n: "Blutorange Spritz",
    g: "Weinglas",
    m: ["Blutorange"],
    i: ["Sekt / Prosecco", "Blutorangensaft", "Sprudelwasser", "Eisw\u00fcrfel"],
    a: ["4cl Blutorange", "4cl Prosecco", "2cl Blutorangensaft", "6cl Sprudelwasser"],
    t: "Auf Eis aufbauen und sanft umr\u00fchren."
  },
  {
    n: "Spicy Bratapfel",
    g: "Mason Jar / Tumbler",
    m: ["Bratapfel"],
    i: ["Ginger Beer", "Frischer Apfel", "Eisw\u00fcrfel"],
    a: ["8cl Bratapfel", "12cl Ginger Beer", "Frische Apfelscheiben", "Eisw\u00fcrfel"],
    t: "Bratapfel mit Ginger Beer auf Eis aufgie\u00dfen und mit Apfelscheiben garnieren."
  },
  {
    n: "Dragon's Shot",
    g: "Shotglas",
    m: ["Bratapfel", "Toffee", "High Proof"],
    i: ["Sahne", "Zimt"],
    a: ["1cl Bratapfel", "1cl Toffee", "1cl High Proof", "1cl Sahne", "Zimt"],
    t: "Bratapfel einf\u00fcllen. Toffee und Sahne gesch\u00fcttelt dar\u00fcberschichten, High Proof on top."
  },
  {
    n: "Toffee Softee",
    g: "Tumbler",
    m: ["Toffee"],
    i: ["Whiskey / Bourbon", "Zitronensaft", "Sprudelwasser", "Angostura Bitters", "Eisw\u00fcrfel"],
    a: ["4cl Toffee", "3cl Whiskey", "2cl Zitronensaft", "4cl Sprudelwasser", "Angostura Bitters"],
    t: "Toffee, Whiskey und Zitrone shaken, ins Glas seihen und mit Sprudel toppen."
  },
  {
    n: "Espresso Martini",
    g: "Martini Glas",
    m: ["Kaffee", "Vodka"],
    i: ["Espresso / Kaffee", "Zuckersirup", "Eisw\u00fcrfel"],
    a: ["50ml Vodka", "30ml Kaffee", "30ml Espresso", "15ml Zuckersirup"],
    t: "Mit viel Eis sehr kr\u00e4ftig und schaumig shaken, dann abseihen."
  },
  {
    n: "Basil Smash",
    g: "Tumbler",
    m: ["High Proof"],
    i: ["Limettensaft", "Zuckersirup", "Basilikum", "Eisw\u00fcrfel"],
    a: ["6cl High Proof", "2cl Zuckersirup", "Limettensaft", "Basilikum"],
    t: "Basilikum mit Sirup zersto\u00dfen, High Proof und Eis dazu, kr\u00e4ftig shaken und doppelt abseihen."
  },
  {
    n: "Pornstar Moontini",
    g: "Coupette",
    m: ["High Proof", "Toffee", "Passionsfrucht"],
    i: ["Limettensaft", "Sekt / Prosecco", "Eisw\u00fcrfel"],
    a: ["25ml High Proof", "25ml Toffee", "25ml Passionsfrucht", "15ml Limettensaft", "Shot Sekt"],
    t: "Moonshines mit Limette auf Eis shaken, abseihen und einen Shot Sekt separat dazu servieren."
  }
];

let selM = new Set(JSON.parse(localStorage.getItem('om_safe') || '[]'));
let selI = new Set(JSON.parse(localStorage.getItem('oi_safe') || '["Eisw\\u00fcrfel"]'));
let tab = 'mixable';

function save() {
  localStorage.setItem('om_safe', JSON.stringify([...selM]));
  localStorage.setItem('oi_safe', JSON.stringify([...selI]));
}

function drawChips() {
  document.getElementById('m-chips').innerHTML = SORTS.map(s => 
    `<div class="chip ${selM.has(s) ? 'active' : ''}" onclick="togM('${s}')">&#x1F943; ${s}</div>`
  ).join('');
  
  for (let k in GROUPS) {
    document.getElementById(k + '-chips').innerHTML = GROUPS[k].map(i => 
      `<div class="chip ${selI.has(i) ? 'active' : ''}" onclick="togI('${i}')">${i}</div>`
    ).join('');
  }
}

function togM(s) {
  if (selM.has(s)) selM.delete(s); else selM.add(s);
  save(); drawChips(); render();
}

function togI(i) {
  if (selI.has(i)) selI.delete(i); else selI.add(i);
  save(); drawChips(); render();
}

function clrM() { selM.clear(); save(); drawChips(); render(); }
function clrI() { selI.clear(); save(); drawChips(); render(); }

function setBasics() {
  ["Eisw\u00fcrfel", "Zitronensaft", "Limettensaft", "Zuckersirup", "Sprudelwasser", "Ginger Ale"].forEach(b => selI.add(b));
  save(); drawChips(); render();
}

function setTab(t) {
  tab = t;
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.getElementById(t === 'mixable' ? 't-mix' : t === 'almost' ? 't-alm' : 't-all').classList.add('active');
  render();
}

function render() {
  let q = document.getElementById('search').value.toLowerCase();
  let cr = 0, ca = 0, all = 0;
  
  let list = RECIPES.map(r => {
    let mM = r.m.filter(x => !selM.has(x));
    let mI = r.i.filter(x => !selI.has(x));
    let tot = mM.length + mI.length;
    if (tot === 0) cr++;
    if (tot === 1) ca++;
    all++;
    return { ...r, mM, mI, tot, rdy: tot === 0, alm: tot === 1 };
  });

  document.getElementById('c-ready').innerText = cr;
  document.getElementById('c-almost').innerText = ca;
  document.getElementById('c-all').innerText = all;

  let f = list.filter(r => {
    if (q && !r.n.toLowerCase().includes(q) && !r.m.some(x => x.toLowerCase().includes(q)) && !r.i.some(x => x.toLowerCase().includes(q))) return false;
    if (tab === 'mixable') return r.rdy;
    if (tab === 'almost') return r.alm;
    return true;
  });

  f.sort((a, b) => a.tot - b.tot);
  
  let g = document.getElementById('grid');
  if (!f.length) {
    g.innerHTML = '<p style="text-align:center;color:var(--muted);padding:20px 0">Keine passenden Cocktails gefunden.</p>';
    return;
  }

  g.innerHTML = f.map(r => {
    let bCls = r.rdy ? 'b-rdy' : r.alm ? 'b-alm' : 'b-mis';
    let bTxt = r.rdy ? 'SOFORT MIXBAR' : r.alm ? `FEHLT 1: ${[...r.mM, ...r.mI][0]}` : `${r.tot} ZUTATEN FEHLEN`;
    let cardCls = r.rdy ? 'ready' : r.alm ? 'almost' : 'missing';
    
    let ingHtml = r.a.map(amt => {
      let has = r.m.some(m => amt.includes(m) && selM.has(m)) || r.i.some(i => amt.includes(i) && selI.has(i));
      return `<li class="${has ? 'has' : 'miss'}">${amt}</li>`;
    }).join('');

    return `
      <div class="card ${cardCls}">
        <span class="badge ${bCls}">${bTxt}</span>
        <h3 class="card-t">${r.n}</h3>
        <div class="glass">Glas: ${r.g}</div>
        <ul>${ingHtml}</ul>
        <div class="inst"><b>Zubereitung:</b> ${r.t}</div>
      </div>
    `;
  }).join('');
}

drawChips();
render();
</script>
</body>
</html>
