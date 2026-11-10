-- Les appels aux salons sans format, à la demande du pilote : le membre ne colle plus que le lien de son salon. Le site ne
-- peut pas lire lui-même la carte ni le format d'un salon d'OpenFront (docs/API_AUDIT.md, « Salons en attente ») : il ne
-- les devine pas, il ne les demande plus. Un format reste accepté, pour les pages encore ouvertes d'avant cette version,
-- mais seulement de la même liste ; les appels déjà lancés gardent le leur.
-- Cette migration ne fait qu'assouplir : la colonne accepte l'absence de format, et save_lobby_call aussi. Aucune donnée
-- n'est retirée, aucune colonne ni table supprimée.

-- La règle de la colonne reste la même liste de formats : une absence de format (null) la respecte.
alter table internal.lobby_calls alter column team_format drop not null;

-- Comme la version de 20261109000300_appels_aux_salons.sql, avec un format facultatif.
create or replace function public.save_lobby_call(p_game text, p_format text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid;
  v_game text := btrim(coalesce(p_game, ''));
  v_format text := nullif(btrim(coalesce(p_format, '')), '');
  v_previous internal.lobby_calls;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_actor := internal.require_rank(1);
    if v_game !~ '^[A-Za-z0-9]{8,10}$' then perform internal.fail('invalid_game'); end if;
    if v_format is not null and v_format not in ('duos', 'trios', 'quads', '2', '3', '4', '5', '6', '7', 'private') then perform internal.fail('invalid_format'); end if;
    -- Deux envois simultanés du même membre comptent l'un après l'autre : sinon, chacun passerait l'attente.
    perform pg_advisory_xact_lock(hashtext('gal_lobby_call'), hashtext(v_actor::text));
    delete from internal.lobby_calls where expires_at <= now();
    select * into v_previous from internal.lobby_calls where user_id = v_actor;
    if found and v_previous.game_id = v_game and v_previous.ended_at is null then
      update internal.lobby_calls set team_format = v_format where user_id = v_actor;
    else
      if found and v_previous.created_at > now() - interval '1 minute' then perform internal.fail('call_too_soon'); end if;
      insert into internal.lobby_calls (user_id, game_id, team_format, expires_at)
      values (v_actor, v_game, v_format, now() + interval '15 minutes')
      on conflict (user_id) do update
        set game_id = excluded.game_id, team_format = excluded.team_format, created_at = now(), expires_at = excluded.expires_at, ended_at = null;
    end if;
    return jsonb_build_object('ok', true);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

-- Les mêmes droits qu'avant, redits : fermée à tous, puis ouverte aux seuls comptes connectés ; la fonction vérifie le reste.
revoke all on function public.save_lobby_call(text, text) from public, anon, authenticated;
grant execute on function public.save_lobby_call(text, text) to authenticated;
