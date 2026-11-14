-- Les achats du village des Gaulois annoncés sur Discord (demande du pilote, 14 novembre 2026 : « dans le webhook qui
-- notifie des constructions du village, marquer aussi les achats faits dans le jeu par les joueurs, avec l'image du
-- cosmétique »). Le robot de la GitHub Action (scripts/envoyer-achats.ts, src/lib/achats-discord.ts) poste, sur le salon des
-- nouvelles, l'image des objets que chaque Gaulois a reçus depuis le passage précédent.
--
-- Ce qui compte comme un achat : les débits du journal des statères (internal.stateres_mouvements, migration
-- 20261113001800) qui donnent un objet :
-- - 'achat' : un objet acheté à la boutique ; `ref` : « emplacement/objet » (migration 20261113001900) ;
-- - 'pochette' : l'objet sorti d'une pochette surprise ; `ref` : « emplacement/objet », l'objet reçu ;
-- - 'marche_achat' : un objet acheté au marché ; `ref` : « offre/<numéro> », l'objet est celui de l'offre (migration
--   20261113002000). Une offre effacée (avec le compte de son vendeur) ne dit plus quel objet : l'achat n'est pas annoncé.
-- La forge (nature 'gravure') grave une plaque, elle ne donne pas d'objet : elle n'est pas annoncée.
--
-- Ce qui est rendu pour chaque achat : son numéro dans le journal, sa nature, l'objet, le numéro du compte (pour ranger les
-- achats d'un même Gaulois sur une seule image), un nom et son heure. Le nom est celui des autres images du robot, vues hors
-- du clan : le pseudo public d'aujourd'hui, unique dans la liste du clan (internal.member_pseudo), sinon « Gaulois n° » et le
-- numéro du compte. Pas le nom du QG (profiles.display_name) : écrit à la validation, il garderait le pseudo d'un membre qui
-- l'a caché depuis chez OpenFront. Jamais un montant, un solde, un prix payé, un vendeur, une adresse ni un identifiant
-- OpenFront. Seuls les comptes encore validés sont rendus.
--
-- Le passage du robot : il demande les achats après le dernier numéro qu'il a traité. Sans numéro (premier passage), la
-- fonction ne rend que le dernier numéro, sans aucun achat : ceux d'avant ne sont jamais annoncés. Elle lit au plus 100
-- lignes du journal à la fois, dans l'ordre, et rend `jusqu_a`, le dernier numéro lu (même s'il n'est pas rendu : compte
-- suspendu, offre effacée). Elle s'arrête sous le premier achat de moins de deux minutes (`cree_le`, l'heure du début de sa
-- transaction) : un achat se fait en moins d'une seconde, donc aucun achat encore en cours ne peut prendre un numéro plus
-- petit qu'un achat déjà lu, et un achat plus ancien n'est jamais sauté parce qu'un plus récent l'a précédé de peu.
--
-- Qui peut quoi : achats_du_village est réservée à la clé de service, celle des scripts du robot. Ni un visiteur ni un compte
-- connecté ne l'appelle.
--
-- Une fonction ajoutée, aucune table ni donnée touchée, rien au journal : c'est une lecture. Rejouée, elle se remplace par
-- la même.

-- { ok: true, jusqu_a, achats: [{ id, nature, emplacement, objet, compte, nom, le }] } ; { ok: false, error: 'invalid_request' }
-- pour un numéro négatif.
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
        'le', x.cree_le)
      order by x.id), '[]'::jsonb)
  into v_jusqu_a, v_achats
  from objets x
  join public.profiles p on p.user_id = x.user_id
  where p.status = 'validated' and x.emplacement is not null and x.objet is not null;

  return jsonb_build_object('ok', true, 'jusqu_a', v_jusqu_a, 'achats', v_achats);
end $$;

-- Postgres ouvre toute nouvelle fonction à tous : seule la clé de service, celle du robot, l'appelle.
revoke all on function public.achats_du_village(bigint) from public, anon, authenticated;
grant execute on function public.achats_du_village(bigint) to service_role;
