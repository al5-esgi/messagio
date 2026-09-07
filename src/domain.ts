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
}

const MAX_HISTORIQUE = 200;

export function creerSalon(id: string, nom: string): Salon {
  return { id, nom, messages: [], dernierSeq: 0 };
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
