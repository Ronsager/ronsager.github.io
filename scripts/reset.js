/**
 * Setzt das Universum vollständig zurück (löscht alle Spieldaten).
 * Aufruf:  node scripts/reset.js --yes
 */
import fs from 'node:fs';
import { config } from '../server/config.js';

if (!process.argv.includes('--yes')) {
  console.log('Dieser Vorgang löscht ALLE Spielerdaten unwiderruflich.');
  console.log(`Datenbank: ${config.dbFile}`);
  console.log('Zum Bestätigen erneut ausführen mit:  node scripts/reset.js --yes');
  process.exit(1);
}

for (const suffix of ['', '-wal', '-shm']) {
  const file = config.dbFile + suffix;
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    console.log(`gelöscht: ${file}`);
  }
}
console.log('Universum zurückgesetzt. Beim nächsten Serverstart wird alles neu angelegt.');
