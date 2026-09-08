import { SalonClient as Reference } from "./convergence.exemple.ts";
import { SalonClient as Navigateur } from "../../public/salon-client.js";
import type { Message } from "../domain.ts";

// Etape 6 : verifie que la transcription navigateur (`public/salon-client.js`) se comporte
// exactement comme la strategie fournie (`convergence.exemple.ts`), et que la deduplication
// tient sur les cas qui comptent : renvoi complet, chevauchement, desordre, trou.
//   npm run test:convergence

let echecs = 0;
const ok = (c: boolean, m: string) => {
  if (!c) echecs++;
  console.log(c ? "OK  " : "ECHEC", m);
};

const msg = (seq: number, texte = "m" + seq): Message => ({
  seq,
  salonId: "general",
  auteur: "alice",
  texte,
  at: 0,
});

/** Rejoue la meme suite sur les deux implementations et compare le resultat. */
function comparer(nom: string, suites: Message[][]) {
  const a = new Reference();
  const b = new Navigateur();
  for (const lot of suites) {
    a.recevoirLot(lot);
    b.recevoirLot(lot);
  }
  const seqA = a.affiches.map((m) => m.seq).join(",");
  const seqB = b.affiches.map((m) => m.seq).join(",");
  ok(seqA === seqB && a.lastSeq === b.lastSeq, `${nom} : TS et navigateur identiques (${seqA})`);
  return a;
}

// --- renvoi complet apres reconnexion : le cas du scenario
let c = comparer("renvoi complet", [[msg(1), msg(2)], [msg(1), msg(2)]]);
ok(c.affiches.length === 2, "renvoi complet : aucun doublon");

// --- chevauchement : le client redemande depuis un seq trop ancien
c = comparer("chevauchement", [[msg(1), msg(2), msg(3)], [msg(2), msg(3), msg(4)]]);
ok(c.affiches.map((m) => m.seq).join(",") === "1,2,3,4", "chevauchement : 4 messages, ordre stable");

// --- desordre : les messages arrivent dans le mauvais ordre
c = comparer("desordre", [[msg(3), msg(1), msg(2)]]);
ok(c.affiches.map((m) => m.seq).join(",") === "1,2,3", "desordre : affichage retrie par seq");

// --- course reelle : message recu en direct PUIS renvoye dans le lot de resync
c = comparer("course live + resync", [[msg(41)], [msg(40), msg(41), msg(42)]]);
ok(c.affiches.map((m) => m.seq).join(",") === "40,41,42", "le 41 recu deux fois n'apparait qu'une");
ok(c.lastSeq === 42, "lastSeq suit le maximum vu");

// --- trou : la strategie n'invente rien
c = comparer("trou", [[msg(1), msg(5)]]);
ok(c.affiches.length === 2, "trou : les messages manquants ne sont pas fabriques");
console.log(
  "   (un trou se comble en redemandant depuis lastSeq, pas par la deduplication)",
);

console.log(echecs === 0 ? "\ntout passe" : `\n${echecs} echec(s)`);
process.exit(echecs === 0 ? 0 : 1);
