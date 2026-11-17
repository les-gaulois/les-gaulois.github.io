-- La loterie passe du lundi au mardi (docs/DIRECTION.md, « La loterie du mardi » ; calculs de l'écran :
-- src/lib/village/loterie.ts).
--
-- Demande du pilote, mardi 17 novembre 2026 : « j'aimerais décaler la loterie pour mardi de la semaine, alors tu peux
-- faire en sorte que la loterie sorte ce soir ». Tout se décale d'un jour, rien d'autre ne change :
-- - Le tirage a lieu chaque mardi à 21 h 30, heure de Paris. Le premier est celui du mardi 17 novembre 2026, ce soir.
-- - La semaine d'un tirage : les sept jours d'avant, du mardi 0 h au lundi minuit, à Paris. Le tirage du 17 novembre
--   compte donc les points des parties commencées du mardi 10 au lundi 16 ; celles du 17 comptent pour le tirage du 24.
-- - Les billets, leur prix, le plafond des achats, l'ordre du tirage et les lots restent ceux de la
--   20261116001200_loterie_du_lundi.sql. Aucun statère de plus n'est créé : seul le jour change.
--
-- Ce qui est remplacé : internal.loterie_premier_tirage, internal.loterie_tirage_a_venir et internal.loterie_reveil
-- (mêmes signatures, mêmes droits), et la tâche pg_cron « gal-loterie », qui passe de chaque minute du lundi à chaque
-- minute du mardi (21 h 30 à Paris est 19 h 30 ou 20 h 30 UTC : le même jour). internal.loterie_heure,
-- internal.loterie_semaine_debut et internal.loterie_semaine_fin partent du jour du tirage : elles n'ont pas à changer.
--
-- Les billets déjà achetés : depuis le 16 novembre, ils étaient notés pour le tirage du lundi 23, qui n'aura pas lieu.
-- Aucun n'est perdu ni remboursé : ils vont au tirage de ce soir, dans la limite des billets gagnés du 10 au 16 (la règle
-- « jamais plus de billets achetés que de billets gagnés »), et ce qui dépasse va au tirage du mardi 24, où comptent les
-- points du 17 qui avaient permis de les acheter. Rien n'est effacé.
--
-- Aucune table, aucune colonne ajoutée ni retirée. Rejouée, elle ne change rien : il ne reste alors aucun billet noté
-- pour le lundi 23.

/* ---------- Le calendrier ---------- */

-- Le mardi du premier tirage : rien n'est tiré pour les semaines d'avant.
create or replace function internal.loterie_premier_tirage() returns date
language sql immutable set search_path = public, pg_temp as $$
  select date '2026-11-17'
$$;

-- Le mardi du tirage à venir : aujourd'hui avant 21 h 30 un mardi, sinon le mardi suivant ; jamais avant le premier.
-- `mardi` : le mardi de la semaine en cours à Paris (le lundi de date_trunc, plus un jour).
create or replace function internal.loterie_tirage_a_venir(p_at timestamptz default now()) returns date
language sql stable set search_path = public, pg_temp as $$
  select greatest(internal.loterie_premier_tirage(), case when l.ici < l.mardi + time '21:30' then l.mardi else l.mardi + 7 end)
  from (select p_at at time zone 'Europe/Paris' as ici, date_trunc('week', p_at at time zone 'Europe/Paris')::date + 1 as mardi) l
$$;

-- Le réveil de pg_cron : le tirage de ce mardi s'il est l'heure, et celui du mardi d'avant s'il a été manqué. Le lundi,
-- « ce mardi » est demain : internal.loterie_tirer le refuse, il n'est pas l'heure.
create or replace function internal.loterie_reveil() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_mardi date := date_trunc('week', now() at time zone 'Europe/Paris')::date + 1;
begin
  perform internal.loterie_tirer(v_mardi - 7);
  perform internal.loterie_tirer(v_mardi);
end $$;

/* ---------- Les billets déjà achetés pour le lundi 23 ---------- */

-- Ce qui dépasse les billets gagnés du 10 au 16 va au tirage du mardi 24.
insert into internal.loterie_achats (tirage, user_id, billets)
  select date '2026-11-24', a.user_id, a.billets - g.billets
  from internal.loterie_achats a
  join internal.loterie_gratuits(date '2026-11-17') g on g.user_id = a.user_id
  where a.tirage = date '2026-11-23' and a.billets > g.billets
  on conflict (tirage, user_id) do nothing;

-- Le reste va au tirage de ce soir.
update internal.loterie_achats a
  set tirage = date '2026-11-17', billets = least(a.billets, g.billets), maj_le = now()
  from internal.loterie_gratuits(date '2026-11-17') g
  where a.tirage = date '2026-11-23' and g.user_id = a.user_id;

-- Qui n'a rapporté aucun point du 10 au 16 n'est pas du tirage de ce soir : ses billets vont à celui du mardi 24.
update internal.loterie_achats a
  set tirage = date '2026-11-24', maj_le = now()
  where a.tirage = date '2026-11-23';

/* ---------- pg_cron ---------- */

-- Chaque minute du mardi (le tirage part dans la minute de 21 h 30). La tâche porte le même nom : la planifier de
-- nouveau la remplace. Le rattrapage de chaque heure ne change pas.
do $cron$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('gal-loterie', '* * * * 2', 'select internal.loterie_reveil()');
  end if;
end $cron$;

/* ---------- Les droits ---------- */

revoke all on function internal.loterie_premier_tirage() from public, anon, authenticated;
revoke all on function internal.loterie_tirage_a_venir(timestamptz) from public, anon, authenticated;
revoke all on function internal.loterie_reveil() from public, anon, authenticated;
