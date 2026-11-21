/**
 * Écrit `.cache/a-coller-regles-mon-gaulois.sql` (hors de Git) : les trois migrations des nouvelles règles de « Mon Gaulois »
 * (21 novembre 2026), dans une seule transaction, notées dans supabase_migrations.schema_migrations, avec une dernière
 * ligne de contrôle (docs/DIRECTION.md : « Les paliers de victoires et leur booster », « La loterie du mardi », « Le pass »).
 * À relancer depuis la racine du dépôt après tout changement d'une de ces migrations :
 * `npx tsx scripts/a-coller-regles-mon-gaulois.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const MIGRATIONS = [
  { version: "20261121000100", nom: "paliers_de_victoires_boosters" },
  { version: "20261121000200", nom: "loterie_boosters_du_jour" },
  { version: "20261121000300", nom: "pass_saison_objet_et_insigne" },
] as const;
const ATTENDU = "règles de Mon Gaulois : installées";

const lire = (m: (typeof MIGRATIONS)[number]) => readFileSync(`supabase/migrations/${m.version}_${m.nom}.sql`, "utf8").split("\r\n").join("\n").trimEnd();

const entete = `-- LES NOUVELLES RÈGLES DE « MON GAULOIS » (21 novembre 2026), à coller en un seul fichier.
-- 1. Un booster surprise offert à chaque palier de victoires franchi (quatorze paliers, de 10 à 3 000).
-- 2. La loterie du mardi : un booster de loterie par jour joué avec le clan, plus aucun billet acheté.
-- 3. Le pass : saisons de six semaines, la « Couronne du solstice » et l'insigne de la saison au 30e palier.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient les migrations
-- ${MIGRATIONS.map((m) => `${m.version}_${m.nom}.sql`).join(", ")}, notées comme appliquées. Il ajoute des tables et des
-- fonctions, remplace quelques fonctions de la loterie et du pass par leur nouvelle version, ajoute un objet au catalogue,
-- et raccourcit la saison 1 du pass au lundi 28 décembre 2026. Il n'efface rien : aucun Gaulois, aucun objet, aucun
-- statère, aucun billet déjà acheté ni aucun tirage ne disparaît. Collé une seconde fois, il ne change rien.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;
`;

const corps = MIGRATIONS.map((m) => `\n-- ======================= ${m.version}_${m.nom}.sql =======================\n\n${lire(m)}\n`).join("");

const fin = `
insert into supabase_migrations.schema_migrations (version, name, statements) values
${MIGRATIONS.map((m) => `  ('${m.version}', '${m.nom}', array[]::text[])`).join(",\n")}
on conflict (version) do nothing;

commit;

-- Le contrôle : les quatorze paliers, la règle de la loterie, la saison 1 et son objet, et les fonctions ouvertes aux seuls
-- comptes connectés ou à la seule clé de service.
select 'règles de Mon Gaulois : '
  || case when internal.paliers_de_victoires() = array[10, 25, 50, 100, 200, 350, 500, 700, 900, 1000, 1500, 2000, 2500, 3000]
       and internal.loterie_premier_booster() = date '2026-11-24' and internal.loterie_or_sur() = 10 and internal.loterie_or_billets() = 5
       and exists (select 1 from internal.sentier_saisons where saison = 'saison-1' and fin = date '2026-12-28' and objet = 'couronne-solstice')
       and exists (select 1 from internal.gaulois_objets where emplacement = 'tete' and objet = 'couronne-solstice' and rarete = 'saison')
       and not exists (select 1 from internal.village_prix where rarete = 'saison')
       and exists (select 1 from information_schema.columns where table_schema = 'internal' and table_name = 'loterie_parts' and column_name = 'tickets_or')
       and has_function_privilege('service_role', 'public.noter_paliers_victoires(jsonb)', 'execute')
       and not has_function_privilege('authenticated', 'public.noter_paliers_victoires(jsonb)', 'execute')
       and has_function_privilege('service_role', 'public.insignes_des_joueurs(text[])', 'execute')
       and not has_function_privilege('authenticated', 'public.insignes_des_joueurs(text[])', 'execute')
       and has_function_privilege('authenticated', 'public.ouvrir_booster_loterie(date)', 'execute')
       and not has_function_privilege('anon', 'public.ouvrir_booster_loterie(date)', 'execute')
       and has_function_privilege('authenticated', 'public.get_loterie()', 'execute')
       and has_function_privilege('authenticated', 'public.get_pochettes_gagnees()', 'execute')
       and has_function_privilege('authenticated', 'public.get_mon_sentier()', 'execute')
       and has_function_privilege('authenticated', 'public.prendre_palier(integer)', 'execute')
       and not has_function_privilege('authenticated', 'internal.loterie_ouvrir(uuid, date, boolean)', 'execute')
       and (select count(*) = 3 from supabase_migrations.schema_migrations where version in (${MIGRATIONS.map((m) => `'${m.version}'`).join(", ")}))
     then 'installées' else 'PAS INSTALLÉES' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + corps + fin;
writeFileSync(".cache/a-coller-regles-mon-gaulois.sql", texte);
const dollars = MIGRATIONS.reduce((n, m) => n + (lire(m).match(/\$\$/g) ?? []).length, 0);
console.log(`.cache/a-coller-regles-mon-gaulois.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (les migrations en ont ${dollars})`);
