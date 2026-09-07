import { Presences } from "./presence.ts";

// Verification deterministe de la presence (etape 5). Les delais sont raccourcis :
// on passe le delai de grace en parametre plutot que d'attendre les 5 s reelles.
//   npm run test:presence

const R = "salon:test";
let echecs = 0;
const ok = (c: boolean, m: string) => {
  if (!c) echecs++;
  console.log(c ? "OK  " : "ECHEC", m);
};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const p = new Presences();

// --- arrivee / depart simple
p.arriver(R, "s1", "alice");
ok(p.instantane(R).length === 1, "1 present apres arrivee");
p.partir(R, "s1", () => {}, 10);
ok(p.instantane(R).length === 0, "aucun fantome apres depart");

// --- deux onglets d'une meme personne
const a = p.arriver(R, "s1", "bob");
const b = p.arriver(R, "s2", "bob");
ok(
  a.premiereConnexion && !b.premiereConnexion,
  "le 2e onglet n'annonce pas une 2e arrivee",
);
ok(p.instantane(R).length === 1, "bob compte pour UNE personne malgre 2 onglets");

let parti = "";
const r1 = p.partir(R, "s1", (m) => (parti = m), 10);
ok(!r1.dernierOnglet, "fermer 1 onglet sur 2 ne programme aucun depart");
await pause(40);
ok(parti === "", "aucun presence-left tant qu'un onglet reste");

p.partir(R, "s2", (m) => (parti = m), 10);
await pause(40);
ok(parti === "bob", "presence-left a la fermeture du dernier onglet");

// --- delai de grace
p.arriver(R, "s3", "carol");
let partie = "";
p.partir(R, "s3", (m) => (partie = m), 200);
p.arriver(R, "s4", "carol"); // revient avant l'echeance
await pause(300);
ok(partie === "", "retour dans le delai de grace : aucun depart annonce");
ok(
  p.instantane(R).some((x) => x.membre === "carol"),
  "carol est toujours presente",
);

// --- signal ephemere
p.signalerSaisie(R, "s4", Date.now());
ok(
  p.instantane(R, Date.now() + 1000).some((x) => x.saisit),
  "saisie visible dans le snapshot",
);
ok(
  !p.instantane(R, Date.now() + 9000).some((x) => x.saisit),
  "saisie expiree apres sa duree de vie",
);

p.arreter();
console.log(echecs === 0 ? "\ntout passe" : `\n${echecs} echec(s)`);
process.exit(echecs === 0 ? 0 : 1);
