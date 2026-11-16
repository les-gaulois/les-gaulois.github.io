-- Les bannières sur le podium du coffre (demande du pilote, 16 novembre 2026, docs/DIRECTION.md, « Le coffre en images ») :
-- le fond de l'image de /perceurs se partage en trois, et chaque tiers montre la bannière que ce membre a choisie pour son
-- Gaulois. Le palmarès rend donc, avec la tenue de chaque perceur, l'identifiant de la bannière qu'il montre (celle de
-- /gaulois, toujours une bannière qu'il possède), ou rien.
--
-- Comme la tenue : seulement pour un membre au compte validé, avec son Gaulois. Seul l'identifiant de la bannière est rendu,
-- ni ses autres bannières, ni ce qu'il a payé. La bannière choisie se voit déjà sur /gaulois, sur la liste des membres et
-- dans la vitrine.
--
-- Pendant un essai du mode GOD (20261116000900), le podium montre le Gaulois et la bannière tels que les autres les voient,
-- pas ceux de l'essai : la lecture passe par internal.gaulois_montre quand elle existe, sinon par la table elle-même.
--
-- Une fonction interne ajoutée, et une fonction remplacée par la même avec un champ de plus (20261116001300_coffre_en_images.sql), aucune table ni donnée
-- touchée. Réservée, comme avant, à la clé de service de la fonction serveur code-discord. Rejouée, elle ne change rien.

-- Le Gaulois d'un compte tel que les autres le voient : sa tenue et la bannière qu'il montre.
create or replace function internal.coffre_gaulois(p_user uuid) returns table (tenue jsonb, banniere text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_user is null then
    return;
  end if;
  if to_regprocedure('internal.gaulois_montre(uuid)') is not null then
    return query execute 'select m.tenue, m.banniere from internal.gaulois_montre($1) m' using p_user;
  else
    return query select g.tenue, g.banniere from internal.gaulois g where g.user_id = p_user;
  end if;
end $$;

create or replace function public.coffre_palmares() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'depuis', date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris',
    'perceurs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'discord_id', t.gagnant_discord_id,
        'nom', t.nom,
        'coffres', t.coffres,
        'tenue', (select g.tenue from internal.coffre_gaulois(internal.coffre_compte(t.gagnant_discord_id)) g),
        'banniere', (select g.banniere from internal.coffre_gaulois(internal.coffre_compte(t.gagnant_discord_id)) g)) order by t.coffres desc, t.dernier asc)
      from (
        select m.gagnant_discord_id, count(*) as coffres, max(m.trouvee_le) as dernier,
               (array_agg(m.gagnant_nom order by m.trouvee_le desc))[1] as nom
        from internal.coffre_manches m
        where m.trouvee_le >= date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'
          and m.gagnant_discord_id is not null
        group by m.gagnant_discord_id
        order by count(*) desc, max(m.trouvee_le) asc
        limit 3
      ) t), '[]'::jsonb))
$$;

revoke all on function internal.coffre_gaulois(uuid) from public, anon, authenticated;
revoke all on function public.coffre_palmares() from public, anon, authenticated;
grant execute on function public.coffre_palmares() to service_role;
