-- La bannière des membres sur la liste du clan (demande du pilote, 16 novembre 2026, docs/DIRECTION.md, « La bannière sur la
-- liste des membres ») : la ligne d'un membre qui a choisi une bannière pour son Gaulois la porte en fond, sur la page
-- « Liste des membres » du site.
--
-- Comme pour les Gaulois des images (20261114000400_gaulois_sur_les_images.sql) : l'Action qui construit le site ne connaît
-- que la liste du clan, et envoie l'empreinte (SHA-256, comme internal.hash_public_id) de l'identifiant OpenFront des
-- membres au pseudo public, jamais l'identifiant lui-même. La fonction rend la bannière des seuls membres :
-- - au pseudo public et unique dans la liste du clan (internal.member_pseudo, la règle du village) ;
-- - liés à un compte du site, avec Discord, au statut « validé » (ni en attente, ni suspendu) ;
-- - qui montrent une bannière sur /gaulois (internal.gaulois.banniere, toujours une bannière possédée).
-- Les autres empreintes sont absentes de la réponse, sans dire pourquoi. Seul l'identifiant de la bannière est rendu : ni
-- le solde, ni les autres bannières du compte, ni ce qu'il a payé.
--
-- Qui peut quoi : bannieres_des_joueurs est réservée à la clé de service, celle de l'étape « Lire les Gaulois des fiches »
-- de la GitHub Action (src/lib/bannieres-joueurs.ts). Ni un visiteur ni un compte connecté ne l'appelle.
--
-- Une fonction ajoutée, aucune table ni donnée touchée, rien au journal : c'est une lecture. Rejouée, elle se remplace par la même.

-- { ok: true, bannieres: { <empreinte>: <identifiant de bannière> } } ; { ok: false, error: 'invalid_request' } pour une
-- liste absente, de plus de 500 empreintes, ou dont une empreinte n'a pas la forme d'un SHA-256 en hexadécimal minuscule.
create or replace function public.bannieres_des_joueurs(p_empreintes text[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_bannieres jsonb;
begin
  if p_empreintes is null
    or cardinality(p_empreintes) > 500
    or exists (select 1 from unnest(p_empreintes) e where e is null or e !~ '^[0-9a-f]{64}$') then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  select coalesce(jsonb_object_agg(l.openfront_hash, g.banniere), '{}'::jsonb) into v_bannieres
  from (select distinct e from unnest(p_empreintes) e) d
  join public.private_links l on l.openfront_hash = d.e
  join public.profiles p on p.user_id = l.user_id
  join internal.gaulois g on g.user_id = l.user_id
  where p.status = 'validated'
    and l.discord_id is not null
    and g.banniere is not null
    and internal.member_pseudo(l.user_id) is not null;
  return jsonb_build_object('ok', true, 'bannieres', v_bannieres);
end $$;

-- Postgres ouvre toute nouvelle fonction à tous : seule la clé de service, celle de l'Action, l'appelle.
revoke all on function public.bannieres_des_joueurs(text[]) from public, anon, authenticated;
grant execute on function public.bannieres_des_joueurs(text[]) to service_role;
