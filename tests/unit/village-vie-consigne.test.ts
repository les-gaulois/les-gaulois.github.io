import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPLACEMENTS_OBJETS, OBJETS } from "../../src/lib/gaulois";
import { CONSIGNE, LIEUX_ECRITS, MAJUSCULES_PERMISES, MAX_REPLIQUES_PAR_PASSAGE, MAX_SIGNES, MOMENTS_ECRITS, MOTS_INTERDITS, SCHEMA_REPONSE } from "../../src/lib/village/consigne-repliques";
import { LIEUX } from "../../src/lib/village/vie";
import { MOMENTS, SIGNES_PERMIS, normaliserPourLesMots } from "../../src/lib/village/vie-releve";

const SQL = readFileSync("supabase/migrations/20261113002300_village_vie.sql", "utf8");

/** Le corps d'une fonction SQL de la migration, entre ses `$$`. */
function corps(nom: string): string {
  const debut = SQL.indexOf(`function ${nom}(`);
  expect(debut).toBeGreaterThan(0);
  const ouvre = SQL.indexOf("$$", debut);
  return SQL.slice(ouvre + 2, SQL.indexOf("$$", ouvre + 2));
}

describe("la consigne des bulles", () => {
  it("dit les règles du pilote et de la feuille de route", () => {
    for (const regle of ["première personne", "90 signes", "aucun chiffre", "aucun nom propre", "aucun lien", "Astérix", "potion", "menhir", "sanglier", "ils sont fous", "conseil de jeu", "ne te moque", "JSON"]) {
      expect(CONSIGNE).toContain(regle);
    }
    expect(MAX_SIGNES).toBe(90);
    expect(MAX_REPLIQUES_PAR_PASSAGE).toBe(20);
  });

  it("ne donne à Claude que des mots, pour chaque moment et chaque lieu", () => {
    expect(Object.keys(MOMENTS_ECRITS).sort()).toEqual([...MOMENTS].sort());
    expect(Object.keys(LIEUX_ECRITS).sort()).toEqual([...LIEUX].sort());
  });

  it("impose une réponse en JSON strict", () => {
    expect(SCHEMA_REPONSE.additionalProperties).toBe(false);
    expect(SCHEMA_REPONSE.properties.repliques.items.additionalProperties).toBe(false);
    expect(SCHEMA_REPONSE.properties.repliques.items.required).toEqual(["g", "texte"]);
  });
});

describe("les mots interdits", () => {
  it("sont les mêmes que ceux du serveur, dans le même ordre", () => {
    const liste = corps("internal.village_vie_mots_interdits");
    const duServeur = [...liste.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    expect(duServeur).toEqual([...MOTS_INTERDITS]);
  });

  it("vont avec les mêmes mots à majuscule permise que le serveur, dans le même ordre", () => {
    const liste = corps("internal.village_vie_majuscules_permises");
    expect([...liste.matchAll(/'([^']*)'/g)].map((m) => m[1])).toEqual([...MAJUSCULES_PERMISES]);
    // Les plus longs d'abord : « Gauloises » ne doit pas être lu « Gaulois » suivi de « es ».
    expect(MAJUSCULES_PERMISES.every((mot, i) => MAJUSCULES_PERMISES.slice(0, i).every((avant) => !mot.startsWith(avant)))).toBe(true);
    // Le serveur retire les débuts de phrase comme le robot : au début, ou après « . », « ! », « ? », « … » et une espace,
    // un guillemet ouvrant permis devant.
    const sql = corps("internal.village_vie_replique_valide");
    expect(sql).toContain("regexp_replace(v_reste, '^((?:« )?)[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇŒÆ]', '\\1_')");
    expect(sql).toContain("regexp_replace(v_reste, '([.!?…] (?:« )?)[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇŒÆ]', '\\1_', 'g')");
  });

  it("sont écrits comme le texte normalisé : minuscules sans accent, une espace devant", () => {
    for (const mot of MOTS_INTERDITS) {
      expect(mot).toMatch(/^ [a-z]+( [a-z]+)* ?$/);
      // Normalisé, un mot de la liste se retrouve lui-même.
      expect(normaliserPourLesMots(mot.trim()).includes(mot)).toBe(true);
    }
    expect(new Set(MOTS_INTERDITS).size).toBe(MOTS_INTERDITS.length);
  });

  it("arrêtent Astérix sous toutes ses formes, sans arrêter les mots voisins", () => {
    const touche = (texte: string) => MOTS_INTERDITS.some((m) => normaliserPourLesMots(texte).includes(m));
    for (const texte of ["Astérix !", "Une POTION ?", "Les Romains", "Ils sont fous !", "Par Toutatis", "Un menhir.", "Du gui", "Œil de druide", "Le ciel me tombe sur la tête"]) {
      expect(touche(texte), texte).toBe(true);
    }
    for (const texte of ["Je suis le guide du village.", "Un serpent passe.", "Bonsoir la taverne !", "Je contemple la place."]) {
      expect(touche(texte), texte).toBe(false);
    }
  });
});

describe("les signes permis et les faits", () => {
  it("sont écrits de la même façon dans le serveur", () => {
    const sql = corps("internal.village_vie_replique_valide");
    const motif = sql.match(/p_texte !~ '(\^\[[^']*(?:''[^']*)*\]\+\$)'/)?.[1]?.replace(/''/g, "'");
    expect(motif).toBe(SIGNES_PERMIS.source);
  });

  it("laissent passer le nom de chaque objet du catalogue", () => {
    const motif = corps("internal.village_vie_faits_valides").match(/!~ '(\^\[A-Za-z[^']*(?:''[^']*)*\]\{1,40\}\$)'/)?.[1]?.replace(/''/g, "'");
    expect(motif).toBeDefined();
    const nomPermis = new RegExp(motif!);
    for (const emplacement of EMPLACEMENTS_OBJETS) {
      for (const objet of Object.values(OBJETS[emplacement])) {
        if (objet.dessin !== null) expect(objet.nom, objet.nom).toMatch(nomPermis);
      }
    }
  });

  it("gardent les lieux du serveur identiques à ceux de l'écran", () => {
    const sql = corps("internal.village_vie_faits_valides");
    const lieux = sql.match(/\(p ->> 'lieu'\) not in \(([^)]*)\)/)?.[1];
    expect([...(lieux ?? "").matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort()).toEqual([...LIEUX].sort());
  });

  it("gardent le moment de la journée du serveur identique à celui du site", () => {
    const sql = corps("internal.village_vie_moment");
    expect(sql).toContain("x.h >= 23 or x.h < 7 then 'nuit'");
    expect(sql).toContain("x.h < 12 then 'matin'");
    expect(sql).toContain("x.h < 18 then 'apres-midi'");
    expect(sql).toContain("'Europe/Paris'");
  });

  it("gardent les mêmes plafonds de longueur et de nombre que le robot", () => {
    expect(corps("internal.village_vie_replique_valide")).toContain(`char_length(p_texte) > ${MAX_SIGNES}`);
    expect(corps("internal.village_vie_releve_valide")).toContain(`jsonb_array_length(p -> 'repliques') > ${MAX_REPLIQUES_PAR_PASSAGE}`);
  });
});
