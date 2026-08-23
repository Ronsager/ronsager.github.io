/** Gemeinsame Ansicht für Anlagen, Forschung, Werft und Verteidigung. */
import { api } from '../api.js';
import { fmt, fmtDuration, esc, el, toast, renderCost, countdown } from '../util.js';
import { icon } from '../icons.js';

const KIND_TITLE = {
  building: 'Planetare Anlagen',
  research: 'Forschungsprojekte',
  ship: 'Sternenflotten-Werft',
  defense: 'Planetare Verteidigung',
};

const CATEGORY_LABEL = {
  resource: 'Rohstoffgewinnung', storage: 'Lagerstätten', facility: 'Infrastruktur',
  basic: 'Grundlagenforschung', drive: 'Antriebstechnik', military: 'Militärtechnik',
  civil: 'Zivile Schiffe',
};

function queueHtml(queue, kind) {
  const relevant = queue.filter((q) =>
    kind === 'ship' || kind === 'defense' ? q.kind === 'ship' || q.kind === 'defense' : q.kind === kind
  );
  if (!relevant.length) return '<p class="muted small">Keine laufenden Aufträge.</p>';

  return relevant
    .map((q) => {
      const progress = Math.min(100, ((Date.now() - q.startAt) / Math.max(1, q.totalMs)) * 100);
      const title = q.demolish
        ? `Abriss: ${esc(q.name)} → Stufe ${q.level}`
        : q.kind === 'ship' || q.kind === 'defense'
          ? `${esc(q.name)} × ${q.amount - q.done}`
          : `${esc(q.name)} → Stufe ${q.level}`;
      return `<div class="queue-item ${q.demolish ? 'demolish' : ''}">
        <div style="flex:1">
          <div class="queue-name">${title}</div>
          <div class="progress"><div style="width:${progress}%"></div></div>
        </div>
        <span class="queue-time" data-finish="${q.finishAt}">${fmtDuration(q.remainingMs)}</span>
        <button class="secondary small" data-cancel="${q.id}">Abbrechen</button>
      </div>`;
    })
    .join('');
}

function cardHtml(item, kind, resources, activeKeys) {
  const isUnit = kind === 'ship' || kind === 'defense';
  const locked = !item.available;
  const active = activeKeys.has(item.key);

  const req = locked
    ? `<div class="tiny bad">Benötigt: ${item.requirements.map((r) => `${esc(r.name)} Stufe ${r.level}`).join(', ')}</div>`
    : '';

  const stats = item.stats
    ? `<div class="tiny muted">
        Schild ${fmt(item.stats.shield)} · Waffen ${fmt(item.stats.weapon)}
        ${item.stats.cargo ? ` · Fracht ${fmt(item.stats.cargo)}` : ''}
        ${item.stats.speed ? ` · Tempo ${fmt(item.stats.speed)}` : ''}
        ${item.stats.fuel ? ` · Verbrauch ${fmt(item.stats.fuel)}` : ''}
      </div>`
    : '';

  const levelBadge = isUnit
    ? (item.level ? `<span class="level">${fmt(item.level)} Stk.</span>` : '')
    : `<span class="level">Stufe ${item.level}${item.queuedLevel > item.level ? ` (+${item.queuedLevel - item.level})` : ''}</span>`;

  const amountInput = isUnit
    ? `<input type="number" min="1" max="10000" value="1" data-amount="${esc(item.key)}" style="width:76px">`
    : '';

  const demolish = kind === 'building' && item.level > 0
    ? `<button class="secondary small" data-demolish="${esc(item.key)}">Abreißen</button>` : '';

  return `<div class="card ${locked ? 'locked' : 'available'} ${active ? 'building-active' : ''}">
    <div class="card-head">
      <span class="card-icon">${icon(kind, item.key)}</span>
      <span class="card-title">${esc(item.name)}</span>
      ${levelBadge}
    </div>
    <div class="desc">${esc(item.description || '')}</div>
    ${stats}
    <div class="costs">${renderCost(item.cost, resources)}</div>
    <div class="tiny muted">Dauer: ${fmtDuration(item.timeMs)}${isUnit ? ' je Einheit' : ''}</div>
    ${req}
    <div class="actions">
      ${amountInput}
      <button data-build="${esc(item.key)}" ${locked || (!isUnit && active) ? 'disabled' : ''}
              ${!isUnit && active ? 'title="Diese Stufe wird gerade gebaut"' : ''}>
        ${!isUnit && active ? 'Im Bau …' : isUnit ? 'Bauen' : item.level > 0 ? 'Ausbauen' : 'Errichten'}
      </button>
      ${demolish}
    </div>
  </div>`;
}

export async function renderTech(container, ctx, kind) {
  const { state, refresh } = ctx;
  const data = await api.get(`/game/tech?planetId=${state.planetId}`);
  const items = { building: data.buildings, research: data.research, ship: data.ships, defense: data.defenses }[kind];
  const activeKeys = new Set(data.queue.filter((q) => q.kind === kind).map((q) => q.key));

  // Nach Kategorie gruppieren
  const groups = new Map();
  for (const item of items) {
    const cat = CATEGORY_LABEL[item.category] || 'Allgemein';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(item);
  }

  const fieldInfo = kind === 'building'
    ? `<span class="small muted">Bauflächen: <b class="mono">${data.fields.used} / ${data.fields.max}</b>
       ${data.fields.reserved > data.fields.used ? `(${data.fields.reserved - data.fields.used} reserviert)` : ''}</span>`
    : '';

  container.innerHTML = `
    <div class="row between" style="margin-bottom:12px">
      <h1>${KIND_TITLE[kind]}</h1>
      ${fieldInfo}
    </div>
    <div class="panel accent-orange">
      <h2>Warteschlange</h2>
      <div id="queue-box">${queueHtml(data.queue, kind)}</div>
    </div>
    ${[...groups.entries()]
      .map(
        ([cat, list]) => `<div class="panel">
          <h2>${esc(cat)}</h2>
          <div class="grid cols-3">${list.map((i) => cardHtml(i, kind, data.resources, activeKeys)).join('')}</div>
        </div>`
      )
      .join('')}
  `;

  // Countdowns aktivieren
  container.querySelectorAll('[data-finish]').forEach((node) => {
    countdown(node, Number(node.dataset.finish), () => refresh(true));
  });

  container.addEventListener('click', async (e) => {
    const buildBtn = e.target.closest('[data-build]');
    const cancelBtn = e.target.closest('[data-cancel]');
    const demolishBtn = e.target.closest('[data-demolish]');

    if (buildBtn) {
      const key = buildBtn.dataset.build;
      const amountNode = container.querySelector(`[data-amount="${CSS.escape(key)}"]`);
      const amount = amountNode ? Math.max(1, Number(amountNode.value) || 1) : 1;
      buildBtn.disabled = true;
      try {
        await api.post('/game/build', { planetId: state.planetId, kind, key, amount });
        toast('Auftrag erteilt.', 'success');
        await refresh(true);
      } catch (err) {
        toast(err.message, 'error');
        buildBtn.disabled = false;
      }
    } else if (cancelBtn) {
      try {
        await api.post('/game/cancel', { entryId: Number(cancelBtn.dataset.cancel) });
        toast('Auftrag abgebrochen, Rohstoffe erstattet.', 'success');
        await refresh(true);
      } catch (err) { toast(err.message, 'error'); }
    } else if (demolishBtn) {
      const key = demolishBtn.dataset.demolish;
      if (!confirm('Dieses Gebäude wirklich um eine Stufe zurückbauen? Es werden 70 % der Kosten erstattet.')) return;
      try {
        await api.post('/game/demolish', { planetId: state.planetId, key });
        toast('Abriss eingeleitet.', 'success');
        await refresh(true);
      } catch (err) { toast(err.message, 'error'); }
    }
  });
}
