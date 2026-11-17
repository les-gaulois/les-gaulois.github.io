-- Les tenues gardées du vestiaire (17 novembre 2026, choix du pilote parmi six suggestions : « des tenues enregistrées,
-- trois emplacements pour garder une tenue complète et la remettre d'un clic »).
--
-- Ce que c'est : trois places par membre, où ranger une tenue complète de son Gaulois. Garder une tenue ne la porte pas :
-- le vestiaire la remet à l'écran, et c'est « Enregistrer ma tenue » (`enregistrer_mon_gaulois`) qui la fait porter, avec
-- ses propres contrôles. Une tenue gardée dont un objet a été vendu depuis est donc refusée à ce moment-là, comme toute
-- tenue qu'on ne peut plus porter.
--
-- Ce qui est gardé : internal.gaulois_tenues, une ligne par membre et par place (1 à 3), la tenue telle que
-- `internal.gaulois_tenue_valide` l'accepte au moment de la garder. Rien d'autre : ni nom, ni statère, ni objet créé.
--
-- Ce que le site appelle (formes dans src/lib/village/tenues-gardees.ts) :
-- - get_mes_tenues() : { ok: true, places: 3, tenues: [{ place, tenue, gardee_le }] }, dans l'ordre des places ; une
--   place vide n'a pas de ligne.
-- - garder_tenue(p_place, p_tenue) : range la tenue à cette place, à la place de celle qui y était, et répond comme
--   get_mes_tenues. Refus : `invalid_request` (place hors de 1 à 3), `invalid_tenue` (tenue que le vestiaire refuse),
--   `mode_god` (pendant un essai du mode GOD, qui ne doit laisser aucune trace), et
--   ceux du titulaire (`not_signed_in`, `no_discord`…), comme `enregistrer_mon_gaulois`.
--
-- Cette migration ne fait qu'ajouter : aucune table, colonne ni ligne existante n'est retirée ou changée.

create table if not exists internal.gaulois_tenues (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  place smallint not null check (place between 1 and 3),
  tenue jsonb not null,
  gardee_le timestamptz not null default now(),
  primary key (user_id, place)
);

-- Table privée : seules les deux fonctions ci-dessous la lisent ou l'écrivent.
alter table internal.gaulois_tenues enable row level security;
revoke all on table internal.gaulois_tenues from public, anon, authenticated;

-- Les tenues gardées d'un membre, dans la forme que rendent les deux fonctions publiques.
create or replace function internal.gaulois_tenues_json(p_uid uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'places', 3,
    'tenues', coalesce(
      (select jsonb_agg(jsonb_build_object('place', t.place, 'tenue', t.tenue, 'gardee_le', t.gardee_le) order by t.place)
       from internal.gaulois_tenues t where t.user_id = p_uid),
      '[]'::jsonb)
  );
$$;

revoke all on function internal.gaulois_tenues_json(uuid) from public, anon, authenticated;

create or replace function public.get_mes_tenues() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_detail text;
begin
  begin
    v_uid := internal.gaulois_titulaire();
    return internal.gaulois_tenues_json(v_uid);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.get_mes_tenues() from public, anon, authenticated;
grant execute on function public.get_mes_tenues() to authenticated;

create or replace function public.garder_tenue(p_place integer, p_tenue jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_detail text;
  v_essai boolean;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.gaulois_titulaire();
    perform internal.village_verrou(v_uid);
    -- Pendant un essai du mode GOD (migration 20261116000900, si elle est installée), l'inventaire est une copie qui
    -- disparaît à la fin : une tenue gardée alors resterait, faite d'objets que le compte n'a pas.
    if to_regclass('internal.village_god') is not null then
      execute 'select exists (select 1 from internal.village_god d where d.user_id = $1)' into v_essai using v_uid;
      if v_essai then perform internal.fail('mode_god'); end if;
    end if;
    if p_place is null or p_place < 1 or p_place > 3 then
      perform internal.fail('invalid_request');
    end if;
    if p_tenue is null or not internal.gaulois_tenue_valide(p_tenue) then
      perform internal.fail('invalid_tenue');
    end if;
    insert into internal.gaulois_tenues (user_id, place, tenue) values (v_uid, p_place::smallint, p_tenue)
    on conflict (user_id, place) do update set tenue = excluded.tenue, gardee_le = now();
    return internal.gaulois_tenues_json(v_uid);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.garder_tenue(integer, jsonb) from public, anon, authenticated;
grant execute on function public.garder_tenue(integer, jsonb) to authenticated;
