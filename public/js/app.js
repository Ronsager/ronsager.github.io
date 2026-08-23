import { api, auth, ApiError } from './api.js';
import { fmt, fmtShort, fmtDuration, esc, el, toast, closeModal } from './util.js';
import { startTutorial } from './tutorial.js';
import { factionCrest } from './icons.js';
import { showChangelogPopup } from './changelog.js';

import * as overview from './views/overview.js';
import * as buildings from './views/buildings.js';
import * as research from './views/research.js';
import * as shipyard from './views/shipyard.js';
import * as defense from './views/defense.js';
import * as fleet from './views/fleet.js';
import * as galaxy from './views/galaxy.js';
import * as messages from './views/messages.js';
import * as chat from './views/chat.js';
import * as alliance from './views/alliance.js';
import * as highscore from './views/highscore.js';
import * as options from './views/options.js';
import * as admin from './views/admin.js';

/* ------------------------------------------------------------------ */
/* Zentraler Zustand                                                   */
/* ------------------------------------------------------------------ */

export const state = {
  user: null,
  planetId: null,
  data: null,        // Antwort von /api/game/state
  reference: null,   // statische Spieldaten
  serverOffset: 0,   // Serverzeit minus lokale Zeit
};

const VIEWS = {
  overview:  { label: 'Übersicht',       module: overview,  group: 'Imperium' },
  buildings: { label: 'Anlagen',         module: buildings, group: 'Imperium' },
  research:  { label: 'Forschung',       module: research,  group: 'Imperium' },
  shipyard:  { label: 'Sternenwerft',    module: shipyard,  group: 'Imperium' },
  defense:   { label: 'Verteidigung',    module: defense,   group: 'Imperium' },
  fleet:     { label: 'Flotte',          module: fleet,     group: 'Operationen' },
  galaxy:    { label: 'Galaxie',         module: galaxy,    group: 'Operationen' },
  messages:  { label: 'Nachrichten',     module: messages,  group: 'Operationen', badge: 'unread' },
  chat:      { label: 'Chat',            module: chat,      group: 'Gemeinschaft' },
  alliance:  { label: 'Flottenverband',  module: alliance,  group: 'Gemeinschaft' },
  highscore: { label: 'Rangliste',       module: highscore, group: 'Gemeinschaft' },
  options:   { label: 'Einstellungen',   module: options,   group: 'Gemeinschaft' },
  admin:     { label: 'Adminbereich',    module: admin,     group: 'Gemeinschaft', adminOnly: true },
};

export const currentView = () => (location.hash.replace('#', '').split('/')[0] || 'overview');
export const viewParam = () => location.hash.replace('#', '').split('/').slice(1).join('/');

/** Serverzeit (näherungsweise), damit Countdowns nicht von der lokalen Uhr abhängen. */
export const serverNow = () => Date.now() + state.serverOffset;



/** Versionsangabe in der Fußleiste. Vorabfassungen werden als BETA gekennzeichnet. */
function setVersion(version, build) {
  const node = document.getElementById('version-info');
  if (!node || !version) return;
  const isPre = /-(alpha|beta|rc)/i.test(version);
  node.innerHTML =
    (isPre ? `<span class="ver-tag">Beta</span> ` : '') +
    `v${esc(version)}` +
    (build ? ` <span class="build-id" title="Stand des geladenen Programmcodes">${esc(build)}</span>` : '');
  node.title = `Star Trek Conquest ${version}${build ? ' · Stand ' + build : ''}`;
}


/**
 * Vergleicht den Stand des geladenen Programmcodes mit dem des Servers.
 * Weichen sie ab, läuft im Browser noch eine ältere Fassung – meist, weil
 * zwischengespeicherte Dateien verwendet werden. Statt dass Änderungen
 * unerklärlich ausbleiben, erscheint ein Hinweis zum Neuladen.
 */
let standHinweisGezeigt = false;
function pruefeStand(serverBuild) {
  if (!serverBuild || standHinweisGezeigt) return;
  const geladen = document.querySelector('meta[name="stc-build"]')?.content;
  if (!geladen || geladen === serverBuild) return;

  standHinweisGezeigt = true;
  const leiste = el(`<div class="stale-banner">
    <span>Der Browser führt noch eine ältere Fassung aus
      (<b class="mono">${esc(geladen)}</b>, auf dem Server liegt <b class="mono">${esc(serverBuild)}</b>).
      Änderungen wirken erst nach dem Neuladen.</span>
    <button id="stale-reload">Jetzt neu laden</button>
  </div>`);
  document.body.appendChild(leiste);
  leiste.querySelector('#stale-reload').addEventListener('click', () => {
    // location.reload(true) ist überholt; ein Zeitstempel erzwingt frische Dateien
    location.href = location.pathname + '?frisch=' + Date.now() + location.hash;
  });
}

/* ------------------------------------------------------------------ */
/* Fraktionsdesign                                                     */
/* ------------------------------------------------------------------ */

/** Färbt die gesamte Oberfläche im Stil der Fraktion. */
export function applyFactionTheme(faction) {
  const known = ['federation', 'klingon', 'romulan', 'cardassian', 'ferengi'];
  const key = known.includes(faction) ? faction : 'federation';
  document.documentElement.dataset.faction = key;
  const crest = document.getElementById('auth-crest');
  if (crest) crest.innerHTML = factionCrest(key, 76);
}

/* ------------------------------------------------------------------ */
/* Anmeldung                                                           */
/* ------------------------------------------------------------------ */

const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app');

function showAuth() {
  authScreen.classList.add('active');
  appScreen.classList.remove('active');
}
function showApp() {
  authScreen.classList.remove('active');
  appScreen.classList.add('active');
}

function authAlert(message, kind = 'error') {
  document.getElementById('auth-alert').innerHTML = message
    ? `<div class="alert ${kind}">${esc(message)}</div>` : '';
}

async function initAuthScreen() {
  try {
    const cfg = await api.get('/auth/config');
    document.getElementById('motd').textContent = cfg.motd || '';
    if (cfg.version) {
      const pre = /-(alpha|beta|rc)/i.test(cfg.version);
      document.getElementById('auth-version').innerHTML =
        (pre ? '<span class="ver-tag">Beta</span> ' : '') + 'Version ' + esc(cfg.version) +
        (cfg.build ? ' <span class="build-id">' + esc(cfg.build) + '</span>' : '');
    }
    document.getElementById('faction-picker').innerHTML = cfg.factions
      .map(
        (f) => `<label class="faction-option">
          <input type="radio" name="faction" value="${esc(f.key)}">
          <span><span class="fname">${esc(f.name)}</span><br><span class="fdesc">${esc(f.description)}</span></span>
        </label>`
      )
      .join('');
    document.querySelectorAll('.faction-option').forEach((node) => {
      node.addEventListener('click', () => {
        document.querySelectorAll('.faction-option').forEach((n) => n.classList.remove('selected'));
        node.classList.add('selected');
        node.querySelector('input').checked = true;
        applyFactionTheme(node.querySelector('input').value);
        authAlert('');
      });
    });
    if (!cfg.registrationOpen) {
      document.getElementById('tab-register').disabled = true;
      document.getElementById('tab-register').title = 'Die Registrierung ist derzeit geschlossen.';
    }
  } catch {
    authAlert('Der Server ist nicht erreichbar.');
  }
}

document.getElementById('tab-login').addEventListener('click', () => {
  document.getElementById('tab-login').classList.add('active');
  document.getElementById('tab-register').classList.remove('active');
  document.getElementById('login-form').style.display = '';
  document.getElementById('register-form').style.display = 'none';
  authAlert('');
});
document.getElementById('tab-register').addEventListener('click', () => {
  document.getElementById('tab-register').classList.add('active');
  document.getElementById('tab-login').classList.remove('active');
  document.getElementById('register-form').style.display = '';
  document.getElementById('login-form').style.display = 'none';
  authAlert('');
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  try {
    const res = await api.post('/auth/login', {
      login: document.getElementById('login-name').value,
      password: document.getElementById('login-pass').value,
    });
    auth.token = res.token;
    await start();
  } catch (err) {
    authAlert(err.message);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');

  const chosen = document.querySelector('input[name=faction]:checked');
  if (!chosen) {
    authAlert('Bitte wählen Sie eine Fraktion aus. Die Wahl bestimmt Ihre Boni für das gesamte Spiel.');
    document.getElementById('faction-picker').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  btn.disabled = true;
  try {
    const res = await api.post('/auth/register', {
      username: document.getElementById('reg-name').value,
      email: document.getElementById('reg-email').value,
      password: document.getElementById('reg-pass').value,
      faction: chosen.value,
    });
    auth.token = res.token;
    toast(`Willkommen an Bord, ${res.user.username}!`, 'success');
    await start();
    startTutorial();
  } catch (err) {
    authAlert(err.message);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  try { await api.post('/auth/logout'); } catch { /* egal */ }
  auth.token = null;
  state.user = null;
  location.hash = '';
  applyFactionTheme('federation');
  showAuth();
});

window.addEventListener('stc:unauthorized', () => {
  state.user = null;
  showAuth();
  authAlert('Die Sitzung ist abgelaufen. Bitte erneut anmelden.');
});

/* ------------------------------------------------------------------ */
/* Kopfleiste und Navigation                                           */
/* ------------------------------------------------------------------ */

function renderSidebar() {
  const nav = document.getElementById('sidebar');
  const view = currentView();
  const groups = {};
  for (const [key, def] of Object.entries(VIEWS)) {
    if (def.adminOnly && state.user?.role !== 'admin') continue;
    (groups[def.group] ||= []).push([key, def]);
  }

  nav.innerHTML = Object.entries(groups)
    .map(
      ([group, entries]) =>
        `<div class="group-label">${esc(group)}</div>` +
        entries
          .map(([key, def]) => {
            const badge = def.badge === 'unread' && state.data?.unread
              ? `<span class="badge">${state.data.unread}</span>` : '';
            return `<a href="#${key}" class="${key === view ? 'active' : ''} ${def.adminOnly ? 'admin' : ''}">
              <span>${esc(def.label)}</span>${badge}</a>`;
          })
          .join('')
    )
    .join('');
}

function renderResourceBar() {
  const bar = document.getElementById('resource-bar');
  const p = state.data?.planet;
  if (!p) { bar.innerHTML = ''; return; }

  const energyFree = p.production.energyProduced - p.production.energyNeeded;
  const resHtml = ['duranium', 'dilithium', 'deuterium']
    .map((res) => {
      const value = p.resources[res];
      const cap = p.capacity[res];
      const full = value >= cap;
      const label = { duranium: 'Duranium', dilithium: 'Dilithium', deuterium: 'Deuterium' }[res];
      return `<div class="res ${res}">
        <span class="label">${label}</span>
        <span class="value mono ${full ? 'full' : ''}" data-res="${res}">${fmt(value)}</span>
        <span class="rate">+${fmtShort(p.production[res])}/h · Lager ${fmtShort(cap)}</span>
      </div>`;
    })
    .join('');

  const planetSelect = state.data.planets
    .map((pl) => `<option value="${pl.id}" ${pl.id === p.id ? 'selected' : ''}>
      ${esc(pl.name)} [${pl.coords.q}:${pl.coords.s}:${pl.coords.p}]</option>`)
    .join('');

  bar.innerHTML = `${resHtml}
    <div class="res energy">
      <span class="label">Energie</span>
      <span class="value mono ${energyFree < 0 ? 'full' : ''}">${fmt(energyFree)}</span>
      <span class="rate ${energyFree < 0 ? 'negative' : ''}">${fmt(p.production.energyProduced)} / ${fmt(p.production.energyNeeded)}</span>
    </div>
    <div class="spacer" style="flex:1"></div>
    <select id="planet-select" style="width:auto;min-width:190px">${planetSelect}</select>`;

  document.getElementById('planet-select')?.addEventListener('change', (e) => {
    state.planetId = Number(e.target.value);
    localStorage.setItem('stc_planet', state.planetId);
    refresh(true);
  });
}

function renderHeader() {
  const u = state.data?.user;
  if (!u) return;
  const s = state.data.stats;
  document.getElementById('header-player').innerHTML =
    `<b>${esc(u.username)}</b> <span class="muted">· ${esc(u.factionName || '')} · ${fmt(s.points)} Punkte · Rang ${s.rank ?? '–'}</span>`;
}

setInterval(() => {
  const node = document.getElementById('server-time');
  if (node && state.user) node.textContent = new Date(serverNow()).toLocaleTimeString('de-DE');
}, 1000);

/**
 * Lokale Hochrechnung der Rohstoffanzeige zwischen zwei Serverabfragen,
 * damit die Zahlen flüssig laufen.
 */
setInterval(() => {
  const p = state.data?.planet;
  if (!p || !document.getElementById('resource-bar')) return;
  for (const res of ['duranium', 'dilithium', 'deuterium']) {
    const node = document.querySelector(`.res .value[data-res="${res}"]`);
    if (!node) continue;
    const perSecond = p.production[res] / 3600;
    // Über der Lagergrenze wird nichts mehr produziert, vorhandene Überschüsse
    // bleiben aber erhalten – genau wie in der Serverberechnung.
    if (p.resources[res] < p.capacity[res]) {
      p.resources[res] = Math.min(p.capacity[res], p.resources[res] + perSecond);
    }
    node.textContent = fmt(p.resources[res]);
    node.classList.toggle('full', p.resources[res] >= p.capacity[res]);
  }
}, 1000);

/* ------------------------------------------------------------------ */
/* Daten laden und Ansicht rendern                                     */
/* ------------------------------------------------------------------ */

let refreshing = false;

export async function refresh(rerender = false) {
  if (refreshing) return;
  refreshing = true;
  try {
    const query = state.planetId ? `?planetId=${state.planetId}` : '';
    const data = await api.get(`/game/state${query}`);
    state.data = data;
    state.user = data.user;
    state.planetId = data.planet.id;
    state.serverOffset = data.serverTime - Date.now();
    window.__stcUserId = data.user.id;   // für Ansichten, die eigene Beiträge erkennen müssen
    applyFactionTheme(data.user.faction);
    setVersion(data.version, data.build);
    pruefeStand(data.build);
    renderHeader();
    renderResourceBar();
    renderSidebar();
    if (rerender) await renderView();
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 401)) toast(err.message, 'error');
  } finally {
    refreshing = false;
  }
}

export async function renderView() {
  const key = currentView();
  const def = VIEWS[key] || VIEWS.overview;
  if (def.adminOnly && state.user?.role !== 'admin') {
    location.hash = 'overview';
    return;
  }
  // Den Container gegen eine frische Kopie tauschen, bevor die Ansicht neu
  // aufgebaut wird. Die Ansichten hängen ihre Klick-Behandlung an dieses
  // Element; ohne den Austausch bliebe die Behandlung jedes früheren Aufrufs
  // bestehen und ein einzelner Klick löste mehrfach aus – beim Bauen wären
  // dann mehrere Stufen statt einer in Auftrag gegangen.
  const stale = document.getElementById('view');
  const container = stale.cloneNode(false);
  stale.replaceWith(container);
  container.innerHTML = '<div class="loader">Daten werden abgerufen</div>';
  try {
    await def.module.render(container, { state, refresh, renderView, api });
  } catch (err) {
    container.innerHTML = `<div class="alert error">${esc(err.message)}</div>`;
  }
  renderSidebar();
}

window.addEventListener('hashchange', () => {
  closeModal();
  renderView();
});

async function start() {
  try {
    const me = await api.get('/auth/me');
    state.user = me.user;
  } catch {
    showAuth();
    initAuthScreen();
    return;
  }
  showApp();
  const stored = Number(localStorage.getItem('stc_planet'));
  if (stored) state.planetId = stored;
  if (!state.reference) {
    state.reference = await api.get('/game/reference');
    window.__stcRef = state.reference; // Nachschlagetabelle für Berichte
  }
  await refresh();
  if (!location.hash) location.hash = 'overview';
  await renderView();

  // Einführung für Konten, die sie noch nicht gesehen haben.
  // Das Änderungsprotokoll erscheint erst danach, damit sich beide nicht überlagern.
  if (state.data && state.data.tutorialSeen === false) {
    startTutorial(() => showChangelogPopup(state.data?.changelog));
  } else if (state.data?.changelog) {
    showChangelogPopup(state.data.changelog);
  }
}

// Regelmäßige Aktualisierung des Zustands (Multiplayer: Flottenankünfte, Nachrichten)
setInterval(() => { if (state.user) refresh(); }, 20000);

if (auth.token) start();
else { showAuth(); initAuthScreen(); }
