import { describe, expect, it } from "vitest";
import { GARDE_ROBE } from "../../supabase/functions/code-discord/garde-robe/index";
import {
  EMPLACEMENTS,
  EMPLACEMENTS_OBJETS,
  EMPLACEMENTS_VISAGE,
  GAULOIS_HAUTEUR,
  GAULOIS_LARGEUR,
  OBJETS,
  ORDRE_RARETES,
  RARETES_DES_OBJETS,
  PEAUX,
  POILS,
  TENUE_DE_DEPART,
  VISAGE_D_AVANT,
  casesDuGaulois,
  couleursDeBase,
  type Catalogue,
  type Emplacement,
} from "../../supabase/functions/code-discord/gaulois";
import { MOTS_INTERDITS } from "../../src/lib/village/consigne-repliques";
import { SIGNES_PERMIS, normaliserPourLesMots } from "../../src/lib/village/vie-releve";

/**
 * La garde-robe du 14 novembre 2026 : 200 objets de boutique, et le visage gratuit au choix ; puis, le 15 novembre 2026,
 * dix coupes de cheveux et dix barbes gratuites.
 */
const AU_CHOIX: readonly string[] = ["cheveux", "barbe", ...EMPLACEMENTS_VISAGE];
const BOUTIQUE = GARDE_ROBE.filter((o) => !AU_CHOIX.includes(o.emplacement) && o.rarete !== "divin");
const VISAGE = GARDE_ROBE.filter((o) => (EMPLACEMENTS_VISAGE as readonly string[]).includes(o.emplacement));
const POILS_DU_LOT = GARDE_ROBE.filter((o) => o.emplacement === "cheveux" || o.emplacement === "barbe");
const estDuVisage = (emplacement: Emplacement) => (EMPLACEMENTS_VISAGE as readonly string[]).includes(emplacement);

/** Les lettres de couleur qu'un objet peut ajouter : jamais une couleur fixe, de peau ou de cheveux. */
const LETTRES_PROPRES = "pPqQiIEKNYZ123456789";

/** Le Gaulois nu, sans visage ni rien, pour savoir où est la peau du visage. */
const SANS_DESSIN = Object.fromEntries(EMPLACEMENTS.map((e) => [e, Object.fromEntries(Object.entries(OBJETS[e]).map(([id, o]) => [id, { ...o, dessin: null }]))])) as Catalogue;
const NU = { ...TENUE_DE_DEPART, cheveux: "aucun", barbe: "aucune", tete: "aucun", haut: "aucun", bas: "aucun", pieds: "nus", arme: "aucune" };
const PEAU_CLAIRE = new Set<string>(Object.values(PEAUX.claire.couleurs));
const CORPS_NU = casesDuGaulois(NU, { catalogue: SANS_DESSIN });

describe("la garde-robe", () => {
  it("ajoute 200 objets de boutique sur les cinq emplacements, et un visage gratuit au choix", () => {
    expect(BOUTIQUE).toHaveLength(200);
    for (const emplacement of EMPLACEMENTS_OBJETS) expect(BOUTIQUE.filter((o) => o.emplacement === emplacement).length, emplacement).toBeGreaterThanOrEqual(25);
    for (const o of BOUTIQUE) expect(o, o.id).toMatchObject({ gratuit: false });
    for (const o of BOUTIQUE) expect(ORDRE_RARETES, o.id).toContain(o.rarete);
    for (const emplacement of EMPLACEMENTS_VISAGE) expect(VISAGE.filter((o) => o.emplacement === emplacement).length, emplacement).toBeGreaterThanOrEqual(8);
    for (const o of VISAGE) expect(o, o.id).toMatchObject({ rarete: null, gratuit: true });
    expect(GARDE_ROBE.every((o) => o.emplacement !== "peau")).toBe(true);
  });

  it("ajoute dix coupes de cheveux et dix barbes, gratuites et sans rareté (demande du pilote, 15 novembre 2026)", () => {
    expect(POILS_DU_LOT.filter((o) => o.emplacement === "cheveux")).toHaveLength(10);
    expect(POILS_DU_LOT.filter((o) => o.emplacement === "barbe")).toHaveLength(10);
    for (const o of POILS_DU_LOT) expect(o, o.id).toMatchObject({ rarete: null, gratuit: true });
    expect(Object.keys(OBJETS.cheveux)).toHaveLength(15);
    expect(Object.keys(OBJETS.barbe)).toHaveLength(15);
    // La case « rien » reste la première, comme avant.
    expect(Object.keys(OBJETS.cheveux)[0]).toBe("aucun");
    expect(Object.keys(OBJETS.barbe)[0]).toBe("aucune");
  });

  it("ne cache jamais les yeux : aucune coupe ni barbe entre les sourcils et le bas des yeux", () => {
    // Le cadre de tous les modèles d'yeux, sourcils compris, calculé sur leurs dessins : un modèle plus large l'élargit.
    const cadre = { haut: GAULOIS_HAUTEUR, bas: 0, gauche: GAULOIS_LARGEUR, droite: 0 };
    for (const objet of Object.values(OBJETS.yeux)) {
      objet.dessin?.lignes.forEach((ligne, dy) => {
        for (let x = 0; x < GAULOIS_LARGEUR; x++) {
          if (ligne[x] === "." || ligne[x] === undefined) continue;
          const y = objet.dessin!.y + dy;
          Object.assign(cadre, { haut: Math.min(cadre.haut, y), bas: Math.max(cadre.bas, y), gauche: Math.min(cadre.gauche, x), droite: Math.max(cadre.droite, x) });
        }
      });
    }
    // Aujourd'hui : rangées 16 à 23, colonnes 16 à 31.
    expect(cadre.bas - cadre.haut).toBeGreaterThanOrEqual(5);
    for (const emplacement of ["cheveux", "barbe"] as const) {
      for (const [id, objet] of Object.entries(OBJETS[emplacement])) {
        objet.dessin?.lignes.forEach((ligne, dy) => {
          const y = objet.dessin!.y + dy;
          if (y < cadre.haut || y > cadre.bas) return;
          for (let x = cadre.gauche; x <= cadre.droite; x++) expect(ligne[x], `${emplacement}/${id} (${x}, ${y})`).toBe(".");
        });
      }
    }
  });

  it("entre tout entière au catalogue, sous des identifiants que le serveur accepte, sans doublon ni objet du lot 1 remplacé", () => {
    const cles = GARDE_ROBE.map((o) => `${o.emplacement}/${o.id}`);
    expect(new Set(cles).size).toBe(cles.length);
    for (const o of GARDE_ROBE) {
      expect(o.id, o.id).toMatch(/^[a-z][a-z-]{0,39}$/);
      expect(OBJETS[o.emplacement][o.id]?.nom, o.id).toBe(o.nom);
    }
    const total = EMPLACEMENTS.reduce((n, e) => n + Object.keys(OBJETS[e]).length, 0);
    // 74 au lot 1 : 71 cases d'avant et le visage d'avant (yeux, bouche, cicatrice).
    expect(total).toBe(74 + GARDE_ROBE.length);
  });

  it("a des noms courts, uniques, que les bulles du village laissent passer", () => {
    for (const emplacement of EMPLACEMENTS) {
      const noms = Object.values(OBJETS[emplacement]).map((o) => o.nom.toLowerCase());
      expect(new Set(noms).size, emplacement).toBe(noms.length);
    }
    for (const o of GARDE_ROBE) {
      expect(o.nom, o.id).toMatch(/^[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇŒÆ][a-zàâäéèêëîïôöùûüÿçœæ' -]*[a-zàâäéèêëîïôöùûüÿçœæ]$/);
      expect([...o.nom].length, o.id).toBeLessThanOrEqual(28);
      expect(SIGNES_PERMIS.test(o.nom), o.id).toBe(true);
      const mots = normaliserPourLesMots(o.nom);
      expect(MOTS_INTERDITS.filter((m) => mots.includes(m)), o.id).toEqual([]);
    }
  });

  it("dessine chaque objet dans la grille, une couleur à chaque case, sans changer une couleur fixe", () => {
    const fixes = new Set<string>();
    for (const peau of Object.keys(PEAUX)) for (const teinte of Object.keys(POILS)) for (const l of Object.keys(couleursDeBase({ ...TENUE_DE_DEPART, peau, teinte_cheveux: teinte }))) fixes.add(l);
    for (const o of GARDE_ROBE) {
      const propres = Object.entries(o.couleurs ?? {});
      for (const [lettre, hex] of propres) {
        expect(LETTRES_PROPRES.includes(lettre) && lettre.length === 1, `${o.id} ${lettre}`).toBe(true);
        expect(hex, `${o.id} ${lettre}`).toMatch(/^#[0-9a-f]{6}$/);
      }
      const connues = new Set([...fixes, ...propres.map(([l]) => l)]);
      expect(o.dessin.y, o.id).toBeGreaterThanOrEqual(0);
      expect(o.dessin.y + o.dessin.lignes.length, o.id).toBeLessThanOrEqual(GAULOIS_HAUTEUR);
      for (const ligne of o.dessin.lignes) {
        expect(ligne, o.id).toHaveLength(GAULOIS_LARGEUR);
        for (const lettre of ligne) if (lettre !== ".") expect(connues.has(lettre), `${o.id} « ${lettre} »`).toBe(true);
      }
      if (o.couvre !== undefined) expect(o.emplacement, o.id).toBe("tete");
    }
  });

  it("garde le visage sur la peau du visage, et chaque objet change le Gaulois qui le porte", () => {
    for (const o of VISAGE) {
      o.dessin.lignes.forEach((ligne, dy) => {
        for (let x = 0; x < GAULOIS_LARGEUR; x++) {
          if (ligne[x] === ".") continue;
          const y = o.dessin.y + dy;
          expect(y, `${o.id} rangée ${y}`).toBeLessThanOrEqual(33);
          expect(PEAU_CLAIRE.has(CORPS_NU[y * GAULOIS_LARGEUR + x] ?? ""), `${o.id} (${x}, ${y})`).toBe(true);
        }
      });
    }
    for (const o of GARDE_ROBE) {
      const vide = estDuVisage(o.emplacement) ? VISAGE_D_AVANT[o.emplacement as keyof typeof VISAGE_D_AVANT] : Object.keys(OBJETS[o.emplacement])[0]!;
      const sans = casesDuGaulois({ ...TENUE_DE_DEPART, [o.emplacement]: vide });
      expect(casesDuGaulois({ ...TENUE_DE_DEPART, [o.emplacement]: o.id }), `${o.emplacement}/${o.id}`).not.toEqual(sans);
    }
  });

  it("se range au vestiaire : la case « rien » et les gratuits d'abord, puis de la rareté la plus courante à la plus rare", () => {
    for (const emplacement of EMPLACEMENTS) {
      const rangs = Object.values(OBJETS[emplacement]).map((o) => (o.gratuit ? 0 : RARETES_DES_OBJETS[o.rarete ?? "commun"].rang));
      expect(rangs, emplacement).toEqual([...rangs].sort((a, b) => a - b));
    }
    expect(Object.keys(OBJETS.yeux)[0]).toBe(VISAGE_D_AVANT.yeux);
    expect(Object.keys(OBJETS.bouche)[0]).toBe(VISAGE_D_AVANT.bouche);
    expect(Object.keys(OBJETS.cicatrice)[0]).toBe(VISAGE_D_AVANT.cicatrice);
  });
});
