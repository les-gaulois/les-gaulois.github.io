import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  casesDuFamilier,
  defautsDuFamilier,
  ECART_DU_FAMILIER,
  FAMILIER_HAUTEUR,
  FAMILIER_LARGEUR,
  familierAPoser,
  gauloisEtFamilier,
  tailleDuFamilier,
  TAILLES,
} from "../../supabase/functions/code-discord/familiers/familier";
import { FAMILIERS, FAMILLES, familierDe } from "../../supabase/functions/code-discord/familiers/index";
import { casesDuGaulois, DECOR_LARGEUR, decrireLaScene, GAULOIS_HAUTEUR, GAULOIS_LARGEUR, imageDeLaScene, imageDuGaulois, IMAGE_GAULOIS, placeDuGroupe, PLACE_DU_LOGO, TENUE_DE_DEPART } from "../../supabase/functions/code-discord/gaulois";
import { gauloisMessage } from "../../supabase/functions/code-discord/index";
import { annonceEnMots, choseDe, lireReponseDesAchats, nouveautes, objetEnMots, titreEnMots, vignetteDeLAchat, type AnnonceDesAchats } from "../../src/lib/achats-discord";
import { achatsCard } from "../../src/lib/achats-image";
import { GazetteFonts } from "../../src/lib/gazette-image";
import { ORDRE_RARETES } from "../../src/lib/gaulois";
import { CHANCES_POCHETTE_FAMILIERS, PRIX_POCHETTE_FAMILIERS, type MesFamiliers } from "../../src/lib/village/contrat";
import {
  apercuAvecFamilier,
  chanceDuFamilier,
  chancesPourMoi,
  familiersParRarete,
  lireChoixFamilier,
  lireMesFamiliers,
  lirePochetteFamiliers,
  manquePourOuvrir,
  messageDesFamiliers,
  restantsParRarete,
} from "../../src/lib/village/familiers";

// Sous Windows, Git rend le fichier avec des fins de ligne CRLF : les motifs ci-dessous lisent des « \n ».
const MIGRATION = readFileSync("supabase/migrations/20261115000800_familiers_du_gaulois.sql", "utf8").replace(/\r\n/g, "\n");

const tous = new Set<string>();
const sansRien = new Set<string>();

describe("les familiers dessinés", () => {
  it("sont 100, tous différents, sans défaut de dessin", () => {
    expect(FAMILIERS).toHaveLength(100);
    expect(new Set(FAMILIERS.map((f) => f.id)).size).toBe(100);
    for (const familier of FAMILIERS) expect(defautsDuFamilier(familier), familier.id).toEqual([]);
  });

  it("font cinq familles de 20, et 30, 25, 20, 15, 10 par rareté", () => {
    expect(FAMILLES).toEqual(["Ferme", "Forêt", "Ciel et eaux", "Légendes", "Drôles"]);
    for (const famille of FAMILLES) expect(FAMILIERS.filter((f) => f.famille === famille)).toHaveLength(20);
    expect(familiersParRarete()).toEqual({ commun: 30, "peu-commun": 25, epique: 20, mystique: 15, legendaire: 10 });
  });

  it("vont de toutes les tailles : 15 minuscules, 20 petits, 25 moyens, 25 grands, 15 géants", () => {
    const attendus = { minuscule: 15, petit: 20, moyen: 25, grand: 25, geant: 15 };
    for (const taille of TAILLES) expect(FAMILIERS.filter((f) => tailleDuFamilier(f).classe === taille.id), taille.id).toHaveLength(attendus[taille.id]);
  });

  it("se lisent par leur identifiant, et rien d'autre", () => {
    expect(familierDe("phenix")?.nom).toBe("Phénix");
    expect(familierDe("inconnu")).toBeNull();
    expect(familierDe(42)).toBeNull();
    expect(familierDe(null)).toBeNull();
  });

  it("ont des cases d'une couleur « #rrggbb » ou vides, sur une grille de 64 × 64", () => {
    for (const familier of FAMILIERS) {
      const cases = casesDuFamilier(familier);
      expect(cases).toHaveLength(FAMILIER_LARGEUR * FAMILIER_HAUTEUR);
      expect(cases.every((c) => c === null || /^#[0-9a-f]{6}$/.test(c)), familier.id).toBe(true);
    }
  });
});

describe("la liste du serveur (migration des familiers)", () => {
  it("connaît exactement les familiers du dessin, avec leur rareté", () => {
    const lignes = [...MIGRATION.matchAll(/^ {2}\('([a-z-]+)', '([a-z-]+)'\)/gm)].map(([, id, rarete]) => `${id}/${rarete}`);
    expect(lignes.sort()).toEqual(FAMILIERS.map((f) => `${f.id}/${f.rarete}`).sort());
  });

  it("sème le prix et les chances du contrat, et refuse un prix sous 2 000", () => {
    const ligne = /insert into internal\.familiers_pochette \(id, prix, commun, peu_commun, epique, mystique, legendaire\) values\n {2}\(true, (\d+), (\d+), (\d+), (\d+), (\d+), (\d+)\)\non conflict \(id\) do nothing;/.exec(MIGRATION);
    expect(ligne).not.toBeNull();
    expect(Number(ligne?.[1])).toBe(PRIX_POCHETTE_FAMILIERS);
    expect(ligne?.slice(2).map(Number)).toEqual(ORDRE_RARETES.map((r) => CHANCES_POCHETTE_FAMILIERS[r]));
    expect(Object.values(CHANCES_POCHETTE_FAMILIERS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(PRIX_POCHETTE_FAMILIERS).toBeGreaterThanOrEqual(2000);
    expect(MIGRATION).toContain("prix integer not null check (prix between 2000 and 1000000)");
  });

  it("garde ses tables privées et n'ouvre ses fonctions qu'aux comptes connectés, /gaulois à la seule clé de service", () => {
    for (const table of ["internal.familiers", "internal.familiers_pochette", "internal.gaulois_familiers"]) {
      expect(MIGRATION).toContain(`alter table ${table} enable row level security;`);
      expect(MIGRATION).toContain(`revoke all on table ${table} from public, anon, authenticated;`);
    }
    for (const fonction of ["public.get_mes_familiers()", "public.ouvrir_pochette_familiers(integer)", "public.choisir_familier(text)"]) {
      expect(MIGRATION).toContain(`revoke all on function ${fonction} from public, anon, authenticated;`);
      expect(MIGRATION).toContain(`grant execute on function ${fonction} to authenticated;`);
    }
    expect(MIGRATION).toContain("grant execute on function public.discord_gaulois(text) to service_role;");
    expect(MIGRATION).not.toMatch(/grant execute on function public\.discord_gaulois\(text\) to (anon|authenticated)/);
    expect(MIGRATION).toContain("grant execute on function public.export_site() to service_role;");
    expect(MIGRATION).not.toMatch(/raw_user_meta_data|drop table|drop column|truncate|delete from/i);
  });

  it("ne donne jamais un double : le tirage ne lit que les familiers à recevoir", () => {
    expect(MIGRATION).toContain("if not exists (select 1 from internal.familiers_a_recevoir(v_uid)) then perform internal.fail('tout_possede'); end if;");
    expect(MIGRATION).toContain("from internal.familiers_a_recevoir(v_uid) a\n    where a.rarete = v_rarete");
    expect(MIGRATION).toContain("perform internal.village_debiter(v_uid, 'pochette', v_prix, 'familier/' || v_familier);");
  });
});

describe("les chances de la pochette pour un compte", () => {
  it("sont celles du serveur quand il n'a rien", () => {
    expect(chancesPourMoi(CHANCES_POCHETTE_FAMILIERS, sansRien)).toEqual({ ...CHANCES_POCHETTE_FAMILIERS });
    expect(restantsParRarete(sansRien)).toEqual(familiersParRarete());
  });

  it("sautent une rareté où il a tout, et les autres se partagent ses chances", () => {
    const communs = new Set(FAMILIERS.filter((f) => f.rarete === "commun").map((f) => f.id));
    const chances = chancesPourMoi(CHANCES_POCHETTE_FAMILIERS, communs);
    expect(chances?.commun).toBe(0);
    expect(chances?.legendaire).toBeCloseTo((4 * 100) / 55, 10);
    expect(Object.values(chances ?? {}).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
    expect(chanceDuFamilier([...communs][0] ?? "", CHANCES_POCHETTE_FAMILIERS, communs)).toBe(0);
  });

  it("font 100 en tout sur les familiers qui lui restent, et rien quand il a tout", () => {
    const quelques = new Set(FAMILIERS.filter((_, i) => i % 3 === 0).map((f) => f.id));
    const somme = FAMILIERS.reduce((s, f) => s + chanceDuFamilier(f.id, CHANCES_POCHETTE_FAMILIERS, quelques), 0);
    expect(somme).toBeCloseTo(100, 8);
    FAMILIERS.forEach((f) => tous.add(f.id));
    expect(chancesPourMoi(CHANCES_POCHETTE_FAMILIERS, tous)).toBeNull();
    expect(chanceDuFamilier("phenix", CHANCES_POCHETTE_FAMILIERS, sansRien)).toBeCloseTo(4 / 10, 10);
  });

  it("disent ce qui manque pour ouvrir", () => {
    expect(manquePourOuvrir(1500, 2000)).toBe(500);
    expect(manquePourOuvrir(2500, 2000)).toBe(0);
  });
});

const MES: MesFamiliers = {
  ok: true,
  solde: 4200,
  peut_ouvrir: true,
  pochette: { prix: 2000, chances: { ...CHANCES_POCHETTE_FAMILIERS } },
  familiers: [
    { familier: "phenix", acquis_le: "2026-11-15T20:00:00+00:00" },
    { familier: "souris-des-greniers", acquis_le: "2026-11-15T19:00:00+00:00" },
  ],
  porte: "phenix",
};

describe("la lecture des réponses du serveur", () => {
  it("lit get_mes_familiers telle quelle", () => {
    expect(lireMesFamiliers(structuredClone(MES))).toEqual(MES);
  });

  it("écarte un familier inconnu ou en double, et ne montre pas un familier qu'il n'a pas", () => {
    const lu = lireMesFamiliers({
      ...MES,
      familiers: [...MES.familiers, { familier: "inconnu", acquis_le: "2026-11-15T18:00:00Z" }, { familier: "phenix", acquis_le: "2026-11-15T17:00:00Z" }, { familier: "loup-blanc", acquis_le: "pas une date" }],
      porte: "dragon-rouge",
    });
    expect(lu?.familiers.map((f) => f.familier)).toEqual(["phenix", "souris-des-greniers"]);
    expect(lu?.porte).toBeNull();
  });

  it("refuse une réponse au solde, au prix ou aux chances illisibles", () => {
    expect(lireMesFamiliers({ ...MES, solde: -1 })).toBeNull();
    expect(lireMesFamiliers({ ...MES, peut_ouvrir: "oui" })).toBeNull();
    expect(lireMesFamiliers({ ...MES, pochette: { prix: 0, chances: MES.pochette.chances } })).toBeNull();
    expect(lireMesFamiliers({ ...MES, pochette: { prix: 2000, chances: { ...MES.pochette.chances, commun: 50 } } })).toBeNull();
    expect(lireMesFamiliers({ ...MES, familiers: "phenix" })).toBeNull();
    expect(lireMesFamiliers({ ok: false, error: "not_signed_in" })).toBeNull();
  });

  it("lit une pochette ouverte, seulement avec la rareté de la liste", () => {
    const bonne = { ok: true, solde: 2200, familier: { familier: "phenix", rarete: "legendaire" }, reste: 98 };
    expect(lirePochetteFamiliers(bonne)).toEqual(bonne);
    expect(lirePochetteFamiliers({ ...bonne, familier: { familier: "phenix", rarete: "commun" } })).toBeNull();
    expect(lirePochetteFamiliers({ ...bonne, familier: { familier: "inconnu", rarete: "commun" } })).toBeNull();
    expect(lirePochetteFamiliers({ ...bonne, reste: -1 })).toBeNull();
  });

  it("lit le choix du familier montré, aucun compris", () => {
    expect(lireChoixFamilier({ ok: true, porte: "phenix" })).toEqual({ ok: true, porte: "phenix" });
    expect(lireChoixFamilier({ ok: true, porte: null })).toEqual({ ok: true, porte: null });
    expect(lireChoixFamilier({ ok: true, porte: "inconnu" })).toBeNull();
    expect(lireChoixFamilier({ ok: true })).toBeNull();
  });

  it("donne des mots à chaque refus des familiers", () => {
    expect(messageDesFamiliers("tout_possede")).toMatch(/tous les familiers/);
    expect(messageDesFamiliers("pas_possede")).toMatch(/pochette des familiers/);
    expect(messageDesFamiliers("solde_insuffisant")).toMatch(/statères/);
  });
});

describe("le familier à côté du Gaulois", () => {
  it("se pose rogné à son cadre, à une case du Gaulois, sans jamais le couvrir", () => {
    const gaulois = casesDuGaulois(TENUE_DE_DEPART);
    for (const familier of FAMILIERS) {
      const pose = familierAPoser(familier);
      expect(pose, familier.id).not.toBeNull();
      if (!pose) continue;
      const taille = tailleDuFamilier(familier);
      expect([pose.largeur, pose.hauteur]).toEqual([taille.largeur, taille.hauteur]);
      const grille = gauloisEtFamilier(gaulois, pose);
      expect(grille.largeur).toBe(GAULOIS_LARGEUR + ECART_DU_FAMILIER + pose.largeur);
      expect(grille.hauteur).toBe(GAULOIS_HAUTEUR);
      // Les 48 premières colonnes sont celles du Gaulois, case pour case.
      for (let y = 0; y < GAULOIS_HAUTEUR; y++) {
        for (let x = 0; x < GAULOIS_LARGEUR; x++) expect(grille.cases[y * grille.largeur + x]).toBe(gaulois[y * GAULOIS_LARGEUR + x] ?? null);
      }
    }
  });

  it("garde ses pattes sur la rangée des pieds, et sa hauteur s'il vole", () => {
    const souris = familierAPoser(familierDe("souris-des-greniers")!);
    expect(souris?.auSol).toBe(true);
    expect((souris?.haut ?? 0) + (souris?.hauteur ?? 0)).toBe(FAMILIER_HAUTEUR);
    const papillon = familierAPoser(familierDe("papillon-citron")!);
    expect(papillon?.auSol).toBe(false);
  });

  it("donne au site un aperçu du Gaulois seul, ou avec son familier", () => {
    expect(apercuAvecFamilier(TENUE_DE_DEPART, null).largeur).toBe(GAULOIS_LARGEUR);
    expect(apercuAvecFamilier(TENUE_DE_DEPART, familierDe("dragon-rouge")).largeur).toBeGreaterThan(GAULOIS_LARGEUR + 40);
  });
});

describe("l'image de /gaulois avec un familier", () => {
  const scene = { lieu: "taverne", moment: { phase: "crepuscule" } } as Parameters<typeof imageDeLaScene>[1];

  it("reste la même sans familier", () => {
    const seul = imageDeLaScene(TENUE_DE_DEPART, scene);
    const sansFamilier = imageDeLaScene(TENUE_DE_DEPART, scene, [], null);
    expect(Buffer.from(sansFamilier.rgba).equals(Buffer.from(seul.rgba))).toBe(true);
    expect(Buffer.from(imageDuGaulois(TENUE_DE_DEPART, null).rgba).equals(Buffer.from(imageDuGaulois(TENUE_DE_DEPART).rgba))).toBe(true);
  });

  it("garde chaque familier dans le décor, et le Gaulois hors du logo", () => {
    const logo = { x0: PLACE_DU_LOGO.x, y0: PLACE_DU_LOGO.y, x1: PLACE_DU_LOGO.x + PLACE_DU_LOGO.cote, y1: PLACE_DU_LOGO.y + PLACE_DU_LOGO.cote };
    for (const familier of FAMILIERS) {
      const pose = familierAPoser(familier)!;
      const total = GAULOIS_LARGEUR + ECART_DU_FAMILIER + pose.largeur;
      const { ox, fx } = placeDuGroupe(pose);
      expect(fx, familier.id).toBe(ox + GAULOIS_LARGEUR + ECART_DU_FAMILIER);
      expect(ox, familier.id).toBeGreaterThanOrEqual(0);
      expect(ox + total, familier.id).toBeLessThanOrEqual(DECOR_LARGEUR);
      // Aucune case du Gaulois de départ sous le logo du clan.
      const gaulois = casesDuGaulois(TENUE_DE_DEPART);
      gaulois.forEach((couleur, i) => {
        if (!couleur) return;
        const px = (ox + (i % GAULOIS_LARGEUR)) * IMAGE_GAULOIS.echelle;
        const py = (72 - 62 + Math.floor(i / GAULOIS_LARGEUR)) * IMAGE_GAULOIS.echelle;
        const dessous = px + IMAGE_GAULOIS.echelle > logo.x0 && px < logo.x1 && py + IMAGE_GAULOIS.echelle > logo.y0 && py < logo.y1;
        expect(dessous, familier.id).toBe(false);
      });
    }
  });

  it("dessine le familier dans l'image, et le nomme pour qui ne la voit pas", () => {
    const phenix = familierDe("phenix")!;
    const avec = imageDeLaScene(TENUE_DE_DEPART, scene, [], familierAPoser(phenix));
    const sans = imageDeLaScene(TENUE_DE_DEPART, scene);
    expect(Buffer.from(avec.rgba).equals(Buffer.from(sans.rgba))).toBe(false);
    expect(decrireLaScene(TENUE_DE_DEPART, scene, phenix.nom)).toMatch(/Son familier : phénix\.$/);
    const message = gauloisMessage(TENUE_DE_DEPART, scene, null, phenix.nom);
    expect(JSON.stringify(message)).toContain("phénix");
    expect(JSON.stringify(gauloisMessage(TENUE_DE_DEPART, scene))).not.toContain("familier");
  });
});

describe("un familier annoncé sur Discord, comme les autres achats", () => {
  const ligne = (p: Record<string, unknown> = {}) => ({ id: 41, nature: "pochette", emplacement: "familier", objet: "phenix", compte: 7, nom: "Brennos", discord: "brennos", le: "2026-11-15T21:05:00.000Z", ...p });

  it("se lit au serveur : « familier », seulement sorti de la pochette", () => {
    const lu = lireReponseDesAchats({ ok: true, jusqu_a: 45, achats: [ligne(), ligne({ id: 42, objet: "inconnu" }), ligne({ id: 43, nature: "achat" }), ligne({ id: 44, emplacement: "tete", objet: "couronne", nature: "pochette" })] });
    expect(lu?.achats.map((a) => `${a.emplacement}/${a.objet}`)).toEqual(["familier/phenix", "tete/couronne"]);
    expect(lu?.inconnus).toBe(2);
  });

  it("se dit en mots : nom, « familier », rareté, et la pochette des familiers", () => {
    const lu = lireReponseDesAchats({ ok: true, jusqu_a: 41, achats: [ligne()] })!;
    const annonce: AnnonceDesAchats = { nom: "Brennos", discord: "brennos", achats: lu.achats };
    expect(choseDe(lu.achats[0]!)).toEqual({ nom: "Phénix", rarete: "legendaire", place: "familier" });
    expect(objetEnMots(lu.achats[0]!)).toBe("Phénix (familier, rareté légendaire)");
    expect(titreEnMots(annonce, "@brennos")).toBe("@brennos a un nouveau familier");
    const mots = annonceEnMots(annonce).join(" ");
    expect(mots).toContain("dans la pochette des familiers");
    expect(mots).not.toContain("pochette surprise");
    const mixte: AnnonceDesAchats = { ...annonce, achats: [lu.achats[0]!, { ...lu.achats[0]!, id: 50, emplacement: "tete", objet: "couronne" }] };
    expect(nouveautes(mixte.achats)).toBe("1 nouvel objet et 1 nouveau familier");
    expect(titreEnMots(mixte, "Brennos")).toBe("Brennos habille son Gaulois : 1 nouvel objet et 1 nouveau familier");
  });

  it("se dessine dans sa vitrine, du plus petit au plus grand, avec « Familier » et son origine", () => {
    const fonts = new GazetteFonts(process.cwd());
    for (const id of ["souris-des-greniers", "canard-dore-couronne", "paon-blanc-en-roue"]) {
      const achat = { ...lireReponseDesAchats({ ok: true, jusqu_a: 41, achats: [ligne({ objet: id })] })!.achats[0]! };
      const vignette = vignetteDeLAchat(achat);
      expect(vignette, id).not.toBeNull();
      const annonce: AnnonceDesAchats = { nom: "Brennos", discord: null, achats: [achat] };
      const card = achatsCard(annonce, [vignette], "https://les-gaulois.github.io", fonts.width);
      const textes = card.texts.map((t) => t.text).join(" | ");
      // Le chiffre clé s'écrit en capitales : « FAMILIER » au lieu d'« OBJET ».
      expect(textes, id).toContain("FAMILIER");
      expect(textes, id).toContain("Nouveau familier pour son Gaulois");
      expect(textes, id).toContain("Pochette des familiers");
      expect(textes, id).toContain(familierDe(id)!.nom);
      expect(card.dessins, id).toHaveLength(1);
      const d = card.dessins[0]!;
      expect(d.x + d.decor.largeur * d.echelle, id).toBeLessThanOrEqual(card.width);
      expect(d.y + d.decor.hauteur * d.echelle, id).toBeLessThanOrEqual(card.height);
    }
  });
});
