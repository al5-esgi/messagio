// Transcription navigateur de `src/realtime/convergence.exemple.ts` (etape 6).
//
// Le fichier TypeScript reste la reference : il est utilise par `npm run scenario`, et
// `npm run test:convergence` verifie que les deux implementations se comportent a l'identique
// sur les memes suites de messages. Ne modifiez que l'original, puis reportez ici.
//
// Strategie : numero de sequence par salon + deduplication. Le serveur numerote (Salon.dernierSeq) ;
// le client ignore tout `seq` deja vu et garde l'affichage trie. Un renvoi devient donc sans danger.

export class SalonClient {
  #vus = new Set();

  constructor() {
    this.affiches = [];
    this.lastSeq = 0;
  }

  /** Renvoie true si le message a ete affiche (false = doublon ignore). */
  recevoir(msg) {
    if (this.#vus.has(msg.seq)) return false;
    this.#vus.add(msg.seq);
    this.affiches.push(msg);
    this.affiches.sort((a, b) => a.seq - b.seq);
    this.lastSeq = Math.max(this.lastSeq, msg.seq);
    return true;
  }

  recevoirLot(msgs) {
    let nouveaux = 0;
    for (const m of msgs) if (this.recevoir(m)) nouveaux++;
    return nouveaux;
  }
}
