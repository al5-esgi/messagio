import type { Server } from "socket.io";
import type { FastifyInstance } from "fastify";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { Registry, Gauge, Counter, collectDefaultMetrics } from "prom-client";

// ============================================================================
//  Scaling horizontal + observabilite (TRANSPOSITION.md, etape 7).
// ============================================================================
//  Le point de la seance : le code applicatif des etapes 4 a 6 ne bouge pas.
//  `io.to("salon:dev").emit(...)` continue de s'ecrire pareil ; l'adapter Redis
//  se charge de propager l'emission aux autres instances via pub/sub.
//
//  Sans adapter, deux clients places sur des instances differentes par le proxy
//  sont dans deux rooms `salon:dev` distinctes, qui s'ignorent : les messages ne
//  passent pas, et la liste des presents est incomplete.
// ============================================================================

/** Nom de l'instance, injecte par docker-compose (A / B). `solo` hors conteneur. */
export const INSTANCE = process.env.INSTANCE ?? "solo";

export const registre = new Registry();
collectDefaultMetrics({ register: registre, labels: { instance: INSTANCE } });

const connexionsActives = new Gauge({
  name: "ws_active_connections",
  help: "connexions Socket.IO actuellement ouvertes sur cette instance",
  labelNames: ["instance"],
  registers: [registre],
});
const connexionsTotal = new Counter({
  name: "ws_connects_total",
  help: "connexions etablies depuis le demarrage (cumul)",
  labelNames: ["instance"],
  registers: [registre],
});
const deconnexionsTotal = new Counter({
  name: "ws_disconnects_total",
  help: "deconnexions depuis le demarrage (cumul)",
  labelNames: ["instance"],
  registers: [registre],
});

/**
 * Branche l'adapter Redis si `REDIS_URL` est defini.
 *
 * En cas d'echec on NE fait pas tomber le serveur : il demarre en instance unique,
 * avec un fan-out local seulement. C'est ce qui permet de garder `npm start` utilisable
 * hors Docker, sans Redis.
 */
export async function brancherAdapter(io: Server): Promise<boolean> {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log(`[${INSTANCE}] pas de REDIS_URL : instance unique, fan-out local`);
    return false;
  }
  try {
    // reconnectStrategy: false -> connect() echoue vite si Redis est absent,
    // au lieu de boucler indefiniment au demarrage.
    const pub = createClient({
      url,
      socket: { reconnectStrategy: false, connectTimeout: 1000 },
    });
    const sub = pub.duplicate();
    pub.on("error", () => {});
    sub.on("error", () => {});
    await Promise.all([pub.connect(), sub.connect()]);
    io.adapter(createAdapter(pub, sub));
    console.log(`[${INSTANCE}] redis-adapter branche sur ${url}`);
    return true;
  } catch {
    console.warn(
      `[${INSTANCE}] Redis injoignable : instance unique (fan-out local seulement)`,
    );
    return false;
  }
}

/** Compte les connexions. A appeler apres `demarrerSocketIo`. */
export function observerConnexions(io: Server): void {
  io.on("connection", (socket) => {
    connexionsActives.inc({ instance: INSTANCE });
    connexionsTotal.inc({ instance: INSTANCE });
    socket.on("disconnect", () => {
      connexionsActives.dec({ instance: INSTANCE });
      deconnexionsTotal.inc({ instance: INSTANCE });
    });
  });
}

/**
 * Expose `/metrics` au format Prometheus, et `/instance` pour savoir d'un coup d'oeil
 * quelle instance a servi la requete (utile derriere le proxy sticky).
 */
export function exposerMetriques(app: FastifyInstance): void {
  app.get("/metrics", async (_req, reply) => {
    reply.header("Content-Type", registre.contentType);
    return registre.metrics();
  });
  app.get("/instance", async () => ({ instance: INSTANCE }));
}
