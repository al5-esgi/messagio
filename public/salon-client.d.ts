// Types de `salon-client.js`, pour que `npm run typecheck` couvre aussi la transcription
// navigateur et sa comparaison avec `src/realtime/convergence.exemple.ts`.
import type { Message } from "../src/domain.ts";

export declare class SalonClient {
  readonly affiches: Message[];
  lastSeq: number;
  /** Renvoie true si le message a ete affiche (false = doublon ignore). */
  recevoir(msg: Message): boolean;
  recevoirLot(msgs: Message[]): number;
}
