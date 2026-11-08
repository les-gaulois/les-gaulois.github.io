-- La pastille de l'en-tête : le nombre de demandes qui attendent un officier.
-- Le site l'appelle sur chaque page pour l'encadrement : elle ne lit qu'un nombre, le même que la case
-- « Demandes à traiter » de l'espace Direction, et le refuse à qui n'est pas officier, admin ou fondateur.

create function public.count_pending_requests() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_detail text;
begin
  perform internal.require_rank(2);
  return jsonb_build_object(
    'ok', true,
    'pending', (select count(*) from public.membership_requests where status = 'pending')
  );
exception when sqlstate 'GA001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return internal.error_json(sqlerrm, v_detail);
end $$;

revoke all on function public.count_pending_requests() from public, anon, authenticated;
grant execute on function public.count_pending_requests() to authenticated;
