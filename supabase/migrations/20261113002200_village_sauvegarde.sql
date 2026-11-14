-- Le village des Gaulois dans la sauvegarde chiffrée (docs/DIRECTION.md, « La sauvegarde chiffrée » et « Le village des
-- Gaulois ») : une nouvelle version d'export_site, la cinquième.
--
-- Comme la version 4 (migration 20261113000400), ligne pour ligne, avec en plus tout ce que le village garde et qui ne se
-- retrouve nulle part ailleurs : les tenues des Gaulois, les inventaires, le journal et les soldes des statères, les réglages
-- des prix et de la pochette, les offres du marché.
--
-- Avec la même règle que le reste de la sauvegarde : rien qui puisse lever l'anonymat d'un membre si la phrase de passe était
-- devinée. Une partie d'OpenFront se relit avec l'API publique, avec les identifiants de tous ses joueurs : la liste des
-- parties qui ont rapporté des statères à un compte, ou leurs heures et leurs points, désigneraient son joueur OpenFront, comme
-- l'empreinte que la sauvegarde ne garde pas. D'où :
-- - les crédits des points rapportés au clan (nature 'victoire') ne sont gardés qu'en un total par compte
--   (`stateres_victoires_totaux`), sans partie, sans heure, sans points ;
-- - les autres lignes du journal (achats, pochettes, marché) sont gardées en entier, sans les colonnes des parties ;
-- - les soldes sans l'heure de leur dernier mouvement ;
-- - ni les parties notées ni les empreintes de leurs Gaulois (internal.stateres_victoires, internal.stateres_presences),
--   effacées au bout d'un mois et que la relecture retrouve, ni les suspensions notées pour les statères, que le journal de
--   l'encadrement redit.
--
-- Après une restauration, le journal se refait avec, pour chaque compte, une ligne « reprise » du total de ses crédits, puis
-- les autres lignes ; le solde suit le journal, et doit retrouver celui de la sauvegarde. Pour que la relecture ne paie pas
-- une seconde fois les parties d'avant la sauvegarde, chaque compte reçoit une suspension pour les statères qui finit à
-- l'heure de la sauvegarde (`exported_at`) : docs/DIRECTION.md, « La sauvegarde chiffrée ».
--
-- Une fonction remplacée, aucune donnée touchée. Rejouée, elle se remplace par la même.

create or replace function public.export_site() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'version', 5,
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
    'ideas', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.ideas t),
    'idea_support_totals', (select coalesce(jsonb_agg(jsonb_build_object('idea_id', s.idea_id, 'supports', s.supports)), '[]') from (
      select idea_id, count(*) as supports from internal.idea_supports group by idea_id
    ) s),
    'welcome', (select to_jsonb(t) from public.app_state t where t.key = 'welcome'),
    'weekly_picks', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.weekly_picks t),
    'alliances', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.alliances t),
    'alliance_clans', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.alliance_clans t),
    'alliance_zones', (select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object('mask', translate(encode(t.mask, 'base64'), E'\n', ''))), '[]') from internal.alliance_zones t),
    'alliance_allies', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.alliance_allies t),
    'alliance_troops', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.alliance_troops t),
    -- Ajouts de la version 5 : le village des Gaulois.
    'gaulois', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.user_id), '[]') from internal.gaulois t),
    'gaulois_inventaire', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.emplacement, t.objet), '[]') from internal.gaulois_inventaire t),
    'stateres_mouvements', (select coalesce(jsonb_agg(to_jsonb(t) - 'partie' - 'debut' - 'points' - 'gaulois' order by t.id), '[]') from internal.stateres_mouvements t where t.nature <> 'victoire'),
    'stateres_victoires_totaux', (select coalesce(jsonb_agg(jsonb_build_object('user_id', v.user_id, 'stateres', v.stateres) order by v.user_id), '[]') from (
      select user_id, sum(montant) as stateres from internal.stateres_mouvements where nature = 'victoire' group by user_id
    ) v),
    'stateres_soldes', (select coalesce(jsonb_agg(jsonb_build_object('user_id', t.user_id, 'solde', t.solde) order by t.user_id), '[]') from internal.stateres_soldes t),
    'village_prix', (select coalesce(jsonb_agg(to_jsonb(t) order by t.rarete), '[]') from internal.village_prix t),
    'village_pochette', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.village_pochette t),
    'marche_offres', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from internal.marche_offres t)
  )
$$;

-- La sauvegarde reste réservée à la clé de service, comme avant.
revoke all on function public.export_site() from public, anon, authenticated;
grant execute on function public.export_site() to service_role;
