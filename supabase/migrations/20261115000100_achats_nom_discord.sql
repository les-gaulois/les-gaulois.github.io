-- Les achats du village sur Discord, sous le nom Discord de l'acheteur (demande du pilote, 15 novembre 2026 : « pourquoi tu
-- affiches pas le pseudo Discord avec @ devant le pseudo sur l'image »). Remplace achats_du_village de la migration
-- 20261114001700_village_achats_sur_discord.sql, déjà appliquée : même signature, mêmes droits, même lecture du journal.
--
-- Ce qui change : chaque achat rend en plus `discord`, le nom d'utilisateur Discord du compte
-- (public.private_links.discord_name), que le robot écrit précédé de « @ » sur l'image. Ce nom ne vient que de Discord : relu
-- dans auth.identities à chaque vraie connexion au site (internal.sync_discord_identity, migrations 20261105000900 et
-- 20261112000500), ou donné par la commande /code signée par Discord pour un compte ouvert par un code (20261112000500) ;
-- jamais de raw_user_meta_data, qu'un joueur peut écrire lui-même. C'est le nom lu à la dernière vraie connexion : une session
-- qui se renouvelle seule ne le relit pas, il peut donc dater de plusieurs semaines. Le robot ne lit ni l'identifiant Discord,
-- ni la photo.
-- `nom` reste le nom de secours, inchangé : le pseudo public d'aujourd'hui (internal.member_pseudo), sinon « Gaulois n° » et
-- le numéro du compte. Le robot l'écrit quand le compte n'a pas de nom Discord lisible.
--
-- Une fonction remplacée, aucune table ni donnée touchée, rien au journal : c'est une lecture. Rejouée, elle se remplace par
-- la même.

-- { ok: true, jusqu_a, achats: [{ id, nature, emplacement, objet, compte, nom, discord, le }] } ;
-- { ok: false, error: 'invalid_request' } pour un numéro négatif.
create or replace function public.achats_du_village(p_apres bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_avant timestamptz := now() - interval '2 minutes';
  v_borne bigint;
  v_jusqu_a bigint;
  v_achats jsonb;
begin
  if p_apres is not null and p_apres < 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  -- Le premier achat trop récent : rien ne se lit à partir de lui.
  select coalesce(min(m.id), 9223372036854775807) into v_borne
  from internal.stateres_mouvements m
  where m.nature in ('achat', 'pochette', 'marche_achat') and m.cree_le > v_avant;

  -- Premier passage : le dernier numéro seulement.
  if p_apres is null then
    select coalesce(max(m.id), 0) into v_jusqu_a
    from internal.stateres_mouvements m
    where m.nature in ('achat', 'pochette', 'marche_achat') and m.id < v_borne;
    return jsonb_build_object('ok', true, 'jusqu_a', v_jusqu_a, 'achats', '[]'::jsonb);
  end if;

  with lus as (
    select m.id, m.user_id, m.nature, m.ref, m.cree_le
    from internal.stateres_mouvements m
    where m.id > p_apres and m.id < v_borne and m.nature in ('achat', 'pochette', 'marche_achat')
    order by m.id
    limit 100
  ),
  objets as (
    select l.id, l.user_id, l.nature, l.cree_le,
      case when l.nature = 'marche_achat' then o.emplacement
           when l.ref ~ '^[a-z]{1,20}/[a-z][a-z-]{0,39}$' then split_part(l.ref, '/', 1) end as emplacement,
      case when l.nature = 'marche_achat' then o.objet
           when l.ref ~ '^[a-z]{1,20}/[a-z][a-z-]{0,39}$' then split_part(l.ref, '/', 2) end as objet
    from lus l
    -- Le `case` garde la conversion : un « emplacement/objet » n'est jamais lu comme un numéro.
    left join internal.marche_offres o
      on l.nature = 'marche_achat'
      and o.id = case when l.ref ~ '^offre/[0-9]{1,18}$' then substring(l.ref from 7)::bigint end
  )
  select
    (select coalesce(max(l.id), p_apres) from lus l),
    coalesce(jsonb_agg(jsonb_build_object(
        'id', x.id,
        'nature', x.nature,
        'emplacement', x.emplacement,
        'objet', x.objet,
        'compte', p.gaul_number,
        'nom', coalesce(internal.member_pseudo(p.user_id), 'Gaulois n° ' || p.gaul_number),
        'discord', nullif(btrim(pl.discord_name), ''),
        'le', x.cree_le)
      order by x.id), '[]'::jsonb)
  into v_jusqu_a, v_achats
  from objets x
  join public.profiles p on p.user_id = x.user_id
  left join public.private_links pl on pl.user_id = x.user_id
  where p.status = 'validated' and x.emplacement is not null and x.objet is not null;

  return jsonb_build_object('ok', true, 'jusqu_a', v_jusqu_a, 'achats', v_achats);
end $$;

-- Les droits ne changent pas : seule la clé de service, celle du robot, l'appelle.
revoke all on function public.achats_du_village(bigint) from public, anon, authenticated;
grant execute on function public.achats_du_village(bigint) to service_role;
