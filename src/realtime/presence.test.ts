import { DepartsDifferes, membresDeLaRoom, estPresent } from "./presence.ts";
import type { Server } from "socket.io";

// Verification deterministe de la presence (etapes 5 et 7).
//   npm run test:presence
//
// Deux parties :
//  - les minuteurs de grace, testes avec des delais raccourcis ;
//  - le calcul du snapshot, teste sur un faux `io` qui simule `fetchSockets()`,
//    y compris le cas multi-instances (deux sockets d'une meme personne).

let echecs = 0;
const ok = (c: boolean, m: string) => {
  if (!c) echecs++;
  console.log(c ? "OK  " : "ECHEC", m);
};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- faux io : `fetchSockets()` renvoie ce que l'adapter aurait collecte
const faireIo = (sockets: Array<{ membre: string; saisitJusqua?: number }>) =>
  ({
    in: () => ({
      fetchSockets: async () =>
        sockets.map((s) => ({ data: { membre: s.membre, saisitJusqua: s.saisitJusqua ?? 0 } })),
    }),
  }) as unknown as Server;

const R = "salon:test";
const maintenant = 1_000_000;

// === snapshot ===============================================================
ok(
  (await membresDeLaRoom(faireIo([]), R, maintenant)).length === 0,
  "room vide : aucun present",
);

let vue = await membresDeLaRoom(
  faireIo([{ membre: "alice" }, { membre: "bob" }]),
  R,
  maintenant,
);
ok(vue.length === 2, "deux personnes : deux entrees");

// Deux onglets d'une meme personne, potentiellement sur deux instances differentes.
vue = await membresDeLaRoom(
  faireIo([{ membre: "alice" }, { membre: "alice" }, { membre: "bob" }]),
  R,
  maintenant,
);
ok(vue.length === 2, "2 onglets d'alice = UNE entree (deduplication par pseudo)");

// La saisie est vraie si AU MOINS un onglet ecrit.
vue = await membresDeLaRoom(
  faireIo([
    { membre: "alice", saisitJusqua: maintenant - 1 }, // expire
    { membre: "alice", saisitJusqua: maintenant + 1000 }, // en cours
  ]),
  R,
  maintenant,
);
ok(vue[0]?.saisit === true, "saisie vraie si un onglet ecrit, meme si l'autre a expire");

vue = await membresDeLaRoom(
  faireIo([{ membre: "alice", saisitJusqua: maintenant - 1 }]),
  R,
  maintenant,
);
ok(vue[0]?.saisit === false, "saisie expiree : plus affichee");

// === presence ponctuelle ====================================================
const io2 = faireIo([{ membre: "alice" }]);
ok(await estPresent(io2, R, "alice"), "estPresent : alice trouvee");
ok(!(await estPresent(io2, R, "carol")), "estPresent : carol absente");

// === delai de grace =========================================================
const departs = new DepartsDifferes();

let parti = "";
departs.programmer(R, "bob", (m) => (parti = m), 60);
ok(departs.enAttente(R, "bob"), "depart programme");
await pause(120);
ok(parti === "bob", "depart annonce apres l'echeance");
ok(!departs.enAttente(R, "bob"), "le minuteur est nettoye apres declenchement");

parti = "";
departs.programmer(R, "carol", (m) => (parti = m), 200);
ok(departs.annuler(R, "carol"), "annuler() renvoie true : un depart etait programme");
await pause(260);
ok(parti === "", "retour dans le delai de grace : aucun depart annonce");

ok(
  !departs.annuler(R, "personne"),
  "annuler() renvoie false quand rien n'etait programme",
);

// Reprogrammer ne doit pas laisser deux minuteurs actifs.
let compte = 0;
departs.programmer(R, "dave", () => compte++, 50);
departs.programmer(R, "dave", () => compte++, 50);
await pause(120);
ok(compte === 1, "reprogrammer remplace le minuteur au lieu de l'empiler");

departs.arreter();
console.log(echecs === 0 ? "\ntout passe" : `\n${echecs} echec(s)`);
process.exit(echecs === 0 ? 0 : 1);
