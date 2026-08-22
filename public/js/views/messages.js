import { api } from '../api.js';
import { fmt, fmtDate, fmtCoords, esc, toast } from '../util.js';

const TABS = [
  ['', 'Alle'], ['combat', 'Gefechte'], ['espionage', 'Spionage'], ['transport', 'Transport'],
  ['player', 'Spieler'], ['alliance', 'Verband'], ['system', 'System'], ['admin', 'Admiralität'],
];

let activeType = '';
let page = 0;

export async function render(container, ctx) {
  const { refresh } = ctx;
  const query = `?page=${page}${activeType ? `&type=${activeType}` : ''}`;
  const data = await api.get(`/messages${query}`);

  container.innerHTML = `
    <div class="row between" style="margin-bottom:12px">
      <h1>Nachrichten <span class="small muted">${data.unread} ungelesen</span></h1>
      <div class="row">
        <button class="secondary small" id="mark-all">Alle als gelesen</button>
        <button class="danger small" id="del-read">Gelesene löschen</button>
      </div>
    </div>

    <div class="subtabs">
      ${TABS.map(([key, label]) => `<button data-type="${key}" class="${key === activeType ? 'active' : ''}">
        ${label}${data.counts[key] ? ` <span class="badge">${data.counts[key]}</span>` : ''}</button>`).join('')}
    </div>

    <div id="message-list">
      ${data.messages.length
        ? data.messages.map(messageHtml).join('')
        : '<div class="panel"><p class="muted small">Keine Nachrichten in dieser Kategorie.</p></div>'}
    </div>

    ${data.pages > 1 ? `<div class="row center" style="justify-content:center;margin-top:12px">
      <button class="secondary small" id="prev" ${page === 0 ? 'disabled' : ''}>◀ Zurück</button>
      <span class="small muted">Seite ${page + 1} / ${data.pages}</span>
      <button class="secondary small" id="next" ${page + 1 >= data.pages ? 'disabled' : ''}>Weiter ▶</button>
    </div>` : ''}
  `;

  container.querySelectorAll('[data-type]').forEach((b) =>
    b.addEventListener('click', () => { activeType = b.dataset.type; page = 0; render(container, ctx); })
  );
  document.getElementById('prev')?.addEventListener('click', () => { page--; render(container, ctx); });
  document.getElementById('next')?.addEventListener('click', () => { page++; render(container, ctx); });

  document.getElementById('mark-all').addEventListener('click', async () => {
    await api.post('/messages/read', {});
    await refresh();
    render(container, ctx);
  });
  document.getElementById('del-read').addEventListener('click', async () => {
    const ids = data.messages.filter((m) => m.read).map((m) => m.id);
    if (!ids.length) return toast('Keine gelesenen Nachrichten auf dieser Seite.', 'info');
    if (!confirm(`${ids.length} Nachricht(en) löschen?`)) return;
    await api.post('/messages/delete', { ids });
    render(container, ctx);
  });

  container.addEventListener('click', async (e) => {
    const head = e.target.closest('.message-head');
    if (head && !e.target.closest('[data-del]')) {
      const wrap = head.parentElement;
      const body = wrap.querySelector('.message-body');
      body.classList.toggle('hidden');
      if (wrap.classList.contains('unread')) {
        wrap.classList.remove('unread');
        await api.post('/messages/read', { ids: [Number(wrap.dataset.id)] });
        await refresh();
      }
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      await api.post('/messages/delete', { ids: [Number(del.dataset.del)] });
      render(container, ctx);
    }
  });
}

function messageHtml(m) {
  return `<div class="message ${m.read ? '' : 'unread'} ${esc(m.type)}" data-id="${m.id}">
    <div class="message-head">
      <span class="subject">${esc(m.subject)}</span>
      ${m.from ? `<span class="tiny muted">von ${esc(m.from.username)}</span>` : ''}
      <span class="tiny muted nowrap">${fmtDate(m.createdAt)}</span>
      <button class="secondary small" data-del="${m.id}">×</button>
    </div>
    <div class="message-body hidden">
      <p>${esc(m.body)}</p>
      ${m.type === 'combat' && m.data ? combatReport(m.data) : ''}
      ${m.type === 'espionage' && m.data ? espionageReport(m.data) : ''}
    </div>
  </div>`;
}

function unitTable(title, counts, names) {
  const entries = Object.entries(counts || {}).filter(([, n]) => n > 0);
  if (!entries.length) return `<p class="tiny muted">${title}: keine</p>`;
  return `<h3 style="margin:8px 0 4px">${title}</h3>
    <table>${entries.map(([k, n]) =>
      `<tr><td>${esc(names?.[k]?.name || k)}</td><td class="right mono">${fmt(n)}</td></tr>`).join('')}</table>`;
}

function combatReport(d) {
  const b = d.battle;
  const cls = { attacker: 'win', defender: 'loss', draw: 'draw' }[b.result];
  const label = { attacker: 'Der Angreifer hat gesiegt', defender: 'Die Verteidigung hat standgehalten', draw: 'Unentschieden' }[b.result];
  const ref = window.__stcRef || {};

  return `<div class="combat-report">
    <div class="combat-result ${cls}">${label} · ${esc(d.attacker)} gegen ${esc(d.defender)} bei ${fmtCoords(d.coords)}</div>
    <p class="tiny muted">Gefecht über ${b.rounds.length} Runde(n).</p>
    <div class="grid cols-2">
      <div>${unitTable('Verluste Angreifer', b.losses.attackerShips, ref.ships)}</div>
      <div>
        ${unitTable('Verluste Verteidiger (Schiffe)', b.losses.defenderShips, ref.ships)}
        ${unitTable('Verluste Verteidiger (Anlagen)', b.losses.defenderDefenses, ref.defenses)}
      </div>
    </div>
    <table style="margin-top:8px">
      <tr><td class="muted">Trümmerfeld</td>
        <td class="mono">${fmt(b.debris.duranium)} Duranium · ${fmt(b.debris.dilithium)} Dilithium</td></tr>
      <tr><td class="muted">Erbeutet</td>
        <td class="mono">${fmt(d.plunder?.duranium)} / ${fmt(d.plunder?.dilithium)} / ${fmt(d.plunder?.deuterium)}</td></tr>
      <tr><td class="muted">Wiederaufgebaute Anlagen</td>
        <td class="tiny">${Object.entries(b.losses.defenseRebuilt || {}).map(([k, n]) =>
          `${esc(ref.defenses?.[k]?.name || k)} ×${fmt(n)}`).join(', ') || '–'}</td></tr>
    </table>
  </div>`;
}

function espionageReport(d) {
  const ref = window.__stcRef || {};
  return `<div class="combat-report">
    <p class="small"><b>${esc(d.planet)}</b> ${fmtCoords(d.coords)} · Kommandant ${esc(d.owner || '?')}
      <span class="muted">(${d.probes} Sonde(n), Auswertungsstufe ${d.level})</span></p>
    <table style="margin:6px 0">
      <tr><th>Duranium</th><th>Dilithium</th><th>Deuterium</th></tr>
      <tr><td class="mono">${fmt(d.resources.duranium)}</td>
          <td class="mono">${fmt(d.resources.dilithium)}</td>
          <td class="mono">${fmt(d.resources.deuterium)}</td></tr>
    </table>
    ${d.fleet ? unitTable('Flotte', d.fleet, ref.ships) : '<p class="tiny bad">Flottendaten nicht erfasst – mehr Sonden einsetzen.</p>'}
    ${d.defenses ? unitTable('Verteidigung', d.defenses, ref.defenses) : ''}
    ${d.buildings ? unitTable('Anlagen', d.buildings, ref.buildings) : ''}
    ${d.research ? unitTable('Technologien', d.research, ref.research) : ''}
  </div>`;
}
