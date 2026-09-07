import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { registerRoutes } from "./rest.ts";
import {
  createStore,
  parseClientMessage,
  applyNaive,
  type ClientMessage,
} from "./store.ts";
import { startNaiveStub } from "./realtime/naive-stub.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);

const store = createStore();
const app = Fastify({ logger: false });

await app.register(fastifyStatic, { root: join(HERE, "..", "public") });
registerRoutes(app, store);

await app.listen({ port: PORT, host: "0.0.0.0" });
console.log(`chat-multi-salons : http://localhost:${PORT}`);

// --- couche temps reel : stub naif (a remplacer, voir TRANSPOSITION.md) ---
startNaiveStub<ClientMessage>(app.server, {
  // diffuse TOUS les salons a TOUT LE MONDE (defaut : etape 4, pas de room par salon)
  fullState: () =>
    Object.fromEntries(
      [...store.salons.values()].map((s) => [s.id, s.messages.slice(-30)]),
    ),
  parseInput: parseClientMessage,
  applyInput: (msg) => applyNaive(store, msg),
});
console.log("couche temps reel : stub naif (voir src/realtime/naive-stub.ts)");
