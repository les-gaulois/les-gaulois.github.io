-- L'activité du site, dans l'espace Direction (demande du pilote, 13 novembre 2026 : « un petit panel de activité du site,
-- nombre de visiteurs etc. »).
--
-- Le site compte ses visites lui-même, sans service extérieur, sans cookie et sans adresse IP. Chaque page ouverte sur le
-- site publié appelle `note_site_visit` avec son modèle d'adresse (une fiche de membre s'écrit `/membres/[id]`, jamais
-- l'identifiant du joueur) et des réponses par oui ou non que le navigateur tire de la date de sa dernière visite comptée,
-- la seule chose qu'il garde (`src/lib/activite-site.ts`, `src/scripts/visite.ts`) : première page du jour, de la
-- semaine, du mois, première visite tout court. À la première page du jour s'ajoutent une famille de provenance (Discord,
-- Google, OpenFront…, jamais l'adresse), l'écran tactile ou non, et une session du site gardée ou non.
--
-- Le serveur n'en garde que des totaux : une ligne par jour, par heure ronde, par famille de provenance, et au plus 100
-- pages par jour (au-delà, « /autre »). Aucune ligne par visite, aucun identifiant, rien qui distingue un visiteur d'un
-- autre. Les tables sont dans `internal`, que l'API ne montre pas. Un appel trafiqué peut gonfler un total, pas la base.
--
-- `get_site_activity` rend ces totaux à l'encadrement (officiers et au-dessus), pour l'onglet « Activité » de la Direction.
--
-- Cette migration ne fait qu'ajouter : quatre tables, fermées par RLS, et deux fonctions. Aucune donnée n'est retirée. Rejouée, elle ne
-- change rien.

/* ---------- Les totaux ---------- */

-- Un jour de Paris. `visitors` : les navigateurs venus ce jour-là, une fois chacun. `newcomers`, `touch`, `signed_in` : parmi
-- eux, ceux sans trace d'une visite d'avant, ceux à écran tactile, ceux qui gardent une session du site. `week_firsts` et
-- `month_firsts` : ceux dont c'est la première visite de la semaine ou du mois, dont les sommes donnent les visiteurs de la
-- semaine et du mois, chacun une fois.
create table if not exists internal.site_visit_days (
  day date primary key,
  views integer not null default 0 check (views >= 0),
  visitors integer not null default 0 check (visitors >= 0),
  newcomers integer not null default 0 check (newcomers >= 0),
  touch integer not null default 0 check (touch >= 0),
  signed_in integer not null default 0 check (signed_in >= 0),
  week_firsts integer not null default 0 check (week_firsts >= 0),
  month_firsts integer not null default 0 check (month_firsts >= 0)
);

create table if not exists internal.site_visit_pages (
  day date not null,
  page text not null check (char_length(page) between 1 and 64),
  views integer not null default 0 check (views >= 0),
  primary key (day, page)
);

create table if not exists internal.site_visit_hours (
  day date not null,
  hour smallint not null check (hour between 0 and 23),
  views integer not null default 0 check (views >= 0),
  primary key (day, hour)
);

create table if not exists internal.site_visit_sources (
  day date not null,
  source text not null check (source in ('direct', 'discord', 'google', 'moteur', 'openfront', 'reseaux', 'autre')),
  visitors integer not null default 0 check (visitors >= 0),
  primary key (day, source)
);

-- Fermées comme les autres tables privées : RLS sans aucune règle, et aucun droit. Seules les deux fonctions ci-dessous,
-- qui tournent avec les droits de leur propriétaire, y écrivent et y lisent.
alter table internal.site_visit_days enable row level security;
alter table internal.site_visit_pages enable row level security;
alter table internal.site_visit_hours enable row level security;
alter table internal.site_visit_sources enable row level security;
revoke all on internal.site_visit_days, internal.site_visit_pages, internal.site_visit_hours, internal.site_visit_sources from public, anon, authenticated;

/* ---------- Une page vue ---------- */

-- Ouverte à tous, visiteurs compris : c'est le visiteur qui la vit. Elle n'écrit que des totaux et ne rend que `{ ok: true }`.
-- Les réponses de la semaine, du mois, de la première visite, de la provenance, de l'écran et de la session ne comptent
-- qu'avec la première page du jour : un navigateur ne compte qu'une fois par jour.
create or replace function public.note_site_visit(
  p_page text,
  p_new_day boolean default false,
  p_new_week boolean default false,
  p_new_month boolean default false,
  p_first boolean default false,
  p_source text default null,
  p_touch boolean default false,
  p_signed_in boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_local timestamp := now() at time zone 'Europe/Paris';
  v_day date := v_local::date;
  v_hour smallint := extract(hour from v_local)::smallint;
  v_new boolean := coalesce(p_new_day, false);
  v_page text := case when p_page ~ '^/[]a-z0-9/_.[-]{0,62}$' then p_page else '/autre' end;
  v_source text := case when p_source in ('direct', 'discord', 'google', 'moteur', 'openfront', 'reseaux', 'autre') then p_source else 'autre' end;
begin
  -- Au plus 100 pages par jour : une adresse inventée de plus va dans « /autre ».
  if v_page <> '/autre'
    and not exists (select 1 from internal.site_visit_pages where day = v_day and page = v_page)
    and (select count(*) from internal.site_visit_pages where day = v_day) >= 100 then
    v_page := '/autre';
  end if;

  insert into internal.site_visit_days as d (day, views, visitors, newcomers, touch, signed_in, week_firsts, month_firsts)
  values (
    v_day, 1, v_new::int,
    (v_new and coalesce(p_first, false))::int,
    (v_new and coalesce(p_touch, false))::int,
    (v_new and coalesce(p_signed_in, false))::int,
    (v_new and coalesce(p_new_week, false))::int,
    (v_new and coalesce(p_new_month, false))::int
  )
  on conflict (day) do update set
    views = d.views + 1,
    visitors = d.visitors + excluded.visitors,
    newcomers = d.newcomers + excluded.newcomers,
    touch = d.touch + excluded.touch,
    signed_in = d.signed_in + excluded.signed_in,
    week_firsts = d.week_firsts + excluded.week_firsts,
    month_firsts = d.month_firsts + excluded.month_firsts;

  insert into internal.site_visit_pages as p (day, page, views) values (v_day, v_page, 1)
  on conflict (day, page) do update set views = p.views + 1;

  insert into internal.site_visit_hours as h (day, hour, views) values (v_day, v_hour, 1)
  on conflict (day, hour) do update set views = h.views + 1;

  if v_new then
    insert into internal.site_visit_sources as s (day, source, visitors) values (v_day, v_source, 1)
    on conflict (day, source) do update set visitors = s.visitors + 1;
  end if;
  return jsonb_build_object('ok', true);
end $$;

/* ---------- La lecture de l'encadrement ---------- */

-- Les 30 derniers jours de Paris, aujourd'hui compris ; la semaine depuis lundi ; le mois depuis le 1er ; le total depuis
-- le début du compteur (`since`, son premier jour).
create or replace function public.get_site_activity() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_detail text;
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_from date;
  v_monday date;
  v_month date;
begin
  perform internal.require_rank(2);
  v_from := v_today - 29;
  v_monday := v_today - (extract(isodow from v_today)::int - 1);
  v_month := date_trunc('month', v_today)::date;
  return jsonb_build_object(
    'ok', true,
    'read_at', now(),
    'today', v_today,
    'since', (select min(day) from internal.site_visit_days),
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object('day', day, 'views', views, 'visitors', visitors, 'newcomers', newcomers, 'touch', touch, 'signed_in', signed_in) order by day), '[]')
      from internal.site_visit_days where day between v_from and v_today
    ),
    'week', (
      select jsonb_build_object('visitors', coalesce(sum(week_firsts), 0), 'views', coalesce(sum(views), 0))
      from internal.site_visit_days where day between v_monday and v_today
    ),
    'month', (
      select jsonb_build_object('visitors', coalesce(sum(month_firsts), 0), 'views', coalesce(sum(views), 0))
      from internal.site_visit_days where day between v_month and v_today
    ),
    'pages', (
      select coalesce(jsonb_agg(jsonb_build_object('page', page, 'views', views) order by views desc, page), '[]')
      from (
        select page, sum(views)::int as views from internal.site_visit_pages
        where day between v_from and v_today group by page order by views desc, page limit 20
      ) t
    ),
    'hours', (
      select coalesce(jsonb_agg(jsonb_build_object('hour', hour, 'views', views) order by hour), '[]')
      from (select hour, sum(views)::int as views from internal.site_visit_hours where day between v_from and v_today group by hour) t
    ),
    'sources', (
      select coalesce(jsonb_agg(jsonb_build_object('source', source, 'visitors', visitors) order by visitors desc, source), '[]')
      from (select source, sum(visitors)::int as visitors from internal.site_visit_sources where day between v_from and v_today group by source) t
    ),
    'total', (select jsonb_build_object('visitors', coalesce(sum(visitors), 0), 'views', coalesce(sum(views), 0)) from internal.site_visit_days)
  );
exception when sqlstate 'GA001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return internal.error_json(sqlerrm, v_detail);
end $$;

/* ---------- Les droits ---------- */

revoke all on function public.note_site_visit(text, boolean, boolean, boolean, boolean, text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.get_site_activity() from public, anon, authenticated;

grant execute on function public.note_site_visit(text, boolean, boolean, boolean, boolean, text, boolean, boolean) to anon, authenticated;
-- Officiers et au-dessus : la fonction le vérifie elle-même.
grant execute on function public.get_site_activity() to authenticated;
