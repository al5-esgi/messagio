import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "node:http";
import { verifyJwtPayload, RateLimiter, SECRET } from "./security-helpers.ts";

// ============================================================================
//  Serveur ws securise - remplace naive-stub.ts (TRANSPOSITION.md, etape 3).
// ============================================================================
//  Ce qui change par rapport au stub :
//   - securite AU HANDSHAKE : JWT obligatoire, Origin controlee, avant l'upgrade ;
//   - l'auteur d'un message vient du JWT, plus de la charge utile cliente ;
//   - rate-limiting par connexion, fermeture 1008 au-dela du seuil ;
//   - keepalive ping/pong : les connexions muettes sont coupees ;
//   - diffusion EVENEMENTIELLE : on n'emet que lorsque l'etat change, plus toutes les 500 ms.
//
//  Ce qui ne change PAS encore (le stub avait deja ces defauts) :
//   - aucune room : tous les salons partent a tous les clients          (etape 4)
//   - aucune presence ni indicateur de saisie                            (etape 5)
//   - aucune deduplication a la reconnexion                              (etape 6)
// ============================================================================

/**
 * Seuil de rate-limiting, en messages par seconde et par connexion.
 *
 * Un chat est peu bavard cote client : un humain poste rarement plus d'un message par
 * seconde. On garde toutefois de la marge pour l'indicateur de saisie de l'etape 5, qui
 * emettra plusieurs signaux `typing` par seconde. Un flux de cotations tolererait bien
 * davantage ; un formulaire, beaucoup moins.
 */
export const MAX_MESSAGES_PAR_SECONDE = 15;

/** Periode du keepalive : on ping, et on coupe qui n'a pas repondu au tour precedent. */
const KEEPALIVE_MS = 30_000;

/** Origines autorisees a ouvrir une WebSocket (defense contre le cross-site WS hijacking). */
const ORIGINES_AUTORISEES = (
  process.env.ORIGINES_AUTORISEES ?? "http://localhost:3000,http://127.0.0.1:3000"
).split(",");

export interface CanalHooks<TInput> {
  /** L'etat complet a diffuser (serialise en JSON tel quel). */
  fullState(): unknown;
  /** Valide/parse un message client ; renvoie null pour ignorer. */
  parseInput(raw: unknown): TInput | null;
  /** Applique l'entree cliente, deja authentifiee. */
  applyInput(input: TInput, membre: string): void;
}

/** L'identite tiree du JWT, rattachee a la requete d'upgrade pour le handler `connection`. */
type RequeteAuthentifiee = IncomingMessage & { membre?: string };

/**
 * Extrait le JWT du handshake. Deux emplacements acceptes :
 *   - `?token=<jwt>` : simple, mais le token finit dans les journaux d'acces ;
 *   - `Sec-WebSocket-Protocol: jwt, <jwt>` : n'apparait pas dans l'URL, a preferer.
 */
function extraireToken(req: IncomingMessage): string | null {
  const parUrl = new URL(req.url ?? "", "http://x").searchParams.get("token");
  if (parUrl) return parUrl;

  const protocoles = (req.headers["sec-websocket-protocol"] ?? "")
    .split(",")
    .map((p) => p.trim());
  if (protocoles[0] === "jwt" && protocoles[1]) return protocoles[1];
  return null;
}

export function demarrerServeurWs<TInput>(
  httpServer: Server,
  hooks: CanalHooks<TInput>,
): WebSocketServer {
  const wss = new WebSocketServer({
    server: httpServer,

    // Tout se joue ICI : `verifyClient` s'execute avant l'envoi du 101, c'est-a-dire
    // pendant qu'on parle encore HTTP. Une fois la connexion etablie il n'y a plus
    // d'en-tetes, donc plus aucune occasion d'authentifier.
    verifyClient: (
      info: { origin: string; req: IncomingMessage },
      done: (ok: boolean, code?: number, msg?: string) => void,
    ) => {
      // 403 = probleme de PROVENANCE. L'Origin est posee par le navigateur et le
      // JavaScript d'une page ne peut pas la falsifier : elle protege contre un onglet
      // detourne, pas contre un client hostile (wscat n'en envoie aucune).
      if (info.origin && !ORIGINES_AUTORISEES.includes(info.origin)) {
        return done(false, 403, "Origin non autorisee");
      }

      // 401 = probleme d'IDENTITE. C'est le JWT, et lui seul, qui authentifie.
      const payload = verifyJwtPayload(extraireToken(info.req), SECRET);
      if (!payload) return done(false, 401, "Token invalide ou absent");

      (info.req as RequeteAuthentifiee).membre = payload.sub;
      done(true);
    },

    // Si le client a presente son token en sous-protocole, il faut lui confirmer
    // lequel on retient, sinon le navigateur ferme la connexion aussitot ouverte.
    handleProtocols: (protocoles) => (protocoles.has("jwt") ? "jwt" : false),
  });

  const limiteurs = new WeakMap<WebSocket, RateLimiter>();
  const vivant = new WeakMap<WebSocket, boolean>();

  const instantane = () =>
    JSON.stringify({ type: "state", state: hooks.fullState() });

  const diffuser = () => {
    const msg = instantane();
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(msg);
    }
  };

  wss.on("connection", (socket, req) => {
    const membre = (req as RequeteAuthentifiee).membre ?? "inconnu";
    const limiteur = new RateLimiter(MAX_MESSAGES_PAR_SECONDE);
    limiteurs.set(socket, limiteur);
    vivant.set(socket, true);

    socket.on("pong", () => vivant.set(socket, true));
    socket.on("close", () => limiteur.stop());

    socket.send(instantane());

    socket.on("message", (brut) => {
      if (!limiteur.hit()) {
        // 1008 "policy violation" : la connexion a enfreint une regle, on la ferme.
        socket.close(1008, "rate limit exceeded");
        return;
      }

      const texte = brut.toString();
      let analyse: unknown;
      try {
        analyse = JSON.parse(texte);
      } catch {
        socket.send(`echo: ${texte}`); // aide au test manuel : wscat, page du kit
        return;
      }

      const entree = hooks.parseInput(analyse);
      if (!entree) return;

      // L'identite vient du JWT verifie au handshake, jamais du corps du message :
      // un client ne peut plus se faire passer pour quelqu'un d'autre.
      hooks.applyInput(entree, membre);
      diffuser();
    });
  });

  // Keepalive : une connexion coupee brutalement (wifi perdu, machine endormie) reste
  // "ouverte" cote serveur jusqu'a expiration TCP. Le ping/pong la detecte en 30 s.
  const battement = setInterval(() => {
    for (const socket of wss.clients) {
      if (vivant.get(socket) === false) {
        socket.terminate();
        continue;
      }
      vivant.set(socket, false);
      socket.ping();
    }
  }, KEEPALIVE_MS);

  wss.on("close", () => clearInterval(battement));
  return wss;
}
