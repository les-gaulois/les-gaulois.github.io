import { describe, expect, it } from "vitest";
import { GAULOIS_HAUTEUR, GAULOIS_LARGEUR, TENUE_DE_DEPART, casesDuGaulois } from "../../src/lib/gaulois";
import { BATIMENTS, type BatimentId } from "../../src/lib/village/chantier-liste";
import { type Decor, Planche } from "../../src/lib/village/decor";
import {
  boiteDuGaulois,
  dedansALEcran,
  dedansAvecLeGaulois,
  entrerDans,
  fenetreDeLInterieur,
  gauloisDebout,
  imageDuDedans,
  interieurDeLAncre,
  interieurDeLaFenetre,
  interieursOuverts,
  lumiereDeLEndroit,
  phraseDuDedans,
} from "../../src/lib/village/ecran-interieur";
import { BATIMENTS_A_INTERIEUR, type DessinDInterieur, INTERIEURS, type InterieurId } from "../../src/lib/village/interieurs";
import { NUIT_PLEINE, PLEIN_JOUR, type Lumiere, couleurDuDedans, lumiereDuVillage, melanger } from "../../src/lib/village/lumiere";
import type { EtatDuChantier, EtatDuMonde } from "../../src/lib/village/monde-etat";
import { OMBRE } from "../../src/lib/village/monde/foule";

/*
 * La fenêtre des intérieurs (idée « Entrer dans les bâtiments », 15 novembre 2026) : qui peut entrer, l'adresse, la taille
 * d'une case à l'écran, l'image du mouvement lent, le Gaulois du visiteur posé à sa place. Les calculs de
 * `src/lib/village/ecran-interieur.ts`, avec un intérieur d'essai : les vrais dessins (`interieurs/lot-*.ts`) sont
 * contrôlés à part, dans `village-interieurs-dessins.test.ts`.
 */

/** Un intérieur d'essai : des planches, un sol, une fenêtre ; la colonne 10 change de couleur à chaque image. */
function interieurDEssai(id: InterieurId = "moulin", images = 3, place = { x: 120, pied: 180 }): DessinDInterieur {
  const largeur = 360;
  const hauteur = 200;
  return {
    id,
    titre: "Dans le moulin",
    largeur,
    hauteur,
    images,
    place,
    dessiner(lumiere: Lumiere, image: number): Decor {
      const p = new Planche(largeur, hauteur, couleurDuDedans("#8a6a48", lumiere));
      for (let x = 0; x < largeur; x++) for (let y = 181; y < hauteur; y++) p.poser(x, y, couleurDuDedans("#5c4630", lumiere));
      for (let x = 250; x < 290; x++) for (let y = 60; y < 110; y++) p.poser(x, y, "#f2c46a");
      for (let y = 0; y < hauteur; y++) p.poser(10, y, ["#202020", "#404040", "#606060", "#808080"][image % 4]!);
      return { largeur, hauteur, cases: p.cases };
    },
  };
}

/** Un chantier où les bâtiments donnés sont finis, le suivant en cours, les autres à venir. */
function chantierOu(finis: readonly BatimentId[]): EtatDuChantier {
  const enCours = BATIMENTS.find((b) => !finis.includes(b.id))?.id ?? null;
  return {
    depuis: "2026-10-31T23:00:00.000Z",
    points: 1000,
    en_cours: enCours,
    batiments: BATIMENTS.map((b) => ({ id: b.id, nom: b.nom, titre: b.titre, cout: b.cout, poses: finis.includes(b.id) ? b.cout : 0, fini_le: finis.includes(b.id) ? "2026-11-07T20:00:00.000Z" : null })),
  } as EtatDuChantier;
}
const etatOu = (finis: readonly BatimentId[]): Pick<EtatDuMonde, "chantier"> => ({ chantier: chantierOu(finis) });

/** Deux couleurs « #rrggbb » à l'arrondi près : deux unités au plus par composante. */
function proches(a: string, b: string): boolean {
  return [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 2);
}

describe("qui peut entrer", () => {
  const dessine = (ids: readonly InterieurId[]) => (id: InterieurId) => (ids.includes(id) ? interieurDEssai(id) : null);

  it("seulement dans un bâtiment fini qui a son dedans dessiné, dans l'ordre du chantier", () => {
    const etat = etatOu(["palissade", "puits", "four", "potager", "tour"]);
    expect(interieursOuverts(etat, dessine(["four", "tour", "moulin"]))).toEqual(["four", "tour"]);
    // Le four fini mais sans dessin : il garde son comportement d'aujourd'hui.
    expect(interieursOuverts(etat, dessine(["tour"]))).toEqual(["tour"]);
    // Le moulin dessiné mais pas fini : il ne s'ouvre pas.
    expect(interieursOuverts(etatOu(["palissade", "puits"]), dessine(["moulin", "four"]))).toEqual([]);
  });

  it("jamais dans un bâtiment sans dedans, même fini", () => {
    const tout = BATIMENTS.map((b) => b.id);
    const ouverts = interieursOuverts(etatOu(tout), () => interieurDEssai());
    expect(ouverts).toEqual([...BATIMENTS_A_INTERIEUR]);
    for (const sansDedans of ["palissade", "puits", "potager", "pont", "lavoir", "halle", "chene", "rempart"]) expect(ouverts).not.toContain(sansDedans);
  });

  it("sans données du chantier, personne n'entre : « pas de données » n'est jamais montré comme bâti", () => {
    expect(interieursOuverts({ chantier: null }, () => interieurDEssai())).toEqual([]);
  });

  it("avec les vrais dessins : seulement ceux qui existent", () => {
    const tout = BATIMENTS.map((b) => b.id);
    expect(interieursOuverts(etatOu(tout))).toEqual(BATIMENTS_A_INTERIEUR.filter((id) => INTERIEURS[id] !== undefined));
  });
});

describe("l'adresse et les mots", () => {
  it("#interieur-moulin nomme le dedans du moulin, et rien d'autre", () => {
    expect(fenetreDeLInterieur("moulin")).toBe("interieur-moulin");
    for (const id of BATIMENTS_A_INTERIEUR) expect(interieurDeLaFenetre(fenetreDeLInterieur(id))).toBe(id);
    for (const autre of ["interieur-puits", "interieur-", "interieur-toString", "gaulois", "chantier", "", null, undefined]) expect(interieurDeLaFenetre(autre)).toBeNull();
  });

  it("l'ancre n'ouvre qu'un intérieur ouvert aujourd'hui", () => {
    expect(interieurDeLAncre("#interieur-four", ["four"])).toBe("four");
    expect(interieurDeLAncre("interieur-four", ["four", "tour"])).toBe("four");
    expect(interieurDeLAncre("#interieur-moulin", ["four"])).toBeNull();
    expect(interieurDeLAncre("#interieur-four", [])).toBeNull();
    expect(interieurDeLAncre("#forge", ["four"])).toBeNull();
  });

  it("dit le bâtiment avec son article, sans chiffre", () => {
    expect(entrerDans("four")).toBe("Entrer dans le four à pain");
    expect(entrerDans("etable")).toBe("Entrer dans l'étable");
    expect(phraseDuDedans("moulin")).toBe("Le dedans du moulin, dessiné en pixels");
    expect(phraseDuDedans("four")).toBe("Le dedans du four à pain, dessiné en pixels");
    expect(phraseDuDedans("tour")).toBe("Le dedans de la tour de guet, dessiné en pixels");
    expect(phraseDuDedans("etable")).toBe("Le dedans de l'étable, dessiné en pixels");
    expect(phraseDuDedans("grande-tour")).toBe("Le dedans de la grande tour du clan, dessiné en pixels");
    for (const id of BATIMENTS_A_INTERIEUR) {
      expect(phraseDuDedans(id)).not.toMatch(/\d/);
      expect(entrerDans(id)).not.toMatch(/\d/);
    }
  });
});

describe("quel pixel par case", () => {
  it("la plus grande case entière qui tienne, centrée", () => {
    const t = dedansALEcran({ largeur: 360, hauteur: 200 }, { largeur: 1126, hauteur: 548 }, 1)!;
    expect(t).toMatchObject({ pixels: 2, css: 2, net: true, largeur: 720, hauteur: 400, gauche: 203, haut: 74 });
    // Juste assez : la case suivante tient.
    expect(dedansALEcran({ largeur: 360, hauteur: 200 }, { largeur: 1080, hauteur: 600 }, 1)!.pixels).toBe(3);
    expect(dedansALEcran({ largeur: 360, hauteur: 200 }, { largeur: 1079, hauteur: 600 }, 1)!.pixels).toBe(2);
    // C'est le côté le plus serré qui décide.
    expect(dedansALEcran({ largeur: 480, hauteur: 270 }, { largeur: 1900, hauteur: 300 }, 1)!.pixels).toBe(1);
  });

  it("compte en pixels de l'écran : un écran dense garde une case nette là où un pixel de la page ne tiendrait pas", () => {
    // Un téléphone (deux pixels de l'écran par pixel de la page), un dessin plus large que le panneau.
    const telephone = dedansALEcran({ largeur: 480, hauteur: 270 }, { largeur: 359, hauteur: 202 }, 2)!;
    expect(telephone).toMatchObject({ pixels: 1, css: 0.5, net: true, largeur: 240, hauteur: 135 });
    expect(dedansALEcran({ largeur: 480, hauteur: 270 }, { largeur: 359, hauteur: 202 }, 3)!).toMatchObject({ pixels: 2, net: true });
    // Un écran réglé à 125 % : deux pixels de l'écran par case, pas deux et demi.
    const portable = dedansALEcran({ largeur: 480, hauteur: 270 }, { largeur: 1000, hauteur: 600 }, 1.25)!;
    expect(portable.pixels).toBe(2);
    expect(portable.css).toBeCloseTo(1.6, 10);
  });

  it("si même un pixel de l'écran ne tient pas, le dessin est réduit au cadre, et dit qu'il n'est pas net", () => {
    const t = dedansALEcran({ largeur: 480, hauteur: 270 }, { largeur: 343, hauteur: 400 }, 1)!;
    expect(t.net).toBe(false);
    expect(t.pixels).toBeLessThan(1);
    expect(t.largeur).toBeCloseTo(343, 6);
    expect(t.hauteur).toBeCloseTo((343 * 270) / 480, 6);
  });

  it("tient toujours dans son cadre, sur un pixel de l'écran, et la case suivante ne tiendrait pas", () => {
    for (const densite of [1, 1.25, 1.5, 2, 2.625, 3]) {
      for (let l = 200; l <= 2000; l += 37) {
        for (let h = 120; h <= 1100; h += 53) {
          for (const dessin of [
            { largeur: 320, hauteur: 180 },
            { largeur: 400, hauteur: 240 },
            { largeur: 480, hauteur: 270 },
          ]) {
            const t = dedansALEcran(dessin, { largeur: l, hauteur: h }, densite)!;
            expect(t.largeur).toBeLessThanOrEqual(l + 1e-6);
            expect(t.hauteur).toBeLessThanOrEqual(h + 1e-6);
            expect(t.gauche + t.largeur).toBeLessThanOrEqual(l + 1);
            expect(t.haut + t.hauteur).toBeLessThanOrEqual(h + 1);
            expect(Math.abs(t.gauche * densite - Math.round(t.gauche * densite))).toBeLessThan(1e-6);
            expect(Math.abs(t.haut * densite - Math.round(t.haut * densite))).toBeLessThan(1e-6);
            if (t.net) {
              expect(Number.isInteger(t.pixels)).toBe(true);
              const plus = (t.pixels + 1) / densite;
              expect(dessin.largeur * plus > l + 1e-6 || dessin.hauteur * plus > h + 1e-6).toBe(true);
            }
          }
        }
      }
    }
  });

  it("rien tant que le cadre n'a pas de taille ; une densité illisible vaut un", () => {
    expect(dedansALEcran({ largeur: 360, hauteur: 200 }, { largeur: 0, hauteur: 400 }, 1)).toBeNull();
    expect(dedansALEcran({ largeur: 360, hauteur: 200 }, { largeur: 800, hauteur: -1 }, 1)).toBeNull();
    expect(dedansALEcran({ largeur: 360, hauteur: 200 }, { largeur: 800, hauteur: 500 }, Number.NaN)!.pixels).toBe(2);
    expect(dedansALEcran({ largeur: 360, hauteur: 200 }, { largeur: 800, hauteur: 500 }, 0)!.pixels).toBe(2);
  });
});

describe("l'image du mouvement lent", () => {
  it("une image par seconde, en boucle", () => {
    expect([0, 0.5, 0.99, 1, 1.5, 2, 2.9, 3, 4, 5].map((s) => imageDuDedans(s, 3, false))).toEqual([0, 0, 0, 1, 1, 2, 2, 0, 1, 2]);
    expect(imageDuDedans(-1, 3, false)).toBe(2);
    // Jamais plus d'un changement par seconde, au rythme de l'horloge du monde (huit battements par seconde).
    let changements = 0;
    for (let temps = 1; temps <= 80; temps++) if (imageDuDedans(temps / 8, 4, false) !== imageDuDedans((temps - 1) / 8, 4, false)) changements++;
    expect(changements).toBeLessThanOrEqual(10);
  });

  it("figé (pause, « réduire les animations ») ou sans mouvement : l'image 0, toujours", () => {
    for (const s of [0, 1, 2, 3, 17.5, 1e6]) {
      expect(imageDuDedans(s, 4, true)).toBe(0);
      expect(imageDuDedans(s, 1, false)).toBe(0);
      expect(imageDuDedans(s, 0, false)).toBe(0);
    }
    expect(imageDuDedans(Number.NaN, 3, false)).toBe(0);
  });
});

describe("le Gaulois du visiteur, posé à sa place", () => {
  /** Un Gaulois d'essai : vide, sauf sa colonne du milieu (la 24) et la rangée de ses pieds (la 63). */
  function gauloisDEssai(): Decor {
    const cases = new Array<string | null>(GAULOIS_LARGEUR * GAULOIS_HAUTEUR).fill(null);
    for (let y = 0; y < GAULOIS_HAUTEUR; y++) cases[y * GAULOIS_LARGEUR + 24] = "#c8283a";
    for (let x = 14; x < 34; x++) cases[63 * GAULOIS_LARGEUR + x] = "#2456b8";
    return { largeur: GAULOIS_LARGEUR, hauteur: GAULOIS_HAUTEUR, cases };
  }

  it("sans Gaulois, la pièce est vide : le dessin tel quel", () => {
    const dessin = interieurDEssai();
    expect(dedansAvecLeGaulois(dessin, PLEIN_JOUR, 1, null)).toEqual(dessin.dessiner(PLEIN_JOUR, 1));
  });

  it("le milieu sur la colonne de la place, les pieds sur sa rangée, par-dessus le dessin", () => {
    const dessin = interieurDEssai();
    const avec = dedansAvecLeGaulois(dessin, PLEIN_JOUR, 0, gauloisDEssai());
    const lire = (x: number, y: number) => avec.cases[y * avec.largeur + x];
    expect(boiteDuGaulois(dessin.place, gauloisDEssai())).toEqual({ x: 96, y: 117 });
    for (let y = dessin.place.pied - 63; y < dessin.place.pied; y++) expect(lire(dessin.place.x, y)).toBe("#c8283a");
    expect(lire(dessin.place.x, dessin.place.pied)).toBe("#2456b8");
    expect(lire(dessin.place.x, dessin.place.pied - 64)).not.toBe("#c8283a");
    expect(lire(dessin.place.x, dessin.place.pied + 1)).not.toBe("#c8283a");
    expect(lire(dessin.place.x - 10, dessin.place.pied)).toBe("#2456b8");
    expect(lire(dessin.place.x + 9, dessin.place.pied)).toBe("#2456b8");
    expect(avec.largeur).toBe(dessin.largeur);
    expect(avec.cases).toHaveLength(dessin.largeur * dessin.hauteur);
  });

  it("son ombre assombrit ce qui est sous lui ; ailleurs, le dessin ne change pas", () => {
    const dessin = interieurDEssai();
    const fond = dessin.dessiner(NUIT_PLEINE, 0);
    const avec = dedansAvecLeGaulois(dessin, NUIT_PLEINE, 0, gauloisDEssai());
    const coin = boiteDuGaulois(dessin.place, gauloisDEssai());
    const gaulois = gauloisDEssai();
    let ombrees = 0;
    for (let y = 0; y < fond.hauteur; y++) {
      for (let x = 0; x < fond.largeur; x++) {
        const k = y * fond.largeur + x;
        const i = x - coin.x;
        const j = y - coin.y;
        const sienne = i >= 0 && j >= 0 && i < GAULOIS_LARGEUR && j < GAULOIS_HAUTEUR ? gaulois.cases[j * GAULOIS_LARGEUR + i] : null;
        const oi = i - OMBRE.x;
        const oj = j - OMBRE.y;
        const ombre = oi >= 0 && oj >= 0 && oi < OMBRE.largeur && oj < OMBRE.hauteur && OMBRE.masque[oj * OMBRE.largeur + oi];
        if (sienne) expect(proches(avec.cases[k]!, couleurDuDedans(sienne, NUIT_PLEINE))).toBe(true);
        else if (ombre) {
          expect(avec.cases[k]).toBe(melanger(fond.cases[k]!, "#000000", OMBRE.opacite));
          ombrees++;
        } else expect(avec.cases[k]).toBe(fond.cases[k]);
      }
    }
    expect(ombrees).toBeGreaterThan(50);
  });

  it("le vrai Gaulois : sa tenue, debout, tourné vers la droite comme le sien dans le monde", () => {
    const debout = gauloisDebout(TENUE_DE_DEPART);
    expect(debout).toEqual({ largeur: GAULOIS_LARGEUR, hauteur: GAULOIS_HAUTEUR, cases: casesDuGaulois(TENUE_DE_DEPART) });
    const dessin = interieurDEssai();
    const avec = dedansAvecLeGaulois(dessin, PLEIN_JOUR, 2, debout);
    const coin = boiteDuGaulois(dessin.place, debout);
    for (let j = 0; j < GAULOIS_HAUTEUR; j++) {
      for (let i = 0; i < GAULOIS_LARGEUR; i++) {
        const couleur = debout.cases[j * GAULOIS_LARGEUR + i];
        if (couleur) expect(avec.cases[(coin.y + j) * avec.largeur + coin.x + i]).toBe(couleur);
      }
    }
    // La dernière rangée de ses 64 cases est celle de la place (le contrat de `type.ts`), comme sa boîte sur le sol du
    // monde : ses pieds peints sont dans les dernières rangées, jamais plus bas.
    expect(coin.y + GAULOIS_HAUTEUR - 1).toBe(dessin.place.pied);
    const rangees = [...debout.cases.keys()].filter((k) => debout.cases[k]).map((k) => Math.floor(k / GAULOIS_LARGEUR));
    expect(coin.y + Math.max(...rangees)).toBeGreaterThan(dessin.place.pied - 4);
    expect(coin.y + Math.max(...rangees)).toBeLessThanOrEqual(dessin.place.pied);
  });

  /** Ses couleurs telles que peintes dans le dedans, à côté des siennes. */
  function sesCases(dessin: DessinDInterieur, l: Lumiere, debout: Decor) {
    const avec = dedansAvecLeGaulois(dessin, l, 0, debout);
    const coin = boiteDuGaulois(dessin.place, debout);
    return debout.cases.flatMap((c, k) => (c ? [{ propre: c, peinte: avec.cases[(coin.y + Math.floor(k / GAULOIS_LARGEUR)) * avec.largeur + coin.x + (k % GAULOIS_LARGEUR)]! }] : []));
  }
  const composantes = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

  /** Une pièce d'une seule couleur le jour, et de `ailleurs(couleur, x)` à toute autre lumière. */
  function pieceUnie(ailleurs: (couleur: string, x: number) => string): DessinDInterieur {
    const base = interieurDEssai("moulin", 1);
    return {
      ...base,
      dessiner(l: Lumiere): Decor {
        const cases: string[] = [];
        for (let y = 0; y < base.hauteur; y++) for (let x = 0; x < base.largeur; x++) cases.push(l === PLEIN_JOUR ? "#a08060" : ailleurs("#a08060", x));
        return { largeur: base.largeur, hauteur: base.hauteur, cases };
      },
    };
  }

  it("est éclairé comme la pièce là où il se tient : inchangé en plein jour, aussi sombre qu'elle la nuit, sa tenue intacte", () => {
    const tenue = { ...TENUE_DE_DEPART };
    const debout = gauloisDebout(tenue);
    const crepuscule = lumiereDuVillage(new Date("2026-11-14T16:20:00.000Z"));
    // Une pièce qui suit `couleurDuDedans` : il la suit aussi, à l'arrondi près.
    for (const { propre, peinte } of sesCases(interieurDEssai(), PLEIN_JOUR, debout)) expect(peinte).toBe(propre);
    for (const l of [NUIT_PLEINE, crepuscule]) for (const { propre, peinte } of sesCases(interieurDEssai(), l, debout)) expect(proches(peinte, couleurDuDedans(propre, l))).toBe(true);
    // Une pièce bien plus sombre la nuit (un voile bleu) : lui aussi, dans la même mesure, composante par composante.
    const voilee = pieceUnie((c) => melanger(c, "#101830", 0.7));
    const part = [0, 1, 2].map((k) => composantes(melanger("#a08060", "#101830", 0.7))[k]! / composantes("#a08060")[k]!);
    for (const { propre, peinte } of sesCases(voilee, NUIT_PLEINE, debout)) {
      const p = composantes(peinte);
      composantes(propre).forEach((v, k) => expect(Math.abs(p[k]! - Math.round(v * part[k]!))).toBeLessThanOrEqual(1));
    }
    expect(tenue).toEqual(TENUE_DE_DEPART);
    expect(debout.cases).toEqual(casesDuGaulois(TENUE_DE_DEPART));
  });

  it("la lumière est celle de l'endroit, jamais plus claire que le plein jour, même près d'une lanterne", () => {
    const debout = gauloisDebout(TENUE_DE_DEPART);
    // Sombre à gauche, plus clair à droite : à sa place (x de 96 à 143), la pièce est sombre.
    const aGauche = sesCases(pieceUnie((c, x) => melanger(c, "#000000", x < 200 ? 0.6 : 0.1)), NUIT_PLEINE, debout);
    const aDroite = sesCases(pieceUnie((c, x) => melanger(c, "#000000", x < 200 ? 0.1 : 0.6)), NUIT_PLEINE, debout);
    const somme = (cases: { peinte: string }[]) => cases.reduce((s, c) => s + composantes(c.peinte).reduce((a, b) => a + b, 0), 0);
    expect(somme(aGauche)).toBeLessThan(somme(aDroite));
    // Une lanterne qui éclaire plus que le jour : il garde ses couleurs, sans pâlir.
    for (const { propre, peinte } of sesCases(pieceUnie((c) => melanger(c, "#ffe8a0", 0.5)), NUIT_PLEINE, debout)) expect(peinte).toBe(propre);
    // Une boîte hors du dessin, ou noire en plein jour : rien ne change.
    const noir: Decor = { largeur: 2, hauteur: 2, cases: ["#000000", "#000000", "#000000", "#000000"] };
    expect(lumiereDeLEndroit(noir, noir, { x: 0, y: 0, largeur: 2, hauteur: 2 })).toEqual([1, 1, 1]);
    expect(lumiereDeLEndroit(noir, noir, { x: 10, y: 10, largeur: 2, hauteur: 2 })).toEqual([1, 1, 1]);
  });

  it("suit la lumière et l'image du dessin, sans le modifier ; ce qui sort du dessin est ignoré", () => {
    const dessin = interieurDEssai();
    const gaulois = gauloisDebout(TENUE_DE_DEPART);
    expect(dedansAvecLeGaulois(dessin, NUIT_PLEINE, 0, gaulois).cases).not.toEqual(dedansAvecLeGaulois(dessin, PLEIN_JOUR, 0, gaulois).cases);
    expect(dedansAvecLeGaulois(dessin, PLEIN_JOUR, 0, gaulois).cases[10]).not.toBe(dedansAvecLeGaulois(dessin, PLEIN_JOUR, 1, gaulois).cases[10]);
    const avant = dessin.dessiner(PLEIN_JOUR, 0);
    dedansAvecLeGaulois(dessin, PLEIN_JOUR, 0, gaulois);
    expect(dessin.dessiner(PLEIN_JOUR, 0)).toEqual(avant);
    // Une place au bord : rien ne déborde, la taille ne change pas.
    const auBord = interieurDEssai("moulin", 1, { x: 3, pied: 199 });
    const t = dedansAvecLeGaulois(auBord, PLEIN_JOUR, 0, gaulois);
    expect(t.cases).toHaveLength(360 * 200);
    expect(t.cases.every((c) => typeof c === "string")).toBe(true);
  });
});
