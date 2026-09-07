// Domaine : salons de discussion, membres, messages numerotes par salon. Pur, sans I/O.

export interface Membre {
  id: string;
  pseudo: string;
}

export interface Message {
  seq: number; // croissant PAR salon
  salonId: string;
  auteur: string;
  texte: string;
  at: number;
}

export interface Salon {
  id: string;
  nom: string;
  messages: Message[];
  dernierSeq: number;
  /** Pseudos autorises. Vide = salon ouvert a tous (etape 4). */
  membres: string[];
}

const MAX_HISTORIQUE = 200;

export function creerSalon(id: string, nom: string, membres: string[] = []): Salon {
  return { id, nom, messages: [], dernierSeq: 0, membres };
}

/** Un salon sans liste de membres est ouvert ; sinon il faut y figurer. */
export function peutRejoindre(salon: Salon, membre: string): boolean {
  return salon.membres.length === 0 || salon.membres.includes(membre);
}

export function poster(salon: Salon, auteur: string, texte: string): Message {
  const msg: Message = {
    seq: ++salon.dernierSeq,
    salonId: salon.id,
    auteur,
    texte,
    at: Date.now(),
  };
  salon.messages.push(msg);
  if (salon.messages.length > MAX_HISTORIQUE) salon.messages.shift();
  return msg;
}

export function messagesDepuis(salon: Salon, seq: number): Message[] {
  return salon.messages.filter((m) => m.seq > seq);
}
