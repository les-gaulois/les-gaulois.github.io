/**
 * Les blocs de données de la migration du duel « Coup pour coup », écrits depuis le moteur partagé
 * (`supabase/functions/code-discord/duel/`) : les cartes, les panoplies, les lieux et les compagnons, les bannières et les
 * familiers rangés par famille, les niveaux de la machine et les boss du jour (ces deux-là de `duel/contenu/`). Le serveur ne garde que des copies : le TypeScript fait foi, et
 * `tests/unit/duel-serveur.test.ts` vérifie que la dernière migration qui porte chaque bloc l'a recopié tel quel.
 *
 * Une migration appliquée ne se modifie pas : une carte, une panoplie ou un niveau qui change demande une nouvelle migration
 * qui reprend le bloc à jour.
 *
 * Usage : `npx tsx scripts/fabriquer-sql-duel.ts <migration.sql>` remplace, dans ce fichier encore non appliqué, le contenu
 * de chaque bloc `-- <duel-…>` … `-- </duel-…>` par sa version à jour ; sans argument, imprime les blocs.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { BANNIERES } from "../supabase/functions/code-discord/bannieres/index.ts";
import { CLES_DES_ATOUTS, COMPAGNONS, LIEUX, MOTS_CLES, NIVEAUX, ORDRE_DES_PANOPLIES, PANOPLIES } from "../supabase/functions/code-discord/duel/index.ts";
import type { Atouts } from "../supabase/functions/code-discord/duel/index.ts";
import { BOSS, ORDRE_DES_BOSS } from "../supabase/functions/code-discord/duel/contenu/boss.ts";
import { NIVEAU_DES_BOSS } from "../supabase/functions/code-discord/duel/contenu/niveaux.ts";
import { FAMILIERS } from "../supabase/functions/code-discord/familiers/index.ts";
import { fabriquerLeCatalogue } from "./fabriquer-effets-duel.ts";

const texte = (s: string): string => `'${s.replace(/'/g, "''")}'`;
const atouts = (p: Atouts): string => texte(JSON.stringify(Object.fromEntries(CLES_DES_ATOUTS.filter((k) => p[k] !== undefined).map((k) => [k, p[k]])))) + "::jsonb";

function bloc(nom: string, table: string, colonnes: string, lignes: readonly string[], conflit: string): string {
  return [`-- <duel-${nom}> : écrit par scripts/fabriquer-sql-duel.ts ; ne pas modifier à la main.`, `insert into ${table} (${colonnes}) values`, lignes.map((l) => `  (${l})`).join(",\n"), `${conflit};`, `-- </duel-${nom}>`].join("\n");
}

/** Les blocs, dans l'ordre où la migration les attend. */
export function blocsSqlDuDuel(): Record<string, string> {
  const c = fabriquerLeCatalogue();
  const cartes = Object.entries(c.cartes).map(([id, f], rang) => {
    const mots = Object.fromEntries(MOTS_CLES.flatMap((m) => {
      const t = (f.m ?? []).find(([x]) => x === m);
      return t ? [[m, t[1] ?? 1]] : [];
    }));
    return `${texte(id)}, ${rang + 1}, ${texte(f.e)}, ${texte(f.r)}, ${f.p ? texte(f.p) : "null"}, ${f.u ? texte(f.u) : "null"}, ${texte(JSON.stringify(mots))}::jsonb`;
  });
  return {
    cartes: bloc("cartes", "internal.duel_cartes", "objet, rang, emplacement, rarete, panoplie, effet_unique, mots", cartes, "on conflict (objet) do update set rang = excluded.rang, emplacement = excluded.emplacement, rarete = excluded.rarete, panoplie = excluded.panoplie, effet_unique = excluded.effet_unique, mots = excluded.mots"),
    panoplies: bloc("panoplies", "internal.duel_panoplies", "panoplie, pieces, passif", ORDRE_DES_PANOPLIES.map((k) => `${texte(k)}, ${PANOPLIES[k].pieces}, ${atouts(PANOPLIES[k].passif)}`), "on conflict (panoplie) do update set pieces = excluded.pieces, passif = excluded.passif"),
    lieux: bloc("lieux", "internal.duel_lieux", "lieu, passif", Object.entries(LIEUX).map(([k, l]) => `${texte(k)}, ${atouts(l.passif)}`), "on conflict (lieu) do update set passif = excluded.passif"),
    compagnons: bloc("compagnons", "internal.duel_compagnons", "compagnon, passif", Object.entries(COMPAGNONS).map(([k, l]) => `${texte(k)}, ${atouts(l.passif)}`), "on conflict (compagnon) do update set passif = excluded.passif"),
    bannieres: bloc("bannieres", "internal.duel_bannieres", "banniere, lieu", BANNIERES.map((b) => `${texte(b.id)}, ${texte(b.famille)}`), "on conflict (banniere) do update set lieu = excluded.lieu"),
    familiers: bloc("familiers", "internal.duel_familiers", "familier, compagnon", FAMILIERS.map((f) => `${texte(f.id)}, ${texte(f.famille)}`), "on conflict (familier) do update set compagnon = excluded.compagnon"),
    niveaux: bloc("niveaux", "internal.duel_niveaux", "niveau, fantaisie, loin", Object.entries(NIVEAUX).map(([k, n]) => `${texte(k)}, ${n.fantaisie}, ${n.loin}`), "on conflict (niveau) do update set fantaisie = excluded.fantaisie, loin = excluded.loin"),
    // Le rang est la place du boss dans l'ordre du cycle (`ORDRE_DES_BOSS`), celle que le serveur lit pour le boss du jour.
    boss: bloc(
      "boss",
      "internal.duel_boss",
      "boss, rang, main, passif, banniere, lieu, niveau",
      ORDRE_DES_BOSS.map((id, rang) => {
        const b = BOSS.find((x) => x.id === id);
        if (!b) throw new Error(`boss inconnu : ${id}`);
        return `${texte(b.id)}, ${rang}, array[${b.main.map(texte).join(", ")}], ${atouts(b.pouvoir.passif)}, ${texte(b.lieu.banniere)}, ${texte(b.lieu.famille)}, ${texte(NIVEAU_DES_BOSS)}`;
      }),
      "on conflict (boss) do update set rang = excluded.rang, main = excluded.main, passif = excluded.passif, banniere = excluded.banniere, lieu = excluded.lieu, niveau = excluded.niveau",
    ),
  };
}

/** Le texte d'une migration où chaque bloc `-- <duel-nom>` … `-- </duel-nom>` est remplacé par sa version à jour. */
export function remplacerLesBlocs(sql: string, blocs: Readonly<Record<string, string>>): string {
  let sortie = sql;
  for (const [nom, contenu] of Object.entries(blocs)) {
    const debut = sortie.indexOf(`-- <duel-${nom}>`), fin = sortie.indexOf(`-- </duel-${nom}>`);
    if (debut < 0 || fin < debut) continue;
    // un découpage plutôt qu'un remplacement par expression : un « $$ » du SQL reste intact
    sortie = sortie.slice(0, debut) + contenu + sortie.slice(fin + `-- </duel-${nom}>`.length);
  }
  return sortie;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/fabriquer-sql-duel.ts")) {
  const blocs = blocsSqlDuDuel(), cible = process.argv[2];
  if (cible) {
    const avant = readFileSync(cible, "utf8").replace(/\r\n/g, "\n");
    writeFileSync(cible, remplacerLesBlocs(avant, blocs));
    console.log("blocs écrits dans", cible);
  } else console.log(Object.values(blocs).join("\n\n"));
}
