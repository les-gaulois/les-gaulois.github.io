import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BANNIERES, fondDeLaBanniere } from "../../supabase/functions/code-discord/bannieres/index";
import { lirePng } from "../../supabase/functions/code-discord/billets";
import {
  CARACTERES,
  COFFRE_SALON_ID,
  coffreCommand,
  consigneDuGardien,
  DRUIDE_MODELE,
  essaisAvantIndices,
  FATIGUE_ESSAIS,
  foisDeLaManche,
  INDICES_ESSAIS,
  mancheDuCycle,
  MANCHES_DU_CYCLE,
  MANCHES_PAR_CYCLE,
  messageDuCoffre,
  NIVEAUX,
  jaugeDeFatigue,
  pauseDuGardien,
  suiteDuBilan,
  COFFRE_MESSAGES,
  MOT_SANS_NIVEAU,
  MOTS_PAR_NIVEAU,
  demandeDuMot,
  HONNEUR_FILE,
  BILAN_FILE,
  niveauDuRang,
  PALIERS,
  PALIERS_DU_CYCLE,
  PALIER_SOUTENU,
  palierDeLaManche,
  palierDuDruide,
  parseCycle,
  parseManche,
  parseTableau,
  separateurDeManche,
} from "../../supabase/functions/code-discord/coffre";
import { decrireLEssai, decrireLeTableau, decrireLHonneur, POINTS_FAIBLES, FICHES_DES_GARDIENS, GARDIENS, HUMEURS, IMAGE_DU_COFFRE, lignesDeLAide, meilleursDuCycle, pngDeLEssai, pngDeLHonneur, tenueDuGardien } from "../../supabase/functions/code-discord/coffre-image";
import { modeleDuGaulois } from "../../supabase/functions/code-discord/gaulois";
import type { DiscordCall } from "../../supabase/functions/code-discord/index";
import { RARETES_DES_MODELES } from "../../supabase/functions/code-discord/modeles/index";

const LF = String.fromCharCode(10);
const lire = (nom: string) => readFileSync(`supabase/migrations/${nom}.sql`, "utf8").split(String.fromCharCode(13) + LF).join(LF);

describe("le cycle des quinze manches à thème", () => {
  it("a quinze manches : fois 2 pour les cinq premières, fois 3 pour les cinq suivantes, fois 4 pour les cinq dernières", () => {
    expect(MANCHES_PAR_CYCLE).toBe(15);
    expect(MANCHES_DU_CYCLE).toHaveLength(15);
    expect(MANCHES_DU_CYCLE.map((m) => NIVEAUX[m.niveau].fois)).toEqual([2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4]);
    expect(MANCHES_DU_CYCLE.map((m) => m.niveau)).toEqual(["facile", "facile", "facile", "moyen", "moyen", "difficile", "difficile", "difficile", "difficile", "difficile", "tres-difficile", "tres-difficile", "tres-difficile", "extreme", "extreme"]);
    // La vigilance ne redescend jamais d'une manche à la suivante.
    const paliers = MANCHES_DU_CYCLE.map((m) => NIVEAUX[m.niveau].palier);
    expect(paliers).toEqual([...paliers].sort((a, b) => a - b));
    expect(Math.max(...paliers)).toBe(PALIERS.length - 1);
    expect([0, 16, 1.5, null, undefined].map((r) => mancheDuCycle(r))).toEqual([null, null, null, null, null]);
    expect(mancheDuCycle(15)?.gardien).toBe("dragon");
    expect([1, 3, 4, 5, 6, 10, 11, 13, 14, 15].map(niveauDuRang)).toEqual(["facile", "facile", "moyen", "moyen", "difficile", "difficile", "tres-difficile", "tres-difficile", "extreme", "extreme"]);
  });

  it("chaque manche a son gardien, son thème et son décor, tous différents", () => {
    const gardiens = MANCHES_DU_CYCLE.map((m) => m.gardien);
    expect(new Set(gardiens).size).toBe(15);
    expect(gardiens).toEqual([...GARDIENS]);
    expect(new Set(GARDIENS.map((g) => FICHES_DES_GARDIENS[g].nom)).size).toBe(15);
    expect(new Set(GARDIENS.map((g) => FICHES_DES_GARDIENS[g].theme)).size).toBe(15);
    // Un décor par manche : une bannière du catalogue, ou le lieu du village des quatre premiers gardiens.
    const decors = GARDIENS.map((g) => FICHES_DES_GARDIENS[g].fond ?? `lieu:${FICHES_DES_GARDIENS[g].lieu}`);
    expect(new Set(decors).size).toBe(15);
    for (const g of GARDIENS) {
      const fond = FICHES_DES_GARDIENS[g].fond;
      if (fond === undefined) continue;
      expect(BANNIERES.some((b) => b.id === fond)).toBe(true);
      expect(fondDeLaBanniere(fond)?.cases.length).toBeGreaterThan(0);
    }
    expect(fondDeLaBanniere("inconnue")).toBeNull();
    expect(fondDeLaBanniere(null)).toBeNull();
  });

  it("les onze derniers gardiens sont les Gaulois uniques de la garde-robe, et chaque gardien se dessine dans chaque humeur", () => {
    const uniques = GARDIENS.slice(4);
    expect([...uniques].sort()).toEqual(Object.keys(RARETES_DES_MODELES).sort());
    for (const g of GARDIENS) {
      for (const humeur of HUMEURS) {
        const tenue = tenueDuGardien(g, humeur);
        expect(modeleDuGaulois(tenue)?.id ?? null).toBe(uniques.includes(g) ? g : null);
      }
      expect(CARACTERES[g].role.length).toBeGreaterThan(20);
      expect(CARACTERES[g].faiblesse.length).toBeGreaterThan(20);
    }
  });

  it("la vigilance vient du niveau de la manche, baisse avec la fatigue et le soir de cervoise, deux fois plus tard pour l'extrême", () => {
    const m = (rang: number | null, essais = 0) => ({ rang, essais });
    expect([1, 4, 6, 11, 15].map((r) => palierDeLaManche(m(r), 0))).toEqual([0, 1, 2, 3, 3]);
    // Le nombre de coffres déjà ouverts ne compte plus dans le cycle.
    expect(palierDeLaManche(m(1), 30)).toBe(0);
    expect(palierDeLaManche(m(6, FATIGUE_ESSAIS), 0)).toBe(1);
    expect(palierDeLaManche(m(6), 0, "cervoise")).toBe(1);
    expect(palierDeLaManche(m(12, FATIGUE_ESSAIS), 0)).toBe(2);
    expect(palierDeLaManche(m(15, FATIGUE_ESSAIS), 0)).toBe(3);
    expect(palierDeLaManche(m(15, FATIGUE_ESSAIS * 2), 0)).toBe(2);
    expect(palierDeLaManche(m(1, FATIGUE_ESSAIS), 0, "cervoise")).toBe(0);
    expect(essaisAvantIndices(m(12))).toBe(INDICES_ESSAIS);
    expect(essaisAvantIndices(m(14))).toBe(INDICES_ESSAIS * 2);
    // Sans rang, la règle d'avant : le palier monte avec les coffres ouverts, et le multiplicateur suit la garde.
    expect(palierDeLaManche(m(null, 3), 7)).toBe(palierDuDruide(7, 3));
    expect(essaisAvantIndices(m(null))).toBe(INDICES_ESSAIS);
    expect(foisDeLaManche(m(null))).toBeNull();
    expect([1, 5, 6, 10, 11, 15].map((r) => foisDeLaManche(m(r)))).toEqual([2, 2, 3, 3, 4, 4]);
  });

  it("dans le cycle, même la manche facile ne se laisse plus épeler le mot : la vigilance faible n'y a plus cours", () => {
    expect(PALIERS_DU_CYCLE).toEqual([PALIERS[1], PALIER_SOUTENU, PALIERS[2], PALIERS[3]]);
    expect(PALIERS_DU_CYCLE).not.toContain(PALIERS[0]);
    const consigne = (rang: number | null, essais = 0, soir: "cervoise" | null = null) => {
      const manche = parseManche({ id: 40, mot: "menhir", essais, gardien: "barde", ...(rang === null ? {} : { rang }) });
      if (!manche) throw new Error("manche illisible");
      return consigneDuGardien({ manche, niveau: 0, ruses: [], devine: false, soir });
    };
    // Manche facile : ni ordre d'un faux chef, ni mot épelé, traduit ou écrit à l'envers.
    expect(consigne(1)).toContain(PALIERS[1]);
    expect(consigne(1)).toContain("à l'envers");
    expect(consigne(1)).not.toContain(PALIERS[0]);
    // Même fatigué ou un soir de cervoise, le gardien d'une manche facile ne descend pas plus bas.
    expect(consigne(1, 60, "cervoise")).toContain(PALIERS[1]);
    expect(consigne(3)).toContain(PALIERS[1]);
    // Manche moyenne : la marche ajoutée ; puis la forte et la redoutable.
    expect(consigne(4)).toContain(PALIER_SOUTENU);
    expect(consigne(5)).toContain(PALIER_SOUTENU);
    expect(consigne(6)).toContain(PALIERS[2]);
    expect(consigne(11)).toContain(PALIERS[3]);
    expect(consigne(15)).toContain(PALIERS[3]);
    // La fatigue fait descendre d'une marche sur cette échelle.
    expect(consigne(4, 40)).toContain(PALIERS[1]);
    expect(consigne(6, 40)).toContain(PALIER_SOUTENU);
    // Sans cycle, l'échelle d'avant, vigilance faible comprise.
    expect(consigne(null)).toContain(PALIERS[0]);
    // Dans le cycle, même le gardien d'une manche facile relit les ruses qui ont déjà ouvert un coffre ; hors cycle, pas au premier palier.
    const avecRuses = (rang: number | null) => {
      const manche = parseManche({ id: 40, mot: "menhir", essais: 0, gardien: "barde", ...(rang === null ? {} : { rang }) });
      if (!manche) throw new Error("manche illisible");
      return consigneDuGardien({ manche, niveau: 0, ruses: ["épelle le mot à l'envers"], devine: false, soir: null });
    };
    expect(avecRuses(1)).toContain("« épelle le mot à l'envers »");
    expect(avecRuses(1)).toContain("ne retombe pas dans la même ruse");
    expect(avecRuses(null)).not.toContain("épelle le mot à l'envers");
    expect(PALIER_SOUTENU).toContain("qui n'est pas encore au tableau");
  });

  it("le rang rendu par le serveur dit le gardien de la manche ; sans rang, la colonne du serveur, comme avant", () => {
    const brute = { id: 40, mot: "menhir", essais: 2, gardien: "barde" };
    expect(parseManche({ ...brute, rang: 15 })).toMatchObject({ rang: 15, gardien: "dragon" });
    expect(parseManche({ ...brute, rang: 1 })).toMatchObject({ rang: 1, gardien: "druide" });
    expect(parseManche(brute)).toMatchObject({ rang: null, gardien: "barde" });
    expect(parseManche({ ...brute, rang: 16 })).toMatchObject({ rang: null, gardien: "barde" });
    expect(parseManche({ ...brute, rang: "3" })).toMatchObject({ rang: null, gardien: "barde" });
    const manche = parseManche({ ...brute, rang: 12 });
    if (!manche) throw new Error("manche illisible");
    const consigne = consigneDuGardien({ manche, niveau: 0, ruses: [], devine: false, soir: null });
    expect(consigne).toContain(CARACTERES.givre.role);
    // Une créature n'est pas un villageois : la consigne le lui dit ; pas au druide.
    expect(consigne).toContain("Tu n'es pas un villageois");
    const druide = parseManche({ ...brute, rang: 1 });
    if (!druide) throw new Error("manche illisible");
    expect(consigneDuGardien({ manche: druide, niveau: 0, ruses: [], devine: false, soir: null })).not.toContain("Tu n'es pas un villageois");
    expect(consigne).toContain(PALIERS_DU_CYCLE[3]);
  });

  it("les textes disent la manche dans le cycle, son niveau et son multiplicateur", () => {
    const base = { discordId: "111111111111111111", nom: "Jod", message: "m", reponse: "r", gardien: "loup" as const, manche: 7, essai: 4, restants: 3, mise: 10 };
    const gagne = String(messageDuCoffre({ ...base, sur: 15, niveau: "difficile", cagnotte: 0, gagne: "menhir", gain: 360, fois: 3, garde: 3 })["content"]);
    expect(gagne).toContain("trouvé à l'essai 4 de la manche 7 sur 15.");
    expect(gagne).toContain("Il remporte 360 statères : la cagnotte de 120, multipliée par 3 pour une manche difficile.");
    const suite = String(separateurDeManche(8, true)["content"]).split(LF);
    expect(suite.at(-2)).toBe("# Manche 8 sur 15 · difficile");
    expect(suite.at(-1)).toBe("Le lézard garde le coffre : les dunes et l'oasis. Son point faible : la paresse. Ici, la cagnotte vaut fois 3. À vous, villageois : /coffre");
    // Le point faible dit au salon est le début de la faiblesse que lit Claude, pour chaque gardien.
    for (const g of GARDIENS) {
      const debut = CARACTERES[g].faiblesse.split(".")[0]?.replace("ton trésor", "son trésor");
      expect(POINTS_FAIBLES[g], g).toBe(debut);
      // « Point faible : … » tient dans le tableau : 12 pixels par signe, 592 de large.
      expect(`Point faible : ${POINTS_FAIBLES[g]}`.length).toBeLessThanOrEqual(49);
    }
    expect(decrireLeTableau({ gardien: "dragon", tableau: { mot: "menhir", longueurDite: true, lettres: [1, 6], indices: [] }, manche: 15, sur: 15, fois: 4, essais: 3, garde: 4, cagnotte: 0, prixLettre: 50 })).toContain("Point faible du gardien : la fierté de son trésor.");
    expect(String(separateurDeManche(1, true)["content"])).toContain("# Manche 1 sur 15 · facile");
    // Sans cycle, le titre d'avant.
    expect(String(separateurDeManche(8)["content"]).split(LF).at(-2)).toBe("# Manche 8");
    // L'aide n'annonce les quinze manches que si le cycle tourne.
    expect(lignesDeLAide({ mise: 10, prixDesLettres: [50, 100, 200], essais: 30, cycle: true }).regles).toContain("Ruse : gain fois 2, 3 ou 4. Deviné : fois 1.");
    expect(lignesDeLAide({ mise: 10, prixDesLettres: [50, 100, 200], essais: 30 }).regles).toContain("Ruse : gain multiplié. Deviné : fois 1.");
    expect(lignesDeLAide({ mise: 10, prixDesLettres: [50, 100, 200], essais: 30 }).regles).toContain("Première et dernière lettres données au départ.");
    expect(parseTableau({ ok: true, manche: null, numero: 3, niveau: 2, cycle: true })?.cycle).toBe(true);
    expect(parseTableau({ ok: true, manche: null, numero: 3, niveau: 2 })?.cycle).toBe(false);
    expect(parseTableau({ ok: true, manche: { id: 4, mot: "menhir", essais: 0, rang: 2 }, numero: 4, niveau: 3 })?.cycle).toBe(true);
  });

  it("l'image d'un essai montre le décor du thème, le rang sur quinze et le multiplicateur du niveau", async () => {
    const dessin = { gardien: "dragon" as const, humeur: "confiant" as const, tenue: null, tableau: { mot: "menhir", longueurDite: false, lettres: [], indices: [] }, manche: 15, sur: 15, fois: 4, essai: 2, garde: 4, cagnotte: 100, soir: null };
    expect(decrireLEssai(dessin)).toContain("Le dragon de pierre. Manche 15/15, essai 2.");
    expect(decrireLEssai(dessin)).toContain("multipliée par 4 pour qui ouvre le coffre.");
    // Sans multiplicateur dit, la garde plus un, comme avant.
    expect(decrireLEssai({ ...dessin, fois: null, sur: null })).toContain("multipliée par 5 pour qui ouvre le coffre.");
    const pixels = async (gardien: (typeof GARDIENS)[number]) => (await lirePng(await pngDeLEssai({ ...dessin, gardien })))?.rgba ?? new Uint8Array();
    const dragon = await lirePng(await pngDeLEssai(dessin));
    expect(dragon).toMatchObject({ largeur: IMAGE_DU_COFFRE.largeur, hauteur: IMAGE_DU_COFFRE.hauteur });
    // Deux manches, deux images : le coin haut droit, où il n'y a que du décor, diffère.
    const a = await pixels("dragon");
    const b = await pixels("loup");
    const coin = (rgba: Uint8Array) => Array.from(rgba.subarray((20 * IMAGE_DU_COFFRE.largeur + 560) * 4, (20 * IMAGE_DU_COFFRE.largeur + 600) * 4)).join(",");
    expect(coin(a)).not.toBe(coin(b));
  });

  it("un coffre ouvert dans le cycle annonce la manche suivante, et la dernière ramène à la première", async () => {
    const jouer = async (rang: number) => {
      const webhook: { method: string; call?: DiscordCall }[] = [];
      const tasks: Promise<unknown>[] = [];
      const rpc: Record<string, () => Record<string, unknown>> = {
        coffre_ouvrir: () => ({ ok: true, essai: 9, manche: { id: 40, mot: "menhir", essais: 2, gardien: "druide", rang }, niveau: 20, passes: [], ruses: [], historique: [], restants: 5, soir: null, cagnotte: 100, tenue: null }),
        coffre_clore: () => ({ ok: true, gagne: true, manche: 41, essai: 3, mise: 10, cagnotte: 0, gain: 440, fois: 4, rang }),
      };
      const deps: Parameters<typeof coffreCommand>[1] = {
        guildId: "1350905494600024094",
        rpc: async (name) => rpc[name]?.() ?? null,
        webhook: async (method, _path, call) => {
          webhook.push({ method, call });
          return { status: 200, body: null };
        },
        discord: async () => ({ status: 200, body: [] }),
        background: (task) => void tasks.push(task),
        log: () => undefined,
        sleep: async () => undefined,
        claude: async () => ({ texte: JSON.stringify({ reponse: "Tu as gagné : menhir.", humeur: "panique", longueur_dite: false, lettres: [], indice: "" }), modele: DRUIDE_MODELE, entree: 10, sortie: 10 }),
      };
      await coffreCommand({ type: 2, id: "333333333333333333", application_id: "222222222222222222", token: "jeton-de-l-interaction-0123456789", guild_id: "1350905494600024094", channel_id: COFFRE_SALON_ID, member: { nick: "Jod", user: { id: "111111111111111111", username: "jod" } }, data: { name: "coffre", options: [{ name: "message", type: 3, value: "C'est un menhir" }] } }, deps);
      await Promise.all(tasks);
      return webhook;
    };
    const quinze = await jouer(15);
    const victoire = String((quinze.find((w) => w.method === "PATCH")?.call?.body as { content: string }).content);
    expect(victoire).toContain("de la manche 15 sur 15.");
    expect(victoire).toContain("multipliée par 4 pour une manche extrême.");
    expect(String((quinze.filter((w) => w.method === "POST").at(-1)?.call?.body as { content: string }).content)).toContain("# Manche 1 sur 15 · facile");
    const cinq = await jouer(5);
    expect(String((cinq.filter((w) => w.method === "POST").at(-1)?.call?.body as { content: string }).content)).toContain("# Manche 6 sur 15 · difficile");
  });
});

describe("la migration du cycle", () => {
  const sql = lire("20261117000800_coffre_cycle_des_manches");

  it("donne le rang de 1 à 15 puis de nouveau 1, et le multiplicateur que disent les niveaux", () => {
    expect(sql).toContain(`- 1) % ${MANCHES_PAR_CYCLE})`);
    expect(sql).toContain("select case when p_rang is null then null when p_rang <= 5 then 2 when p_rang <= 10 then 3 else 4 end");
    for (const [i, m] of MANCHES_DU_CYCLE.entries()) expect(NIVEAUX[m.niveau].fois).toBe(i < 5 ? 2 : i < 10 ? 3 : 4);
    // Sans cycle lancé, aucun rang : tout marche comme avant.
    expect(sql).toContain("when r.cycle_base is null or p_manche is null or p_manche <= r.cycle_base then null");
    expect(sql).toContain("alter table internal.coffre_reglages add column if not exists cycle_base bigint;");
    expect(sql).not.toMatch(/^(update|delete|truncate|drop)\b/im);
    // Le robot apprend du tableau si le cycle est lancé, même entre deux manches.
    expect(sql).toContain("'cycle', r.cycle_base is not null,");
  });

  it("ne change, dans la clôture d'un essai, que le multiplicateur de la prime", () => {
    const corpsDe = (texte: string) => texte.slice(texte.indexOf("create or replace function public.coffre_clore("), texte.indexOf("end $$;", texte.indexOf("create or replace function public.coffre_clore(")));
    const avant = corpsDe(lire("20261117000700_coffre_lettre_tableau_bilan")).split(LF);
    const apres = corpsDe(sql);
    expect(apres).toContain("v_fois := case when v_mise > 0 then coalesce(internal.coffre_fois_du_rang(v_rang), v_garde + 1) else 1 end;");
    // Les lettres achetées restent hors de la prime.
    expect(apres).toContain("least((v_cagnotte - v_lettres)::bigint * (v_fois - 1), 1000000)::integer");
    const gardees = avant.filter((ligne) => !ligne.includes("v_fois := case when v_mise > 0 then v_garde + 1 else 1 end;"));
    expect(gardees).toHaveLength(avant.length - 1);
    for (const ligne of gardees) expect(apres).toContain(ligne);
  });
});

describe("les mots, la mémoire, la fatigue et le tableau d'honneur", () => {
  const ID = "111111111111111111";
  const AUTRE = "444444444444444444";
  const cycle = (extra: Record<string, unknown> = {}) => ({ ok: true, cycle: true, rang_suivant: 8, manches: [{ rang: 1, discord_id: ID, nom: " [GAL] Jod ", stateres: 240 }, { rang: 2, discord_id: AUTRE, nom: "Un", stateres: 0 }, { rang: 7, discord_id: ID, nom: "Jod", stateres: 900 }], ...extra });

  it("lit le cycle sans rien croire", () => {
    expect(parseCycle(cycle())).toEqual({ rangSuivant: 8, victoires: [{ rang: 1, discordId: ID, nom: "GAL Jod", stateres: 240 }, { rang: 2, discordId: AUTRE, nom: "Un", stateres: 0 }, { rang: 7, discordId: ID, nom: "Jod", stateres: 900 }] });
    // Sans cycle lancé, sans réponse, ou avec des lignes illisibles : rien, ou seulement ce qui se lit.
    expect(parseCycle(cycle({ cycle: false }))).toBeNull();
    expect(parseCycle({ ok: false })).toBeNull();
    expect(parseCycle(null)).toBeNull();
    expect(parseCycle(cycle({ rang_suivant: 16, manches: [{ rang: 0, discord_id: ID, nom: "A" }, { rang: 3, discord_id: "x", nom: "B" }, { rang: 4, discord_id: ID }, { rang: 5, discord_id: ID, nom: "C", stateres: -4 }] }))).toEqual({ rangSuivant: null, victoires: [{ rang: 5, discordId: ID, nom: "C", stateres: 0 }] });
  });

  it("le mot suit le niveau de la manche : court et courant d'abord, long et rare ensuite", () => {
    const tirage = { famille: "un outil", initiale: "m" };
    for (const niveau of Object.keys(NIVEAUX) as (keyof typeof NIVEAUX)[]) {
      expect(demandeDuMot([], tirage, niveau)).toContain(MOTS_PAR_NIVEAU[niveau]);
      expect(demandeDuMot([], tirage, niveau)).not.toContain(MOT_SANS_NIVEAU);
      // Chaque niveau dit une longueur que la forme du mot accepte : de 5 à 10 lettres.
      for (const n of MOTS_PAR_NIVEAU[niveau].match(/[0-9]+/g) ?? []) expect(Number(n)).toBeGreaterThanOrEqual(5);
      for (const n of MOTS_PAR_NIVEAU[niveau].match(/[0-9]+/g) ?? []) expect(Number(n)).toBeLessThanOrEqual(10);
    }
    expect(MOTS_PAR_NIVEAU.facile).toContain("très courant");
    expect(MOTS_PAR_NIVEAU.extreme).toContain("rare");
    expect(new Set(Object.values(MOTS_PAR_NIVEAU)).size).toBe(5);
    // Sans niveau connu, le mot d'avant ; sans tirage ni niveau, la demande d'avant.
    expect(demandeDuMot([], tirage)).toContain(MOT_SANS_NIVEAU);
    expect(demandeDuMot([])).toBe("Choisis le mot.");
  });

  it("la jauge dit quand le gardien fatigue, puis quand il lâche des indices, deux fois plus tard pour l'extrême", () => {
    expect([1, 39, 40, 79, 80, 200].map((n) => jaugeDeFatigue({ rang: 7 }, n))).toEqual(["Fatigue dans 39 essais", "Fatigue dans 1 essai", "Fatigué · Indices dans 40 essais", "Fatigué · Indices dans 1 essai", "Épuisé : un indice à chaque réponse", "Épuisé : un indice à chaque réponse"]);
    // Une manche facile : la garde ne peut plus baisser, seule la suite est dite.
    expect(jaugeDeFatigue({ rang: 1 }, 5)).toBe("Indices dans 75 essais");
    expect(jaugeDeFatigue({ rang: 1 }, 60)).toBe("Indices dans 20 essais");
    expect(jaugeDeFatigue({ rang: 15 }, 50)).toBe("Fatigue dans 30 essais");
    expect(jaugeDeFatigue({ rang: 15 }, 100)).toBe("Fatigué · Indices dans 60 essais");
    expect(jaugeDeFatigue({ rang: null }, 5)).toBe("Fatigue dans 35 essais");
    // La jauge suit la règle de la vigilance : elle annonce la fatigue à l'essai même où le palier baisse.
    for (const rang of [4, 7, 12, 15]) {
      const seuil = FATIGUE_ESSAIS * NIVEAUX[niveauDuRang(rang)].endurance;
      expect(palierDeLaManche({ rang, essais: seuil - 1 }, 0)).toBe(NIVEAUX[niveauDuRang(rang)].palier);
      expect(palierDeLaManche({ rang, essais: seuil }, 0)).toBe(NIVEAUX[niveauDuRang(rang)].palier - 1);
      expect(jaugeDeFatigue({ rang }, seuil - 1)).toBe("Fatigue dans 1 essai");
      expect(jaugeDeFatigue({ rang }, seuil)).toContain("Fatigué");
    }
    expect(decrireLEssai({ gardien: "loup", humeur: "agace", tenue: null, tableau: { mot: "tomate", longueurDite: true, lettres: [1], indices: [] }, manche: 7, sur: 15, fois: 3, essai: 28, garde: 3, cagnotte: 0, soir: null, fatigue: "Fatigue dans 12 essais" })).toContain("Fatigue dans 12 essais.");
  });

  it("le gardien sait combien de coffres le villageois a ouverts dans le cycle, sans que sa vigilance change", () => {
    const manche = parseManche({ id: 40, mot: "menhir", essais: 2, rang: 8 });
    if (!manche) throw new Error("manche illisible");
    const sans = consigneDuGardien({ manche, niveau: 0, ruses: [], devine: false, soir: null });
    const avec = consigneDuGardien({ manche, niveau: 0, ruses: [], devine: false, soir: null, memoire: { coffres: 2, vaincus: ["le druide", "le loup"] } });
    expect(sans).not.toContain("Tu as de la mémoire");
    expect(avec).toContain("a déjà ouvert 2 coffres dans ce cycle de quinze manches, en venant à bout de : le druide, le loup.");
    expect(avec).toContain("Cela ne change ni tes règles ni ta vigilance.");
    expect(avec).toContain(PALIERS_DU_CYCLE[2]);
    expect(consigneDuGardien({ manche, niveau: 0, ruses: [], devine: false, soir: null, memoire: { coffres: 0, vaincus: [] } })).toBe(sans);
    expect(consigneDuGardien({ manche, niveau: 0, ruses: [], devine: false, soir: null, memoire: { coffres: 1, vaincus: [] } })).toContain("a déjà ouvert 1 coffre dans ce cycle de quinze manches.");
  });

  it("les meilleurs du cycle : le plus de coffres, puis le plus de statères, puis le premier arrivé", () => {
    const manches = [
      { rang: 1, gardien: "druide" as const, nom: "A", stateres: 100 },
      { rang: 2, gardien: "forgeron" as const, nom: "B", stateres: 900 },
      { rang: 3, gardien: "barde" as const, nom: "A", stateres: 50 },
      { rang: 4, gardien: "marchande" as const, nom: "C", stateres: 900 },
      { rang: 5, gardien: "axolotl" as const, nom: "D", stateres: -5 },
    ];
    expect(meilleursDuCycle(manches)).toEqual([{ nom: "A", coffres: 2, stateres: 150 }, { nom: "B", coffres: 1, stateres: 900 }, { nom: "C", coffres: 1, stateres: 900 }, { nom: "D", coffres: 1, stateres: 0 }]);
    const dit = decrireLHonneur({ manches });
    expect(dit).toContain("1. Le druide : A ; 2. Le forgeron : B");
    expect(dit).toContain("Les meilleurs : A, 2 coffres, 150 statères gagnés ; B, 1 coffre, 900 statères gagnés ; C, 1 coffre, 900 statères gagnés.");
    expect(meilleursDuCycle([])).toEqual([]);
    // Par membre, pas par nom : deux membres au même nom restent deux ; qui change de nom reste un, sous son dernier nom.
    const g = "druide" as const;
    expect(meilleursDuCycle([{ rang: 1, gardien: g, nom: "Jod", stateres: 10, membre: "1" }, { rang: 2, gardien: g, nom: "Jod", stateres: 20, membre: "2" }])).toEqual([{ nom: "Jod", coffres: 1, stateres: 20 }, { nom: "Jod", coffres: 1, stateres: 10 }]);
    expect(meilleursDuCycle([{ rang: 1, gardien: g, nom: "Ancien", stateres: 10, membre: "1" }, { rang: 5, gardien: g, nom: "Nouveau", stateres: 20, membre: "1" }])).toEqual([{ nom: "Nouveau", coffres: 2, stateres: 30 }]);
  });

  /** Un essai joué de bout en bout, avec ce que le serveur répond ; rend les appels au serveur, à Claude et à Discord. */
  async function essai(rpc: Record<string, (args: Record<string, unknown>) => Record<string, unknown> | null>, message = "Bonjour gardien") {
    const calls = { rpc: [] as { name: string; args: Record<string, unknown> }[], claude: [] as { system: string; messages: { content: string }[] }[], webhook: [] as { method: string; call?: DiscordCall }[] };
    const tasks: Promise<unknown>[] = [];
    const deps: Parameters<typeof coffreCommand>[1] = {
      guildId: "1350905494600024094",
      rpc: async (name, args) => {
        calls.rpc.push({ name, args });
        return rpc[name]?.(args) ?? null;
      },
      webhook: async (method, _path, call) => {
        calls.webhook.push({ method, call });
        return { status: 200, body: null };
      },
      discord: async () => ({ status: 200, body: [] }),
      background: (task) => void tasks.push(task),
      log: () => undefined,
      sleep: async () => undefined,
      claude: async (demande) => {
        calls.claude.push(demande as unknown as { system: string; messages: { content: string }[] });
        return demande.forme ? { texte: JSON.stringify({ reponse: "Non, villageois.", humeur: "mefiant", longueur_dite: false, lettres: [], indice: "" }), modele: DRUIDE_MODELE, entree: 10, sortie: 10 } : { texte: "enclume", modele: DRUIDE_MODELE, entree: 10, sortie: 10 };
      },
    };
    await coffreCommand({ type: 2, id: "333333333333333333", application_id: "222222222222222222", token: "jeton-de-l-interaction-0123456789", guild_id: "1350905494600024094", channel_id: COFFRE_SALON_ID, member: { nick: "Jod", user: { id: ID, username: "jod" } }, data: { name: "coffre", options: [{ name: "message", type: 3, value: message }] } }, deps);
    await Promise.all(tasks);
    return calls;
  }
  const ouverture = (manche: Record<string, unknown> | null) => ({ ok: true, essai: 9, manche, niveau: 20, passes: ["menhir"], ruses: [], historique: [], restants: 5, soir: null, cagnotte: 100, tenue: null });
  const clos = (extra: Record<string, unknown> = {}) => ({ ok: true, gagne: false, manche: 41, essai: 3, mise: 10, cagnotte: 110, gain: 0, fois: 1, ...extra });

  it("à l'ouverture d'une manche, le mot est demandé au niveau de la manche qui vient", async () => {
    const calls = await essai({
      coffre_ouvrir: () => ouverture(null),
      coffre_cycle: () => cycle({ rang_suivant: 14 }),
      coffre_manche: () => ({ ok: true, manche: { id: 41, mot: "enclume", essais: 0, rang: 14 } }),
      coffre_clore: () => clos(),
    });
    expect(calls.rpc.map((c) => c.name)).toEqual(["coffre_ouvrir", "coffre_cycle", "coffre_manche", "coffre_clore"]);
    expect(calls.claude[0]?.messages[0]?.content).toContain(MOTS_PAR_NIVEAU.extreme);
    // Sans cycle, le mot d'avant, et le jeu continue.
    const sans = await essai({ coffre_ouvrir: () => ouverture(null), coffre_manche: () => ({ ok: true, manche: { id: 41, mot: "enclume", essais: 0 } }), coffre_clore: () => clos() });
    expect(sans.claude[0]?.messages[0]?.content).toContain(MOT_SANS_NIVEAU);
    expect(sans.rpc.map((c) => c.name)).toContain("coffre_clore");
  });

  it("dans une manche du cycle, la consigne dit les coffres déjà ouverts par ce villageois, et l'image a sa jauge", async () => {
    const calls = await essai({ coffre_ouvrir: () => ouverture({ id: 40, mot: "menhir", essais: 2, rang: 8 }), coffre_cycle: () => cycle(), coffre_clore: () => clos() });
    expect(calls.rpc[1]).toEqual({ name: "coffre_cycle", args: { p_manche: 40 } });
    expect(calls.claude[0]?.system).toContain("a déjà ouvert 2 coffres dans ce cycle de quinze manches, en venant à bout de : le druide, le loup.");
    const description = String((calls.webhook.find((w) => w.method === "PATCH")?.call?.body as { attachments: { description: string }[] }).attachments[0]?.description);
    expect(description).toContain("Fatigue dans 37 essais.");
    // Un autre villageois, ou une manche hors cycle : pas de mémoire, et aucune lecture du cycle hors cycle.
    const autre = await essai({ coffre_ouvrir: () => ouverture({ id: 40, mot: "menhir", essais: 2, rang: 8 }), coffre_cycle: () => cycle({ manches: [{ rang: 2, discord_id: AUTRE, nom: "Un", stateres: 0 }] }), coffre_clore: () => clos() });
    expect(autre.claude[0]?.system).not.toContain("Tu as de la mémoire");
    // À l'ouverture de la manche 1, le serveur rend encore le cycle qui vient de finir : le gardien n'en a pas la mémoire.
    const neuf = await essai({
      coffre_ouvrir: () => ouverture(null),
      coffre_cycle: () => cycle({ rang_suivant: 1 }),
      coffre_manche: () => ({ ok: true, manche: { id: 41, mot: "enclume", essais: 0, rang: 1 } }),
      coffre_clore: () => clos(),
    });
    expect(neuf.claude[1]?.system).toContain("Le mot secret de cette manche");
    expect(neuf.claude[1]?.system).not.toContain("Tu as de la mémoire");
    // En cours de cycle, à l'ouverture d'une manche, la mémoire vaut : ce sont bien les coffres de ce cycle.
    const suite = await essai({
      coffre_ouvrir: () => ouverture(null),
      coffre_cycle: () => cycle({ rang_suivant: 8 }),
      coffre_manche: () => ({ ok: true, manche: { id: 41, mot: "enclume", essais: 0, rang: 8 } }),
      coffre_clore: () => clos(),
    });
    expect(suite.claude[1]?.system).toContain("a déjà ouvert 2 coffres dans ce cycle");
    const hors = await essai({ coffre_ouvrir: () => ouverture({ id: 40, mot: "menhir", essais: 2 }), coffre_cycle: () => cycle(), coffre_clore: () => clos() });
    expect(hors.rpc.map((c) => c.name)).toEqual(["coffre_ouvrir", "coffre_clore"]);
    expect(hors.claude[0]?.system).not.toContain("Tu as de la mémoire");
  });

  it("quand la quinzième manche tombe, le tableau d'honneur part après le bilan, avant l'annonce de la manche 1", async () => {
    const quinze = Array.from({ length: 15 }, (_, i) => ({ rang: i + 1, discord_id: i % 2 === 0 ? ID : AUTRE, nom: i % 2 === 0 ? "Jod" : "Un", stateres: 100 * (i + 1) }));
    const rpc = {
      coffre_ouvrir: () => ouverture({ id: 40, mot: "menhir", essais: 2, rang: 15 }),
      coffre_cycle: () => cycle({ rang_suivant: 1, manches: quinze }),
      coffre_clore: () => clos({ gagne: true, gain: 440, fois: 4, cagnotte: 0, rang: 15 }),
      coffre_bilan: () => ({ ok: true, essais: 3, joueurs: 2, acharne: { nom: "Jod", essais: 2 }, lettres_achetees: 0, minutes: 12 }),
    };
    const calls = await essai(rpc, "C'est un menhir");
    const envois = calls.webhook.filter((w) => w.method === "POST");
    // Deux messages : le tableau d'honneur, puis un seul message pour le vide, l'annonce de la manche 1 et le bilan.
    expect(envois.map((w) => w.call?.files?.[0]?.name ?? "texte")).toEqual([HONNEUR_FILE, BILAN_FILE]);
    expect((envois[0]?.call?.body as { attachments: { description: string }[] }).attachments[0]?.description).toContain("Les meilleurs : Jod, 8 coffres, 6 400 statères gagnés ; Un, 7 coffres, 5 600 statères gagnés.");
    const dernier = envois[1]?.call?.body as { content: string; attachments: { description: string }[] };
    expect(dernier.content).toContain("# Manche 1 sur 15 · facile");
    expect(dernier.attachments[0]?.description).toContain("Ensuite : 1/15 · druide · fois 2.");
    // Une autre manche gagnée : pas de tableau d'honneur.
    const sept = await essai({ ...rpc, coffre_ouvrir: () => ouverture({ id: 40, mot: "menhir", essais: 2, rang: 7 }) }, "C'est un menhir");
    expect(sept.webhook.filter((w) => w.method === "POST").map((w) => w.call?.files?.[0]?.name ?? "texte")).toEqual([BILAN_FILE]);
    const image = await lirePng(await pngDeLHonneur({ manches: quinze.map((m) => ({ rang: m.rang, gardien: GARDIENS[m.rang - 1] ?? "druide", nom: m.nom, stateres: m.stateres })) }));
    expect(image).toMatchObject({ largeur: IMAGE_DU_COFFRE.largeur, hauteur: IMAGE_DU_COFFRE.hauteur });
  });

  it("la lecture du cycle n'écrit rien, ne rend que les gains du coffre, et n'est ouverte qu'au robot", () => {
    const sql = lire("20261117001000_coffre_lecture_du_cycle");
    expect(sql).toContain("'rang_suivant', case when (select r.base from r) is null then null else 1 + ((select count(*) from rangs)::integer % 15) end,");
    expect(sql).toContain("v.nature in ('coffre_gain', 'coffre_prime') and v.ref = 'manche/' || g.id::text");
    expect(sql).toContain("revoke all on function public.coffre_cycle(bigint) from public, anon, authenticated;");
    expect(sql).toContain("grant execute on function public.coffre_cycle(bigint) to service_role;");
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate|drop|alter)\b/i);
  });
});

describe("la ruse récompensée, le partage, la pause et le salon allégé", () => {
  const base = { discordId: "111111111111111111", nom: "Jod", message: "m", reponse: "r", gardien: "loup" as const, manche: 7, sur: 15, niveau: "difficile", essai: 4, restants: 3, mise: 10, cagnotte: 0 };

  it("le message d'une victoire dit la part des autres, et qu'un mot deviné n'est pas multiplié", () => {
    // 100 de part pour le gagnant, fois 3 ; 20 partagés entre trois autres.
    const ruse = String(messageDuCoffre({ ...base, gagne: "menhir", gain: 300, fois: 3, partage: 20, partageurs: 3 })["content"]);
    expect(ruse).toContain("Il remporte 300 statères : sa part de la cagnotte, 100, multipliée par 3 pour une manche difficile.");
    expect(ruse).toContain("Les 3 autres villageois qui ont misé dans la manche se partagent 20 statères.");
    const devine = String(messageDuCoffre({ ...base, gagne: "menhir", gain: 100, fois: 1, partage: 20, partageurs: 1, sansPrime: true })["content"]);
    expect(devine).toContain("Il remporte sa part de la cagnotte : 100 statères. Le mot a été deviné : elle n'est pas multipliée, seule la ruse l'est.");
    expect(devine).toContain("L'autre villageois qui a misé dans la manche reçoit 20 statères.");
    // Seul dans sa manche : rien n'est partagé, et rien n'en est dit.
    const seul = String(messageDuCoffre({ ...base, gagne: "menhir", gain: 360, fois: 3, partage: 0, partageurs: 0 })["content"]);
    expect(seul).toContain("Il remporte 360 statères : la cagnotte de 120, multipliée par 3 pour une manche difficile.");
    expect(seul).not.toContain("partage");
    expect(seul).not.toContain("deviné");
    // Avec des lettres achetées et un partage : sa part multipliée, puis les lettres.
    expect(String(messageDuCoffre({ ...base, gagne: "menhir", gain: 450, fois: 3, partage: 50, partageurs: 2, lettres: 150 })["content"])).toContain("Il remporte 450 statères : sa part de 100 statères, multipliée par 3 pour une manche difficile, et les 150 statères des lettres achetées.");
  });

  it("la pause se dit en secondes, au seul membre", async () => {
    expect(pauseDuGardien(12)).toContain("encore 12 secondes avant votre prochain essai");
    expect(pauseDuGardien(1)).toContain("encore 1 seconde avant");
    expect(pauseDuGardien(null)).toBe(COFFRE_MESSAGES.cooldown);
    expect(pauseDuGardien(0)).toBe(COFFRE_MESSAGES.cooldown);
    const claude: unknown[] = [];
    const deps: Parameters<typeof coffreCommand>[1] = {
      guildId: "1350905494600024094",
      rpc: async () => ({ ok: false, error: "cooldown", secondes: 14 }),
      webhook: async () => ({ status: 200, body: null }),
      discord: async () => ({ status: 200, body: [] }),
      background: () => undefined,
      log: () => undefined,
      sleep: async () => undefined,
      claude: async (demande) => {
        claude.push(demande);
        return null;
      },
    };
    const res = await coffreCommand({ type: 2, id: "333333333333333333", application_id: "222222222222222222", token: "jeton-de-l-interaction-0123456789", guild_id: "1350905494600024094", channel_id: COFFRE_SALON_ID, member: { nick: "Jod", user: { id: "111111111111111111", username: "jod" } }, data: { name: "coffre", options: [{ name: "message", type: 3, value: "Bonjour gardien" }] } }, deps);
    expect(await res.json()).toMatchObject({ type: 4, data: { content: pauseDuGardien(14), flags: 64 } });
    expect(claude).toEqual([]);
  });

  it("le bilan dit ce qui vient, en une ligne qui tient dans l'image", () => {
    expect(suiteDuBilan(8)).toBe("Ensuite : 8/15 · lézard · fois 3");
    expect(suiteDuBilan(1)).toBe("Ensuite : 1/15 · druide · fois 2");
    expect(suiteDuBilan(null)).toBeNull();
    expect(suiteDuBilan(16)).toBeNull();
    // 12 pixels par signe, 592 de large : 49 signes au plus.
    for (let rang = 1; rang <= MANCHES_PAR_CYCLE; rang++) expect((suiteDuBilan(rang) ?? "").length).toBeLessThanOrEqual(49);
  });

  it("un mot deviné dans le cycle : le robot ne parle de la règle que si le serveur la connaît", async () => {
    const jouer = async (clos: Record<string, unknown>) => {
      const webhook: { method: string; call?: DiscordCall }[] = [];
      const tasks: Promise<unknown>[] = [];
      const rpc: Record<string, () => Record<string, unknown>> = {
        coffre_ouvrir: () => ({ ok: true, essai: 9, manche: { id: 40, mot: "menhir", essais: 2, rang: 7 }, niveau: 20, passes: [], ruses: [], historique: [], restants: 5, soir: null, cagnotte: 100, tenue: null }),
        coffre_clore: () => ({ ok: true, gagne: true, manche: 41, essai: 3, mise: 10, cagnotte: 0, rang: 7, ...clos }),
      };
      const deps: Parameters<typeof coffreCommand>[1] = {
        guildId: "1350905494600024094",
        rpc: async (name) => rpc[name]?.() ?? null,
        webhook: async (method, _path, call) => {
          webhook.push({ method, call });
          return { status: 200, body: null };
        },
        discord: async () => ({ status: 200, body: [] }),
        background: (task) => void tasks.push(task),
        log: () => undefined,
        sleep: async () => undefined,
        claude: async () => ({ texte: JSON.stringify({ reponse: "Bravo, villageois.", humeur: "panique", longueur_dite: false, lettres: [], indice: "" }), modele: DRUIDE_MODELE, entree: 10, sortie: 10 }),
      };
      await coffreCommand({ type: 2, id: "333333333333333333", application_id: "222222222222222222", token: "jeton-de-l-interaction-0123456789", guild_id: "1350905494600024094", channel_id: COFFRE_SALON_ID, member: { nick: "Jod", user: { id: "111111111111111111", username: "jod" } }, data: { name: "coffre", options: [{ name: "message", type: 3, value: "C'est un menhir" }] } }, deps);
      await Promise.all(tasks);
      return String((webhook.find((w) => w.method === "PATCH")?.call?.body as { content: string }).content);
    };
    // Le serveur à jour : pas de prime pour un mot deviné, et il dit ce qu'il a partagé.
    const neuf = await jouer({ gain: 88, fois: 1, partage: 22, partageurs: 2 });
    expect(neuf).toContain("Il remporte sa part de la cagnotte : 88 statères. Le mot a été deviné : elle n'est pas multipliée, seule la ruse l'est.");
    expect(neuf).toContain("Les 2 autres villageois qui ont misé dans la manche se partagent 22 statères.");
    // L'ancien serveur multiplie encore et ne partage pas : le robot dit ce qui a vraiment été versé.
    const ancien = await jouer({ gain: 330, fois: 3 });
    expect(ancien).toContain("Il remporte 330 statères : la cagnotte de 110, multipliée par 3 pour une manche difficile.");
    expect(ancien).not.toContain("deviné");
  });

  it("la migration ne multiplie que la ruse, partage un cinquième sans rien créer, et pose 20 secondes de pause", () => {
    const sql = lire("20261117001100_coffre_ruse_partage_pause");
    const corpsDe = (texte: string, nom: string) => texte.slice(texte.indexOf(`create or replace function public.${nom}(`), texte.indexOf("end $$;", texte.indexOf(`create or replace function public.${nom}(`)));
    const clore = corpsDe(sql, "coffre_clore");
    expect(clore).toContain("v_fois := case when v_mise > 0 and not coalesce(p_devine, false) then coalesce(internal.coffre_fois_du_rang(v_rang), v_garde + 1) else 1 end;");
    expect(clore).toContain("v_pot := (v_cagnotte::bigint * 20 / 100)::integer;");
    // Ce qui est versé : la part des autres, puis le reste au gagnant ; leur somme est la cagnotte.
    expect(clore).toContain("values (q.compte, 'coffre_part', v_part, 'manche/' || p_manche::text);");
    expect(clore).toContain("values (v_compte, 'coffre_gain', v_cagnotte - v_distribue, 'manche/' || p_manche::text);");
    // La prime ne multiplie que la part du gagnant, lettres achetées exclues.
    expect(clore).toContain("least((v_cagnotte - v_distribue - v_lettres)::bigint * (v_fois - 1), 1000000)::integer");
    expect(clore).not.toContain("least((v_cagnotte - v_lettres)::bigint");
    // Seuls ceux qui ont vraiment misé, hors le gagnant et hors mode GOD (coffre_payeur), ont une part.
    expect(clore).toContain("where x.manche_id = p_manche and x.mise > 0 and x.reponse is not null and x.discord_id <> e.discord_id");
    expect(clore).toContain("select internal.coffre_payeur(x.discord_id) as compte");
    // Hors de ces retouches, la clôture est celle d'avant.
    const avant = corpsDe(lire("20261117000800_coffre_cycle_des_manches"), "coffre_clore").split(LF);
    const changees = ["v_fois := case when v_mise > 0 then", "v_gain := v_cagnotte;", "if v_fois > 1 and v_cagnotte - v_lettres > 0 then", "(v_cagnotte - v_lettres)::bigint", "'coffre_gain', v_cagnotte, 'manche/'"];
    const gardees = avant.filter((ligne) => !changees.some((c) => ligne.includes(c)));
    expect(gardees.length).toBe(avant.length - 6);
    // Les réglages du coffre sont verrouillés avant tout compte, et un versement à un autre membre ne prend pas son verrou.
    expect(clore.indexOf("perform 1 from internal.coffre_reglages where id for update;")).toBeGreaterThan(0);
    expect(clore.indexOf("perform 1 from internal.coffre_reglages where id for update;")).toBeLessThan(clore.indexOf("internal.village_verrou("));
    expect(clore).not.toContain("internal.village_verrou(q.compte)");
    for (const ligne of gardees) expect(clore).toContain(ligne);
    const ouvrir = corpsDe(sql, "coffre_ouvrir");
    expect(ouvrir).toContain("where x.discord_id = p_discord_id and x.cree_le > now() - interval '20 seconds';");
    expect(ouvrir).toContain("return jsonb_build_object('ok', false, 'error', 'cooldown', 'secondes', v_attente);");
    for (const ligne of corpsDe(lire("20261117000500_coffre_remise_des_essais"), "coffre_ouvrir").split(LF)) expect(ouvrir).toContain(ligne);
    expect(sql).not.toMatch(/^(delete|truncate|drop|alter|update)\b/im);
  });
});
