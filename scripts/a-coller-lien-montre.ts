/**
 * Écrit `.cache/a-coller-lien-montre.sql` (hors de Git) : la migration qui garde le lien du profil OpenFront avec une
 * demande tant qu'elle attend, dans une transaction, notée dans supabase_migrations.schema_migrations, et une dernière
 * ligne de contrôle (docs/DIRECTION.md, « Connexion et validation »). Depuis la racine du dépôt :
 * `npx tsx scripts/a-coller-lien-montre.ts`.
 * N'envoie rien et ne lit que le dépôt. Pas de String.replace sur le SQL : « $$ » y deviendrait « $ » (piège du dollar double).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NOM = "20261117000900_lien_openfront_montre_a_l_equipe";
const migration = readFileSync(`supabase/migrations/${NOM}.sql`, "utf8").split("\r\n").join("\n").trimEnd();
const ATTENDU = "lien du profil montré à l'équipe : en place";

const entete = `-- LE LIEN DU PROFIL OPENFRONT MONTRÉ À L'ÉQUIPE (17 novembre 2026), à coller en un seul fichier.
-- Une demande de validation garde le lien du profil tant qu'elle attend : l'onglet Demandes de la Direction le montre.
-- Il est effacé dès que la demande est validée, refusée ou annulée.
--
-- À coller EN ENTIER dans l'éditeur SQL de Supabase (SQL Editor), puis « Run ». Il contient la seule migration ${NOM}.sql,
-- notée comme appliquée. Il n'efface rien. Collé une seconde fois, il ne change rien.
-- Les demandes déjà en attente restent sans lien : seules les nouvelles l'auront.
-- La dernière ligne doit dire : « ${ATTENDU} ».

begin;

-- La fonction refaite est celle du lien obligatoire : sans elle, rien n'est touché.
do $$
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261114000800') then
    raise exception 'Il faut d''abord la migration 20261114000800 (le lien OpenFront obligatoire).';
  end if;
end $$;

`;

const fin = `

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261117000900', 'lien_openfront_montre_a_l_equipe', array[]::text[])
on conflict (version) do nothing;

commit;

-- Le contrôle : la fonction garde-t-elle le lien, le déclencheur est-il posé, les droits sont-ils fermés, la migration notée ?
select 'lien du profil montré à l''équipe : '
  || case when (select p.prosrc like '%openfront.io/player/%' from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'request_membership_link')
       and exists (select 1 from pg_trigger t where t.tgname = 'membership_forgets_claim' and t.tgrelid = 'public.membership_requests'::regclass and not t.tgisinternal and t.tgenabled <> 'D')
       and not has_function_privilege('anon', 'public.request_membership_link(text, text)', 'execute')
       and has_function_privilege('authenticated', 'public.request_membership_link(text, text)', 'execute')
       and not has_function_privilege('authenticated', 'public.request_membership(text, text)', 'execute')
       and not has_function_privilege('authenticated', 'internal.forget_claim_once_decided()', 'execute')
       and exists (select 1 from supabase_migrations.schema_migrations where version = '20261117000900')
     then 'en place' else 'PAS EN PLACE' end as controle;
`;

mkdirSync(".cache", { recursive: true });
writeFileSync(".cache/a-coller-lien-montre.sql", `${entete}${migration}${fin}`);
console.log("Écrit : .cache/a-coller-lien-montre.sql");
