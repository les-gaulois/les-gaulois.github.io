import { describe, expect, it } from "vitest";
import {
  arrivalPlan,
  arrivalStyle,
  avatarUrl,
  DECORS,
  drawnName,
  FALLBACK_NAME,
  initialOf,
  JOIN_MESSAGE_TYPE,
  looksLikeLink,
  markerName,
  MAX_AGE_MS,
  MAX_IMAGES_PER_PASS,
  MAX_NAME,
  NAME_SLOT,
  NO_REPEAT,
  NO_REPEAT_DECORS,
  phraseParts,
  PHRASES,
  readMarker,
  REWELCOME_AFTER_MS,
  sentence,
  snowflakeTime,
  stableHash,
  tidyName,
  type ArrivalStyle,
  type ChannelMessage,
} from "../../src/lib/arrivees";

const NBSP = String.fromCodePoint(0xa0);
const NOW = Date.parse("2026-11-12T20:00:00.000Z");
const BOT = "111111111111111111";

/** Un numéro de Discord pour une heure donnée : l'heure est écrite dans ses bits de poids fort. */
let counter = 0;
const snowflake = (ms: number): string => (((BigInt(ms) - 1_420_070_400_000n) << 22n) + BigInt(counter++ % 4096)).toString();
const minutesAgo = (minutes: number): string => snowflake(NOW - minutes * 60_000);

const user = (id: string, username = "joueur", bot = false) => ({ id, username, global_name: null, avatar: null, ...(bot ? { bot: true } : {}) });
const join = (id: string, author = user("222222222222222222")): ChannelMessage => ({ id, type: JOIN_MESSAGE_TYPE, author, attachments: [] });
const chat = (id: string, author = user("333333333333333333")): ChannelMessage => ({ id, type: 0, author, attachments: [] });
/** Une image de bienvenue du robot, sans texte : le nom du fichier dit quel message elle remplace, et qui elle accueille. */
const welcome = (id: string, replaced: string, userId: string, style: ArrivalStyle = { phrase: 0, decor: "foret" }): ChannelMessage => ({
  id,
  type: 0,
  author: user(BOT, "Le Gaulois", true),
  attachments: [{ filename: markerName(replaced, userId, style) }],
});

describe("les phrases", () => {
  it("ont chacune une place pour le nom, une seule, et au moins un décor connu", () => {
    // Le README en annonce seize.
    expect(PHRASES).toHaveLength(16);
    for (const phrase of PHRASES) {
      expect(phrase.texte.split(NAME_SLOT), phrase.texte).toHaveLength(2);
      expect(phrase.decors.length, phrase.texte).toBeGreaterThan(0);
      for (const decor of phrase.decors) expect(DECORS).toContain(decor);
      // Une phrase tient en peu de mots : elle s'écrit en grand sur l'image.
      expect(phrase.texte.length, phrase.texte).toBeLessThanOrEqual(60);
    }
    expect(new Set(PHRASES.map((p) => p.texte)).size).toBe(PHRASES.length);
  });
  it("donnent à chaque décor au moins trois phrases", () => {
    for (const decor of DECORS) expect(PHRASES.filter((p) => p.decors.includes(decor)).length, decor).toBeGreaterThanOrEqual(3);
  });
  it("ne se coupent jamais devant « : » ou « ! » : l'espace y est insécable", () => {
    for (const phrase of PHRASES) expect(phrase.texte, phrase.texte).not.toMatch(/ [:!?;]/);
    expect(PHRASES.some((p) => p.texte.includes(`${NBSP}:`))).toBe(true);
  });
  it("se séparent en ce qui précède et ce qui suit le nom, sans la ponctuation seule", () => {
    expect(phraseParts({ texte: "Un {nom} sauvage surgit de la forêt.", decors: ["foret"] })).toEqual({ avant: "Un", apres: "sauvage surgit de la forêt." });
    expect(phraseParts({ texte: "{nom} rejoint la tribu.", decors: ["etendard"] })).toEqual({ avant: "", apres: "rejoint la tribu." });
    expect(phraseParts({ texte: `Une place près du feu pour {nom}${NBSP}!`, decors: ["foret"] })).toEqual({ avant: "Une place près du feu pour", apres: "" });
    expect(phraseParts({ texte: "Connexion établie avec {nom}.", decors: ["matrice"] })).toEqual({ avant: "Connexion établie avec", apres: "" });
    expect(phraseParts({ texte: `Sonnez le carnyx${NBSP}: {nom} est là${NBSP}!`, decors: ["etendard"] })).toEqual({ avant: `Sonnez le carnyx${NBSP}:`, apres: `est là${NBSP}!` });
  });
  it("s'écrivent en entier avec le nom, pour la description de l'image", () => {
    expect(sentence({ texte: "Un {nom} sauvage surgit de la forêt.", decors: ["foret"] }, "Brennos")).toBe("Un Brennos sauvage surgit de la forêt.");
  });
});

describe("arrivalStyle", () => {
  it("donne toujours la même phrase et le même décor au même message", () => {
    const id = minutesAgo(3);
    expect(arrivalStyle(id)).toEqual(arrivalStyle(id));
    expect(stableHash("a")).toBe(stableHash("a"));
    expect(stableHash("a")).not.toBe(stableHash("b"));
  });
  it("choisit un décor qui va avec la phrase", () => {
    for (let i = 0; i < 200; i++) {
      const style = arrivalStyle(minutesAgo(i));
      expect(PHRASES[style.phrase]?.decors).toContain(style.decor);
    }
  });
  it("varie : toutes les phrases et tous les décors sortent, et chaque phrase avec chacun de ses décors", () => {
    const styles = Array.from({ length: 1500 }, (_, i) => arrivalStyle(minutesAgo(i)));
    expect(new Set(styles.map((s) => s.phrase)).size).toBe(PHRASES.length);
    expect(new Set(styles.map((s) => s.decor)).size).toBe(DECORS.length);
    const pairs = new Set(styles.map((s) => `${s.phrase}:${s.decor}`));
    PHRASES.forEach((phrase, index) => {
      for (const decor of phrase.decors) expect(pairs.has(`${index}:${decor}`), `${phrase.texte} · ${decor}`).toBe(true);
    });
  });
  it("ne reprend aucune des huit dernières phrases, ni aucun des deux derniers décors", () => {
    const recent: ArrivalStyle[] = [];
    for (let i = 0; i < 600; i++) {
      const style = arrivalStyle(minutesAgo(i), recent);
      expect(recent.slice(0, NO_REPEAT).map((r) => r.phrase), `tirage ${i}`).not.toContain(style.phrase);
      expect(recent.slice(0, NO_REPEAT_DECORS).map((r) => r.decor), `tirage ${i}`).not.toContain(style.decor);
      expect(PHRASES[style.phrase]?.decors, `tirage ${i}`).toContain(style.decor);
      recent.unshift(style);
    }
  });
  it("sort les six décors à peu près aussi souvent, à la suite comme sans mémoire", () => {
    const recent: ArrivalStyle[] = [];
    const chained = new Map<string, number>();
    const alone = new Map<string, number>();
    for (let i = 0; i < 1200; i++) {
      const id = minutesAgo(i);
      const style = arrivalStyle(id, recent);
      recent.unshift(style);
      chained.set(style.decor, (chained.get(style.decor) ?? 0) + 1);
      const single = arrivalStyle(id).decor;
      alone.set(single, (alone.get(single) ?? 0) + 1);
    }
    for (const counts of [chained, alone]) {
      for (const decor of DECORS) {
        // Un sixième chacun, soit 200 : entre 130 et 270, aucun décor n'est rare ni envahissant.
        expect(counts.get(decor) ?? 0, decor).toBeGreaterThan(130);
        expect(counts.get(decor) ?? 0, decor).toBeLessThan(270);
      }
    }
  });
  it("rend quand même un style quand ses règles ne laissent rien", () => {
    // Toutes les phrases et tous les décors viennent de servir : les règles se relâchent, la phrase reste assortie au décor.
    const everything: ArrivalStyle[] = PHRASES.map((phrase, index) => ({ phrase: index, decor: phrase.decors[0]! }));
    const style = arrivalStyle(minutesAgo(1), everything);
    expect(PHRASES[style.phrase]?.decors).toContain(style.decor);
  });
});

describe("le nom du fichier", () => {
  it("dit quel message l'image remplace, qui elle accueille, sa phrase et son décor", () => {
    const id = minutesAgo(2);
    const player = "222222222222222250";
    const name = markerName(id, player, { phrase: 7, decor: "bouclier" });
    expect(name).toBe(`arrivee-${id}-${player}-7-bouclier.png`);
    expect(readMarker(name)).toEqual({ messageId: id, userId: player, style: { phrase: 7, decor: "bouclier" } });
  });
  it("ne reconnaît pas un autre fichier", () => {
    const id = minutesAgo(2);
    const player = "222222222222222250";
    // Sans le numéro du joueur, avec un décor ou une phrase inconnus, un numéro trop court, ou autre chose autour du nom.
    for (const name of ["bienvenue.png", `arrivee-${id}.png`, `arrivee-${id}-1-foret.png`, `arrivee-${id}-${player}-7-inconnu.png`, `arrivee-${id}-${player}-999-foret.png`, `arrivee-12-${player}-1-foret.png`, `arrivee-${id}-12-1-foret.png`, `x-arrivee-${id}-${player}-1-foret.png`, `arrivee-${id}-${player}-1-foret.png.exe`]) {
      expect(readMarker(name), name).toBeNull();
    }
  });
});

describe("arrivalPlan", () => {
  it("lit l'heure d'un message dans son numéro", () => {
    expect(snowflakeTime(snowflake(NOW - 90_000))).toBe(NOW - 90_000);
  });
  it("remplace les messages d'arrivée récents, du plus ancien au plus récent, et rien d'autre", () => {
    const first = join(minutesAgo(9), user("222222222222222201"));
    const second = join(minutesAgo(4), user("222222222222222202"));
    const plan = arrivalPlan([chat(minutesAgo(1)), second, chat(minutesAgo(6)), first], BOT, NOW);
    expect(plan.tasks).toEqual([
      { message: first, posted: false },
      { message: second, posted: false },
    ]);
    expect(plan.left).toEqual([]);
    expect(plan.recent).toEqual([]);
  });
  it("laisse un message d'arrivée de plus de deux heures", () => {
    const old = join(snowflake(NOW - MAX_AGE_MS - 60_000));
    const fresh = join(snowflake(NOW - MAX_AGE_MS + 60_000), user("222222222222222203"));
    const plan = arrivalPlan([old, fresh], BOT, NOW);
    expect(plan.tasks.map((t) => t.message.id)).toEqual([fresh.id]);
    expect(plan.left).toEqual([]);
  });
  it("laisse l'arrivée d'un robot", () => {
    const robot = join(minutesAgo(3), user("444444444444444444", "un-robot", true));
    const plan = arrivalPlan([robot], BOT, NOW);
    expect(plan.tasks).toEqual([]);
    expect(plan.left).toEqual([{ id: robot.id, reason: "c'est un robot" }]);
  });
  it("ne refait pas une image déjà postée : il ne reste qu'à retirer le message de Discord", () => {
    const arrival = join(minutesAgo(8));
    const style: ArrivalStyle = { phrase: 3, decor: "foret" };
    const plan = arrivalPlan([welcome(minutesAgo(7), arrival.id, arrival.author.id, style), arrival], BOT, NOW);
    expect(plan.tasks).toEqual([{ message: arrival, posted: true }]);
    expect(plan.recent).toEqual([style]);
  });
  it("n'accueille pas deux fois un joueur qui sort et revient", () => {
    const player = user("222222222222222204");
    const firstVisit = minutesAgo(30);
    const again = join(minutesAgo(2), player);
    const plan = arrivalPlan([welcome(minutesAgo(28), firstVisit, player.id), again], BOT, NOW);
    expect(plan.tasks).toEqual([]);
    expect(plan.left).toEqual([{ id: again.id, reason: "ce joueur a déjà son image" }]);
  });
  it("accueille de nouveau un joueur revenu plus d'un jour après sa première image", () => {
    const player = user("222222222222222208");
    const again = join(minutesAgo(2), player);
    const lastWeek = snowflake(NOW - 7 * 24 * 3_600_000);
    const yesterday = snowflake(NOW - REWELCOME_AFTER_MS - 60_000);
    const today = snowflake(NOW - REWELCOME_AFTER_MS + 60_000);
    expect(arrivalPlan([welcome(lastWeek, snowflake(NOW - 7 * 24 * 3_600_000 - 60_000), player.id), again], BOT, NOW).tasks).toEqual([{ message: again, posted: false }]);
    expect(arrivalPlan([welcome(yesterday, snowflake(NOW - REWELCOME_AFTER_MS - 120_000), player.id), again], BOT, NOW).tasks).toEqual([{ message: again, posted: false }]);
    expect(arrivalPlan([welcome(today, snowflake(NOW - REWELCOME_AFTER_MS), player.id), again], BOT, NOW).tasks).toEqual([]);
  });
  it("n'accueille qu'une fois un joueur arrivé deux fois avant le passage", () => {
    const player = user("222222222222222205");
    const first = join(minutesAgo(4), player);
    const second = join(minutesAgo(2), player);
    const plan = arrivalPlan([second, first], BOT, NOW);
    expect(plan.tasks).toEqual([{ message: first, posted: false }]);
    expect(plan.left).toEqual([{ id: second.id, reason: "ce joueur a déjà son image" }]);
  });
  it("ne compte pas l'image d'un autre que le robot", () => {
    const arrival = join(minutesAgo(8));
    const fake: ChannelMessage = { ...welcome(minutesAgo(7), arrival.id, arrival.author.id), author: user("555555555555555555", "farceur") };
    expect(arrivalPlan([fake, arrival], BOT, NOW).tasks).toEqual([{ message: arrival, posted: false }]);
  });
  it("s'arrête à cinq images par passage, et garde les suivantes pour le passage d'après", () => {
    const arrivals = Array.from({ length: MAX_IMAGES_PER_PASS + 2 }, (_, i) => join(minutesAgo(20 - i), user(`2222222222222223${String(i).padStart(2, "0")}`)));
    const plan = arrivalPlan(arrivals, BOT, NOW);
    expect(plan.tasks.map((t) => t.message.id)).toEqual(arrivals.slice(0, MAX_IMAGES_PER_PASS).map((m) => m.id));
    expect(plan.left).toEqual([]);
    expect(plan.later).toBe(2);
  });
  it("donne les styles des dernières images, de la plus récente à la plus ancienne", () => {
    const a: ArrivalStyle = { phrase: 1, decor: "bouclier" };
    const b: ArrivalStyle = { phrase: 5, decor: "etendard" };
    const plan = arrivalPlan([welcome(minutesAgo(50), minutesAgo(52), "222222222222222206", a), welcome(minutesAgo(10), minutesAgo(12), "222222222222222207", b)], BOT, NOW);
    expect(plan.recent).toEqual([b, a]);
  });
  it("n'écrit ni nom ni identifiant de joueur dans ce qu'il laisse", () => {
    const robot = join(minutesAgo(3), user("444444444444444444", "NomDuRobot", true));
    expect(JSON.stringify(arrivalPlan([robot], BOT, NOW).left)).not.toMatch(/NomDuRobot|444444444444444444/);
  });
});

describe("le nom à écrire", () => {
  /** Une police qui ne saurait écrire que les lettres latines, les chiffres et la ponctuation courante. */
  const latin = (char: string) => /^[\p{Script=Latin}\p{N}]$/u.test(char) || " !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~°".includes(char);
  const dragon = String.fromCodePoint(0x1f409);
  const moon = String.fromCodePoint(0x1f311);
  const cjk = String.fromCodePoint(0x300e) + String.fromCodePoint(0x2301);

  it("remet d'aplomb un nom libre : espaces réduits, signes invisibles retirés, lettres de fantaisie ramenées aux lettres ordinaires", () => {
    expect(tidyName(`  Luern${NBSP}${NBSP}le   brave  `)).toBe("Luern le brave");
    expect(tidyName(`a${String.fromCodePoint(0x200b)}b${String.fromCodePoint(0x202e)}c${String.fromCodePoint(0xfe0f)}`)).toBe("abc");
    expect(tidyName(`ligne${String.fromCodePoint(0x0a)}suivante${String.fromCodePoint(0x09)}fin`)).toBe("ligne suivante fin");
    // Des lettres mathématiques grasses et des lettres pleine largeur.
    expect(tidyName(String.fromCodePoint(0x1d406, 0x1d41a, 0x1d42e, 0x1d425, 0x1d41e))).toBe("Gaule");
    expect(tidyName(String.fromCodePoint(0xff27, 0xff21, 0xff2c))).toBe("GAL");
  });
  it("retire du nom ce que les polices ne dessinent pas, et garde le reste", () => {
    expect(drawnName(`[GAL]${cjk}Luern${dragon}`, "luern_44", latin)).toBe("[GAL]Luern");
    expect(drawnName(`Nantos${moon}`, "nantos", latin)).toBe("Nantos");
    expect(drawnName("B R E N °", "bren", latin)).toBe("B R E N °");
    expect(drawnName("!Divico", "divico", latin)).toBe("!Divico");
  });
  it("prend le nom d'utilisateur s'il ne reste ni lettre ni chiffre", () => {
    expect(drawnName(`${dragon}${dragon}`, "dragon_du_78", latin)).toBe("dragon_du_78");
    expect(drawnName("!!!", "point.exclamation", latin)).toBe("point.exclamation");
    expect(drawnName(String.fromCodePoint(0x5c71, 0x7530), "yamada", latin)).toBe("yamada");
  });
  it("a un nom de secours si rien ne se dessine, et ne dépasse jamais 32 signes", () => {
    expect(drawnName(dragon, moon, latin)).toBe(FALLBACK_NAME);
    expect(drawnName("", "", latin)).toBe(FALLBACK_NAME);
    expect([...drawnName("x".repeat(80), "x", latin)]).toHaveLength(MAX_NAME);
  });
  it("donne l'initiale qui remplace la photo", () => {
    expect(initialOf("[GAL] Brennos")).toBe("G");
    expect(initialOf("!divico")).toBe("D");
    expect(initialOf("éloïse")).toBe("É");
    expect(initialOf("42")).toBe("4");
    expect(initialOf("!!")).toBe("G");
  });
});

describe("avatarUrl", () => {
  const GUILD = "1350905494600024094";
  const USER = "222222222222222222";
  const HASH = "0123456789abcdef0123456789abcdef";
  it("préfère la photo du serveur à celle du compte, en PNG", () => {
    expect(avatarUrl(GUILD, USER, HASH, "f".repeat(32))).toBe(`https://cdn.discordapp.com/guilds/${GUILD}/users/${USER}/avatars/${HASH}.png?size=256`);
    expect(avatarUrl(GUILD, USER, null, HASH)).toBe(`https://cdn.discordapp.com/avatars/${USER}/${HASH}.png?size=256`);
  });
  it("demande une photo animée en image fixe", () => {
    expect(avatarUrl(GUILD, USER, null, `a_${HASH}`)).toBe(`https://cdn.discordapp.com/avatars/${USER}/a_${HASH}.png?size=256`);
  });
  it("ne rend rien sans photo, ni pour une empreinte inattendue : jamais le logo de Discord", () => {
    expect(avatarUrl(GUILD, USER, null, null)).toBeNull();
    expect(avatarUrl(GUILD, USER, undefined, undefined)).toBeNull();
    expect(avatarUrl(GUILD, USER, null, "../../etc/passwd")).toBeNull();
    expect(avatarUrl(GUILD, USER, "abc", "0123")).toBeNull();
  });
});

describe("ce que la relecture a trouvé", () => {
  it("écrit tel quel un nom qui contient « $ » dans la description de l'image", () => {
    const phrase = { texte: "Un {nom} sauvage surgit de la forêt.", decors: ["foret"] as const };
    expect(sentence(phrase, "Ca$$h")).toBe("Un Ca$$h sauvage surgit de la forêt.");
    expect(sentence(phrase, "$&")).toBe("Un $& sauvage surgit de la forêt.");
    expect(sentence(phrase, "$'")).toBe("Un $' sauvage surgit de la forêt.");
  });
  it("retire le message de Discord dont l'image est déjà là, même après deux heures", () => {
    const old = join(snowflake(NOW - MAX_AGE_MS - 5 * 60_000));
    const image = welcome(snowflake(NOW - MAX_AGE_MS - 4 * 60_000), old.id, old.author.id);
    expect(arrivalPlan([image, old], BOT, NOW).tasks).toEqual([{ message: old, posted: true }]);
    // Sans image, un message aussi ancien reste comme il est.
    expect(arrivalPlan([old], BOT, NOW).tasks).toEqual([]);
  });
  it("reconnaît un nom qui est une adresse ou une invitation, et laisse les autres", () => {
    for (const name of ["discord.gg/abcdef", "DISCORD . GG / abcdef", "https://exemple.test", "www.exemple.test", "gagnez sur exemple.com", "exemple.io/cadeau", "exemple . fr / cadeau", "discord.com/invite/abc", "nitro gratuit.xyz", "exemple.com rejoins nous", "exemple.com !", "EXEMPLE.COM"]) {
      expect(looksLikeLink(name), name).toBe(true);
    }
    // Des noms de joueurs ordinaires, dont ceux qui finissent comme une adresse : ils gardent leur image.
    for (const name of ["Brennos", "[GAL] Taranis", "lug_du_nord.6301", "Dr. Nantos", "Epona la Rapide", "a.b", "comme.toi", "!Divico", "luern.fr", "nantos.gg", "divico.tv", "brennos.me", "M. Org", "com", "Le.Compte"]) {
      expect(looksLikeLink(name), name).toBe(false);
    }
  });
  it("ne parle ni de mot de passe, ni d'accès, ni de recrue, ni de joueur en ligne : rien de cela n'est vrai d'une arrivée sur Discord", () => {
    for (const phrase of PHRASES) expect(phrase.texte, phrase.texte).not.toMatch(/mot de passe|accès|recrue|en ligne|tribu|nos rangs|clan/i);
  });
});
