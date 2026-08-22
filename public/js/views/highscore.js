import { api } from '../api.js';
import { fmt, esc } from '../util.js';

const TYPES = [['points', 'Gesamt'], ['eco', 'Wirtschaft'], ['res', 'Forschung'], ['mil', 'Militär']];
let type = 'points';
let page = 0;

export async function render(container, ctx) {
  const data = await api.get(`/highscore?type=${type}&page=${page}`);

  container.innerHTML = `
    <h1 style="margin-bottom:12px">Rangliste
      <span class="small muted">Ihr Platz: ${data.myRank ?? '–'} von ${data.total}</span></h1>
    <div class="subtabs">
      ${TYPES.map(([k, l]) => `<button data-type="${k}" class="${k === type ? 'active' : ''}">${l}</button>`).join('')}
    </div>
    <div class="panel accent-orange">
      <div class="table-wrap"><table>
        <tr><th>Platz</th><th>Kommandant</th><th>Verband</th><th>Fraktion</th>
            <th class="right">Punkte</th><th class="right">Planeten</th></tr>
        ${data.rows.map((r) => `
          <tr class="${r.isMe ? 'me' : ''}">
            <td class="mono">${r.rank}</td>
            <td>${esc(r.username)} ${r.banned ? '<span class="tag banned">gesperrt</span>' : ''}</td>
            <td>${r.alliance ? `<span class="tag">${esc(r.alliance.tag)}</span>` : ''}</td>
            <td class="tiny muted">${esc(r.faction)}</td>
            <td class="right mono">${fmt(r.points)}</td>
            <td class="right mono">${r.planets}</td>
          </tr>`).join('')}
      </table></div>
      ${data.pages > 1 ? `<div class="row" style="justify-content:center;margin-top:10px">
        <button class="secondary small" id="prev" ${page === 0 ? 'disabled' : ''}>◀</button>
        <span class="small muted">Seite ${page + 1} / ${data.pages}</span>
        <button class="secondary small" id="next" ${page + 1 >= data.pages ? 'disabled' : ''}>▶</button>
      </div>` : ''}
    </div>`;

  container.querySelectorAll('[data-type]').forEach((b) =>
    b.addEventListener('click', () => { type = b.dataset.type; page = 0; render(container, ctx); })
  );
  document.getElementById('prev')?.addEventListener('click', () => { page--; render(container, ctx); });
  document.getElementById('next')?.addEventListener('click', () => { page++; render(container, ctx); });
}
