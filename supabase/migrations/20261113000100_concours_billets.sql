-- La tombola des concours (13 novembre 2026, choix du pilote parmi trois maquettes) : chaque participant reçoit un billet
-- numéroté, dans l'ordre des inscriptions, que le robot dessine (supabase/functions/code-discord/billets.ts). Au tirage, le
-- billet gagnant s'affiche devant tout le monde. Le tirage ne change pas : l'ordre au hasard de tous les participants
-- (internal.concours_tirer, migration 20261112000800). Qui se retire perd son billet ; s'il revient, il en reçoit un
-- nouveau : un numéro ne sert jamais deux fois dans un même concours. Rejouée, cette migration ne change rien.

-- Le dernier numéro donné, par concours.
alter table internal.concours add column if not exists billets integer not null default 0 check (billets >= 0);
-- Le billet de chaque participant, et celui de chaque tiré au sort, gardé avec lui quand les participants sont effacés
-- (30 jours après le tirage) : l'annonce des gagnants le montre encore.
alter table internal.concours_participants add column if not exists billet integer check (billet >= 1);
alter table internal.concours_tires add column if not exists billet integer check (billet >= 1);

-- Les participants déjà inscrits : leurs billets, dans l'ordre de leur inscription, après le dernier numéro donné.
update internal.concours_participants p
   set billet = x.n
  from (
    select q.concours_id, q.discord_id,
           c.billets + row_number() over (partition by q.concours_id order by q.inscrit_at, q.discord_id) as n
      from internal.concours_participants q
      join internal.concours c on c.id = q.concours_id
     where q.billet is null
  ) x
 where p.concours_id = x.concours_id and p.discord_id = x.discord_id;
update internal.concours c
   set billets = m.dernier
  from (select concours_id, max(billet) as dernier from internal.concours_participants group by concours_id) m
 where m.concours_id = c.id and c.billets < m.dernier;
update internal.concours_tires t
   set billet = p.billet
  from internal.concours_participants p
 where t.billet is null and p.concours_id = t.concours_id and p.discord_id = t.discord_id;

alter table internal.concours_participants alter column billet set not null;
create unique index if not exists concours_participants_billet on internal.concours_participants (concours_id, billet);

-- Tout ce que la fonction code-discord doit savoir d'un concours : comme avant, avec le dernier billet donné et le billet
-- de chaque tiré au sort.
create or replace function internal.concours_vue(p_id bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', c.id, 'guild_id', c.guild_id, 'salon_id', c.salon_id, 'message_id', c.message_id, 'createur_id', c.createur_id,
    'titre', c.titre, 'lot', c.lot, 'texte', c.texte, 'gagnants', c.gagnants, 'role_id', c.role_id,
    'notifier_id', c.notifier_id, 'image_url', c.image_url, 'image_alt', c.image_alt, 'fin', c.fin, 'statut', c.statut,
    'tire_at', c.tire_at, 'tirage_at', c.tirage_at, 'annule_par', c.annule_par, 'annule_at', c.annule_at, 'a_tirer', c.a_tirer,
    'tirage', c.tirage, 'epuise', c.epuise, 'nb_passes', c.nb_passes, 'nb_remplaces', c.nb_remplaces,
    'compte', (select count(*) from internal.concours_participants p where p.concours_id = c.id),
    'compte_tirage', c.compte_tirage, 'compte_affiche', c.compte_affiche, 'rendu', c.rendu, 'final_affiche', c.final_affiche,
    'message_perdu', c.message_perdu, 'salon_perdu', c.salon_perdu, 'essais', c.essais, 'jeton', c.travail_jeton,
    'ordre', to_jsonb(c.ordre), 'billets', c.billets,
    'tires', coalesce((
      select jsonb_agg(jsonb_build_object('discord_id', t.discord_id, 'rang', t.rang, 'tirage', t.tirage, 'issue', t.issue,
        'confirme_at', t.confirme_at, 'annonce_id', t.annonce_id, 'billet', t.billet) order by t.rang)
      from internal.concours_tires t where t.concours_id = c.id
    ), '[]'::jsonb)
  )
  from internal.concours c
  where c.id = p_id
$$;

-- Un clic sur « Prendre un billet » : comme avant, et le billet. Un nouveau participant reçoit le numéro suivant ; celui qui
-- en a déjà un le retrouve (« deja »). Le concours reste verrouillé pendant le clic : deux clics ne reçoivent jamais le
-- même numéro.
create or replace function public.concours_participer(p_id bigint, p_discord_id text, p_roles text[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v internal.concours;
  v_nouveau boolean := false;
  v_billet integer;
  v_compte integer;
  v_maj boolean;
begin
  if p_id is null or not internal.concours_numero(p_discord_id) then return internal.error_json('invalid_request', ''); end if;
  -- Verrouillé (sans toucher à la clé) : deux clics passent l'un après l'autre, en quelques millisecondes, et le tirage
  -- attend la fin de ce clic, et le compte.
  select * into v from internal.concours where id = p_id for no key update;
  if not found or v.statut = 'brouillon' then return internal.error_json('inconnu', ''); end if;
  if v.statut = 'annule' then return internal.error_json('annule', ''); end if;
  if v.statut = 'termine' or v.fin <= clock_timestamp() then return internal.error_json('termine', ''); end if;
  if v.role_id is not null and not (v.role_id = any (coalesce(p_roles, '{}'::text[]))) then
    return jsonb_build_object('ok', false, 'error', 'sans_role', 'role_id', v.role_id);
  end if;
  select billet into v_billet from internal.concours_participants where concours_id = p_id and discord_id = p_discord_id;
  if not found then
    update internal.concours set billets = billets + 1 where id = p_id returning billets into v_billet;
    insert into internal.concours_participants (concours_id, discord_id, billet) values (p_id, p_discord_id, v_billet);
    v_nouveau := true;
  end if;
  select count(*) into v_compte from internal.concours_participants where concours_id = p_id;
  update internal.concours set maj_at = now()
   where id = p_id and message_id is not null and not message_perdu and compte_affiche <> v_compte
     and (maj_at is null or maj_at < now() - interval '3 seconds');
  v_maj := found;
  return jsonb_build_object('ok', true, 'etat', case when v_nouveau then 'inscrit' else 'deja' end, 'compte', v_compte,
    'billet', v_billet, 'titre', v.titre, 'fin', v.fin, 'maj', v_maj, 'concours', case when v_maj then internal.concours_vue(p_id) end);
end $$;

-- « Me retirer » : comme avant, et le numéro du billet rendu.
create or replace function public.concours_quitter(p_id bigint, p_discord_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v internal.concours;
  v_retire boolean;
  v_billet integer;
  v_compte integer;
  v_maj boolean;
begin
  if p_id is null or not internal.concours_numero(p_discord_id) then return internal.error_json('invalid_request', ''); end if;
  -- Verrouillé (sans toucher à la clé) : deux clics passent l'un après l'autre, en quelques millisecondes, et le tirage
  -- attend la fin de ce clic, et le compte.
  select * into v from internal.concours where id = p_id for no key update;
  if not found or v.statut = 'brouillon' then return internal.error_json('inconnu', ''); end if;
  if v.statut = 'annule' then return internal.error_json('annule', ''); end if;
  if v.statut = 'termine' or v.fin <= clock_timestamp() then return internal.error_json('termine', ''); end if;
  delete from internal.concours_participants where concours_id = p_id and discord_id = p_discord_id returning billet into v_billet;
  v_retire := found;
  select count(*) into v_compte from internal.concours_participants where concours_id = p_id;
  update internal.concours set maj_at = now()
   where id = p_id and message_id is not null and not message_perdu and compte_affiche <> v_compte
     and (maj_at is null or maj_at < now() - interval '3 seconds');
  v_maj := found;
  return jsonb_build_object('ok', true, 'etat', case when v_retire then 'retire' else 'absent' end, 'compte', v_compte,
    'billet', v_billet, 'titre', v.titre, 'fin', v.fin, 'maj', v_maj, 'concours', case when v_maj then internal.concours_vue(p_id) end);
end $$;

-- La liste des billets : comme avant (`ids`, `gagnants`), et, dans l'ordre des numéros, les 150 premiers billets avec leur
-- participant (`billets`), les billets gagnants (`gagnes`) et le billet de celui qui demande (`billet`, ou null).
create or replace function public.concours_participants(p_id bigint, p_discord_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v internal.concours;
begin
  if p_id is null or not internal.concours_numero(p_discord_id) then return internal.error_json('invalid_request', ''); end if;
  select * into v from internal.concours where id = p_id;
  if not found or v.statut = 'brouillon' then return internal.error_json('inconnu', ''); end if;
  return jsonb_build_object('ok', true, 'statut', v.statut, 'titre', v.titre, 'fin', v.fin,
    'ouvert', v.statut = 'ouvert' and v.fin > now(),
    'compte', (select count(*) from internal.concours_participants where concours_id = p_id),
    'compte_tirage', v.compte_tirage,
    'inscrit', exists (select 1 from internal.concours_participants where concours_id = p_id and discord_id = p_discord_id),
    'billet', (select billet from internal.concours_participants where concours_id = p_id and discord_id = p_discord_id),
    'ids', coalesce((
      select jsonb_agg(x.discord_id order by x.billet)
      from (select discord_id, billet from internal.concours_participants where concours_id = p_id order by billet limit 150) x
    ), '[]'::jsonb),
    'billets', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.discord_id, 'billet', x.billet) order by x.billet)
      from (select discord_id, billet from internal.concours_participants where concours_id = p_id order by billet limit 150) x
    ), '[]'::jsonb),
    'gagnants', coalesce((
      select jsonb_agg(t.discord_id order by t.tirage, t.rang)
      from internal.concours_tires t where t.concours_id = p_id and t.issue = 'gagnant'
    ), '[]'::jsonb),
    'gagnes', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.discord_id, 'billet', t.billet) order by t.tirage, t.rang)
      from internal.concours_tires t where t.concours_id = p_id and t.issue = 'gagnant'
    ), '[]'::jsonb));
end $$;

-- Les gagnants choisis par la fonction : comme avant, et chaque tiré au sort garde son billet.
create or replace function public.concours_choix(p_id bigint, p_jeton uuid, p_tirage integer, p_elus text[], p_passes jsonb, p_epuise boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v internal.concours;
  v_elus text[] := coalesce(p_elus, '{}'::text[]);
  v_passes jsonb := coalesce(p_passes, '[]'::jsonb);
  v_tous text[];
  v_reste text[];
begin
  if p_id is null or p_jeton is null or p_tirage is null or jsonb_typeof(v_passes) <> 'array' then
    return internal.error_json('invalid_request', '');
  end if;
  select * into v from internal.concours where id = p_id for update;
  if not found or v.travail_jeton is distinct from p_jeton or v.statut <> 'termine' or v.tirage <> p_tirage or v.ordre is null then
    return internal.error_json('perime', '');
  end if;
  if cardinality(v_elus) > v.a_tirer then return internal.error_json('invalid_request', ''); end if;
  if exists (select 1 from jsonb_array_elements(v_passes) e
             where jsonb_typeof(e) <> 'object' or coalesce(e ->> 'raison', '') not in ('parti', 'sans_role')) then
    return internal.error_json('invalid_request', '');
  end if;
  v_tous := v_elus || coalesce((select array_agg(e ->> 'id') from jsonb_array_elements(v_passes) e), '{}'::text[]);
  -- Ceux que le tirage n'a pas encore atteints, dans l'ordre.
  v_reste := coalesce(array(
    select u.x from unnest(v.ordre) with ordinality as u(x, n)
    where not exists (select 1 from internal.concours_tires t where t.concours_id = p_id and t.discord_id = u.x)
    order by u.n
  ), '{}'::text[]);
  -- Chacun une fois, et tous ensemble exactement les premiers de ce reste ; épuisé : tout le reste.
  if (select count(distinct x) from unnest(v_tous) x) <> cardinality(v_tous)
     or exists (select 1 from unnest(v_tous) x where x is null)
     or coalesce((select array_agg(x order by x) from unnest(v_tous) x), '{}'::text[])
        is distinct from coalesce((select array_agg(x order by x) from unnest(v_reste[1:cardinality(v_tous)]) x), '{}'::text[])
     or (coalesce(p_epuise, false) and cardinality(v_tous) <> cardinality(v_reste)) then
    return internal.error_json('invalid_request', '');
  end if;
  insert into internal.concours_tires (concours_id, discord_id, rang, tirage, issue, billet)
  select p_id, x, array_position(v.ordre, x), v.tirage, 'gagnant',
         (select p.billet from internal.concours_participants p where p.concours_id = p_id and p.discord_id = x)
  from unnest(v_elus) x;
  insert into internal.concours_tires (concours_id, discord_id, rang, tirage, issue, billet)
  select p_id, e ->> 'id', array_position(v.ordre, e ->> 'id'), v.tirage, e ->> 'raison',
         (select p.billet from internal.concours_participants p where p.concours_id = p_id and p.discord_id = e ->> 'id')
  from jsonb_array_elements(v_passes) e;
  update internal.concours
     set a_tirer = case when coalesce(p_epuise, false) then 0 else a_tirer - cardinality(v_elus) end,
         epuise = epuise or coalesce(p_epuise, false),
         nb_passes = nb_passes + jsonb_array_length(v_passes),
         rendu = rendu + 1, final_affiche = false
   where id = p_id;
  return jsonb_build_object('ok', true, 'concours', internal.concours_vue(p_id));
end $$;

-- `create or replace` garde les droits des fonctions : réservées à la clé de service, comme avant. Redits ici pour qu'un
-- fichier rejoué seul ne laisse rien d'ouvert.
revoke all on function internal.concours_vue(bigint) from public, anon, authenticated;
revoke all on function public.concours_participer(bigint, text, text[]) from public, anon, authenticated;
revoke all on function public.concours_quitter(bigint, text) from public, anon, authenticated;
revoke all on function public.concours_participants(bigint, text) from public, anon, authenticated;
revoke all on function public.concours_choix(bigint, uuid, integer, text[], jsonb, boolean) from public, anon, authenticated;
grant execute on function public.concours_participer(bigint, text, text[]) to service_role;
grant execute on function public.concours_quitter(bigint, text) to service_role;
grant execute on function public.concours_participants(bigint, text) to service_role;
grant execute on function public.concours_choix(bigint, uuid, integer, text[], jsonb, boolean) to service_role;

notify pgrst, 'reload schema';
