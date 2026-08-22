import { api } from '../api.js';
import { fmt, fmtShort, fmtDuration, fmtCoords, esc, toast, countdown } from '../util.js';

export async function render(container, ctx) {
  const { state, refresh } = ctx;
  const d = state.data;
  const p = d.planet;
  const fleetData = await api.get('/fleet').catch(() => ({ fleets: [], incoming: [], slots: { used: 0, max: 1 } }));
  const ref = state.reference;

  const typeName = ref.planetTypes.find((t) => t.key === p.type)?.name || p.type;

  const incomingHtml = fleetData.incoming.length
    ? `<div class="panel accent-red">
        <h2>⚠ Anfliegende Flotten</h2>
        ${fleetData.incoming.map((f) => `
          <div class="row between" style="border-bottom:1px solid var(--border);padding:6px 0">
            <span class="small"><b class="bad">${esc(f.missionName)}</b> von ${esc(f.attacker)}
              ${fmtCoords(f.from)} → ${esc(f.targetName)} ${fmtCoords(f.target)}
              ${f.shipCount ? `<span class="muted">(${fmt(f.shipCount)} Schiffe)</span>` : ''}</span>
            <span class="mono warn" data-finish="${f.arriveAt}">${fmtDuration(f.etaMs)}</span>
          </div>`).join('')}
      </div>`
    : '';

  const ownFleetsHtml = fleetData.fleets.length
    ? fleetData.fleets.map((f) => `
        <div class="row between" style="border-bottom:1px solid var(--border);padding:6px 0">
          <span class="small">${esc(f.missionName)}
            <span class="muted">${fmtCoords(f.origin)} → ${fmtCoords(f.target)}
            ${f.state === 'returning' ? '(Rückflug)' : f.state === 'holding' ? '(hält Position)' : ''}</span></span>
          <span class="mono" data-finish="${f.state === 'returning' ? f.returnAt : f.arriveAt}">${fmtDuration(f.etaMs)}</span>
        </div>`).join('')
    : '<p class="muted small">Alle Verbände liegen im Dock.</p>';

  const queueHtml = d.queue.length
    ? d.queue.map((q) => `
        <div class="row between" style="border-bottom:1px solid var(--border);padding:6px 0">
          <span class="small">${esc(q.name)}
            ${q.kind === 'ship' || q.kind === 'defense' ? `× ${q.amount - q.done}` : `→ Stufe ${q.level}`}</span>
          <span class="mono" data-finish="${q.finishAt}">${fmtDuration(q.remainingMs)}</span>
        </div>`).join('')
    : '<p class="muted small">Keine laufenden Bauvorhaben.</p>';

  const shipsList = Object.entries(p.ships).filter(([, n]) => n > 0);
  const defList = Object.entries(p.defenses).filter(([, n]) => n > 0);

  container.innerHTML = `
    <div class="row between" style="margin-bottom:14px">
      <h1>${esc(p.name)} <span class="muted mono">${fmtCoords(p.coords)}</span></h1>
      <button class="secondary small" id="btn-rename">Umbenennen</button>
    </div>

    ${incomingHtml}

    <div class="grid cols-4" style="margin-bottom:16px">
      <div class="stat-tile"><div class="stat-label">Gesamtpunkte</div><div class="stat-value">${fmt(d.stats.points)}</div>
        <div class="tiny muted">Rang ${d.stats.rank ?? '–'}</div></div>
      <div class="stat-tile"><div class="stat-label">Wirtschaft</div><div class="stat-value">${fmtShort(d.stats.eco)}</div></div>
      <div class="stat-tile"><div class="stat-label">Forschung</div><div class="stat-value">${fmtShort(d.stats.res)}</div></div>
      <div class="stat-tile"><div class="stat-label">Militär</div><div class="stat-value">${fmtShort(d.stats.mil)}</div></div>
    </div>

    <div class="grid cols-2">
      <div class="panel accent-orange">
        <h2>Planetendaten</h2>
        <table>
          <tr><td class="muted">Klassifikation</td><td>${esc(typeName)}</td></tr>
          <tr><td class="muted">Durchmesser</td><td class="mono">${fmt(p.diameter)} km</td></tr>
          <tr><td class="muted">Temperatur</td><td class="mono">${p.temp.min} °C bis ${p.temp.max} °C</td></tr>
          <tr><td class="muted">Bauflächen</td><td class="mono">${p.fields.used} / ${p.fields.max}</td></tr>
          <tr><td class="muted">Energiebilanz</td>
            <td class="mono ${p.production.energyProduced - p.production.energyNeeded < 0 ? 'bad' : 'ok'}">
              ${fmt(p.production.energyProduced - p.production.energyNeeded)}
              ${p.production.energyFactor < 1 ? `<span class="bad">(Förderung bei ${Math.round(p.production.energyFactor * 100)} %)</span>` : ''}</td></tr>
          <tr><td class="muted">Kolonien</td><td class="mono">${d.limits.planets.used} / ${d.limits.planets.max}</td></tr>
          <tr><td class="muted">Flottenverbände</td><td class="mono">${fleetData.slots.used} / ${fleetData.slots.max}</td></tr>
        </table>
      </div>

      <div class="panel accent-blue">
        <h2>Laufende Aufträge</h2>
        ${queueHtml}
        <h2 style="margin-top:14px">Flottenbewegungen</h2>
        ${ownFleetsHtml}
      </div>

      <div class="panel accent-green">
        <h2>Flotte im Orbit</h2>
        ${shipsList.length
          ? `<div class="table-wrap"><table>${shipsList.map(([k, n]) =>
              `<tr><td>${esc(ref.ships[k]?.name || k)}</td><td class="right mono">${fmt(n)}</td></tr>`).join('')}</table></div>`
          : '<p class="muted small">Keine Schiffe stationiert.</p>'}
      </div>

      <div class="panel accent-red">
        <h2>Verteidigungsanlagen</h2>
        ${defList.length
          ? `<div class="table-wrap"><table>${defList.map(([k, n]) =>
              `<tr><td>${esc(ref.defenses[k]?.name || k)}</td><td class="right mono">${fmt(n)}</td></tr>`).join('')}</table></div>`
          : '<p class="muted small">Der Planet ist ungeschützt.</p>'}
      </div>
    </div>

    <div class="panel">
      <h2>Kolonien</h2>
      <div class="table-wrap"><table>
        <tr><th>Planet</th><th>Koordinaten</th><th>Felder</th>
            <th class="right">Duranium</th><th class="right">Dilithium</th><th class="right">Deuterium</th></tr>
        ${d.planets.map((pl) => `
          <tr class="${pl.id === p.id ? 'me' : ''}">
            <td><a href="#overview" data-planet="${pl.id}">${esc(pl.name)}</a>
              ${pl.isHomeworld ? '<span class="tag">Heimat</span>' : ''}</td>
            <td class="mono">${fmtCoords(pl.coords)}</td>
            <td class="mono">${pl.fields.used}/${pl.fields.max}</td>
            <td class="right mono">${fmt(pl.resources.duranium)}</td>
            <td class="right mono">${fmt(pl.resources.dilithium)}</td>
            <td class="right mono">${fmt(pl.resources.deuterium)}</td>
          </tr>`).join('')}
      </table></div>
    </div>
  `;

  container.querySelectorAll('[data-finish]').forEach((n) =>
    countdown(n, Number(n.dataset.finish), () => refresh(true))
  );

  container.querySelectorAll('[data-planet]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      state.planetId = Number(a.dataset.planet);
      localStorage.setItem('stc_planet', state.planetId);
      refresh(true);
    })
  );

  document.getElementById('btn-rename')?.addEventListener('click', async () => {
    const name = prompt('Neuer Name des Planeten:', p.name);
    if (!name) return;
    try {
      await api.post('/game/planet/rename', { planetId: p.id, name });
      toast('Planet umbenannt.', 'success');
      await refresh(true);
    } catch (err) { toast(err.message, 'error'); }
  });
}
