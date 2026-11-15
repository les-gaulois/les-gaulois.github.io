import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { ANCRES } from "../../src/lib/village/monde/almanach/ancres";
import {
  CHEMINS,
  type ClientDeLAlmanach,
  ECRITURE,
  MAX_TOKENS,
  MODELE,
  PRIX,
  catalogueUtilisable,
  consigne,
  controlerLesMoments,
  corpsDeLaRequete,
  coutReel,
  ecrireLAlmanach,
  exempleDe,
  formatDeLaReponse,
  garder,
  graine,
  lireLaReponse,
  pireCout,
  prochainLot,
  rangDeLaRequete,
  idDeLaRequete,
  ecritureVide,
} from "../../src/lib/village/monde/almanach/ecriture";
import { FIGURANTS } from "../../src/lib/village/monde/almanach/figurants";
import { MOMENTS, type MomentEcrit, validerMoment } from "../../src/lib/village/monde/almanach/moment";
import { FIGURANTS_D_ESSAI, figurantDEssai, traversee } from "./village-almanach-outils";

/* ---------- Un faux client, et un dépôt en mémoire ---------- */

/** Cinq figurants de sol, quatre lieux au sol, deux sens : quarante moments différents, puis des doublons. */
const SOLS = Array.from({ length: 5 }, (_v, i) => figurantDEssai(`essai-sol-${i}`, "sol", "pas", 40, 30));
const LIEUX = ["rue-des-maisons", "sur-la-place", "devant-la-taverne", "pre-du-bas"];
const FIGURANTS_DU_FAUX = [...FIGURANTS_D_ESSAI, ...SOLS];
const momentNumero = (k: number): MomentEcrit => {
  const m = traversee({ ancre: LIEUX[k % 4]!, titre: `Un passage d'essai ${k}` });
  m.roles[0]!.figurant = SOLS[Math.floor(k / 4) % 5]!.id;
  // De 20 à 39, le même passage dans l'autre sens : un autre chemin.
  if (Math.floor(k / 20) % 2 === 1) for (const e of m.roles[0]!.etapes) e.x = -e.x;
  return m;
};

/** Une réponse de l'API, telle que le SDK la rend. */
function message(texte: string, stop: Anthropic.Message["stop_reason"] = "end_turn", sortie = 5000): Anthropic.Message {
  return {
    id: "msg_essai",
    type: "message",
    role: "assistant",
    model: MODELE,
    content: [{ type: "text", text: texte, citations: null }],
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 12_000, output_tokens: sortie, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  } as unknown as Anthropic.Message;
}

interface Faux extends ClientDeLAlmanach {
  lots: Anthropic.Messages.BatchCreateParams.Request[][];
  relectures: number;
  demandes: number;
}

/**
 * Le faux client : chaque lot finit à la deuxième relecture. La requête de rang r rend dix moments : les numéros 10 r à
 * 10 r + 7, un moment trop rapide, et une copie du premier ; sauf `coupees`, qui finissent à `max_tokens`, et `refusees`.
 */
function fauxClient(options: { coupees?: number[]; refusees?: number[]; erreurs?: number[] } = {}): Faux {
  const faux: Faux = {
    lots: [],
    relectures: 0,
    demandes: 0,
    async creerLeLot(requetes) {
      faux.lots.push(requetes);
      return { id: `msgbatch_essai_${faux.lots.length}` };
    },
    async lireLeLot() {
      faux.relectures++;
      return { processing_status: faux.relectures % 2 === 0 ? "ended" : "in_progress", request_counts: { processing: 1, succeeded: 0 } };
    },
    async resultatsDuLot(id) {
      const requetes = faux.lots[Number(id.split("_").pop()) - 1]!;
      async function* resultats(): AsyncGenerator<Anthropic.Messages.MessageBatchIndividualResponse> {
        // Dans le désordre, comme le dit l'API.
        for (const r of [...requetes].reverse()) {
          const rang = rangDeLaRequete(r.custom_id)!;
          if (options.erreurs?.includes(rang)) {
            yield { custom_id: r.custom_id, result: { type: "errored", error: { type: "error", error: { type: "api_error", message: "panne" } } } } as unknown as Anthropic.Messages.MessageBatchIndividualResponse;
            continue;
          }
          const stop = options.coupees?.includes(rang) ? "max_tokens" : options.refusees?.includes(rang) ? "refusal" : "end_turn";
          const bons = Array.from({ length: 8 }, (_v, j) => momentNumero(rang * 10 + j));
          const rapide = traversee({ titre: "Trop rapide" });
          rapide.roles[0]!.etapes[2]!.x = 400 - 20;
          const moments = [...bons, rapide, bons[0]];
          yield { custom_id: r.custom_id, result: { type: "succeeded", message: message(stop === "end_turn" ? JSON.stringify({ moments }) : '{"moments": [', stop) } };
        }
      }
      return resultats();
    },
    async demander() {
      faux.demandes++;
      return message(JSON.stringify({ moments: [momentNumero(0), traversee({ duree: 200 })] }));
    },
  };
  return faux;
}

function depot(config = { moments: 20, plafond_dollars: 60 }, fichiers: Record<string, string> = {}) {
  const disque = new Map<string, string>([[CHEMINS.config, JSON.stringify(config)], ...Object.entries(fichiers)]);
  const ecrits: string[] = [];
  const journal: string[] = [];
  let horloge = Date.parse("2026-11-16T10:00:00Z");
  return {
    disque,
    ecrits,
    journal,
    deps: (client: ClientDeLAlmanach | null, autres: { essai?: boolean; delaiMs?: number } = {}) => ({
      client,
      lire: (chemin: string) => disque.get(chemin) ?? null,
      ecrire: (chemin: string, texte: string) => {
        ecrits.push(chemin);
        disque.set(chemin, texte);
      },
      maintenant: () => new Date(horloge),
      attendre: async (ms: number) => {
        horloge += ms;
      },
      journal: (ligne: string) => journal.push(ligne),
      figurants: FIGURANTS_DU_FAUX,
      ancres: ANCRES,
      ...autres,
    }),
  };
}

/* ---------- Les essais ---------- */

describe("l'écriture de l'almanach, avec un faux client", () => {
  it("envoie un lot, attend sa fin, contrôle chaque moment, écarte doublons et refus, et complète", async () => {
    const d = depot();
    const client = fauxClient();
    expect(await ecrireLAlmanach(d.deps(client))).toBe(0);
    // Le premier lot : 20 moments voulus, 10 par requête, deux requêtes ; le Fable 5.2, à l'effort medium, en sortie structurée.
    expect(client.lots[0]!.map((r) => r.custom_id)).toEqual(["r000", "r001"]);
    const params = client.lots[0]![0]!.params;
    expect(params.model).toBe("claude-fable-5-2");
    expect(params.output_config?.effort).toBe("medium");
    expect(params.output_config?.format?.type).toBe("json_schema");
    expect(params.max_tokens).toBe(MAX_TOKENS);
    expect("fallbacks" in params || "thinking" in params || "temperature" in params).toBe(false);
    const moments = MOMENTS.parse(JSON.parse(d.disque.get(CHEMINS.moments)!));
    expect(moments.map((m) => m.id)).toEqual(Array.from({ length: 20 }, (_v, i) => `m${String(i + 1).padStart(3, "0")}`));
    const ecriture = ECRITURE.parse(JSON.parse(d.disque.get(CHEMINS.ecriture)!));
    expect(ecriture.lot_en_cours).toBeNull();
    expect(ecriture.gardes).toBe(20);
    // Chaque requête : 8 moments différents, un trop rapide, une copie du premier.
    const premier = ecriture.lots[0]!;
    expect(premier).toMatchObject({ rang: 1, requetes: 2, demandes: 20, lus: 20, valides: 18, doublons: 2, gardes: 16, en_trop: 0 });
    expect(premier.refus).toEqual({ "trop vite pour son allure": 2 });
    expect(premier.jetons).toEqual({ entree: 24_000, sortie: 10_000 });
    expect(premier.cout_dollars).toBeCloseTo(((24_000 * PRIX.entree + 10_000 * PRIX.sortie) / 1e6) * 0.5, 4);
    // Un complément pour les 4 qui manquaient : une seule requête, la graine suivante.
    expect(client.lots[1]!.map((r) => r.custom_id)).toEqual(["r002"]);
    expect(ecriture.lots[1]).toMatchObject({ rang: 2, requetes: 1, gardes: 4, en_trop: 4, doublons: 1 });
    // Le journal est public : des nombres, des identifiants et des raisons, jamais de texte de moment.
    expect(JSON.stringify(ecriture)).not.toContain("passage d'essai");
    expect(ecriture.cout_dollars).toBeCloseTo(ecriture.lots.reduce((s, l) => s + l.cout_dollars, 0), 3);
  });

  it("refuse d'envoyer un lot dont le pire coût dépasse ce qui reste du plafond, sans rien écrire", async () => {
    const d = depot({ moments: 650, plafond_dollars: 10 });
    const client = fauxClient();
    expect(await ecrireLAlmanach(d.deps(client))).toBe(1);
    expect(client.lots).toEqual([]);
    expect(d.ecrits).toEqual([]);
    expect(d.journal.join("\n")).toMatch(/au-dessus de ce qui reste du plafond/);
    // Ce qui est déjà dépensé compte : avec 59 $ dépensés sur 60, même un petit lot ne part pas.
    const deja = { ...ecritureVide({ moments: 650, plafond_dollars: 60 }), cout_dollars: 59 };
    const e = depot({ moments: 20, plafond_dollars: 60 }, { [CHEMINS.ecriture]: JSON.stringify(deja) });
    expect(await ecrireLAlmanach(e.deps(client))).toBe(1);
    expect(client.lots).toEqual([]);
  });

  it("compte le pire coût d'un lot : chaque requête au plus long de sa réponse, son entrée à un jeton par octet, à moitié prix", () => {
    const catalogue = catalogueUtilisable();
    const systeme = consigne(catalogue);
    const corps = corpsDeLaRequete(systeme, formatDeLaReponse(catalogue), graine(0, catalogue.ancres));
    const octets = new TextEncoder().encode(JSON.stringify(corps)).length;
    const un = pireCout([corps], true);
    expect(un).toBeGreaterThan(((octets * PRIX.entree + MAX_TOKENS * PRIX.sortie) / 1e6) * 0.5);
    expect(pireCout([corps], false)).toBeCloseTo(un * 2, 6);
    // Les 65 requêtes de 650 moments tiennent sous le plafond de 60 dollars, même au pire.
    const lot = Array.from({ length: 65 }, (_v, k) => corpsDeLaRequete(systeme, formatDeLaReponse(catalogue), graine(k, catalogue.ancres)));
    expect(pireCout(lot, true)).toBeLessThan(60);
  });

  it("note un lot en route dès qu'il part, et le reprend au passage suivant sans le renvoyer", async () => {
    const d = depot();
    const client = fauxClient();
    // Le temps laissé est déjà passé à la première relecture : le lot reste noté en route.
    expect(await ecrireLAlmanach(d.deps(client, { delaiMs: 0 }))).toBe(2);
    const enRoute = ECRITURE.parse(JSON.parse(d.disque.get(CHEMINS.ecriture)!));
    expect(enRoute.lot_en_cours).toMatchObject({ rang: 1, lot: "msgbatch_essai_1", graines: [0, 1] });
    expect(enRoute.lot_en_cours!.pire_cout_dollars).toBeGreaterThan(0);
    // Le passage suivant : il relit le même lot, n'en crée pas d'autre pour lui.
    expect(await ecrireLAlmanach(d.deps(client))).toBe(0);
    expect(client.lots[0]!.length).toBe(2);
    const fini = ECRITURE.parse(JSON.parse(d.disque.get(CHEMINS.ecriture)!));
    expect(fini.lots[0]!.rang).toBe(1);
    expect(fini.lot_en_cours).toBeNull();
  });

  it("lit les réponses coupées, refusées ou en erreur sans en garder un moment", async () => {
    const d = depot({ moments: 10, plafond_dollars: 60 });
    const client = fauxClient({ coupees: [0], refusees: [], erreurs: [] });
    await ecrireLAlmanach(d.deps(client));
    const ecriture = ECRITURE.parse(JSON.parse(d.disque.get(CHEMINS.ecriture)!));
    expect(ecriture.lots[0]!.requetes_sans_moments).toEqual({ "réponse coupée": 1 });
    expect(ecriture.lots[0]!.gardes).toBe(0);
    // Une requête coupée coûte quand même : ses jetons sont comptés.
    expect(ecriture.lots[0]!.cout_dollars).toBeGreaterThan(0);
    const e = depot({ moments: 10, plafond_dollars: 60 });
    await ecrireLAlmanach(e.deps(fauxClient({ refusees: [0, 1, 2], erreurs: [] })));
    expect(ECRITURE.parse(JSON.parse(e.disque.get(CHEMINS.ecriture)!)).lots[0]!.requetes_sans_moments).toEqual({ "le modèle a refusé": 1 });
    const f = depot({ moments: 10, plafond_dollars: 60 });
    await ecrireLAlmanach(f.deps(fauxClient({ erreurs: [0] })));
    const ef = ECRITURE.parse(JSON.parse(f.disque.get(CHEMINS.ecriture)!));
    expect(ef.lots[0]!.requetes_sans_moments).toEqual({ "requête en erreur": 1 });
    expect(ef.lots[0]!.cout_dollars).toBe(0);
  });

  it("s'arrête après deux compléments, même s'il manque encore des moments", async () => {
    const d = depot({ moments: 200, plafond_dollars: 60 });
    const client = fauxClient();
    expect(await ecrireLAlmanach(d.deps(client))).toBe(0);
    expect(client.lots.length).toBe(3);
    const ecriture = ECRITURE.parse(JSON.parse(d.disque.get(CHEMINS.ecriture)!));
    expect(ecriture.lots.map((l) => l.rang)).toEqual([1, 2, 3]);
    expect(ecriture.gardes).toBeLessThan(200);
    expect(d.journal.at(-1)).toMatch(/les 2 lots de complément sont faits/);
    // Relancé, il n'envoie plus rien.
    expect(await ecrireLAlmanach(d.deps(client))).toBe(0);
    expect(client.lots.length).toBe(3);
  });

  it("ne fait rien sans clé, sans figurant, ou avec un fichier illisible", async () => {
    const d = depot();
    expect(await ecrireLAlmanach(d.deps(null))).toBe(1);
    expect(await ecrireLAlmanach({ ...d.deps(fauxClient()), figurants: [] })).toBe(1);
    const e = depot(undefined, { [CHEMINS.moments]: "{ pas du json" });
    expect(await ecrireLAlmanach(e.deps(fauxClient()))).toBe(1);
    expect(e.ecrits).toEqual([]);
  });

  it("à l'essai, envoie une seule requête sans lot, montre les moments et leurs refus, et n'écrit que essai.json", async () => {
    const d = depot();
    const client = fauxClient();
    expect(await ecrireLAlmanach(d.deps(client, { essai: true }))).toBe(0);
    expect(client.demandes).toBe(1);
    expect(client.lots).toEqual([]);
    expect(d.ecrits).toEqual([CHEMINS.essai]);
    const texte = d.journal.join("\n");
    expect(texte).toContain("moment 1 : valide");
    expect(texte).toContain("moment 2 : refusé, durée hors des bornes");
    expect(texte).toMatch(/2 moments lus, 1 valides/);
    const rendu = JSON.parse(d.disque.get(CHEMINS.essai)!) as { lus: number; valides: unknown[]; modele: string; cout_dollars: number };
    expect(rendu).toMatchObject({ lus: 2, modele: "claude-fable-5-2" });
    expect(rendu.valides).toHaveLength(1);
    expect(rendu.cout_dollars).toBeGreaterThan(0);
  });

  it("fait l'essai quand config/almanach.json le demande, sans option du script", async () => {
    const d = depot({ moments: 20, plafond_dollars: 60, essai: true } as { moments: number; plafond_dollars: number });
    const client = fauxClient();
    expect(await ecrireLAlmanach(d.deps(client))).toBe(0);
    expect(client.demandes).toBe(1);
    expect(client.lots).toEqual([]);
    expect(d.ecrits).toEqual([CHEMINS.essai]);
  });
});

describe("les morceaux de l'écriture", () => {
  it("lit la raison de l'arrêt avant le contenu", () => {
    expect(lireLaReponse(message('{"moments": []}', "refusal")).raison).toBe("le modèle a refusé");
    expect(lireLaReponse(message('{"moments": [', "max_tokens")).raison).toBe("réponse coupée");
    expect(lireLaReponse(message("pas du json")).raison).toBe("JSON illisible");
    expect(lireLaReponse(message('{"autre": []}')).raison).toBe("JSON hors de la forme demandée");
    expect(lireLaReponse(message('{"moments": [1, 2]}')).moments).toEqual([1, 2]);
  });

  it("contrôle chaque moment à part : un moment mal formé ne fait pas tomber les autres", () => {
    const catalogue = { figurants: FIGURANTS_D_ESSAI, ancres: ANCRES };
    const lecture = controlerLesMoments([traversee(), { titre: 3 }, traversee({ ancre: "la-lune" })], catalogue);
    expect(lecture.lus).toBe(3);
    expect(lecture.valides).toHaveLength(1);
    expect(lecture.refus).toEqual({ "forme invalide": 1, "lieu inconnu": 1 });
  });

  it("garde jusqu'à l'objectif, sans doublon, en continuant les numéros", () => {
    const avant = MOMENTS.parse([{ id: "m007", ...momentNumero(0) }]);
    const g = garder(avant, [momentNumero(0), momentNumero(1), momentNumero(2), momentNumero(3)], 3);
    expect(g.moments.map((m) => m.id)).toEqual(["m007", "m008", "m009"]);
    expect(g).toMatchObject({ gardes: 2, doublons: 1, enTrop: 1 });
  });

  it("tire des graines fixes, qui passent par tous les lieux, toutes les phases et toutes les formes", () => {
    const g = Array.from({ length: 65 }, (_v, k) => graine(k, ANCRES));
    expect(graine(12, ANCRES)).toEqual(g[12]);
    expect(new Set(g.flatMap((x) => x.ancres)).size).toBe(ANCRES.length);
    expect(new Set(g.map((x) => x.phase)).size).toBe(4);
    expect(new Set(g.map((x) => x.forme)).size).toBeGreaterThanOrEqual(7);
    expect(idDeLaRequete(7)).toBe("r007");
    expect(rangDeLaRequete("r007")).toBe(7);
    expect(rangDeLaRequete("x7")).toBeNull();
  });

  it("prévoit 65 requêtes pour 650 moments, puis des compléments plus petits", () => {
    const config = { moments: 650, plafond_dollars: 60 };
    const vide = ecritureVide(config);
    const premier = prochainLot(vide, config, 0);
    expect(premier).toMatchObject({ rang: 1 });
    expect("graines" in premier && premier.graines.length).toBe(65);
    const apres = { ...vide, lots: [{ rang: 1, date: "", requetes: 65, demandes: 650, lus: 640, valides: 520, gardes: 500, doublons: 20, en_trop: 0, refus: {}, requetes_sans_moments: {}, jetons: { entree: 0, sortie: 0 }, pire_cout_dollars: 50, cout_dollars: 20 }] };
    const second = prochainLot(apres, config, 500);
    expect("graines" in second && second.graines[0]).toBe(65);
    expect("graines" in second && second.graines.length).toBeLessThan(65);
    expect(prochainLot(apres, config, 650)).toMatchObject({ rang: null });
  });

  it("compte le vrai coût dans usage, cache compris, à moitié prix en lot", () => {
    expect(coutReel({ input_tokens: 1_000_000, output_tokens: 0 }, false).dollars).toBeCloseTo(8, 6);
    expect(coutReel({ input_tokens: 0, output_tokens: 1_000_000 }, true).dollars).toBeCloseTo(20, 6);
    expect(coutReel({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 }, false).dollars).toBeCloseTo(0.8, 6);
    expect(coutReel(null, true)).toEqual({ jetons: { entree: 0, sortie: 0 }, dollars: 0 });
  });

  it("montre des exemples tirés des vrais figurants qui passent la validation", () => {
    const catalogue = catalogueUtilisable();
    const figurants = new Map(FIGURANTS.map((f) => [f.id, f]));
    let n = 0;
    for (const f of FIGURANTS) {
      for (const a of catalogue.ancres) {
        const e = exempleDe(f, a);
        if (!e) continue;
        n++;
        expect(validerMoment(e, { figurants, ancre: (id) => catalogue.ancres.find((x) => x.id === id) ?? null }), `${f.id} à ${a.id}`).toBeNull();
      }
    }
    expect(n).toBeGreaterThan(100);
  });
});
