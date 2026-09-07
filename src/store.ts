import { buildSeed, MEMBRES } from "./seed.ts";
import { poster, type Salon } from "./domain.ts";

// Le stub : un seul WebSocketServer, aucun salon cote transport. Tout le monde recoit
// les messages de tous les salons. Pas de presence, pas d'indicateur de saisie,
// pas de deduplication a la reconnexion.

export interface Store {
  salons: Map<string, Salon>;
  membres: typeof MEMBRES;
}

export function createStore(): Store {
  return { salons: buildSeed(), membres: MEMBRES };
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
  if (salon) poster(salon, msg.auteur, msg.texte); // aucune verification d'appartenance au salon
}
