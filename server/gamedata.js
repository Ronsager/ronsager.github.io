/**
 * Spieldaten für "Star Trek Conquest".
 * Die Spielmechanik orientiert sich an OGame, sämtliche Namen, Beschreibungen
 * und Fraktionen stammen aus dem Star-Trek-Universum.
 *
 * Rohstoffe:
 *   duranium  – Baumetall der Sternenflotte (OGame: Metall)
 *   dilithium – Kristall für Warpkerne     (OGame: Kristall)
 *   deuterium – Treibstoff                 (OGame: Deuterium)
 *   energy    – Energiebilanz des Planeten
 */

export const RESOURCES = ['duranium', 'dilithium', 'deuterium'];

export const RESOURCE_LABELS = {
  duranium: 'Duranium',
  dilithium: 'Dilithium',
  deuterium: 'Deuterium',
  energy: 'Energie',
};

/* ------------------------------------------------------------------ */
/* Fraktionen                                                          */
/* ------------------------------------------------------------------ */

export const FACTIONS = {
  federation: {
    name: 'Vereinigte Föderation der Planeten',
    short: 'Föderation',
    description: 'Forschung und Diplomatie. Wissenschaftliche Projekte werden schneller abgeschlossen.',
    bonus: { researchSpeed: 1.15, production: 1.0, weapons: 1.0, shields: 1.05, cargo: 1.0 },
  },
  klingon: {
    name: 'Klingonisches Imperium',
    short: 'Klingonen',
    description: 'Ehre im Kampf. Disruptorbänke und Schiffswaffen richten mehr Schaden an.',
    bonus: { researchSpeed: 0.9, production: 1.0, weapons: 1.2, shields: 0.95, cargo: 1.0 },
  },
  romulan: {
    name: 'Romulanisches Sternenimperium',
    short: 'Romulaner',
    description: 'Tarnvorrichtung und Singularitätskerne. Stärkere Deflektorschilde, bessere Sensoren.',
    bonus: { researchSpeed: 1.05, production: 1.0, weapons: 1.0, shields: 1.2, cargo: 1.0 },
  },
  cardassian: {
    name: 'Cardassianische Union',
    short: 'Cardassianer',
    description: 'Rücksichtslose Ausbeutung der Kolonien. Höhere Rohstoffförderung.',
    bonus: { researchSpeed: 0.95, production: 1.15, weapons: 1.05, shields: 1.0, cargo: 1.0 },
  },
  ferengi: {
    name: 'Ferengi-Allianz',
    short: 'Ferengi',
    description: 'Die Erwerbsregeln zuerst. Deutlich größere Frachtkapazität aller Schiffe.',
    bonus: { researchSpeed: 1.0, production: 1.05, weapons: 0.9, shields: 0.95, cargo: 1.3 },
  },
};

export const DEFAULT_FACTION = 'federation';

/* ------------------------------------------------------------------ */
/* Gebäude                                                             */
/* ------------------------------------------------------------------ */

export const BUILDINGS = {
  duranium_mine: {
    name: 'Duranium-Mine',
    category: 'resource',
    description: 'Fördert Duranium aus der Planetenkruste – das Grundmaterial jedes Raumschiffrumpfes.',
    cost: { duranium: 60, dilithium: 15 }, factor: 1.5,
  },
  dilithium_mine: {
    name: 'Dilithium-Raffinerie',
    category: 'resource',
    description: 'Gewinnt und schneidet Dilithiumkristalle, ohne die kein Warpkern arbeitet.',
    cost: { duranium: 48, dilithium: 24 }, factor: 1.6,
  },
  deuterium_synth: {
    name: 'Deuterium-Extraktor',
    category: 'resource',
    description: 'Filtert Deuterium aus der Atmosphäre – der Treibstoff der Sternenflotte.',
    cost: { duranium: 225, dilithium: 75 }, factor: 1.5,
  },
  solar_array: {
    name: 'Solar-Kollektor-Feld',
    category: 'resource',
    description: 'Wandelt Sternenlicht in Energie für die Förderanlagen um.',
    cost: { duranium: 75, dilithium: 30 }, factor: 1.5,
  },
  fusion_reactor: {
    name: 'Fusionsreaktor',
    category: 'resource',
    description: 'Deuteriumbetriebene Fusion. Liefert viel Energie, verbraucht aber laufend Treibstoff.',
    cost: { duranium: 900, dilithium: 360, deuterium: 180 }, factor: 1.8,
  },
  duranium_storage: {
    name: 'Duranium-Lager',
    category: 'storage',
    description: 'Erweitert die Lagerkapazität für Duranium.',
    cost: { duranium: 1000 }, factor: 2,
  },
  dilithium_storage: {
    name: 'Dilithium-Kammer',
    category: 'storage',
    description: 'Stabilisierte Kammern zur Lagerung von Dilithiumkristallen.',
    cost: { duranium: 1000, dilithium: 500 }, factor: 2,
  },
  deuterium_tank: {
    name: 'Deuterium-Tank',
    category: 'storage',
    description: 'Kryogene Tanks für flüssiges Deuterium.',
    cost: { duranium: 1000, dilithium: 1000 }, factor: 2,
  },
  drone_factory: {
    name: 'Drohnen-Werkstatt',
    category: 'facility',
    description: 'Arbeitsdrohnen beschleunigen sämtliche Bauvorhaben auf dem Planeten.',
    cost: { duranium: 400, dilithium: 120, deuterium: 200 }, factor: 2,
  },
  nanite_factory: {
    name: 'Nanosonden-Fabrik',
    category: 'facility',
    description: 'Assimilierte Nanosondentechnik. Halbiert die Bauzeit mit jeder Stufe.',
    cost: { duranium: 1000000, dilithium: 500000, deuterium: 100000 }, factor: 2,
    requires: { buildings: { drone_factory: 10 }, research: { computer_tech: 10 } },
  },
  shipyard: {
    name: 'Sternenflotten-Werft',
    category: 'facility',
    description: 'Orbitale Docks für den Bau von Raumschiffen und Verteidigungsanlagen.',
    cost: { duranium: 400, dilithium: 200, deuterium: 100 }, factor: 2,
    requires: { buildings: { drone_factory: 2 } },
  },
  research_lab: {
    name: 'Wissenschaftslabor',
    category: 'facility',
    description: 'Hier arbeiten die Wissenschaftsoffiziere an neuen Technologien.',
    cost: { duranium: 200, dilithium: 400, deuterium: 200 }, factor: 2,
  },
  terraformer: {
    name: 'Terraforming-Anlage',
    category: 'facility',
    description: 'Genesis-Technologie erschließt zusätzliche Bauflächen auf dem Planeten.',
    cost: { dilithium: 50000, deuterium: 100000, energy: 1000 }, factor: 2,
    requires: { buildings: { nanite_factory: 1 }, research: { energy_tech: 12 } },
  },
  fleet_depot: {
    name: 'Flotten-Versorgungsdepot',
    category: 'facility',
    description: 'Verbündete Flotten können hier auftanken und Reparaturen durchführen.',
    cost: { duranium: 20000, dilithium: 40000 }, factor: 2,
  },
  torpedo_silo: {
    name: 'Torpedo-Magazin',
    category: 'facility',
    description: 'Lagert interplanetare Torpedos und Abfangtorpedos. Kapazität: 10 pro Stufe.',
    cost: { duranium: 20000, dilithium: 20000, deuterium: 1000 }, factor: 2,
    requires: { buildings: { shipyard: 1 } },
  },
};

/* ------------------------------------------------------------------ */
/* Forschung                                                           */
/* ------------------------------------------------------------------ */

export const RESEARCH = {
  energy_tech: {
    name: 'Energietechnologie',
    category: 'basic',
    description: 'Grundlage aller Energiesysteme. Voraussetzung für fast jede weitere Technologie.',
    cost: { dilithium: 800, deuterium: 400 }, factor: 2,
    requires: { buildings: { research_lab: 1 } },
  },
  laser_tech: {
    name: 'Phaser-Technologie',
    category: 'basic',
    description: 'Gebündelte Nadionenstrahlen – die Standardbewaffnung der Sternenflotte.',
    cost: { duranium: 200, dilithium: 100 }, factor: 2,
    requires: { buildings: { research_lab: 1 }, research: { energy_tech: 2 } },
  },
  ion_tech: {
    name: 'Disruptor-Technologie',
    category: 'basic',
    description: 'Klingonische und romulanische Disruptorbänke zerlegen Materie auf molekularer Ebene.',
    cost: { duranium: 1000, dilithium: 300, deuterium: 100 }, factor: 2,
    requires: { buildings: { research_lab: 4 }, research: { energy_tech: 4, laser_tech: 5 } },
  },
  hyperspace_tech: {
    name: 'Subraum-Technologie',
    category: 'basic',
    description: 'Manipulation des Subraums – Grundlage für Transwarp und schwere Bewaffnung.',
    cost: { dilithium: 4000, deuterium: 2000 }, factor: 2,
    requires: { buildings: { research_lab: 7 }, research: { energy_tech: 5 } },
  },
  plasma_tech: {
    name: 'Plasma-Technologie',
    category: 'basic',
    description: 'Romulanische Plasmatorpedos und Plasmageschütze mit verheerender Wirkung.',
    cost: { duranium: 2000, dilithium: 4000, deuterium: 1000 }, factor: 2,
    requires: { buildings: { research_lab: 4 }, research: { energy_tech: 8, laser_tech: 10, ion_tech: 5 } },
  },
  combustion_drive: {
    name: 'Impulsantrieb',
    category: 'drive',
    description: 'Fusionsgetriebener Unterlichtantrieb. Erhöht die Geschwindigkeit leichter Schiffe.',
    cost: { duranium: 400, deuterium: 600 }, factor: 2,
    requires: { buildings: { research_lab: 1 }, research: { energy_tech: 1 } },
  },
  impulse_drive: {
    name: 'Warpantrieb',
    category: 'drive',
    description: 'Materie-Antimaterie-Reaktion krümmt den Raum. Standardantrieb der Kreuzerflotte.',
    cost: { duranium: 2000, dilithium: 4000, deuterium: 600 }, factor: 2,
    requires: { buildings: { research_lab: 2 }, research: { energy_tech: 1 } },
  },
  hyperspace_drive: {
    name: 'Transwarp-Antrieb',
    category: 'drive',
    description: 'Transwarp-Korridore verkürzen interstellare Reisen dramatisch.',
    cost: { duranium: 10000, dilithium: 20000, deuterium: 6000 }, factor: 2,
    requires: { buildings: { research_lab: 7 }, research: { hyperspace_tech: 3 } },
  },
  espionage_tech: {
    name: 'Langstreckensensorik',
    category: 'basic',
    description: 'Verbesserte Sensorphalanx. Bessere Spionageberichte, schwerer auszuspähen.',
    cost: { duranium: 200, dilithium: 1000, deuterium: 200 }, factor: 2,
    requires: { buildings: { research_lab: 3 } },
  },
  computer_tech: {
    name: 'Positronik',
    category: 'basic',
    description: 'Positronische Rechenkerne. Jede Stufe erlaubt einen zusätzlichen Flottenverband.',
    cost: { dilithium: 400, deuterium: 600 }, factor: 2,
    requires: { buildings: { research_lab: 1 } },
  },
  astrophysics: {
    name: 'Astrometrie',
    category: 'basic',
    description: 'Kartographiert neue Systeme. Je zwei Stufen erlauben eine weitere Kolonie.',
    cost: { duranium: 4000, dilithium: 8000, deuterium: 4000 }, factor: 1.75,
    requires: { buildings: { research_lab: 3 }, research: { espionage_tech: 4, impulse_drive: 3 } },
  },
  research_network: {
    name: 'Subraum-Forschungsnetzwerk',
    category: 'basic',
    description: 'Verbindet die Labore aller Kolonien zu einem gemeinsamen Forschungsverbund.',
    cost: { duranium: 240000, dilithium: 400000, deuterium: 160000 }, factor: 2,
    requires: { buildings: { research_lab: 10 }, research: { computer_tech: 8, hyperspace_tech: 8 } },
  },
  graviton_tech: {
    name: 'Graviton-Technologie',
    category: 'basic',
    description: 'Künstliche Gravitonenfelder – notwendig für den Bau eines taktischen Kubus.',
    cost: { energy: 300000 }, factor: 3,
    requires: { buildings: { research_lab: 12 } },
  },
  weapons_tech: {
    name: 'Waffentechnologie',
    category: 'military',
    description: 'Erhöht die Feuerkraft aller Schiffe und Verteidigungsanlagen um 10 % je Stufe.',
    cost: { duranium: 800, dilithium: 200 }, factor: 2,
    requires: { buildings: { research_lab: 4 } },
  },
  shielding_tech: {
    name: 'Deflektorschild-Technologie',
    category: 'military',
    description: 'Erhöht die Schildstärke aller Einheiten um 10 % je Stufe.',
    cost: { duranium: 200, dilithium: 600 }, factor: 2,
    requires: { buildings: { research_lab: 6 }, research: { energy_tech: 3 } },
  },
  armour_tech: {
    name: 'Ablative Panzerung',
    category: 'military',
    description: 'Ablative Hüllenpanzerung erhöht die Struktur aller Einheiten um 10 % je Stufe.',
    cost: { duranium: 1000 }, factor: 2,
    requires: { buildings: { research_lab: 2 } },
  },
};

/* ------------------------------------------------------------------ */
/* Schiffe                                                             */
/* ------------------------------------------------------------------ */
/* structure wird in der Kampfberechnung aus den Baukosten abgeleitet
   (Kosten/10), shield und weapon sind Basiswerte vor Technologie-Bonus. */

export const SHIPS = {
  small_cargo: {
    name: 'Transport-Shuttle',
    category: 'civil',
    description: 'Kleines Shuttle vom Typ 6 für schnelle Rohstofftransporte zwischen Kolonien.',
    cost: { duranium: 2000, dilithium: 2000 },
    shield: 10, weapon: 5, speed: 5000, cargo: 5000, fuel: 10, drive: 'combustion_drive',
    requires: { buildings: { shipyard: 2 }, research: { combustion_drive: 2 } },
  },
  large_cargo: {
    name: 'Frachter der Antares-Klasse',
    category: 'civil',
    description: 'Schwerer Frachter mit enormem Laderaum, aber träger Steuerung.',
    cost: { duranium: 6000, dilithium: 6000 },
    shield: 25, weapon: 5, speed: 7500, cargo: 25000, fuel: 50, drive: 'combustion_drive',
    requires: { buildings: { shipyard: 4 }, research: { combustion_drive: 6 } },
  },
  light_fighter: {
    name: 'Jäger der Peregrine-Klasse',
    category: 'military',
    description: 'Wendiger Einsitzer-Kurierjäger, im Maquis-Krieg zum Angriffsjäger umgebaut.',
    cost: { duranium: 3000, dilithium: 1000 },
    shield: 10, weapon: 50, speed: 12500, cargo: 50, fuel: 20, drive: 'combustion_drive',
    requires: { buildings: { shipyard: 1 }, research: { combustion_drive: 1 } },
  },
  heavy_fighter: {
    name: 'Runabout der Danube-Klasse',
    category: 'military',
    description: 'Bewaffnetes Beiboot mit Warpantrieb und modularer Missionskapsel.',
    cost: { duranium: 6000, dilithium: 4000 },
    shield: 25, weapon: 150, speed: 10000, cargo: 100, fuel: 75, drive: 'impulse_drive',
    requires: { buildings: { shipyard: 3 }, research: { armour_tech: 2, impulse_drive: 2 } },
  },
  cruiser: {
    name: 'Kreuzer der Miranda-Klasse',
    category: 'military',
    description: 'Bewährter Mehrzweckkreuzer mit Rollbaugeschützen.',
    cost: { duranium: 20000, dilithium: 7000, deuterium: 2000 },
    shield: 50, weapon: 400, speed: 15000, cargo: 800, fuel: 300, drive: 'impulse_drive',
    requires: { buildings: { shipyard: 5 }, research: { impulse_drive: 4, ion_tech: 2 } },
  },
  battleship: {
    name: 'Kreuzer der Excelsior-Klasse',
    category: 'military',
    description: 'Schwerer Linienkreuzer, jahrzehntelang Rückgrat der Sternenflotte.',
    cost: { duranium: 45000, dilithium: 15000 },
    shield: 200, weapon: 1000, speed: 10000, cargo: 1500, fuel: 500, drive: 'hyperspace_drive',
    requires: { buildings: { shipyard: 7 }, research: { hyperspace_drive: 4 } },
  },
  battlecruiser: {
    name: 'Schlachtkreuzer der Galaxy-Klasse',
    category: 'military',
    description: 'Fliegende Stadt mit Abtrennsektion – schwer bewaffnet und hervorragend geschützt.',
    cost: { duranium: 30000, dilithium: 40000, deuterium: 15000 },
    shield: 400, weapon: 700, speed: 10000, cargo: 750, fuel: 250, drive: 'hyperspace_drive',
    requires: { buildings: { shipyard: 8 }, research: { hyperspace_tech: 5, hyperspace_drive: 5, laser_tech: 12 } },
  },
  bomber: {
    name: 'Angriffsschiff der Defiant-Klasse',
    category: 'military',
    description: 'Kompaktes Kriegsschiff mit Quantentorpedos – speziell gegen Planetenverteidigung.',
    cost: { duranium: 50000, dilithium: 25000, deuterium: 15000 },
    shield: 500, weapon: 1000, speed: 4000, cargo: 500, fuel: 700, drive: 'impulse_drive',
    requires: { buildings: { shipyard: 8 }, research: { impulse_drive: 6, plasma_tech: 5 } },
  },
  destroyer: {
    name: 'Zerstörer der Sovereign-Klasse',
    category: 'military',
    description: 'Modernstes Flaggschiff der Sternenflotte mit ablativer Panzerung.',
    cost: { duranium: 60000, dilithium: 50000, deuterium: 15000 },
    shield: 500, weapon: 2000, speed: 5000, cargo: 2000, fuel: 1000, drive: 'hyperspace_drive',
    requires: { buildings: { shipyard: 9 }, research: { hyperspace_drive: 6, hyperspace_tech: 5 } },
  },
  deathstar: {
    name: 'Taktischer Borg-Kubus',
    category: 'military',
    description: 'Assimilierte Superwaffe. Nahezu unzerstörbar, aber quälend langsam.',
    cost: { duranium: 5000000, dilithium: 4000000, deuterium: 1000000 },
    shield: 50000, weapon: 200000, speed: 100, cargo: 1000000, fuel: 1, drive: 'hyperspace_drive',
    requires: {
      buildings: { shipyard: 12, nanite_factory: 1 },
      research: { hyperspace_drive: 7, hyperspace_tech: 6, graviton_tech: 1 },
    },
  },
  colony_ship: {
    name: 'Kolonieschiff der Olympic-Klasse',
    category: 'civil',
    description: 'Bringt Siedler und Ausrüstung zu einem unbewohnten Planeten.',
    cost: { duranium: 10000, dilithium: 20000, deuterium: 10000 },
    shield: 100, weapon: 50, speed: 2500, cargo: 7500, fuel: 1000, drive: 'impulse_drive',
    requires: { buildings: { shipyard: 4 }, research: { impulse_drive: 3 } },
  },
  recycler: {
    name: 'Bergungsschiff der Nebula-Klasse',
    category: 'civil',
    description: 'Traktorstrahl-Bergungsschiff. Sammelt Trümmerfelder nach einer Schlacht ein.',
    cost: { duranium: 10000, dilithium: 6000, deuterium: 2000 },
    shield: 10, weapon: 1, speed: 2000, cargo: 20000, fuel: 300, drive: 'combustion_drive',
    requires: { buildings: { shipyard: 4 }, research: { combustion_drive: 6, shielding_tech: 2 } },
  },
  espionage_probe: {
    name: 'Sensorsonde',
    category: 'civil',
    description: 'Unbemannte Sonde mit Transwarp-Booster. Liefert Aufklärungsdaten in Sekunden.',
    cost: { dilithium: 1000 },
    shield: 0, weapon: 0, speed: 100000000, cargo: 5, fuel: 1, drive: 'combustion_drive',
    requires: { buildings: { shipyard: 3 }, research: { combustion_drive: 3, espionage_tech: 2 } },
  },
  solar_satellite: {
    name: 'Orbital-Solarsatellit',
    category: 'civil',
    description: 'Stationärer Energiesatellit im Orbit. Liefert Energie, ist aber wehrlos.',
    cost: { dilithium: 2000, deuterium: 500 },
    shield: 1, weapon: 1, speed: 0, cargo: 0, fuel: 0, drive: null, stationary: true,
    requires: { buildings: { shipyard: 1 } },
  },
};

/* ------------------------------------------------------------------ */
/* Verteidigung                                                        */
/* ------------------------------------------------------------------ */

export const DEFENSES = {
  rocket_launcher: {
    name: 'Photonentorpedo-Batterie',
    description: 'Günstige bodengestützte Torpedowerfer – die erste Verteidigungslinie.',
    cost: { duranium: 2000 }, shield: 20, weapon: 80,
    requires: { buildings: { shipyard: 1 } },
  },
  light_laser: {
    name: 'Leichter Phaser-Turm',
    description: 'Schnellfeuernde Phaserbank gegen leichte Jäger.',
    cost: { duranium: 1500, dilithium: 500 }, shield: 25, weapon: 100,
    requires: { buildings: { shipyard: 2 }, research: { energy_tech: 1, laser_tech: 3 } },
  },
  heavy_laser: {
    name: 'Schwerer Phaser-Turm',
    description: 'Planetare Phaserbank mit vielfacher Feuerkraft.',
    cost: { duranium: 6000, dilithium: 2000 }, shield: 100, weapon: 250,
    requires: { buildings: { shipyard: 4 }, research: { energy_tech: 3, laser_tech: 6 } },
  },
  ion_cannon: {
    name: 'Disruptor-Bank',
    description: 'Erzeugt starke Schildfelder, richtet aber wenig Schaden an.',
    cost: { duranium: 5000, dilithium: 3000 }, shield: 500, weapon: 150,
    requires: { buildings: { shipyard: 4 }, research: { ion_tech: 4 } },
  },
  gauss_cannon: {
    name: 'Quantentorpedo-Werfer',
    description: 'Quantentorpedos durchschlagen selbst schwere Schlachtschiffpanzerung.',
    cost: { duranium: 20000, dilithium: 15000, deuterium: 2000 }, shield: 200, weapon: 1100,
    requires: { buildings: { shipyard: 6 }, research: { energy_tech: 6, weapons_tech: 3, shielding_tech: 1 } },
  },
  plasma_turret: {
    name: 'Plasma-Geschützturm',
    description: 'Romulanische Plasmakanone – die stärkste stationäre Waffe überhaupt.',
    cost: { duranium: 50000, dilithium: 50000, deuterium: 30000 }, shield: 300, weapon: 3000,
    requires: { buildings: { shipyard: 8 }, research: { plasma_tech: 7 } },
  },
  small_shield: {
    name: 'Kleine Deflektorschild-Kuppel',
    description: 'Planetarer Deflektor. Nur einmal pro Planet baubar.',
    cost: { duranium: 10000, dilithium: 10000 }, shield: 2000, weapon: 1, max: 1,
    requires: { buildings: { shipyard: 1 }, research: { shielding_tech: 2 } },
  },
  large_shield: {
    name: 'Große Deflektorschild-Kuppel',
    description: 'Multiphasischer Planetenschirm. Nur einmal pro Planet baubar.',
    cost: { duranium: 50000, dilithium: 50000 }, shield: 10000, weapon: 1, max: 1,
    requires: { buildings: { shipyard: 6 }, research: { shielding_tech: 6 } },
  },
  interceptor_missile: {
    name: 'Abfang-Torpedo',
    description: 'Fängt anfliegende interplanetare Torpedos ab. Benötigt ein Torpedo-Magazin.',
    cost: { duranium: 8000, deuterium: 2000 }, shield: 1, weapon: 1, missile: true,
    requires: { buildings: { shipyard: 1, torpedo_silo: 2 } },
  },
  interplanetary_missile: {
    name: 'Interplanetarer Torpedo',
    description: 'Zerstört gegnerische Verteidigungsanlagen in benachbarten Systemen.',
    cost: { duranium: 12500, dilithium: 2500, deuterium: 10000 }, shield: 1, weapon: 12000, missile: true,
    requires: { buildings: { shipyard: 1, torpedo_silo: 4 }, research: { impulse_drive: 1 } },
  },
};

/* ------------------------------------------------------------------ */
/* Rapidfire (Mehrfachbeschuss)                                        */
/* ------------------------------------------------------------------ */

export const RAPIDFIRE = {
  small_cargo: { espionage_probe: 5, solar_satellite: 5 },
  large_cargo: { espionage_probe: 5, solar_satellite: 5 },
  light_fighter: { espionage_probe: 5, solar_satellite: 5 },
  heavy_fighter: { espionage_probe: 5, solar_satellite: 5, small_cargo: 3 },
  cruiser: { espionage_probe: 5, solar_satellite: 5, light_fighter: 6, rocket_launcher: 10 },
  battleship: { espionage_probe: 5, solar_satellite: 5 },
  battlecruiser: {
    espionage_probe: 5, solar_satellite: 5, small_cargo: 3, large_cargo: 3,
    heavy_fighter: 4, cruiser: 4, battleship: 7,
  },
  bomber: {
    espionage_probe: 5, solar_satellite: 5, rocket_launcher: 20, light_laser: 20,
    heavy_laser: 10, ion_cannon: 10, gauss_cannon: 5, plasma_turret: 5,
  },
  destroyer: { espionage_probe: 5, solar_satellite: 5, light_laser: 10, battlecruiser: 2 },
  deathstar: {
    espionage_probe: 1250, solar_satellite: 1250, small_cargo: 250, large_cargo: 250,
    light_fighter: 200, heavy_fighter: 100, cruiser: 33, battleship: 30, battlecruiser: 15,
    bomber: 25, destroyer: 5, recycler: 250, colony_ship: 250,
    rocket_launcher: 200, light_laser: 200, heavy_laser: 100, ion_cannon: 100,
    gauss_cannon: 50, plasma_turret: 50,
  },
  recycler: { espionage_probe: 5, solar_satellite: 5 },
};

/* ------------------------------------------------------------------ */
/* Flottenmissionen                                                    */
/* ------------------------------------------------------------------ */

export const MISSIONS = {
  attack:    { name: 'Angriff',        needsTarget: 'occupied' },
  transport: { name: 'Transport',      needsTarget: 'occupied' },
  deploy:    { name: 'Stationieren',   needsTarget: 'own' },
  colonize:  { name: 'Kolonisieren',   needsTarget: 'empty' },
  espionage: { name: 'Spionage',       needsTarget: 'occupied' },
  recycle:   { name: 'Trümmer sammeln', needsTarget: 'debris' },
  hold:      { name: 'Halten',         needsTarget: 'occupied' },
};

/* ------------------------------------------------------------------ */
/* Planetentypen                                                       */
/* ------------------------------------------------------------------ */

export const PLANET_TYPES = [
  { key: 'M', name: 'Klasse M', description: 'Erdähnlich, ideal für Kolonien.', minTemp: -10, maxTemp: 40, fields: [140, 200] },
  { key: 'L', name: 'Klasse L', description: 'Karg, marginal bewohnbar.', minTemp: -40, maxTemp: 20, fields: [100, 160] },
  { key: 'K', name: 'Klasse K', description: 'Adaptierbar, dünne Atmosphäre.', minTemp: 0, maxTemp: 60, fields: [110, 170] },
  { key: 'H', name: 'Klasse H', description: 'Wüstenwelt, extreme Hitze, viel Deuterium im Untergrund.', minTemp: 60, maxTemp: 140, fields: [90, 150] },
  { key: 'P', name: 'Klasse P', description: 'Gletscherwelt, sehr kalt – hervorragende Deuteriumausbeute.', minTemp: -130, maxTemp: -40, fields: [90, 150] },
  { key: 'D', name: 'Klasse D', description: 'Kleiner Planetoid ohne Atmosphäre.', minTemp: -100, maxTemp: 60, fields: [60, 110] },
];

export const CATALOG = { buildings: BUILDINGS, research: RESEARCH, ships: SHIPS, defenses: DEFENSES };

export function itemDef(kind, key) {
  if (kind === 'building') return BUILDINGS[key];
  if (kind === 'research') return RESEARCH[key];
  if (kind === 'ship') return SHIPS[key];
  if (kind === 'defense') return DEFENSES[key];
  return undefined;
}
