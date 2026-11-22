import { describe, expect, it } from "vitest";
import {
  DUELS_PAR_PASSAGE,
  TROP_ANCIEN_MS,
  carteEnClair,
  duelEnMots,
  duelImageAlt,
  duelPayload,
  duelsPass,
  parseDuelsState,
  lireReponseDesDuels,
  salleEnMots,
  serveurDesDuels,
  titreDuDuel,
  type DuelsCalls,
  type DuelsSendState,
  type LectureDesDuels,
  type RaisonDeLaisser,
  type ServeurDesDuels,
  type VictoireEnDuel,
} from "../../src/lib/duels-discord";
import { TENUE_DE_DEPART } from "../../src/lib/gaulois";
import { BANNIERES } from "../../supabase/functions/code-discord/bannieres/index";
import { FAMILIERS } from "../../supabase/functions/code-discord/familiers/index";

const SITE = "https://x.test/";
const NOW = new Date("2026-11-22T20:30:00.000Z");
const NUMBER_SPACES = new RegExp(`[${String.fromCodePoint(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NUMBER_SPACES, " ");
const BANNIERE = BANNIERES[0]!;
const FAMILIER = FAMILIERS[0]!;

/** Une annonce comme la rend duel_annonces_a_envoyer (contrat du moteur du duel). */
const ligne = (partie: number, extra: Record<string, unknown> = {}) => ({
  partie,
  essai: false,
  le: "2026-11-22T20:20:00+00:00",
  contre: "membre",
  boss: null,
  manches: 7,
  main: {},
  main_vaincue: {},
  carte: { emplacement: "arme", objet: "dague" },
  vainqueur: { nom: "Le chef du QG", pseudo: "Brennos", tenue: TENUE_DE_DEPART, banniere: null, familier: FAMILIER.id },
  vaincu: { nom: "Le chef du QG", pseudo: "Epona", tenue: TENUE_DE_DEPART, banniere: BANNIERE.id, familier: null },
  ...extra,
});

const victoire = (extra: Partial<VictoireEnDuel> = {}): VictoireEnDuel => ({
  id: 1,
  le: "2026-11-22T20:20:00.000Z",
  manches: 7,
  salle: 250,
  carte: { emplacement: "arme", objet: "dague" },
  lieu: BANNIERE.id,
  vainqueur: { pseudo: "Brennos", tenue: TENUE_DE_DEPART, familier: FAMILIER.id },
  vaincu: { pseudo: "Epona", tenue: TENUE_DE_DEPART, familier: null },
  ...extra,
});

describe("les mots d'une victoire en duel", () => {
  it("dit qui bat qui, et en combien de manches", () => {
    expect(titreDuDuel(victoire())).toBe("Brennos bat Epona en 7 manches");
    expect(titreDuDuel(victoire({ manches: 1 }))).toBe("Brennos bat Epona en 1 manche");
  });
  it("nomme « Un Gaulois » celui qui n'a pas de pseudo public, sans changer un vrai pseudo", () => {
    const sansNom = { pseudo: null, tenue: TENUE_DE_DEPART, familier: null };
    expect(titreDuDuel(victoire({ vainqueur: sansNom }))).toBe("Un Gaulois bat Epona en 7 manches");
    expect(titreDuDuel(victoire({ vaincu: sansNom }))).toBe("Brennos bat un Gaulois en 7 manches");
    expect(titreDuDuel(victoire({ vaincu: { ...sansNom, pseudo: "Un Ours" } }))).toBe("Brennos bat Un Ours en 7 manches");
  });
  it("dit la salle d'un duel misé, et rien sans mise", () => {
    expect(plain(salleEnMots(1000) ?? "")).toBe("Salle des 1 000 statères");
    expect(salleEnMots(null)).toBeNull();
  });
  it("ne dit jamais un solde ni un gain", () => {
    const mots = duelEnMots(victoire()).join(" ");
    expect(mots).not.toMatch(/solde|gagn|pot\b|cagnotte|remporte/i);
    expect(duelEnMots(victoire({ salle: null })).join(" ")).not.toMatch(/statère/);
  });
  it("décrit la carte décisive, ou son absence", () => {
    const carte = carteEnClair({ emplacement: "arme", objet: "dague" });
    expect(carte?.place).toBe("arme");
    expect(duelEnMots(victoire()).join(" ")).toContain(`Carte décisive : ${carte?.nom}`);
    expect(duelEnMots(victoire({ carte: null })).join(" ")).toContain("Pas de carte décisive");
  });
  it("décrit le lieu, les poses et le familier", () => {
    const mots = duelEnMots(victoire()).join(" ");
    expect(mots).toContain(`« ${BANNIERE.nom} »`);
    expect(mots).toContain("Brennos debout, avec son familier");
    expect(mots).toContain("Epona à terre");
    expect(duelEnMots(victoire({ lieu: null })).join(" ")).toContain("Au village");
  });
  it("tient dans la description de Discord", () => {
    const long = "W".repeat(32);
    expect(duelImageAlt(victoire({ vainqueur: { pseudo: long, tenue: TENUE_DE_DEPART, familier: FAMILIER.id }, vaincu: { pseudo: long, tenue: TENUE_DE_DEPART, familier: FAMILIER.id } })).length).toBeLessThanOrEqual(1024);
  });
});

describe("le message", () => {
  it("avec l'image : aucun texte, un bouton vers Mon Gaulois", () => {
    const payload = duelPayload(victoire(), SITE, { alt: "x", filename: "duel-1.png" });
    expect(payload["content"]).toBeUndefined();
    expect(JSON.stringify(payload["components"])).toContain("https://x.test/village");
    expect(payload["allowed_mentions"]).toEqual({ parse: [] });
  });
  it("sans image : le texte de secours, sans mention possible", () => {
    const payload = duelPayload(victoire({ vainqueur: { pseudo: "@everyone", tenue: TENUE_DE_DEPART, familier: null } }), SITE, null);
    expect(String(payload["content"])).toContain("\\@everyone");
    expect(payload["allowed_mentions"]).toEqual({ parse: [] });
  });
});

describe("lireReponseDesDuels", () => {
  it("lit une victoire bien formée : la bannière du vaincu est le lieu, son nom du village n'est jamais lu", () => {
    const lu = lireReponseDesDuels({ ok: true, annonces: [ligne(3)] });
    expect(lu?.victoires).toHaveLength(1);
    expect(lu?.victoires[0]).toMatchObject({ id: 3, manches: 7, salle: null, carte: { emplacement: "arme", objet: "dague" }, lieu: BANNIERE.id, vainqueur: { pseudo: "Brennos" } });
    expect(JSON.stringify(lu)).not.toContain("Le chef du QG");
    expect(lu?.aLaisser).toEqual([]);
  });
  it("lit un numéro de partie rendu en texte", () => {
    expect(lireReponseDesDuels({ ok: true, annonces: [ligne(3, { partie: "12" })] })?.victoires[0]?.id).toBe(12);
  });
  it("refuse une réponse sans ok ni liste", () => {
    expect(lireReponseDesDuels({ ok: false })).toBeNull();
    expect(lireReponseDesDuels(null)).toBeNull();
    expect(lireReponseDesDuels({ ok: true, annonces: {} })).toBeNull();
  });
  it("laisse les essais du pilote et les victoires contre le boss, sans les poster", () => {
    const lu = lireReponseDesDuels({ ok: true, annonces: [ligne(1, { essai: true }), ligne(2, { contre: "boss", boss: "le-sanglier", vaincu: null }), ligne(3)] });
    expect(lu?.aLaisser).toEqual([
      { id: 1, raison: "essai" },
      { id: 2, raison: "boss" },
    ]);
    expect(lu?.victoires.map((v) => v.id)).toEqual([3]);
  });
  it("garde le numéro d'une ligne illisible pour la laisser", () => {
    const lu = lireReponseDesDuels({ ok: true, annonces: [ligne(4, { vaincu: { pseudo: "x", tenue: "pas une tenue" } }), ligne(5, { manches: 0 }), { rien: true }, ligne(6)] });
    expect(lu?.aLaisser).toEqual([
      { id: 4, raison: "illisible" },
      { id: 5, raison: "illisible" },
    ]);
    expect(lu?.victoires.map((v) => v.id)).toEqual([6]);
  });
  it("oublie ce que ce code ne connaît pas, sans refuser la victoire", () => {
    const lu = lireReponseDesDuels({
      ok: true,
      annonces: [ligne(7, { carte: { emplacement: "arme", objet: "inconnu" }, salle: null, vainqueur: { pseudo: "Brennos", tenue: TENUE_DE_DEPART, familier: "inconnu" }, vaincu: { pseudo: "Epona", tenue: TENUE_DE_DEPART, banniere: "inconnue" } })],
    });
    expect(lu?.victoires[0]).toMatchObject({ carte: "inconnue", lieu: null, salle: null, vainqueur: { familier: null } });
  });
  it("sans carte dans l'annonce, ne dit rien de la fin ; avec une carte nulle, le vaincu est tombé sans coup", () => {
    const sans = { ...ligne(8) } as Record<string, unknown>;
    delete sans["carte"];
    expect(lireReponseDesDuels({ ok: true, annonces: [sans] })?.victoires[0]?.carte).toBe("inconnue");
    expect(lireReponseDesDuels({ ok: true, annonces: [ligne(9, { carte: null })] })?.victoires[0]?.carte).toBeNull();
  });
  it("sans pseudo public, ou avec un pseudo qui ressemble à une adresse, le Gaulois n'est pas nommé", () => {
    const sansPseudo = { nom: "Le chef du QG", tenue: TENUE_DE_DEPART };
    const lu = lireReponseDesDuels({ ok: true, annonces: [ligne(8, { vainqueur: sansPseudo, vaincu: { pseudo: "discord.gg/pub", tenue: TENUE_DE_DEPART } })] });
    expect(lu?.victoires[0]?.vainqueur.pseudo).toBeNull();
    expect(lu?.victoires[0]?.vaincu.pseudo).toBeNull();
  });
  it("range les victoires de la plus ancienne à la plus récente", () => {
    const lu = lireReponseDesDuels({ ok: true, annonces: [ligne(2, { le: "2026-11-22T20:00:00Z" }), ligne(1, { le: "2026-11-22T21:00:00Z" })] });
    expect(lu?.victoires.map((v) => v.id)).toEqual([2, 1]);
  });
});

describe("serveurDesDuels", () => {
  const env = { SUPABASE_URL: "https://abc.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_cle" };
  const calls = (lire: DuelsCalls["lire"], noter: DuelsCalls["noter"] = async () => ({ ok: true })): DuelsCalls => ({ lire, noter });
  it("sans réglage, ne demande rien", async () => {
    expect((await serveurDesDuels({}, calls(async () => ({ ok: true, annonces: [] }))).lire()).etat).toBe("sans-reglage");
  });
  it("note d'un coup toutes les parties qu'on lui donne", async () => {
    let notees: readonly number[] = [];
    await serveurDesDuels(env, calls(async () => ({ ok: true, annonces: [] }), async (_u, _k, p) => ((notees = p), { ok: true }))).noter([3, 4]);
    expect(notees).toEqual([3, 4]);
  });
  it("reconnaît une migration pas encore collée", async () => {
    const absente = calls(async () => {
      throw Object.assign(new Error("Could not find the function public.duel_annonces_a_envoyer"), { code: "PGRST202" });
    });
    expect((await serveurDesDuels(env, absente).lire()).etat).toBe("fonction-absente");
  });
  it("n'écrit ni la clé ni l'adresse du serveur dans le journal", async () => {
    const panne = calls(async () => {
      throw new Error(`refus de https://abc.supabase.co avec sb_secret_cle`);
    });
    const lu = await serveurDesDuels(env, panne).lire();
    expect(lu.etat).toBe("panne");
    expect(JSON.stringify(lu)).not.toMatch(/abc\.supabase|sb_secret_cle/);
  });
});

describe("duelsPass", () => {
  const serveur = (lecture: LectureDesDuels, notes: number[][] = [], noteEchoue = false): ServeurDesDuels => ({
    lire: async () => lecture,
    noter: async (parties) => {
      if (noteEchoue) throw new Error("refus");
      notes.push([...parties]);
    },
  });
  const lu = (victoires: VictoireEnDuel[], aLaisser: { id: number; raison: RaisonDeLaisser }[] = []): LectureDesDuels => ({ etat: "lu", victoires, aLaisser });
  const passe = (deps: Partial<Parameters<typeof duelsPass>[0]> & Pick<Parameters<typeof duelsPass>[0], "serveur">) => duelsPass({ stored: null, now: NOW, send: async () => true, note: () => {}, log: () => {}, ...deps });

  it("envoie, garde chaque envoi, puis le note au serveur", async () => {
    const notes: number[][] = [];
    const envoyees: number[] = [];
    const gardes: DuelsSendState[] = [];
    const r = await passe({ serveur: serveur(lu([victoire({ id: 1 }), victoire({ id: 2 })]), notes), send: async (v) => (envoyees.push(v.id), true), note: (s) => gardes.push(s) });
    expect(r).toEqual({ failed: false, envoyees: 2 });
    expect(envoyees).toEqual([1, 2]);
    expect(gardes.at(-1)?.envoyees.map((e) => e.id)).toEqual([1, 2]);
    expect(notes).toEqual([[1], [2]]);
  });
  it("s'arrête au premier refus de Discord, sans rien noter : la victoire repart au passage suivant", async () => {
    const notes: number[][] = [];
    const r = await passe({ serveur: serveur(lu([victoire({ id: 1 }), victoire({ id: 2 })]), notes), send: async () => false });
    expect(r).toEqual({ failed: true, envoyees: 0 });
    expect(notes).toEqual([]);
  });
  it("une note qui échoue arrête le passage, et la victoire gardée ne repart jamais : seule la note est retentée", async () => {
    const envoyees: number[] = [];
    const logs: string[] = [];
    let garde: DuelsSendState | null = null;
    const premier = await passe({ serveur: serveur(lu([victoire({ id: 1 }), victoire({ id: 2 })]), [], true), send: async (v) => (envoyees.push(v.id), true), note: (s) => (garde = s), log: (l) => logs.push(l) });
    expect(premier).toEqual({ failed: true, envoyees: 1 });
    expect(envoyees).toEqual([1]);
    expect(garde).toEqual({ envoyees: [{ id: 1, le: victoire().le }] });
    expect(logs.join("\n")).toContain("envoi non noté au serveur (n° 1");
    // Le passage suivant : le serveur rend encore la victoire 1, pas notée.
    const notes: number[][] = [];
    const second = await passe({ serveur: serveur(lu([victoire({ id: 1 }), victoire({ id: 2 })]), notes), stored: garde, send: async (v) => (envoyees.push(v.id), true) });
    expect(second).toEqual({ failed: false, envoyees: 1 });
    expect(envoyees).toEqual([1, 2]);
    expect(notes).toEqual([[1], [2]]);
  });
  it("oublie au bout de 96 heures ce qu'il a gardé", async () => {
    const vieux = { envoyees: [{ id: 1, le: new Date(NOW.getTime() - 2 * TROP_ANCIEN_MS - 1000).toISOString() }, { id: 2, le: victoire().le }] };
    let garde: DuelsSendState | null = null;
    await passe({ serveur: serveur(lu([victoire({ id: 3 })])), stored: vieux, note: (s) => (garde = s) });
    expect(garde).toEqual({ envoyees: [{ id: 2, le: victoire().le }, { id: 3, le: victoire().le }] });
  });
  it("n'envoie pas plus de cinq images par passage", async () => {
    const victoires = Array.from({ length: DUELS_PAR_PASSAGE + 1 }, (_, i) => victoire({ id: i + 1 }));
    const r = await passe({ serveur: serveur(lu(victoires)) });
    expect(r.envoyees).toBe(DUELS_PAR_PASSAGE);
  });
  it("note d'un coup, sans les poster, les essais, les boss, les illisibles et les victoires de plus de 48 heures", async () => {
    const vieille = victoire({ id: 9, le: new Date(NOW.getTime() - TROP_ANCIEN_MS - 1000).toISOString() });
    const notes: number[][] = [];
    const envoyees: number[] = [];
    const logs: string[] = [];
    await passe({
      serveur: serveur(
        lu(
          [vieille, victoire({ id: 10 })],
          [
            { id: 4, raison: "essai" },
            { id: 5, raison: "boss" },
            { id: 6, raison: "illisible" },
          ],
        ),
        notes,
      ),
      send: async (v) => (envoyees.push(v.id), true),
      log: (l) => logs.push(l),
    });
    expect(envoyees).toEqual([10]);
    expect(notes).toEqual([[4, 5, 6, 9], [10]]);
    expect(logs.join("\n")).toContain("1 essai du pilote");
    expect(logs.join("\n")).toContain("contre le boss du jour");
    expect(logs.join("\n")).toMatch(/::warning::Duels : 1 annonce que ce code ne sait pas lire/);
  });
  it("une panne du serveur prévient sans rien envoyer", async () => {
    const logs: string[] = [];
    const r = await passe({ serveur: serveur({ etat: "panne", warning: "lecture impossible" }), log: (l) => logs.push(l) });
    expect(r).toEqual({ failed: true, envoyees: 0 });
    expect(logs[0]).toMatch(/^::warning::Duels : lecture impossible/);
  });
  it("une migration pas encore collée ne compte pas comme une panne", async () => {
    const r = await passe({ serveur: serveur({ etat: "fonction-absente", warning: "x" }) });
    expect(r.failed).toBe(false);
  });
});

describe("l'état gardé des envois", () => {
  it("se relit, et un état illisible est signalé sans rien casser", () => {
    expect(parseDuelsState(JSON.stringify({ envoyees: [{ id: 1, le: "2026-11-22T20:20:00.000Z" }] })).state).toEqual({ envoyees: [{ id: 1, le: "2026-11-22T20:20:00.000Z" }] });
    expect(parseDuelsState(null)).toEqual({ state: null, warning: null });
    const illisible = parseDuelsState("{pas du json");
    expect(illisible.state).toBeNull();
    expect(illisible.warning).toBeTruthy();
  });
});

describe("une carte que ce code ne connaît pas encore", () => {
  it("ne fait pas dire que le vaincu est tombé sans coup", () => {
    const lu = lireReponseDesDuels({ ok: true, annonces: [ligne(11, { carte: { emplacement: "arme", objet: "arme-de-demain" } })] });
    expect(lu?.victoires[0]?.carte).toBe("inconnue");
    const mots = duelEnMots(lu!.victoires[0]!).join(" ");
    expect(mots).not.toContain("tombé sans coup");
    expect(mots).not.toContain("Carte décisive");
    expect(duelEnMots(victoire({ carte: null })).join(" ")).toContain("tombé sans coup");
  });
});

describe("une carte de base, gratuite pour tous", () => {
  it("peut être la carte décisive : elle se dit « de base »", () => {
    const carte = carteEnClair({ emplacement: "arme", objet: "gourdin" });
    expect(carte).toMatchObject({ nom: "Gourdin", rarete: null, rareteEnMots: "De base", place: "arme" });
    expect(duelEnMots(victoire({ carte: { emplacement: "arme", objet: "gourdin" } })).join(" ")).toContain("Carte décisive : Gourdin (de base, arme).");
    const lu = lireReponseDesDuels({ ok: true, annonces: [ligne(9, { carte: { emplacement: "arme", objet: "gourdin" } })] });
    expect(lu?.victoires[0]?.carte).toEqual({ emplacement: "arme", objet: "gourdin" });
  });
  it("un objet sans dessin n'est pas une carte", () => {
    expect(carteEnClair({ emplacement: "tete", objet: "aucune" })).toBeNull();
  });
});
