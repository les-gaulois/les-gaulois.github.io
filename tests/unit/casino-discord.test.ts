/**
 * Les gros gains du casino sur Discord, côté robot (`src/lib/casino-discord.ts`, `src/lib/casino-image.ts`) : la lecture de
 * la file, le compte refait avec les règles du site, la chance exacte, le passage (envoi, note, reprise), le message, et
 * l'image (texte dans ses cases, vignette avec le vrai tirage). Le serveur : `casino-discord-serveur.test.ts`.
 */
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { casinoCard, decorDeLaToile, vignetteDuGain } from "../../src/lib/casino-image";
import {
  CASINO_PAR_PASSAGE,
  SEUIL_DU_CASINO,
  casinoPass,
  casinoPayload,
  chanceDuCoup,
  chanceEnMots,
  foisEnMots,
  gainEnMots,
  lireReponseDuCasino,
  serveurDuCasino,
  titreDuGain,
  type CasinoCalls,
  type CasinoSendState,
  type GrosGain,
  type LectureDuCasino,
  type ServeurDuCasino,
} from "../../src/lib/casino-discord";
import { fmtInt } from "../../src/lib/format";
import { GazetteFonts } from "../../src/lib/gazette-image";
import { couloirsVus, facesVues, vignette } from "../../src/lib/jeu/casino-hall";
import { texteDeMigration } from "./banc-pglite";

const LE = "2026-11-26T20:05:00.000Z";
const NOW = new Date("2026-11-26T20:10:00.000Z");

/** Une ligne de la file, comme le serveur la rend : la machine à 100 fois, sauf ce que `o` change. */
const ligne = (o: Record<string, unknown> = {}) => ({ partie: 11, le: LE, jeu: "machine", mise: 20, rendu: 2000, paris: { mise: 20 }, resultat: { resultat: 0, cases: [[3, 0, 2], [1, 0, 4], [2, 0, 3]] }, nom: "Gaulois n° 12", discord: "druide.des.bois", ...o });
const lire = (...annonces: unknown[]) => lireReponseDuCasino({ ok: true, seuil: 1000, annonces })!;
const gain = (o: Record<string, unknown> = {}): GrosGain => lire(ligne(o)).gains[0]!;

describe("le seuil", () => {
  it("est celui du serveur", () => {
    expect(texteDeMigration("20261126000100_casino_sur_discord.sql")).toContain(`internal.casino_annonce_seuil() returns integer\nlanguage sql immutable set search_path = public, pg_temp as $$ select ${SEUIL_DU_CASINO} $$`);
    expect(SEUIL_DU_CASINO).toBe(1000);
  });
});

describe("la lecture de la file", () => {
  it("relit chaque jeu, recompte le rendu avec les règles du site, et garde le nom Discord", () => {
    const lu = lire(
      ligne(),
      ligne({ partie: 12, jeu: "palissade", mise: 200, rendu: 3800, paris: { mise: 200 }, resultat: { chemin: [0, 0, 0, 0, 0, 0, 0, 0], coupe: 0 } }),
      ligne({ partie: 13, jeu: "course", mise: 100, rendu: 2400, paris: { couloir: 5, mise: 100 }, resultat: { couloir: 5, gagnant: 5 } }),
      ligne({ partie: 14, jeu: "roue", mise: 200, rendu: 1760, paris: { n17: 40, bleu: 160 }, resultat: { numero: 17, par_pari: {} } }),
      ligne({ partie: 15, jeu: "des", mise: 50, rendu: 1800, paris: { s12: 50 }, resultat: { faces: [6, 6], par_pari: {} } }),
    );
    expect(lu.illisibles).toEqual([]);
    expect(lu.gains.map((g) => g.tirage)).toEqual([
      { jeu: "machine", resultat: 0, ligne: [0, 0, 0] },
      { jeu: "palissade", coupe: 0 },
      { jeu: "course", couloir: 5, gagnant: 5 },
      { jeu: "roue", numero: 17, paris: { n17: 40, bleu: 160 } },
      { jeu: "des", faces: [6, 6], paris: { s12: 50 } },
    ]);
    expect(lu.gains[0]).toMatchObject({ id: 11, le: LE, mise: 20, rendu: 2000, nom: "Gaulois n° 12", discord: "druide.des.bois" });
  });

  it("laisse, sans les poster, les coups qui ne tombent pas juste, sous le seuil, ou d'un jeu qu'il ne sait pas dessiner", () => {
    const lu = lire(
      ligne({ partie: 1, rendu: 2020 }), // la machine ne rend pas cela
      ligne({ partie: 2, resultat: { resultat: 0, cases: [[3, 1, 2], [1, 0, 4], [2, 0, 3]] } }), // la ligne ne dit pas le résultat
      ligne({ partie: 3, mise: 10, rendu: 1000 }), // 990 gagnés
      ligne({ partie: 4, jeu: "vingt-et-un" }),
      ligne({ partie: 5, jeu: "roue", mise: 200, rendu: 1760, paris: { n17: 40, bleu: 150 }, resultat: { numero: 17 } }), // paris qui ne font pas la mise
      ligne({ partie: 6, jeu: "roue", mise: 200, rendu: 1760, paris: { n17: 40, vert: 160 }, resultat: { numero: 17 } }), // pari inconnu
      ligne({ partie: 7, jeu: "palissade", mise: 200, rendu: 3800, resultat: { chemin: [1, 1, 1, 1, 1, 1, 1, 1], coupe: 0 } }), // chemin et coupe en désaccord
      ligne({ partie: 8, jeu: "course", mise: 100, rendu: 2400, resultat: { couloir: 4, gagnant: 5 } }), // perdu, pas gagné
      { pas: "une ligne" },
    );
    expect(lu.gains).toEqual([]);
    expect(lu.illisibles).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("refuse une réponse qui n'est pas celle de la file, et nettoie un nom Discord", () => {
    expect(lireReponseDuCasino({ ok: false })).toBeNull();
    expect(lireReponseDuCasino(null)).toBeNull();
    expect(gain({ discord: "  " }).discord).toBeNull();
    expect(gain({ discord: "https://exemple.test" }).discord).toBeNull();
  });
});

describe("les mots et la chance", () => {
  it("disent le multiple sans arrondir en faveur du joueur", () => {
    expect(foisEnMots(2000, 20)).toBe("100 fois");
    expect(foisEnMots(1224, 170)).toBe("7,2 fois");
    expect(foisEnMots(1760, 200)).toBe("8,8 fois");
    expect(foisEnMots(1420, 300)).toBe("plus de 4,7 fois");
    expect(titreDuGain(gain())).toBe("100 fois sa mise à la machine du forgeron");
  });

  it("donnent la chance exacte de ce rendu, sur toutes les issues du jeu", () => {
    expect(chanceDuCoup(gain())).toEqual({ sur: 1, parmi: 500 });
    expect(chanceDuCoup(gain({ mise: 200, rendu: 4000, resultat: { resultat: 1, cases: [[0, 1, 2], [3, 1, 4], [2, 1, 3]] } }))).toEqual({ sur: 1, parmi: 100 });
    expect(chanceDuCoup(gain({ jeu: "palissade", mise: 200, rendu: 3800, paris: { mise: 200 }, resultat: { chemin: [1, 1, 1, 1, 1, 1, 1, 1], coupe: 8 } }))).toEqual({ sur: 1, parmi: 128 });
    expect(chanceDuCoup(gain({ jeu: "course", mise: 200, rendu: 1200, paris: { couloir: 2, mise: 200 }, resultat: { couloir: 2, gagnant: 2 } }))).toEqual({ sur: 1, parmi: 6 });
    // à la roue, toutes les cases qui rendent autant : le 17 seul, avec ces paris
    expect(chanceDuCoup(gain({ jeu: "roue", mise: 200, rendu: 1760, paris: { n17: 40, bleu: 160 }, resultat: { numero: 17 } }))).toEqual({ sur: 1, parmi: 36 });
    // aux dés, 7 tout juste à 200 : 6 issues sur 36
    expect(chanceDuCoup(gain({ jeu: "des", mise: 200, rendu: 1200, paris: { s7: 200 }, resultat: { faces: [3, 4] } }))).toEqual({ sur: 1, parmi: 6 });
    expect(chanceEnMots({ sur: 5, parmi: 36 })).toBe("5 sur 36");
  });

  it("écrivent la description et le texte de secours sans solde ni lien, avec ce que le jeu rend en moyenne", () => {
    expect(gainEnMots(gain())).toEqual([
      `@druide.des.bois gagne ${fmtInt(1980)} statères à la machine du forgeron.`,
      "100 fois sa mise de 20, le 26 novembre 2026 à 21 h 05.",
      "Une chance sur 500. La machine rend en moyenne la mise.",
      "Misé en statères, qui viennent des points rapportés au clan.",
    ]);
    expect(gainEnMots(gain({ discord: null }))[0]).toBe(`Gaulois n° 12 gagne ${fmtInt(1980)} statères à la machine du forgeron.`);
    expect(gainEnMots(gain({ jeu: "des", mise: 200, rendu: 1200, paris: { s7: 200 }, resultat: { faces: [3, 4] } }))[2]).toBe("Une chance sur 6. Les dés rendent en moyenne la mise.");
  });
});

describe("le message", () => {
  it("en image : la description et le bouton, sans texte ; en secours : le texte, sans mention possible", () => {
    const image = casinoPayload(gain(), "https://les-gaulois.github.io/", { alt: "x", filename: "casino-11.png" });
    expect(JSON.stringify(image)).toContain("casino-11.png");
    expect(JSON.stringify(image)).toContain("https://les-gaulois.github.io/village");
    const texte = casinoPayload(gain({ discord: "un_nom" }), "https://les-gaulois.github.io", null) as { content: string; allowed_mentions: unknown };
    expect(texte.allowed_mentions).toEqual({ parse: [] });
    expect(texte.content.split("\n")[0]).toBe("**\\@un\\_nom gagne 1 980 statères à la machine du forgeron.**");
    expect(texte.content).toContain("[Jouer sur le site](<https://les-gaulois.github.io/village>)");
    expect(texte.content).toContain("-# Misé en statères");
  });
});

describe("le serveur", () => {
  const env = { SUPABASE_URL: "https://abc.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_cle" };
  const calls = (lire: CasinoCalls["lire"], noter: CasinoCalls["noter"] = async () => ({ ok: true })): CasinoCalls => ({ lire, noter });

  it("ne lit rien sans réglage, reconnaît une migration pas encore collée, et ne laisse passer ni lien ni clé dans une panne", async () => {
    expect((await serveurDuCasino({}, calls(async () => ({ ok: true, annonces: [] }))).lire()).etat).toBe("sans-reglage");
    const absente = calls(async () => {
      throw Object.assign(new Error("Could not find the function public.casino_annonces_a_envoyer"), { code: "PGRST202" });
    });
    expect((await serveurDuCasino(env, absente).lire()).etat).toBe("fonction-absente");
    const panne = calls(async () => {
      throw new Error("refus de https://abc.supabase.co avec sb_secret_cle");
    });
    const lu = await serveurDuCasino(env, panne).lire();
    expect(lu.etat).toBe("panne");
    expect(JSON.stringify(lu)).not.toMatch(/abc\.supabase|sb_secret/);
    let notees: readonly number[] = [];
    await serveurDuCasino(env, calls(async () => ({ ok: true, annonces: [] }), async (_u, _k, p) => ((notees = p), { ok: true }))).noter([3, 4]);
    expect(notees).toEqual([3, 4]);
  });
});

describe("casinoPass", () => {
  const serveur = (lecture: LectureDuCasino, notes: number[][] = [], noteEchoue = false): ServeurDuCasino => ({
    lire: async () => lecture,
    noter: async (parties) => {
      if (noteEchoue) throw new Error("refus");
      notes.push([...parties]);
    },
  });
  const lu = (gains: GrosGain[], illisibles: number[] = []): LectureDuCasino => ({ etat: "lu", gains, illisibles });
  const passe = (deps: Partial<Parameters<typeof casinoPass>[0]> & Pick<Parameters<typeof casinoPass>[0], "serveur">) => casinoPass({ stored: null, now: NOW, send: async () => true, note: () => {}, log: () => {}, ...deps });

  it("note d'abord les coups illisibles, puis envoie, garde chaque envoi et le note au serveur", async () => {
    const notes: number[][] = [];
    const envoyes: number[] = [];
    const gardes: CasinoSendState[] = [];
    const r = await passe({ serveur: serveur(lu([gain({ partie: 1 }), gain({ partie: 2 })], [9]), notes), send: async (g) => (envoyes.push(g.id), true), note: (s) => gardes.push(s) });
    expect(r).toEqual({ failed: false, envoyes: 2 });
    expect(envoyes).toEqual([1, 2]);
    expect(notes).toEqual([[9], [1], [2]]);
    expect(gardes.at(-1)).toEqual({ envoyes: [{ id: 1, le: LE }, { id: 2, le: LE }] });
  });

  it(`envoie ${CASINO_PAR_PASSAGE} images au plus par passage`, async () => {
    const gains = Array.from({ length: CASINO_PAR_PASSAGE + 2 }, (_, i) => gain({ partie: i + 1 }));
    const logs: string[] = [];
    const r = await passe({ serveur: serveur(lu(gains)), log: (l) => logs.push(l) });
    expect(r.envoyes).toBe(CASINO_PAR_PASSAGE);
    expect(logs).toContain("Casino : la suite partira au prochain passage.");
  });

  it("ne renvoie jamais un coup déjà accepté par Discord : il ne fait que le noter", async () => {
    const notes: number[][] = [];
    const envoyes: number[] = [];
    const r = await passe({ serveur: serveur(lu([gain({ partie: 1 }), gain({ partie: 2 })]), notes), stored: { envoyes: [{ id: 1, le: LE }] }, send: async (g) => (envoyes.push(g.id), true) });
    expect(r).toEqual({ failed: false, envoyes: 1 });
    expect(envoyes).toEqual([2]);
    expect(notes).toEqual([[1], [2]]);
  });

  it("s'arrête sans rien noter quand Discord refuse, et quand le serveur ne prend pas la note", async () => {
    const notes: number[][] = [];
    expect(await passe({ serveur: serveur(lu([gain({ partie: 1 }), gain({ partie: 2 })]), notes), send: async () => false })).toEqual({ failed: true, envoyes: 0 });
    expect(notes).toEqual([]);
    const envoyes: number[] = [];
    expect(await passe({ serveur: serveur(lu([gain({ partie: 1 }), gain({ partie: 2 })]), [], true), send: async (g) => (envoyes.push(g.id), true) })).toEqual({ failed: true, envoyes: 1 });
    expect(envoyes).toEqual([1]);
  });

  it("ne compte pas comme une panne une migration pas encore collée", async () => {
    const logs: string[] = [];
    expect(await passe({ serveur: serveur({ etat: "fonction-absente", warning: "pas collée" }), log: (l) => logs.push(l) })).toEqual({ failed: false, envoyes: 0 });
    expect(logs).toEqual(["::notice::Casino : pas collée."]);
    expect((await passe({ serveur: serveur({ etat: "panne", warning: "refus" }) })).failed).toBe(true);
  });
});

describe("l'image", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const fonts = new GazetteFonts(root);
  const draws = (char: string) => fonts.draws(char, "strong");
  const exemples: [string, GrosGain][] = [
    ["machine", gain()],
    ["palissade", gain({ jeu: "palissade", mise: 200, rendu: 3800, paris: { mise: 200 }, resultat: { chemin: [1, 1, 1, 1, 1, 1, 1, 1], coupe: 8 } })],
    ["course", gain({ jeu: "course", mise: 100, rendu: 2400, paris: { couloir: 5, mise: 100 }, resultat: { couloir: 5, gagnant: 5 } })],
    ["roue", gain({ jeu: "roue", mise: 200, rendu: 1760, paris: { n17: 40, bleu: 160 }, resultat: { numero: 17 }, discord: null })],
    ["des", gain({ jeu: "des", mise: 50, rendu: 1800, paris: { s2: 50 }, resultat: { faces: [1, 1] }, discord: "W".repeat(32) })],
  ];

  it("garde chaque texte et la vitrine dans l'image, sans rien qui déborde", () => {
    for (const [id, g] of exemples) {
      const card = casinoCard(g, "https://les-gaulois.github.io", fonts.width, draws);
      for (const t of card.texts) {
        const largeur = fonts.width(t.text, t.font, t.size);
        const gauche = t.anchor === "end" ? t.x - largeur : t.x;
        expect(gauche, `${id} : ${t.text}`).toBeGreaterThanOrEqual(0);
        expect(gauche + largeur, `${id} : ${t.text}`).toBeLessThanOrEqual(card.width);
        expect(t.y, `${id} : ${t.text}`).toBeLessThanOrEqual(card.height);
      }
      expect(card.texts.map((t) => t.text)).toContain(titreDuGain(g));
      expect(card.texts.some((t) => t.text.includes("les-gaulois.github.io/village")), id).toBe(true);
      const [d] = card.dessins;
      expect(d, id).toBeDefined();
      expect(d!.x + d!.decor.largeur * d!.echelle, id).toBeLessThanOrEqual(card.width);
      expect(d!.y + d!.decor.hauteur * d!.echelle, id).toBeLessThanOrEqual(card.height);
    }
  });

  // Que le hall n'ait pas changé avec ce chantier a été vérifié une fois au pixel près, contre le code d'avant (52 dessins,
  // 26 novembre 2026) ; ici, seulement qu'une vignette sans tirage ne dépend pas de l'argument.
  it("peint le vrai tirage : la vignette change avec lui ; sans tirage, c'est celle du hall", () => {
    const empreinte = (t: { d: Uint8ClampedArray }) => Buffer.from(t.d).toString("base64");
    for (const [id, g] of exemples) {
      const avec = vignetteDuGain(g, 130, 100);
      const hall = vignette(g.tirage.jeu, 130, 100, false);
      expect(empreinte(avec), id).not.toBe(empreinte(hall));
      expect(empreinte(vignette(g.tirage.jeu, 130, 100, false, undefined)), id).toBe(empreinte(hall));
      expect(decorDeLaToile(avec).cases.length, id).toBe(130 * 100);
    }
  });

  it("montre des faces de dé voisines et le couloir gagnant parmi les trois couloirs vus", () => {
    for (let f = 1; f <= 6; f++) {
      const [dessus, gauche, droite] = facesVues(f);
      expect(dessus).toBe(f);
      expect(new Set([dessus, gauche, droite]).size).toBe(3);
      for (const [a, b] of [[dessus, gauche], [dessus, droite], [gauche, droite]] as const) expect(a + b, `${f}`).not.toBe(7);
    }
    for (let g = 0; g < 6; g++) {
      const { numeros, enTete } = couloirsVus(g);
      expect(numeros[enTete]).toBe(g + 1);
      expect(numeros.every((n) => n >= 1 && n <= 6)).toBe(true);
    }
  });
});
