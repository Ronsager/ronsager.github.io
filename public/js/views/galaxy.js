import { api } from '../api.js';
import { fmt, esc, toast, modal, closeModal } from '../util.js';

let current = { q: 1, s: 1 };

export async function render(container, ctx) {
  const { state } = ctx;
  const own = state.data.planet.coords;
  const param = location.hash.split('/')[1];
  const preset = param?.match(/^(\d+):(\d+)$/);
  if (preset) current = { q: Number(preset[1]), s: Number(preset[2]) };
  else if (current.q === 1 && current.s === 1) current = { q: own.q, s: own.s };

  await load(container, ctx);
}

async function load(container, ctx) {
  const { state } = ctx;
  const data = await api.get(`/galaxy?q=${current.q}&s=${current.s}`);
  const uni = data.universe;

  const rows = data.slots.map((slot) => {
    const p = slot.planet;
    const coords = `${data.coords.q}:${data.coords.s}:${slot.position}`;
    if (!p) {
      return `<tr class="galaxy-row empty">
        <td class="mono">${slot.position}</td>
        <td colspan="4" class="muted small">unbesiedelt</td>
        <td>${slot.debris ? `<span class="tag debris">${fmt(slot.debris.duranium)} / ${fmt(slot.debris.dilithium)}</span>` : ''}</td>
        <td class="right">
          <a class="btn small secondary" href="#fleet/${coords}/colonize">Kolonisieren</a>
          ${slot.debris ? `<a class="btn small secondary" href="#fleet/${coords}/recycle">Bergen</a>` : ''}
        </td>
      </tr>`;
    }
    const o = p.owner;
    const tags = [
      p.isOwn ? '<span class="tag own">eigen</span>' : '',
      o.inactive ? '<span class="tag inactive">inaktiv</span>' : '',
      o.vacation ? '<span class="tag vacation">Urlaub</span>' : '',
      o.banned ? '<span class="tag banned">gesperrt</span>' : '',
    ].join(' ');

    return `<tr class="galaxy-row ${p.isOwn ? 'own' : ''}">
      <td class="mono">${slot.position}</td>
      <td><span class="planet-name">${esc(p.name)}</span>
        <div class="tiny muted">${esc(p.typeName)} · ${p.temp.min}…${p.temp.max} °C</div></td>
      <td><a href="#" data-player="${o.id}">${esc(o.username)}</a> ${tags}
        <div class="tiny muted">${fmt(o.points)} Punkte</div></td>
      <td>${o.alliance ? `<span class="tag">${esc(o.alliance.tag)}</span>` : ''}</td>
      <td>${slot.debris ? `<span class="tag debris">${fmt(slot.debris.duranium)} / ${fmt(slot.debris.dilithium)}</span>` : ''}</td>
      <td class="right nowrap">
        ${p.isOwn
          ? `<a class="btn small secondary" href="#fleet/${coords}/deploy">Stationieren</a>`
          : `<a class="btn small secondary" href="#fleet/${coords}/espionage">Spionage</a>
             <a class="btn small danger" href="#fleet/${coords}/attack">Angriff</a>
             <a class="btn small secondary" href="#fleet/${coords}/transport">Transport</a>`}
        ${slot.debris ? `<a class="btn small secondary" href="#fleet/${coords}/recycle">Bergen</a>` : ''}
      </td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <h1 style="margin-bottom:12px">Galaxiekarte</h1>
    <div class="panel accent-orange">
      <div class="galaxy-nav">
        <button class="secondary small" id="prev-sys">◀ System</button>
        <label style="margin:0">Quadrant</label>
        <input type="number" id="nav-q" min="1" max="${uni.quadrants}" value="${data.coords.q}">
        <label style="margin:0">System</label>
        <input type="number" id="nav-s" min="1" max="${uni.systems}" value="${data.coords.s}">
        <button id="go">Anzeigen</button>
        <button class="secondary small" id="next-sys">System ▶</button>
        <span class="spacer" style="flex:1"></span>
        <select id="jump-own" style="width:auto">
          <option value="">— zu eigenem Planeten springen —</option>
          ${data.own.map((p) => `<option value="${p.coords.q}:${p.coords.s}">${esc(p.name)} [${p.coords.q}:${p.coords.s}:${p.coords.p}]</option>`).join('')}
        </select>
      </div>
      <div class="table-wrap"><table>
        <tr><th>Pos</th><th>Planet</th><th>Kommandant</th><th>Verband</th><th>Trümmerfeld</th><th class="right">Aktionen</th></tr>
        ${rows}
      </table></div>
      <p class="tiny muted" style="margin-top:8px">
        Universum: ${uni.quadrants} Quadranten × ${uni.systems} Systeme × ${uni.slots} Planeten.
        Trümmerfelder zeigen Duranium / Dilithium.</p>
    </div>
  `;

  const go = (q, s) => {
    current = {
      q: Math.min(uni.quadrants, Math.max(1, q)),
      s: Math.min(uni.systems, Math.max(1, s)),
    };
    load(container, ctx);
  };

  document.getElementById('go').addEventListener('click', () =>
    go(Number(document.getElementById('nav-q').value), Number(document.getElementById('nav-s').value))
  );
  document.getElementById('prev-sys').addEventListener('click', () => go(current.q, current.s - 1));
  document.getElementById('next-sys').addEventListener('click', () => go(current.q, current.s + 1));
  document.getElementById('nav-s').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') go(Number(document.getElementById('nav-q').value), Number(e.target.value));
  });
  document.getElementById('jump-own').addEventListener('change', (e) => {
    if (!e.target.value) return;
    const [q, s] = e.target.value.split(':').map(Number);
    go(q, s);
  });

  container.querySelectorAll('[data-player]').forEach((a) =>
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      await showPlayer(Number(a.dataset.player));
    })
  );
}

async function showPlayer(id) {
  try {
    const p = await api.get(`/galaxy/player/${id}`);
    const box = modal(`
      <h2>${esc(p.username)}</h2>
      <table>
        <tr><td class="muted">Fraktion</td><td>${esc(p.faction)}</td></tr>
        <tr><td class="muted">Punkte</td><td class="mono">${fmt(p.points)}</td></tr>
        <tr><td class="muted">Flottenverband</td><td>${p.alliance ? `[${esc(p.alliance.tag)}] ${esc(p.alliance.name)}` : '–'}</td></tr>
        <tr><td class="muted">Planeten</td><td>${p.planets.map((pl) => `${esc(pl.name)} [${pl.coords.q}:${pl.coords.s}:${pl.coords.p}]`).join('<br>')}</td></tr>
      </table>
      <h3 style="margin:14px 0 6px">Nachricht senden</h3>
      <div class="field"><input id="pm-subject" placeholder="Betreff"></div>
      <div class="field"><textarea id="pm-body" rows="4" placeholder="Nachricht"></textarea></div>
      <div class="row">
        <button id="pm-send">Senden</button>
        <button class="secondary" id="pm-close">Schließen</button>
      </div>`);

    box.querySelector('#pm-close').addEventListener('click', closeModal);
    box.querySelector('#pm-send').addEventListener('click', async () => {
      try {
        await api.post('/messages/send', {
          to: id,
          subject: box.querySelector('#pm-subject').value,
          body: box.querySelector('#pm-body').value,
        });
        toast('Nachricht übermittelt.', 'success');
        closeModal();
      } catch (err) { toast(err.message, 'error'); }
    });
  } catch (err) { toast(err.message, 'error'); }
}
