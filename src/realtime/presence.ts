import type { Server } from "socket.io";

// ============================================================================
//  Presence par room (etape 5), rendue DISTRIBUEE a l'etape 7.
// ============================================================================
//  Trois idees, reprises du kit `s5-presence` :
//
//  1. La presence est un etat SERVEUR, reconstruit a chaque connexion : rien n'est
//     persiste, tout disparait avec le processus. C'est voulu.
//  2. Le DELAI DE GRACE : un `disconnect` ne signifie pas "parti". Un rechargement de
//     page, un tunnel, un wifi qui saute produisent une coupure de quelques secondes.
//     On attend avant d'annoncer un depart, et on annule si la personne revient.
//  3. Le signal EPHEMERE (`typing`) n'est jamais persiste : il est diffuse, et seule sa
//     derniere valeur connue est gardee, pour alimenter le snapshot.
//
//  --- Ce que l'etape 7 change -----------------------------------------------
//  Avec deux instances derriere un proxy, une Map locale ne voit que ses propres
//  sockets : alice sur l'instance A serait invisible pour bob sur l'instance B.
//  La source de verite devient donc `io.in(room).fetchSockets()`, que l'adapter Redis
//  interroge SUR TOUTES LES INSTANCES. L'etat de saisie voyage dans `socket.data`,
//  qui est transmis avec chaque socket distante.
//
//  Seuls les minuteurs de grace restent locaux : ils appartiennent a l'instance qui a
//  constate la deconnexion, et leur echeance re-verifie la presence globale avant
//  d'annoncer un depart.
// ============================================================================

/** Duree pendant laquelle une coupure ne declenche pas encore de depart. */
export const DELAI_DE_GRACE_MS = 5_000;

/** Duree de vie d'un signal `typing` : au-dela, la personne a cesse d'ecrire. */
export const DUREE_SAISIE_MS = 4_000;

export interface PresenceVue {
  membre: string;
  saisit: boolean;
}

/** Ce que chaque socket porte, et que `fetchSockets()` rapatrie depuis les autres instances. */
export interface DonneesPresence {
  membre: string;
  /** Horodatage jusqu'auquel on considere la personne en train d'ecrire. 0 = non. */
  saisitJusqua: number;
}

/**
 * Recupere les sockets d'une room sur TOUTES les instances.
 *
 * `fetchSockets()` attend la reponse de chaque instance connue via Redis. Si l'une ne
 * repond pas (redemarrage, deploiement, reseau), l'adapter REJETTE au bout de son
 * `requestsTimeout`. Un rejet non capture ici tuerait le processus - et comme les
 * instances s'interrogent mutuellement, la panne se propagerait a tout le cluster.
 *
 * On se rabat donc sur les sockets LOCALES : la liste des presents est incomplete le
 * temps que l'instance manquante revienne, ce qui est trivialement preferable a un
 * serveur qui tombe. La presence est une information de confort, pas une donnee critique.
 */
async function socketsDeLaRoom(io: Server, room: string) {
  try {
    return await io.in(room).fetchSockets();
  } catch {
    console.warn(
      `[presence] une instance n'a pas repondu pour ${room} : vue locale seulement`,
    );
    return await io.local.in(room).fetchSockets();
  }
}

/**
 * Instantane de la room, toutes instances confondues.
 * Une entree par PERSONNE, pas par onglet : quelqu'un avec deux onglets, meme repartis
 * sur deux instances, n'apparait qu'une fois.
 */
export async function membresDeLaRoom(
  io: Server,
  room: string,
  maintenant = Date.now(),
): Promise<PresenceVue[]> {
  const sockets = await socketsDeLaRoom(io, room);
  const parMembre = new Map<string, boolean>();
  for (const s of sockets) {
    const d = s.data as Partial<DonneesPresence>;
    if (!d?.membre) continue;
    const saisit = (d.saisitJusqua ?? 0) > maintenant;
    parMembre.set(d.membre, (parMembre.get(d.membre) ?? false) || saisit);
  }
  return [...parMembre].map(([membre, saisit]) => ({ membre, saisit }));
}

/** Cette personne a-t-elle encore au moins une socket dans la room, ou que ce soit ? */
export async function estPresent(
  io: Server,
  room: string,
  membre: string,
): Promise<boolean> {
  const sockets = await socketsDeLaRoom(io, room);
  return sockets.some(
    (s) => (s.data as Partial<DonneesPresence>)?.membre === membre,
  );
}

/**
 * Minuteurs de grace. Locaux a l'instance : c'est elle qui a vu la deconnexion.
 * L'echeance re-verifie la presence GLOBALE avant d'annoncer quoi que ce soit.
 */
export class DepartsDifferes {
  private readonly parRoom = new Map<
    string,
    Map<string, ReturnType<typeof setTimeout>>
  >();

  private pour(room: string) {
    let m = this.parRoom.get(room);
    if (!m) {
      m = new Map();
      this.parRoom.set(room, m);
    }
    return m;
  }

  /** Annule un depart programme. Renvoie true s'il y en avait un (= retour dans la grace). */
  annuler(room: string, membre: string): boolean {
    const m = this.parRoom.get(room);
    const t = m?.get(membre);
    if (!t) return false;
    clearTimeout(t);
    m!.delete(membre);
    return true;
  }

  programmer(
    room: string,
    membre: string,
    quandParti: (membre: string) => void,
    delaiMs = DELAI_DE_GRACE_MS,
  ): void {
    const m = this.pour(room);
    clearTimeout(m.get(membre));
    m.set(
      membre,
      setTimeout(() => {
        m.delete(membre);
        quandParti(membre);
      }, delaiMs),
    );
  }

  enAttente(room: string, membre: string): boolean {
    return this.parRoom.get(room)?.has(membre) ?? false;
  }

  arreter(): void {
    for (const m of this.parRoom.values()) {
      for (const t of m.values()) clearTimeout(t);
      m.clear();
    }
  }
}
