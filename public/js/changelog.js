/**
 * Anzeige des Änderungsprotokolls.
 *
 * Nach einer Aktualisierung erscheint der neueste Eintrag einmalig als
 * Einblendung. Wird er weggeklickt, merkt sich der Server die gesehene
 * Version am Konto – der Hinweis kommt erst bei der nächsten Version wieder.
 * Über die Einstellungen sind alle Einträge jederzeit einsehbar.
 */
import { api } from './api.js';
import { esc, fmtDate } from './util.js';

/** Wandelt den einfachen Text in Absätze und Listen um. */
export function renderBody(body) {
  const lines = String(body || '').split('\n');
  let html = '';
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { if (inList) { html += '</ul>'; inList = false; } continue; }
    if (/^[-*•]\s+/.test(line)) {
      if (!inList) { html += '<ul class="cl-list">'; inList = true; }
      html += `<li>${esc(line.replace(/^[-*•]\s+/, ''))}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p>${esc(line)}</p>`;
    }
  }
  if (inList) html += '</ul>';
  return html || '<p class="muted">Keine Beschreibung hinterlegt.</p>';
}

/** Einmalige Einblendung nach einer Aktualisierung. */
export function showChangelogPopup(entry, onClose = null) {
  if (!entry) return;
  const host = document.getElementById('changelog');
  host.innerHTML = `
    <div class="cl-box" role="dialog" aria-modal="true" aria-label="Neu in dieser Version">
      <div class="cl-head">
        <span class="cl-badge">Neu</span>
        <div>
          <h2>${esc(entry.title || 'Version ' + entry.version)}</h2>
          <span class="cl-meta">Version ${esc(entry.version)} · ${fmtDate(entry.updatedAt || entry.createdAt)}</span>
        </div>
      </div>
      <div class="cl-content">${renderBody(entry.body)}</div>
      <div class="cl-actions">
        <span class="tiny muted" style="flex:1">Später unter Einstellungen einsehbar.</span>
        <button id="cl-close">Verstanden</button>
      </div>
    </div>`;
  host.classList.remove('hidden');

  const close = async () => {
    host.classList.add('hidden');
    host.innerHTML = '';
    document.removeEventListener('keydown', onKey);
    try { await api.post('/game/changelog/seen', { version: entry.version }); } catch { /* unkritisch */ }
    if (onClose) onClose();
  };
  function onKey(e) { if (e.key === 'Escape') close(); }

  document.getElementById('cl-close').onclick = close;
  host.onclick = (e) => { if (e.target === host) close(); };
  document.addEventListener('keydown', onKey);
}

/** Vollständige Liste, z. B. für die Einstellungen. */
export async function changelogListHtml() {
  const { entries } = await api.get('/game/changelog');
  if (!entries.length) return '<p class="muted small">Noch keine Einträge.</p>';
  return entries
    .map(
      (e, i) => `<details class="cl-entry" ${i === 0 ? 'open' : ''}>
        <summary>
          <b>${esc(e.title || 'Version ' + e.version)}</b>
          <span class="tiny muted">${esc(e.version)} · ${fmtDate(e.updatedAt || e.createdAt)}</span>
        </summary>
        <div class="cl-entry-body">${renderBody(e.body)}</div>
      </details>`
    )
    .join('');
}
