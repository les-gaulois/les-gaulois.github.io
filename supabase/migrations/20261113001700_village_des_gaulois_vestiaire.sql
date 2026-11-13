-- Le village des Gaulois, premier lot : le vestiaire (docs/DIRECTION.md, « Le village des Gaulois »).
--
-- Chaque compte lié à Discord habille son Gaulois en pixels : la peau, les cheveux et leur couleur, la barbe, puis cinq
-- emplacements d'objets à rareté (tête, haut, bas, pieds, arme). Le site dessine le Gaulois ; le serveur ne garde que la
-- tenue choisie et refuse tout ce qui n'est pas dans sa liste d'objets (`internal.gaulois_objets`), la même que celle du
-- dessin (supabase/functions/code-discord/gaulois.ts) : un test garde les deux identiques.
--
-- Les raretés, de la plus courante à la plus rare : commun, peu-commun, epique, mystique, legendaire. Le corps et les cases
-- « rien » n'en ont pas. Dans ce lot, seuls les objets gratuits se portent : les autres sont au catalogue pour la boutique
-- des lots suivants, et `enregistrer_mon_gaulois` les refuse.
--
-- Qui peut quoi :
-- - get_mon_gaulois et enregistrer_mon_gaulois : un compte connecté, lié à Discord, non suspendu. Un compte en attente
--   de validation a aussi son Gaulois : les objets gratuits sont pour tous, la monnaie des lots suivants pour les validés.
-- - discord_gaulois : la clé de service seulement, celle de la fonction code-discord, pour la commande /gaulois.
--   L'identifiant Discord vient de la commande signée par Discord, jamais d'autre chose.
--
-- Rien n'est écrit au journal de l'encadrement : c'est l'habit d'un joueur, pas une décision. La sauvegarde chiffrée
-- (export_site) ne change pas : elle ne garde pas les tenues, qu'un joueur refait en une minute.
--
-- Deux tables et cinq fonctions ajoutées, aucune donnée existante touchée. Rejouée, elle se remplace par la même.

create table if not exists internal.gaulois_objets (
  emplacement text not null check (emplacement in ('peau', 'cheveux', 'barbe', 'tete', 'haut', 'bas', 'pieds', 'arme')),
  objet text not null check (objet ~ '^[a-z][a-z-]{0,39}$'),
  -- Sans rareté : le corps et les cases « rien ».
  rarete text check (rarete in ('commun', 'peu-commun', 'epique', 'mystique', 'legendaire')),
  gratuit boolean not null default false,
  primary key (emplacement, objet)
);

insert into internal.gaulois_objets (emplacement, objet, rarete, gratuit) values
  ('peau', 'claire', null, true),
  ('peau', 'doree', null, true),
  ('peau', 'mate', null, true),
  ('peau', 'foncee', null, true),
  ('cheveux', 'aucun', null, true),
  ('cheveux', 'courts', null, true),
  ('cheveux', 'longs', null, true),
  ('cheveux', 'tresses', null, true),
  ('cheveux', 'herisses', null, true),
  ('barbe', 'aucune', null, true),
  ('barbe', 'moustache', null, true),
  ('barbe', 'longue-moustache', null, true),
  ('barbe', 'courte', null, true),
  ('barbe', 'grande', null, true),
  ('tete', 'aucun', null, true),
  ('tete', 'bonnet', 'commun', true),
  ('tete', 'bandeau', 'commun', false),
  ('tete', 'chapeau-paille', 'commun', false),
  ('tete', 'beret', 'commun', false),
  ('tete', 'capuche', 'peu-commun', false),
  ('tete', 'casque-cuir', 'peu-commun', false),
  ('tete', 'marmite', 'peu-commun', false),
  ('tete', 'casque', 'epique', false),
  ('tete', 'toque', 'epique', false),
  ('tete', 'casque-armee', 'epique', false),
  ('tete', 'slip', 'epique', false),
  ('tete', 'casque-crete', 'mystique', false),
  ('tete', 'cone', 'mystique', false),
  ('tete', 'tricorne', 'mystique', false),
  ('tete', 'casque-or', 'legendaire', false),
  ('tete', 'couronne', 'legendaire', false),
  ('haut', 'aucun', null, true),
  ('haut', 'tunique', 'commun', true),
  ('haut', 'chemise', 'commun', true),
  ('haut', 'tunique-rouge', 'commun', false),
  ('haut', 'veste-peau', 'peu-commun', false),
  ('haut', 'cotte-mailles', 'epique', false),
  ('haut', 'maillot-clan', 'epique', false),
  ('haut', 'cape-chef', 'mystique', false),
  ('haut', 'torque-or', 'legendaire', false),
  ('bas', 'aucun', null, true),
  ('bas', 'braies', 'commun', true),
  ('bas', 'braies-carreaux', 'commun', true),
  ('bas', 'braies-bleues', 'commun', false),
  ('bas', 'braies-rayees', 'peu-commun', false),
  ('bas', 'braies-cuir', 'epique', false),
  ('bas', 'jambieres-bronze', 'mystique', false),
  ('bas', 'braies-or', 'legendaire', false),
  ('pieds', 'nus', null, true),
  ('pieds', 'bottes', 'commun', true),
  ('pieds', 'sandales', 'commun', false),
  ('pieds', 'bottes-fourrees', 'peu-commun', false),
  ('pieds', 'bottes-fer', 'epique', false),
  ('pieds', 'bottes-ecarlates', 'mystique', false),
  ('pieds', 'bottes-or', 'legendaire', false),
  ('arme', 'aucune', null, true),
  ('arme', 'gourdin', 'commun', true),
  ('arme', 'baguette', 'commun', false),
  ('arme', 'poele', 'commun', false),
  ('arme', 'hache', 'peu-commun', false),
  ('arme', 'bouclier-bois', 'peu-commun', false),
  ('arme', 'poulet', 'peu-commun', false),
  ('arme', 'talkie', 'peu-commun', false),
  ('arme', 'epee', 'epique', false),
  ('arme', 'arc', 'epique', false),
  ('arme', 'drapeau', 'epique', false),
  ('arme', 'masse', 'mystique', false),
  ('arme', 'lance-patates', 'mystique', false),
  ('arme', 'bouclier-bronze', 'mystique', false),
  ('arme', 'epee-or', 'legendaire', false),
  ('arme', 'carnyx', 'legendaire', false)
on conflict (emplacement, objet) do update set rarete = excluded.rarete, gratuit = excluded.gratuit;

-- La tenue de chaque compte : une seule, remplacée à chaque enregistrement.
create table if not exists internal.gaulois (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  tenue jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tables privées : seules les fonctions ci-dessous les lisent ou les écrivent.
alter table internal.gaulois_objets enable row level security;
alter table internal.gaulois enable row level security;
revoke all on table internal.gaulois_objets from public, anon, authenticated;
revoke all on table internal.gaulois from public, anon, authenticated;

-- Une tenue complète : pour chaque emplacement un objet gratuit de la liste, la couleur des cheveux, et rien d'autre.
create or replace function internal.gaulois_tenue_valide(p_tenue jsonb) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_emplacement text;
begin
  if p_tenue is null or jsonb_typeof(p_tenue) <> 'object' then
    return false;
  end if;
  foreach v_emplacement in array array['peau', 'cheveux', 'barbe', 'tete', 'haut', 'bas', 'pieds', 'arme'] loop
    if jsonb_typeof(p_tenue -> v_emplacement) is distinct from 'string' then
      return false;
    end if;
    if not exists (
      select 1 from internal.gaulois_objets o
      where o.emplacement = v_emplacement and o.objet = p_tenue ->> v_emplacement and o.gratuit
    ) then
      return false;
    end if;
  end loop;
  if jsonb_typeof(p_tenue -> 'teinte_cheveux') is distinct from 'string'
    or not ((p_tenue ->> 'teinte_cheveux') = any (array['roux', 'blond', 'chatain', 'noir', 'gris', 'blanc'])) then
    return false;
  end if;
  return (select count(*) from jsonb_object_keys(p_tenue)) = 9;
end $$;

revoke all on function internal.gaulois_tenue_valide(jsonb) from public, anon, authenticated;

-- L'appelant, s'il peut avoir un Gaulois : connecté, non suspendu, lié à Discord. Sinon une erreur, comme ailleurs.
create or replace function internal.gaulois_titulaire() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status public.member_status;
begin
  if v_uid is null then perform internal.fail('not_signed_in'); end if;
  select p.status into v_status from public.profiles p where p.user_id = v_uid;
  if not found then perform internal.fail('not_signed_in'); end if;
  if v_status = 'suspended' then perform internal.fail('suspended'); end if;
  if not exists (select 1 from public.private_links l where l.user_id = v_uid and l.discord_id is not null) then
    perform internal.fail('discord_required');
  end if;
  return v_uid;
end $$;

revoke all on function internal.gaulois_titulaire() from public, anon, authenticated;

-- Le Gaulois de l'appelant : { ok: true, tenue } ; `tenue` vaut null tant qu'il ne l'a pas encore enregistré.
create or replace function public.get_mon_gaulois() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_detail text;
begin
  begin
    v_uid := internal.gaulois_titulaire();
    return jsonb_build_object('ok', true, 'tenue', (select g.tenue from internal.gaulois g where g.user_id = v_uid));
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.get_mon_gaulois() from public, anon, authenticated;
grant execute on function public.get_mon_gaulois() to authenticated;

-- Enregistre la tenue de l'appelant, après l'avoir vérifiée : { ok: true, tenue }, ou { ok: false, error: 'invalid_tenue' }.
create or replace function public.enregistrer_mon_gaulois(p_tenue jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.gaulois_titulaire();
    if not internal.gaulois_tenue_valide(p_tenue) then
      perform internal.fail('invalid_tenue');
    end if;
    insert into internal.gaulois (user_id, tenue) values (v_uid, p_tenue)
    on conflict (user_id) do update set tenue = excluded.tenue, updated_at = now();
    return jsonb_build_object('ok', true, 'tenue', p_tenue);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.enregistrer_mon_gaulois(jsonb) from public, anon, authenticated;
grant execute on function public.enregistrer_mon_gaulois(jsonb) to authenticated;

-- Pour /gaulois : la tenue du compte lié à ce Discord. { ok: true, tenue } ; { ok: false, error: 'no_account' } pour un
-- Discord sans compte ou un compte suspendu ; 'no_gaulois' pour un compte sans Gaulois ; 'invalid_request' pour un
-- identifiant mal formé (la page /etat de la fonction s'en sert pour voir que la migration est installée).
create or replace function public.discord_gaulois(p_discord_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_tenue jsonb;
begin
  if p_discord_id is null or p_discord_id !~ '^[0-9]{17,20}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  select l.user_id into v_uid
  from public.private_links l
  join public.profiles p on p.user_id = l.user_id
  where l.discord_id = p_discord_id and p.status <> 'suspended'
  limit 1;
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_account');
  end if;
  select g.tenue into v_tenue from internal.gaulois g where g.user_id = v_uid;
  if v_tenue is null then
    return jsonb_build_object('ok', false, 'error', 'no_gaulois');
  end if;
  return jsonb_build_object('ok', true, 'tenue', v_tenue);
end $$;

-- Postgres ouvre toute nouvelle fonction à tous : seule la clé de service, celle de la fonction code-discord, l'appelle.
revoke all on function public.discord_gaulois(text) from public, anon, authenticated;
grant execute on function public.discord_gaulois(text) to service_role;
