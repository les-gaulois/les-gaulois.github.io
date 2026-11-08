-- Pour la GitHub Action seulement, avec la clé de service : prévenir l'encadrement sur Discord des demandes
-- qui attendent, et sauvegarder chaque semaine les données du site, chiffrées. Aucune de ces fonctions n'est
-- ouverte au site. Cette migration ne fait qu'ajouter des fonctions.

/* ---------- Prévenir l'encadrement ---------- */

-- Le nombre de demandes en attente, la plus ancienne, la plus récente, et ce qui a déjà été annoncé.
-- Ni nom ni identifiant : le message posté sur Discord n'en contient pas.
create function public.staff_digest() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'pending', (select count(*) from public.membership_requests where status = 'pending'),
    'oldest_at', (select min(created_at) from public.membership_requests where status = 'pending'),
    'newest_id', (select max(id) from public.membership_requests where status = 'pending'),
    'notice', (select value from public.app_state where key = 'staff_notice')
  )
$$;

-- Note ce qui vient d'être annoncé : la dernière demande signalée et l'heure du dernier message.
create function public.note_staff_notice(p_newest_id bigint, p_reminded_at timestamptz) returns jsonb
language sql security definer set search_path = public, pg_temp as $$
  insert into public.app_state (key, value, updated_at)
  values ('staff_notice', jsonb_build_object('newest_id', p_newest_id, 'reminded_at', p_reminded_at), now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at
  returning jsonb_build_object('ok', true)
$$;

/* ---------- La sauvegarde ---------- */

-- Ce que le site garde et qui ne se retrouve nulle part ailleurs : comptes et rôles, liens Discord, demandes, journal,
-- annonces, événements, réponses « Je viens », sondages et mot d'accueil. Le moins possible de données sensibles :
--  - des votes, seulement les totaux par choix : personne, pas même avec la phrase de passe, n'apprend qui a voté quoi ;
--  - ni l'empreinte du publicId OpenFront, ni les textes libres d'une demande (ce que le joueur a tapé, son mot pour
--    l'officier) : avec l'API publique, ils pourraient lever l'anonymat d'un membre anonyme. Après une restauration,
--    le lien avec le profil OpenFront est perdu : un compte restauré le refait par une demande, une fois remis en attente ;
--  - ni les rôles prévus (internal.role_presets), qu'on ne lit que dans l'éditeur de Supabase, ni la liste officielle,
--    qui se relit, ni les tables de l'ancien jeu.
create function public.export_site() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'version', 1,
    'exported_at', now(),
    'profiles', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.profiles t),
    'private_links', (select coalesce(jsonb_agg(to_jsonb(t) - 'openfront_hash'), '[]') from public.private_links t),
    'membership_requests', (select coalesce(jsonb_agg(to_jsonb(t) - 'openfront_hash' - 'claimed_text' - 'note'), '[]') from public.membership_requests t),
    'admin_log', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.admin_log t),
    'site_announcements', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.site_announcements t),
    'site_events', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.site_events t),
    'event_attendance', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.event_attendance t),
    'polls', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.polls t),
    'poll_totals', (select coalesce(jsonb_agg(jsonb_build_object('poll_id', v.poll_id, 'choice', v.choice, 'votes', v.votes)), '[]') from (
      select poll_id, choice, count(*) as votes from internal.poll_votes group by poll_id, choice
    ) v),
    'welcome', (select to_jsonb(t) from public.app_state t where t.key = 'welcome')
  )
$$;

/* ---------- Règles d'accès : la clé de service seulement ---------- */

revoke all on function public.staff_digest() from public, anon, authenticated;
revoke all on function public.note_staff_notice(bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.export_site() from public, anon, authenticated;
grant execute on function public.staff_digest() to service_role;
grant execute on function public.note_staff_notice(bigint, timestamptz) to service_role;
grant execute on function public.export_site() to service_role;
