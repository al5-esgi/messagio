import type { FastifyInstance } from "fastify";
import { messagesDepuis, poster } from "./domain.ts";
import type { Store } from "./store.ts";

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
    return reply.code(201).send(poster(salon, body.auteur, body.texte));
  });
}
