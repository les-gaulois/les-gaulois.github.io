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
  niveauDuRang,
  PALIERS,
  palierDeLaManche,
  palierDuDruide,
  parseManche,
  parseTableau,
  separateurDeManche,
} from "../../supabase/functions/code-discord/coffre";
import { decrireLEssai, FICHES_DES_GARDIENS, GARDIENS, HUMEURS, IMAGE_DU_COFFRE, lignesDeLAide, pngDeLEssai, tenueDuGardien } from "../../supabase/functions/code-discord/coffre-image";
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
    expect(consigne).toContain(PALIERS[3]);
  });

  it("les textes disent la manche dans le cycle, son niveau et son multiplicateur", () => {
    const base = { discordId: "111111111111111111", nom: "Jod", message: "m", reponse: "r", gardien: "loup" as const, manche: 7, essai: 4, restants: 3, mise: 10 };
    const gagne = String(messageDuCoffre({ ...base, sur: 15, niveau: "difficile", cagnotte: 0, gagne: "menhir", gain: 360, fois: 3, garde: 3 })["content"]);
    expect(gagne).toContain("trouvé à l'essai 4 de la manche 7 sur 15.");
    expect(gagne).toContain("Il remporte 360 statères : la cagnotte de 120, multipliée par 3 pour une manche difficile.");
    const suite = String(separateurDeManche(8, true)["content"]).split(LF);
    expect(suite.at(-2)).toBe("# Manche 8 sur 15 · difficile");
    expect(suite.at(-1)).toBe("Le lézard garde le coffre : les dunes et l'oasis. Ici, la cagnotte vaut fois 3. À vous, villageois : /coffre");
    expect(String(separateurDeManche(1, true)["content"])).toContain("# Manche 1 sur 15 · facile");
    // Sans cycle, le titre d'avant.
    expect(String(separateurDeManche(8)["content"]).split(LF).at(-2)).toBe("# Manche 8");
    // L'aide n'annonce les quinze manches que si le cycle tourne.
    expect(lignesDeLAide({ mise: 10, prixDesLettres: [50, 100, 200], essais: 30, cycle: true }).regles).toContain("15 manches : fois 2, fois 3, puis fois 4.");
    expect(lignesDeLAide({ mise: 10, prixDesLettres: [50, 100, 200], essais: 30 }).regles).toContain("Plus le gardien se méfie, plus elle vaut.");
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
