import { beforeAll, describe, expect, it } from "vitest";
import { CONCOURS_COMMAND } from "../../src/lib/discord-commande";
import {
  CHAMP_TEXTE,
  CHAMP_TITRE,
  CONCOURS_COMMAND_NAME,
  CONCOURS_MESSAGES,
  CONCOURS_OPT,
  CONCOURS_PREFIX,
  CONCOURS_SITE_URL,
  CONCOURS_SUB,
  COULEURS,
  FIN_PROPOSEES,
  LOGO_URL,
  REVEIL_PATH,
  annonceMessage,
  concoursCommand,
  concoursInteraction,
  concoursMessage,
  concoursTic,
  droitsManquants,
  expliquer,
  finChoices,
  formatParis,
  listeFr,
  parisToUtc,
  parseDuree,
  parseFin,
  parseVue,
  participantsLabel,
  travailler,
  valeursFormulaire,
  type ConcoursDeps,
  type Tire,
  type Vue,
} from "../../supabase/functions/code-discord/concours";
import { SITE_URL, handle, liveDeps, pathForLog, type DiscordCall, type DiscordReply } from "../../supabase/functions/code-discord/index";

// Des numéros inventés, de la forme de ceux de Discord.
const GUILD = "987654321098765432";
const SALON = "135339791521284112";
const MSG = "400000000000000004";
const STAFF = "100000000000000001";
const ROLE = "200000000000000002";
const PING = "200000000000000003";
const BOT = "300000000000000003";
const APP = "300000000000000003";
const TOKEN = "aW50ZXJhY3Rpb24tdG9rZW4tZm9yLXRlc3Rz.abcdefghij";
const PROJECT = "https://abcdefghijklmnopqrst.supabase.co";
const J = (n: number): string => `50000000000000${String(n).padStart(4, "0")}`;
// La prise du robot sur un concours, comme le serveur la donne.
const JETON = "0f1e2d3c-4b5a-4987-8a6b-5c4d3e2f1a0b";
// Le jeudi 12 novembre 2026, 21 h en temps universel : 22 h à Paris.
const NOW_MS = Date.UTC(2026, 10, 12, 21, 0);
const NOW = NOW_MS / 1000;
const FIN_ISO = "2026-11-15T19:30:00+00:00";
const FIN_S = Date.parse(FIN_ISO) / 1000;

type Json = Record<string, unknown>;
type Rpc = Record<string, (args: Json) => Json | null>;
type Fake = (method: string, path: string, call?: DiscordCall) => DiscordReply | null;

function monde(answers: Rpc = {}, fake: Fake = () => null, over: Partial<ConcoursDeps> = {}) {
  const calls = {
    rpc: [] as { name: string; args: Json }[],
    discord: [] as { method: string; path: string; body: unknown; timeoutMs?: number }[],
    webhook: [] as { method: string; path: string; body: unknown }[],
    logs: [] as string[],
  };
  const taches: Promise<unknown>[] = [];
  const deps: ConcoursDeps = {
    guildId: GUILD,
    nowSeconds: () => NOW,
    botId: BOT,
    botAccepted: async () => true,
    projectUrl: PROJECT,
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      return answers[name]?.(args) ?? null;
    },
    discord: async (method, path, call) => {
      calls.discord.push({ method, path, body: call?.body, timeoutMs: call?.timeoutMs });
      return fake(method, path, call);
    },
    webhook: async (method, path, call) => {
      calls.webhook.push({ method, path, body: call?.body });
      return { status: 200, body: {} };
    },
    background: (task) => {
      taches.push(task);
    },
    log: (message) => calls.logs.push(message),
    ...over,
  };
  // Les tâches de fond, y compris celles qu'elles lancent à leur tour.
  const fini = async (): Promise<void> => {
    while (taches.length > 0) await taches.shift();
  };
  return { deps, calls, fini };
}

const vueBrute = (over: Json = {}): Json => ({
  id: 7,
  guild_id: GUILD,
  salon_id: SALON,
  message_id: MSG,
  createur_id: STAFF,
  titre: "Gagne une Clef OpenFront.io Steam",
  lot: "Clef OpenFront.io Steam x1",
  texte: "Merci pour les 1000 membres",
  gagnants: 1,
  role_id: ROLE,
  notifier_id: PING,
  image_url: null,
  image_alt: null,
  fin: FIN_ISO,
  statut: "ouvert",
  tire_at: null,
  annule_par: null,
  annule_at: null,
  a_tirer: 0,
  tirage: 0,
  epuise: false,
  nb_passes: 0,
  nb_remplaces: 0,
  compte: 3,
  compte_tirage: null,
  compte_affiche: 0,
  rendu: 4,
  final_affiche: false,
  message_perdu: false,
  salon_perdu: false,
  essais: 0,
  jeton: JETON,
  ordre: null,
  tires: [],
  ...over,
});
const vue = (over: Json = {}): Vue => {
  const v = parseVue(vueBrute(over));
  if (!v) throw new Error("vue invalide");
  return v;
};
const tire = (id: string, rang: number, over: Partial<Tire> = {}): Tire => ({ discord_id: id, rang, tirage: 1, issue: "gagnant", confirme_at: null, annonce_id: null, ...over });

/** Tout le texte d'un message en composants, bout à bout. */
function textes(message: unknown): string {
  const out: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      const item = value as Json;
      if (item["type"] === 10 && typeof item["content"] === "string") out.push(item["content"]);
      walk(item["components"]);
      walk(item["accessory"]);
    }
  };
  walk((message as Json)["components"]);
  return out.join("\n");
}
/** Les boutons d'un message, à plat. */
function boutons(message: unknown): Json[] {
  const out: Json[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      const item = value as Json;
      if (item["type"] === 2) out.push(item);
      walk(item["components"]);
    }
  };
  walk((message as Json)["components"]);
  return out;
}
/** Le nombre de composants, comme Discord les compte (40 au plus). */
function compteComposants(message: unknown): number {
  let n = 0;
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      const item = value as Json;
      if (typeof item["type"] === "number") n++;
      walk(item["components"]);
      walk(item["accessory"]);
    }
  };
  walk((message as Json)["components"]);
  return n;
}
const corps = async (res: Response): Promise<{ type: number; data: Json }> => (await res.json()) as { type: number; data: Json };

const membre = (roles: string[] = [ROLE], id = J(1)) => ({ user: { id, username: "brennos" }, roles });
const interaction = (over: Json = {}): Json => ({
  id: "111122223333444455",
  application_id: APP,
  token: TOKEN,
  guild_id: GUILD,
  channel_id: SALON,
  channel: { id: SALON, type: 0 },
  app_permissions: String((1n << 10n) | (1n << 11n) | (1n << 14n) | (1n << 16n)),
  member: membre(),
  ...over,
});
const commande = (sub: string, options: Json[], over: Json = {}) =>
  interaction({ type: 2, data: { name: "concours", type: 1, options: [{ type: 1, name: sub, options }] }, member: { ...membre([ROLE], STAFF) }, ...over });
const opt = (name: string, value: unknown, type = 3, focused = false): Json => ({ name, type, value, ...(focused ? { focused: true } : {}) });
const clic = (customId: string, over: Json = {}) => interaction({ type: 3, data: { custom_id: customId, component_type: 2 }, message: { id: MSG, flags: 32768 }, ...over });

describe("les noms de /concours", () => {
  it("sont ceux que le script donne à Discord, dans les limites de Discord", () => {
    expect(CONCOURS_COMMAND.name).toBe(CONCOURS_COMMAND_NAME);
    expect(CONCOURS_COMMAND.default_member_permissions).toBe("32");
    expect(CONCOURS_COMMAND.description.length).toBeLessThanOrEqual(100);
    const subs = CONCOURS_COMMAND.options.map((o) => o.name);
    expect(subs).toEqual([CONCOURS_SUB.lancer, CONCOURS_SUB.terminer, CONCOURS_SUB.annuler, CONCOURS_SUB.remplacer]);
    const lancer = CONCOURS_COMMAND.options[0].options.map((o) => o.name);
    expect(lancer).toEqual([CONCOURS_OPT.lot, CONCOURS_OPT.fin, CONCOURS_OPT.gagnants, CONCOURS_OPT.participants, CONCOURS_OPT.notifier, CONCOURS_OPT.image]);
    for (const sub of CONCOURS_COMMAND.options.slice(1)) expect(sub.options[0]).toMatchObject({ name: CONCOURS_OPT.concours, type: 3, required: true, autocomplete: true });
    expect(CONCOURS_COMMAND.options[3].options[1]).toMatchObject({ name: CONCOURS_OPT.gagnant, type: 6 });
    for (const sub of CONCOURS_COMMAND.options) {
      expect(sub.type).toBe(1);
      expect(sub.name).toMatch(/^[a-z0-9_-]{1,32}$/);
      expect(sub.description.length).toBeLessThanOrEqual(100);
      for (const option of sub.options) {
        expect(option.name).toMatch(/^[a-z0-9_-]{1,32}$/);
        expect(option.description.length).toBeGreaterThan(0);
        expect(option.description.length).toBeLessThanOrEqual(100);
      }
    }
  });

  it("le site et son logo sont les mêmes que ceux du reste de la fonction", () => {
    expect(CONCOURS_SITE_URL).toBe(SITE_URL);
    expect(LOGO_URL).toBe(`${SITE_URL}/generated/icon-512.png`);
    expect(CONCOURS_PREFIX).toBe("concours:");
  });
});

describe("la fin d'un concours", () => {
  it("lit les durées écrites en mots ou en abrégé", () => {
    expect(parseDuree("3 jours")).toBe(3 * 1440);
    expect(parseDuree("3j")).toBe(3 * 1440);
    expect(parseDuree("12 h")).toBe(720);
    expect(parseDuree("1 j 6 h")).toBe(1440 + 360);
    expect(parseDuree("1j6h")).toBe(1440 + 360);
    expect(parseDuree("2h30")).toBe(150);
    expect(parseDuree("2 h 30")).toBe(150);
    expect(parseDuree("90 min")).toBe(90);
    expect(parseDuree("1 semaine")).toBe(7 * 1440);
    expect(parseDuree("dans 2 jours et 3 heures")).toBe(2 * 1440 + 180);
    for (const faux of ["", "demain", "3", "3 ans", "1 j 2 j", "1,5 jour", "jours 3", "0 h"]) expect(parseDuree(faux)).toBeNull();
  });

  it("lit une date à l'heure de Paris, en hiver comme en été", () => {
    expect(parseFin("14/11 20:30", NOW_MS)).toEqual({ ok: true, at: Date.UTC(2026, 10, 14, 19, 30) });
    expect(parseFin("le 14/11/2026 à 20 h", NOW_MS)).toEqual({ ok: true, at: Date.UTC(2026, 10, 14, 19, 0) });
    expect(parseFin("14/11 20h30", NOW_MS)).toEqual({ ok: true, at: Date.UTC(2026, 10, 14, 19, 30) });
    expect(parisToUtc(2026, 7, 14, 20, 30)).toBe(Date.UTC(2026, 6, 14, 18, 30));
    // Le 28 mars 2027, l'heure passe de 2 h à 3 h : 2 h 30 n'existe pas.
    expect(parisToUtc(2027, 3, 28, 2, 30)).toBeNull();
    expect(parseFin("31/02 20:00", NOW_MS)).toEqual({ ok: false, error: "format" });
  });

  it("prend l'an prochain pour une date sans année déjà passée", () => {
    const decembre = Date.UTC(2026, 11, 20, 12, 0);
    expect(parseFin("05/01 20:00", decembre)).toEqual({ ok: true, at: Date.UTC(2027, 0, 5, 19, 0) });
  });

  it("refuse une fin trop proche, trop loin ou illisible", () => {
    expect(parseFin("12/11 20:00", NOW_MS)).toEqual({ ok: false, error: "trop_proche" });
    expect(parseFin("32 jours", NOW_MS)).toEqual({ ok: false, error: "trop_loin" });
    expect(parseFin("demain soir", NOW_MS)).toEqual({ ok: false, error: "format" });
    expect(parseFin("1 min", NOW_MS)).toEqual({ ok: true, at: NOW_MS + 60_000 });
  });

  it("dit la date en français, à l'heure de Paris", () => {
    expect(formatParis(Date.UTC(2026, 10, 14, 19, 30))).toBe("samedi 14 novembre à 20 h 30");
    expect(formatParis(Date.UTC(2026, 10, 14, 19, 0))).toBe("samedi 14 novembre à 20 h");
    expect(listeFr(["a", "b", "c"])).toBe("a, b et c");
  });

  it("propose pendant la saisie ce qu'il comprend, puis des durées toutes prêtes", () => {
    const choix = finChoices("2j", NOW_MS);
    expect(choix[0]).toEqual({ name: "2j : fin le samedi 14 novembre à 22 h", value: "2j" });
    expect(choix.slice(1).map((c) => c.value)).toEqual([...FIN_PROPOSEES]);
    expect(finChoices("n'importe quoi", NOW_MS).map((c) => c.value)).toEqual([...FIN_PROPOSEES]);
    expect(finChoices("3 jours", NOW_MS).filter((c) => c.value === "3 jours")).toHaveLength(1);
    for (const c of finChoices("1 j 6 h", NOW_MS)) {
      expect(c.name.length).toBeLessThanOrEqual(100);
      expect(c.value.length).toBeLessThanOrEqual(40);
    }
  });
});

describe("les droits du robot dans le salon", () => {
  const bits = (...n: number[]): string => String(n.reduce((a, b) => a | (1n << BigInt(b)), 0n));
  it("nomme ce qui manque, en français, comme dans Discord", () => {
    expect(droitsManquants(bits(10, 11, 14, 16), false, false)).toEqual([]);
    expect(droitsManquants("0", false, false)).toEqual(["Voir le salon", "Envoyer des messages", "Intégrer des liens", "Voir les anciens messages"]);
    expect(droitsManquants(bits(10, 11, 14, 16), true, false)).toEqual(["Envoyer des messages dans les fils"]);
    expect(droitsManquants(bits(10, 11, 14, 16), false, true)).toEqual(["Mentionner @everyone, @here et tous les rôles"]);
    expect(droitsManquants(bits(3), false, true)).toEqual([]);
    expect(droitsManquants(undefined, false, false)).toBeNull();
  });
});

describe("le message du concours", () => {
  it("ouvert : le titre, le lot, qui peut participer, le nombre de gagnants, la fin en direct, et deux boutons", () => {
    const m = concoursMessage(vue(), true);
    expect(m["flags"]).toBe(32768);
    const t = textes(m);
    expect(t).toContain(`<@&${PING}>`);
    expect(t).toContain("-# Concours du clan");
    expect(t).toContain("## Gagne une Clef OpenFront.io Steam");
    expect(t).toContain("Merci pour les 1000 membres");
    expect(t).toContain("**À gagner :** Clef OpenFront.io Steam x1");
    expect(t).toContain(`**Pour participer :** avoir le rôle <@&${ROLE}>`);
    expect(t).toContain("**Gagnant :** 1, tiré au sort à la fin");
    expect(t).toContain(`**Fin :** <t:${FIN_S}:F>, <t:${FIN_S}:R>`);
    expect(t).toContain(`-# Lancé par <@${STAFF}>`);
    // Au lancement, seul le rôle à prévenir est prévenu.
    expect(m["allowed_mentions"]).toEqual({ parse: [], roles: [PING] });
    expect(boutons(m)).toEqual([
      { type: 2, style: 1, custom_id: "concours:participer:7", label: "Participer", emoji: { name: "🎉" } },
      { type: 2, style: 2, custom_id: "concours:liste:7", label: "3 participants" },
    ]);
    const carte = (m["components"] as Json[])[1] as Json;
    expect(carte).toMatchObject({ type: 17, accent_color: COULEURS.ouvert });
    expect(JSON.stringify(carte)).toContain(LOGO_URL);
    expect(compteComposants(m)).toBeLessThanOrEqual(40);
  });

  it("ensuite, la mention du rôle reste écrite sans prévenir personne", () => {
    expect(concoursMessage(vue())["allowed_mentions"]).toEqual({ parse: [] });
  });

  it("prévient tout le serveur seulement quand c'est le rôle choisi, et s'ouvre à tous sans rôle demandé", () => {
    const m = concoursMessage(vue({ notifier_id: GUILD, role_id: null, gagnants: 3 }), true);
    expect(textes(m)).toContain("@everyone");
    expect(textes(m)).toContain("**Pour participer :** être sur le serveur");
    expect(textes(m)).toContain("**Gagnants :** 3, tirés au sort à la fin");
    expect(m["allowed_mentions"]).toEqual({ parse: ["everyone"] });
    expect(textes(concoursMessage(vue({ notifier_id: null })))).not.toContain(`<@&${PING}>`);
  });

  it("montre l'image choisie en grand, avec sa description", () => {
    const m = concoursMessage(vue({ image_url: `${PROJECT}/storage/v1/object/public/discord-images/a.png`, image_alt: "Bannière OpenFront" }));
    expect(JSON.stringify(m)).toContain('"type":12');
    expect(JSON.stringify(m)).toContain("Bannière OpenFront");
    expect(JSON.stringify(concoursMessage(vue()))).not.toContain('"type":12');
  });

  it("terminé : les gagnants, qui a confirmé, le nombre de participants, ceux qui ont été passés", () => {
    const m = concoursMessage(
      vue({
        statut: "termine",
        tire_at: "2026-11-15T19:31:00+00:00",
        compte_tirage: 7,
        compte: 7,
        gagnants: 2,
        nb_passes: 1,
        nb_remplaces: 1,
        tires: [
          tire(J(1), 1, { issue: "parti" }),
          tire(J(2), 2, { confirme_at: "2026-11-15T20:00:00+00:00" }),
          tire(J(3), 3, { issue: "remplace" }),
          tire(J(4), 4, { tirage: 2 }),
        ],
      }),
    );
    const t = textes(m);
    expect(t).toContain("-# Concours terminé");
    expect(t).toContain(`**Gagnants :** <@${J(2)}> (a confirmé) et <@${J(4)}>`);
    expect(t).toContain(`**Tirage :** <t:${Date.parse("2026-11-15T19:31:00+00:00") / 1000}:F>, au hasard parmi 7 participants`);
    expect(t).toContain("1 participant tiré au sort avait quitté le serveur ou perdu le rôle : passé.");
    expect(t).toContain("1 gagnant remplacé par un nouveau tirage.");
    expect(m["allowed_mentions"]).toEqual({ parse: [] });
    expect(boutons(m)[0]).toMatchObject({ label: "Terminé", disabled: true });
    expect(boutons(m)[1]).toMatchObject({ label: "7 participants" });
    expect((m["components"] as Json[])[1]).toMatchObject({ accent_color: COULEURS.termine });
  });

  it("terminé sans participant, ou sans personne qui remplit encore les conditions", () => {
    expect(textes(concoursMessage(vue({ statut: "termine", tire_at: FIN_ISO, compte_tirage: 0, compte: 0 })))).toContain("personne n'a participé");
    const t = textes(concoursMessage(vue({ statut: "termine", tire_at: FIN_ISO, compte_tirage: 2, epuise: true, nb_passes: 2, tires: [tire(J(1), 1, { issue: "sans_role" }), tire(J(2), 2, { issue: "parti" })] })));
    expect(t).toContain("**Gagnant :** aucun, plus personne à tirer au sort");
    expect(t).toContain("2 participants tirés au sort avaient quitté le serveur ou perdu le rôle : passés.");
  });

  it("30 jours après, les lignes des passés effacées, le message garde leurs nombres", () => {
    const t = textes(concoursMessage(vue({ statut: "termine", tire_at: FIN_ISO, compte_tirage: 9, compte: 0, nb_passes: 3, nb_remplaces: 2, tires: [tire(J(5), 5, { tirage: 3 })] })));
    expect(t).toContain("3 participants tirés au sort avaient quitté le serveur ou perdu le rôle : passés.");
    expect(t).toContain("2 gagnants remplacés par un nouveau tirage.");
    expect(t).toContain("au hasard parmi 9 participants");
  });

  it("annulé : le nombre de participants au moment de l'annulation, jamais un zéro qui n'a pas eu lieu", () => {
    // Les participants sont effacés à l'annulation : leur nombre est gardé à part.
    expect(boutons(concoursMessage(vue({ statut: "annule", compte: 0, compte_tirage: 3, annule_at: FIN_ISO })))[1]).toMatchObject({ label: "3 participants", disabled: true });
    expect(boutons(concoursMessage(vue({ statut: "annule", compte: 0, compte_tirage: null, annule_at: FIN_ISO })))[1]).toMatchObject({ label: "Participants", disabled: true });
  });

  it("annulé : qui l'a annulé et quand, boutons éteints", () => {
    const m = concoursMessage(vue({ statut: "annule", annule_par: STAFF, annule_at: "2026-11-13T10:00:00+00:00" }));
    expect(textes(m)).toContain("-# Concours annulé");
    expect(textes(m)).toContain(`**Annulé :** <t:${Date.parse("2026-11-13T10:00:00+00:00") / 1000}:F>, par <@${STAFF}>`);
    expect(boutons(m).every((b) => b["disabled"] === true)).toBe(true);
    expect((m["components"] as Json[])[1]).toMatchObject({ accent_color: COULEURS.annule });
  });

  it("tient dans les limites de Discord avec un texte de 1 500 signes et 20 gagnants", () => {
    const m = concoursMessage(
      vue({
        texte: "x".repeat(1500),
        titre: "t".repeat(100),
        lot: "l".repeat(100),
        statut: "termine",
        tire_at: FIN_ISO,
        compte_tirage: 500,
        gagnants: 20,
        image_url: "https://exemple.fr/a.png",
        tires: Array.from({ length: 20 }, (_, i) => tire(J(i + 1), i + 1, { confirme_at: FIN_ISO })),
      }),
    );
    expect(textes(m).length).toBeLessThanOrEqual(4000);
    expect(compteComposants(m)).toBeLessThanOrEqual(40);
  });

  it("refuse un concours mal formé venu du serveur", () => {
    expect(parseVue(null)).toBeNull();
    expect(parseVue(vueBrute({ guild_id: "x" }))).toBeNull();
    expect(parseVue(vueBrute({ statut: "autre" }))).toBeNull();
    expect(parseVue(vueBrute({ tires: [{ discord_id: J(1), rang: 1, tirage: 1, issue: "vainqueur" }] }))).toBeNull();
    expect(parseVue(vueBrute({ image_url: "http://exemple.fr/a.png" }))?.image_url).toBeNull();
  });
});

describe("l'annonce des gagnants", () => {
  it("félicite les gagnants, prévient eux seuls, et attend leur confirmation", () => {
    const c = vue({ statut: "termine" });
    const m = annonceMessage(c, [tire(J(2), 2), tire(J(5), 5)], true);
    const t = textes(m);
    expect(t).toContain("-# Concours terminé");
    expect(t).toContain(`## Félicitations <@${J(2)}> et <@${J(5)}> !`);
    expect(t).toContain("Vous gagnez chacun **Clef OpenFront.io Steam x1** au concours « Gagne une Clef OpenFront.io Steam ».");
    expect(t).toContain(`<@${J(2)}> : à confirmer`);
    expect(t).toContain("Je confirme");
    expect(m["allowed_mentions"]).toEqual({ parse: [], users: [J(2), J(5)], replied_user: false });
    expect(boutons(m)).toEqual([{ type: 2, style: 3, custom_id: "concours:confirmer:7", label: "Je confirme", emoji: { name: "✅" } }]);
  });

  it("une fois confirmé, le dit, sans prévenir personne ; un nouveau tirage le dit aussi", () => {
    const m = annonceMessage(vue({ statut: "termine" }), [tire(J(4), 4, { tirage: 2, confirme_at: "2026-11-16T10:00:00+00:00" })], false);
    const t = textes(m);
    expect(t).toContain("-# Nouveau tirage");
    expect(t).toContain(`<@${J(4)}> a confirmé <t:${Date.parse("2026-11-16T10:00:00+00:00") / 1000}:R>`);
    expect(t).not.toContain("Cliquez sur");
    expect(m["allowed_mentions"]).toEqual({ parse: [] });
    expect(boutons(m)[0]).toMatchObject({ disabled: true });
  });
});

describe("/concours lancer", () => {
  const base = [opt("lot", "Clef OpenFront.io Steam x1"), opt("fin", "3 jours")];
  const brouillon = () => ({ concours_brouillon: () => ({ ok: true, id: 12 }) });

  it("sans le jeton du robot, ne fait rien et le dit", async () => {
    const { deps, calls } = monde(brouillon(), () => null, { botId: "" });
    const r = await corps(await concoursCommand(commande("lancer", base), deps));
    expect(r.data["content"]).toBe(CONCOURS_MESSAGES.pasInstalle);
    expect(calls.rpc).toEqual([]);
  });

  it("avec le jeton d'un autre robot, ne poste rien : ses boutons iraient à une autre application", async () => {
    const { deps, calls } = monde(brouillon(), () => null, { botId: "300000000000000099" });
    const r = await corps(await concoursCommand(commande("lancer", base), deps));
    expect(r.data["content"]).toBe(CONCOURS_MESSAGES.autreJeton);
    expect(calls.rpc).toEqual([]);
  });

  it("hors du serveur du clan, ou sans membre, refuse", async () => {
    const { deps, calls } = monde(brouillon());
    for (const i of [commande("lancer", base, { guild_id: "111111111111111111" }), commande("lancer", base, { member: undefined })]) {
      expect((await corps(await concoursCommand(i, deps))).data["content"]).toBe(CONCOURS_MESSAGES.wrongPlace);
    }
    expect(calls.rpc).toEqual([]);
  });

  it("refuse une fin illisible, trop proche ou trop loin, avant de rien écrire", async () => {
    const { deps, calls } = monde(brouillon());
    for (const [fin, message] of [
      ["mardi", CONCOURS_MESSAGES.finFormat],
      ["12/11 20:00", CONCOURS_MESSAGES.finTropProche],
      ["40 jours", CONCOURS_MESSAGES.finTropLoin],
    ] as const) {
      const r = await corps(await concoursCommand(commande("lancer", [opt("lot", "Clef"), opt("fin", fin)]), deps));
      expect(r.data["content"]).toBe(message);
      expect(r.data["flags"]).toBe(64);
    }
    expect(calls.rpc).toEqual([]);
  });

  it("dit quels droits manquent au robot dans ce salon, avant de rien écrire", async () => {
    const { deps, calls } = monde(brouillon());
    const r = await corps(await concoursCommand(commande("lancer", base, { app_permissions: String(1n << 10n) }), deps));
    expect(r.data["content"]).toContain("« Envoyer des messages », « Intégrer des liens » et « Voir les anciens messages »");
    expect(calls.rpc).toEqual([]);
  });

  it("demande le droit de tout mentionner pour prévenir un rôle que personne ne peut mentionner", async () => {
    const { deps } = monde(brouillon());
    const options = [...base, opt("notifier", PING, 8)];
    const fermé = await corps(await concoursCommand(commande("lancer", options, { data: { name: "concours", type: 1, options: [{ type: 1, name: "lancer", options }], resolved: { roles: { [PING]: { id: PING, name: "Notifs giveaway", mentionable: false } } } } }), deps));
    expect(fermé.data["content"]).toContain("« Mentionner @everyone, @here et tous les rôles »");
    expect(fermé.data["content"]).toContain("Ou rendez le rôle à prévenir mentionnable par tous.");
    const ouvert = await corps(await concoursCommand(commande("lancer", options, { data: { name: "concours", type: 1, options: [{ type: 1, name: "lancer", options }], resolved: { roles: { [PING]: { id: PING, name: "Notifs giveaway", mentionable: true } } } } }), deps));
    expect(ouvert.type).toBe(9);
  });

  it("garde un brouillon, puis ouvre le formulaire du titre et du texte", async () => {
    const { deps, calls } = monde(brouillon());
    const res = await concoursCommand(commande("lancer", [...base, opt("gagnants", 2, 4), opt("participants", ROLE, 8)]), deps);
    expect(calls.rpc).toEqual([
      {
        name: "concours_brouillon",
        args: {
          p_guild: GUILD,
          p_salon: SALON,
          p_createur: STAFF,
          p_lot: "Clef OpenFront.io Steam x1",
          p_fin: new Date(NOW_MS + 3 * 86_400_000).toISOString(),
          p_gagnants: 2,
          p_role: ROLE,
          p_notifier: null,
          p_image_url: null,
          p_image_alt: null,
          p_reveil: `${PROJECT}${REVEIL_PATH}`,
        },
      },
    ]);
    const r = await corps(res);
    expect(r.type).toBe(9);
    expect(r.data["custom_id"]).toBe("concours:texte:12");
    expect(r.data["title"]).toBe("Lancer un concours");
    const champs = r.data["components"] as Json[];
    expect(champs.map((c) => c["type"])).toEqual([18, 18]);
    expect(champs[0]?.["component"]).toMatchObject({ type: 4, custom_id: CHAMP_TITRE, style: 1, max_length: 100, required: true, value: "Clef OpenFront.io Steam x1" });
    expect(champs[1]?.["component"]).toMatchObject({ type: 4, custom_id: CHAMP_TEXTE, style: 2, max_length: 1500, required: false });
  });

  it("le rôle @everyone pour participer, c'est tout le serveur", async () => {
    const { deps, calls } = monde(brouillon());
    await concoursCommand(commande("lancer", [...base, opt("participants", GUILD, 8)]), deps);
    expect(calls.rpc[0]?.args["p_role"]).toBeNull();
  });

  it("prend une image de l'inventaire, par son fichier ou par son nom", async () => {
    const PATH = "11111111-2222-3333-4444-555555555555.png";
    const images = { concours_images: () => ({ ok: true, images: [{ name: "Bannière OpenFront", path: PATH }] }) };
    const { deps, calls } = monde({ ...brouillon(), ...images });
    await concoursCommand(commande("lancer", [...base, opt("image", PATH)]), deps);
    expect(calls.rpc[0]).toEqual({ name: "concours_images", args: { p_filtre: null, p_path: PATH } });
    expect(calls.rpc[1]?.args).toMatchObject({ p_image_url: `${PROJECT}/storage/v1/object/public/discord-images/${PATH}`, p_image_alt: "Bannière OpenFront" });
    await concoursCommand(commande("lancer", [...base, opt("image", "bannière openfront")]), deps);
    expect(calls.rpc[2]).toEqual({ name: "concours_images", args: { p_filtre: "bannière openfront", p_path: null } });
    expect(calls.rpc[3]?.args).toMatchObject({ p_image_alt: "Bannière OpenFront" });
    const inconnue = monde({ ...brouillon(), concours_images: () => ({ ok: true, images: [] }) });
    const r = await corps(await concoursCommand(commande("lancer", [...base, opt("image", "autre")]), inconnue.deps));
    expect(r.data["content"]).toBe(CONCOURS_MESSAGES.imageInconnue);
    expect(inconnue.calls.rpc.map((c) => c.name)).toEqual(["concours_images"]);
  });

  it("redit les refus du serveur", async () => {
    for (const [error, message] of [
      ["trop_de_concours", CONCOURS_MESSAGES.tropDeConcours],
      ["trop_de_brouillons", CONCOURS_MESSAGES.tropDeBrouillons],
      ["fin_trop_proche", CONCOURS_MESSAGES.finTropProche],
    ] as const) {
      const { deps } = monde({ concours_brouillon: () => ({ ok: false, error }) });
      expect((await corps(await concoursCommand(commande("lancer", base), deps))).data["content"]).toBe(message);
    }
    const down = monde();
    expect((await corps(await concoursCommand(commande("lancer", base), down.deps))).data["content"]).toBe(CONCOURS_MESSAGES.down);
  });
});

describe("/concours pendant la saisie", () => {
  const saisie = (sub: string, options: Json[]) => ({ ...commande(sub, options), type: 4 });

  it("lit la fin, propose les images et les concours qui conviennent", async () => {
    const { deps } = monde({
      concours_images: (args) => ({ ok: true, images: args["p_filtre"] === "ban" ? [{ name: "Bannière", path: "11111111-2222-3333-4444-555555555555.png" }] : [] }),
      concours_liste: () => ({
        ok: true,
        concours: [
          { id: 3, titre: "Ouvert", statut: "ouvert", fin: "2026-11-14T19:30:00+00:00", tire_at: null },
          { id: 2, titre: "Tiré", statut: "termine", fin: "2026-11-10T19:30:00+00:00", tire_at: "2026-11-10T19:31:00+00:00" },
          { id: 1, titre: "Annulé", statut: "annule", fin: "2026-11-09T19:30:00+00:00", tire_at: null },
        ],
      }),
    });
    const fin = await corps(await concoursCommand(saisie("lancer", [opt("lot", "x"), opt("fin", "2j", 3, true)]), deps));
    expect(fin.type).toBe(8);
    expect((fin.data["choices"] as Json[])[0]).toEqual({ name: "2j : fin le samedi 14 novembre à 22 h", value: "2j" });
    const image = await corps(await concoursCommand(saisie("lancer", [opt("image", "ban", 3, true)]), deps));
    expect(image.data["choices"]).toEqual([{ name: "Bannière", value: "11111111-2222-3333-4444-555555555555.png" }]);
    const terminer = await corps(await concoursCommand(saisie("terminer", [opt("concours", "", 3, true)]), deps));
    expect(terminer.data["choices"]).toEqual([{ name: "Ouvert — fin le samedi 14 novembre à 20 h 30", value: "3" }]);
    const remplacer = await corps(await concoursCommand(saisie("remplacer", [opt("concours", "", 3, true)]), deps));
    expect(remplacer.data["choices"]).toEqual([{ name: "Tiré — tiré le mardi 10 novembre à 20 h 31", value: "2" }]);
  });

  it("un concours que le robot n'arrive plus à mener est marqué « en panne », avec la raison", async () => {
    const { deps } = monde({ concours_liste: () => ({ ok: true, concours: [{ id: 3, titre: "Ouvert", statut: "ouvert", fin: "2026-11-14T19:30:00+00:00", tire_at: null, erreur: "modification du message : Discord 403 (code 50013)" }] }) });
    const r = await corps(await concoursCommand(saisie("terminer", [opt("concours", "", 3, true)]), deps));
    const [choix] = r.data["choices"] as { name: string; value: string }[];
    expect(choix?.value).toBe("3");
    expect(choix?.name.startsWith("Ouvert — fin le samedi 14 novembre à 20 h 30 — en panne : modification du message")).toBe(true);
    expect(choix?.name.length).toBeLessThanOrEqual(100);
  });

  it("hors du serveur du clan, ne propose rien", async () => {
    const { deps, calls } = monde();
    const r = await corps(await concoursCommand({ ...saisie("terminer", [opt("concours", "", 3, true)]), guild_id: "111111111111111111" }, deps));
    expect(r).toEqual({ type: 8, data: { choices: [] } });
    expect(calls.rpc).toEqual([]);
  });
});

describe("le formulaire envoyé", () => {
  const formulaire = (over: Json = {}) =>
    interaction({
      type: 5,
      member: membre([ROLE], STAFF),
      data: {
        custom_id: "concours:texte:12",
        components: [
          { type: 18, id: 1, component: { type: 4, id: 2, custom_id: CHAMP_TITRE, value: "Gagne une Clef" } },
          { type: 18, id: 3, component: { type: 4, id: 4, custom_id: CHAMP_TEXTE, value: "Merci !" } },
        ],
      },
      ...over,
    });
  const ouvert = { concours_texte: () => ({ ok: true, concours: vueBrute({ id: 12, message_id: null, compte: 0 }) }), concours_lance: () => ({ ok: true }) };

  it("lit les champs, dans un Label comme dans l'ancienne rangée", () => {
    expect([...valeursFormulaire({ components: [{ type: 18, component: { custom_id: "a", value: "1" } }, { type: 1, components: [{ custom_id: "b", value: "2" }] }] })]).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });

  it("répond aussitôt « réfléchit… », puis poste le message du concours et dit où", async () => {
    const { deps, calls, fini } = monde(ouvert, (method) => (method === "POST" ? { status: 200, body: { id: MSG } } : null));
    const r = await corps(await concoursInteraction(formulaire(), deps));
    expect(r).toEqual({ type: 5, data: { flags: 64 } });
    await fini();
    expect(calls.rpc[0]).toEqual({ name: "concours_texte", args: { p_id: 12, p_createur: STAFF, p_titre: "Gagne une Clef", p_texte: "Merci !" } });
    expect(calls.discord[0]?.method).toBe("POST");
    expect(calls.discord[0]?.path).toBe(`/channels/${SALON}/messages`);
    expect(calls.discord[0]?.body).toEqual({ ...concoursMessage(vue({ id: 12, message_id: null, compte: 0 }), true), nonce: "l12", enforce_nonce: true });
    expect(calls.rpc[1]).toEqual({ name: "concours_lance", args: { p_id: 12, p_message_id: MSG } });
    expect(calls.webhook).toHaveLength(1);
    expect(calls.webhook[0]?.method).toBe("PATCH");
    expect(calls.webhook[0]?.path).toBe(`/webhooks/${APP}/${TOKEN}/messages/@original`);
    expect((calls.webhook[0]?.body as Json)["content"]).toBe(
      `Concours lancé : https://discord.com/channels/${GUILD}/${SALON}/${MSG}. Tirage au sort <t:${FIN_S}:F>, <t:${FIN_S}:R>.`,
    );
  });

  it("si la réponse de Discord se perd, l'envoi repart avec le même nonce : Discord rend le message déjà posté", async () => {
    let essai = 0;
    const { deps, calls, fini } = monde(ouvert, (method) => (method === "POST" ? (++essai === 1 ? null : { status: 200, body: { id: MSG } }) : null));
    await concoursInteraction(formulaire(), deps);
    await fini();
    const posts = calls.discord.filter((c) => c.method === "POST").map((c) => c.body as Json);
    expect(posts).toHaveLength(2);
    expect(posts[0]?.["nonce"]).toBe("l12");
    expect(posts[1]?.["nonce"]).toBe("l12");
    expect(calls.rpc[1]).toEqual({ name: "concours_lance", args: { p_id: 12, p_message_id: MSG } });
  });

  it("si Discord refuse le message, dit pourquoi, et le concours ne s'ouvre pas", async () => {
    const { deps, calls, fini } = monde(ouvert, () => ({ status: 403, body: { code: 50013 } }));
    await concoursInteraction(formulaire(), deps);
    await fini();
    expect(calls.rpc.map((c) => c.name)).toEqual(["concours_texte"]);
    expect((calls.webhook[0]?.body as Json)["content"]).toContain("n'a pas le droit d'écrire ici");
  });

  it("si le serveur ne l'ouvre pas, le message posté est retiré", async () => {
    const { deps, calls, fini } = monde({ ...ouvert, concours_lance: () => null }, (method) => (method === "POST" ? { status: 200, body: { id: MSG } } : { status: 204, body: null }));
    await concoursInteraction(formulaire(), deps);
    await fini();
    expect(calls.discord.map((c) => `${c.method} ${c.path}`)).toEqual([`POST /channels/${SALON}/messages`, `DELETE /channels/${SALON}/messages/${MSG}`]);
    expect((calls.webhook[0]?.body as Json)["content"]).toContain("son message est retiré");
  });

  it("une fin passée pendant l'écriture : rien n'est posté", async () => {
    const { deps, calls, fini } = monde({ concours_texte: () => ({ ok: false, error: "fin_passee" }) });
    await concoursInteraction(formulaire(), deps);
    await fini();
    expect(calls.discord).toEqual([]);
    expect((calls.webhook[0]?.body as Json)["content"]).toBe(CONCOURS_MESSAGES.finPassee);
  });
});

describe("les boutons", () => {
  const majVue = vueBrute({ compte: 4 });

  it("« Participer » : inscrit, avec « Me retirer », et le nombre mis à jour sur le message", async () => {
    const { deps, calls, fini } = monde(
      { concours_participer: () => ({ ok: true, etat: "inscrit", compte: 4, titre: "Gagne une Clef", fin: FIN_ISO, maj: true, concours: majVue }), concours_affiche: () => ({ ok: true }) },
      () => ({ status: 200, body: { id: MSG } }),
    );
    const r = await corps(await concoursInteraction(clic("concours:participer:7"), deps));
    expect(calls.rpc[0]).toEqual({ name: "concours_participer", args: { p_id: 7, p_discord_id: J(1), p_roles: [ROLE] } });
    expect(r.type).toBe(4);
    expect(r.data["flags"]).toBe(64 | 32768);
    expect(textes(r.data)).toBe(`🎉 Vous participez au concours « Gagne une Clef ». Tirage au sort <t:${FIN_S}:R>.`);
    expect(boutons(r.data)).toEqual([{ type: 2, style: 2, custom_id: "concours:quitter:7", label: "Me retirer" }]);
    await fini();
    expect(calls.discord[0]).toMatchObject({ method: "PATCH", path: `/channels/${SALON}/messages/${MSG}` });
    expect(boutons(calls.discord[0]?.body)[1]).toMatchObject({ label: "4 participants" });
    expect(calls.rpc[1]).toEqual({ name: "concours_affiche", args: { p_id: 7, p_compte: 4, p_perdu: false } });
  });

  it("un second clic : déjà inscrit ; sans mise à jour demandée, rien n'est modifié", async () => {
    const { deps, calls, fini } = monde({ concours_participer: () => ({ ok: true, etat: "deja", compte: 4, titre: "Gagne une Clef", fin: FIN_ISO, maj: false, concours: null }) });
    const r = await corps(await concoursInteraction(clic("concours:participer:7"), deps));
    expect(textes(r.data)).toContain("Vous participez déjà");
    await fini();
    expect(calls.discord).toEqual([]);
  });

  it("les refus : sans le rôle, fini, annulé, inconnu, base injoignable", async () => {
    for (const [answer, message] of [
      [{ ok: false, error: "sans_role", role_id: ROLE }, `Ce concours est réservé au rôle <@&${ROLE}>.`],
      [{ ok: false, error: "termine" }, CONCOURS_MESSAGES.termine],
      [{ ok: false, error: "annule" }, CONCOURS_MESSAGES.annule],
      [{ ok: false, error: "inconnu" }, CONCOURS_MESSAGES.inconnu],
      [null, CONCOURS_MESSAGES.down],
    ] as const) {
      const { deps } = monde({ concours_participer: () => answer });
      const r = await corps(await concoursInteraction(clic("concours:participer:7"), deps));
      expect(textes(r.data)).toBe(message);
      expect(r.data["allowed_mentions"]).toEqual({ parse: [] });
    }
  });

  it("depuis une réponse privée, la réponse la remplace", async () => {
    const { deps } = monde({ concours_participer: () => ({ ok: true, etat: "inscrit", compte: 1, titre: "T", fin: FIN_ISO, maj: false }) });
    const r = await corps(await concoursInteraction(clic("concours:participer:7", { message: { id: "600000000000000006", flags: 64 | 32768 } }), deps));
    expect(r.type).toBe(7);
  });

  it("« Me retirer » : la réponse privée le dit, avec « Participer »", async () => {
    const { deps, calls } = monde({ concours_quitter: () => ({ ok: true, etat: "retire", compte: 3, titre: "Gagne une Clef", fin: FIN_ISO, maj: false }) });
    const r = await corps(await concoursInteraction(clic("concours:quitter:7", { message: { id: "600000000000000006", flags: 64 } }), deps));
    expect(calls.rpc[0]).toEqual({ name: "concours_quitter", args: { p_id: 7, p_discord_id: J(1) } });
    expect(r.type).toBe(7);
    expect(textes(r.data)).toBe("Vous ne participez plus au concours « Gagne une Clef ».");
    expect(boutons(r.data)).toEqual([{ type: 2, style: 1, custom_id: "concours:participer:7", label: "Participer", emoji: { name: "🎉" } }]);
  });

  it("le nombre de participants : leur liste, à soi seul, et si l'on en est", async () => {
    const { deps } = monde({ concours_participants: () => ({ ok: true, statut: "ouvert", titre: "T", fin: FIN_ISO, ouvert: true, compte: 2, compte_tirage: null, inscrit: true, ids: [J(1), J(2)], gagnants: [] }) });
    const r = await corps(await concoursInteraction(clic("concours:liste:7"), deps));
    expect(r.type).toBe(4);
    expect(r.data["flags"]).toBe(64 | 32768);
    expect(textes(r.data)).toBe(`### 2 participants au concours « T »\n<@${J(1)}>, <@${J(2)}>\nVous participez.`);
    expect(boutons(r.data)[0]).toMatchObject({ custom_id: "concours:quitter:7" });
    expect(r.data["allowed_mentions"]).toEqual({ parse: [] });
  });

  it("la liste tient dans un message de Discord : 150 numéros à 20 chiffres, 20 gagnants, un titre de 100 signes", async () => {
    const long = (n: number): string => `9${String(n).padStart(19, "0")}`;
    const ids = Array.from({ length: 150 }, (_, i) => long(i + 1));
    const { deps } = monde({ concours_participants: () => ({ ok: true, statut: "termine", titre: "t".repeat(100), ouvert: false, compte: 150, compte_tirage: 150, inscrit: false, ids, gagnants: ids.slice(0, 20) }) });
    const r = await corps(await concoursInteraction(clic("concours:liste:7"), deps));
    const t = textes(r.data);
    expect(t.length).toBeLessThanOrEqual(4000);
    expect(t).toMatch(/ et [0-9]+ autres$/);
    const ouvert = monde({ concours_participants: () => ({ ok: true, statut: "ouvert", titre: "t".repeat(100), ouvert: true, compte: 900, compte_tirage: null, inscrit: true, ids, gagnants: [] }) });
    const o = textes((await corps(await concoursInteraction(clic("concours:liste:7"), ouvert.deps))).data);
    expect(o.length).toBeLessThanOrEqual(4000);
    expect(o.endsWith("Vous participez.")).toBe(true);
  });

  it("la liste d'un concours annulé dit qu'il est annulé, et combien participaient", async () => {
    const { deps } = monde({ concours_participants: () => ({ ok: true, statut: "annule", titre: "T", ouvert: false, compte: 0, compte_tirage: 2, inscrit: false, ids: [], gagnants: [] }) });
    const r = await corps(await concoursInteraction(clic("concours:liste:7"), deps));
    expect(textes(r.data)).toBe("### Concours « T » annulé, avec 2 participants");
    expect(boutons(r.data)).toEqual([]);
  });

  it("au-delà de la place, « et 1 autre » au singulier", async () => {
    const long = (n: number): string => `9${String(n).padStart(19, "0")}`;
    const ids = Array.from({ length: 150 }, (_, i) => long(i + 1));
    const liste = async (n: number): Promise<string> => {
      const { deps } = monde({ concours_participants: () => ({ ok: true, statut: "ouvert", titre: "t".repeat(100), ouvert: true, compte: n, compte_tirage: null, inscrit: false, ids: ids.slice(0, n), gagnants: [] }) });
      return textes((await corps(await concoursInteraction(clic("concours:liste:7"), deps))).data);
    };
    // Combien de noms tiennent, puis un de plus que la place : « et 1 autre ».
    const plein = /et ([0-9]+) autres\n/.exec(await liste(150));
    expect(plein).not.toBeNull();
    const tiennent = 150 - Number(plein?.[1]);
    expect(await liste(tiennent + 1)).toContain(" et 1 autre\n");
    expect(await liste(tiennent)).not.toContain(" autre");
  });

  it("après le tirage, la liste donne les gagnants ; après 30 jours, elle dit qu'elle est effacée", async () => {
    const tiré = monde({ concours_participants: () => ({ ok: true, statut: "termine", titre: "T", ouvert: false, compte: 3, compte_tirage: 3, inscrit: false, ids: [J(1), J(2), J(3)], gagnants: [J(2)] }) });
    const r = await corps(await concoursInteraction(clic("concours:liste:7"), tiré.deps));
    expect(textes(r.data)).toBe(`### Tirage au sort du concours « T », parmi 3 participants\n**Gagnant :** <@${J(2)}>\n<@${J(1)}>, <@${J(2)}>, <@${J(3)}>`);
    expect(boutons(r.data)).toEqual([]);
    const vieux = monde({ concours_participants: () => ({ ok: true, statut: "termine", titre: "T", ouvert: false, compte: 0, compte_tirage: 3, inscrit: false, ids: [], gagnants: [J(2)] }) });
    expect(textes((await corps(await concoursInteraction(clic("concours:liste:7"), vieux.deps))).data)).toContain("effacée 30 jours après le tirage");
  });

  it("« Je confirme » : l'annonce se met à jour pour tous", async () => {
    const annonce = "700000000000000007";
    const apres = vueBrute({ statut: "termine", tire_at: FIN_ISO, compte_tirage: 3, final_affiche: false, tires: [{ discord_id: J(1), rang: 1, tirage: 1, issue: "gagnant", confirme_at: "2026-11-15T20:00:00+00:00", annonce_id: annonce }] });
    const { deps, calls, fini } = monde({ concours_confirmer: () => ({ ok: true, etat: "confirme", concours: apres }) }, () => ({ status: 200, body: {} }));
    const r = await corps(await concoursInteraction(clic("concours:confirmer:7", { message: { id: annonce, flags: 32768 } }), deps));
    expect(calls.rpc[0]).toEqual({ name: "concours_confirmer", args: { p_id: 7, p_annonce_id: annonce, p_discord_id: J(1), p_roles: [ROLE] } });
    expect(r.type).toBe(7);
    expect(textes(r.data)).toContain(`<@${J(1)}> a confirmé`);
    expect(r.data["allowed_mentions"]).toEqual({ parse: [] });
    await fini();
    expect(calls.discord[0]).toMatchObject({ method: "PATCH", path: `/channels/${SALON}/messages/${MSG}` });
    expect(textes(calls.discord[0]?.body)).toContain("(a confirmé)");
  });

  it("« Je confirme » par un autre, un remplacé ou qui a perdu le rôle : une réponse à lui seul", async () => {
    for (const [answer, message] of [
      [{ ok: false, error: "pas_gagnant" }, CONCOURS_MESSAGES.pasGagnant],
      [{ ok: false, error: "remplace" }, CONCOURS_MESSAGES.remplace],
      [{ ok: false, error: "sans_role", role_id: ROLE }, CONCOURS_MESSAGES.confirmeSansRole(ROLE, GUILD)],
    ] as const) {
      const { deps } = monde({ concours_confirmer: () => answer });
      const r = await corps(await concoursInteraction(clic("concours:confirmer:7", { message: { id: "700000000000000007" } }), deps));
      expect(r.type).toBe(4);
      expect(textes(r.data)).toBe(message);
    }
  });

  it("refuse un bouton d'ailleurs, d'un robot, ou mal formé", async () => {
    const { deps, calls } = monde();
    expect(textes((await corps(await concoursInteraction(clic("concours:participer:7", { guild_id: "111111111111111111" }), deps))).data)).toBe(CONCOURS_MESSAGES.wrongPlace);
    expect(textes((await corps(await concoursInteraction(clic("concours:participer:7", { member: { user: { id: J(9), bot: true }, roles: [] } }), deps))).data)).toBe(CONCOURS_MESSAGES.inconnu);
    expect(textes((await corps(await concoursInteraction(clic("concours:voler:7"), deps))).data)).toBe(CONCOURS_MESSAGES.inconnu);
    expect(textes((await corps(await concoursInteraction(clic("concours:participer:abc"), deps))).data)).toBe(CONCOURS_MESSAGES.inconnu);
    expect(calls.rpc).toEqual([]);
  });
});

describe("/concours terminer, annuler, remplacer", () => {
  it("le serveur décide, et le robot fait aussitôt le travail", async () => {
    const { deps, calls, fini } = monde({ concours_action: () => ({ ok: true, nombre: 0, titre: "T" }), concours_travail: () => ({ ok: true, taches: [] }) });
    const r = await corps(await concoursCommand(commande("terminer", [opt("concours", "7")]), deps));
    expect(r.data["content"]).toBe(CONCOURS_MESSAGES.terminerOk);
    expect(calls.rpc[0]).toEqual({ name: "concours_action", args: { p_guild: GUILD, p_id: 7, p_action: "terminer", p_par: STAFF, p_gagnant: null } });
    await fini();
    expect(calls.rpc[1]).toEqual({ name: "concours_travail", args: { p_limite: 1, p_id: 7 } });
  });

  it("remplacer un gagnant nommé", async () => {
    const { deps, calls } = monde({ concours_action: () => ({ ok: true, nombre: 1 }) });
    const r = await corps(await concoursCommand(commande("remplacer", [opt("concours", "7"), opt("gagnant", J(4), 6)]), deps));
    expect(r.data["content"]).toBe(CONCOURS_MESSAGES.remplacerOk(1));
    expect(calls.rpc[0]?.args).toMatchObject({ p_action: "remplacer", p_gagnant: J(4) });
  });

  it("redit chaque refus du serveur en mots", async () => {
    for (const error of ["inconnu", "annule", "deja_termine", "pas_termine", "tirage_en_cours", "trop_ancien", "pas_gagnant", "tous_confirmes", "aucun_gagnant"]) {
      const { deps } = monde({ concours_action: () => ({ ok: false, error }) });
      const r = await corps(await concoursCommand(commande("annuler", [opt("concours", "7")]), deps));
      expect(r.data["content"]).toBe(CONCOURS_MESSAGES.actions[error]);
    }
    const { deps, calls } = monde();
    const r = await corps(await concoursCommand(commande("annuler", [opt("concours", "pas un numéro")]), deps));
    expect(r.data["content"]).toBe(CONCOURS_MESSAGES.actions["inconnu"]);
    expect(calls.rpc).toEqual([]);
  });
});

describe("le travail du robot", () => {
  // Le serveur donne un concours à la fois, chacun une seule fois.
  const travail = (...taches: Json[]) => {
    const file = [...taches];
    return { concours_travail: () => ({ ok: true, taches: file.length > 0 ? [file.shift()] : [] }), concours_fait: () => ({ ok: true }) };
  };
  const fait = (calls: { rpc: { name: string; args: Json }[] }) => calls.rpc.filter((c) => c.name === "concours_fait").map((c) => c.args);

  it("met à jour le nombre de participants sur le message", async () => {
    const { deps, calls } = monde(travail(vueBrute({ compte: 5, compte_affiche: 3 })), () => ({ status: 200, body: {} }));
    expect(await travailler(deps)).toBe(1);
    expect(calls.discord[0]).toMatchObject({ method: "PATCH", path: `/channels/${SALON}/messages/${MSG}` });
    expect(fait(calls)).toEqual([{ p_id: 7, p_jeton: JETON, p_rendu: 4, p_compte: 5, p_final: false, p_annonce_id: null, p_annonces: null, p_perdu: false, p_salon_perdu: false, p_erreur: null }]);
  });

  it("prend les concours un à un, sous leur jeton, cinq au plus par réveil", async () => {
    const { deps, calls } = monde(travail(...[1, 2, 3, 4, 5, 6].map((id) => vueBrute({ id, compte: 5 }))), () => ({ status: 200, body: {} }));
    expect(await travailler(deps)).toBe(5);
    expect(calls.rpc.filter((c) => c.name === "concours_travail").every((c) => c.args["p_limite"] === 1)).toBe(true);
    expect(fait(calls).map((a) => a["p_id"])).toEqual([1, 2, 3, 4, 5]);
    // Sans jeton, le serveur n'a rien confié au robot : il n'y touche pas.
    const sansJeton = monde(travail(vueBrute({ jeton: null })), () => ({ status: 200, body: {} }));
    expect(await travailler(sansJeton.deps)).toBe(0);
    expect(sansJeton.calls.discord).toEqual([]);
  });

  it("un message retiré, ou son salon supprimé : il ne sera plus modifié", async () => {
    const perdu = monde(travail(vueBrute()), () => ({ status: 404, body: { code: 10008 } }));
    await travailler(perdu.deps);
    expect(fait(perdu.calls)[0]).toMatchObject({ p_perdu: true, p_salon_perdu: false });
    const salon = monde(travail(vueBrute()), () => ({ status: 404, body: { code: 10003 } }));
    await travailler(salon.deps);
    expect(fait(salon.calls)[0]).toMatchObject({ p_perdu: true, p_salon_perdu: true });
    const refus = monde(travail(vueBrute()), () => ({ status: 403, body: { code: 50013 } }));
    await travailler(refus.deps);
    expect(fait(refus.calls)[0]).toMatchObject({ p_erreur: "modification du message : Discord 403 (code 50013)", p_compte: null });
  });

  it("le tirage : passe qui est parti ou sans le rôle, choisit le suivant, montre le résultat et félicite le gagnant", async () => {
    const tiree = vueBrute({ statut: "termine", tire_at: FIN_ISO, tirage: 1, a_tirer: 1, compte: 4, compte_tirage: 4, ordre: [J(3), J(1), J(2), J(4)] });
    const choisie = vueBrute({
      statut: "termine",
      tire_at: FIN_ISO,
      tirage: 1,
      a_tirer: 0,
      compte: 4,
      compte_tirage: 4,
      ordre: [J(3), J(1), J(2), J(4)],
      nb_passes: 2,
      rendu: 5,
      tires: [
        { discord_id: J(3), rang: 1, tirage: 1, issue: "parti", confirme_at: null, annonce_id: null },
        { discord_id: J(1), rang: 2, tirage: 1, issue: "sans_role", confirme_at: null, annonce_id: null },
        { discord_id: J(2), rang: 3, tirage: 1, issue: "gagnant", confirme_at: null, annonce_id: null },
      ],
    });
    const membres: Record<string, DiscordReply> = {
      [J(3)]: { status: 404, body: { code: 10007, message: "Unknown Member" } },
      [J(1)]: { status: 200, body: { roles: ["999999999999999999"] } },
      [J(2)]: { status: 200, body: { roles: [ROLE] } },
    };
    const { deps, calls } = monde({ ...travail(tiree), concours_choix: () => ({ ok: true, concours: choisie }) }, (method, path) => {
      const member = /\/members\/([0-9]+)$/.exec(path)?.[1];
      if (method === "GET" && member) return membres[member] ?? null;
      if (method === "PATCH") return { status: 200, body: {} };
      if (method === "POST") return { status: 200, body: { id: "700000000000000007" } };
      return null;
    });
    await travailler(deps);
    expect(calls.discord.filter((c) => c.method === "GET").map((c) => c.path)).toEqual([J(3), J(1), J(2)].map((id) => `/guilds/${GUILD}/members/${id}`));
    expect(calls.rpc.find((c) => c.name === "concours_choix")?.args).toEqual({
      p_id: 7,
      p_jeton: JETON,
      p_tirage: 1,
      p_elus: [J(2)],
      p_passes: [
        { id: J(3), raison: "parti" },
        { id: J(1), raison: "sans_role" },
      ],
      p_epuise: false,
    });
    const patch = calls.discord.find((c) => c.method === "PATCH");
    expect(textes(patch?.body)).toContain(`**Gagnant :** <@${J(2)}>`);
    const annonce = calls.discord.find((c) => c.method === "POST")?.body as Json;
    expect(annonce["message_reference"]).toEqual({ message_id: MSG, fail_if_not_exists: false });
    expect(annonce["allowed_mentions"]).toEqual({ parse: [], users: [J(2)], replied_user: false });
    // Une même annonce ne part qu'une fois : Discord rend celle qui est déjà postée sous ce nonce.
    expect(annonce["nonce"]).toBe("a7t1");
    expect(annonce["enforce_nonce"]).toBe(true);
    expect(textes(annonce)).toContain(`## Félicitations <@${J(2)}> !`);
    // Le compte rendu porte le rendu d'après le choix : un changement arrivé entre-temps fera refaire le message.
    expect(fait(calls)).toEqual([{ p_id: 7, p_jeton: JETON, p_rendu: 5, p_compte: null, p_final: true, p_annonce_id: "700000000000000007", p_annonces: [J(2)], p_perdu: false, p_salon_perdu: false, p_erreur: null }]);
  });

  it("si Discord ne dit pas qui est encore là, le choix attend ; une panne qui dure laisse suffire le rôle vérifié à l'inscription, un refus jamais", async () => {
    const ilYaDeuxHeures = new Date(NOW_MS - 2 * 3_600_000).toISOString();
    const tiree = (essais: number, tire_at = ilYaDeuxHeures) => vueBrute({ statut: "termine", tire_at, tirage: 1, a_tirer: 1, essais, ordre: [J(1)] });
    const panne = monde(travail(tiree(0)), () => ({ status: 500, body: null }));
    await travailler(panne.deps);
    expect(panne.calls.rpc.some((c) => c.name === "concours_choix")).toBe(false);
    expect(fait(panne.calls)[0]).toMatchObject({ p_erreur: "vérification d'un participant : Discord 500" });
    // Un 404 qui n'est pas « Unknown Member » (le robot hors du serveur) n'est pas une réponse.
    const horsServeur = monde(travail(tiree(0)), () => ({ status: 404, body: { code: 10004 } }));
    await travailler(horsServeur.deps);
    expect(horsServeur.calls.rpc.some((c) => c.name === "concours_choix")).toBe(false);
    const patient = monde({ ...travail(tiree(10)), concours_choix: () => null }, () => ({ status: 500, body: null }));
    await travailler(patient.deps);
    expect(patient.calls.rpc.find((c) => c.name === "concours_choix")?.args).toMatchObject({ p_elus: [J(1)], p_passes: [] });
    // Un nouveau tirage il y a dix minutes, le premier il y a deux heures : la patience part du dernier.
    const rejoue = monde(travail(vueBrute({ statut: "termine", tire_at: ilYaDeuxHeures, tirage_at: new Date(NOW_MS - 600_000).toISOString(), tirage: 2, a_tirer: 1, essais: 10, ordre: [J(1)] })), () => ({ status: 500, body: null }));
    await travailler(rejoue.deps);
    expect(rejoue.calls.rpc.some((c) => c.name === "concours_choix")).toBe(false);
    // Dix essais, mais le tirage date de moins d'une heure : on attend encore.
    const tropTot = monde(travail(tiree(10, new Date(NOW_MS - 600_000).toISOString())), () => ({ status: 500, body: null }));
    await travailler(tropTot.deps);
    expect(tropTot.calls.rpc.some((c) => c.name === "concours_choix")).toBe(false);
    // Un jeton refusé ou un droit manquant n'est pas une panne passagère : jamais de gagnant sans vérification.
    for (const status of [401, 403]) {
      const refus = monde(travail(tiree(10)), () => ({ status, body: {} }));
      await travailler(refus.deps);
      expect(refus.calls.rpc.some((c) => c.name === "concours_choix")).toBe(false);
      expect(fait(refus.calls)[0]).toMatchObject({ p_erreur: `vérification d'un participant : Discord ${status}` });
    }
  });

  it("ce qui a été vérifié avant une panne est gardé, dans l'ordre", async () => {
    const tiree = vueBrute({ statut: "termine", tire_at: FIN_ISO, tirage: 1, a_tirer: 1, ordre: [J(1), J(2), J(3)] });
    const apres = vueBrute({ statut: "termine", tire_at: FIN_ISO, tirage: 1, a_tirer: 1, nb_passes: 1, rendu: 5, ordre: [J(1), J(2), J(3)], tires: [{ discord_id: J(1), rang: 1, tirage: 1, issue: "parti", confirme_at: null, annonce_id: null }] });
    const { deps, calls } = monde({ ...travail(tiree), concours_choix: () => ({ ok: true, concours: apres }) }, (_m, path) =>
      path.endsWith(J(1)) ? { status: 404, body: { code: 10007 } } : { status: 502, body: null },
    );
    await travailler(deps);
    expect(calls.rpc.find((c) => c.name === "concours_choix")?.args).toMatchObject({ p_elus: [], p_passes: [{ id: J(1), raison: "parti" }], p_epuise: false });
    expect(fait(calls)[0]).toMatchObject({ p_rendu: 5, p_erreur: "vérification d'un participant : Discord 502" });
    expect(calls.discord.some((c) => c.method === "POST")).toBe(false);
  });

  it("personne à tirer : épuisé, et le message le dit", async () => {
    const tiree = vueBrute({ statut: "termine", tire_at: FIN_ISO, tirage: 1, a_tirer: 1, compte: 0, compte_tirage: 0, ordre: [] });
    const vide = vueBrute({ statut: "termine", tire_at: FIN_ISO, tirage: 1, a_tirer: 0, epuise: true, compte: 0, compte_tirage: 0, ordre: [] });
    const { deps, calls } = monde({ ...travail(tiree), concours_choix: () => ({ ok: true, concours: vide }) }, () => ({ status: 200, body: {} }));
    await travailler(deps);
    expect(calls.rpc.find((c) => c.name === "concours_choix")?.args).toMatchObject({ p_elus: [], p_passes: [], p_epuise: true });
    expect(textes(calls.discord.find((c) => c.method === "PATCH")?.body)).toContain("personne n'a participé");
    expect(calls.discord.some((c) => c.method === "POST")).toBe(false);
    expect(fait(calls)[0]).toMatchObject({ p_final: true, p_erreur: null });
  });

  it("sans « Voir les anciens messages », l'annonce part sans être une réponse", async () => {
    const pret = vueBrute({ statut: "termine", tire_at: FIN_ISO, tirage: 1, final_affiche: true, tires: [{ discord_id: J(2), rang: 1, tirage: 1, issue: "gagnant", confirme_at: null, annonce_id: null }] });
    let essai = 0;
    const { deps, calls } = monde(travail(pret), (method) => {
      if (method !== "POST") return null;
      essai++;
      return essai === 1 ? { status: 403, body: { code: 50013 } } : { status: 200, body: { id: "700000000000000008" } };
    });
    await travailler(deps);
    const posts = calls.discord.filter((c) => c.method === "POST").map((c) => c.body as Json);
    expect(posts).toHaveLength(2);
    expect(posts[0]?.["message_reference"]).toBeDefined();
    expect(posts[1]?.["message_reference"]).toBeUndefined();
    expect(fait(calls)[0]).toMatchObject({ p_annonce_id: "700000000000000008", p_annonces: [J(2)] });
  });

  it("une annonce refusée se réessaie au réveil suivant", async () => {
    const pret = vueBrute({ statut: "termine", tire_at: FIN_ISO, tirage: 1, final_affiche: true, tires: [{ discord_id: J(2), rang: 1, tirage: 1, issue: "gagnant", confirme_at: null, annonce_id: null }] });
    const { deps, calls } = monde(travail(pret), () => ({ status: 429, body: {} }));
    await travailler(deps);
    expect(fait(calls)[0]).toMatchObject({ p_final: true, p_annonce_id: null, p_erreur: "annonce des gagnants : Discord 429" });
  });

  it("un nouveau tirage annonce le seul nouveau gagnant, par une nouvelle réponse, et l'ancienne annonce dit le remplacement", async () => {
    const pret = vueBrute({
      statut: "termine",
      tire_at: FIN_ISO,
      tirage: 2,
      final_affiche: false,
      nb_remplaces: 1,
      tires: [
        { discord_id: J(1), rang: 1, tirage: 1, issue: "remplace", confirme_at: null, annonce_id: "700000000000000007" },
        { discord_id: J(2), rang: 2, tirage: 2, issue: "gagnant", confirme_at: null, annonce_id: null },
      ],
    });
    const { deps, calls } = monde(travail(pret), (method) => (method === "POST" ? { status: 200, body: { id: "700000000000000009" } } : { status: 200, body: {} }));
    await travailler(deps);
    const annonce = calls.discord.find((c) => c.method === "POST")?.body as Json;
    expect(textes(annonce)).toContain("-# Nouveau tirage");
    expect(annonce["allowed_mentions"]).toMatchObject({ users: [J(2)] });
    expect(annonce["nonce"]).toBe("a7t2");
    const ancienne = calls.discord.find((c) => c.method === "PATCH" && c.path === `/channels/${SALON}/messages/700000000000000007`);
    expect(textes(ancienne?.body)).toContain(`<@${J(1)}> : remplacé par un nouveau tirage`);
    expect(boutons(ancienne?.body)[0]).toMatchObject({ disabled: true });
    expect((ancienne?.body as Json)["allowed_mentions"]).toEqual({ parse: [] });
    expect(fait(calls)[0]).toMatchObject({ p_annonces: [J(2)] });
  });

  it("annulé : le message le montre", async () => {
    const { deps, calls } = monde(travail(vueBrute({ statut: "annule", annule_par: STAFF, annule_at: FIN_ISO })), () => ({ status: 200, body: {} }));
    await travailler(deps);
    expect(textes(calls.discord[0]?.body)).toContain("Concours annulé");
    expect(fait(calls)[0]).toMatchObject({ p_final: true, p_perdu: false });
  });

  it("la porte de la base : sans jeton, rien ; sinon, le travail", async () => {
    const sans = monde(travail(vueBrute()), () => null, { botId: "" });
    expect(await (await concoursTic(sans.deps)).json()).toEqual({ ok: false, error: "pas de jeton" });
    expect(sans.calls.rpc).toEqual([]);
    const autre = monde(travail(vueBrute()), () => null, { botAccepted: async () => false });
    expect(await (await concoursTic(autre.deps)).json()).toEqual({ ok: false, error: "jeton refusé" });
    expect(autre.calls.rpc).toEqual([]);
    const fond: Promise<unknown>[] = [];
    const avec = monde(travail(vueBrute({ compte: 5 })), () => ({ status: 200, body: {} }), { background: (task) => void fond.push(task) });
    expect(await (await concoursTic(avec.deps)).json()).toEqual({ ok: true });
    // La base a sa réponse sans attendre : le travail est confié à la tâche de fond.
    expect(fond).toHaveLength(1);
    await Promise.all(fond);
    expect(avec.calls.rpc[0]).toEqual({ name: "concours_travail", args: { p_limite: 1, p_id: null } });
    expect(avec.calls.rpc.some((c) => c.name === "concours_fait")).toBe(true);
  });

  it("le journal n'écrit ni le numéro d'un joueur ni le jeton d'une interaction", () => {
    expect(pathForLog(`/guilds/${GUILD}/members/${J(3)}`)).toBe(`/guilds/${GUILD}/members/…`);
    expect(pathForLog(`/users/${J(3)}`)).toBe("/users/…");
    expect(pathForLog(`/channels/${SALON}/messages/${MSG}`)).toBe(`/channels/${SALON}/messages/${MSG}`);
  });

  it("explique une réponse de Discord sans rien de secret", () => {
    expect(expliquer(null)).toBe("Discord ne répond pas");
    expect(expliquer({ status: 403, body: { code: 50001, message: "Missing Access" } })).toBe("Discord 403 (code 50001)");
    expect(participantsLabel(0)).toBe("0 participant");
    expect(participantsLabel(1)).toBe("1 participant");
    expect(participantsLabel(2)).toBe("2 participants");
  });
});

describe("par la porte de Discord", () => {
  let keys: CryptoKeyPair;
  let publicKey = "";
  const hex = (bytes: ArrayBuffer | Uint8Array): string => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
  beforeAll(async () => {
    keys = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
    publicKey = hex(await crypto.subtle.exportKey("raw", keys.publicKey));
  });
  const signed = async (body: unknown): Promise<Request> => {
    const text = JSON.stringify(body);
    const timestamp = String(NOW);
    const signature = hex(await crypto.subtle.sign({ name: "Ed25519" }, keys.privateKey, new TextEncoder().encode(timestamp + text)));
    return new Request("https://projet.supabase.co/functions/v1/code-discord/discord", {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature-ed25519": signature, "x-signature-timestamp": timestamp },
      body: text,
    });
  };
  const full = (answers: Rpc) => {
    const live = liveDeps({ get: () => undefined }, (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch);
    const { deps: c, calls, fini } = monde(answers);
    return { deps: { ...live, ...c, publicKey, serviceReady: true }, calls, fini };
  };

  it("les boutons « concours: » et la commande /concours arrivent au concours ; un autre bouton, non", async () => {
    const { deps, calls } = full({ concours_participants: () => ({ ok: true, statut: "ouvert", titre: "T", ouvert: true, compte: 0, inscrit: false, ids: [], gagnants: [] }) });
    const liste = await corps(await handle(await signed(clic("concours:liste:7")), deps));
    expect(liste.type).toBe(4);
    expect(calls.rpc[0]?.name).toBe("concours_participants");
    const autre = await corps(await handle(await signed(clic("ailleurs:1")), deps));
    expect(autre.data["content"]).toBe("Cette commande n'existe pas.");
    const cmd = await corps(await handle(await signed(commande("lancer", [opt("lot", "x"), opt("fin", "mardi")])), deps));
    expect(cmd.data["content"]).toBe(CONCOURS_MESSAGES.finFormat);
  });

  it("la base réveille la fonction par POST …/concours/tic", async () => {
    const { deps, calls, fini } = full({ concours_travail: () => ({ ok: true, taches: [] }) });
    const res = await handle(new Request("https://projet.supabase.co/functions/v1/code-discord/concours/tic", { method: "POST", body: "{}" }), deps);
    expect(await res.json()).toEqual({ ok: true });
    await fini();
    expect(calls.rpc[0]?.name).toBe("concours_travail");
  });

  it("liveDeps donne l'adresse du projet, sans la barre de la fin", () => {
    const env = (values: Record<string, string>) => ({ get: (name: string) => values[name] });
    expect(liveDeps(env({ SUPABASE_URL: `${PROJECT}/` })).projectUrl).toBe(PROJECT);
    expect(liveDeps(env({})).projectUrl).toBeUndefined();
  });
});
