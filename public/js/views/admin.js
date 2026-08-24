import { api } from '../api.js';
import { fmt, fmtShort, fmtDate, fmtCoords, esc, toast, modal, closeModal } from '../util.js';
import { renderBody } from '../changelog.js';
import { viewParam } from '../app.js';

const TABS = [
  ['dashboard', 'Lagezentrum'], ['users', 'Benutzer'], ['fleets', 'Flotten'],
  ['broadcast', 'Rundspruch'], ['changelog', 'Changelog'], ['settings', 'Server'], ['log', 'Protokoll'],
];

let tab = 'dashboard';
let userPage = 0;
let userSearch = '';
let userSort = 'points';
let userRole = '';
let catalog = null;

export async function render(container, ctx) {
  if (!catalog) catalog = await api.get('/admin/catalog');

  // Direktsprung aus dem Chat: #admin/user/<id> öffnet die Benutzerverwaltung
  // und darin sofort das gewünschte Konto.
  const direkt = viewParam().match(/^user\/(\d+)$/);
  if (direkt) {
    tab = 'users';
    userSearch = '';
    userRole = '';
  }

  container.innerHTML = `
    <h1 style="margin-bottom:12px">Adminbereich <span class="small muted">Sternenflotten-Admiralität</span></h1>
    <div class="subtabs">
      ${TABS.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join('')}
    </div>
    <div id="admin-body"><div class="loader">Daten werden abgerufen</div></div>`;

  container.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => { tab = b.dataset.tab; render(container, ctx); })
  );

  const body = document.getElementById('admin-body');
  const views = { dashboard, users, fleets, broadcast, changelog, settings, log };
  await views[tab](body, ctx);

  if (direkt) {
    // Adressteil bereinigen, damit ein späteres Neuladen nicht erneut springt
    history.replaceState(null, '', '#admin');
    await openUser(Number(direkt[1]));
  }
}

/* ------------------------------------------------------------------ */

async function dashboard(body) {
  const d = await api.get('/admin/overview');
  body.innerHTML = `
    <div class="grid cols-4" style="margin-bottom:16px">
      <div class="stat-tile"><div class="stat-label">Kommandanten</div><div class="stat-value">${fmt(d.users.total)}</div>
        <div class="tiny muted">${d.users.online} online · ${d.users.week} diese Woche aktiv</div></div>
      <div class="stat-tile"><div class="stat-label">Planeten</div><div class="stat-value">${fmt(d.world.planets)}</div>
        <div class="tiny muted">${d.world.debrisFields} Trümmerfelder</div></div>
      <div class="stat-tile"><div class="stat-label">Flotten unterwegs</div><div class="stat-value">${fmt(d.world.fleets)}</div>
        <div class="tiny muted">${d.world.queue} Bauaufträge</div></div>
      <div class="stat-tile"><div class="stat-label">Gesperrt</div><div class="stat-value">${fmt(d.users.banned)}</div>
        <div class="tiny muted">${d.users.vacation} im Urlaub · ${d.users.admins} Admins</div></div>
    </div>

    <div class="grid cols-2">
      <div class="panel accent-orange">
        <h2>Rohstoffe im Universum</h2>
        <table>
          <tr><td class="muted">Duranium</td><td class="right mono">${fmtShort(d.world.resources.d)}</td></tr>
          <tr><td class="muted">Dilithium</td><td class="right mono">${fmtShort(d.world.resources.c)}</td></tr>
          <tr><td class="muted">Deuterium</td><td class="right mono">${fmtShort(d.world.resources.t)}</td></tr>
          <tr><td class="muted">Nachrichten</td><td class="right mono">${fmt(d.world.messages)}</td></tr>
          <tr><td class="muted">Flottenverbände</td><td class="right mono">${fmt(d.world.alliances)}</td></tr>
        </table>
        <button class="secondary small" id="recompute" style="margin-top:10px">Punkte neu berechnen</button>
      </div>

      <div class="panel accent-blue">
        <h2>Führende Kommandanten</h2>
        <table>${d.topPlayers.map((p, i) =>
          `<tr><td class="mono">${i + 1}</td><td><a href="#" data-user="${p.id}">${esc(p.username)}</a></td>
           <td class="right mono">${fmt(p.points)}</td></tr>`).join('')}</table>
      </div>

      <div class="panel accent-green">
        <h2>Neue Registrierungen</h2>
        <table>${d.recentUsers.map((u) =>
          `<tr><td><a href="#" data-user="${u.id}">${esc(u.username)}</a></td>
           <td class="tiny muted right">${fmtDate(u.created_at)}</td></tr>`).join('')}</table>
      </div>

      <div class="panel">
        <h2>Letzte Verwaltungsaktionen</h2>
        <table>${d.recentLog.map((l) =>
          `<tr><td class="tiny">${esc(l.admin_name)}</td><td class="tiny">${esc(l.action)}</td>
           <td class="tiny muted">${esc(l.target)}</td><td class="tiny muted right">${fmtDate(l.created_at)}</td></tr>`).join('')}
        </table>
      </div>
    </div>`;

  document.getElementById('recompute').addEventListener('click', async (e) => {
    e.target.disabled = true;
    const r = await api.post('/admin/recompute');
    toast(`Punkte für ${r.users} Kommandanten neu berechnet.`, 'success');
    e.target.disabled = false;
  });
  bindUserLinks(body);
}

/* ------------------------------------------------------------------ */

async function users(body) {
  const d = await api.get(`/admin/users?page=${userPage}&search=${encodeURIComponent(userSearch)}&sort=${userSort}&role=${userRole}`);
  body.innerHTML = `
    <div class="panel accent-orange">
      <div class="row" style="margin-bottom:10px">
        <input id="search" placeholder="Name oder E-Mail suchen…" value="${esc(userSearch)}" style="max-width:280px">
        <select id="sort" style="width:auto">
          ${[['points', 'Punkte'], ['username', 'Name'], ['created', 'Registrierung'], ['seen', 'Zuletzt online'], ['id', 'ID']]
            .map(([k, l]) => `<option value="${k}" ${k === userSort ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <select id="role-filter" style="width:auto">
          ${[['', 'Alle Rollen'], ['admin', 'nur Administratoren'], ['moderator', 'nur Moderatoren'], ['user', 'nur Spieler']]
            .map(([v, l]) => `<option value="${v}" ${v === userRole ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <button class="secondary small" id="do-search">Suchen</button>
        <span class="spacer" style="flex:1"></span>
        <span class="small muted">${d.total} Konten</span>
      </div>

      <div class="table-wrap"><table>
        <tr><th>ID</th><th>Kommandant</th><th>E-Mail</th><th>Rolle</th><th>Verband</th>
            <th class="right">Punkte</th><th class="right">Planeten</th><th>Zuletzt online</th><th></th></tr>
        ${d.users.map((u) => `<tr>
          <td class="mono tiny">${u.id}</td>
          <td><a href="#" data-user="${u.id}">${esc(u.username)}</a>
            ${u.banned ? '<span class="tag banned">gesperrt</span>' : ''}
            ${u.vacation_until > Date.now() ? '<span class="tag vacation">Urlaub</span>' : ''}</td>
          <td class="tiny muted">${esc(u.email)}</td>
          <td class="tiny ${u.role === 'admin' ? 'bad' : u.role === 'moderator' ? 'warn' : ''}">
            ${u.role === 'admin' ? 'Administrator' : u.role === 'moderator' ? 'Moderator' : 'Spieler'}</td>
          <td>${u.alliance_tag ? `<span class="tag">${esc(u.alliance_tag)}</span>` : ''}</td>
          <td class="right mono">${fmt(u.points)}</td>
          <td class="right mono">${u.planets}</td>
          <td class="tiny muted">${fmtDate(u.last_seen)}</td>
          <td class="right"><button class="secondary small" data-user="${u.id}">Verwalten</button></td>
        </tr>`).join('')}
      </table></div>

      ${d.pages > 1 ? `<div class="row" style="justify-content:center;margin-top:10px">
        <button class="secondary small" id="prev" ${userPage === 0 ? 'disabled' : ''}>◀</button>
        <span class="small muted">Seite ${userPage + 1} / ${d.pages}</span>
        <button class="secondary small" id="next" ${userPage + 1 >= d.pages ? 'disabled' : ''}>▶</button>
      </div>` : ''}
    </div>`;

  const search = () => {
    userSearch = document.getElementById('search').value;
    userSort = document.getElementById('sort').value;
    userRole = document.getElementById('role-filter').value;
    userPage = 0;
    users(body);
  };
  document.getElementById('do-search').addEventListener('click', search);
  document.getElementById('search').addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
  document.getElementById('sort').addEventListener('change', search);
  document.getElementById('role-filter').addEventListener('change', search);
  document.getElementById('prev')?.addEventListener('click', () => { userPage--; users(body); });
  document.getElementById('next')?.addEventListener('click', () => { userPage++; users(body); });
  bindUserLinks(body);
}

function bindUserLinks(scope) {
  scope.querySelectorAll('[data-user]').forEach((node) =>
    node.addEventListener('click', (e) => { e.preventDefault(); openUser(Number(node.dataset.user)); })
  );
}

/* ------------------------------------------------------------------ */
/* Benutzerdetail: Ressourcen, Gebäude, Schiffe, Forschung bearbeiten  */
/* ------------------------------------------------------------------ */

async function openUser(id) {
  const d = await api.get(`/admin/users/${id}`);
  const u = d.user;

  const planetTabs = d.planets.map((p, i) => `
    <div class="panel ${i === 0 ? 'accent-orange' : ''}" data-planet-panel="${p.id}">
      <div class="row between">
        <h2>${esc(p.name)} <span class="mono muted">${fmtCoords(p.coords)}</span>
          ${p.isHomeworld ? '<span class="tag">Heimatwelt</span>' : ''}</h2>
        <div class="row">
          <button class="secondary small" data-clear-queue="${p.id}">Warteschlange leeren</button>
          <button class="danger small" data-del-planet="${p.id}">Planet löschen</button>
        </div>
      </div>

      <h3 style="margin:10px 0 5px">Rohstoffe</h3>
      <div class="row">
        ${['duranium', 'dilithium', 'deuterium'].map((r) => `
          <div style="width:150px">
            <label>${r === 'duranium' ? 'Duranium' : r === 'dilithium' ? 'Dilithium' : 'Deuterium'}</label>
            <input type="number" data-res="${r}" data-pid="${p.id}" value="${p.resources[r]}">
          </div>`).join('')}
        <button class="small" data-save-res="${p.id}" style="align-self:flex-end">Setzen</button>
        <button class="secondary small" data-add-res="${p.id}" style="align-self:flex-end">Als Gutschrift addieren</button>
      </div>

      <h3 style="margin:14px 0 5px">Anlagen, Schiffe und Verteidigung</h3>
      <div class="row">
        <select data-kind="${p.id}" style="width:auto">
          <option value="building">Gebäude</option>
          <option value="ship">Schiff</option>
          <option value="defense">Verteidigung</option>
        </select>
        <select data-key="${p.id}" style="flex:1;min-width:200px"></select>
        <input type="number" data-value="${p.id}" value="0" style="width:110px">
        <button class="small" data-save-unit="${p.id}">Übernehmen</button>
      </div>

      <div class="grid cols-3" style="margin-top:12px">
        <div><h3>Gebäude</h3><table>${levelRows(p.buildings, catalog.buildings)}</table></div>
        <div><h3>Schiffe</h3><table>${levelRows(p.ships, catalog.ships)}</table></div>
        <div><h3>Verteidigung</h3><table>${levelRows(p.defenses, catalog.defenses)}</table></div>
      </div>
    </div>`).join('');

  const box = modal(`
    <div class="row between" style="margin-bottom:10px">
      <h2>${esc(u.username)} <span class="small muted">#${u.id}</span></h2>
      <button class="secondary small" id="close">Schließen</button>
    </div>

    <div class="panel accent-blue">
      <h2>Stammdaten</h2>
      <div class="grid cols-2">
        <div class="field"><label>Name</label><input id="f-username" value="${esc(u.username)}"></div>
        <div class="field"><label>E-Mail</label><input id="f-email" value="${esc(u.email)}"></div>
        <div class="field"><label>Rolle</label>
          <select id="f-role">
            <option value="user" ${u.role === 'user' ? 'selected' : ''}>Spieler</option>
            <option value="moderator" ${u.role === 'moderator' ? 'selected' : ''}>Moderator (Chat)</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrator</option>
          </select>
          <p class="tiny muted" style="margin-top:4px">
            Moderatoren dürfen Chatnachrichten entfernen und Spieler stummschalten,
            haben aber keinen Zugang zum Adminbereich.
          </p></div>
        <div class="field"><label>Fraktion</label>
          <select id="f-faction">${catalog.factions.map((f) =>
            `<option value="${f.key}" ${f.key === u.faction ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
          </select></div>
        <div class="field"><label>Sperre</label>
          <select id="f-banned">
            <option value="0" ${!u.banned ? 'selected' : ''}>aktiv</option>
            <option value="1" ${u.banned ? 'selected' : ''}>gesperrt</option>
          </select></div>
        <div class="field"><label>Sperrgrund</label><input id="f-reason" value="${esc(u.banReason || '')}"></div>
      </div>
      <div class="row">
        <button id="save-user">Speichern</button>
        <button class="secondary" id="reset-pw">Passwort zurücksetzen</button>
        <button class="secondary" id="send-msg">Nachricht senden</button>
        <button class="secondary" id="add-planet">Planet hinzufügen</button>
        <span class="spacer" style="flex:1"></span>
        <button class="danger" id="del-user">Konto löschen</button>
      </div>
      <p class="tiny muted" style="margin-top:8px">
        Punkte: ${fmt(d.stats.points)} (Rang ${d.stats.rank ?? '–'}) · Registriert ${fmtDate(u.createdAt)} ·
        Zuletzt online ${fmtDate(u.lastSeen)}
        ${d.alliance ? ` · Verband [${esc(d.alliance.tag)}] ${esc(d.alliance.name)} (${d.alliance.rank})` : ''}</p>
    </div>

    <div class="panel accent-orange">
      <h2>Punkte und Rang</h2>
      <p class="small">
        Aus dem Besitz berechnet: <b class="mono">${fmt(d.stats.computed)}</b> Punkte
        ${d.stats.manual
          ? `· derzeit fest auf <b class="mono warn">${fmt(d.stats.points)}</b> gesetzt`
          : '· keine manuelle Anpassung'}
      </p>
      <p class="tiny muted">
        Der Rang ergibt sich aus der Punktzahl. Setzen Sie einen Rang, errechnet der Server
        die passende Punktzahl dafür. Ein gesetzter Wert bleibt danach genau so stehen —
        auch wenn der Spieler weiterbaut — bis Sie ihn ändern oder die Anpassung entfernen.
        Haben mehrere Spieler dieselbe Punktzahl, passt zwischen sie kein weiterer Platz;
        welche Ränge dann belegbar sind, meldet der Server beim Setzen.
      </p>

      <div class="grid cols-2" style="margin-top:12px">
        <div>
          <label for="pts-points">Gesamtpunkte</label>
          <div class="row" style="gap:8px">
            <input type="number" id="pts-points" value="${d.stats.points}" min="0" style="flex:1">
            <button id="pts-save-points">Setzen</button>
          </div>
        </div>
        <div>
          <label for="pts-rank">Rang</label>
          <div class="row" style="gap:8px">
            <input type="number" id="pts-rank" value="${d.stats.rank ?? 1}" min="1" style="flex:1">
            <button id="pts-save-rank">Setzen</button>
          </div>
        </div>
      </div>

      ${d.stats.manual ? `<div class="row" style="margin-top:10px">
        <button class="secondary" id="pts-reset">Anpassung entfernen und neu berechnen</button>
      </div>` : ''}
    </div>

    <div class="panel accent-green">
      <h2>Forschungsstufen</h2>
      <div class="row" style="margin-bottom:8px">
        <select id="res-key" style="flex:1;min-width:200px">
          ${catalog.research.map((r) => `<option value="${r.key}">${esc(r.name)}</option>`).join('')}
        </select>
        <input type="number" id="res-value" value="0" min="0" max="100" style="width:110px">
        <button class="small" id="save-research">Übernehmen</button>
      </div>
      <table>${levelRows(d.research, catalog.research)}</table>
    </div>

    ${d.fleets.length ? `<div class="panel accent-red">
      <h2>Flotten unterwegs</h2>
      <table>${d.fleets.map((f) => `<tr>
        <td class="tiny">${esc(f.missionName)} (${f.state})</td>
        <td class="tiny mono">${fmtCoords(f.origin)} → ${fmtCoords(f.target)}</td>
        <td class="tiny">${Object.entries(f.ships).map(([k, n]) => `${k} ×${n}`).join(', ')}</td>
        <td class="right"><button class="secondary small" data-recall-fleet="${f.id}">Zurückrufen</button></td>
      </tr>`).join('')}</table>
    </div>` : ''}

    ${planetTabs}
  `);

  box.querySelector('#close').addEventListener('click', closeModal);

  // Auswahlliste passend zur Kategorie füllen
  const fillKeys = (pid) => {
    const kind = box.querySelector(`[data-kind="${pid}"]`).value;
    const list = { building: catalog.buildings, ship: catalog.ships, defense: catalog.defenses }[kind];
    box.querySelector(`[data-key="${pid}"]`).innerHTML =
      list.map((i) => `<option value="${i.key}">${esc(i.name)}</option>`).join('');
  };
  box.querySelectorAll('[data-kind]').forEach((sel) => {
    fillKeys(sel.dataset.kind);
    sel.addEventListener('change', () => fillKeys(sel.dataset.kind));
  });

  box.querySelector('#save-user').addEventListener('click', async () => {
    try {
      const r = await api.patch(`/admin/users/${id}`, {
        username: box.querySelector('#f-username').value,
        email: box.querySelector('#f-email').value,
        role: box.querySelector('#f-role').value,
        faction: box.querySelector('#f-faction').value,
        banned: box.querySelector('#f-banned').value === '1',
        banReason: box.querySelector('#f-reason').value,
      });
      toast(r.changes.length ? `Gespeichert: ${r.changes.join('; ')}` : 'Keine Änderungen.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });

  box.querySelector('#reset-pw').addEventListener('click', async () => {
    const pw = prompt('Neues Passwort (min. 8 Zeichen):');
    if (!pw) return;
    try {
      await api.post(`/admin/users/${id}/password`, { password: pw });
      toast('Passwort gesetzt. Alle Sitzungen wurden beendet.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });

  box.querySelector('#send-msg').addEventListener('click', async () => {
    const subject = prompt('Betreff:', 'Mitteilung der Admiralität');
    if (subject === null) return;
    const bodyText = prompt('Nachricht:');
    if (!bodyText) return;
    await api.post(`/admin/users/${id}/message`, { subject, body: bodyText });
    toast('Nachricht zugestellt.', 'success');
  });

  box.querySelector('#add-planet').addEventListener('click', async () => {
    const input = prompt('Koordinaten als q:s:p (leer = zufälliger freier Platz):', '');
    if (input === null) return;
    const m = input.match(/^(\d+):(\d+):(\d+)$/);
    try {
      await api.post('/admin/planets', {
        userId: id,
        coords: m ? { q: Number(m[1]), s: Number(m[2]), p: Number(m[3]) } : null,
      });
      toast('Planet angelegt.', 'success');
      closeModal(); openUser(id);
    } catch (err) { toast(err.message, 'error'); }
  });

  box.querySelector('#del-user').addEventListener('click', async () => {
    if (!confirm(`Konto "${u.username}" mit allen Planeten unwiderruflich löschen?`)) return;
    try {
      await api.del(`/admin/users/${id}`);
      toast('Konto gelöscht.', 'success');
      closeModal();
      render(document.getElementById('view'), {});
    } catch (err) { toast(err.message, 'error'); }
  });

  const punkteSpeichern = async (payload, hinweis) => {
    try {
      const r = await api.post(`/admin/users/${id}/points`, payload);
      toast(`${hinweis}: ${fmt(r.points)} Punkte, Rang ${r.rank}`, 'success');
      // Ein nicht belegbarer Rang wird ausdrücklich gemeldet, statt einfach
      // einen abweichenden Platz anzuzeigen.
      if (r.hinweis) toast(r.hinweis, 'error');
      closeModal(); openUser(id);
    } catch (err) { toast(err.message, 'error'); }
  };

  // Zwei getrennte Knöpfe – so ist immer eindeutig, welcher Wert gilt.
  box.querySelector('#pts-save-points').addEventListener('click', () =>
    punkteSpeichern({ points: Number(box.querySelector('#pts-points').value) }, 'Punkte gesetzt'));

  box.querySelector('#pts-save-rank').addEventListener('click', () =>
    punkteSpeichern({ rank: Number(box.querySelector('#pts-rank').value) }, 'Rang gesetzt'));

  box.querySelector('#pts-reset')?.addEventListener('click', () => {
    if (!confirm('Die manuelle Anpassung entfernen? Die Punkte werden dann wieder allein aus dem Besitz berechnet.')) return;
    punkteSpeichern({ reset: true }, 'Zurückgesetzt');
  });

  box.querySelector('#save-research').addEventListener('click', async () => {
    try {
      await api.post(`/admin/users/${id}/research`, {
        key: box.querySelector('#res-key').value,
        value: Number(box.querySelector('#res-value').value),
      });
      toast('Forschungsstufe gesetzt.', 'success');
      closeModal(); openUser(id);
    } catch (err) { toast(err.message, 'error'); }
  });

  box.addEventListener('click', async (e) => {
    const saveRes = e.target.closest('[data-save-res]');
    const addRes = e.target.closest('[data-add-res]');
    const saveUnit = e.target.closest('[data-save-unit]');
    const delPlanet = e.target.closest('[data-del-planet]');
    const clearQueue = e.target.closest('[data-clear-queue]');
    const recall = e.target.closest('[data-recall-fleet]');

    try {
      if (saveRes || addRes) {
        const pid = (saveRes || addRes).dataset.saveRes || (saveRes || addRes).dataset.addRes;
        const payload = { mode: addRes ? 'add' : 'set' };
        for (const r of ['duranium', 'dilithium', 'deuterium'])
          payload[r] = Number(box.querySelector(`[data-res="${r}"][data-pid="${pid}"]`).value);
        await api.post(`/admin/planets/${pid}/resources`, payload);
        toast('Rohstoffe aktualisiert.', 'success');
        closeModal(); openUser(id);
      } else if (saveUnit) {
        const pid = saveUnit.dataset.saveUnit;
        await api.post(`/admin/planets/${pid}/units`, {
          kind: box.querySelector(`[data-kind="${pid}"]`).value,
          key: box.querySelector(`[data-key="${pid}"]`).value,
          value: Number(box.querySelector(`[data-value="${pid}"]`).value),
        });
        toast('Bestand gesetzt.', 'success');
        closeModal(); openUser(id);
      } else if (delPlanet) {
        if (!confirm('Diesen Planeten wirklich löschen?')) return;
        await api.del(`/admin/planets/${delPlanet.dataset.delPlanet}`);
        toast('Planet gelöscht.', 'success');
        closeModal(); openUser(id);
      } else if (clearQueue) {
        const r = await api.post(`/admin/planets/${clearQueue.dataset.clearQueue}/queue/clear`);
        toast(`${r.removed} Aufträge entfernt.`, 'success');
      } else if (recall) {
        await api.del(`/admin/fleets/${recall.dataset.recallFleet}`, { returnHome: true });
        toast('Flotte kehrt um.', 'success');
        closeModal(); openUser(id);
      }
    } catch (err) { toast(err.message, 'error'); }
  });
}

function levelRows(map, catalogList) {
  const names = Object.fromEntries(catalogList.map((c) => [c.key, c.name]));
  const rows = Object.entries(map || {}).filter(([, v]) => v > 0);
  if (!rows.length) return '<tr><td class="muted tiny">–</td></tr>';
  return rows.map(([k, v]) =>
    `<tr><td class="tiny">${esc(names[k] || k)}</td><td class="right mono tiny">${fmt(v)}</td></tr>`).join('');
}

/* ------------------------------------------------------------------ */

async function fleets(body) {
  const d = await api.get('/admin/fleets');
  body.innerHTML = `
    <div class="panel accent-orange">
      <h2>Aktive Flottenbewegungen (${d.fleets.length})</h2>
      <div class="table-wrap"><table>
        <tr><th>ID</th><th>Kommandant</th><th>Auftrag</th><th>Route</th><th>Schiffe</th><th>Ankunft</th><th></th></tr>
        ${d.fleets.map((f) => `<tr>
          <td class="mono tiny">${f.id}</td>
          <td><a href="#" data-user="${f.userId}">${esc(f.user)}</a></td>
          <td class="tiny">${esc(f.missionName)}<div class="tiny muted">${f.state}</div></td>
          <td class="mono tiny">${fmtCoords(f.origin)} → ${fmtCoords(f.target)}</td>
          <td class="tiny">${Object.entries(f.ships).map(([k, n]) => `${esc(k)} ×${fmt(n)}`).join(', ')}</td>
          <td class="tiny muted">${fmtDate(f.arriveAt)}</td>
          <td class="right nowrap">
            <button class="secondary small" data-recall="${f.id}">Zurückrufen</button>
            <button class="danger small" data-dissolve="${f.id}">Auflösen</button>
          </td></tr>`).join('') || '<tr><td colspan="7" class="muted small">Keine Flotte unterwegs.</td></tr>'}
      </table></div>
    </div>`;

  bindUserLinks(body);
  body.addEventListener('click', async (e) => {
    const recall = e.target.closest('[data-recall]');
    const dissolve = e.target.closest('[data-dissolve]');
    try {
      if (recall) {
        await api.del(`/admin/fleets/${recall.dataset.recall}`, { returnHome: true });
        toast('Flotte kehrt um.', 'success');
        fleets(body);
      } else if (dissolve) {
        if (!confirm('Flotte samt Schiffen ersatzlos entfernen?')) return;
        await api.del(`/admin/fleets/${dissolve.dataset.dissolve}`, { returnHome: false });
        toast('Flotte aufgelöst.', 'success');
        fleets(body);
      }
    } catch (err) { toast(err.message, 'error'); }
  });
}

async function broadcast(body) {
  body.innerHTML = `
    <div class="panel accent-orange">
      <h2>Rundspruch an alle Kommandanten</h2>
      <div class="field"><label>Betreff</label><input id="b-subject" value="Mitteilung der Admiralität"></div>
      <div class="field"><label>Nachricht</label><textarea id="b-body" rows="7"></textarea></div>
      <div class="row">
        <label class="row" style="margin:0"><input type="checkbox" id="b-active" style="width:auto"> nur in den letzten 7 Tagen aktive Spieler</label>
      </div>
      <button id="b-send" style="margin-top:10px">Rundspruch senden</button>
    </div>`;

  document.getElementById('b-send').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const r = await api.post('/admin/broadcast', {
        subject: document.getElementById('b-subject').value,
        body: document.getElementById('b-body').value,
        onlyActive: document.getElementById('b-active').checked,
      });
      toast(`Rundspruch an ${r.recipients} Kommandanten zugestellt.`, 'success');
      document.getElementById('b-body').value = '';
    } catch (err) { toast(err.message, 'error'); }
    e.target.disabled = false;
  });
}

async function settings(body) {
  const d = await api.get('/admin/overview');
  body.innerHTML = `
    <div class="grid cols-2">
      <div class="panel accent-orange">
        <h2>Servereinstellungen</h2>
        <div class="field"><label>Begrüßungstext (MOTD)</label>
          <textarea id="s-motd" rows="3">${esc(d.settings.motd)}</textarea></div>
        <div class="field">
          <label class="row" style="margin:0">
            <input type="checkbox" id="s-reg" style="width:auto" ${d.settings.registrationOpen ? 'checked' : ''}>
            Registrierung geöffnet
          </label>
        </div>
        <button id="s-save">Speichern</button>
      </div>

      <div class="panel accent-blue">
        <h2>Spielparameter · Änderung wirkt sofort</h2>
        <p class="small muted">
          Diese Werte lassen sich im laufenden Betrieb ändern — ein Neustart ist nicht nötig.
          Neue Berechnungen verwenden den neuen Wert sofort. Bereits erteilte Bauaufträge und
          gestartete Flotten behalten ihre beim Start berechneten Zeiten.
        </p>
        <div id="tunables-box"><div class="loader">Werte werden geladen</div></div>
      </div>

      <div class="panel">
        <h2>Feste Konfiguration</h2>
        <p class="small muted">Diese Werte stammen aus der .env-Datei und erfordern einen Serverneustart.</p>
        <table>
          <tr><td class="muted">Universum</td><td class="mono">${d.settings.universe.quadrants} × ${d.settings.universe.systems} × ${d.settings.universe.slots}</td></tr>
          <tr><td class="muted">Datenbank</td><td class="tiny mono">${esc(d.settings.dbFile)}</td></tr>
        </table>
      </div>

      <div class="panel accent-green">
        <h2>Trümmerfeld anlegen</h2>
        <div class="row">
          <input type="number" id="d-q" placeholder="Q" style="width:70px" value="1">
          <input type="number" id="d-s" placeholder="S" style="width:80px" value="1">
          <input type="number" id="d-p" placeholder="P" style="width:70px" value="1">
          <input type="number" id="d-dur" placeholder="Duranium" style="width:130px" value="0">
          <input type="number" id="d-dil" placeholder="Dilithium" style="width:130px" value="0">
          <button class="small" id="d-save">Anlegen</button>
        </div>
      </div>
    </div>`;

  await renderTunables();

  document.getElementById('s-save').addEventListener('click', async () => {
    await api.post('/admin/settings', {
      motd: document.getElementById('s-motd').value,
      registrationOpen: document.getElementById('s-reg').checked,
    });
    toast('Einstellungen gespeichert.', 'success');
  });

  document.getElementById('d-save').addEventListener('click', async () => {
    await api.post('/admin/debris', {
      q: Number(document.getElementById('d-q').value),
      s: Number(document.getElementById('d-s').value),
      p: Number(document.getElementById('d-p').value),
      duranium: Number(document.getElementById('d-dur').value),
      dilithium: Number(document.getElementById('d-dil').value),
    });
    toast('Trümmerfeld angelegt.', 'success');
  });
}

async function log(body) {
  const d = await api.get('/admin/log');
  body.innerHTML = `
    <div class="panel accent-orange">
      <h2>Verwaltungsprotokoll (${d.total} Einträge)</h2>
      <div class="table-wrap"><table>
        <tr><th>Zeit</th><th>Administrator</th><th>Aktion</th><th>Ziel</th><th>Details</th></tr>
        ${d.log.map((l) => `<tr>
          <td class="tiny muted nowrap">${fmtDate(l.created_at)}</td>
          <td class="tiny">${esc(l.admin_name)}</td>
          <td class="tiny warn">${esc(l.action)}</td>
          <td class="tiny">${esc(l.target)}</td>
          <td class="tiny muted">${esc(l.detail)}</td>
        </tr>`).join('') || '<tr><td colspan="5" class="muted small">Noch keine Einträge.</td></tr>'}
      </table></div>
    </div>`;
}


/** Regler und Felder für die zur Laufzeit änderbaren Spielparameter. */
async function renderTunables() {
  const box = document.getElementById('tunables-box');
  if (!box) return;
  const { tunables } = await api.get('/admin/tunables');

  const speedKeys = ['speed_economy', 'speed_build', 'speed_fleet'];
  const startKeys = ['start_duranium', 'start_dilithium', 'start_deuterium'];

  const field = (key) => {
    const t = tunables[key];
    if (!t) return '';
    const isSpeed = key.startsWith('speed_');
    return `<div class="tunable">
      <label for="tu-${key}">${esc(t.label)}</label>
      <div class="row" style="gap:8px;align-items:center">
        ${isSpeed ? `<input type="range" id="tu-range-${key}" min="1" max="100" step="1"
                       value="${Math.min(100, Math.max(1, Math.round(t.value)))}" style="flex:1;min-width:110px">` : ''}
        <input type="number" id="tu-${key}" value="${t.value}" min="${t.min}" step="${isSpeed ? '0.5' : '100'}"
               style="width:${isSpeed ? '92' : '132'}px">
        ${isSpeed ? '<span class="muted small">×</span>' : ''}
      </div>
    </div>`;
  };

  box.innerHTML = `
    <h3 style="margin:4px 0 8px">Geschwindigkeiten</h3>
    <div class="grid cols-3">${speedKeys.map(field).join('')}</div>
    <h3 style="margin:14px 0 8px">Startausstattung neuer Kommandanten</h3>
    <div class="grid cols-3">${startKeys.map(field).join('')}</div>
    <div class="row" style="margin-top:12px">
      <button id="tu-save">Übernehmen</button>
      <button class="secondary" id="tu-preset-slow">Vorgabe: gemächlich (1×)</button>
      <button class="secondary" id="tu-preset-normal">Vorgabe: normal (5×)</button>
      <button class="secondary" id="tu-preset-fast">Vorgabe: schnell (25×)</button>
    </div>`;

  // Regler und Zahlenfeld gekoppelt
  for (const key of speedKeys) {
    const range = document.getElementById(`tu-range-${key}`);
    const num = document.getElementById(`tu-${key}`);
    range.addEventListener('input', () => { num.value = range.value; });
    num.addEventListener('input', () => {
      const v = Number(num.value);
      if (Number.isFinite(v)) range.value = Math.min(100, Math.max(1, Math.round(v)));
    });
  }

  const preset = (economy, build, fleet) => () => {
    document.getElementById('tu-speed_economy').value = economy;
    document.getElementById('tu-speed_build').value = build;
    document.getElementById('tu-speed_fleet').value = fleet;
    for (const key of speedKeys) {
      const num = document.getElementById(`tu-${key}`);
      document.getElementById(`tu-range-${key}`).value = Math.min(100, Math.max(1, Math.round(Number(num.value))));
    }
  };
  document.getElementById('tu-preset-slow').addEventListener('click', preset(1, 1, 1));
  document.getElementById('tu-preset-normal').addEventListener('click', preset(5, 5, 3));
  document.getElementById('tu-preset-fast').addEventListener('click', preset(25, 25, 10));

  document.getElementById('tu-save').addEventListener('click', async (e) => {
    e.target.disabled = true;
    const payload = {};
    for (const key of [...speedKeys, ...startKeys]) payload[key] = document.getElementById(`tu-${key}`).value;
    try {
      const r = await api.post('/admin/tunables', payload);
      toast(r.changes.length ? `Übernommen: ${r.changes.join('; ')}` : 'Keine Änderungen.', 'success');
      await renderTunables();
    } catch (err) {
      toast(err.message, 'error');
      e.target.disabled = false;
    }
  });
}


/* ------------------------------------------------------------------ */
/* Änderungsprotokoll verwalten                                        */
/* ------------------------------------------------------------------ */

async function changelog(body) {
  const d = await api.get('/admin/changelog');
  const current = d.entries.find((e) => e.version === d.currentVersion);

  body.innerHTML = `
    <div class="panel accent-green">
      <h2>Versionsnummer</h2>
      <p class="small muted">
        Die Versionsnummer erscheint in der Fußleiste und steuert, wann Spieler den
        Änderungshinweis sehen. Wird sie geändert, gilt der Stand als neue Fassung und
        der Hinweis erscheint bei allen erneut. Aus der package.json stammt
        <span class="mono">${esc(d.packageVersion)}</span>.
      </p>
      <div class="row" style="margin-top:8px">
        <div style="flex:1;min-width:180px">
          <label>Angezeigte Version</label>
          <input id="ver-value" value="${esc(d.currentVersion)}" placeholder="z. B. 0.9.1-beta.2">
        </div>
        <button id="ver-save" style="align-self:flex-end">Übernehmen</button>
        <button class="secondary" id="ver-reset" style="align-self:flex-end">Auf package.json zurücksetzen</button>
      </div>
      <p class="tiny muted" style="margin-top:6px">
        ${d.versionIsManual
          ? '<span class="warn">Derzeit manuell gesetzt.</span> Der Wert überlebt einen Neustart.'
          : 'Derzeit wird der Wert aus der package.json verwendet.'}
        Zusätze wie <span class="mono">-beta</span>, <span class="mono">-alpha</span> oder
        <span class="mono">-rc</span> lösen die Beta-Kennzeichnung aus.
      </p>
    </div>

    <div class="panel accent-orange">
      <h2>Eintrag bearbeiten</h2>
      <p class="small muted">
        Für die laufende Version wird beim Serverstart automatisch ein Eintrag aus den
        Git-Commits erzeugt. Sobald Sie ihn hier speichern, gilt er als von Hand gepflegt
        und wird nicht mehr überschrieben. Spieler sehen den neuesten veröffentlichten
        Eintrag einmalig nach dem nächsten Seitenaufruf.
      </p>
      <div class="grid cols-2" style="margin-top:10px">
        <div class="field">
          <label>Version</label>
          <input id="cl-version" value="${esc(current?.version || d.currentVersion)}">
        </div>
        <div class="field">
          <label>Überschrift</label>
          <input id="cl-title" value="${esc(current?.title || 'Version ' + d.currentVersion)}">
        </div>
      </div>
      <div class="field">
        <label>Text — eine Zeile je Änderung, mit «- » beginnend ergibt eine Liste</label>
        <textarea id="cl-body" rows="12">${esc(current?.body || '')}</textarea>
      </div>
      <div class="row">
        <label class="row" style="margin:0">
          <input type="checkbox" id="cl-published" style="width:auto" ${current?.published !== false ? 'checked' : ''}>
          veröffentlicht (für Spieler sichtbar)
        </label>
        <span class="spacer" style="flex:1"></span>
        <button class="secondary" id="cl-reshow">Allen Spielern erneut anzeigen</button>
        <button class="secondary" id="cl-regen">Aus Git neu erzeugen</button>
        <button id="cl-save">Speichern</button>
      </div>
      <div id="cl-preview-box" style="margin-top:14px">
        <h3>Vorschau</h3>
        <div class="cl-preview">${renderBody(current?.body || '')}</div>
      </div>
    </div>

    <div class="panel accent-blue">
      <h2>Alle Einträge (${d.entries.length})</h2>
      <div class="table-wrap"><table>
        <tr><th>Version</th><th>Überschrift</th><th>Zuletzt geändert</th><th>Status</th><th></th></tr>
        ${d.entries.map((e) => `<tr>
          <td class="mono">${esc(e.version)}${e.version === d.currentVersion ? ' <span class="tag">aktuell</span>' : ''}</td>
          <td>${esc(e.title)}</td>
          <td class="tiny muted">${fmtDate(e.updatedAt)}</td>
          <td class="tiny">${e.published ? '<span class="ok">veröffentlicht</span>' : '<span class="muted">Entwurf</span>'}
            ${e.auto ? '<div class="tiny muted">automatisch</div>' : ''}</td>
          <td class="right nowrap">
            <button class="secondary small" data-cl-edit="${e.id}">Laden</button>
            <button class="danger small" data-cl-del="${e.id}">Löschen</button>
          </td>
        </tr>`).join('') || '<tr><td colspan="5" class="muted small">Noch keine Einträge.</td></tr>'}
      </table></div>
    </div>`;

  const saveVersion = async (value) => {
    try {
      const r = await api.post('/admin/version', { version: value });
      toast(`Version ist jetzt ${r.version}.`, 'success');
      changelog(body);
    } catch (err) { toast(err.message, 'error'); }
  };
  document.getElementById('ver-save').addEventListener('click',
    () => saveVersion(document.getElementById('ver-value').value));
  document.getElementById('ver-reset').addEventListener('click', () => {
    if (!confirm('Versionsnummer wieder aus der package.json übernehmen?')) return;
    saveVersion('');
  });

  const preview = () => {
    document.querySelector('.cl-preview').innerHTML = renderBody(document.getElementById('cl-body').value);
  };
  document.getElementById('cl-body').addEventListener('input', preview);

  document.getElementById('cl-save').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      await api.post('/admin/changelog', {
        version: document.getElementById('cl-version').value,
        title: document.getElementById('cl-title').value,
        body: document.getElementById('cl-body').value,
        published: document.getElementById('cl-published').checked,
      });
      toast('Eintrag gespeichert.', 'success');
      changelog(body);
    } catch (err) { toast(err.message, 'error'); e.target.disabled = false; }
  });

  document.getElementById('cl-reshow').addEventListener('click', async () => {
    if (!confirm('Der Hinweis wird allen Spielern beim nächsten Seitenaufruf erneut eingeblendet. Fortfahren?')) return;
    try {
      const r = await api.post('/admin/changelog/reshow');
      toast(`Hinweis für ${r.users} Spieler zurückgesetzt.`, 'success');
    } catch (err) { toast(err.message, 'error'); }
  });

  document.getElementById('cl-regen').addEventListener('click', async () => {
    if (!confirm('Eintrag der laufenden Version aus der Git-Historie neu erzeugen? Ein von Hand bearbeiteter Text geht dabei verloren.')) return;
    try {
      await api.post('/admin/changelog/regenerate');
      toast('Aus der Git-Historie neu erzeugt.', 'success');
      changelog(body);
    } catch (err) { toast(err.message, 'error'); }
  });

  body.addEventListener('click', async (ev) => {
    const edit = ev.target.closest('[data-cl-edit]');
    const del = ev.target.closest('[data-cl-del]');
    if (edit) {
      const entry = d.entries.find((x) => x.id === Number(edit.dataset.clEdit));
      if (!entry) return;
      document.getElementById('cl-version').value = entry.version;
      document.getElementById('cl-title').value = entry.title;
      document.getElementById('cl-body').value = entry.body;
      document.getElementById('cl-published').checked = entry.published;
      preview();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (del) {
      if (!confirm('Diesen Eintrag löschen?')) return;
      try { await api.del(`/admin/changelog/${del.dataset.clDel}`); changelog(body); }
      catch (err) { toast(err.message, 'error'); }
    }
  });
}
