/**
 * Einführung für neue Kommandanten.
 *
 * Wird nach der ersten Anmeldung einmalig angezeigt und lässt sich in jedem
 * Schritt überspringen. Der Status liegt am Konto (Spalte users.tutorial_seen),
 * nicht im Browser – so erscheint die Einführung auch nach einem Gerätewechsel
 * nicht erneut. Über die Einstellungen kann sie jederzeit neu gestartet werden.
 *
 * Die Bilder sind echte Bildschirmfotos der laufenden Oberfläche mit
 * nummerierten Markierungen; erzeugt von scripts/generate-tutorial-images.mjs
 * und je Fraktion vorhanden, damit sie zum Design des Spielers passen.
 * Die Nummern in der Legende entsprechen den Marken im Bild.
 */
import { api } from './api.js';
import { esc } from './util.js';

const STEPS = [
  {
    title: 'Willkommen an Bord, Kommandant',
    view: null,
    body: `
      <p>Das Sternenflottenkommando hat Ihnen das Kommando über eine Heimatwelt
      übertragen. Ihr Auftrag: die Welt ausbauen, Technologien erforschen, eine
      Flotte aufstellen und sich im Quadranten behaupten.</p>
      <p>Das Spiel läuft <b>durchgehend weiter</b>, auch wenn Sie abgemeldet sind.
      Rohstoffe werden gefördert, Bauaufträge laufen ab, Flotten fliegen weiter.
      Sie müssen also nicht dauernd zusehen – ein paar Minuten am Tag genügen.</p>
      <p>Diese Einführung zeigt Ihnen anhand von Bildschirmfotos, welcher Knopf
      wofür da ist. Sie dauert etwa drei Minuten.</p>
      <p class="tut-hint">Steuerung: <b>Weiter</b> und <b>Zurück</b>, oder die
      Pfeiltasten ← und →. <b>Überspringen</b> beendet die Einführung sofort;
      unter <b>Einstellungen</b> lässt sie sich jederzeit erneut aufrufen.</p>`,
  },

  {
    title: 'Die Oberfläche im Überblick',
    view: 'overview',
    bild: 'uebersicht',
    breit: true,
    body: `<p>So ist der Bildschirm aufgebaut. Diese sechs Bereiche finden Sie
      auf jeder Seite an derselben Stelle:</p>`,
    legende: [
      ['Kopfzeile', 'Name des Spiels und Ihr Kommandantenname mit Fraktion, Punktzahl und Rang.'],
      ['Sternzeit', 'Die Uhr des Servers. Alle Bauzeiten und Flugzeiten richten sich nach ihr.'],
      ['Abmelden', 'Beendet die Sitzung. Ihr Imperium läuft danach ganz normal weiter.'],
      ['Rohstoffleiste', 'Ihr Vorrat auf dem gewählten Planeten. Die Zahlen zählen live hoch.'],
      ['Navigation', 'Alle Bereiche des Spiels. Der aktive ist hervorgehoben.'],
      ['Hauptbereich', 'Hier steht der Inhalt des gewählten Bereichs – hier die Übersicht Ihres Planeten.'],
    ],
    nach: `<p class="tut-hint">Auf dem Handy wandert die Navigation an den
      unteren Bildschirmrand, sonst ist alles gleich.</p>`,
  },

  {
    title: 'Die Rohstoffleiste lesen',
    view: 'overview',
    bild: 'rohstoffe',
    breit: true,
    body: `<p>Alles im Spiel kostet Rohstoffe. Die Leiste zeigt für jeden davon
      drei Dinge: den <b>Vorrat</b> (große Zahl), die <b>Förderung je Stunde</b>
      und die <b>Lagergröße</b>.</p>`,
    legende: [
      ['Duranium', 'Baumetall. Wird für fast jedes Gebäude, jedes Schiff und jede Verteidigungsanlage gebraucht.'],
      ['Dilithium', 'Kristalle für Warpkerne, Elektronik und Forschung. Immer knapper als Duranium.'],
      ['Deuterium', 'Treibstoff. Jeder Flottenflug verbraucht es, ebenso die Fusionsreaktoren.'],
      ['Energie', 'Kein Vorrat, sondern eine Bilanz: erzeugt gegen verbraucht. Die zweite Zahl zeigt beides.'],
      ['Planetenwahl', 'Haben Sie mehrere Kolonien, wechseln Sie hier zwischen ihnen. Alle Ansichten beziehen sich auf den hier gewählten Planeten.'],
    ],
    nach: `
      <p><b>Zwei Dinge, die Anfänger Rohstoffe kosten:</b></p>
      <ul>
        <li><b>Volles Lager.</b> Ist der Vorrat gleich der Lagergröße, wird nichts
        mehr gefördert – die Zahl färbt sich. Bauen Sie rechtzeitig Lagerstätten
        oder geben Sie die Rohstoffe aus.</li>
        <li><b>Energiemangel.</b> Wird die Energiebilanz negativ, fördern <i>alle</i>
        Minen nur noch anteilig. Ein zusätzliches Solar-Kollektor-Feld behebt das sofort.</li>
      </ul>`,
  },

  {
    title: 'Die Navigation',
    view: 'overview',
    bild: 'navigation',
    body: `<p>Die Einträge sind in drei Gruppen geordnet:</p>`,
    legende: [
      ['Imperium', 'Was Ihnen gehört: <b>Übersicht</b> (Zustand des Planeten), <b>Anlagen</b> (Gebäude bauen), <b>Forschung</b>, <b>Sternenwerft</b> (Schiffe) und <b>Verteidigung</b>.'],
      ['Operationen', 'Was nach draußen geht: <b>Flotte</b> (laufende Flüge), <b>Galaxie</b> (Nachbarschaft ansehen und Aufträge starten) und <b>Nachrichten</b> (Gefechts- und Spionageberichte).'],
      ['Gemeinschaft', '<b>Chat</b>, <b>Flottenverband</b> (Bündnisse), <b>Rangliste</b> und <b>Einstellungen</b>.'],
    ],
    nach: `<p class="tut-hint">Die Zahl neben <b>Nachrichten</b> zeigt ungelesene
      Berichte. Nach einem Angriff oder einer Spionage erscheint sie dort.</p>`,
  },

  {
    title: 'Anlagen bauen',
    view: 'buildings',
    bild: 'anlagen',
    body: `<p>Unter <b>Anlagen</b> steht jedes Gebäude auf einer eigenen Karte.
      So ist eine Karte aufgebaut:</p>`,
    legende: [
      ['Name', 'Was die Anlage ist. Das Sinnbild links zeigt ihre Art.'],
      ['Stufe', 'Der jetzige Ausbaustand. Steht dort „(+1)", ist die nächste Stufe bereits in Auftrag.'],
      ['Beschreibung', 'Was die Anlage bewirkt.'],
      ['Kosten', 'Was die <i>nächste</i> Stufe kostet. Fehlt Ihnen etwas davon, ist die Zahl rot.'],
      ['Ausbauen', 'Der eigentliche Bauknopf. Er heißt <b>Errichten</b> bei Stufe 0 und <b>Ausbauen</b> danach.'],
      ['Abreißen', 'Baut eine Stufe zurück. Sie erhalten 70 % der Kosten erstattet.'],
    ],
    nach: `
      <p><b>Wichtig zu wissen:</b></p>
      <ul>
        <li>Jede Stufe kostet deutlich mehr als die vorige. Die ersten Stufen sind
        billig, ab Stufe 15 wird es spürbar teuer.</li>
        <li>Solange eine Stufe gebaut wird, ist der Knopf gesperrt und zeigt
        <b>Im Bau …</b>. Sie können bei derselben Anlage also nicht mehrere Stufen
        gleichzeitig in Auftrag geben.</li>
        <li>Fehlt eine Voraussetzung, ist die Karte abgeblendet und nennt darunter,
        was gebraucht wird.</li>
      </ul>
      <p><b>Empfohlene Reihenfolge zum Start:</b> Duranium-Mine und
      Dilithium-Mine abwechselnd auf Stufe 5–8, dabei das Solar-Kollektor-Feld
      nachziehen, sobald die Energie knapp wird. Danach das Wissenschaftslabor.</p>`,
  },

  {
    title: 'Die Warteschlange',
    view: 'buildings',
    bild: 'warteschlange',
    breit: true,
    body: `<p>Jeder erteilte Auftrag landet oben in der Warteschlange und wird
      der Reihe nach abgearbeitet – auch während Sie abgemeldet sind.</p>`,
    legende: [
      ['Auftrag', 'Was gebaut wird und auf welche Stufe. Bei Schiffen steht dort die Stückzahl.'],
      ['Fortschritt', 'Der Balken füllt sich, bis der Auftrag fertig ist.'],
      ['Restzeit', 'Zählt sekundengenau herunter. Bei Null ist die Anlage fertig.'],
      ['Abbrechen', 'Bricht den Auftrag ab. Die eingesetzten Rohstoffe erhalten Sie vollständig zurück.'],
    ],
    nach: `<p class="tut-hint">Anlagen, Forschung und Werft haben getrennte
      Warteschlangen. Sie können also gleichzeitig ein Gebäude bauen, forschen
      und Schiffe fertigen.</p>`,
  },

  {
    title: 'Forschung',
    view: 'research',
    bild: 'forschung',
    breit: true,
    body: `<p>Forschung funktioniert wie das Bauen, nur gilt sie für Ihr ganzes
      Imperium statt für einen einzelnen Planeten. Voraussetzung ist das
      <b>Wissenschaftslabor</b> – ohne Labor geht in der Forschung nichts.</p>`,
    legende: [
      ['Freigeschaltete Technologie', 'Farbig dargestellt, mit Kosten und Dauer.'],
      ['Erforschen', 'Startet das Projekt. Es läuft in der Forschungs-Warteschlange.'],
      ['Gesperrte Technologie', 'Abgeblendet. Darunter steht genau, was noch fehlt – hier eine bestimmte Stufe einer anderen Technologie.'],
    ],
    nach: `
      <p><b>Drei Technologien lohnen sich früh:</b></p>
      <ul>
        <li><b>Energietechnologie</b> – Voraussetzung für fast alles Weitere und
        macht Fusionsreaktoren ergiebiger.</li>
        <li><b>Positronik</b> – jede Stufe erlaubt einen zusätzlichen Flottenverband,
        also einen weiteren gleichzeitigen Flug.</li>
        <li><b>Astrometrie</b> – je zwei Stufen erlauben eine weitere Kolonie.</li>
      </ul>`,
  },

  {
    title: 'Werft und Flotte',
    view: 'shipyard',
    bild: 'werft',
    body: `<p>Die <b>Sternenflotten-Werft</b> braucht eine Drohnen-Werkstatt der
      Stufe 2. Schiffskarten unterscheiden sich in zwei Punkten von Gebäuden:</p>`,
    legende: [
      ['Kampfwerte', 'Schild, Waffen, Frachtraum, Tempo und Verbrauch. Danach entscheiden Sie, was Sie bauen.'],
      ['Stückzahl', 'Anders als bei Gebäuden geben Sie hier an, wie viele Einheiten gebaut werden sollen.'],
      ['Bauen', 'Erteilt den Auftrag über die eingetragene Stückzahl.'],
    ],
    nach: `
      <p><b>Womit man anfängt:</b></p>
      <ul>
        <li><b>Transport-Shuttles</b> – für Rohstofftransporte zwischen eigenen
        Planeten und zum Plündern.</li>
        <li><b>Sensorsonden</b> – billig, schnell, und liefern vor jedem Angriff
        die nötigen Daten.</li>
        <li><b>Jäger der Peregrine-Klasse</b> – die ersten Kampfeinheiten.</li>
      </ul>
      <p class="tut-hint">Schicken Sie nie Ihre gesamte Flotte gleichzeitig los.
      Ein Gegenangriff auf den dann ungeschützten Planeten trifft Sie sonst hart.</p>`,
  },

  {
    title: 'Der Quadrant',
    view: 'galaxy',
    bild: 'galaxie',
    breit: true,
    body: `<p>Unter <b>Galaxie</b> sehen Sie ein Sonnensystem mit seinen fünfzehn
      Plätzen. Koordinaten lauten <span class="mono">[Quadrant:System:Position]</span>.</p>`,
    legende: [
      ['Systemwahl', 'Quadrant und System eintragen und auf <b>Anzeigen</b>, oder mit den Pfeilknöpfen ins Nachbarsystem wechseln.'],
      ['Eigener Planet', 'Ihre Welten sind hervorgehoben. Dorthin können Sie nur stationieren, nicht angreifen.'],
      ['Spionage', 'Schickt Sensorsonden. Der Bericht landet unter Nachrichten und nennt Rohstoffe, Flotte und Verteidigung.'],
      ['Angriff', 'Startet ein Gefecht. Erst spionieren, dann angreifen – blind anzugreifen kostet meist die Flotte.'],
      ['Kolonisieren', 'Besiedelt einen freien Platz mit einem Kolonieschiff. Erscheint nur bei unbesiedelten Positionen.'],
    ],
    nach: `<p class="tut-hint">Nach jedem Gefecht bleibt ein <b>Trümmerfeld</b>
      zurück. Mit <b>Bergen</b> holen Sie sich diese Rohstoffe – auch aus fremden
      Schlachten.</p>`,
  },

  {
    title: 'Bereit zum Ablegen',
    view: null,
    body: `
      <p>Das war alles Nötige. Der schnellste Einstieg in Stichpunkten:</p>
      <ol>
        <li>Duranium-Mine und Dilithium-Mine abwechselnd hochziehen.</li>
        <li>Solar-Kollektor-Feld nachziehen, sobald die Energiebilanz knapp wird.</li>
        <li>Wissenschaftslabor bauen, dann Energietechnologie erforschen.</li>
        <li>Drohnen-Werkstatt auf Stufe 2, danach die Werft.</li>
        <li>Ein paar Sensorsonden bauen und die Nachbarschaft ansehen.</li>
      </ol>
      <p>Gefechts- und Spionageberichte finden Sie unter <b>Nachrichten</b>,
      Fragen an die anderen Kommandanten stellen Sie im <b>Chat</b>.</p>
      <p class="tut-hint">Diese Einführung erreichen Sie jederzeit wieder über
      <b>Einstellungen → Einführung erneut ansehen</b>.</p>`,
  },
];

let index = 0;
let onFinish = null;

/** Bildpfad zur Fraktion des Spielers; unbekannte Werte fallen auf die Föderation zurück. */
function bildPfad(name) {
  const bekannt = ['federation', 'klingon', 'romulan', 'cardassian', 'ferengi'];
  const f = document.documentElement.dataset.faction;
  return `/img/tutorial/${bekannt.includes(f) ? f : 'federation'}/${name}.png`;
}

function legendeHtml(eintraege) {
  if (!eintraege?.length) return '';
  return `<ol class="tut-legende">${eintraege
    .map(([begriff, text]) => `<li><b>${esc(begriff)}</b> — ${text}</li>`)
    .join('')}</ol>`;
}

function render() {
  const step = STEPS[index];
  const host = document.getElementById('tutorial');
  const dots = STEPS.map((_, i) =>
    `<span class="tut-dot ${i === index ? 'active' : ''} ${i < index ? 'done' : ''}"></span>`).join('');

  /* Breite Bildschirmfotos werden auf schmalen Geräten nicht verkleinert,
     sondern seitlich verschiebbar gezeigt - sonst wäre die Schrift darin
     unlesbar klein. Der Hinweis darunter erscheint nur dort, wo er zutrifft. */
  const bild = step.bild
    ? `<figure class="tut-bild ${step.breit ? 'breit' : ''}">
         <div class="tut-bild-rolle">
           <img src="${bildPfad(step.bild)}" alt="Bildschirmfoto: ${esc(step.title)}" loading="eager">
         </div>
         ${step.breit ? '<figcaption>Auf schmalen Bildschirmen seitlich verschiebbar</figcaption>' : ''}
       </figure>`
    : '';

  host.innerHTML = `
    <div class="tut-box" role="dialog" aria-modal="true" aria-label="Einführung">
      <div class="tut-head">
        <span class="tut-step">Schritt ${index + 1} von ${STEPS.length}</span>
        <h2>${esc(step.title)}</h2>
      </div>
      <div class="tut-content">
        ${step.body}
        ${bild}
        ${legendeHtml(step.legende)}
        ${step.nach || ''}
      </div>
      <div class="tut-dots">${dots}</div>
      <div class="tut-actions">
        <button class="secondary" id="tut-skip">Überspringen</button>
        <span style="flex:1"></span>
        ${index > 0 ? '<button class="secondary" id="tut-back">Zurück</button>' : ''}
        <button id="tut-next">${index === STEPS.length - 1 ? 'Los geht’s' : 'Weiter'}</button>
      </div>
    </div>`;
  host.classList.remove('hidden');
  host.querySelector('.tut-content').scrollTop = 0;

  /* Ein Bildschirmfoto soll nie über seine eigene Auflösung hinaus vergrößert
     werden - sonst wirkt es aufgeblasen und drängt die Legende aus dem Blick.
     Kleiner darf es werden, damit es in schmale Kästen passt. */
  const foto = host.querySelector('.tut-bild img');
  if (foto) {
    const begrenzen = () => {
      if (foto.naturalWidth) foto.style.maxWidth = `${foto.naturalWidth}px`;
    };
    if (foto.complete) begrenzen();
    else foto.addEventListener('load', begrenzen, { once: true });
  }

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
