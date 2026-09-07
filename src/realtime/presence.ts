// ============================================================================
//  Presence par room + signal ephemere (TRANSPOSITION.md, etape 5).
// ============================================================================
//  Trois idees, reprises du kit `s5-presence` :
//
//  1. La presence est un etat SERVEUR, reconstruit a chaque connexion : rien n'est
//     persiste, tout disparait avec le processus. C'est voulu.
//  2. Le DELAI DE GRACE : un `disconnect` ne signifie pas "parti". Un rechargement de
//     page, un tunnel, un wifi qui saute produisent une coupure de quelques secondes.
//     On attend avant d'annoncer un depart, et on annule si la personne revient.
//  3. Le signal EPHEMERE (`typing` ici) n'est jamais persiste : il est diffuse, et
//     seule sa derniere valeur connue est gardee pour alimenter le snapshot.
//
//  Difference assumee avec le kit : celui-ci indexe les membres par `socketId`, si
//  bien qu'une meme personne ouvrant deux onglets apparait deux fois dans la liste
//  des presents. Un chat affiche des personnes, pas des connexions : on indexe donc
//  par socket pour le suivi technique, mais on DEDUPLIQUE par pseudo a la lecture,
//  et on n'annonce une arrivee ou un depart que sur le premier / dernier onglet.
// ============================================================================

/** Duree pendant laquelle une coupure ne declenche pas encore de depart. */
export const DELAI_DE_GRACE_MS = 5_000;

/** Duree de vie d'un signal `typing` : au-dela, la personne a cesse d'ecrire. */
export const DUREE_SAISIE_MS = 4_000;

interface Connexion {
  membre: string;
  /** Horodatage jusqu'auquel on considere la personne en train d'ecrire. 0 = non. */
  saisitJusqua: number;
}

interface EtatRoom {
  parSocket: Map<string, Connexion>;
  departsEnAttente: Map<string, ReturnType<typeof setTimeout>>;
}

export interface PresenceVue {
  membre: string;
  saisit: boolean;
}

export class Presences {
  private readonly rooms = new Map<string, EtatRoom>();

  private etat(room: string): EtatRoom {
    let e = this.rooms.get(room);
    if (!e) {
      e = { parSocket: new Map(), departsEnAttente: new Map() };
      this.rooms.set(room, e);
    }
    return e;
  }

  private estPresent(e: EtatRoom, membre: string): boolean {
    for (const c of e.parSocket.values()) if (c.membre === membre) return true;
    return false;
  }

  /**
   * Enregistre une connexion dans une room.
   * `premiereConnexion` vaut false si la personne y avait deja un autre onglet ouvert :
   * dans ce cas il ne faut pas rediffuser une arrivee.
   */
  arriver(
    room: string,
    socketId: string,
    membre: string,
  ): { premiereConnexion: boolean; retourDansLaGrace: boolean } {
    const e = this.etat(room);
    const dejaLa = this.estPresent(e, membre);

    // La personne revient avant la fin du delai : on annule le depart programme.
    const enAttente = e.departsEnAttente.get(membre);
    if (enAttente) {
      clearTimeout(enAttente);
      e.departsEnAttente.delete(membre);
    }

    e.parSocket.set(socketId, { membre, saisitJusqua: 0 });
    return {
      premiereConnexion: !dejaLa && !enAttente,
      retourDansLaGrace: Boolean(enAttente),
    };
  }

  /**
   * Retire une connexion. Si c'etait le dernier onglet de cette personne, programme
   * un depart differe, que `arriver()` annulera si elle revient a temps.
   */
  partir(
    room: string,
    socketId: string,
    quandParti: (membre: string) => void,
    delaiMs = DELAI_DE_GRACE_MS,
  ): { membre: string | null; dernierOnglet: boolean } {
    const e = this.rooms.get(room);
    const connexion = e?.parSocket.get(socketId);
    if (!e || !connexion) return { membre: null, dernierOnglet: false };

    e.parSocket.delete(socketId);
    const membre = connexion.membre;

    // Un autre onglet de la meme personne est encore la : rien a annoncer.
    if (this.estPresent(e, membre)) return { membre, dernierOnglet: false };

    const minuteur = setTimeout(() => {
      e.departsEnAttente.delete(membre);
      quandParti(membre);
    }, delaiMs);
    e.departsEnAttente.set(membre, minuteur);
    return { membre, dernierOnglet: true };
  }

  /** Signal ephemere : on note la derniere valeur connue, on ne persiste rien. */
  signalerSaisie(room: string, socketId: string, maintenant = Date.now()): void {
    const c = this.rooms.get(room)?.parSocket.get(socketId);
    if (c) c.saisitJusqua = maintenant + DUREE_SAISIE_MS;
  }

  /** Instantane pour l'ack du `join` : une entree par personne, pas par onglet. */
  instantane(room: string, maintenant = Date.now()): PresenceVue[] {
    const e = this.rooms.get(room);
    if (!e) return [];
    const parMembre = new Map<string, boolean>();
    for (const c of e.parSocket.values()) {
      const saisit = c.saisitJusqua > maintenant;
      parMembre.set(c.membre, (parMembre.get(c.membre) ?? false) || saisit);
    }
    return [...parMembre].map(([membre, saisit]) => ({ membre, saisit }));
  }

  /** Libere les minuteurs en attente (arret du serveur, tests). */
  arreter(): void {
    for (const e of this.rooms.values()) {
      for (const t of e.departsEnAttente.values()) clearTimeout(t);
      e.departsEnAttente.clear();
    }
  }
}
