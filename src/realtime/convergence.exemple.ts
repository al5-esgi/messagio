// STRATEGIE DE CONVERGENCE (exemple fourni, adapte a ce projet).
//
// Numero de sequence par salon + deduplication a la reconnexion. Chaque message recoit un `seq`
// croissant PAR salon (le domaine le fait deja : `Salon.dernierSeq`). Le client garde l'ensemble
// des seq deja affiches ; a la reconnexion il redemande depuis son `lastSeq` et IGNORE tout seq
// deja vu -> pas de doublon, ordre stable.
//
// Pour l'activer (etape 6) : cote serveur, sur reconnexion, renvoyez `messagesDepuis(salon, lastSeq)`
// a la room `salon:<id>` ; cote client, filtrez via `SalonClient`. Vous NE reecrivez pas ce fichier.

import type { Message } from '../domain.ts'

export class SalonClient {
  private seen = new Set<number>()
  readonly affiches: Message[] = []
  lastSeq = 0

  /** Renvoie true si le message a ete affiche (false = doublon ignore). */
  recevoir(msg: Message): boolean {
    if (this.seen.has(msg.seq)) return false
    this.seen.add(msg.seq)
    this.affiches.push(msg)
    this.affiches.sort((a, b) => a.seq - b.seq)
    this.lastSeq = Math.max(this.lastSeq, msg.seq)
    return true
  }

  recevoirLot(msgs: Message[]): number {
    let nouveaux = 0
    for (const m of msgs) if (this.recevoir(m)) nouveaux++
    return nouveaux
  }
}
