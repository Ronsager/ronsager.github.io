/**
 * Einführung für neue Kommandanten.
 *
 * Wird nach der ersten Anmeldung einmalig angezeigt und lässt sich in jedem
 * Schritt überspringen. Der Status liegt am Konto (Spalte users.tutorial_seen),
 * nicht im Browser – so erscheint die Einführung auch nach einem Gerätewechsel
 * nicht erneut. Über die Einstellungen kann sie jederzeit neu gestartet werden.
 */
import { api } from './api.js';
import { esc } from './util.js';

const STEPS = [
  {
    title: 'Willkommen an Bord, Kommandant',
    view: null,
    body: `
      <p>Das Sternenflottenkommando hat Ihnen das Kommando über eine Heimatwelt übertragen.
      Ihr Auftrag: die Welt ausbauen, Technologien erforschen, eine Flotte aufstellen und
      sich im Quadranten behaupten.</p>
      <p>Diese Einführung dauert eine Minute. Sie können sie jederzeit über
      <b>Überspringen</b> beenden und später unter <b>Einstellungen</b> erneut aufrufen.</p>`,
  },
  {
    title: 'Ihre drei Rohstoffe',
    view: null,
    body: `
      <div class="tut-res">
        <div><b class="tut-dur">Duranium</b><span>Baumetall für Gebäude, Schiffe und Verteidigung.</span></div>
        <div><b class="tut-dil">Dilithium</b><span>Kristalle für Warpkerne, Elektronik und Forschung.</span></div>
        <div><b class="tut-deu">Deuterium</b><span>Treibstoff für Flottenflüge und Fusionsreaktoren.</span></div>
        <div><b class="tut-ene">Energie</b><span>Kein Vorrat, sondern eine Bilanz. Reicht sie nicht,
          drosseln alle Minen ihre Förderung.</span></div>
      </div>
      <p>Die Werte oben in der Leiste laufen in Echtzeit weiter – auch wenn Sie nicht angemeldet sind.</p>`,
  },
  {
    title: 'Erste Schritte: die Förderung',
    view: 'buildings',
    body: `
      <p>Gehen Sie auf <b>Anlagen</b> und bauen Sie in dieser Reihenfolge:</p>
      <ol>
        <li><b>Duranium-Mine</b> und <b>Dilithium-Raffinerie</b> abwechselnd auf Stufe 5</li>
        <li><b>Solar-Kollektor-Feld</b>, sobald die Energiebilanz ins Minus rutscht</li>
        <li><b>Deuterium-Extraktor</b>, sobald Sie fliegen wollen</li>
      </ol>
      <p class="tut-hint">Achten Sie auf die Energieanzeige. Wird sie rot, fördern Ihre Minen
      nur noch anteilig – ein neues Solarfeld behebt das sofort.</p>`,
  },
  {
    title: 'Forschung',
    view: 'research',
    body: `
      <p>Das <b>Wissenschaftslabor</b> schaltet den gesamten Technologiebaum frei – ohne
      Labor geht in der Forschung nichts.</p>
      <p>Drei Technologien lohnen früh:</p>
      <ul>
        <li><b>Energietechnologie</b> – Voraussetzung für fast alles Weitere</li>
        <li><b>Positronik</b> – jede Stufe erlaubt einen zusätzlichen Flottenverband</li>
        <li><b>Astrometrie</b> – je zwei Stufen erlauben eine weitere Kolonie</li>
      </ul>`,
  },
  {
    title: 'Werft und Flotte',
    view: 'shipyard',
    body: `
      <p>Die <b>Sternenflotten-Werft</b> benötigt eine Drohnen-Werkstatt der Stufe 2.
      Danach bauen Sie Schiffe.</p>
      <p>Für den Anfang genügen:</p>
      <ul>
        <li><b>Transport-Shuttles</b> für Rohstofftransporte und zum Plündern</li>
        <li><b>Sensorsonden</b> zum Auskundschaften fremder Planeten</li>
        <li><b>Jäger der Peregrine-Klasse</b> als erste Kampfeinheiten</li>
      </ul>
      <p class="tut-hint">Schicken Sie nie Ihre gesamte Flotte los – ein Gegenangriff auf
      den leeren Planeten trifft Sie sonst hart.</p>`,
  },
  {
    title: 'Der Quadrant',
    view: 'galaxy',
    body: `
      <p>Unter <b>Galaxie</b> sehen Sie die Nachbarschaft. Koordinaten lauten
      <span class="mono">[Quadrant:System:Position]</span>.</p>
      <p>Von dort starten Sie direkt Aufträge:</p>
      <ul>
        <li><b>Spionage</b> – Sonden liefern Rohstoff- und Flottendaten</li>
        <li><b>Angriff</b> – erst spionieren, dann angreifen</li>
        <li><b>Kolonisieren</b> – freie Plätze mit einem Kolonieschiff besiedeln</li>
        <li><b>Bergen</b> – Trümmerfelder nach Schlachten einsammeln</li>
      </ul>`,
  },
  {
    title: 'Bereit zum Ablegen',
    view: null,
    body: `
      <p>Das war alles Nötige. Der schnellste Einstieg:</p>
      <ol>
        <li>Duranium-Mine und Dilithium-Raffinerie hochziehen</li>
        <li>Solarfeld nachziehen, sobald die Energie knapp wird</li>
        <li>Wissenschaftslabor bauen und Energietechnologie erforschen</li>
      </ol>
      <p>Ihre Nachrichten finden Sie unter <b>Nachrichten</b> – dort landen Gefechts-
      und Spionageberichte.</p>
      <p class="tut-hint">Diese Einführung erreichen Sie jederzeit wieder über
      <b>Einstellungen → Einführung erneut ansehen</b>.</p>`,
  },
];

let index = 0;
let onFinish = null;

function render() {
  const step = STEPS[index];
  const host = document.getElementById('tutorial');
  const dots = STEPS.map((_, i) =>
    `<span class="tut-dot ${i === index ? 'active' : ''} ${i < index ? 'done' : ''}"></span>`).join('');

  host.innerHTML = `
    <div class="tut-box" role="dialog" aria-modal="true" aria-label="Einführung">
      <div class="tut-head">
        <span class="tut-step">Schritt ${index + 1} von ${STEPS.length}</span>
        <h2>${esc(step.title)}</h2>
      </div>
      <div class="tut-content">${step.body}</div>
      <div class="tut-dots">${dots}</div>
      <div class="tut-actions">
        <button class="secondary" id="tut-skip">Überspringen</button>
        <span style="flex:1"></span>
        ${index > 0 ? '<button class="secondary" id="tut-back">Zurück</button>' : ''}
        <button id="tut-next">${index === STEPS.length - 1 ? 'Los geht’s' : 'Weiter'}</button>
      </div>
    </div>`;
  host.classList.remove('hidden');

  // Passend zum Schritt die zugehörige Ansicht im Hintergrund öffnen
  if (step.view && location.hash.replace('#', '').split('/')[0] !== step.view) {
    location.hash = step.view;
  }

  document.getElementById('tut-skip').onclick = () => close(true);
  document.getElementById('tut-next').onclick = () => {
    if (index === STEPS.length - 1) close(true);
    else { index++; render(); }
  };
  const back = document.getElementById('tut-back');
  if (back) back.onclick = () => { index--; render(); };
}

async function close(markSeen) {
  const host = document.getElementById('tutorial');
  host.classList.add('hidden');
  host.innerHTML = '';
  document.removeEventListener('keydown', onKey);
  if (markSeen) {
    try { await api.post('/game/tutorial', { seen: true }); } catch { /* nicht kritisch */ }
  }
  if (onFinish) onFinish();
}

function onKey(e) {
  if (e.key === 'Escape') close(true);
  else if (e.key === 'ArrowRight' && index < STEPS.length - 1) { index++; render(); }
  else if (e.key === 'ArrowLeft' && index > 0) { index--; render(); }
}

/** Einführung starten. */
export function startTutorial(done = null) {
  index = 0;
  onFinish = done;
  document.addEventListener('keydown', onKey);
  render();
}

export const tutorialStepCount = STEPS.length;
