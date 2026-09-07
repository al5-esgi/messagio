// Canal SSE : notifications de salon (nouveau message, arrivee d'un membre).
//
// Unidirectionnel, EN PLUS du stub bidirectionnel (voir TRANSPOSITION.md etape 2) :
// le stub reste en place jusqu'a la seance 3.
//
// Deux proprietes reprises du kit de reference (etapes/s2-sse/server.ts) :
//   - un buffer BORNE : on ne garde pas un historique infini en memoire ;
//   - le rattrapage par `Last-Event-ID` : le client qui revient rejoue ce qu'il a rate,
//     et recoit `resync-needed` si son retard depasse le buffer.

/** Taille du buffer de rejeu. Au-dela, un client en retard doit resynchroniser via REST. */
export const MAX_BUFFER = 100;

export type Notification =
  | {
      type: "message";
      salonId: string;
      seq: number;
      auteur: string;
      texte: string;
      at: number;
    }
  | { type: "membre-rejoint"; salonId: string; membre: string; at: number };

/** Une notification numerotee : l'`id` sert d'`id:` SSE, donc de `Last-Event-ID`. */
export interface NotificationNumerotee {
  id: number;
  notification: Notification;
}

/** Un abonne au flux. `salonId` non defini = tous les salons. */
interface Abonne {
  salonId: string | undefined;
  envoyer(evt: NotificationNumerotee): void;
}

export interface BusNotifications {
  publier(notification: Notification): NotificationNumerotee;
  /** Rejoue les evenements d'id strictement superieur a `lastEventId`. */
  depuis(lastEventId: number, salonId?: string): NotificationNumerotee[];
  /** Vrai si `lastEventId` est trop vieux : le rejeu serait incomplet. */
  trouTropGrand(lastEventId: number): boolean;
  /** Enregistre un abonne ; renvoie la fonction de desabonnement. */
  souscrire(abonne: Abonne): () => void;
  readonly dernierId: number;
}

const concerne = (evt: NotificationNumerotee, salonId: string | undefined) =>
  salonId === undefined || evt.notification.salonId === salonId;

export function creerBusNotifications(): BusNotifications {
  const tampon: NotificationNumerotee[] = [];
  const abonnes = new Set<Abonne>();
  let prochainId = 1;

  return {
    get dernierId() {
      return prochainId - 1;
    },

    publier(notification) {
      const evt: NotificationNumerotee = { id: prochainId++, notification };
      tampon.push(evt);
      if (tampon.length > MAX_BUFFER) tampon.shift(); // buffer borne
      for (const abonne of abonnes) {
        if (concerne(evt, abonne.salonId)) abonne.envoyer(evt);
      }
      return evt;
    },

    depuis(lastEventId, salonId) {
      return tampon.filter(
        (evt) => evt.id > lastEventId && concerne(evt, salonId),
      );
    },

    trouTropGrand(lastEventId) {
      const plusAncien = tampon[0]?.id;
      // Rien en tampon, ou le client a deja tout vu : aucun trou.
      if (plusAncien === undefined || lastEventId >= prochainId - 1)
        return false;
      // Le premier evenement attendu (lastEventId + 1) est tombe hors du tampon.
      return lastEventId + 1 < plusAncien;
    },

    souscrire(abonne) {
      abonnes.add(abonne);
      return () => abonnes.delete(abonne);
    },
  };
}
