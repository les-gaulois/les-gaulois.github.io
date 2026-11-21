/**
 * Écrit `.cache/a-coller-prix-rendus.sql` (hors de Git) : la migration du trop-payé rendu après les prix baissés
 * (20261121000600), à coller en un seul fichier, dans une transaction, notée dans supabase_migrations.schema_migrations, avec
 * une dernière ligne de contrôle qui dit combien de joueurs ont été remboursés et la somme rendue (docs/DIRECTION.md,
 * « Le trop-payé rendu »). À relancer depuis la racine du dépôt après tout changement de la migration :
 * `npx tsx scripts/a-coller-prix-rendus.ts`. N'envoie rien et ne lit que le dépôt.
 * Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261121000600_prix_baisses_rendus";
const sql = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();

const entete = `-- LE TROP-PAYÉ RENDU (21 novembre 2026), à coller en un seul fichier.
-- Chaque joueur qui avait payé une bannière, une finition, un cadre, un Gaulois unique ou une pochette des familiers, des
-- bannières ou des Gaulois uniques avant la baisse des prix reçoit ce qu'il a payé en trop, en une ligne de son journal.
-- Rien pour une pochette offerte par la loterie ni pour un essai du mode GOD. Une pochette qui avait rendu une part de son
-- prix rend le trop-payé net.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient une migration, notée comme
-- appliquée : ${NOM}.sql. Il crée des statères, à la demande du pilote : jamais plus que la baisse. Il n'efface rien.
-- Collé une seconde fois, il ne rend rien de plus. Il suppose les prix baissés déjà collés : sinon, il s'arrête sans rien
-- changer.
-- La dernière ligne doit dire : « trop-payé rendu : N joueurs, S statères » (les mêmes chiffres si on le recolle).

begin;

do $$
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261121000500')
     or internal.bannieres_pochette_prix() <> 1000
     or (select p.prix from internal.familiers_pochette p where p.id) <> 1000
     or (select p.prix from internal.modeles_pochette p where p.id) <> 1600 then
    raise exception 'Les prix baissés ne sont pas installés : collez d''abord .cache/a-coller-prix-baisses.sql. Rien n''a changé.';
  end if;
  -- Le message public écrit les prix de départ des objets et ceux des Gaulois uniques : s'ils ont été réglés autrement,
  -- il serait faux. Le remboursement, lui, n'en dépend pas.
  if (select string_agg(p.rarete || '=' || p.prix, ',' order by p.prix) from internal.village_prix p where p.rarete in ('commun', 'peu-commun', 'epique', 'mystique', 'legendaire'))
       is distinct from 'commun=100,peu-commun=250,epique=500,mystique=1000,legendaire=2500'
     or (select string_agg(p.rarete || '=' || p.prix, ',' order by p.prix) from internal.modeles_prix p)
       is distinct from 'commun=6000,peu-commun=8000,epique=10000,mystique=12500,legendaire=15000' then
    raise exception 'Les prix des objets ou des Gaulois uniques ne sont pas ceux du message public. Rien n''a changé : demandez à Claude.';
  end if;
  -- L'heure de la baisse : celle où le prix de la pochette des familiers a changé, le 21 novembre 2026.
  if (select p.maj_le from internal.familiers_pochette p where p.id) not between timestamptz '2026-11-21 00:00+01' and now() then
    raise exception 'L''heure de la baisse des prix ne se lit pas. Rien n''a changé : demandez à Claude.';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261121000600', 'prix_baisses_rendus', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la migration est notée, la lecture du robot est fermée aux visiteurs et aux comptes, et le journal a une
-- ligne par joueur remboursé, de la somme de son détail.
select case when (select count(*) from supabase_migrations.schema_migrations where version = '20261121000600') = 1
       and to_regprocedure('public.rendus_des_prix(bigint)') is not null
       and not has_function_privilege('anon', 'public.rendus_des_prix(bigint)', 'execute')
       and not has_function_privilege('authenticated', 'public.rendus_des_prix(bigint)', 'execute')
       and not exists (
         select 1 from internal.stateres_mouvements m
         where m.nature = 'prix_baisse_rendu'
           and m.montant <> (select coalesce(sum(r.rendu), 0) from internal.prix_baisse_rendus r where r.mouvement = m.id)
       )
     then 'trop-payé rendu : ' || (select count(distinct r.user_id) from internal.prix_baisse_rendus r)
       || case when (select count(distinct r.user_id) from internal.prix_baisse_rendus r) = 1 then ' joueur, ' else ' joueurs, ' end
       || (select coalesce(sum(r.rendu), 0) from internal.prix_baisse_rendus r) || ' statères'
     else 'PAS INSTALLÉ' end as controle;
`;

mkdirSync(".cache", { recursive: true });
const texte = entete + sql + fin;
writeFileSync(".cache/a-coller-prix-rendus.sql", texte);
console.log(`.cache/a-coller-prix-rendus.sql : ${texte.split("\n").length} lignes, ${(texte.match(/\$\$/g) ?? []).length} « $$ » (la migration en a ${(sql.match(/\$\$/g) ?? []).length})`);
