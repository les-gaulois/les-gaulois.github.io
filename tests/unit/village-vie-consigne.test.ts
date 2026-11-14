import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPLACEMENTS_OBJETS, OBJETS } from "../../src/lib/gaulois";
import { CONSIGNE, LIEUX_ECRITS, MAJUSCULES_PERMISES, MAX_REPLIQUES_PAR_PASSAGE, MAX_SIGNES, MOMENTS_ECRITS, MOTS_INTERDITS, SCHEMA_REPONSE } from "../../src/lib/village/consigne-repliques";
import { LIEUX } from "../../src/lib/village/vie";
import { LIEUX_DES_BULLES, MOMENTS, SIGNES_PERMIS, normaliserPourLesMots } from "../../src/lib/village/vie-releve";

// Sous Windows, Git rend les fichiers avec des fins de ligne CRLF : les motifs ci-dessous lisent des « \n ».
const SQL = readFileSync("supabase/migrations/20261113002300_village_vie.sql", "utf8").replace(/\r\n/g, "\n");

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

  it("ne donne à Claude que des mots, pour chaque moment et chaque lieu d'une bulle, jamais la salle de réunion", () => {
    expect(Object.keys(MOMENTS_ECRITS).sort()).toEqual([...MOMENTS].sort());
    expect(Object.keys(LIEUX_ECRITS).sort()).toEqual(LIEUX.filter((l) => l !== "reunion").sort());
    expect(Object.keys(LIEUX_ECRITS).sort()).toEqual([...LIEUX_DES_BULLES].sort());
  });

  // Relecture du 14 novembre 2026 : « Discord » était à la fois permis (majuscule) et interdit (mot), et donné à lire à
  // Claude. Il reste interdit, et plus rien de ce que Claude reçoit ne le nomme, ni ne parle du vocal.
  it("ne nomme Discord ni le vocal dans rien de ce que Claude reçoit, et ne permet aucun mot interdit", () => {
    const lu = normaliserPourLesMots([CONSIGNE, ...Object.values(MOMENTS_ECRITS), ...Object.values(LIEUX_ECRITS)].join(" "));
    for (const mot of [" discord", " vocal", " reunion"]) expect(lu).not.toContain(mot);
    expect(MOTS_INTERDITS).toContain(" discord");
    for (const mot of MAJUSCULES_PERMISES) {
      expect(MOTS_INTERDITS.some((m) => normaliserPourLesMots(mot).includes(m)), mot).toBe(false);
    }
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

  it("gardent les lieux du serveur identiques à ceux d'une bulle : ceux de l'écran, sans la salle de réunion", () => {
    const sql = corps("internal.village_vie_faits_valides");
    const lieux = sql.match(/\(p ->> 'lieu'\) not in \(([^)]*)\)/)?.[1];
    expect([...(lieux ?? "").matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort()).toEqual([...LIEUX_DES_BULLES].sort());
    expect(LIEUX_DES_BULLES).not.toContain("reunion");
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

// Décision du pilote du 14 novembre 2026 : « tous ceux qui créent un personnage apparaissent dans le village », sans choix
// de se montrer ou non. Le nom et le vocal pour tous ; la dernière partie seulement avec un pseudo public unique, car son
// heure exacte, croisée avec les sessions publiques du clan, donnerait l'identifiant OpenFront d'un membre anonyme.
describe("qui paraît sur la place, et avec quoi", () => {
  const code = SQL.replace(/\r\n/g, "\n").replace(/--.*$/gm, "");

  it("ne lit jamais le choix du mur du QG, et ne cache plus aucun nom", () => {
    expect(code).not.toMatch(/show_to_members|'Un Gaulois'/);
  });

  it("nomme chaque Gaulois comme le QG et donne son état vocal, à la place comme au robot", () => {
    const place = corps("public.get_village");
    expect(place).toContain("'nom', internal.village_nom(p.display_name, p.gaul_number),");
    expect(place).toContain("'vocal', internal.village_vie_vocal(v.vocal, v.vocal_le),");
    const travail = corps("public.vie_du_village_travail");
    expect(travail).toContain("'discord', case when l.discord_id ~ '^[0-9]{17,20}$' then l.discord_id end,");
    expect(travail).toContain("'vocal', internal.village_vie_vocal(v.vocal, v.vocal_le),");
    // Le robot ne reçoit jamais un nom.
    expect(travail).not.toMatch(/display_name|village_nom|member_pseudo|username/);
  });

  it("ne note l'état vocal que d'un compte validé qui a un Gaulois", () => {
    expect(corps("public.noter_vie_du_village")).toContain(
      "where v.numero = v_e ->> 'n'\n      and exists (\n        select 1 from internal.gaulois g join public.profiles p on p.user_id = g.user_id\n        where g.user_id = v.user_id and p.status = 'validated'\n      );",
    );
  });

  it("ne donne la dernière partie, et ses points, qu'avec un pseudo public unique dans la liste du clan", () => {
    expect(corps("internal.village_vie_partie")).toContain("and internal.member_pseudo(p_user) is not null");
    // La place, le robot, la réception des bulles et la lecture de l'encadrement lisent tous la partie par cette fonction.
    for (const nom of ["public.get_village", "public.vie_du_village_travail", "public.noter_vie_du_village", "internal.village_vie_etat"]) {
      expect(corps(nom), nom).toContain("internal.village_vie_partie(");
      expect(corps(nom), nom).not.toContain("internal.stateres_mouvements");
    }
    // Une bulle qui parle d'une partie ne se montre que si la place montre cette partie.
    expect(corps("public.get_village")).toContain(
      "and (d.debut is not null or (v.replique_faits ->> 'points' is null and coalesce(v.replique_faits ->> 'lieu', '') not in ('bataille', 'taverne')))",
    );
  });
});
