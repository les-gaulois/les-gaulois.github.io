-- Le familier des membres sur leur carte (docs/DIRECTION.md, « Le rayon Cartes » ; lecture : src/lib/familiers-joueurs.ts).
--
-- Demande du pilote, 17 novembre 2026 : « faut qu'on puisse un jour ajouter le familier s'ils en ont », puis « fais-moi
-- ça ». La carte d'un membre (podium de l'accueil, tête de sa fiche) montre le familier qu'il montre à côté de son Gaulois.
--
-- Une seule fonction, de lecture, calquée ligne pour ligne sur bannieres_des_joueurs (20261116000900) :
-- - familiers_des_joueurs : la clé de service seulement, pour la construction du site ; par empreinte de l'identifiant
--   public, le familier que montre un membre validé, lié à Discord, au pseudo public (internal.gaulois_montre : pendant un
--   essai en mode GOD, celui d'avant l'essai). Jamais la liste de ses familiers, jamais un solde.
--
-- Aucune table, aucune colonne, aucune donnée touchée. Rejouée, elle se remplace par la même.

-- { ok: true, familiers: { empreinte: familier } } ; invalid_request pour une liste mal formée.
create or replace function public.familiers_des_joueurs(p_empreintes text[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_familiers jsonb;
begin
  if p_empreintes is null
    or cardinality(p_empreintes) > 500
    or exists (select 1 from unnest(p_empreintes) e where e is null or e !~ '^[0-9a-f]{64}$') then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  select coalesce(jsonb_object_agg(l.openfront_hash, m.familier), '{}'::jsonb) into v_familiers
  from (select distinct e from unnest(p_empreintes) e) d
  join public.private_links l on l.openfront_hash = d.e
  join public.profiles p on p.user_id = l.user_id
  join internal.gaulois g on g.user_id = l.user_id
  join lateral internal.gaulois_montre(g.user_id) m on true
  where p.status = 'validated'
    and l.discord_id is not null
    and m.familier is not null
    and internal.member_pseudo(l.user_id) is not null;
  return jsonb_build_object('ok', true, 'familiers', v_familiers);
end $$;

revoke all on function public.familiers_des_joueurs(text[]) from public, anon, authenticated;
grant execute on function public.familiers_des_joueurs(text[]) to service_role;
