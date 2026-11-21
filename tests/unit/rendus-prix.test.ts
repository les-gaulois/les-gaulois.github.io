import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMPTES_POUR_LE_TOTAL, CE_QUI_EST_RENDU, CE_QUI_NE_CHANGE_PAS, OU_VOIR_SON_MONTANT, POURQUOI_LES_PRIX_BAISSENT, PRIX_BAISSES, enStateres, lignesEnMots, lireRendusDesPrix, totalPublic, type LigneRendue } from "../../src/lib/rendus-prix";
import { ESSAIS_PAR_JOUEUR, ETAT_DE_DEPART, envoyerEnPrive, lireLesRendus, mergeRendusStates, messageSur, parseRendusState, payloadPrive, payloadPublic, rendusPass, type LectureDesRendus, type RendusSendState } from "../../src/lib/rendus-prix-discord";
import type { RendusDesPrix, RenduDUnJoueur } from "../../src/lib/rendus-prix";

const MIGRATION = readFileSync("supabase/migrations/20261121000600_prix_baisses_rendus.sql", "utf8").replace(/\r\n/g, "\n");
// Le code seul, sans les commentaires : ce que le serveur exécute.
const CODE = MIGRATION.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

// Les nombres du site sont écrits avec une espace fine insécable : les comparaisons la lisent comme une espace.
const sp = (s: string | undefined) => (s ?? "").replace(/[  ]/g, " ");

const ligne = (l: Partial<Record<string, unknown>>) => ({ genre: "banniere", objet: null, rarete: "legendaire", paye: 7500, nouveau: 5000, deja_rendu: 0, rendu: 2500, ...l });
const joueur = (n: number, l: Partial<Record<string, unknown>> = {}) => ({ n, discord: `1000000000000000${String(n).padStart(2, "0")}`, nom: `gaulois${n}`, total: 2500, gaulois: null, lignes: [ligne({})], ...l });
const reponse = (rendus: unknown[], extra: Record<string, unknown> = {}) => ({ ok: true, comptes: rendus.length, total: rendus.length * 2500, le: "2026-11-21T23:00:00Z", jusqu_a: rendus.length, rendus, ...extra });

describe("le trop-payé rendu au serveur (migration 20261121000600)", () => {
  it("ne rend que les articles et pochettes qui ont baissé, payés en vrais statères", () => {
    expect(CODE).toContain("d.nature in ('achat', 'pochette')");
    for (const genre of ["banniere", "carte", "cadre", "modele", "pochette_familiers", "pochette_bannieres", "pochette_modeles"]) expect(CODE).toContain(`then '${genre}'`);
    // Une pochette offerte par la loterie : son prix a été crédité dans la même transaction.
    expect(CODE).toContain("l.nature = 'loterie_pochette' and l.cree_le = d.cree_le");
    expect(CODE).toContain("where not c.offerte");
    // Un essai du mode GOD a des natures test_ : jamais lues.
    expect(CODE).not.toMatch(/test_achat|test_pochette/);
  });

  it("rend le trop-payé net d'une pochette qui avait rendu une part, le tiers d'une bannière, et seulement les achats d'avant la baisse", () => {
    expect(CODE).toContain("round((p.paye - p.nouveau)::numeric * (p.paye - p.deja_rendu) / p.paye)");
    expect(CODE).toContain("else p.paye - p.nouveau end)::integer as rendu");
    expect(CODE).toContain("p.paye > p.nouveau");
    // Une bannière, une finition, un cadre : du triple au double, quel que soit le réglage des prix des objets.
    expect(CODE.split("round(c.paye * 2 / 3.0)::integer").length - 1).toBe(3);
    expect(CODE).not.toContain("internal.banniere_prix(c.rarete)");
    // Seulement les achats d'avant la baisse : l'heure où 20261121000500 a changé le prix de la pochette des familiers.
    expect(CODE).toContain("and d.cree_le < (select p.maj_le from internal.familiers_pochette p where p.id)");
    // Les autres prix d'aujourd'hui, lus au serveur (que seules les migrations changent).
    for (const f of ["internal.modele_prix(c.rarete)", "internal.bannieres_pochette_prix()", "internal.familiers_pochette p where p.id", "internal.modeles_pochette p where p.id"]) expect(CODE).toContain(f);
  });

  it("verse une ligne par joueur et garde le détail, sans jamais rendre deux fois", () => {
    expect(CODE).toContain("values (u.user_id, 'prix_baisse_rendu', u.total, 'prix-baisse')");
    expect(CODE).toContain("not exists (select 1 from internal.prix_baisse_rendus r where r.achat = d.id)");
    expect(CODE).toContain("achat bigint primary key");
    expect(CODE).toContain("rendu integer not null check (rendu > 0 and rendu <= paye - nouveau)");
    // Le journal ne se modifie pas : seulement des ajouts.
    expect(CODE).not.toMatch(/update internal\.stateres_mouvements/);
    expect(CODE).not.toMatch(/\bdelete from\b|\btruncate\b|\bdrop table (?!if exists pg_temp\.prix_baisse_a_rendre)/i);
  });

  it("compte le versement parmi les vrais gains pendant un essai du mode GOD", () => {
    expect(CODE).toContain("'marche_demande_rendue', 'coffre_rendu', 'prix_baisse_rendu') then return new;");
  });

  it("réserve la lecture du robot à la clé de service", () => {
    expect(CODE).toContain("revoke all on function public.rendus_des_prix(bigint) from public, anon, authenticated;");
    expect(CODE).toContain("grant execute on function public.rendus_des_prix(bigint) to service_role;");
    expect(CODE).toContain("revoke all on table internal.prix_baisse_rendus from public, anon, authenticated;");
  });
});

describe("lireRendusDesPrix", () => {
  it("lit une réponse du serveur", () => {
    const r = lireRendusDesPrix(reponse([joueur(1), joueur(2, { discord: null })]));
    expect(r?.comptes).toBe(2);
    expect(r?.rendus[0]).toMatchObject({ n: 1, discord: "100000000000000001", total: 2500 });
    expect(r?.rendus[0]?.lignes[0]).toEqual({ genre: "banniere", objet: null, rarete: "legendaire", paye: 7500, nouveau: 5000, dejaRendu: 0, rendu: 2500 });
    expect(r?.rendus[1]?.discord).toBeNull();
  });

  it("refuse ce qui ne tient pas : un total qui n'est pas la somme du détail, un rendu plus grand que la baisse, un genre inconnu", () => {
    expect(lireRendusDesPrix(reponse([joueur(1, { total: 3000 })]))).toBeNull();
    expect(lireRendusDesPrix(reponse([joueur(1, { lignes: [ligne({ rendu: 2600, deja_rendu: 0 })], total: 2600 })]))).toBeNull();
    expect(lireRendusDesPrix(reponse([joueur(1, { lignes: [ligne({ genre: "objet" })] })]))).toBeNull();
    expect(lireRendusDesPrix({ ok: false })).toBeNull();
    expect(lireRendusDesPrix(null)).toBeNull();
  });

  it("ne garde pas un identifiant Discord mal formé", () => {
    expect(lireRendusDesPrix(reponse([joueur(1, { discord: "abc" })]))?.rendus[0]?.discord).toBeNull();
  });
});

describe("lignesEnMots", () => {
  const l = (x: Partial<LigneRendue>): LigneRendue => ({ genre: "banniere", objet: null, rarete: "legendaire", paye: 7500, nouveau: 5000, dejaRendu: 0, rendu: 2500, ...x });
  it("nomme chaque article et regroupe les pochettes de même sorte", () => {
    const mots = lignesEnMots([
      l({ genre: "modele", objet: "lezard", rarete: "commun", paye: 11500, nouveau: 6000, rendu: 5500 }),
      l({ genre: "pochette_familiers", rarete: null, paye: 2000, nouveau: 1000, rendu: 1000 }),
      l({ genre: "pochette_familiers", rarete: null, paye: 2000, nouveau: 1000, rendu: 1000 }),
      l({ genre: "pochette_modeles", rarete: null, paye: 3000, nouveau: 1600, dejaRendu: 1800, rendu: 560 }),
      l({ genre: "pochette_modeles", rarete: null, paye: 3000, nouveau: 1600, rendu: 1400 }),
    ]);
    expect(mots.map((m) => m.quoi)).toEqual(["Gaulois unique « Lézard »", "Booster des familiers", "Booster des Gaulois uniques"]);
    expect(sp(mots[0]?.detail)).toBe("Commun : payé 11 500, 6 000 après la baisse");
    expect([sp(mots[1]?.detail), mots[1]?.rendu]).toEqual(["2 ouverts à 2 000, 1 000 après la baisse", 2000]);
    expect([sp(mots[2]?.detail), mots[2]?.rendu]).toEqual(["2 ouverts à 3 000, 1 600 après la baisse ; 1 sur 2 avait rendu une part, déduite", 1960]);
    expect(mots.reduce((s, m) => s + m.rendu, 0)).toBe(5500 + 2000 + 1960);
  });

  it("accorde les mots et garde l'identifiant d'un article que la liste ne connaît plus", () => {
    const mots = lignesEnMots([l({ genre: "carte", objet: "inconnue-du-rayon", rarete: "mystique", paye: 3000, nouveau: 2000, rendu: 1000 }), l({ genre: "pochette_bannieres", rarete: null, paye: 1500, nouveau: 1000, dejaRendu: 600, rendu: 300 })]);
    expect([mots[0]?.quoi, sp(mots[0]?.detail)]).toEqual(["Finition de carte « inconnue-du-rayon »", "Mystique : payée 3 000, 2 000 après la baisse"]);
    expect(sp(mots[1]?.detail)).toBe("1 ouvert à 1 500, 1 000 après la baisse ; il avait rendu une part, déduite");
    // Le même booster ouvert à deux prix, et plusieurs sur trois qui avaient rendu une part.
    const deux = lignesEnMots([1500, 3000, 3000].map((paye, i) => l({ genre: "pochette_bannieres", rarete: null, paye, nouveau: 1000, dejaRendu: i > 0 ? 600 : 0, rendu: 100 })));
    expect(sp(deux[0]?.detail)).toBe("3 ouverts de 1 500 à 3 000, 1 000 après la baisse ; 2 sur 3 avaient rendu une part, déduite");
  });
});

describe("le message public", () => {
  it("ne donne la somme de tous qu'à partir de cinq joueurs remboursés", () => {
    expect(COMPTES_POUR_LE_TOTAL).toBe(5);
    expect(totalPublic({ comptes: 4, total: 40000 })).toBeNull();
    expect(totalPublic({ comptes: 5, total: 50000 })).toEqual({ comptes: 5, total: 50000 });
  });

  it("dit les prix baissés de la migration, sans flèche ni signe", () => {
    expect(PRIX_BAISSES.map((p) => [p.quoi, sp(p.avant), sp(p.maintenant)])).toEqual([
      ["Gaulois uniques", "11 500 à 28 000", "6 000 à 15 000"],
      ["Booster des Gaulois uniques", "3 000", "1 600"],
      ["Bannières, finitions et cadres", "300 à 7 500", "200 à 5 000"],
      ["Booster des bannières", "1 500", "1 000"],
      ["Booster des familiers", "2 000", "1 000"],
    ]);
    for (const phrase of [POURQUOI_LES_PRIX_BAISSENT, CE_QUI_EST_RENDU, CE_QUI_NE_CHANGE_PAS, OU_VOIR_SON_MONTANT]) {
      expect(phrase).not.toMatch(/[→÷>=]/);
      expect(phrase.endsWith(".")).toBe(true);
    }
    // Aucune statistique dans le message : seulement des prix et la règle.
    expect(POURQUOI_LES_PRIX_BAISSENT).not.toMatch(/\d/);
    expect(enStateres(1)).toBe("1 statère");
    expect(sp(enStateres(2500))).toBe("2 500 statères");
  });

  it("met l'image dans un embed avec le bouton, ou part en texte seul", () => {
    const avec = payloadPublic("https://les-gaulois.github.io", 0xd4a537, { alt: "Les prix baissent", filename: "prix-baisses.png" }, "secours");
    expect(avec).toMatchObject({ embeds: [{ color: 0xd4a537, image: { url: "attachment://prix-baisses.png" } }], allowed_mentions: { parse: [] } });
    expect(JSON.stringify(avec)).toContain("https://les-gaulois.github.io/village#boutique");
    expect(payloadPublic("https://les-gaulois.github.io", 1, null, "secours")).toMatchObject({ content: "secours" });
  });
});

describe("le message privé", () => {
  it("met l'image dans un embed, le bouton, et ne mentionne personne", () => {
    const p = payloadPrive("https://les-gaulois.github.io", 7, { alt: "2 500 statères rendus", filename: "rendu.png" }, "secours");
    expect(p).toMatchObject({ embeds: [{ color: 7, image: { url: "attachment://rendu.png" } }], attachments: [{ id: 0, filename: "rendu.png", description: "2 500 statères rendus" }], allowed_mentions: { parse: [] } });
    expect(payloadPrive("https://x.test", 7, null, "secours")).toMatchObject({ content: "secours" });
  });

  const robot = (reponses: { status: number; body?: unknown }[]) => {
    const appels: { url: string; init: RequestInit }[] = [];
    const fetch = (async (url: string, init: RequestInit) => {
      appels.push({ url, init });
      const r = reponses.shift() ?? { status: 500 };
      return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status });
    }) as unknown as typeof globalThis.fetch;
    return { fetch, appels };
  };
  const message = { payload: { content: "x" }, png: null, filename: "rendu.png" };

  it("ouvre la conversation privée puis y poste", async () => {
    const { fetch, appels } = robot([{ status: 200, body: { id: "200000000000000001" } }, { status: 200, body: { id: "1" } }]);
    expect(await envoyerEnPrive("100000000000000001", message, { token: "t", fetch })).toBe("envoye");
    expect(appels.map((a) => a.url)).toEqual(["https://discord.com/api/v10/users/@me/channels", "https://discord.com/api/v10/channels/200000000000000001/messages"]);
    expect(JSON.parse(String(appels[0]?.init.body))).toEqual({ recipient_id: "100000000000000001" });
    expect(appels[0]?.init.redirect).toBe("error");
  });

  it("compte un joueur aux messages privés fermés, et distingue une panne", async () => {
    const ferme = robot([{ status: 200, body: { id: "200000000000000001" } }, { status: 403, body: { code: 50007 } }]);
    expect(await envoyerEnPrive("100000000000000001", message, { token: "t", fetch: ferme.fetch })).toBe("ferme");
    const panne = robot([{ status: 500 }]);
    expect(await envoyerEnPrive("100000000000000001", message, { token: "t", fetch: panne.fetch })).toBe("echec");
  });

  it("attend quand Discord demande de ralentir, puis réessaie une fois", async () => {
    const attentes: number[] = [];
    const { fetch } = robot([{ status: 429, body: { retry_after: 1.5 } }, { status: 200, body: { id: "200000000000000001" } }, { status: 200 }]);
    expect(await envoyerEnPrive("100000000000000001", message, { token: "t", fetch, wait: async (ms) => void attentes.push(ms) })).toBe("envoye");
    expect(attentes).toEqual([1600]);
  });
});

describe("le passage du robot", () => {
  const lu = (r: RendusDesPrix): LectureDesRendus => ({ etat: "lu", reponse: r });
  const data = (n: number, sansDiscord: number[] = []): RendusDesPrix => {
    const rendus = Array.from({ length: n }, (_, i) => lireRendusDesPrix(reponse([joueur(i + 1, sansDiscord.includes(i + 1) ? { discord: null } : {})]))!.rendus[0]!) as RenduDUnJoueur[];
    return { comptes: n, total: n * 2500, le: "2026-11-21T23:00:00Z", jusquA: n, rendus };
  };
  const passer = async (r: RendusDesPrix, stored: RendusSendState | null, prive: (n: number) => "envoye" | "ferme" | "echec" = () => "envoye", maxPrives?: number) => {
    const notes: RendusSendState[] = [];
    const publics: number[] = [];
    const prives: number[] = [];
    const resultat = await rendusPass({
      stored,
      lire: async (apres) => lu({ ...r, rendus: r.rendus.filter((x) => x.n > (apres ?? 0)).slice(0, 25) }),
      envoyerPublic: async () => (publics.push(1), true),
      envoyerPrive: async (x) => (prives.push(x.n), prive(x.n)),
      note: (s) => notes.push({ ...s }),
      now: new Date("2026-11-22T08:00:00Z"),
      log: () => {},
      ...(maxPrives === undefined ? {} : { maxPrives }),
    });
    return { resultat, notes, publics, prives };
  };

  it("poste le public une fois, puis chaque joueur avec Discord, dans l'ordre", async () => {
    const { resultat, notes, publics, prives } = await passer(data(3, [2]), null);
    expect(publics).toEqual([1]);
    expect(prives).toEqual([1, 3]);
    expect(resultat).toEqual({ public: true, prives: 2, fermes: 0, sansDiscord: 1, reste: false });
    expect(notes.at(-1)).toEqual({ public_le: "2026-11-22T08:00:00.000Z", jusqu_a: 3, prives: 2, fermes: 0, sans_discord: 1, fini: true });
  });

  it("reprend où il en était, sans rien renvoyer", async () => {
    const { publics, prives } = await passer(data(3), { ...ETAT_DE_DEPART, public_le: "2026-11-22T07:00:00Z", jusqu_a: 2, prives: 2 });
    expect(publics).toEqual([]);
    expect(prives).toEqual([3]);
  });

  it("s'arrête à une panne sans avancer, et à la limite du passage", async () => {
    const panne = await passer(data(3), null, (n) => (n === 2 ? "echec" : "envoye"));
    expect(panne.resultat.reste).toBe(true);
    expect(panne.notes.at(-1)?.jusqu_a).toBe(1);
    const limite = await passer(data(30), null, () => "envoye", 10);
    expect(limite.prives.length).toBe(10);
    expect(limite.resultat.reste).toBe(true);
    expect(limite.notes.at(-1)?.fini).toBeUndefined();
    const tout = await passer(data(30), null);
    expect(tout.prives.length).toBe(30);
    expect(tout.resultat.reste).toBe(false);
  });

  it("passe un joueur dont le message échoue ESSAIS_PAR_JOUEUR passages de suite, sans bloquer les suivants", async () => {
    let etat: RendusSendState | null = { ...ETAT_DE_DEPART, public_le: "2026-11-22T07:00:00Z" };
    for (let i = 1; i < ESSAIS_PAR_JOUEUR; i++) {
      const p = await passer(data(2), etat, (n) => (n === 1 ? "echec" : "envoye"));
      expect(p.prives).toEqual([1]);
      etat = p.notes.at(-1)!;
      expect(etat.bloque).toEqual({ n: 1, fois: i });
    }
    const dernier = await passer(data(2), etat, (n) => (n === 1 ? "echec" : "envoye"));
    expect(dernier.prives).toEqual([1, 2]);
    expect(dernier.notes.at(-1)).toMatchObject({ jusqu_a: 2, prives: 1, abandons: 1, fini: true });
    expect(dernier.notes.at(-1)?.bloque).toBeUndefined();
  });

  it("ne fait rien tant que le serveur n'a pas la migration, ou personne à rembourser", async () => {
    const notes: unknown[] = [];
    const absent = await rendusPass({ stored: null, lire: async () => ({ etat: "fonction-absente", warning: "pas collée" }), envoyerPublic: async () => true, envoyerPrive: async () => "envoye", note: (s) => notes.push(s), now: new Date(), log: () => {} });
    expect(absent.public).toBe(false);
    const personne = await passer({ comptes: 0, total: 0, le: null, jusquA: null, rendus: [] }, null);
    expect(personne.publics).toEqual([]);
    expect(notes).toEqual([]);
    // Personne à rembourser : l'état passe à fini, le robot n'appelle plus.
    expect(personne.notes.at(-1)?.fini).toBe(true);
  });
});

describe("l'état noté et la lecture", () => {
  it("lit l'état, garde le plus avancé, et n'écrit ni identifiant ni nom", () => {
    const s = { public_le: "2026-11-22T08:00:00Z", jusqu_a: 12, prives: 10, fermes: 1, sans_discord: 1 };
    expect(parseRendusState(JSON.stringify(s)).state).toEqual(s);
    expect(parseRendusState("{").state).toBeNull();
    expect(mergeRendusStates(s, { ...s, jusqu_a: 5, public_le: null })).toEqual(s);
    expect(Object.keys(ETAT_DE_DEPART).sort()).toEqual(["fermes", "jusqu_a", "prives", "public_le", "sans_discord"]);
  });

  it("ne montre ni lien, ni clé, ni identifiant Discord dans un message d'erreur", () => {
    const m = messageSur(new Error("échec https://zxa.supabase.co/rest sb_secret_abcdef 100000000000000001"), ["sb_secret_abcdef"]);
    expect(m).not.toMatch(/https|sb_secret|100000000000000001/);
  });

  it("dit que la migration manque, sans rien envoyer", async () => {
    const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_x" };
    const absente = await lireLesRendus(null, env, async () => {
      throw Object.assign(new Error("Could not find the function public.rendus_des_prix"), { code: "PGRST202" });
    });
    expect(absente.etat).toBe("fonction-absente");
    expect((await lireLesRendus(null, {}, async () => null)).etat).toBe("sans-reglage");
    expect((await lireLesRendus(null, env, async () => ({ ok: "oui" }))).etat).toBe("panne");
    const ok = await lireLesRendus(null, env, async () => reponse([joueur(1)]));
    expect(ok.etat === "lu" && ok.reponse.rendus.length).toBe(1);
  });
});
