import { describe, expect, it } from "vitest";
import {
  channelKey,
  channelUrl,
  findChannel,
  GENERAL_FILENAME,
  GENERAL_KEYS,
  GENERAL_PERMISSIONS,
  GENERAL_TIPS,
  generalAlt,
  generalButtons,
  generalPayload,
  openToEveryone,
  greeters,
  missingGeneralPermissions,
  readChannels,
  TICKET_KEYS,
  type GuildChannel,
} from "../../src/lib/arrivees-general";
import { ICONES_PARTIES } from "../../src/lib/icones-parties";

const GUILD = "135090549460002409";
const USER = "222222222222222201";
const channel = (id: string, name: string, type = 0): GuildChannel => ({ id, type, name, permission_overwrites: [] });

describe("le salon général, retrouvé à son nom", () => {
  it("ne garde que le mot : ni émoji, ni crochets, ni points, ni accents, ni majuscules", () => {
    expect(channelKey("・「💬」général")).toBe("general");
    expect(channelKey("💬┃Général")).toBe("general");
    expect(channelKey("general")).toBe("general");
    expect(channelKey("・「📩」ticket")).toBe("ticket");
    expect(channelKey("général-en")).toBe("generalen");
  });

  it("trouve le seul salon écrit qui porte ce nom, et pas un salon vocal ni une catégorie du même nom", () => {
    const channels = [channel("100000000000000001", "Général", 4), channel("100000000000000002", "🔊 général", 2), channel("100000000000000003", "・「💬」général"), channel("100000000000000004", "général-anglais")];
    expect(findChannel(channels, GENERAL_KEYS)).toEqual({ found: channels[2] });
  });

  it("ne choisit pas entre deux salons du même nom, et dit quand il n'y en a aucun", () => {
    expect(findChannel([channel("100000000000000001", "général"), channel("100000000000000002", "💬 général")], GENERAL_KEYS)).toEqual({ found: null, count: 2 });
    expect(findChannel([channel("100000000000000001", "discussion")], GENERAL_KEYS)).toEqual({ found: null, count: 0 });
  });

  it("trouve le salon des tickets, au singulier ou au pluriel", () => {
    expect(findChannel([channel("100000000000000001", "・「📩」ticket")], TICKET_KEYS).found?.id).toBe("100000000000000001");
    expect(findChannel([channel("100000000000000001", "tickets")], TICKET_KEYS).found?.id).toBe("100000000000000001");
    expect(findChannel([channel("100000000000000001", "ticket-1234")], TICKET_KEYS).found).toBeNull();
  });

  it("lit les salons tels que Discord les donne, et ignore ce qui n'a pas la forme attendue", () => {
    const body = [
      { id: "100000000000000001", type: 0, name: "général", position: 3, permission_overwrites: [{ id: GUILD, type: 0, allow: "0", deny: "2048" }, { id: 5 }] },
      { id: "pas un numéro", type: 0, name: "x" },
      { id: "100000000000000002", type: 0 },
      null,
      "texte",
    ];
    expect(readChannels(body)).toEqual([{ id: "100000000000000001", type: 0, name: "général", permission_overwrites: [{ id: GUILD, type: 0, allow: "0", deny: "2048" }] }]);
    expect(readChannels({ message: "401" })).toEqual([]);
  });

  it("demande trois droits dans le salon général : le voir, y écrire, y joindre l'image ; ni lire ni retirer", () => {
    expect(GENERAL_PERMISSIONS.map((p) => p.label)).toEqual(["Voir le salon", "Envoyer des messages", "Joindre des fichiers"]);
    const all = GENERAL_PERMISSIONS.reduce((sum, p) => sum | p.bit, 0n);
    expect(all).toBe((1n << 10n) | (1n << 11n) | (1n << 15n));
    expect(missingGeneralPermissions(all)).toEqual([]);
    expect(missingGeneralPermissions(all & ~(1n << 15n))).toEqual(["Joindre des fichiers"]);
  });
});

describe("le message du salon général", () => {
  it("ne mentionne que le nouveau venu : sa mention est le seul texte, et rien d'autre ne peut sonner", () => {
    const payload = generalPayload(USER, "ALT", generalButtons(GUILD, "100000000000000009", "https://les-gaulois.github.io"));
    expect(payload).toEqual({
      content: `<@${USER}>`,
      allowed_mentions: { parse: [], users: [USER] },
      attachments: [{ id: 0, filename: GENERAL_FILENAME, description: "ALT" }],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 5, label: "Salon des tickets", url: `https://discord.com/channels/${GUILD}/100000000000000009` },
            { type: 2, style: 5, label: "Le site du clan", url: "https://les-gaulois.github.io" },
          ],
        },
      ],
    });
    // Pas de message discret : le salut doit se voir.
    expect(payload["flags"]).toBeUndefined();
  });

  it("sans salon des tickets, garde seulement le bouton du site", () => {
    expect(generalButtons(GUILD, null, "https://les-gaulois.github.io")).toEqual([{ label: "Le site du clan", url: "https://les-gaulois.github.io" }]);
    expect(generalPayload(USER, "ALT", [])["components"]).toBeUndefined();
    expect(channelUrl(GUILD, "100000000000000009")).toBe(`https://discord.com/channels/${GUILD}/100000000000000009`);
  });

  it("refuse un numéro de joueur qui n'en est pas un : rien d'autre ne peut entrer dans la mention", () => {
    expect(() => generalPayload("everyone", "ALT", [])).toThrow();
    expect(() => generalPayload(`${USER}> @everyone <@${USER}`, "ALT", [])).toThrow();
  });

  it("décrit l'image entière pour les lecteurs d'écran : le titre, le nom entier et les quatre conseils", () => {
    const alt = generalAlt("Brennos 🐉", "GAL");
    expect(alt).toBe(
      "Image de bienvenue du clan [GAL]. Ho ! Un nouveau membre : Brennos 🐉. Rejoindre le clan : ouvre un ticket avec ton pseudo OpenFront. Viens en vocal : pour jouer avec les autres joueurs du clan. Une question : demande au Staff ou à un membre certifié. Amuse-toi bien : et ramène d'autres compagnons. En bas, la palissade du village.",
    );
    expect(alt.length).toBeLessThanOrEqual(1024);
  });

  it("reprend les conseils du modèle du pilote, sans le salon du tutoriel que Discord ne connaît plus", () => {
    expect(GENERAL_TIPS.map((tip) => tip.titre.replace(/\s/g, " "))).toEqual(["Rejoindre le clan", "Viens en vocal", "Une question ?", "Amuse-toi bien"]);
    for (const tip of GENERAL_TIPS) expect(ICONES_PARTIES[tip.icone]).toBeDefined();
    expect(GENERAL_TIPS.map((tip) => tip.texte).join(" ")).not.toMatch(/tuto|inconnu|rang|plutonium/i);
  });
});

describe("les Gaulois du village qui saluent", () => {
  const membres = Array.from({ length: 12 }, (_, i) => ({ id: `id-${i}`, nom: `Gaulois${i}` }));
  const tenues = new Map(membres.filter((_, i) => i % 3 !== 0).map((m) => [m.id, `tenue de ${m.nom}`]));

  it("ne prend que des membres dont le serveur a rendu la tenue, au plus `max`", () => {
    const choisis = greeters(membres, tenues, "135090549460002501", 4);
    expect(choisis).toHaveLength(4);
    for (const g of choisis) expect(g.tenue).toBe(`tenue de ${g.nom}`);
    expect(greeters(membres, tenues, "135090549460002501", 50)).toHaveLength(tenues.size);
    expect(greeters(membres, new Map(), "135090549460002501", 4)).toEqual([]);
    expect(greeters(membres, tenues, "135090549460002501", 0)).toEqual([]);
  });

  it("tire toujours les mêmes pour une arrivée, et d'autres pour la suivante", () => {
    const a = greeters(membres, tenues, "135090549460002501", 3);
    expect(greeters([...membres].reverse(), tenues, "135090549460002501", 3)).toEqual(a);
    const tirages = new Set(Array.from({ length: 20 }, (_, i) => greeters(membres, tenues, `13509054946000${2600 + i}`, 3).map((g) => g.nom).join(",")));
    expect(tirages.size).toBeGreaterThan(10);
  });

  it("donne sa chance à chacun : sur beaucoup d'arrivées, tous les Gaulois saluent", () => {
    const vus = new Set<string>();
    for (let i = 0; i < 200; i++) for (const g of greeters(membres, tenues, `arrivee-${i}`, 3)) vus.add(g.nom);
    expect(vus.size).toBe(tenues.size);
  });

  it("ne montre pas deux fois le même pseudo, ni un pseudo vide", () => {
    const doubles = [
      { id: "a", nom: "Brennos" },
      { id: "b", nom: "brennos" },
      { id: "a", nom: "Brennos" },
      { id: "c", nom: "  " },
    ];
    const carte = new Map([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    expect(greeters(doubles, carte, "x", 5)).toHaveLength(1);
  });
});

describe("ce que la relecture a trouvé", () => {
  it("dit dans la description les Gaulois qui saluent, seulement s'il y en a", () => {
    expect(generalAlt("Brennos", "GAL", 3).endsWith("En bas, devant la palissade du village, des Gaulois du clan lui disent coucou.")).toBe(true);
    expect(generalAlt("Brennos", "GAL", 0)).not.toContain("coucou");
  });

  it("reconnaît un salon fermé à tout le monde, comme le ticket privé d'un joueur", () => {
    const VIEW = String(1n << 10n);
    const base = { id: "100000000000000001", type: 0, name: "ticket" };
    expect(openToEveryone({ ...base, permission_overwrites: [] }, GUILD)).toBe(true);
    expect(openToEveryone({ ...base, permission_overwrites: [{ id: GUILD, type: 0, allow: "0", deny: VIEW }] }, GUILD)).toBe(false);
    expect(openToEveryone({ ...base, permission_overwrites: [{ id: GUILD, type: 0, allow: "0", deny: String((1n << 11n) | (1n << 10n)) }] }, GUILD)).toBe(false);
    // Fermé à l'écriture seulement : on le voit, il reste ouvert à tous.
    expect(openToEveryone({ ...base, permission_overwrites: [{ id: GUILD, type: 0, allow: "0", deny: String(1n << 11n) }] }, GUILD)).toBe(true);
    // Un réglage pour un rôle ou un membre ne ferme pas le salon à tout le monde.
    expect(openToEveryone({ ...base, permission_overwrites: [{ id: "100000000000000099", type: 1, allow: "0", deny: VIEW }] }, GUILD)).toBe(true);
    expect(openToEveryone({ ...base, permission_overwrites: [{ id: GUILD, type: 0, allow: "0", deny: "pas un nombre" }] }, GUILD)).toBe(true);
  });
});
