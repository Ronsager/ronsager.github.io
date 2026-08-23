/** Formatierung, DOM-Hilfen und Meldungen. */

const nf = new Intl.NumberFormat('de-DE');

export const fmt = (n) => nf.format(Math.floor(Number(n) || 0));

/** Große Zahlen kompakt: 1.234.567 → 1,23 Mio */
export function fmtShort(n) {
  const v = Math.floor(Number(n) || 0);
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(2).replace('.', ',') + ' Mrd';
  if (abs >= 1e6) return (v / 1e6).toFixed(2).replace('.', ',') + ' Mio';
  if (abs >= 1e4) return nf.format(Math.round(v / 1000)) + 'k';
  return nf.format(v);
}

/** Millisekunden als Countdown: 2t 04:31:09 */
export function fmtDuration(ms) {
  if (ms === Infinity) return '∞';
  let s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600);  s -= h * 3600;
  const m = Math.floor(s / 60);    s -= m * 60;
  const pad = (v) => String(v).padStart(2, '0');
  if (d > 0) return `${d}t ${pad(h)}:${pad(m)}:${pad(s)}`;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export const fmtDate = (ts) =>
  ts ? new Date(ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–';

export const fmtCoords = (c) => (c ? `[${c.q}:${c.s}:${c.p}]` : '–');

/** HTML-Escaping für alle Benutzereingaben. */
export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function toast(message, kind = 'info', ms = 4500) {
  const box = document.getElementById('toasts');
  const node = el(`<div class="toast ${kind}">${esc(message)}</div>`);
  box.appendChild(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity .3s';
    setTimeout(() => node.remove(), 300);
  }, ms);
}

export function modal(html) {
  const backdrop = document.getElementById('modal-backdrop');

  // Das Fenster-Element gegen eine frische Kopie tauschen. Ansichten hängen
  // ihre Klick-Behandlung an dieses Element; ohne den Austausch bliebe die
  // Behandlung jedes früheren Aufrufs bestehen, und ein einzelner Klick löste
  // so oft aus, wie das Fenster zuvor geöffnet worden war – bis der Server die
  // Anfragen wegen Überlast abwies und Bestätigungsabfragen sich scheinbar
  // nicht mehr schließen ließen.
  const stale = document.getElementById('modal');
  const box = stale.cloneNode(false);
  stale.replaceWith(box);

  box.innerHTML = html;
  backdrop.classList.remove('hidden');
  return box;
}

export function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  const box = document.getElementById('modal');
  if (box) box.innerHTML = '';
}

document.getElementById('modal-backdrop')?.addEventListener('click', (e) => {
  if (e.target.id === 'modal-backdrop') closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

export const RES_LABELS = { duranium: 'Duranium', dilithium: 'Dilithium', deuterium: 'Deuterium', energy: 'Energie' };

/** Kostenblock rendern; markiert nicht bezahlbare Posten rot. */
export function renderCost(cost, available) {
  return Object.entries(cost)
    .filter(([, v]) => v > 0)
    .map(([res, v]) => {
      const short = available && res !== 'energy' && (available[res] ?? 0) < v;
      return `<span class="cost-item ${short ? 'insufficient' : ''}">
        <span class="cost-label">${RES_LABELS[res] || res}:</span>
        <span class="cost-value mono">${fmt(v)}</span></span>`;
    })
    .join('');
}

/** Registriert ein Element, dessen Text jede Sekunde als Countdown aktualisiert wird. */
const timers = new Set();
export function countdown(node, targetTs, onDone) {
  const entry = { node, targetTs, onDone, done: false };
  timers.add(entry);
  tickTimers();
  return entry;
}
export function clearCountdowns() { timers.clear(); }

function tickTimers() {
  for (const t of [...timers]) {
    if (!t.node.isConnected) { timers.delete(t); continue; }
    const left = t.targetTs - Date.now();
    t.node.textContent = fmtDuration(left);
    if (left <= 0 && !t.done) {
      t.done = true;
      timers.delete(t);
      if (t.onDone) t.onDone();
    }
  }
}
setInterval(tickTimers, 1000);
