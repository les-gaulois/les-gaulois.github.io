-- Les Gaulois uniques, côté serveur (docs/DIRECTION.md, « Le village des Gaulois » ; dessins :
-- supabase/functions/code-discord/modeles/ ; formes des réponses : src/lib/village/contrat.ts).
--
-- Demande du pilote, 15 novembre 2026 : « je veux que tu me crées des Gaulois uniques (lézard), (dragon), (axolotl),
-- (ovni), (golem)… 15 modèles faits par Fable 5.2 », puis, sur la galerie, « j'aime pas le champignon, l'esprit du chêne,
-- la grenouille et le golem ; tu peux les mettre en pochette dédiée et en boutique ». Un Gaulois unique remplace le corps
-- humain du Gaulois par celui d'une créature, dessinée par Claude Fable 5.2 ; tous les objets se portent dessus.
--
-- Les règles :
-- - Un Gaulois unique s'achète à la boutique, au quintuple du prix d'un objet de sa rareté (internal.village_prix, que
--   l'encadrement règle dans l'onglet Village de la Direction) : au départ 500, 1 250, 2 500, 5 000 et 12 500 statères. Le
--   quintuple n'est écrit qu'à un endroit, internal.modele_prix.
-- - Ou il sort de la pochette des Gaulois uniques, à 2 000 statères au départ (jamais moins de 500), qui ne donne jamais un
--   modèle déjà possédé, comme celle des familiers : elle tire une rareté selon ses chances (au départ 45, 28, 15, 8 et 4
--   pour cent) parmi celles où le compte a encore un modèle à recevoir (une rareté épuisée est sautée, les autres se
--   partagent ses chances à proportion), puis un modèle de cette rareté qu'il n'a pas, tous à chances égales. Le hasard
--   vient du générateur sûr de Postgres (internal.village_hasard). Qui les a tous reçoit le refus 'tout_possede', sans
--   rien payer.
-- - Un seul exemplaire de chacun : ni marché, ni forge. Un modèle acheté à la boutique ne sort plus de la pochette, et
--   inversement.
-- - Le débit est une ligne du journal des statères, `ref` « modele/<identifiant> », de nature 'achat' à la boutique et
--   'pochette' dans la pochette : l'onglet Village de la Direction compte ces dépenses avec les achats et les pochettes (son
--   détail par rareté ne lit que les objets) ; l'annonce des achats sur Discord (achats_du_village) les lit sous
--   l'emplacement « modele », sans changement.
-- - Le modèle porté est la clé `modele` de la tenue, facultative (absente : le corps humain). Elle s'enregistre comme le
--   reste de la tenue, par enregistrer_mon_gaulois, dont la vérification (internal.gaulois_tenue_valide) exige maintenant
--   que le modèle soit de la liste et possédé par le compte. Le site, /gaulois et les images du robot lisent la tenue :
--   ils dessinent le modèle sans autre changement.
--
-- Ce qui est gardé :
-- - internal.modeles : la liste des Gaulois uniques et leur rareté, celle des dessins (un test garde les deux identiques).
-- - internal.modeles_pochette : le prix de la pochette des Gaulois uniques et ses chances par rareté, sur une seule ligne.
--   Un réglage se change, il ne s'efface pas (internal.village_reglage_garde). Rejouée, la migration ne le remet pas à sa
--   valeur de départ.
-- - internal.gaulois_modeles : les Gaulois uniques de chaque compte, et quand il les a reçus. S'efface avec le compte.
--
-- Qui peut quoi :
-- - get_mes_modeles : un compte connecté, non suspendu ; son solde, les prix, la pochette, ses modèles, celui qu'il porte.
-- - acheter_modele, ouvrir_pochette_modeles : un compte validé qui a créé son Gaulois. Ils prennent le verrou du compte
--   (internal.village_verrou), comme les achats d'objets et la tenue.
-- - internal.gaulois_tenue_valide (remplacée, depuis la version de la 20261115000600) : la clé `modele` est permise.
-- - export_site (remplacée, depuis la 20261115000900, version 8) : la sauvegarde chiffrée garde en plus les Gaulois
--   uniques de chaque compte et le réglage de leur pochette (version 9). Le modèle porté y est déjà, dans la tenue.
--
-- Rien n'est écrit au journal de l'encadrement : ce sont des achats de joueurs. Aucun solde ne se lit pour un autre compte.
-- Trois tables et six fonctions ajoutées, deux fonctions remplacées, aucune donnée existante touchée. Rejouée, elle se
-- remplace par la même.

create table if not exists internal.modeles (
  modele text primary key check (modele ~ '^[a-z][a-z-]{0,39}$'),
  rarete text not null check (rarete in ('commun', 'peu-commun', 'epique', 'mystique', 'legendaire'))
);

-- <modeles> : la liste de supabase/functions/code-discord/modeles/index.ts (RARETES_DES_MODELES), dans le même ordre.
insert into internal.modeles (modele, rarete) values
  ('lezard', 'commun'),
  ('loup', 'commun'),
  ('sanglier', 'commun'),
  ('axolotl', 'peu-commun'),
  ('corbeau', 'peu-commun'),
  ('squelette', 'peu-commun'),
  ('givre', 'epique'),
  ('automate', 'epique'),
  ('magma', 'mystique'),
  ('ovni', 'mystique'),
  ('dragon', 'legendaire')
on conflict (modele) do update set rarete = excluded.rarete;
-- </modeles>

-- Une seule ligne. Chaque chance va de 0 à 100 pour cent, avec deux décimales au plus ; ensemble, elles font 100.
create table if not exists internal.modeles_pochette (
  id boolean primary key default true check (id),
  prix integer not null check (prix between 500 and 1000000),
  commun numeric(5, 2) not null check (commun between 0 and 100),
  peu_commun numeric(5, 2) not null check (peu_commun between 0 and 100),
  epique numeric(5, 2) not null check (epique between 0 and 100),
  mystique numeric(5, 2) not null check (mystique between 0 and 100),
  legendaire numeric(5, 2) not null check (legendaire between 0 and 100),
  maj_le timestamptz not null default now(),
  constraint modeles_pochette_cent check (commun + peu_commun + epique + mystique + legendaire = 100)
);

insert into internal.modeles_pochette (id, prix, commun, peu_commun, epique, mystique, legendaire) values
  (true, 2000, 45, 28, 15, 8, 4)
on conflict (id) do nothing;

-- Les Gaulois uniques de chaque compte : un seul exemplaire de chacun, jamais de double.
create table if not exists internal.gaulois_modeles (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  modele text not null references internal.modeles (modele),
  acquis_le timestamptz not null default now(),
  primary key (user_id, modele)
);

-- Tables privées : seules les fonctions ci-dessous les lisent ou les écrivent.
alter table internal.modeles enable row level security;
alter table internal.modeles_pochette enable row level security;
alter table internal.gaulois_modeles enable row level security;
revoke all on table internal.modeles from public, anon, authenticated;
revoke all on table internal.modeles_pochette from public, anon, authenticated;
revoke all on table internal.gaulois_modeles from public, anon, authenticated;

create or replace trigger modeles_pochette_garde before delete on internal.modeles_pochette
  for each statement execute function internal.village_reglage_garde();

-- Le prix d'un Gaulois unique de cette rareté à la boutique : le quintuple de celui d'un objet de la même rareté. Null pour
-- une rareté sans prix.
create or replace function internal.modele_prix(p_rarete text) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select 5 * p.prix from internal.village_prix p where p.rarete = p_rarete
$$;

revoke all on function internal.modele_prix(text) from public, anon, authenticated;

-- Les chances de la pochette des Gaulois uniques, une ligne par rareté, de la plus courante à la plus rare.
create or replace function internal.modeles_chances() returns table (rarete text, rang integer, chance numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.rarete, r.rang, r.chance
  from internal.modeles_pochette p
  cross join lateral (values
    ('commun', 1, p.commun),
    ('peu-commun', 2, p.peu_commun),
    ('epique', 3, p.epique),
    ('mystique', 4, p.mystique),
    ('legendaire', 5, p.legendaire)
  ) as r (rarete, rang, chance)
  where p.id
$$;

revoke all on function internal.modeles_chances() from public, anon, authenticated;

-- Les Gaulois uniques qu'un compte n'a pas encore.
create or replace function internal.modeles_a_recevoir(p_user uuid) returns table (modele text, rarete text)
language sql stable security definer set search_path = public, pg_temp as $$
  select m.modele, m.rarete
  from internal.modeles m
  where not exists (select 1 from internal.gaulois_modeles g where g.user_id = p_user and g.modele = m.modele)
$$;

revoke all on function internal.modeles_a_recevoir(uuid) from public, anon, authenticated;

-- Les Gaulois uniques du compte connecté : { ok: true, solde, peut_acheter, prix: { rareté: statères }, pochette: { prix,
-- chances }, modeles: [{ modele, acquis_le }], porte }. `peut_acheter` : compte validé avec un Gaulois créé. `porte` : le
-- modèle de sa tenue, ou null (le corps humain). Crédite d'abord ce qui lui revient déjà, comme get_ma_boutique. Jamais le
-- solde ni les modèles d'un autre.
create or replace function public.get_mes_modeles() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status public.member_status;
  v_gaulois boolean;
  v_porte text;
  v_detail text;
begin
  begin
    if v_uid is null then perform internal.fail('not_signed_in'); end if;
    select p.status into v_status from public.profiles p where p.user_id = v_uid;
    if not found then perform internal.fail('not_signed_in'); end if;
    if v_status = 'suspended' then perform internal.fail('suspended'); end if;
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
  select g.tenue ->> 'modele' into v_porte from internal.gaulois g where g.user_id = v_uid;
  v_gaulois := found;
  if v_status = 'validated' and v_gaulois then
    perform internal.crediter_stateres(v_uid);
  end if;
  return jsonb_build_object(
    'ok', true,
    'solde', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = v_uid), 0),
    'peut_acheter', v_status = 'validated' and v_gaulois,
    'prix', (select jsonb_object_agg(p.rarete, internal.modele_prix(p.rarete)) from internal.village_prix p),
    'pochette', jsonb_build_object(
      'prix', (select p.prix from internal.modeles_pochette p where p.id),
      'chances', (select jsonb_object_agg(c.rarete, trim_scale(c.chance)) from internal.modeles_chances() c)
    ),
    'modeles', coalesce((
      select jsonb_agg(jsonb_build_object('modele', g.modele, 'acquis_le', g.acquis_le) order by g.acquis_le desc, g.modele)
      from internal.gaulois_modeles g
      where g.user_id = v_uid), '[]'::jsonb),
    'porte', v_porte
  );
end $$;

revoke all on function public.get_mes_modeles() from public, anon, authenticated;
grant execute on function public.get_mes_modeles() to authenticated;

-- Achète un Gaulois unique à la boutique, au prix de sa rareté : { ok: true, solde, modele: { modele, rarete } }.
-- `p_prix_vu` : le prix que le membre a vu ; s'il a changé entre-temps (réglage de l'encadrement), refus prix_change, rien
-- n'est débité. Refus, dans l'ordre : not_validated, no_gaulois, unknown_modele (hors de la liste), deja_possede,
-- prix_change, solde_insuffisant ; et ceux de tout compte (not_signed_in, suspended, rate_limited). Un refus ne débite rien.
create or replace function public.acheter_modele(p_modele text, p_prix_vu integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_rarete text;
  v_prix integer;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    select m.rarete into v_rarete from internal.modeles m where m.modele = p_modele;
    if not found then perform internal.fail('unknown_modele'); end if;
    v_prix := internal.modele_prix(v_rarete);
    if v_prix is null or v_prix <= 0 then perform internal.fail('unknown_modele'); end if;
    perform internal.village_verrou(v_uid);
    if exists (select 1 from internal.gaulois_modeles g where g.user_id = v_uid and g.modele = p_modele) then
      perform internal.fail('deja_possede');
    end if;
    if p_prix_vu is distinct from v_prix then perform internal.fail('prix_change'); end if;
    perform internal.crediter_stateres(v_uid);
    perform internal.village_debiter(v_uid, 'achat', v_prix, 'modele/' || p_modele);
    insert into internal.gaulois_modeles (user_id, modele) values (v_uid, p_modele)
    on conflict (user_id, modele) do nothing;
    -- Impossible sous le verrou du compte ; si cela arrivait, le débit s'annulerait avec le refus.
    if not found then perform internal.fail('deja_possede'); end if;
    return jsonb_build_object(
      'ok', true,
      'solde', (select s.solde from internal.stateres_soldes s where s.user_id = v_uid),
      'modele', jsonb_build_object('modele', p_modele, 'rarete', v_rarete)
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.acheter_modele(text, integer) from public, anon, authenticated;
grant execute on function public.acheter_modele(text, integer) to authenticated;

-- Ouvre une pochette des Gaulois uniques au prix réglé : { ok: true, solde, modele: { modele, rarete }, reste }. `reste` :
-- le nombre de modèles que le compte n'a pas encore, après celui-ci. `p_prix_vu` : le prix que le membre a vu ; s'il a
-- changé entre-temps, refus prix_change. Refus, dans l'ordre : not_validated, no_gaulois, prix_change, tout_possede (il les
-- a tous), solde_insuffisant ; 'invalid_request' si aucune rareté qui lui reste n'a de chances ; et ceux de tout compte
-- (not_signed_in, suspended, rate_limited). Un refus ne débite rien.
create or replace function public.ouvrir_pochette_modeles(p_prix_vu integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_prix integer;
  v_total numeric;
  v_tirage double precision;
  v_cumul numeric := 0;
  v_rarete text;
  v_r record;
  v_n integer;
  v_modele text;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    perform internal.village_verrou(v_uid);
    perform internal.crediter_stateres(v_uid);
    select p.prix into v_prix from internal.modeles_pochette p where p.id;
    if v_prix is null then perform internal.fail('invalid_request'); end if;
    if p_prix_vu is distinct from v_prix then perform internal.fail('prix_change'); end if;
    if not exists (select 1 from internal.modeles_a_recevoir(v_uid)) then perform internal.fail('tout_possede'); end if;
    -- La rareté : parmi celles qui ont des chances et un modèle qu'il n'a pas encore, selon leurs chances.
    select sum(c.chance) into v_total from internal.modeles_chances() c
    where c.chance > 0 and exists (select 1 from internal.modeles_a_recevoir(v_uid) a where a.rarete = c.rarete);
    if v_total is null or v_total <= 0 then perform internal.fail('invalid_request'); end if;
    v_tirage := internal.village_hasard() * v_total;
    for v_r in
      select c.rarete, c.chance from internal.modeles_chances() c
      where c.chance > 0 and exists (select 1 from internal.modeles_a_recevoir(v_uid) a where a.rarete = c.rarete)
      order by c.rang
    loop
      v_cumul := v_cumul + v_r.chance;
      v_rarete := v_r.rarete;
      exit when v_tirage < v_cumul;
    end loop;
    -- Le modèle : un de ceux de cette rareté qu'il n'a pas encore, tous à chances égales.
    select count(*)::integer into v_n from internal.modeles_a_recevoir(v_uid) a where a.rarete = v_rarete;
    select a.modele into v_modele
    from internal.modeles_a_recevoir(v_uid) a
    where a.rarete = v_rarete
    order by a.modele
    offset least(floor(internal.village_hasard() * v_n)::integer, v_n - 1)
    limit 1;
    perform internal.village_debiter(v_uid, 'pochette', v_prix, 'modele/' || v_modele);
    insert into internal.gaulois_modeles (user_id, modele) values (v_uid, v_modele)
    on conflict (user_id, modele) do nothing;
    -- Impossible sous le verrou du compte ; si cela arrivait, le débit s'annulerait avec le refus.
    if not found then perform internal.fail('invalid_request'); end if;
    return jsonb_build_object(
      'ok', true,
      'solde', (select s.solde from internal.stateres_soldes s where s.user_id = v_uid),
      'modele', jsonb_build_object('modele', v_modele, 'rarete', v_rarete),
      'reste', (select count(*) from internal.modeles_a_recevoir(v_uid))
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.ouvrir_pochette_modeles(integer) from public, anon, authenticated;
grant execute on function public.ouvrir_pochette_modeles(integer) to authenticated;

-- Une tenue valide pour l'appelant (remplace celle de la 20261115000600, ligne pour ligne, plus le Gaulois unique) : à
-- chaque emplacement, un objet gratuit ou de son inventaire ; le visage peut manquer ; la clé `modele` peut manquer (le
-- corps humain) et, présente, nomme un Gaulois unique de la liste que l'appelant possède.
create or replace function internal.gaulois_tenue_valide(p_tenue jsonb) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_emplacement text;
  v_cles integer := 1;
begin
  if p_tenue is null or jsonb_typeof(p_tenue) <> 'object' then
    return false;
  end if;
  foreach v_emplacement in array array['peau', 'cheveux', 'barbe', 'yeux', 'bouche', 'cicatrice', 'tete', 'haut', 'bas', 'pieds', 'arme'] loop
    -- Une tenue d'avant le 14 novembre 2026 n'a pas de visage : elle garde celui d'avant.
    if v_emplacement in ('yeux', 'bouche', 'cicatrice') and not (p_tenue ? v_emplacement) then
      continue;
    end if;
    v_cles := v_cles + 1;
    if jsonb_typeof(p_tenue -> v_emplacement) is distinct from 'string' then
      return false;
    end if;
    if not exists (
      select 1 from internal.gaulois_objets o
      where o.emplacement = v_emplacement and o.objet = p_tenue ->> v_emplacement
        and (o.gratuit or exists (
          select 1 from internal.gaulois_inventaire i
          where i.user_id = v_uid and i.emplacement = o.emplacement and i.objet = o.objet))
    ) then
      return false;
    end if;
  end loop;
  -- Les six couleurs d'avant, puis les dix du 15 novembre 2026 (`POILS` de gaulois.ts, dans le même ordre).
  if jsonb_typeof(p_tenue -> 'teinte_cheveux') is distinct from 'string'
    or not ((p_tenue ->> 'teinte_cheveux') = any (array['roux', 'blond', 'chatain', 'noir', 'gris', 'blanc', 'auburn', 'cuivre', 'platine', 'cendre', 'acajou', 'guede', 'vert', 'garance', 'violet', 'rose'])) then
    return false;
  end if;
  -- Le Gaulois unique, s'il y en a un : de la liste, et possédé par l'appelant.
  if p_tenue ? 'modele' then
    v_cles := v_cles + 1;
    if jsonb_typeof(p_tenue -> 'modele') is distinct from 'string' or not exists (
      select 1 from internal.gaulois_modeles g
      join internal.modeles m on m.modele = g.modele
      where g.user_id = v_uid and g.modele = p_tenue ->> 'modele'
    ) then
      return false;
    end if;
  end if;
  return (select count(*) from jsonb_object_keys(p_tenue)) = v_cles;
end $$;

revoke all on function internal.gaulois_tenue_valide(jsonb) from public, anon, authenticated;

-- La sauvegarde chiffrée (remplace celle de la migration 20261115000900, version 8, ligne pour ligne) : version 9, avec
-- les Gaulois uniques de chaque compte et le réglage de leur pochette. La liste des modèles, elle, vient de cette migration.
create or replace function public.export_site() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'version', 9,
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
    'marche_offres', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from internal.marche_offres t),
    -- Ajouts de la version 6 : le réglage et la dépense des bulles du village.
    'village_vie_reglage', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.village_vie_reglage t),
    'village_vie_depense', (select coalesce(jsonb_agg(to_jsonb(t) order by t.mois), '[]') from internal.village_vie_depense t),
    -- Ajouts de la version 7 : les familiers de chaque compte et le réglage de leur pochette.
    'gaulois_familiers', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.familier), '[]') from internal.gaulois_familiers t),
    'familiers_pochette', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.familiers_pochette t),
    -- Ajout de la version 8 : les bannières de chaque compte.
    'gaulois_bannieres', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.banniere), '[]') from internal.gaulois_bannieres t),
    -- Ajouts de la version 9 : les Gaulois uniques de chaque compte et le réglage de leur pochette.
    'gaulois_modeles', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.modele), '[]') from internal.gaulois_modeles t),
    'modeles_pochette', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from internal.modeles_pochette t)
  )
$$;

-- La sauvegarde reste réservée à la clé de service, comme avant.
revoke all on function public.export_site() from public, anon, authenticated;
grant execute on function public.export_site() to service_role;
