import { api } from '../api.js';
import { fmt, fmtDate, esc, toast } from '../util.js';

export async function render(container, ctx) {
  const data = await api.get('/alliance');
  if (data.own) return renderOwn(container, ctx, data);
  return renderBrowse(container, ctx, data);
}

async function renderOwn(container, ctx, data) {
  const a = data.own;
  const canManage = a.myRank === 'leader' || a.myRank === 'officer';
  const isLeader = a.myRank === 'leader';

  container.innerHTML = `
    <h1 style="margin-bottom:12px">[${esc(a.tag)}] ${esc(a.name)}
      <span class="small muted">${fmt(a.points)} Punkte · ${a.members.length} Mitglieder</span></h1>

    <div class="panel accent-orange">
      <h2>Verbandsordnung</h2>
      ${canManage
        ? `<textarea id="desc" rows="5">${esc(a.description)}</textarea>
           <button class="small" id="save-desc" style="margin-top:8px">Speichern</button>`
        : `<p class="small">${esc(a.description) || '<span class="muted">Keine Beschreibung hinterlegt.</span>'}</p>`}
    </div>

    ${canManage && a.applications.length ? `
      <div class="panel accent-green">
        <h2>Aufnahmegesuche (${a.applications.length})</h2>
        <div class="table-wrap"><table>
          <tr><th>Kommandant</th><th class="right">Punkte</th><th>Nachricht</th><th></th></tr>
          ${a.applications.map((ap) => `<tr>
            <td>${esc(ap.username)}</td>
            <td class="right mono">${fmt(ap.points)}</td>
            <td class="small">${esc(ap.text)}</td>
            <td class="right nowrap">
              <button class="success small" data-accept="${ap.id}">Aufnehmen</button>
              <button class="danger small" data-reject="${ap.id}">Ablehnen</button>
            </td></tr>`).join('')}
        </table></div>
      </div>` : ''}

    <div class="panel accent-blue">
      <h2>Mitglieder</h2>
      <div class="table-wrap"><table>
        <tr><th>Kommandant</th><th>Rang</th><th class="right">Punkte</th><th>Beigetreten</th><th class="right"></th></tr>
        ${a.members.map((m) => `<tr>
          <td>${esc(m.username)}</td>
          <td class="tiny">${{ leader: 'Kommodore', officer: 'Offizier', member: 'Mitglied' }[m.rank]}</td>
          <td class="right mono">${fmt(m.points)}</td>
          <td class="tiny muted">${fmtDate(m.joinedAt)}</td>
          <td class="right nowrap">
            ${canManage && m.rank !== 'leader' ? `<button class="secondary small" data-kick="${m.id}">Entfernen</button>` : ''}
            ${isLeader && m.rank === 'member' ? `<button class="secondary small" data-promote="${m.id}">Befördern</button>` : ''}
            ${isLeader && m.rank === 'officer' ? `<button class="secondary small" data-demote="${m.id}">Degradieren</button>` : ''}
            ${isLeader && m.rank !== 'leader' ? `<button class="ghost small" data-transfer="${m.id}">Führung übergeben</button>` : ''}
          </td></tr>`).join('')}
      </table></div>
      <button class="danger small" id="leave" style="margin-top:10px">Verband verlassen</button>
    </div>`;

  document.getElementById('save-desc')?.addEventListener('click', async () => {
    try {
      await api.post('/alliance/description', { description: document.getElementById('desc').value });
      toast('Gespeichert.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });

  container.addEventListener('click', async (e) => {
    const map = [
      ['accept', (id) => api.post(`/alliance/application/${id}`, { accept: true })],
      ['reject', (id) => api.post(`/alliance/application/${id}`, { accept: false })],
      ['kick', (id) => api.post(`/alliance/member/${id}`, { action: 'kick' })],
      ['promote', (id) => api.post(`/alliance/member/${id}`, { action: 'promote' })],
      ['demote', (id) => api.post(`/alliance/member/${id}`, { action: 'demote' })],
      ['transfer', (id) => api.post(`/alliance/member/${id}`, { action: 'transfer' })],
    ];
    for (const [attr, fn] of map) {
      const btn = e.target.closest(`[data-${attr}]`);
      if (!btn) continue;
      if (attr === 'transfer' && !confirm('Die Führung wirklich übertragen?')) return;
      try { await fn(Number(btn.dataset[attr])); render(container, ctx); }
      catch (err) { toast(err.message, 'error'); }
      return;
    }
  });

  document.getElementById('leave').addEventListener('click', async () => {
    if (!confirm('Den Flottenverband wirklich verlassen?')) return;
    try { await api.post('/alliance/leave'); render(container, ctx); }
    catch (err) { toast(err.message, 'error'); }
  });
}

async function renderBrowse(container, ctx, data) {
  container.innerHTML = `
    <h1 style="margin-bottom:12px">Flottenverbände</h1>

    ${data.application.length
      ? `<div class="alert info">Ihr Aufnahmegesuch bei
         <b>[${esc(data.application[0].tag)}] ${esc(data.application[0].name)}</b> wird geprüft.</div>` : ''}

    <div class="panel accent-orange">
      <h2>Eigenen Verband gründen</h2>
      <div class="row">
        <div style="width:120px"><label>Kürzel</label><input id="new-tag" maxlength="8" placeholder="SF"></div>
        <div style="flex:1;min-width:200px"><label>Name</label><input id="new-name" maxlength="40" placeholder="Sternenflottenkommando"></div>
        <button id="create" style="align-self:flex-end">Gründen</button>
      </div>
    </div>

    <div class="panel accent-blue">
      <h2>Bestehende Verbände</h2>
      <div class="table-wrap"><table>
        <tr><th>Platz</th><th>Kürzel</th><th>Name</th><th class="right">Mitglieder</th><th class="right">Punkte</th><th></th></tr>
        ${data.alliances.map((a) => `<tr>
          <td class="mono">${a.rank}</td>
          <td><span class="tag">${esc(a.tag)}</span></td>
          <td>${esc(a.name)}</td>
          <td class="right mono">${a.members}</td>
          <td class="right mono">${fmt(a.points)}</td>
          <td class="right"><button class="secondary small" data-apply="${a.id}">Bewerben</button></td>
        </tr>`).join('') || '<tr><td colspan="6" class="muted small">Noch keine Verbände gegründet.</td></tr>'}
      </table></div>
    </div>`;

  document.getElementById('create').addEventListener('click', async () => {
    try {
      await api.post('/alliance/create', {
        tag: document.getElementById('new-tag').value,
        name: document.getElementById('new-name').value,
      });
      toast('Flottenverband gegründet.', 'success');
      render(container, ctx);
    } catch (err) { toast(err.message, 'error'); }
  });

  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-apply]');
    if (!btn) return;
    const text = prompt('Kurze Nachricht an die Verbandsführung:') ?? '';
    try {
      await api.post('/alliance/apply', { allianceId: Number(btn.dataset.apply), text });
      toast('Gesuch abgeschickt.', 'success');
      render(container, ctx);
    } catch (err) { toast(err.message, 'error'); }
  });
}
