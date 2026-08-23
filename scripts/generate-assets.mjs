/**
 * Erzeugt die Bilddateien des Spiels als echte PNG-Dateien.
 *
 * Die Planeten entstehen prozedural: fraktales Rauschen (feTurbulence) liefert
 * Kontinente und Wolkenbänder, ein Verlauf die Tag-Nacht-Grenze, ein Ring die
 * Atmosphäre. Gerendert wird mit Chromium, das Ergebnis landet als PNG in
 * public/img/ und wird von dort ganz normal per <img> ausgeliefert.
 *
 * Aufruf (benötigt Playwright und Chromium):
 *   node scripts/generate-assets.mjs
 *
 * Die erzeugten Dateien sind im Repository eingecheckt – dieses Skript muss
 * nur laufen, wenn Aussehen oder Anzahl der Varianten geändert werden sollen.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'img');
const SIZE = 256;
const VARIANTS = 3;

/* ------------------------------------------------------------------ */
/* Planetenklassen                                                     */
/* ------------------------------------------------------------------ */

const CLASSES = {
  M: { name: 'Klasse M – erdähnlich',
       ocean: '#123f6b', land: '#2f7d4a', high: '#6ba85f', ice: '#e8f4ff',
       atmo: '#7fd4ff', clouds: 0.42, iceCap: 0.15, freq: 0.024, contrast: 3.2, threshold: -1.35 },
  L: { name: 'Klasse L – karg',
       ocean: '#3b3f26', land: '#6b6b3a', high: '#8f8a4e', ice: '#d8d8c0',
       atmo: '#c9c97a', clouds: 0.18, iceCap: 0.07, freq: 0.030, contrast: 2.4, threshold: -1.05 },
  K: { name: 'Klasse K – adaptierbar',
       ocean: '#5c3a20', land: '#9c6b3a', high: '#c08a4a', ice: '#e8d8c0',
       atmo: '#e0b070', clouds: 0.15, iceCap: 0.06, freq: 0.028, contrast: 2.6, threshold: -1.10 },
  H: { name: 'Klasse H – Wüstenwelt',
       ocean: '#7a2e14', land: '#b4552a', high: '#e08a45', ice: '#f0c8a0',
       atmo: '#ff9c5a', clouds: 0.10, iceCap: 0.00, freq: 0.032, contrast: 2.2, threshold: -0.95 },
  P: { name: 'Klasse P – Gletscherwelt',
       ocean: '#4a7fa8', land: '#a8cfe4', high: '#e8f6ff', ice: '#ffffff',
       atmo: '#cfefff', clouds: 0.38, iceCap: 0.30, freq: 0.021, contrast: 2.0, threshold: -0.85 },
  D: { name: 'Klasse D – Planetoid',
       ocean: '#2e2e33', land: '#55555e', high: '#82828e', ice: '#9a9aa8',
       atmo: '#8a8a96', clouds: 0.00, iceCap: 0.00, freq: 0.042, contrast: 1.8, threshold: -0.80 },
};

/** SVG eines Planeten. seed steuert das Rauschen, damit Varianten sich unterscheiden. */
function planetSvg(cls, seed, variant = 1) {
  // Frequenz je Variante leicht verschieben, sonst wirken die drei Fassungen
  // einer Klasse trotz unterschiedlichem Seed sehr ähnlich.
  const base = CLASSES[cls];
  const c = { ...base, freq: base.freq * (0.78 + variant * 0.18) };
  const S = SIZE;
  const R = S / 2 - 10;
  const cx = S / 2, cy = S / 2;

  const clouds = c.clouds > 0 ? `
    <filter id="cloudNoise" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="${(c.freq * 0.55).toFixed(4)} ${(c.freq * 1.6).toFixed(4)}"
                    numOctaves="4" seed="${seed + 77}" result="n"/>
      <feColorMatrix in="n" type="matrix"
        values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.9 0 0 0 -0.35"/>
    </filter>
    <circle cx="${cx}" cy="${cy}" r="${R}" filter="url(#cloudNoise)" opacity="${c.clouds}"/>` : '';

  // Polkappen: weich auslaufende Ellipsen. Ohne die Unschärfe entsteht am
  // Kugelrand eine hart abgeschnittene Kante, die wie ein Balken aussieht.
  const iceCaps = c.iceCap > 0 ? `
    <g filter="url(#capBlur)">
      <ellipse cx="${cx}" cy="${cy - R * 1.02}" rx="${R * 0.72}" ry="${R * c.iceCap * 1.5}"
               fill="${c.ice}" opacity=".95"/>
      <ellipse cx="${cx}" cy="${cy + R * 1.05}" rx="${R * 0.62}" ry="${R * c.iceCap * 1.3}"
               fill="${c.ice}" opacity=".9"/>
    </g>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <!-- Kontinente: fraktales Rauschen, über eine Farbmatrix in Land und Meer getrennt -->
    <filter id="surface" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="${c.freq}" numOctaves="5" seed="${seed}" result="noise"/>
      <feColorMatrix in="noise" type="matrix"
        values="0 0 0 0 0   0 0 0 0 0   0 0 0 0 0   ${c.contrast} 0 0 0 ${c.threshold}" result="mask"/>
      <feFlood flood-color="${c.land}" result="landColor"/>
      <feComposite in="landColor" in2="mask" operator="in" result="land"/>
      <feFlood flood-color="${c.ocean}" result="oceanColor"/>
      <feComposite in="oceanColor" in2="SourceGraphic" operator="in" result="ocean"/>
      <feMerge><feMergeNode in="ocean"/><feMergeNode in="land"/></feMerge>
    </filter>

    <!-- Höhenzüge: feineres Rauschen, nur schwach eingeblendet -->
    <filter id="relief" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="${(c.freq * 2.6).toFixed(4)}" numOctaves="3" seed="${seed + 13}" result="n"/>
      <feColorMatrix in="n" type="matrix"
        values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.4 0 0 0 -0.75" result="m"/>
      <feFlood flood-color="${c.high}"/>
      <feComposite in2="m" operator="in"/>
    </filter>

    <!-- Tag-Nacht-Grenze und Kugelform -->
    <radialGradient id="shade" cx="34%" cy="30%" r="78%">
      <stop offset="0%"   stop-color="#ffffff" stop-opacity=".30"/>
      <stop offset="45%"  stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="78%"  stop-color="#000000" stop-opacity=".45"/>
      <stop offset="100%" stop-color="#000000" stop-opacity=".82"/>
    </radialGradient>

    <radialGradient id="atmo" cx="50%" cy="50%" r="50%">
      <stop offset="86%"  stop-color="${c.atmo}" stop-opacity="0"/>
      <stop offset="96%"  stop-color="${c.atmo}" stop-opacity=".55"/>
      <stop offset="100%" stop-color="${c.atmo}" stop-opacity="0"/>
    </radialGradient>

    <filter id="capBlur"><feGaussianBlur stdDeviation="${(R * 0.055).toFixed(2)}"/></filter>

    <clipPath id="globe"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>
  </defs>

  <g clip-path="url(#globe)">
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="${c.ocean}"/>
    <circle cx="${cx}" cy="${cy}" r="${R}" filter="url(#surface)"/>
    <circle cx="${cx}" cy="${cy}" r="${R}" filter="url(#relief)" opacity=".55"/>
    ${iceCaps}
    ${clouds}
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#shade)"/>
  </g>
  <circle cx="${cx}" cy="${cy}" r="${R + 7}" fill="url(#atmo)"/>
</svg>`;
}

/* ------------------------------------------------------------------ */
/* Fraktionswappen                                                     */
/* ------------------------------------------------------------------ */

const CRESTS = {
  federation: { color: '#ff9900', art: (S) => `
    <circle cx="${S/2}" cy="${S/2}" r="${S*0.42}" fill="none" stroke="#ff9900" stroke-width="${S*0.045}"/>
    <path d="M${S*0.5} ${S*0.18} L${S*0.62} ${S*0.72} L${S*0.5} ${S*0.63} L${S*0.38} ${S*0.72} Z" fill="#ff9900"/>
    <circle cx="${S*0.5}" cy="${S*0.5}" r="${S*0.07}" fill="#ffcc66"/>` },
  klingon: { color: '#cc2b1d', art: (S) => `
    <path d="M${S*0.5} ${S*0.12} L${S*0.66} ${S*0.34} L${S*0.9} ${S*0.4} L${S*0.72} ${S*0.56}
             L${S*0.78} ${S*0.86} L${S*0.5} ${S*0.7} L${S*0.22} ${S*0.86} L${S*0.28} ${S*0.56}
             L${S*0.1} ${S*0.4} L${S*0.34} ${S*0.34} Z" fill="#cc2b1d"/>
    <path d="M${S*0.5} ${S*0.28} L${S*0.6} ${S*0.62} L${S*0.5} ${S*0.55} L${S*0.4} ${S*0.62} Z" fill="#1a0603"/>` },
  romulan: { color: '#3fae6d', art: (S) => `
    <path d="M${S*0.5} ${S*0.14} L${S*0.88} ${S*0.5} L${S*0.5} ${S*0.86} L${S*0.12} ${S*0.5} Z"
          fill="none" stroke="#3fae6d" stroke-width="${S*0.05}"/>
    <path d="M${S*0.5} ${S*0.3} L${S*0.7} ${S*0.5} L${S*0.5} ${S*0.7} L${S*0.3} ${S*0.5} Z" fill="#3fae6d"/>
    <path d="M${S*0.18} ${S*0.5} L${S*0.5} ${S*0.2}" stroke="#7fd4a0" stroke-width="${S*0.02}"/>` },
  cardassian: { color: '#d9a441', art: (S) => `
    <ellipse cx="${S*0.5}" cy="${S*0.5}" rx="${S*0.26}" ry="${S*0.42}" fill="none"
             stroke="#d9a441" stroke-width="${S*0.05}"/>
    <ellipse cx="${S*0.5}" cy="${S*0.5}" rx="${S*0.11}" ry="${S*0.2}" fill="#d9a441"/>
    <path d="M${S*0.5} ${S*0.06} V${S*0.2} M${S*0.5} ${S*0.8} V${S*0.94}"
          stroke="#e8c77a" stroke-width="${S*0.035}"/>` },
  ferengi: { color: '#e6b422', art: (S) => `
    <path d="M${S*0.5} ${S*0.16} q${S*0.34} ${S*0.1} ${S*0.3} ${S*0.4}
             q-${S*0.04} ${S*0.24} -${S*0.3} ${S*0.28}
             q-${S*0.26} -${S*0.04} -${S*0.3} -${S*0.28}
             q-${S*0.04} -${S*0.3} ${S*0.3} -${S*0.4} Z"
          fill="none" stroke="#e6b422" stroke-width="${S*0.05}"/>
    <circle cx="${S*0.5}" cy="${S*0.52}" r="${S*0.14}" fill="#e6b422"/>
    <path d="M${S*0.34} ${S*0.36} h${S*0.32}" stroke="#ffd966" stroke-width="${S*0.035}"/>` },
};

function crestSvg(key) {
  const S = 192;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    ${CRESTS[key].art(S)}
  </svg>`;
}

/* ------------------------------------------------------------------ */

async function shoot(page, svg, file, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}</style>${svg}`,
    { waitUntil: 'load' }
  );
  await page.waitForTimeout(60);
  await page.screenshot({ path: file, omitBackground: true });
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
});
const page = await browser.newPage();

fs.mkdirSync(path.join(OUT, 'planets'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'crests'), { recursive: true });

let count = 0;
for (const [cls, def] of Object.entries(CLASSES)) {
  for (let v = 1; v <= VARIANTS; v++) {
    const file = path.join(OUT, 'planets', `${cls.toLowerCase()}-${v}.png`);
    await shoot(page, planetSvg(cls, v * 137 + cls.charCodeAt(0), v), file, SIZE);
    count++;
  }
  console.log(`  ${def.name}: ${VARIANTS} Varianten`);
}

for (const key of Object.keys(CRESTS)) {
  await shoot(page, crestSvg(key), path.join(OUT, 'crests', `${key}.png`), 192);
  count++;
}
console.log(`  Fraktionswappen: ${Object.keys(CRESTS).length}`);

await browser.close();
console.log(`\n${count} Bilddateien erzeugt in public/img/`);
