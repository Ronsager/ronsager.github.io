/**
 * Chat mit Moderation.
 *
 * Neue Nachrichten werden abgefragt statt geschoben – das passt zur übrigen
 * Anwendung und kommt ohne dauerhafte Verbindung aus, was auf einem
 * Einplatinenrechner Ressourcen spart. Abgefragt wird nur, was seit der
 * letzten bekannten Kennung hinzugekommen ist.
 */
import { api } from '../api.js';
import { esc, toast, fmtDate, modal, closeModal } from '../util.js';

let channel = 'global';
let lastId = 0;
let timer = null;
let canModerate = false;
let sending = false;

const ROLE_LABEL = { admin: 'Admiralität', moderator: 'Moderation' };

function stopPolling() {
  if (timer) { clearInterval(timer); timer = null; }
}

function timeOf(ts) {
  return new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function messageHtml(m) {
  if (m.deleted && !canModerate) {
    return `<div class="chat-msg removed"><span class="chat-name">${esc(m.username)}</span>
      <span class="chat-removed">Nachricht entfernt${m.deletedBy ? ` von ${esc(m.deletedBy)}` : ''}</span></div>`;
  }
  const badge = ROLE_LABEL[m.role]
    ? `<span class="chat-role ${esc(m.role)}">${ROLE_LABEL[m.role]}</span>` : '';
  const tools = canModerate
    ? `<span class="chat-tools">
         ${m.deleted
            ? `<button class="ghost small" data-restore="${m.id}">Wiederherstellen</button>`
            : `<button class="ghost small" data-del="${m.id}">Löschen</button>`}
         ${m.userId && !m.own ? `<button class="ghost small" data-mute="${m.userId}" data-name="${esc(m.username)}">Stumm</button>` : ''}
       </span>` : '';

  return `<div class="chat-msg ${m.own ? 'own' : ''} ${m.deleted ? 'deleted' : ''}" data-id="${m.id}">
    <div class="chat-meta">
      <span class="chat-name">${esc(m.username)}</span>${badge}
      <span class="chat-time">${timeOf(m.createdAt)}</span>
      ${m.deleted ? `<span class="chat-removed">entfernt von ${esc(m.deletedBy || '?')}</span>` : ''}
      ${tools}
    </div>
    <div class="chat-text">${esc(m.text ?? '')}</div>
  </div>`;
}

/** Neue Nachrichten anhängen; nur nach unten scrollen, wenn man schon unten war. */
async function poll(container) {
  try {
    const d = await api.get(`/chat?channel=${encodeURIComponent(channel)}&since=${lastId}`);
    canModerate = d.canModerate;
    const list = container.querySelector('#chat-list');
    if (!list) { stopPolling(); return; }

    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
    if (d.messages.length) {
      list.insertAdjacentHTML('beforeend', d.messages.map(messageHtml).join(''));
      lastId = Math.max(lastId, ...d.messages.map((m) => m.id));
      if (atBottom) list.scrollTop = list.scrollHeight;
    }

    const box = container.querySelector('#chat-mute-note');
    if (box) box.innerHTML = d.muted ? `<div class="alert error">${esc(d.muted.message)}${d.muted.reason ? ' Grund: ' + esc(d.muted.reason) : ''}</div>` : '';
    const input = container.querySelector('#chat-input');
    const send = container.querySelector('#chat-send');
    if (input) { input.disabled = !!d.muted; send.disabled = !!d.muted; }
  } catch {
    /* Netzfehler übergehen – der nächste Durchlauf holt es nach. */
  }
}

export async function render(container, ctx) {
  stopPolling();
  lastId = 0;

  const first = await api.get(`/chat?channel=${encodeURIComponent(channel)}`);
  canModerate = first.canModerate;
  if (!first.channels.some((c) => c.key === channel)) channel = 'global';

  container.innerHTML = `
    <div class="row between" style="margin-bottom:10px">
      <h1>Subraum-Kommunikation</h1>
      ${canModerate ? '<button class="secondary small" id="chat-mutes">Stummschaltungen verwalten</button>' : ''}
    </div>

    <div class="subtabs">
      ${first.channels.map((c) => `<button data-channel="${esc(c.key)}"
          class="${c.key === channel ? 'active' : ''}">${esc(c.name)}</button>`).join('')}
    </div>

    <div class="panel accent-blue chat-panel">
      <div id="chat-list" class="chat-list">
        ${first.messages.length ? first.messages.map(messageHtml).join('')
          : '<p class="muted small center" style="padding:20px">Noch keine Nachrichten. Machen Sie den Anfang.</p>'}
      </div>
      <div id="chat-mute-note"></div>
      <form class="chat-form" id="chat-form">
        <input id="chat-input" maxlength="400" autocomplete="off"
               placeholder="Nachricht an alle im Kanal …" ${first.muted ? 'disabled' : ''}>
        <button id="chat-send" ${first.muted ? 'disabled' : ''}>Senden</button>
      </form>
      <p class="tiny muted">
        ${canModerate
          ? 'Als Moderator können Sie Nachrichten entfernen und Spieler stummschalten.'
          : 'Bleiben Sie sachlich. Moderatoren können Nachrichten entfernen.'}
      </p>
    </div>`;

  if (first.messages.length) lastId = Math.max(...first.messages.map((m) => m.id));
  const list = container.querySelector('#chat-list');
  list.scrollTop = list.scrollHeight;
  if (first.muted) {
    container.querySelector('#chat-mute-note').innerHTML =
      `<div class="alert error">${esc(first.muted.message)}</div>`;
  }

  container.querySelectorAll('[data-channel]').forEach((b) =>
    b.addEventListener('click', () => { channel = b.dataset.channel; render(container, ctx); })
  );

  container.querySelector('#chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;
    const input = container.querySelector('#chat-input');
    const text = input.value.trim();
    if (!text) return;
    sending = true;
    input.value = '';
    try {
      await api.post('/chat', { channel, text });
      await poll(container);
    } catch (err) {
      toast(err.message, 'error');
      input.value = text; // Eingabe nicht verlieren
    } finally { sending = false; }
  });

  container.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    const restore = e.target.closest('[data-restore]');
    const mute = e.target.closest('[data-mute]');
    try {
      if (del) { await api.del(`/chat/${del.dataset.del}`); render(container, ctx); }
      else if (restore) { await api.post(`/chat/${restore.dataset.restore}/restore`); render(container, ctx); }
      else if (mute) muteDialog(Number(mute.dataset.mute), mute.dataset.name, () => render(container, ctx));
    } catch (err) { toast(err.message, 'error'); }
  });

  container.querySelector('#chat-mutes')?.addEventListener('click', () => showMutes(() => render(container, ctx)));

  timer = setInterval(() => poll(container), 5000);
}

/* ------------------------------------------------------------------ */
/* Moderationsdialoge                                                  */
/* ------------------------------------------------------------------ */

function muteDialog(userId, name, done) {
  const box = modal(`
    <h2>${esc(name)} stummschalten</h2>
    <div class="field">
      <label>Dauer</label>
      <select id="mute-minutes">
        <option value="10">10 Minuten</option>
        <option value="60" selected>1 Stunde</option>
        <option value="360">6 Stunden</option>
        <option value="1440">1 Tag</option>
        <option value="10080">1 Woche</option>
        <option value="0">unbefristet</option>
      </select>
    </div>
    <div class="field"><label>Grund (wird dem Spieler angezeigt)</label>
      <input id="mute-reason" maxlength="300" placeholder="z. B. Beleidigungen"></div>
    <div class="row">
      <button class="danger" id="mute-ok">Stummschalten</button>
      <button class="secondary" id="mute-cancel">Abbrechen</button>
    </div>`);
  box.querySelector('#mute-cancel').addEventListener('click', closeModal);
  box.querySelector('#mute-ok').addEventListener('click', async () => {
    try {
      await api.post('/chat/mute', {
        userId,
        minutes: Number(box.querySelector('#mute-minutes').value),
        reason: box.querySelector('#mute-reason').value,
      });
      toast(`${name} wurde stummgeschaltet.`, 'success');
      closeModal();
      if (done) done();
    } catch (err) { toast(err.message, 'error'); }
  });
}

async function showMutes(done) {
  const { mutes } = await api.get('/chat/mutes');
  const box = modal(`
    <h2>Stummschaltungen</h2>
    ${mutes.length ? `<div class="table-wrap"><table>
      <tr><th>Spieler</th><th>Bis</th><th>Grund</th><th>Von</th><th></th></tr>
      ${mutes.map((m) => `<tr>
        <td>${esc(m.username)}</td>
        <td class="tiny">${m.until ? fmtDate(m.until) : '<span class="bad">unbefristet</span>'}
          ${m.expired ? '<span class="muted">(abgelaufen)</span>' : ''}</td>
        <td class="tiny">${esc(m.reason) || '–'}</td>
        <td class="tiny muted">${esc(m.byName)}</td>
        <td class="right"><button class="secondary small" data-unmute="${m.userId}">Aufheben</button></td>
      </tr>`).join('')}
    </table></div>` : '<p class="muted small">Zurzeit ist niemand stummgeschaltet.</p>'}
    <div class="row" style="margin-top:12px"><button class="secondary" id="mutes-close">Schließen</button></div>`);

  box.querySelector('#mutes-close').addEventListener('click', closeModal);
  box.addEventListener('click', async (e) => {
    const un = e.target.closest('[data-unmute]');
    if (!un) return;
    try {
      await api.del(`/chat/mute/${un.dataset.unmute}`);
      toast('Stummschaltung aufgehoben.', 'success');
      closeModal();
      if (done) done();
    } catch (err) { toast(err.message, 'error'); }
  });
}
