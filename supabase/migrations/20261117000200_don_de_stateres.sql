-- Le don de statères : un panneau pour un seul compte (docs/DIRECTION.md, « Le don de statères »).
--
-- Demande du pilote, 17 novembre 2026 : « un panel pour give des statères, uniquement disponible pour Jod ! attention ».
--
-- Les règles :
-- - Un seul compte y a droit : celui dont l'identifiant Discord est dans internal.stateres_don_titulaire. Cette table est
--   vide ici : l'identifiant s'écrit dans l'éditeur SQL de Supabase, jamais dans le dépôt. Le compte se reconnaît par
--   public.private_links.discord_id, qui ne vient que de Discord (auth.identities, ou la commande /code signée). Tout autre
--   compte, fondateur compris, reçoit { permis: false } à la lecture et 'forbidden' au don.
-- - Un don : de 1 à 100 000 statères (internal.stateres_don_plafond), à un compte validé, avec un motif facultatif de 80
--   signes au plus. Il s'écrit au journal des statères (nature 'don') et crée ces statères : c'est voulu par le pilote.
-- - Un don ne part qu'une fois : l'écran envoie une clé tirée au hasard, et la même clé renvoyée ne redonne rien.
-- - Chaque don est gardé dans internal.stateres_dons et va au journal de l'encadrement ('stateres_don', avec le montant).
-- - Le solde de celui qui reçoit n'est jamais rendu : un solde ne se montre qu'à son titulaire.
-- - Pendant un essai du mode GOD de celui qui reçoit, le don reste un vrai gain : internal.village_god_mouvement le laisse
--   passer comme 'victoire'.
--
-- Ce qui change :
-- - Deux tables privées : internal.stateres_don_titulaire (qui y a droit) et internal.stateres_dons (les dons faits).
-- - public.get_stateres_don et public.donner_stateres (nouvelles).
-- - internal.village_god_mouvement, celle de 20261116001200_loterie_du_lundi.sql, avec 'don' parmi les vrais gains.
--
-- Aucune donnée existante n'est touchée. Rejouée, elle ne change plus rien.

create table if not exists internal.stateres_don_titulaire (
  discord_id text primary key check (discord_id ~ '^[0-9]{17,20}$')
);

create table if not exists internal.stateres_dons (
  id bigint generated always as identity primary key,
  -- La clé de l'envoi, tirée par l'écran : un envoi répété ne donne pas deux fois.
  cle uuid not null unique,
  donneur_id uuid not null references public.profiles (user_id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  montant integer not null check (montant between 1 and 100000),
  motif text check (motif is null or char_length(motif) between 1 and 80),
  cree_le timestamptz not null default now()
);
create index if not exists stateres_dons_recents on internal.stateres_dons (cree_le desc);

alter table internal.stateres_don_titulaire enable row level security;
alter table internal.stateres_dons enable row level security;
revoke all on table internal.stateres_don_titulaire from public, anon, authenticated;
revoke all on table internal.stateres_dons from public, anon, authenticated;

-- Le plus qu'un seul don peut porter.
create or replace function internal.stateres_don_plafond() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 100000 $$;

-- L'appelant a-t-il droit au don ? Son identifiant Discord, lu chez Discord, est dans la table des titulaires, et son
-- compte est validé.
create or replace function internal.stateres_don_permis() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.profiles p
    join public.private_links l on l.user_id = p.user_id
    join internal.stateres_don_titulaire t on t.discord_id = l.discord_id
    where p.user_id = auth.uid() and p.status = 'validated'
  )
$$;

revoke all on function internal.stateres_don_plafond() from public, anon, authenticated;
revoke all on function internal.stateres_don_permis() from public, anon, authenticated;

/* ---------- Le mode GOD ---------- */

-- Celle de 20261116001200_loterie_du_lundi.sql, avec un ajout : un don ('don') est un vrai gain, comme les points
-- rapportés au clan. Le déclencheur qui l'appelle reste le même.
create or replace function internal.village_god_mouvement() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.nature ~ '^(god|test)_' then return new; end if;
  if not exists (select 1 from internal.village_god d where d.user_id = new.user_id) then return new; end if;
  if new.nature in ('victoire', 'pronostic_gain', 'pronostic_rendu', 'marche_vente', 'loterie_lot', 'don') then return new; end if;
  if new.nature in ('marche_achat', 'pronostic_mise') then perform internal.fail('mode_god'); end if;
  new.nature := left('test_' || new.nature, 32);
  return new;
end $$;

revoke all on function internal.village_god_mouvement() from public, anon, authenticated;

/* ---------- Les deux fonctions du panneau ---------- */

-- { ok: true, permis: false } pour tout autre compte : l'écran ne montre alors rien.
-- { ok: true, permis: true, plafond, membres: [{ id, nom, numero }], dons: [{ le, nom, montant, motif }] } pour le titulaire :
-- les comptes validés par nom, avec leur numéro de Gaulois (deux comptes peuvent porter le même nom), et ses 20 derniers
-- dons. Jamais un solde.
create or replace function public.get_stateres_don() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not internal.stateres_don_permis() then
    return jsonb_build_object('ok', true, 'permis', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'permis', true,
    'plafond', internal.stateres_don_plafond(),
    'membres', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.user_id, 'nom', internal.village_nom(p.display_name, p.gaul_number), 'numero', p.gaul_number)
        order by lower(internal.village_nom(p.display_name, p.gaul_number)), p.user_id)
      from public.profiles p
      where p.status = 'validated'), '[]'::jsonb),
    'dons', coalesce((
      select jsonb_agg(jsonb_build_object('le', t.cree_le, 'nom', t.nom, 'montant', t.montant, 'motif', t.motif) order by t.cree_le desc, t.id desc)
      from (
        select d.id, d.cree_le, d.montant, d.motif, internal.village_nom(p.display_name, p.gaul_number) as nom
        from internal.stateres_dons d
        join public.profiles p on p.user_id = d.user_id
        order by d.cree_le desc, d.id desc
        limit 20
      ) t), '[]'::jsonb)
  );
end $$;

-- Donne `p_montant` statères au compte `p_user`. La même clé `p_cle` envoyée deux fois ne donne qu'une fois.
-- Refus : 'forbidden', 'rate_limited', 'invalid_request', 'unknown_member'.
create or replace function public.donner_stateres(p_user uuid, p_montant integer, p_motif text, p_cle uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_motif text := nullif(btrim(coalesce(p_motif, '')), '');
  v_don bigint;
begin
  if v_uid is null or not internal.stateres_don_permis() then return internal.error_json('forbidden', ''); end if;
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  if p_user is null or p_cle is null or p_montant is null
    or p_montant not between 1 and internal.stateres_don_plafond()
    or char_length(coalesce(v_motif, '')) > 80 then
    return internal.error_json('invalid_request', '');
  end if;
  perform internal.village_verrou(p_user);
  -- Déjà fait avec cette clé : rien de plus.
  if exists (select 1 from internal.stateres_dons d where d.cle = p_cle) then return public.get_stateres_don(); end if;
  if not exists (select 1 from public.profiles p where p.user_id = p_user and p.status = 'validated') then
    return internal.error_json('unknown_member', '');
  end if;

  insert into internal.stateres_dons (cle, donneur_id, user_id, montant, motif) values (p_cle, v_uid, p_user, p_montant, v_motif)
  returning id into v_don;
  insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (p_user, 'don', p_montant, 'don/' || v_don::text);
  perform internal.log_admin(v_uid, 'stateres_don', p_user, jsonb_build_object('montant', p_montant));
  return public.get_stateres_don();
end $$;

revoke all on function public.get_stateres_don() from public, anon, authenticated;
revoke all on function public.donner_stateres(uuid, integer, text, uuid) from public, anon, authenticated;
-- Tout compte connecté peut les appeler : chacune vérifie elle-même le titulaire.
grant execute on function public.get_stateres_don() to authenticated;
grant execute on function public.donner_stateres(uuid, integer, text, uuid) to authenticated;
