import { creerSalon, poster, type Membre, type Salon } from "./domain.ts";

export const MEMBRES: Membre[] = [
  { id: "m-alice", pseudo: "alice" },
  { id: "m-bob", pseudo: "bob" },
  { id: "m-carol", pseudo: "carol" },
];

export function buildSeed(): Map<string, Salon> {
  const salons = new Map<string, Salon>();
  const general = creerSalon("general", "General");
  // Salon prive : sert a demontrer le refus de `join` a l'etape 4.
  const dev = creerSalon("dev", "Dev", ["alice", "bob"]);
  const random = creerSalon("random", "Random");

  const conv: Array<[Salon, string, string]> = [
    [general, "alice", "Salut tout le monde"],
    [general, "bob", "Hello !"],
    [general, "carol", "Bonjour"],
    [dev, "alice", "La CI est verte"],
    [dev, "bob", "Nickel, je merge"],
    [random, "carol", "Cafe ?"],
  ];
  for (const [salon, auteur, texte] of conv) poster(salon, auteur, texte);
  // un peu de volume dans general
  for (let i = 0; i < 34; i++)
    poster(general, i % 2 ? "alice" : "bob", `message ${i + 1}`);

  for (const s of [general, dev, random]) salons.set(s.id, s);
  return salons;
}

if (process.argv.includes("--print")) {
  for (const s of buildSeed().values()) {
    console.log(
      `# ${s.nom} (${s.id}) - ${s.messages.length} messages, dernier seq ${s.dernierSeq}` +
        (s.membres.length ? ` - prive : ${s.membres.join(", ")}` : " - ouvert"),
    );
  }
}
