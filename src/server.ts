import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { registerRoutes } from "./rest.ts";
import { createStore } from "./store.ts";
import {
  demarrerSocketIo,
  MAX_MESSAGES_PAR_SECONDE,
} from "./realtime/socketio-server.ts";
import {
  brancherAdapter,
  observerConnexions,
  exposerMetriques,
  INSTANCE,
} from "./realtime/scaling.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

const store = createStore();
const app = Fastify({ logger: false });

await app.register(fastifyStatic, { root: join(HERE, "..", "public") });
registerRoutes(app, store);
exposerMetriques(app);

await app.listen({ port: PORT, host: "0.0.0.0" });
console.log(`chat-multi-salons : http://localhost:${PORT}`);

// --- couche temps reel : Socket.IO, une room par salon (etape 4) ---
// ws-server.ts et naive-stub.ts restent dans le depot comme points de comparaison.
const io = demarrerSocketIo(app.server, store);

// Etape 7 : fan-out entre instances via Redis pub/sub. Le code des rooms (etapes 4 a 6)
// n'est pas modifie - c'est tout l'interet de l'adapter.
const distribue = await brancherAdapter(io);
observerConnexions(io);

console.log(
  `[${INSTANCE}] couche temps reel : Socket.IO (JWT + rooms salon:<id> + ack + ` +
    `${MAX_MESSAGES_PAR_SECONDE} msg/s)` +
    (distribue ? " + redis-adapter" : ""),
);
