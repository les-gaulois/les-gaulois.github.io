-- Les Gaulois du village sur les images du robot (demande du pilote, 14 novembre 2026, docs/DIRECTION.md, « Les Gaulois
-- sur les images du robot ») : un petit Gaulois au-dessus du nom de chaque membre qui a créé le sien, sur les images que
-- le robot poste sur Discord et sur l'image d'aperçu des fiches.
--
-- Le robot ne connaît que la liste du clan : il envoie l'empreinte (SHA-256, comme internal.hash_public_id) de l'identifiant
-- OpenFront des membres de son image, jamais l'identifiant lui-même. La fonction rend la tenue des seuls membres :
-- - au pseudo public et unique dans la liste du clan (internal.member_pseudo, la règle du village) : poser le Gaulois, montré
--   au village avec son nom, sur le nom en partie d'un membre anonyme relierait les deux ;
-- - liés à un compte du site, avec Discord, au statut « validé » (ni en attente, ni suspendu) ;
-- - qui ont enregistré leur Gaulois au vestiaire (internal.gaulois).
-- Les autres empreintes sont absentes de la réponse, sans dire pourquoi. La tenue est rendue telle qu'elle est enregistrée :
-- c'est le dessin (lireTenue) qui l'accepte ou l'ignore, pour qu'un objet ajouté plus tard ne la fasse pas disparaître.
--
-- Qui peut quoi : gaulois_des_joueurs est réservée à la clé de service, celle des scripts du robot dans la GitHub Action
-- (src/lib/gaulois-joueurs.ts). Ni un visiteur ni un compte connecté ne l'appelle.
--
-- Une fonction ajoutée, aucune table ni donnée touchée, rien au journal : c'est une lecture. Rejouée, elle se remplace par la même.

-- { ok: true, gaulois: { <empreinte>: <tenue> } } ; { ok: false, error: 'invalid_request' } pour une liste absente, de plus
-- de 500 empreintes, ou dont une empreinte n'a pas la forme d'un SHA-256 en hexadécimal minuscule.
create or replace function public.gaulois_des_joueurs(p_empreintes text[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_gaulois jsonb;
begin
  if p_empreintes is null
    or cardinality(p_empreintes) > 500
    or exists (select 1 from unnest(p_empreintes) e where e is null or e !~ '^[0-9a-f]{64}$') then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;
  select coalesce(jsonb_object_agg(l.openfront_hash, g.tenue), '{}'::jsonb) into v_gaulois
  from (select distinct e from unnest(p_empreintes) e) d
  join public.private_links l on l.openfront_hash = d.e
  join public.profiles p on p.user_id = l.user_id
  join internal.gaulois g on g.user_id = l.user_id
  where p.status = 'validated'
    and l.discord_id is not null
    and internal.member_pseudo(l.user_id) is not null;
  return jsonb_build_object('ok', true, 'gaulois', v_gaulois);
end $$;

-- Postgres ouvre toute nouvelle fonction à tous : seule la clé de service, celle du robot, l'appelle.
revoke all on function public.gaulois_des_joueurs(text[]) from public, anon, authenticated;
grant execute on function public.gaulois_des_joueurs(text[]) to service_role;
