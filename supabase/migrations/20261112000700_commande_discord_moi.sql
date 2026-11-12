-- La commande /moi du robot sur Discord (docs/DIRECTION.md, « Les commandes du robot ») : la fiche de qui la tape.
--
-- La fonction serveur code-discord reçoit la commande signée par Discord : l'identifiant Discord vient donc de Discord,
-- jamais du navigateur ni d'un texte tapé. Elle demande ici, avec la clé de service seulement, le pseudo du membre validé
-- lié à ce Discord, dans la liste du clan que le robot relit une fois par jour : le même chemin que les photos des membres
-- (get_member_faces), par l'empreinte de l'identifiant OpenFront. Rien n'est écrit, et seul ce pseudo, déjà public, sort.
-- Comme pour les photos, un pseudo porté par deux membres ne désigne personne : la fiche montrée pourrait être celle de l'autre.
--
-- Réponses : { ok: true, pseudo } ; { ok: false, error: 'not_member' } pour un Discord sans compte, un compte en attente ou
-- suspendu, ou un membre sorti de la liste ; { ok: false, error: 'no_pseudo' } pour un membre validé sans pseudo public, à
-- qui la commande dit comment en choisir un ; { ok: false, error: 'shared_pseudo' } pour un pseudo porté par deux membres ;
-- { ok: false, error: 'invalid_request' } pour un identifiant mal formé.
--
-- Une fonction ajoutée, aucune table ni donnée touchée. Rejouée, elle se remplace par la même.

create or replace function public.discord_moi(p_discord_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_found boolean;
  v_pseudo text;
begin
  if p_discord_id is null or p_discord_id !~ '^[0-9]{17,20}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  select true, c.username into v_found, v_pseudo
  from public.private_links l
  join public.profiles p on p.user_id = l.user_id
  join public.clan_roster c on c.public_id_hash = l.openfront_hash
  where l.discord_id = p_discord_id and p.status = 'validated'
  limit 1;
  if v_found is null then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;
  if v_pseudo is null then
    return jsonb_build_object('ok', false, 'error', 'no_pseudo');
  end if;
  if (select count(*) from public.clan_roster c2 where lower(c2.username) = lower(v_pseudo)) <> 1 then
    return jsonb_build_object('ok', false, 'error', 'shared_pseudo');
  end if;
  return jsonb_build_object('ok', true, 'pseudo', v_pseudo);
end $$;

-- Postgres ouvre toute nouvelle fonction à tous : seule la clé de service, celle de la fonction code-discord, l'appelle.
revoke all on function public.discord_moi(text) from public, anon, authenticated;
grant execute on function public.discord_moi(text) to service_role;
