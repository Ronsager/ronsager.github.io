/**
 * LCARS-Bildsprache: alle Grafiken werden als Inline-SVG erzeugt.
 *
 * Warum kein PNG/JPG: Inline-SVG ist von der Content-Security-Policy nicht
 * betroffen, bleibt in jeder Auflösung scharf, wiegt nur wenige Kilobyte und
 * übernimmt über `currentColor` automatisch die Farben des Interfaces.
 *
 * Alle Symbole nutzen dieselbe Zeichenfläche (64 × 64), damit sie sich
 * einheitlich skalieren lassen. Schiffe zeigen nach rechts.
 */

const svg = (content, extra = '') =>
  `<svg viewBox="0 0 64 64" class="icon" aria-hidden="true" focusable="false" ${extra}>${content}</svg>`;

/* ------------------------------------------------------------------ */
/* Schiffe – Silhouetten der Klassen                                   */
/* ------------------------------------------------------------------ */

const SHIP_ART = {
  // Typ-6-Shuttle: kompakter Keil
  small_cargo: `
    <path d="M14 26 L44 24 L54 32 L44 40 L14 38 Z" fill="currentColor"/>
    <rect x="18" y="29" width="9" height="6" fill="var(--bg-panel)"/>
    <rect x="44" y="20" width="4" height="6" fill="currentColor" opacity=".7"/>
    <rect x="44" y="38" width="4" height="6" fill="currentColor" opacity=".7"/>`,

  // Antares-Frachter: langer Rumpf mit Frachtcontainern
  large_cargo: `
    <path d="M8 30 L46 27 L58 32 L46 37 L8 34 Z" fill="currentColor"/>
    <rect x="14" y="18" width="10" height="9" rx="1" fill="currentColor" opacity=".75"/>
    <rect x="26" y="18" width="10" height="9" rx="1" fill="currentColor" opacity=".55"/>
    <rect x="14" y="37" width="10" height="9" rx="1" fill="currentColor" opacity=".75"/>
    <rect x="26" y="37" width="10" height="9" rx="1" fill="currentColor" opacity=".55"/>`,

  // Peregrine: schlanker Kurierjäger mit gepfeilten Flügeln
  light_fighter: `
    <path d="M20 31 L50 28 L58 32 L50 36 L20 33 Z" fill="currentColor"/>
    <path d="M22 32 L8 16 L18 18 L30 30 Z" fill="currentColor" opacity=".8"/>
    <path d="M22 32 L8 48 L18 46 L30 34 Z" fill="currentColor" opacity=".8"/>
    <circle cx="46" cy="32" r="2" fill="var(--bg-panel)"/>`,

  // Danube-Runabout: kastenförmig mit zwei Gondeln
  heavy_fighter: `
    <path d="M16 24 L46 24 L56 32 L46 40 L16 40 Z" fill="currentColor"/>
    <rect x="20" y="27" width="12" height="5" rx="1" fill="var(--bg-panel)"/>
    <rect x="10" y="16" width="30" height="6" rx="3" fill="currentColor" opacity=".8"/>
    <rect x="10" y="42" width="30" height="6" rx="3" fill="currentColor" opacity=".8"/>
    <circle cx="12" cy="19" r="2" fill="var(--sand)"/>
    <circle cx="12" cy="45" r="2" fill="var(--sand)"/>`,

  // Miranda: Untertassensektion mit Rollbalken
  cruiser: `
    <ellipse cx="30" cy="32" rx="20" ry="9" fill="currentColor"/>
    <ellipse cx="30" cy="32" rx="9" ry="4" fill="var(--bg-panel)" opacity=".55"/>
    <rect x="16" y="15" width="28" height="5" rx="2" fill="currentColor" opacity=".85"/>
    <rect x="20" y="20" width="4" height="5" fill="currentColor" opacity=".6"/>
    <rect x="36" y="20" width="4" height="5" fill="currentColor" opacity=".6"/>
    <rect x="14" y="42" width="26" height="5" rx="2.5" fill="currentColor" opacity=".8"/>
    <circle cx="16" cy="44.5" r="2" fill="var(--sand)"/>`,

  // Excelsior: klassische Linie aus Untertasse, Rumpf und zwei Gondeln
  battleship: `
    <ellipse cx="38" cy="26" rx="17" ry="7" fill="currentColor"/>
    <ellipse cx="38" cy="26" rx="7" ry="3" fill="var(--bg-panel)" opacity=".5"/>
    <path d="M14 32 L40 30 L46 34 L38 38 L14 38 Z" fill="currentColor" opacity=".9"/>
    <rect x="8" y="40" width="30" height="6" rx="3" fill="currentColor" opacity=".8"/>
    <rect x="8" y="14" width="26" height="5" rx="2.5" fill="currentColor" opacity=".65"/>
    <circle cx="10" cy="43" r="2.2" fill="var(--sand)"/>
    <circle cx="10" cy="16.5" r="2" fill="var(--sand)"/>`,

  // Galaxy: breite ovale Untertasse, kräftige Gondeln
  battlecruiser: `
    <ellipse cx="34" cy="24" rx="22" ry="9" fill="currentColor"/>
    <ellipse cx="34" cy="24" rx="9" ry="3.5" fill="var(--bg-panel)" opacity=".5"/>
    <path d="M16 33 L40 31 L48 36 L36 41 L16 40 Z" fill="currentColor" opacity=".9"/>
    <rect x="6" y="43" width="34" height="7" rx="3.5" fill="currentColor" opacity=".8"/>
    <circle cx="9" cy="46.5" r="2.5" fill="var(--sand)"/>
    <rect x="12" y="36" width="8" height="4" fill="currentColor" opacity=".6"/>`,

  // Defiant: kompakter Pfeilkopf ohne abgesetzte Untertasse
  bomber: `
    <path d="M12 32 L26 20 L48 26 L58 32 L48 38 L26 44 Z" fill="currentColor"/>
    <path d="M30 28 L44 30 L44 34 L30 36 Z" fill="var(--bg-panel)" opacity=".55"/>
    <rect x="14" y="22" width="12" height="4" rx="2" fill="currentColor" opacity=".7"/>
    <rect x="14" y="38" width="12" height="4" rx="2" fill="currentColor" opacity=".7"/>
    <circle cx="54" cy="32" r="2.5" fill="var(--red)"/>`,

  // Sovereign: gestreckte, spitz zulaufende Untertasse
  destroyer: `
    <path d="M12 30 Q34 18 56 30 Q34 34 12 30 Z" fill="currentColor"/>
    <path d="M16 32 L42 31 L50 35 L38 39 L16 37 Z" fill="currentColor" opacity=".9"/>
    <rect x="6" y="40" width="36" height="6" rx="3" fill="currentColor" opacity=".8"/>
    <rect x="6" y="20" width="24" height="4" rx="2" fill="currentColor" opacity=".55"/>
    <circle cx="9" cy="43" r="2.2" fill="var(--sand)"/>`,

  // Borg-Kubus: Würfel mit Strukturgitter
  deathstar: `
    <rect x="12" y="12" width="40" height="40" fill="currentColor"/>
    <path d="M12 25 H52 M12 39 H52 M25 12 V52 M39 12 V52"
          stroke="var(--bg-panel)" stroke-width="2" opacity=".8"/>
    <rect x="27" y="27" width="10" height="10" fill="var(--green)" opacity=".85"/>
    <path d="M12 12 H52 V52 H12 Z" fill="none" stroke="currentColor" stroke-width="3"/>`,

  // Olympic: charakteristische Kugelsektion
  colony_ship: `
    <circle cx="42" cy="26" r="12" fill="currentColor"/>
    <circle cx="42" cy="26" r="5" fill="var(--bg-panel)" opacity=".5"/>
    <path d="M12 34 L38 32 L44 36 L34 40 L12 40 Z" fill="currentColor" opacity=".9"/>
    <rect x="8" y="42" width="26" height="5" rx="2.5" fill="currentColor" opacity=".75"/>
    <circle cx="10" cy="44.5" r="2" fill="var(--sand)"/>`,

  // Nebula: Untertasse mit aufgesetztem Modul
  recycler: `
    <ellipse cx="32" cy="34" rx="19" ry="8" fill="currentColor"/>
    <ellipse cx="32" cy="34" rx="8" ry="3" fill="var(--bg-panel)" opacity=".5"/>
    <ellipse cx="32" cy="18" rx="14" ry="5" fill="currentColor" opacity=".8"/>
    <path d="M22 24 L26 28 M42 24 L38 28" stroke="currentColor" stroke-width="3"/>
    <path d="M50 30 L58 26 M50 38 L58 42" stroke="var(--ice)" stroke-width="2.5" opacity=".9"/>`,

  // Sensorsonde: schlanker Pfeil mit Sensorkegel
  espionage_probe: `
    <path d="M18 32 L44 26 L56 32 L44 38 Z" fill="currentColor"/>
    <circle cx="50" cy="32" r="3" fill="var(--ice)"/>
    <path d="M18 32 L8 24 M18 32 L8 40" stroke="currentColor" stroke-width="3"/>
    <path d="M56 32 q6 -6 10 0" fill="none" stroke="var(--ice)" stroke-width="2" opacity=".7"/>`,

  // Solarsatellit: Zentralkörper mit zwei Paneelflügeln
  solar_satellite: `
    <rect x="27" y="24" width="10" height="16" rx="2" fill="currentColor"/>
    <rect x="4" y="22" width="21" height="20" rx="1" fill="currentColor" opacity=".65"/>
    <rect x="39" y="22" width="21" height="20" rx="1" fill="currentColor" opacity=".65"/>
    <path d="M11 22 V42 M18 22 V42 M46 22 V42 M53 22 V42"
          stroke="var(--bg-panel)" stroke-width="1.5"/>
    <circle cx="32" cy="32" r="3" fill="var(--sand)"/>`,
};

/* ------------------------------------------------------------------ */
/* Gebäude                                                             */
/* ------------------------------------------------------------------ */

const BUILDING_ART = {
  duranium_mine: `
    <path d="M10 46 L22 20 L42 20 L54 46 Z" fill="currentColor" opacity=".85"/>
    <path d="M22 20 L26 46 M42 20 L38 46" stroke="var(--bg-panel)" stroke-width="2"/>
    <rect x="8" y="46" width="48" height="6" rx="2" fill="currentColor"/>`,
  dilithium_mine: `
    <path d="M32 10 L46 26 L32 54 L18 26 Z" fill="currentColor"/>
    <path d="M32 10 L32 54 M18 26 L46 26" stroke="var(--bg-panel)" stroke-width="2"/>
    <path d="M24 18 L40 18" stroke="var(--ice)" stroke-width="2.5"/>`,
  deuterium_synth: `
    <rect x="16" y="18" width="32" height="30" rx="4" fill="currentColor" opacity=".85"/>
    <path d="M32 18 V10 M22 18 V12 M42 18 V12" stroke="currentColor" stroke-width="3"/>
    <circle cx="32" cy="34" r="7" fill="var(--bg-panel)"/>
    <path d="M28 34 q4 -6 8 0 q-4 6 -8 0" fill="var(--ice)"/>`,
  solar_array: `
    <circle cx="32" cy="20" r="8" fill="var(--sand)"/>
    <path d="M32 6 V2 M32 38 V42 M18 20 H14 M50 20 H46 M22 10 L19 7 M42 10 L45 7"
          stroke="var(--sand)" stroke-width="2.5"/>
    <rect x="8" y="40" width="48" height="14" rx="2" fill="currentColor" opacity=".8"/>
    <path d="M20 40 V54 M32 40 V54 M44 40 V54" stroke="var(--bg-panel)" stroke-width="2"/>`,
  fusion_reactor: `
    <circle cx="32" cy="32" r="20" fill="none" stroke="currentColor" stroke-width="4"/>
    <circle cx="32" cy="32" r="7" fill="var(--sand)"/>
    <ellipse cx="32" cy="32" rx="20" ry="8" fill="none" stroke="currentColor" stroke-width="2.5" opacity=".7"/>
    <ellipse cx="32" cy="32" rx="8" ry="20" fill="none" stroke="currentColor" stroke-width="2.5" opacity=".7"/>`,
  duranium_storage: `
    <rect x="12" y="22" width="40" height="30" rx="3" fill="currentColor" opacity=".85"/>
    <path d="M12 22 L32 10 L52 22" fill="none" stroke="currentColor" stroke-width="4"/>
    <rect x="20" y="34" width="24" height="18" fill="var(--bg-panel)" opacity=".6"/>`,
  dilithium_storage: `
    <rect x="12" y="22" width="40" height="30" rx="3" fill="currentColor" opacity=".85"/>
    <path d="M12 22 L32 10 L52 22" fill="none" stroke="currentColor" stroke-width="4"/>
    <path d="M32 30 L40 38 L32 48 L24 38 Z" fill="var(--ice)"/>`,
  deuterium_tank: `
    <ellipse cx="32" cy="18" rx="18" ry="6" fill="currentColor"/>
    <path d="M14 18 V46 a18 6 0 0 0 36 0 V18" fill="currentColor" opacity=".8"/>
    <ellipse cx="32" cy="46" rx="18" ry="6" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="M24 32 h16" stroke="var(--lilac)" stroke-width="3"/>`,
  drone_factory: `
    <rect x="8" y="30" width="48" height="22" rx="2" fill="currentColor" opacity=".85"/>
    <path d="M14 30 V18 L24 24 V18 L34 24 V18 L44 24 V30" fill="currentColor"/>
    <circle cx="20" cy="42" r="4" fill="var(--bg-panel)"/>
    <circle cx="34" cy="42" r="4" fill="var(--bg-panel)"/>
    <circle cx="46" cy="42" r="4" fill="var(--bg-panel)"/>`,
  nanite_factory: `
    <circle cx="32" cy="32" r="6" fill="var(--green)"/>
    <g stroke="currentColor" stroke-width="2.5" fill="none">
      <circle cx="32" cy="12" r="4"/><circle cx="32" cy="52" r="4"/>
      <circle cx="14" cy="22" r="4"/><circle cx="50" cy="22" r="4"/>
      <circle cx="14" cy="42" r="4"/><circle cx="50" cy="42" r="4"/>
      <path d="M32 16 V26 M32 38 V48 M18 24 L27 29 M46 24 L37 29 M18 40 L27 35 M46 40 L37 35"/>
    </g>`,
  shipyard: `
    <path d="M6 44 H58" stroke="currentColor" stroke-width="4"/>
    <ellipse cx="32" cy="30" rx="16" ry="6" fill="currentColor"/>
    <path d="M12 44 V22 M52 44 V22 M12 22 H52" fill="none" stroke="currentColor" stroke-width="3" opacity=".7"/>
    <path d="M20 22 V30 M44 22 V30" stroke="var(--sand)" stroke-width="2"/>`,
  research_lab: `
    <path d="M26 10 V26 L14 48 a4 4 0 0 0 4 6 H46 a4 4 0 0 0 4 -6 L38 26 V10 Z"
          fill="currentColor" opacity=".85"/>
    <path d="M22 10 H42" stroke="currentColor" stroke-width="4"/>
    <path d="M19 40 H45" stroke="var(--ice)" stroke-width="3"/>
    <circle cx="27" cy="46" r="3" fill="var(--ice)"/>
    <circle cx="37" cy="48" r="2" fill="var(--ice)"/>`,
  terraformer: `
    <circle cx="32" cy="34" r="18" fill="currentColor" opacity=".8"/>
    <path d="M18 30 q8 -6 14 0 q6 6 14 0" fill="none" stroke="var(--green)" stroke-width="3"/>
    <path d="M16 40 q10 -5 16 0 q6 5 16 0" fill="none" stroke="var(--ice)" stroke-width="2.5"/>
    <path d="M32 16 V6 M22 18 L18 10 M42 18 L46 10" stroke="var(--sand)" stroke-width="2.5"/>`,
  fleet_depot: `
    <rect x="10" y="26" width="44" height="24" rx="3" fill="currentColor" opacity=".85"/>
    <path d="M10 26 L20 14 H44 L54 26" fill="none" stroke="currentColor" stroke-width="3"/>
    <path d="M22 50 V36 H42 V50" fill="var(--bg-panel)" opacity=".7"/>
    <circle cx="32" cy="20" r="3" fill="var(--sand)"/>`,
  torpedo_silo: `
    <rect x="14" y="24" width="36" height="28" rx="3" fill="currentColor" opacity=".85"/>
    <path d="M24 24 V14 a8 8 0 0 1 16 0 V24" fill="currentColor"/>
    <path d="M32 30 V46" stroke="var(--red)" stroke-width="4"/>
    <path d="M26 36 L32 30 L38 36" fill="none" stroke="var(--red)" stroke-width="3"/>`,
};

/* ------------------------------------------------------------------ */
/* Forschung – nach Fachgebiet gruppiert                               */
/* ------------------------------------------------------------------ */

const RESEARCH_ART = {
  energy_tech: `<path d="M36 6 L16 36 H30 L26 58 L48 26 H34 Z" fill="var(--sand)"/>`,
  laser_tech: `
    <path d="M6 32 H44" stroke="var(--red)" stroke-width="5"/>
    <path d="M44 22 L58 32 L44 42 Z" fill="currentColor"/>
    <circle cx="14" cy="32" r="4" fill="var(--red)"/>`,
  ion_tech: `
    <circle cx="32" cy="32" r="6" fill="var(--green)"/>
    <ellipse cx="32" cy="32" rx="24" ry="10" fill="none" stroke="currentColor" stroke-width="2.5"/>
    <ellipse cx="32" cy="32" rx="24" ry="10" fill="none" stroke="currentColor" stroke-width="2.5" transform="rotate(60 32 32)"/>
    <ellipse cx="32" cy="32" rx="24" ry="10" fill="none" stroke="currentColor" stroke-width="2.5" transform="rotate(120 32 32)"/>`,
  hyperspace_tech: `
    <path d="M8 32 q12 -20 24 0 q12 20 24 0" fill="none" stroke="var(--lilac)" stroke-width="3"/>
    <path d="M8 44 q12 -20 24 0 q12 20 24 0" fill="none" stroke="currentColor" stroke-width="2.5" opacity=".7"/>
    <path d="M8 20 q12 -20 24 0 q12 20 24 0" fill="none" stroke="currentColor" stroke-width="2.5" opacity=".7"/>`,
  plasma_tech: `
    <path d="M32 6 q10 14 10 22 a10 10 0 0 1 -20 0 q0 -8 10 -22 Z" fill="var(--red)"/>
    <path d="M32 22 q4 8 4 11 a4 4 0 0 1 -8 0 q0 -3 4 -11 Z" fill="var(--sand)"/>
    <path d="M16 48 H48" stroke="currentColor" stroke-width="4"/>`,
  combustion_drive: `
    <path d="M18 24 H42 L52 32 L42 40 H18 Z" fill="currentColor"/>
    <path d="M18 26 L6 32 L18 38 Z" fill="var(--sand)"/>
    <path d="M44 32 H60" stroke="var(--sand)" stroke-width="3" opacity=".6"/>`,
  impulse_drive: `
    <ellipse cx="38" cy="32" rx="16" ry="10" fill="currentColor"/>
    <path d="M22 32 L4 24 M22 32 L4 40 M22 32 L6 32" stroke="var(--ice)" stroke-width="3"/>
    <circle cx="42" cy="32" r="5" fill="var(--ice)"/>`,
  hyperspace_drive: `
    <circle cx="32" cy="32" r="10" fill="var(--lilac)"/>
    <circle cx="32" cy="32" r="18" fill="none" stroke="currentColor" stroke-width="3" opacity=".8"/>
    <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="2" opacity=".45"/>
    <circle cx="32" cy="32" r="4" fill="var(--bg-panel)"/>`,
  espionage_tech: `
    <circle cx="32" cy="32" r="6" fill="var(--ice)"/>
    <path d="M32 26 a20 20 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="3"/>
    <path d="M42 18 a26 26 0 0 1 0 28 M50 10 a38 38 0 0 1 0 44"
          fill="none" stroke="currentColor" stroke-width="3" opacity=".7"/>
    <path d="M22 18 a26 26 0 0 0 0 28 M14 10 a38 38 0 0 0 0 44"
          fill="none" stroke="currentColor" stroke-width="3" opacity=".45"/>`,
  computer_tech: `
    <rect x="20" y="20" width="24" height="24" rx="3" fill="currentColor"/>
    <rect x="27" y="27" width="10" height="10" fill="var(--green)"/>
    <path d="M20 26 H12 M20 32 H12 M20 38 H12 M44 26 H52 M44 32 H52 M44 38 H52
             M26 20 V12 M32 20 V12 M38 20 V12 M26 44 V52 M32 44 V52 M38 44 V52"
          stroke="currentColor" stroke-width="2.5"/>`,
  astrophysics: `
    <circle cx="24" cy="34" r="12" fill="currentColor" opacity=".85"/>
    <ellipse cx="24" cy="34" rx="20" ry="6" fill="none" stroke="var(--sand)" stroke-width="3" transform="rotate(-20 24 34)"/>
    <circle cx="48" cy="14" r="3" fill="var(--sand)"/>
    <circle cx="54" cy="30" r="2" fill="var(--ice)"/>
    <circle cx="42" cy="52" r="2" fill="var(--ice)"/>`,
  research_network: `
    <circle cx="32" cy="32" r="5" fill="var(--sand)"/>
    <g stroke="currentColor" stroke-width="2.5" fill="none">
      <circle cx="12" cy="14" r="5"/><circle cx="52" cy="14" r="5"/>
      <circle cx="12" cy="50" r="5"/><circle cx="52" cy="50" r="5"/>
      <path d="M16 18 L28 29 M48 18 L36 29 M16 46 L28 35 M48 46 L36 35"/>
    </g>`,
  graviton_tech: `
    <circle cx="32" cy="32" r="5" fill="var(--bg-panel)" stroke="currentColor" stroke-width="3"/>
    <ellipse cx="32" cy="32" rx="26" ry="12" fill="none" stroke="var(--lilac)" stroke-width="2.5"/>
    <ellipse cx="32" cy="32" rx="18" ry="8" fill="none" stroke="currentColor" stroke-width="2.5" opacity=".7"/>
    <path d="M32 4 V14 M32 50 V60" stroke="currentColor" stroke-width="3" opacity=".6"/>`,
  weapons_tech: `
    <path d="M10 40 L34 16 L40 22 L16 46 Z" fill="currentColor"/>
    <path d="M38 12 L52 26 L46 32 L32 18 Z" fill="var(--red)"/>
    <path d="M10 46 H22" stroke="currentColor" stroke-width="4"/>`,
  shielding_tech: `
    <path d="M32 6 L54 16 V32 q0 18 -22 26 Q10 50 10 32 V16 Z" fill="currentColor" opacity=".85"/>
    <path d="M32 14 L46 20 V32 q0 12 -14 18 Q18 44 18 32 V20 Z" fill="var(--ice)" opacity=".55"/>`,
  armour_tech: `
    <path d="M32 6 L54 16 V32 q0 18 -22 26 Q10 50 10 32 V16 Z" fill="none" stroke="currentColor" stroke-width="4"/>
    <path d="M20 22 H44 M20 32 H44 M22 42 H42" stroke="currentColor" stroke-width="3.5" opacity=".8"/>`,
};

/* ------------------------------------------------------------------ */
/* Verteidigung                                                        */
/* ------------------------------------------------------------------ */

const DEFENSE_ART = {
  rocket_launcher: `
    <rect x="12" y="42" width="40" height="10" rx="3" fill="currentColor"/>
    <path d="M26 42 V22 a6 6 0 0 1 12 0 V42 Z" fill="currentColor" opacity=".85"/>
    <path d="M32 22 V8" stroke="var(--red)" stroke-width="4"/>
    <path d="M26 14 L32 6 L38 14" fill="var(--red)"/>`,
  light_laser: `
    <rect x="16" y="44" width="32" height="8" rx="3" fill="currentColor"/>
    <rect x="26" y="26" width="12" height="18" fill="currentColor" opacity=".85"/>
    <path d="M32 26 V8" stroke="var(--red)" stroke-width="4"/>
    <circle cx="32" cy="8" r="4" fill="var(--red)"/>`,
  heavy_laser: `
    <rect x="10" y="44" width="44" height="8" rx="3" fill="currentColor"/>
    <rect x="22" y="24" width="20" height="20" rx="2" fill="currentColor" opacity=".85"/>
    <path d="M26 24 V6 M38 24 V6" stroke="var(--red)" stroke-width="5"/>
    <circle cx="26" cy="6" r="3.5" fill="var(--red)"/>
    <circle cx="38" cy="6" r="3.5" fill="var(--red)"/>`,
  ion_cannon: `
    <rect x="14" y="44" width="36" height="8" rx="3" fill="currentColor"/>
    <circle cx="32" cy="28" r="13" fill="none" stroke="currentColor" stroke-width="4"/>
    <circle cx="32" cy="28" r="5" fill="var(--green)"/>
    <path d="M32 15 V6" stroke="var(--green)" stroke-width="3"/>`,
  gauss_cannon: `
    <rect x="10" y="44" width="44" height="8" rx="3" fill="currentColor"/>
    <path d="M20 44 V28 H44 V44 Z" fill="currentColor" opacity=".85"/>
    <path d="M32 28 V4" stroke="var(--ice)" stroke-width="6"/>
    <path d="M24 16 H40 M24 22 H40" stroke="currentColor" stroke-width="3"/>`,
  plasma_turret: `
    <rect x="10" y="44" width="44" height="8" rx="3" fill="currentColor"/>
    <path d="M18 44 q14 -12 28 0 Z" fill="currentColor" opacity=".85"/>
    <path d="M32 34 V10" stroke="var(--red)" stroke-width="6"/>
    <circle cx="32" cy="8" r="6" fill="var(--red)"/>
    <circle cx="32" cy="8" r="2.5" fill="var(--sand)"/>`,
  small_shield: `
    <path d="M8 46 q24 -30 48 0" fill="none" stroke="var(--ice)" stroke-width="5"/>
    <path d="M16 46 q16 -20 32 0" fill="none" stroke="currentColor" stroke-width="3" opacity=".7"/>
    <rect x="6" y="46" width="52" height="7" rx="3" fill="currentColor"/>`,
  large_shield: `
    <path d="M4 48 q28 -42 56 0" fill="none" stroke="var(--ice)" stroke-width="6"/>
    <path d="M12 48 q20 -30 40 0" fill="none" stroke="var(--ice)" stroke-width="4" opacity=".8"/>
    <path d="M20 48 q12 -18 24 0" fill="none" stroke="currentColor" stroke-width="3" opacity=".6"/>
    <rect x="4" y="48" width="56" height="7" rx="3" fill="currentColor"/>`,
  interceptor_missile: `
    <path d="M32 8 q7 12 7 22 V44 H25 V30 q0 -10 7 -22 Z" fill="var(--ice)"/>
    <path d="M25 34 L16 46 H25 Z M39 34 L48 46 H39 Z" fill="currentColor"/>
    <path d="M28 44 h8 v6 h-8 Z" fill="var(--sand)"/>`,
  interplanetary_missile: `
    <path d="M32 4 q8 14 8 26 V46 H24 V30 q0 -12 8 -26 Z" fill="var(--red)"/>
    <path d="M24 34 L14 50 H24 Z M40 34 L50 50 H40 Z" fill="currentColor"/>
    <circle cx="32" cy="24" r="4" fill="var(--bg-panel)"/>
    <path d="M27 46 h10 v8 h-10 Z" fill="var(--sand)"/>`,
};

/* ------------------------------------------------------------------ */
/* Planetenscheiben                                                    */
/* ------------------------------------------------------------------ */

const PLANET_COLORS = {
  M: { base: '#2f7d5c', land: '#3f9e6e', sea: '#1d5f8a', halo: '#6fe0b0' }, // erdähnlich
  L: { base: '#6b6b3a', land: '#8a8a4a', sea: '#4a4a28', halo: '#c9c97a' }, // karg
  K: { base: '#9c6b3a', land: '#c08a4a', sea: '#704a28', halo: '#e0b070' }, // adaptierbar
  H: { base: '#a84a2a', land: '#d0703a', sea: '#7a3018', halo: '#ff9c5a' }, // Wüste, heiß
  P: { base: '#8fb8d8', land: '#d8ecf8', sea: '#5f8fb8', halo: '#d0f0ff' }, // Gletscher
  D: { base: '#5a5a62', land: '#7a7a84', sea: '#3a3a42', halo: '#9a9aa8' }, // Planetoid
};

/** Einfacher, stabiler Zufallswert aus einer Zeichenkette. */
function seeded(seed) {
  let h = 2166136261;
  for (let i = 0; i < String(seed).length; i++) {
    h ^= String(seed).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * Zeichnet einen Planeten als Scheibe. Oberflächenmerkmale werden aus dem
 * Seed abgeleitet, damit derselbe Planet immer gleich aussieht.
 */
export function planetDisc(type = 'M', seed = 'planet', size = 120) {
  const c = PLANET_COLORS[type] || PLANET_COLORS.M;
  const rnd = seeded(seed);
  const id = 'p' + Math.abs([...String(seed)].reduce((a, ch) => a + ch.charCodeAt(0), 0));

  let features = '';
  const count = 4 + Math.floor(rnd() * 4);
  for (let i = 0; i < count; i++) {
    const angle = rnd() * Math.PI * 2;
    const dist = rnd() * 22;
    const cx = 32 + Math.cos(angle) * dist;
    const cy = 32 + Math.sin(angle) * dist;
    const rx = 5 + rnd() * 11;
    const ry = 3 + rnd() * 7;
    const fill = rnd() > 0.45 ? c.land : c.sea;
    features += `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}"
                   fill="${fill}" opacity="${(0.5 + rnd() * 0.4).toFixed(2)}"
                   transform="rotate(${(rnd() * 180).toFixed(0)} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`;
  }

  return `<svg viewBox="0 0 64 64" class="planet-disc" width="${size}" height="${size}" aria-hidden="true">
    <defs>
      <radialGradient id="${id}light" cx="35%" cy="30%" r="75%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity=".35"/>
        <stop offset="55%" stop-color="#ffffff" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000000" stop-opacity=".55"/>
      </radialGradient>
      <clipPath id="${id}clip"><circle cx="32" cy="32" r="26"/></clipPath>
    </defs>
    <circle cx="32" cy="32" r="29" fill="${c.halo}" opacity=".13"/>
    <circle cx="32" cy="32" r="26" fill="${c.base}"/>
    <g clip-path="url(#${id}clip)">${features}</g>
    <circle cx="32" cy="32" r="26" fill="url(#${id}light)"/>
    <circle cx="32" cy="32" r="26" fill="none" stroke="${c.halo}" stroke-width="1.2" opacity=".6"/>
  </svg>`;
}

/* ------------------------------------------------------------------ */
/* Öffentliche Schnittstelle                                           */
/* ------------------------------------------------------------------ */

const SETS = { ship: SHIP_ART, building: BUILDING_ART, research: RESEARCH_ART, defense: DEFENSE_ART };

/** Ersatzsymbol, falls für einen Schlüssel keine Zeichnung hinterlegt ist. */
const FALLBACK = `
  <rect x="14" y="14" width="36" height="36" rx="6" fill="none" stroke="currentColor" stroke-width="4"/>
  <circle cx="32" cy="32" r="6" fill="currentColor"/>`;

/** Symbol für ein beliebiges Spielobjekt. kind: ship | building | research | defense */
export function icon(kind, key, extra = '') {
  const art = SETS[kind]?.[key] || FALLBACK;
  return svg(art, extra);
}

export const hasIcon = (kind, key) => Boolean(SETS[kind]?.[key]);
