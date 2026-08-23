import { api, auth } from '../api.js';
import { fmt, fmtDate, esc, toast } from '../util.js';
import { startTutorial } from '../tutorial.js';
import { changelogListHtml } from '../changelog.js';

export async function render(container, ctx) {
  const { state } = ctx;
  const u = state.data.user;
  const ref = state.reference;
  const faction = ref.factions[u.faction];
  const vacation = u.vacationUntil && u.vacationUntil > Date.now();

  container.innerHTML = `
    <h1 style="margin-bottom:12px">Einstellungen</h1>

    <div class="grid cols-2">
      <div class="panel accent-orange">
        <h2>Kommandantenprofil</h2>
        <table>
          <tr><td class="muted">Name</td><td>${esc(u.username)}</td></tr>
          <tr><td class="muted">Fraktion</td><td>${esc(faction?.name || u.faction)}</td></tr>
          <tr><td class="muted">Boni</td><td class="tiny">
            Forschung ×${faction?.bonus.researchSpeed} · Produktion ×${faction?.bonus.production} ·
            Waffen ×${faction?.bonus.weapons} · Schilde ×${faction?.bonus.shields} · Fracht ×${faction?.bonus.cargo}
          </td></tr>
          <tr><td class="muted">Punkte</td><td class="mono">${fmt(state.data.stats.points)} (Rang ${state.data.stats.rank ?? '–'})</td></tr>
        </table>
      </div>

      <div class="panel accent-blue">
        <h2>Zugangscode ändern</h2>
        <div class="field"><label>Aktueller Code</label><input type="password" id="pw-current"></div>
        <div class="field"><label>Neuer Code (min. 8 Zeichen)</label><input type="password" id="pw-new"></div>
        <button id="pw-save">Ändern</button>
      </div>

      <div class="panel accent-green">
        <h2>Urlaubsmodus</h2>
        <p class="small muted">Im Urlaubsmodus kann Ihr Imperium nicht angegriffen werden.</p>
        ${vacation
          ? `<p class="small ok" style="margin:8px 0">Aktiv bis ${fmtDate(u.vacationUntil)}</p>
             <button class="secondary" id="vac-off">Beenden</button>`
          : `<div class="row" style="margin-top:8px">
               <input type="number" id="vac-days" min="1" max="60" value="7" style="width:90px">
               <button id="vac-on">Aktivieren</button>
             </div>`}
      </div>

      <div class="panel accent-blue">
        <h2>Einführung</h2>
        <p class="small muted">Die Einführung für neue Kommandanten noch einmal durchgehen.</p>
        <button id="tut-restart" style="margin-top:8px">Einführung erneut ansehen</button>
      </div>

      <div class="panel accent-lilac" style="grid-column:1/-1">
        <h2>Änderungsprotokoll</h2>
        <div id="changelog-list"><div class="loader">Wird geladen</div></div>
      </div>

      <div class="panel accent-red">
        <h2>Konto löschen</h2>
        <p class="small muted">Löscht das Konto samt aller Planeten unwiderruflich.</p>
        <div class="field" style="margin-top:8px"><label>Zugangscode zur Bestätigung</label>
          <input type="password" id="del-pw"></div>
        <button class="danger" id="del-account">Endgültig löschen</button>
      </div>

      <div class="panel">
        <h2>Serverinformationen</h2>
        <table>
          <tr><td class="muted">Universum</td><td class="mono">${ref.universe.quadrants} × ${ref.universe.systems} × ${ref.universe.slots}</td></tr>
          <tr><td class="muted">Wirtschaftstempo</td><td class="mono">${ref.speed.economy}×</td></tr>
          <tr><td class="muted">Bautempo</td><td class="mono">${ref.speed.build}×</td></tr>
          <tr><td class="muted">Flottentempo</td><td class="mono">${ref.speed.fleet}×</td></tr>
        </table>
      </div>
    </div>`;

  document.getElementById('tut-restart').addEventListener('click', () => startTutorial());

  changelogListHtml()
    .then((html) => { const n = document.getElementById('changelog-list'); if (n) n.innerHTML = html; })
    .catch(() => { const n = document.getElementById('changelog-list');
      if (n) n.innerHTML = '<p class="muted small">Konnte nicht geladen werden.</p>'; });

  document.getElementById('pw-save').addEventListener('click', async () => {
    try {
      const res = await api.post('/auth/password', {
        current: document.getElementById('pw-current').value,
        next: document.getElementById('pw-new').value,
      });
      auth.token = res.token;
      toast('Zugangscode geändert.', 'success');
      document.getElementById('pw-current').value = '';
      document.getElementById('pw-new').value = '';
    } catch (err) { toast(err.message, 'error'); }
  });

  document.getElementById('vac-on')?.addEventListener('click', async () => {
    await api.post('/auth/vacation', { days: Number(document.getElementById('vac-days').value) });
    toast('Urlaubsmodus aktiviert.', 'success');
    await ctx.refresh(true);
  });
  document.getElementById('vac-off')?.addEventListener('click', async () => {
    await api.del('/auth/vacation');
    toast('Urlaubsmodus beendet.', 'success');
    await ctx.refresh(true);
  });

  document.getElementById('del-account').addEventListener('click', async () => {
    if (!confirm('Konto wirklich unwiderruflich löschen?')) return;
    try {
      await api.post('/auth/delete-account', { password: document.getElementById('del-pw').value });
      auth.token = null;
      location.reload();
    } catch (err) { toast(err.message, 'error'); }
  });
}
