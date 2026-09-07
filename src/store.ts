import { buildSeed, MEMBRES } from "./seed.ts";
import { poster, type Message, type Salon } from "./domain.ts";
import {
  creerBusNotifications,
  type BusNotifications,
} from "./realtime/sse-notifications.ts";

// Le stub : un seul WebSocketServer, aucun salon cote transport. Tout le monde recoit
// les messages de tous les salons. Pas de presence, pas d'indicateur de saisie,
// pas de deduplication a la reconnexion.

export interface Store {
  salons: Map<string, Salon>;
  membres: typeof MEMBRES;
  /** Canal SSE (etape 2) : notifie les nouveaux messages et les arrivees de membres. */
  notifications: BusNotifications;
}

export function createStore(): Store {
  return {
    salons: buildSeed(),
    membres: MEMBRES,
    notifications: creerBusNotifications(),
  };
}

/**
 * Poste un message ET publie la notification correspondante.
 * Point de passage unique : REST et stub WebSocket alimentent le meme flux SSE.
 */
export function posterEtNotifier(
  store: Store,
  salon: Salon,
  auteur: string,
  texte: string,
): Message {
  const msg = poster(salon, auteur, texte);
  store.notifications.publier({
    type: "message",
    salonId: msg.salonId,
    seq: msg.seq,
    auteur: msg.auteur,
    texte: msg.texte,
    at: msg.at,
  });
  return msg;
}

export interface ClientMessage {
  kind: "message" | "typing";
  salonId: string;
  auteur: string;
  texte?: string;
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.kind !== "message" && o.kind !== "typing") return null;
  if (typeof o.salonId !== "string" || typeof o.auteur !== "string")
    return null;
  return {
    kind: o.kind,
    salonId: o.salonId,
    auteur: o.auteur,
    texte: typeof o.texte === "string" ? o.texte : undefined,
  };
}

export function applyNaive(store: Store, msg: ClientMessage): void {
  if (msg.kind !== "message" || !msg.texte) return; // "typing" est ignore par le stub
  const salon = store.salons.get(msg.salonId);
  // aucune verification d'appartenance au salon (defaut du stub, corrige etape 4)
  if (salon) posterEtNotifier(store, salon, msg.auteur, msg.texte);
}

/**
 * Variante de `applyNaive` pour le serveur ws securise (etape 3) : l'auteur est
 * l'identite du JWT verifie au handshake, et non le champ `auteur` du message.
 * Un client ne peut donc plus poster sous le pseudo de quelqu'un d'autre.
 *
 * L'appartenance au salon n'est toujours pas verifiee : c'est le travail de l'etape 4.
 */
export function appliquerMessage(
  store: Store,
  msg: ClientMessage,
  membre: string,
): void {
  if (msg.kind !== "message" || !msg.texte) return; // "typing" : etape 5
  const salon = store.salons.get(msg.salonId);
  if (salon) posterEtNotifier(store, salon, membre, msg.texte);
}
