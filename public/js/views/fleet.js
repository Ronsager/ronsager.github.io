import { api } from '../api.js';
import { fmt, fmtDuration, fmtCoords, esc, toast, countdown } from '../util.js';
import { icon } from '../icons.js';

const MISSION_OPTIONS = [
  ['attack', 'Angriff'], ['transport', 'Transport'], ['deploy', 'Stationieren'],
  ['colonize', 'Kolonisieren'], ['espionage', 'Spionage'], ['recycle', 'Trümmer sammeln'],
  ['hold', 'Halten'],
];

export async function render(container, ctx) {
  const { state, refresh } = ctx;
  const [data, shipData] = await Promise.all([
    api.get('/fleet'),
    api.get(`/fleet/ships?planetId=${state.planetId}`),
  ]);

  // Zielkoordinaten aus dem Hash übernehmen (#fleet/1:120:6/attack)
  const param = location.hash.split('/').slice(1);
  const preset = param[0]?.match(/^(\d+):(\d+):(\d+)$/);
  const presetMission = param[1] || '';

  const shipRows = shipData.ships.length
    ? shipData.ships.map((s) => `
        <tr>
          <td><span class="row-icon">${icon('ship', s.key)}</span>${esc(s.name)}</td>
          <td class="right mono">${fmt(s.count)}</td>
          <td class="right mono tiny muted">${fmt(s.cargo)}</td>
          <td style="width:130px">
            <div class="inline-field">
              <input type="number" min="0" max="${s.count}" value="0" data-ship="${esc(s.key)}">
              <button class="ghost small" data-max="${esc(s.key)}" data-count="${s.count}">Max</button>
            </div>
          </td>
        </tr>`).join('')
    : '<tr><td colspan="4" class="muted small">Auf diesem Planeten liegen keine flugfähigen Schiffe.</td></tr>';

  const activeRows = data.fleets.length
    ? data.fleets.map((f) => `
        <tr>
          <td>${esc(f.missionName)}<div class="tiny muted">${
            f.state === 'returning' ? 'Rückflug' : f.state === 'holding' ? 'hält Position' : 'Anflug'}</div></td>
          <td class="mono">${fmtCoords(f.origin)} → ${fmtCoords(f.target)}</td>
          <td class="tiny">${Object.entries(f.ships).map(([k, n]) =>
            `${esc(state.reference.ships[k]?.name || k)} ×${fmt(n)}`).join('<br>')}</td>
          <td class="tiny mono">${Object.entries(f.cargo).filter(([, v]) => v > 0)
            .map(([k, v]) => `${k.slice(0, 3).toUpperCase()} ${fmt(v)}`).join('<br>') || '–'}</td>
          <td class="mono nowrap" data-finish="${f.state === 'returning' ? f.returnAt : f.arriveAt}">${fmtDuration(f.etaMs)}</td>
          <td>${f.state !== 'returning'
            ? `<button class="danger small" data-recall="${f.id}">Zurückrufen</button>` : ''}</td>
        </tr>`).join('')
    : '<tr><td colspan="6" class="muted small">Keine Flotte unterwegs.</td></tr>';

  const incomingRows = data.incoming.length
    ? data.incoming.map((f) => `
        <tr>
          <td class="bad">${esc(f.missionName)}</td>
          <td>${esc(f.attacker)}</td>
          <td class="mono">${fmtCoords(f.from)} → ${esc(f.targetName)} ${fmtCoords(f.target)}</td>
          <td class="mono">${f.shipCount ? fmt(f.shipCount) : '?'}</td>
          <td class="mono warn nowrap" data-finish="${f.arriveAt}">${fmtDuration(f.etaMs)}</td>
        </tr>`).join('')
    : '';

  container.innerHTML = `
    <h1 style="margin-bottom:12px">Flottenkommando
      <span class="small muted">${data.slots.used} / ${data.slots.max} Verbände im Einsatz</span></h1>

    ${incomingRows ? `<div class="panel accent-red"><h2>⚠ Feindliche Bewegungen</h2>
      <div class="table-wrap"><table>
        <tr><th>Auftrag</th><th>Kommandant</th><th>Route</th><th>Schiffe</th><th>Ankunft</th></tr>
        ${incomingRows}</table></div></div>` : ''}

    <div class="panel accent-orange">
      <h2>Flotte im Einsatz</h2>
      <div class="table-wrap"><table>
        <tr><th>Auftrag</th><th>Route</th><th>Schiffe</th><th>Ladung</th><th>Verbleibend</th><th></th></tr>
        ${activeRows}
      </table></div>
    </div>

    <div class="panel accent-blue">
      <h2>Neuer Flottenverband · Start ${fmtCoords(shipData.coords)}</h2>
      <div class="grid cols-2">
        <div>
          <div class="table-wrap"><table>
            <tr><th>Schiffstyp</th><th class="right">Verfügbar</th><th class="right">Fracht</th><th>Anzahl</th></tr>
            ${shipRows}
          </table></div>
          <div class="row" style="margin-top:8px">
            <button class="ghost small" id="btn-all">Alle Schiffe</button>
            <button class="ghost small" id="btn-none">Zurücksetzen</button>
          </div>
        </div>

        <div>
          <div class="field">
            <label>Zielkoordinaten</label>
            <div class="row">
              <input type="number" id="t-q" min="1" placeholder="Quadrant" value="${preset ? preset[1] : shipData.coords.q}" style="width:90px">
              <input type="number" id="t-s" min="1" placeholder="System" value="${preset ? preset[2] : shipData.coords.s}" style="width:90px">
              <input type="number" id="t-p" min="1" placeholder="Planet" value="${preset ? preset[3] : ''}" style="width:90px">
            </div>
          </div>
          <div class="field">
            <label for="mission">Auftrag</label>
            <select id="mission">
              ${MISSION_OPTIONS.map(([k, n]) =>
                `<option value="${k}" ${k === presetMission ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="speed">Geschwindigkeit: <span id="speed-val">100</span> %</label>
            <input type="range" id="speed" min="10" max="100" step="10" value="100">
          </div>
          <div class="field" id="hold-field" style="display:none">
            <label for="hold-hours">Haltedauer (Stunden)</label>
            <input type="number" id="hold-hours" min="1" max="24" value="1">
          </div>

          <h3 style="margin:10px 0 6px">Ladung</h3>
          <div class="grid cols-3">
            ${['duranium', 'dilithium', 'deuterium'].map((r) => `
              <div class="field">
                <label>${r === 'duranium' ? 'Duranium' : r === 'dilithium' ? 'Dilithium' : 'Deuterium'}
                  <span class="muted">(${fmt(shipData.resources[r])})</span></label>
                <input type="number" min="0" value="0" data-cargo="${r}">
              </div>`).join('')}
          </div>
          <button class="ghost small" id="btn-fill">Frachtraum füllen</button>

          <div id="calc-box" class="small muted" style="margin:12px 0"></div>
          <div class="row">
            <button id="btn-calc" class="secondary">Berechnen</button>
            <button id="btn-send">Flotte entsenden</button>
          </div>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-finish]').forEach((n) =>
    countdown(n, Number(n.dataset.finish), () => refresh(true))
  );

  const shipInputs = () => [...container.querySelectorAll('[data-ship]')];
  const collectShips = () => {
    const out = {};
    for (const input of shipInputs()) {
      const n = Number(input.value) || 0;
      if (n > 0) out[input.dataset.ship] = n;
    }
    return out;
  };
  const collectCargo = () => {
    const out = {};
    for (const input of container.querySelectorAll('[data-cargo]')) out[input.dataset.cargo] = Number(input.value) || 0;
    return out;
  };
  const target = () => ({
    q: Number(document.getElementById('t-q').value) || 0,
    s: Number(document.getElementById('t-s').value) || 0,
    p: Number(document.getElementById('t-p').value) || 0,
  });

  document.getElementById('speed').addEventListener('input', (e) => {
    document.getElementById('speed-val').textContent = e.target.value;
  });
  document.getElementById('mission').addEventListener('change', (e) => {
    document.getElementById('hold-field').style.display = e.target.value === 'hold' ? '' : 'none';
  });

  container.addEventListener('click', (e) => {
    const maxBtn = e.target.closest('[data-max]');
    if (maxBtn) {
      container.querySelector(`[data-ship="${CSS.escape(maxBtn.dataset.max)}"]`).value = maxBtn.dataset.count;
    }
  });
  document.getElementById('btn-all').addEventListener('click', () =>
    shipInputs().forEach((i) => { i.value = i.max; })
  );
  document.getElementById('btn-none').addEventListener('click', () =>
    shipInputs().forEach((i) => { i.value = 0; })
  );

  let lastCalc = null;

  async function calculate(silent = false) {
    const ships = collectShips();
    const box = document.getElementById('calc-box');
    if (!Object.keys(ships).length) {
      box.innerHTML = '<span class="bad">Bitte Schiffe auswählen.</span>';
      return null;
    }
    try {
      const res = await api.post('/fleet/calculate', {
        planetId: state.planetId, ships, target: target(),
        mission: document.getElementById('mission').value,
        speedPercent: Number(document.getElementById('speed').value),
        holdHours: Number(document.getElementById('hold-hours')?.value) || 0,
      });
      lastCalc = res;
      const enough = res.available.deuterium >= res.fuel;
      box.innerHTML = `
        <b>Entfernung:</b> ${fmt(res.distance)} ·
        <b>Flugzeit:</b> ${fmtDuration(res.oneWayMs)} (Rückkehr ${fmtDuration(res.returnAt - Date.now())}) ·
        <b>Treibstoff:</b> <span class="${enough ? 'ok' : 'bad'}">${fmt(res.fuel)}</span> Deuterium ·
        <b>Frachtraum:</b> ${fmt(res.capacity)}
        <br><b>Ziel:</b> ${res.target.occupied
          ? `${esc(res.target.name)} – ${esc(res.target.owner)}${res.target.isOwn ? ' (eigener Planet)' : ''}`
          : 'unbesiedelt'}
        ${res.target.debris && (res.target.debris.duranium || res.target.debris.dilithium)
          ? ` · <span class="tag debris">Trümmerfeld ${fmt(res.target.debris.duranium)} / ${fmt(res.target.debris.dilithium)}</span>` : ''}`;
      return res;
    } catch (err) {
      box.innerHTML = `<span class="bad">${esc(err.message)}</span>`;
      if (!silent) toast(err.message, 'error');
      return null;
    }
  }

  document.getElementById('btn-calc').addEventListener('click', () => calculate());

  document.getElementById('btn-fill').addEventListener('click', async () => {
    const res = await calculate(true);
    if (!res) return;
    // Frachtraum gleichmäßig füllen, Treibstoff bleibt reserviert
    let free = res.capacity;
    const avail = { ...shipData.resources };
    avail.deuterium = Math.max(0, avail.deuterium - res.fuel);
    for (const r of ['duranium', 'dilithium', 'deuterium']) {
      const take = Math.min(free, avail[r]);
      container.querySelector(`[data-cargo="${r}"]`).value = Math.floor(take);
      free -= take;
    }
  });

  document.getElementById('btn-send').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const res = await api.post('/fleet/send', {
        planetId: state.planetId,
        mission: document.getElementById('mission').value,
        target: target(),
        ships: collectShips(),
        cargo: collectCargo(),
        speedPercent: Number(document.getElementById('speed').value),
        holdHours: Number(document.getElementById('hold-hours')?.value) || 0,
      });
      toast(`Flotte gestartet. Ankunft in ${fmtDuration(res.arriveAt - Date.now())}.`, 'success');
      location.hash = 'fleet';
      await refresh(true);
    } catch (err) {
      toast(err.message, 'error');
      e.target.disabled = false;
    }
  });

  container.addEventListener('click', async (e) => {
    const recall = e.target.closest('[data-recall]');
    if (!recall) return;
    try {
      await api.post('/fleet/recall', { fleetId: Number(recall.dataset.recall) });
      toast('Flotte kehrt um.', 'success');
      await refresh(true);
    } catch (err) { toast(err.message, 'error'); }
  });

  if (preset) calculate(true);
}
