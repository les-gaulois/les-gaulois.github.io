-- Les gros gains du poker du barde sur Discord, à partir du carré (docs/direction/43-le-casino-des-gaulois.md ; robot :
-- src/lib/casino-discord.ts, SORTE_ANNONCEE_DU_POKER).
--
-- Choix du pilote, 28 novembre 2026 : « Oui, dès le carré ». Un coup du poker part dans la file des annonces s'il gagne au
-- moins 1 000 statères (la règle de tous les jeux, internal.casino_annonce_seuil) ET si la main finie est un carré ou mieux
-- (sorte 7 et plus : carré, quinte flush, quinte flush royale). À 200 de mise, une couleur ou un full gagnent déjà 1 000
-- statères, une main sur quarante environ : ils ne partent pas.
--
-- La file rend aussi, pour le poker, la donne d'avant le tirage (internal.casino_poker_mains.donne) : le robot vérifie que
-- les cartes gardées en viennent et calcule la vraie chance du coup avec les cartes gardées.
--
-- Une seule fonction remplacée, public.casino_annonces_a_envoyer, qui garde ses droits (la seule clé de service). Aucune
-- table, aucune ligne touchée. Rejouée, elle se remplace par la même.

create or replace function public.casino_annonces_a_envoyer() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('ok', true, 'seuil', internal.casino_annonce_seuil(), 'annonces', coalesce((
    select jsonb_agg(jsonb_build_object(
        'partie', c.id,
        'le', c.fini_le,
        'jeu', c.jeu,
        'mise', c.mise,
        'rendu', c.rendu,
        'paris', c.paris,
        'resultat', c.resultat,
        'donne', to_jsonb(pm.donne),
        'nom', coalesce(internal.member_pseudo(c.user_id), 'Gaulois n° ' || pr.gaul_number),
        'discord', nullif(btrim(pl.discord_name), ''))
      order by c.id)
    from (
      select p.id, p.user_id, p.fini_le, p.jeu, p.mise, p.rendu, p.paris, p.resultat
      from internal.casino_parties p
      where p.id > coalesce((select d.partie from internal.casino_annonces_depart d where d.id), 9223372036854775807)
        and p.fini
        and not p.god
        and p.jeu <> 'vingt-et-un'
        and (p.jeu <> 'poker' or coalesce((p.resultat ->> 'sorte')::integer, 0) >= 7)
        and p.rendu - p.mise >= internal.casino_annonce_seuil()
        and p.fini_le > now() - interval '48 hours'
        and not exists (select 1 from internal.casino_annonces a where a.partie = p.id)
        and exists (select 1 from public.profiles v where v.user_id = p.user_id and v.status = 'validated')
      order by p.id
      limit 20
    ) c
    join public.profiles pr on pr.user_id = c.user_id
    left join internal.casino_poker_mains pm on pm.partie = c.id
    left join public.private_links pl on pl.user_id = c.user_id), '[]'::jsonb))
$$;
