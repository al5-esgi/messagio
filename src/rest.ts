import type { FastifyInstance, FastifyReply } from "fastify";
import { messagesDepuis } from "./domain.ts";
import { posterEtNotifier, type Store } from "./store.ts";
import type { NotificationNumerotee } from "./realtime/sse-notifications.ts";
import jwt from "jsonwebtoken";
import { SECRET } from "./realtime/security-helpers.ts";

/** Intervalle des commentaires de maintien de connexion (proxies, timeouts). */
const BATTEMENT_MS = 15_000;

function ecrireEvenement(reply: FastifyReply, evt: NotificationNumerotee): void {
  reply.raw.write(`id: ${evt.id}\n`);
  reply.raw.write(`event: ${evt.notification.type}\n`);
  reply.raw.write(`data: ${JSON.stringify(evt.notification)}\n\n`);
}

export function registerRoutes(app: FastifyInstance, store: Store): void {
  app.get("/api/salons", async () =>
    [...store.salons.values()].map((s) => ({
      id: s.id,
      nom: s.nom,
      dernierSeq: s.dernierSeq,
    })),
  );

  app.get("/api/salons/:id/messages", async (req, reply) => {
    const salon = store.salons.get((req.params as { id: string }).id);
    if (!salon) return reply.code(404).send({ error: "salon inconnu" });
    const since = Number((req.query as { since?: string }).since ?? 0);
    return messagesDepuis(salon, since);
  });

  app.post("/api/salons/:id/messages", async (req, reply) => {
    const salon = store.salons.get((req.params as { id: string }).id);
    if (!salon) return reply.code(404).send({ error: "salon inconnu" });
    const body = (req.body ?? {}) as { auteur?: string; texte?: string };
    if (!body.auteur || !body.texte)
      return reply.code(400).send({ error: "auteur et texte requis" });
    return reply
      .code(201)
      .send(posterEtNotifier(store, salon, body.auteur, body.texte));
  });

  // --- Jeton de developpement (etape 3) ---------------------------------------
  // ATTENTION : cette route delivre un JWT a QUICONQUE le demande, sans authentifier
  // personne. Elle existe pour que le front de demonstration et `wscat` puissent
  // ouvrir une WebSocket pendant le TP. Dans une vraie application, le jeton est
  // emis par la connexion (mot de passe, OAuth...), jamais par un endpoint ouvert.
  app.get("/api/dev-token", async (req) => {
    const pseudo = (req.query as { pseudo?: string }).pseudo?.trim();
    const sub = pseudo && pseudo.length <= 32 ? pseudo : "anonyme";
    return { token: jwt.sign({ sub }, SECRET, { expiresIn: "4h" }), sub };
  });

  // --- Canal SSE (etape 2) : flux lecture seule des notifications de salon. ---
  // Le stub WebSocket reste en place : SSE est un canal EN PLUS, unidirectionnel.
  //   curl -N http://localhost:3000/api/stream
  //   curl -N -H "Last-Event-ID: 5" http://localhost:3000/api/stream
  app.get("/api/stream", (req, reply) => {
    const query = req.query as { salon?: string; membre?: string };
    const salonId = query.salon;
    if (salonId !== undefined && !store.salons.has(salonId)) {
      return reply.code(404).send({ error: "salon inconnu" });
    }

    reply.hijack(); // Fastify ne gere plus la reponse : le flux reste ouvert.
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // nginx : ne pas tamponner le flux (voir nginx.conf)
    });
    reply.raw.write("retry: 3000\n\n"); // delai de reconnexion suggere a EventSource

    // Rattrapage : `Last-Event-ID` en en-tete (EventSource le renvoie seul),
    // ou `?last-event-id=` en secours pour tester a la main avec curl.
    const brut =
      req.headers["last-event-id"] ??
      (req.query as Record<string, string>)["last-event-id"];
    const lastEventId = Number(brut ?? 0) || 0;

    if (lastEventId > 0 && store.notifications.trouTropGrand(lastEventId)) {
      // Le retard depasse le buffer borne : le rejeu serait incomplet, donc on ne
      // ment pas au client, on lui demande de repartir d'un instantane REST.
      reply.raw.write(
        `event: resync-needed\ndata: ${JSON.stringify({
          raison: "buffer depasse",
          depuis: lastEventId,
          instantane: salonId
            ? `/api/salons/${salonId}/messages`
            : "/api/salons",
        })}\n\n`,
      );
    }
    for (const evt of store.notifications.depuis(lastEventId, salonId)) {
      ecrireEvenement(reply, evt);
    }

    const desabonner = store.notifications.souscrire({
      salonId,
      envoyer: (evt) => ecrireEvenement(reply, evt),
    });

    // Un membre qui ouvre le flux sur un salon precis : notification d'arrivee.
    if (salonId && query.membre) {
      store.notifications.publier({
        type: "membre-rejoint",
        salonId,
        membre: query.membre,
        at: Date.now(),
      });
    }

    const battement = setInterval(
      () => reply.raw.write(": battement\n\n"),
      BATTEMENT_MS,
    );
    req.raw.on("close", () => {
      clearInterval(battement);
      desabonner();
    });
  });
}
