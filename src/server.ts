import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { registerRoutes } from "./rest.ts";
import {
  createStore,
  parseClientMessage,
  appliquerMessage,
  type ClientMessage,
} from "./store.ts";
import {
  demarrerServeurWs,
  MAX_MESSAGES_PAR_SECONDE,
} from "./realtime/ws-server.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

const store = createStore();
const app = Fastify({ logger: false });

await app.register(fastifyStatic, { root: join(HERE, "..", "public") });
registerRoutes(app, store);

await app.listen({ port: PORT, host: "0.0.0.0" });
console.log(`chat-multi-salons : http://localhost:${PORT}`);

// --- couche temps reel : serveur ws securise (etape 3) ---
// naive-stub.ts n'est plus demarre ; il reste dans le depot comme point de comparaison.
demarrerServeurWs<ClientMessage>(app.server, {
  // diffuse encore TOUS les salons a TOUT LE MONDE (pas de room : etape 4)
  fullState: () =>
    Object.fromEntries(
      [...store.salons.values()].map((s) => [s.id, s.messages.slice(-30)]),
    ),
  parseInput: parseClientMessage,
  applyInput: (msg, membre) => appliquerMessage(store, msg, membre),
});
console.log(
  `couche temps reel : ws securise (JWT + Origin + ${MAX_MESSAGES_PAR_SECONDE} msg/s)`,
);
