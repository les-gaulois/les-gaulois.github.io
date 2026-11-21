import { describe, expect, it } from "vitest";
import { WIN_TIERS } from "../../src/lib/paliers";
import { chiffresDesCartes, lireChiffresDuJoueur, pointsDuServeur, tauxDeVictoire, victoiresEnMots } from "../../src/lib/jeu/chiffres-de-carte";
import { enCapitales, largeurDuTexte, lignesDuTexte, masqueDuTexte, nombreEcrit, signesInconnus } from "../../src/lib/jeu/ecriture";
import { GRANDES_ICONES, PETITES_ICONES, grandeIcone, petiteIcone } from "../../src/lib/jeu/icones";
import { logo } from "../../src/lib/jeu/logo";
import { JETONS_DES_PIECES } from "../../src/lib/jeu/palette";
import { NOMS_DES_INSIGNES, PALIERS_DE_VICTOIRES, cheminDesPaliers, insigne, rangDuPalier } from "../../src/lib/jeu/paliers-de-victoires";
import { PIECES_EN_NEUF_PARTS, compteur, etiquette } from "../../src/lib/jeu/pieces";
import { Planche, R, cerne, lireCouleur, rr } from "../../src/lib/jeu/planche";
import type { RecordPersonnel, SerieEnCours } from "../../src/lib/serie-en-cours";
import type { StoredMember } from "../../src/lib/schemas";

// Le kit en pixels de « Mon Gaulois » (src/lib/jeu/, 21 novembre 2026) : la planche, l'écriture, les pièces, les icônes, les
// quatorze insignes et les chiffres de « Ma carte ».

describe("la planche du kit", () => {
  it("lit les couleurs du kit, et refuse une couleur illisible", () => {
    expect(lireCouleur("#ffd84a")).toEqual([255, 216, 74, 1]);
    expect(lireCouleur("#fff")).toEqual([255, 255, 255, 1]);
    expect(lireCouleur("rgba(4,7,22,.75)")).toEqual([4, 7, 22, 0.75]);
    expect(lireCouleur("hsl(200 88% 72%)")[3]).toBe(1);
    expect(() => lireCouleur("bleu")).toThrow();
  });

  it("peint comme une toile : un plein remplace, une couleur transparente se pose par-dessus", () => {
    const p = new Planche(4, 4);
    R(p, 0, 0, 4, 4, "#000000");
    R(p, 1, 1, 1, 1, "rgba(255,255,255,.5)");
    expect(p.couleur(1, 1)?.[0]).toBeGreaterThan(120);
    expect(p.couleur(1, 1)?.[0]).toBeLessThan(135);
    p.clearRect(0, 0, 1, 1);
    expect(p.couleur(0, 0)).toBeNull();
  });

  it("taille les coins en marches et pose le cerne d'encre autour du dessin", () => {
    const p = new Planche(10, 10);
    rr(p, 1, 1, 8, 8, 2, "#ffd84a");
    expect(p.pleine(1, 1)).toBe(false);
    expect(p.pleine(3, 1)).toBe(true);
    cerne(p);
    expect(p.couleur(3, 0)?.slice(0, 3)).toEqual([7, 11, 31]);
  });
});

describe("l'écriture en pixels", () => {
  it("écrit tout ce que montre le cadre du jeu, accents compris, sans signe inconnu", () => {
    const mots = ["Ma carte", "Vestiaire", "Pass", "Forge", "Boutique", "Boosters", "Vitrine", "Loterie", "Mes chiffres", "Victoires", "Points au clan", "Série", "Utilité", "Niveau", "Habiller", "Prestige 1", "Sans prestige", "Légende", "Record 9", "Palier 12", "12 480", "137 / 200", "Nouveau", "+90", "Ce soir", "Demain", "5 jours"];
    for (const m of mots) expect(signesInconnus(enCapitales(m)), m).toEqual([]);
    expect(enCapitales("« Œuvre » d’or")).toBe('"OEUVRE" D\'OR');
  });

  it("mesure un texte en cases : une case entre deux signes", () => {
    expect(largeurDuTexte("A")).toBe(5);
    expect(largeurDuTexte("AB")).toBe(11);
    expect(largeurDuTexte("I")).toBe(3);
    const m = masqueDuTexte("MA CARTE");
    expect(m.width).toBe(largeurDuTexte("MA CARTE"));
    expect(m.height).toBe(8);
  });

  it("coupe en lignes sans couper un mot, et écrit les nombres à la française", () => {
    expect(lignesDuTexte("LE CASQUE DE BRONZE", 60)).toEqual(["LE CASQUE", "DE BRONZE"]);
    expect(nombreEcrit(12480)).toBe("12 480");
    expect(nombreEcrit(3000)).toBe("3 000");
    expect(nombreEcrit(42)).toBe("42");
  });
});

describe("les pièces et les icônes", () => {
  it("dessine chaque pièce en neuf parts plus grande que ses bords, dans les deux thèmes", () => {
    for (const piece of PIECES_EN_NEUF_PARTS) {
      for (const theme of ["clair", "sombre"] as const) {
        const p = piece.dessin(JETONS_DES_PIECES[theme]);
        const [haut, droite, bas, gauche] = piece.bords;
        expect(p.width, piece.nom).toBeGreaterThan(gauche + droite);
        expect(p.height, piece.nom).toBeGreaterThan(haut + bas);
      }
    }
    const noms = PIECES_EN_NEUF_PARTS.map((p) => p.nom);
    for (const n of ["panneau", "ecran", "tube", "ruban", "ruban-bleu", "btn-or-repos", "btn-or-survol", "btn-or-enfonce", "btn-bleu-repos", "btn-bleu-survol", "btn-bleu-enfonce"]) expect(noms).toContain(n);
  });

  it("un écran du jeu garde le fond de page du thème en son centre", () => {
    const ecran = PIECES_EN_NEUF_PARTS.find((p) => p.nom === "ecran")!;
    expect(ecran.dessin(JETONS_DES_PIECES.clair).couleur(16, 16)?.slice(0, 3)).toEqual([255, 255, 255]);
    expect(ecran.dessin(JETONS_DES_PIECES.sombre).couleur(16, 16)?.slice(0, 3)).toEqual([10, 18, 48]);
  });

  it("dessine les grandes icônes sur 24 cases et les petites sur 16, sans rien laisser vide", () => {
    for (const nom of GRANDES_ICONES) {
      const p = grandeIcone(nom);
      expect([p.width, p.height], nom).toEqual([24, 24]);
      let pleines = 0;
      for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (p.pleine(x, y)) pleines++;
      expect(pleines, nom).toBeGreaterThan(100);
    }
    for (const nom of PETITES_ICONES) expect([petiteIcone(nom).width, petiteIcone(nom).height], nom).toEqual([16, 16]);
    for (const n of ["ma-carte", "vestiaire", "sentier", "forge", "boutique", "pochettes", "vitrine", "loterie", "retour"]) expect(GRANDES_ICONES).toContain(n);
  });

  it("dessine le logo, plus fin et avec son filet tricolore en grand", () => {
    const petit = logo(false);
    const grand = logo(true);
    expect(grand.width).toBeGreaterThan(petit.width * 1.8);
    expect(grand.height).toBeGreaterThan(petit.height * 1.8);
  });

  it("met un mot dans une étiquette assez large, et un rouleau par chiffre au compteur", () => {
    expect(etiquette("3", "rouge").width).toBe(11);
    expect(etiquette("NOUVEAU", "rouge").width).toBe(largeurDuTexte("NOUVEAU") + 6);
    expect(compteur(1925).width).toBe(10 * 4 + 3 - 1);
  });
});

describe("les quatorze paliers de victoires", () => {
  it("sont ceux voulus par le pilote, chacun avec son insigne", () => {
    expect([...PALIERS_DE_VICTOIRES]).toEqual([10, 25, 50, 100, 200, 350, 500, 700, 900, 1000, 1500, 2000, 2500, 3000]);
    expect(NOMS_DES_INSIGNES).toHaveLength(14);
    for (let i = 0; i < 14; i++) expect([insigne(i).width, insigne(i).height]).toEqual([24, 24]);
    expect(() => insigne(14)).toThrow();
  });

  it("l'échelle du site (WIN_TIERS) est l'ancienne, ou celle des insignes, jamais une troisième", () => {
    // Une autre session passe WIN_TIERS aux quatorze paliers : elle doit alors reprendre PALIERS_DE_VICTOIRES.
    const ancienne = [10, 50, 100, 250, 500, 1000, 2500, 5000];
    expect([[...PALIERS_DE_VICTOIRES], ancienne]).toContainEqual([...WIN_TIERS]);
  });

  it("donne le palier atteint, le suivant et la part du chemin", () => {
    expect(rangDuPalier(9)).toBeNull();
    expect(rangDuPalier(10)).toBe(0);
    expect(rangDuPalier(137)).toBe(3);
    expect(cheminDesPaliers(0)).toEqual({ atteint: null, suivant: { rang: 0, seuil: 10 }, part: 0 });
    const c = cheminDesPaliers(137);
    expect(c.atteint).toEqual({ rang: 3, seuil: 100 });
    expect(c.suivant).toEqual({ rang: 4, seuil: 200 });
    expect(c.part).toBeCloseTo(0.37);
    expect(cheminDesPaliers(3500)).toEqual({ atteint: { rang: 13, seuil: 3000 }, suivant: null, part: 1 });
  });
});

describe("les chiffres de « Ma carte »", () => {
  const membre = (o: Partial<StoredMember>): StoredMember =>
    ({ role: "member", joinedAt: "2026-05-01T00:00:00.000Z", publicId: "abc", username: "Exemple", team: { wins: 137, losses: 48 }, account: { level: 42, prestige: 1, legend: false }, ...o }) as StoredMember;
  const serie: SerieEnCours = { victoires: 4, auMoins: false, depuis: "2026-11-20T10:00:00.000Z", jusqua: "2026-11-21T10:00:00.000Z", releve: "2026-11-21T11:00:00.000Z" };
  const record = { victoires: 9, auMoins: false, luesDepuis: "2026-04-10T00:00:00.000Z" } as RecordPersonnel;

  it("reprend les chiffres de la fiche, datés, sous le pseudo public, et rien des anonymes ni des homonymes", () => {
    const membres = [membre({}), membre({ publicId: null, username: null }), membre({ publicId: "x1", username: "Double" }), membre({ publicId: "x2", username: "Double" }), membre({ publicId: "z", username: "SansStats", team: null })];
    const c = chiffresDesCartes(membres, "2026-11-21T12:00:00.000Z", new Map([["abc", serie]]), new Map([["abc", record]]), {
      lignes: [{ nom: "Exemple", utilite: 118, parties: 37 }],
      ids: new Map([["Exemple", "abc"]]),
      fait: "2026-11-21T09:00:00.000Z",
    });
    expect(Object.keys(c.joueurs)).toEqual(["Exemple"]);
    expect(c.joueurs["Exemple"]).toEqual({
      victoires: 137,
      defaites: 48,
      serie: { victoires: 4, auMoins: false, releve: serie.releve },
      record: { victoires: 9, auMoins: false, luesDepuis: record.luesDepuis },
      utilite: { moyenne: 118, parties: 37 },
      niveau: { niveau: 42, prestige: 1, legende: false },
    });
    expect(c.liste).toBe("2026-11-21T12:00:00.000Z");
    expect(c.utilite).toBe("2026-11-21T09:00:00.000Z");
    // L'identifiant public n'est jamais publié.
    expect(JSON.stringify(c)).not.toContain("abc");
  });

  it("n'écrit pas l'utilité d'un autre membre qui porterait le même pseudo au classement", () => {
    const c = chiffresDesCartes([membre({})], null, new Map(), new Map(), { lignes: [{ nom: "Exemple", utilite: 118, parties: 37 }], ids: new Map([["Exemple", "autre"]]), fait: null });
    expect(c.joueurs["Exemple"]?.utilite).toBeNull();
  });

  it("lit le fichier publié pour le joueur connecté, et distingue un pseudo absent d'un fichier abîmé", () => {
    const fichier = JSON.parse(JSON.stringify(chiffresDesCartes([membre({})], "2026-11-21T12:00:00.000Z", new Map([["abc", serie]]), new Map([["abc", record]]), { lignes: [], ids: new Map(), fait: null })));
    const lu = lireChiffresDuJoueur(fichier, "Exemple");
    expect(lu.kind).toBe("lus");
    if (lu.kind !== "lus") return;
    expect(lu.chiffres.victoires).toBe(137);
    expect(lu.chiffres.serie).toEqual({ victoires: 4, auMoins: false, releve: serie.releve });
    expect(lu.liste).toBe("2026-11-21T12:00:00.000Z");
    expect(lireChiffresDuJoueur(fichier, "Inconnu")).toEqual({ kind: "absent" });
    expect(lireChiffresDuJoueur(fichier, null)).toEqual({ kind: "absent" });
    expect(lireChiffresDuJoueur(fichier, "__proto__")).toEqual({ kind: "absent" });
    expect(lireChiffresDuJoueur({ joueurs: { Exemple: { victoires: -1, defaites: 0 } } }, "Exemple")).toEqual({ kind: "illisible" });
    expect(lireChiffresDuJoueur("rien", "Exemple")).toEqual({ kind: "illisible" });
    // Une série sans date ne s'affiche pas : elle se lirait comme d'aujourd'hui.
    const sansDate = { joueurs: { Exemple: { victoires: 3, defaites: 1, serie: { victoires: 2, auMoins: false } } } };
    const l2 = lireChiffresDuJoueur(sansDate, "Exemple");
    expect(l2.kind === "lus" ? l2.chiffres.serie : "?").toBeNull();
  });

  it("le taux de victoire sans partie n'est pas zéro, les points ne viennent que du serveur, et les victoires s'accordent", () => {
    expect(tauxDeVictoire({ victoires: 0, defaites: 0 })).toBeNull();
    expect(tauxDeVictoire({ victoires: 3, defaites: 1 })).toBe(75);
    expect(pointsDuServeur({ ok: true, solde: 120 })).toBeNull();
    // Les points ne valent qu'avec leur jour de départ : sans lui, ils passeraient pour le total de toutes ses parties.
    expect(pointsDuServeur({ ok: true, points_total: 64.5 })).toBeNull();
    expect(pointsDuServeur({ ok: true, points_total: 64.5, depart: "2026-11-01" })).toEqual({ points: 64.5, depuis: "2026-11-01" });
    expect(pointsDuServeur({ points_total: -2, depart: "2026-11-01" })).toBeNull();
    expect(victoiresEnMots(1)).toBe("1 victoire");
    expect(victoiresEnMots(1974)).toBe("1 974 victoires");
  });
});
