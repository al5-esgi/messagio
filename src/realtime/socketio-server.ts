import { Server, type Socket } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { verifyJwtPayload, RateLimiter, SECRET } from "./security-helpers.ts";
import { messagesDepuis, peutRejoindre } from "../domain.ts";
import { posterEtNotifier, type Store } from "../store.ts";
import {
  DepartsDifferes,
  membresDeLaRoom,
  estPresent,
  DUREE_SAISIE_MS,
  type PresenceVue,
  type DonneesPresence,
} from "./presence.ts";

// ============================================================================
//  Serveur Socket.IO - remplace ws-server.ts (TRANSPOSITION.md, etape 4).
// ============================================================================
//  Ce que cette etape corrige : le "tout le monde voit tout". Chaque salon a
//  desormais sa room `salon:<id>`, et `io.to(room).emit(...)` n'atteint qu'elle.
//
//  Ce que Socket.IO apporte et qu'il aurait fallu ecrire a la main sur `ws` :
//   - les rooms, justement ;
//   - les acks : le client sait que son message a ete accepte ET numerote ;
//   - la reconnexion automatique avec backoff ;
//   - le heartbeat (pingInterval / pingTimeout), qui remplace notre ping/pong.
//
//  Etape 5 : presence par salon, signal ephemere `typing`, snapshot dans l'ack du join.
//
//  Etape 6 : resynchronisation par numero de sequence. Le `join` accepte un `depuisSeq` ;
//  le serveur renvoie tout ce qui a suivi, et le client deduplique (`SalonClient`).
//
//  Ce qui reste a faire :
//   - plusieurs instances                                                (etape 7)
//   - signaling WebRTC                                                   (etape 8)
// ============================================================================

/** Voir ws-server.ts : meme raisonnement, un chat est peu bavard cote client. */
export const MAX_MESSAGES_PAR_SECONDE = 15;

const ORIGINES_AUTORISEES = (
  process.env.ORIGINES_AUTORISEES ??
  "http://localhost:3000,http://127.0.0.1:3000"
).split(",");

/** Convention de room du sujet : un salon = une room. */
export const roomDuSalon = (salonId: string) => `salon:${salonId}`;

/** L'inverse : `salon:dev` -> `dev`, et `null` si ce n'est pas une room de salon. */
function salonDeLaRoom(room: string): string | null {
  return room.startsWith("salon:") ? room.slice("salon:".length) : null;
}

/**
 * Contenu de `socket.data`.
 *
 * ATTENTION (etape 7) : avec l'adapter Redis, `fetchSockets()` SERIALISE `socket.data`
 * en JSON pour le transmettre aux autres instances. Tout ce qu'on y met doit donc etre
 * serialisable. Un `RateLimiter` y ferait entrer un `setInterval`, dont la structure est
 * circulaire : `JSON.stringify` leve, et l'instance interrogee tombe. Le limiteur est
 * donc garde a part, dans une Map locale.
 */
interface DonneesSocket extends DonneesPresence {}

type SocketChat = Socket & { data: DonneesSocket };

export interface ResultatJoin {
  ok: boolean;
  raison?: string;
  /** Instantane du salon, seulement si le join est accepte. */
  messages?: unknown[];
  /** Qui est deja la, et qui est en train d'ecrire (etape 5). */
  presents?: PresenceVue[];
  /** Dernier seq connu du salon : permet au client de detecter un trou (etape 6). */
  dernierSeq?: number;
}

export interface OptionsJoin {
  /**
   * Dernier `seq` deja affiche par le client. A la reconnexion il le transmet et le
   * serveur renvoie TOUT ce qui a suivi, au lieu des 30 derniers messages. Le
   * chevauchement eventuel est absorbe par la deduplication cliente (etape 6).
   */
  depuisSeq?: number;
}

export interface ResultatMessage {
  ok: boolean;
  raison?: string;
  /** Numero de sequence attribue par le serveur : la preuve que le message est enregistre. */
  seq?: number;
}

export function demarrerSocketIo(httpServer: HttpServer, store: Store): Server {
  const departs = new DepartsDifferes();
  /** Limiteurs par socket. Hors de `socket.data` : voir DonneesSocket. */
  const limiteurs = new Map<string, RateLimiter>();

  const io = new Server(httpServer, {
    pingInterval: 25_000,
    pingTimeout: 20_000,
    cors: { origin: ORIGINES_AUTORISEES },
  });

  // Autorisation au handshake : meme principe qu'a l'etape 3, mais le jeton passe par
  // `handshake.auth` plutot que par l'URL - il ne finit donc pas dans les journaux.
  io.use((socket, next) => {
    const token = (socket.handshake.auth?.token as string | undefined) ?? null;
    const payload = verifyJwtPayload(token, SECRET);
    if (!payload) return next(new Error("unauthorized"));
    (socket.data as DonneesSocket).membre = payload.sub;
    (socket.data as DonneesSocket).saisitJusqua = 0;
    next();
  });

  /**
   * Politique d'autorisation par room.
   *
   * Regle du sujet : une room doit designer un salon existant, et un salon dote d'une
   * liste de membres n'accepte que ceux-ci (`dev` est reserve a alice et bob dans le seed).
   * Un salon sans liste est ouvert.
   */
  function roomAutorisee(
    membre: string,
    room: string,
  ): { ok: true } | { ok: false; raison: string } {
    const salonId = salonDeLaRoom(room);
    if (!salonId)
      return { ok: false, raison: "room hors convention salon:<id>" };
    const salon = store.salons.get(salonId);
    if (!salon) return { ok: false, raison: "salon inconnu" };
    if (!peutRejoindre(salon, membre))
      return { ok: false, raison: "salon prive : vous n'en etes pas membre" };
    return { ok: true };
  }

  io.on("connection", (brut) => {
    const socket = brut as SocketChat;
    const { membre } = socket.data;
    const limiteur = new RateLimiter(MAX_MESSAGES_PAR_SECONDE);
    limiteurs.set(socket.id, limiteur);

    /** Retire la socket d'une room et programme, si besoin, un depart differe. */
    function quitterRoom(s: SocketChat, room: string) {
      s.leave(room);
      departs.programmer(room, s.data.membre, (parti) => {
        // A l'echeance, on re-interroge TOUTES les instances : la personne a pu
        // revenir ailleurs, ou avoir un autre onglet sur l'autre instance.
        // Le callback d'un minuteur n'a personne pour rattraper une promesse rejetee :
        // on capture ici, sinon le processus tombe.
        void estPresent(io, room, parti)
          .then((present) => {
            if (!present) io.to(room).emit("presence-left", { membre: parti });
          })
          .catch(() => {});
      });
    }

    // `disconnecting` et non `disconnect` : au moment ou `disconnect` se declenche,
    // Socket.IO a deja vide `socket.rooms` et on ne saurait plus quelles rooms prevenir.
    socket.on("disconnecting", () => {
      for (const room of [...socket.rooms]) {
        if (salonDeLaRoom(room)) quitterRoom(socket, room);
      }
    });

    socket.on("disconnect", () => {
      limiteur.stop();
      limiteurs.delete(socket.id);
    });

    // --- signal ephemere : diffuse, jamais persiste --------------------------
    // Pas d'ack : un `typing` perdu n'a aucune consequence, et il est reemis en
    // permanence. Il compte dans le rate-limit, d'ou la marge prevue a l'etape 3.
    socket.on("typing", () => {
      if (!limiteur.hit()) return;
      // Porte par la socket, donc visible des autres instances via fetchSockets().
      socket.data.saisitJusqua = Date.now() + DUREE_SAISIE_MS;
      for (const room of socket.rooms) {
        if (!salonDeLaRoom(room)) continue;
        socket.to(room).emit("typing", { membre });
      }
    });

    // --- join : la decision d'autorisation est portee par l'ACK, pas par un evenement separe.
    // Signature souple : `join(room, ack)` (etape 4) ou `join(room, options, ack)` (etape 6).
    // Handler asynchrone : Socket.IO n'attrape pas les rejets, d'ou le try/catch global
    // en fin de fonction. Sans lui, une instance qui ne repond pas ferait tomber celle-ci.
    socket.on("join", async (room: string, ...reste: unknown[]) => {
      const ack = reste.find((a) => typeof a === "function") as
        ((r: ResultatJoin) => void) | undefined;
      const options = (reste.find((a) => a !== null && typeof a === "object") ??
        {}) as OptionsJoin;

      try {
        const verdict = roomAutorisee(membre, room);
        if (!verdict.ok) {
          ack?.({ ok: false, raison: verdict.raison });
          return;
        }

        // Un onglet ne suit qu'un salon a la fois : on quitte les autres rooms de salon.
        for (const precedente of [...socket.rooms]) {
          if (precedente !== socket.id && salonDeLaRoom(precedente)) {
            quitterRoom(socket, precedente);
          }
        }

        // Etat AVANT d'entrer : sert a decider s'il faut annoncer une arrivee.
        const dejaLa = await estPresent(io, room, membre);
        const retourDansLaGrace = departs.annuler(room, membre);

        socket.join(room);
        const salon = store.salons.get(salonDeLaRoom(room)!)!;
        const premiereConnexion = !dejaLa && !retourDansLaGrace;

        // Le snapshot part dans l'ack : l'arrivant voit l'etat courant immediatement,
        // sans attendre que quelqu'un d'autre bouge.
        //
        // Etape 6 : si le client annonce un `depuisSeq`, on renvoie tout ce qui a suivi
        // plutot que les 30 derniers messages - c'est la resynchronisation apres coupure.
        // On ne cherche pas a eviter le chevauchement : le client deduplique par `seq`,
        // donc renvoyer un message deja vu est sans consequence. C'est precisement ce qui
        // rend le renvoi sur, alors qu'a l'etape 4 il produisait un doublon.
        const depuisSeq = Number(options.depuisSeq ?? 0) || 0;
        const messages =
          depuisSeq > 0
            ? messagesDepuis(salon, depuisSeq)
            : messagesDepuis(salon, 0).slice(-30);

        ack?.({
          ok: true,
          messages,
          presents: await membresDeLaRoom(io, room), // toutes instances confondues
          dernierSeq: salon.dernierSeq,
        });

        // Rien a annoncer si la personne avait deja un onglet ouvert, ou si elle revient
        // avant la fin du delai de grace : dans les deux cas elle n'etait jamais "partie".
        if (premiereConnexion) {
          // `socket.to(room)` exclut l'emetteur ; `io.to(room)` l'inclurait.
          socket
            .to(room)
            .emit("presence-joined", { membre, salonId: salon.id });
          store.notifications.publier({
            type: "membre-rejoint",
            salonId: salon.id,
            membre,
            at: Date.now(),
          });
        }
      } catch (err) {
        console.error("[join] echec :", err);
        ack?.({ ok: false, raison: "erreur serveur, reessayez" });
      }
    });

    // --- evenement metier, confirme par ack -----------------------------------
    socket.on(
      "message",
      (
        charge: { salonId?: string; texte?: string },
        ack?: (r: ResultatMessage) => void,
      ) => {
        if (!limiteur.hit()) {
          ack?.({ ok: false, raison: "rate limit exceeded" });
          socket.disconnect(true);
          return;
        }

        const salonId = charge?.salonId;
        const texte = charge?.texte?.trim();
        if (!salonId || !texte) {
          ack?.({ ok: false, raison: "salonId et texte requis" });
          return;
        }

        const room = roomDuSalon(salonId);
        // On ne se fie pas au salonId annonce : il faut avoir REJOINT la room.
        // Sans cela, un client autorise sur `general` pourrait ecrire dans `dev`.
        if (!socket.rooms.has(room)) {
          ack?.({ ok: false, raison: "rejoignez le salon avant d'y ecrire" });
          return;
        }

        const salon = store.salons.get(salonId)!;
        const msg = posterEtNotifier(store, salon, membre, texte);

        io.to(room).emit("message", msg); // diffusion a la seule room concernee
        ack?.({ ok: true, seq: msg.seq }); // le seq prouve l'enregistrement serveur
      },
    );
  });

  return io;
}
