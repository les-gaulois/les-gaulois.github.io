import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BATIMENTS,
  DIVISEUR_ATTAQUE,
  POSTE,
  RELATIONS_TRAIN,
  TERRAINS,
  TRAIN,
  chantier,
  coutBatiment,
  orBateau,
  orTrain,
  partageAttaque,
} from "../../src/lib/guide-clan";

const INSECABLE = String.fromCharCode(0xa0);

/** Le texte d'un chapitre du guide, espaces insécables ramenées à des espaces. */
const chapitre = (fichier: string) => readFileSync(`content/guide-clan/${fichier}.md`, "utf8").replaceAll(INSECABLE, " ");

/** Les lignes des tableaux d'un chapitre : une liste de cases par ligne, sans les lignes de traits. */
const lignes = (fichier: string): string[][] =>
  chapitre(fichier)
    .split(/\r?\n/)
    .filter((ligne) => ligne.startsWith("|") && !/^\|[-\s|]+\|$/.test(ligne))
    .map((ligne) => ligne.split("|").slice(1, -1).map((c) => c.trim()));

/** La seconde case de la ligne qui commence par ce nom. */
const valeurDe = (fichier: string, nom: string): string => {
  const ligne = lignes(fichier).find((l) => l[0] === nom);
  if (!ligne?.[1]) throw new Error(`« ${nom} » manque dans ${fichier}`);
  return ligne[1];
};

/** « 60 000 » ou « 16,5 » : le nombre écrit à la française. */
const nombre = (texte: string) => Number(texte.replace(/\s/g, "").replace(",", "."));
/** « 125k » ou « 1M ». */
const abrege = (texte: string) => Number(texte.replace(/[kM]$/, "")) * (texte.endsWith("M") ? 1_000_000 : 1_000);
/** Les titres des lignes du bloc d'un chapitre, dans l'ordre de son en-tête. */
const titresDesPoints = (fichier: string): string[] => [...chapitre(fichier).matchAll(/^\s+- titre: "(.+)"$/gm)].map((m) => m[1] ?? "");
const sansAccent = (texte: string) =>
  texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

describe("partageAttaque", () => {
  it("retrouve l'exemple du chapitre : 50 000 troupes, 10 000 à l'attaque", () => {
    expect(partageAttaque(50_000)).toEqual({ attaque: 10_000, defense: 40_000 });
    expect(chapitre("01-bases")).toContain("50 000 troupes disponibles sur un Civil donnent une force d'attaque standard de 10 000");
  });

  it("ne coupe pas une troupe en deux, et ne perd personne", () => {
    const { attaque, defense } = partageAttaque(12_347);
    expect(attaque).toBe(2_469);
    expect(attaque + defense).toBe(12_347);
  });

  it("ne donne rien pour une valeur impossible", () => {
    expect(partageAttaque(-1)).toEqual({ attaque: 0, defense: 0 });
    expect(partageAttaque(Number.NaN)).toEqual({ attaque: 0, defense: 0 });
    expect(partageAttaque(Number.POSITIVE_INFINITY)).toEqual({ attaque: 0, defense: 0 });
  });

  it("divise comme l'écrivent le chapitre et l'aide-mémoire : le curseur d'attaque à 20 %, une troupe sur cinq", () => {
    expect(valeurDe("01-bases", "Civil")).toBe(`Attaque = troupes ÷ ${DIVISEUR_ATTAQUE}`);
    expect(valeurDe("10-memo-combat", "Attaque Civil")).toBe(`1 troupe sur ${DIVISEUR_ATTAQUE} (troupes ÷ ${DIVISEUR_ATTAQUE})`);
    expect(chapitre("01-bases")).toContain("le ÷ 5 correspond au réglage par défaut de son curseur d'attaque (20 %)");
    expect(100 / DIVISEUR_ATTAQUE).toBe(20);
    // La phrase qui explique l'essai dit la même chose en clair.
    expect(chapitre("01-bases")).toContain(`votre curseur d'attaque est réglé à 20 % par défaut : **1 troupe sur ${DIVISEUR_ATTAQUE}** part`);
  });
});

describe("le terrain et le poste", () => {
  it("portent les valeurs de l'aide-mémoire, dans l'ordre des lignes du chapitre", () => {
    const noms = titresDesPoints("03-attaque");
    expect(noms.map(sansAccent)).toEqual(TERRAINS.map((t) => t.id));
    const memo = lignes("10-memo-combat");
    TERRAINS.forEach((terrain, i) => {
      const ligne = memo.find((l) => l[0]?.startsWith(noms[i] ?? "?"));
      const [, mag, cout] = ligne?.[1]?.match(/^mag (\d+), coût ([\d,]+)$/) ?? [];
      expect(nombre(mag ?? ""), terrain.id).toBe(terrain.mag);
      expect(nombre(cout ?? ""), terrain.id).toBe(terrain.coutTuile);
    });
  });

  it("le poste a la portée et les multiplicateurs de l'aide-mémoire, dans l'ordre des lignes du chapitre", () => {
    expect(valeurDe("10-memo-combat", "Poste")).toBe(`portée ${POSTE.portee}, pertes ×${POSTE.pertes}, coût de vitesse ×${POSTE.vitesse}`);
    expect(titresDesPoints("04-poste-neutre")).toEqual(["Portée", "Pertes de l'attaquant", "Coût de vitesse"]);
    expect(Object.keys(POSTE)).toEqual(["portee", "pertes", "vitesse"]);
  });
});

describe("coutBatiment et chantier", () => {
  it("suit la progression de l'aide-mémoire, puis reste au plafond", () => {
    const progression = valeurDe("11-memo-economie", "Ville").split(",")[0]?.split(" → ").map(abrege);
    expect(progression).toEqual([125_000, 250_000, 500_000, 1_000_000]);
    expect([0, 1, 2, 3].map(coutBatiment)).toEqual(progression);
    expect(valeurDe("11-memo-economie", "Port + Usine").split(",")[0]).toBe(valeurDe("11-memo-economie", "Ville").split(",")[0]);
    expect(coutBatiment(4)).toBe(1_000_000);
    expect(coutBatiment(40)).toBe(1_000_000);
  });

  it("repart du premier prix pour une valeur impossible", () => {
    expect(coutBatiment(-3)).toBe(125_000);
    expect(coutBatiment(Number.NaN)).toBe(125_000);
    expect(coutBatiment(1.9)).toBe(250_000);
  });

  it("donne les mêmes bâtiments que le chapitre, dans le même ordre", () => {
    expect(titresDesPoints("06-economie").map(sansAccent)).toEqual(BATIMENTS.map((b) => b.id));
  });

  it("un chantier vide ne coûte rien, et tout y est au premier prix", () => {
    expect(chantier([])).toEqual({ prochain: { ville: 125_000, port: 125_000, usine: 125_000 }, nombre: { ville: 0, port: 0, usine: 0 }, depense: 0 });
  });

  it("la Ville a son propre compteur", () => {
    const etat = chantier(["ville", "ville"]);
    expect(etat.prochain).toEqual({ ville: 500_000, port: 125_000, usine: 125_000 });
    expect(etat.depense).toBe(375_000);
    expect(etat.nombre).toEqual({ ville: 2, port: 0, usine: 0 });
  });

  it("le Port et l'Usine partagent le même compteur", () => {
    const etat = chantier(["port", "usine", "ville"]);
    // Le Port à 125 000, l'Usine déjà à 250 000, la Ville à 125 000.
    expect(etat.depense).toBe(500_000);
    expect(etat.prochain).toEqual({ ville: 250_000, port: 500_000, usine: 500_000 });
    expect(etat.nombre).toEqual({ ville: 1, port: 1, usine: 1 });
  });

  it("l'essentiel du chapitre donne le revenu passif de l'aide-mémoire : tant par tick, donc tant par minute", () => {
    // Un tick dure 100 ms : 600 ticks par minute.
    const [, parTick, parMinute] = valeurDe("11-memo-economie", "Revenu passif Civil").match(/^(\d+) or par tick, soit ([\d ]+) par minute$/) ?? [];
    expect(nombre(parTick ?? "") * 600).toBe(nombre(parMinute ?? ""));
    expect(chapitre("06-economie")).toContain(`${parMinute} or par minute pour un joueur, soit ${parTick} or par tick`);
  });
});

describe("orBateau", () => {
  it("retrouve chaque repère de paiement du chapitre", () => {
    const reperes = lignes("07-bateaux").filter((l) => /^[\d ]+$/.test(l[0] ?? ""));
    expect(reperes).toHaveLength(7);
    for (const [distance, or] of reperes) expect(Math.round(orBateau(nombre(distance ?? ""))), `distance ${distance}`).toBe(nombre(or ?? ""));
  });

  it("grandit toujours avec la distance", () => {
    for (let distance = 10; distance <= 1_000; distance += 10) expect(orBateau(distance)).toBeGreaterThan(orBateau(distance - 10));
  });

  it("ne paie rien pour une distance impossible", () => {
    expect(orBateau(-5)).toBe(0);
    expect(orBateau(Number.NaN)).toBe(0);
  });
});

describe("orTrain", () => {
  const base = (id: string) => RELATIONS_TRAIN.find((r) => r.id === id)?.or ?? 0;

  it("part de l'or de base du tableau du chapitre, relation par relation", () => {
    const tableau = { soi: "Self (vous-même)", equipe: "Team (équipe)", autre: "Other (autre joueur)", allie: "Ally (allié)" };
    for (const relation of RELATIONS_TRAIN) expect(nombre(valeurDe("08-trains", tableau[relation.id])), relation.id).toBe(relation.or);
    expect(nombre(valeurDe("11-memo-economie", "Train Self").replace(" / arrêt", ""))).toBe(base("soi"));
    expect(nombre(valeurDe("11-memo-economie", "Train Ally").replace(" / arrêt", ""))).toBe(base("allie"));
  });

  it("retrouve l'exemple du chapitre chez un allié : 35k dix fois, 30k au 11e, 25k au 12e", () => {
    expect(chapitre("08-trains")).toContain("35k pendant 10 arrêts, 30k au 11e, 25k au 12e");
    for (let arret = 1; arret <= 10; arret++) expect(orTrain(base("allie"), arret)).toBe(35_000);
    expect(orTrain(base("allie"), 11)).toBe(30_000);
    expect(orTrain(base("allie"), 12)).toBe(25_000);
  });

  it("ne descend jamais sous le plancher", () => {
    expect(valeurDe("11-memo-economie", "Pénalité de train")).toBe(`−5 000 par arrêt après le ${TRAIN.arretsPleins}e, plancher à 5 000`);
    expect(TRAIN.baisse).toBe(5_000);
    expect(TRAIN.plancher).toBe(5_000);
    expect(orTrain(base("allie"), 16)).toBe(5_000);
    expect(orTrain(base("allie"), 60)).toBe(5_000);
    // Chez soi, le premier arrêt pénalisé est déjà au plancher.
    expect(orTrain(base("soi"), 10)).toBe(10_000);
    expect(orTrain(base("soi"), 11)).toBe(5_000);
  });

  it("prend le premier arrêt pour un rang impossible, et ne paie rien sans base", () => {
    expect(orTrain(25_000, 0)).toBe(25_000);
    expect(orTrain(25_000, Number.NaN)).toBe(25_000);
    expect(orTrain(0, 3)).toBe(0);
    expect(orTrain(Number.NaN, 3)).toBe(0);
  });
});
