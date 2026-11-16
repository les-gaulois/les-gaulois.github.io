-- Les prix des Gaulois uniques et leur pochette à 3 000 statères (docs/DIRECTION.md, « Les Gaulois uniques » ; formes des
-- réponses : src/lib/village/contrat.ts ; calcul des prix : src/lib/village/modeles.ts).
--
-- Demande du pilote, 16 novembre 2026, devant l'onglet « Uniques » de la boutique : « le prix n'est pas assez cher en
-- boutique ! Calcule bien les probabilités pour la pochette, et la pochette je veux qu'elle coûte 3 000 ».
--
-- Les règles :
-- - La pochette des Gaulois uniques coûte 3 000 statères (au lieu de 2 000).
-- - Ses chances deviennent 50, 30, 12, 6 et 2 pour cent par rareté (au lieu de 45, 28, 15, 8 et 4). Avec trois communs,
--   trois peu communs, deux épiques, deux mystiques et un légendaire, un compte qui n'a rien a 16,7 % de chances de tirer
--   chaque commun, 10 % chaque peu commun, 6 % chaque épique, 3 % chaque mystique et 2 % le dragon. Avant, chaque mystique
--   avait autant de chances que le dragon (4 %) : le légendaire n'était pas le plus rare.
-- - À la boutique, un Gaulois unique ne coûte plus le quintuple du prix d'un objet de sa rareté (500 à 12 500 statères) :
--   il coûte ce que coûtent en moyenne les pochettes qu'il faut pour le tirer, arrondi aux 500 statères. Le calcul est
--   exact (loi du tirage sur toutes les collections possibles, `prixCalculesDeLaBoutique` de modeles.ts, testé) : 3,8
--   pochettes pour un commun (11 500), 5,1 pour un peu commun (15 500), 6,7 pour un épique (20 000), 8,3 pour un mystique
--   (25 000), 9,3 pour le dragon (28 000). Acheter, c'est payer le sûr ; la pochette donne d'autres modèles en chemin, et
--   onze pochettes (33 000 statères) donnent forcément les onze.
-- - Ces prix ne suivent plus le réglage des prix des objets de la Direction : ils sont dans leur propre table,
--   internal.modeles_prix, une ligne par rareté, qui se change et ne s'efface pas (internal.village_reglage_garde).
--
-- Ce qui change :
-- - internal.modeles_prix (nouvelle) : le prix d'un Gaulois unique de chaque rareté à la boutique.
-- - internal.modele_prix (remplacée, depuis la 20261115001000) : lit cette table.
-- - public.get_mes_modeles (remplacée, depuis la 20261115001000, ligne pour ligne) : les prix viennent de cette table.
-- - internal.modeles_pochette : le prix et les chances passent à 3 000 et 50, 30, 12, 6, 2, seulement si elle a encore son
--   réglage de départ (2 000 et 45, 28, 15, 8, 4) ; un réglage déjà changé n'est pas touché.
--
-- Rien n'est écrit au journal de l'encadrement. Aucun compte, aucun modèle possédé, aucun statère n'est touché. La
-- sauvegarde chiffrée ne change pas (version 9) : ces prix reviennent avec cette migration. Une table et une ligne
-- changées, deux fonctions remplacées. Rejouée, elle ne change plus rien.

create table if not exists internal.modeles_prix (
  rarete text primary key check (rarete in ('commun', 'peu-commun', 'epique', 'mystique', 'legendaire')),
  prix integer not null check (prix between 1 and 1000000),
  maj_le timestamptz not null default now()
);

-- <prix> : PRIX_MODELE_PAR_RARETE de src/lib/village/contrat.ts, que `prixCalculesDeLaBoutique` recalcule (un test compare).
insert into internal.modeles_prix (rarete, prix) values
  ('commun', 11500),
  ('peu-commun', 15500),
  ('epique', 20000),
  ('mystique', 25000),
  ('legendaire', 28000)
on conflict (rarete) do nothing;
-- </prix>

-- Table privée : seules les fonctions des Gaulois uniques la lisent.
alter table internal.modeles_prix enable row level security;
revoke all on table internal.modeles_prix from public, anon, authenticated;

create or replace trigger modeles_prix_garde before delete on internal.modeles_prix
  for each statement execute function internal.village_reglage_garde();

-- Le prix d'un Gaulois unique de cette rareté à la boutique. Null pour une rareté sans prix.
create or replace function internal.modele_prix(p_rarete text) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select p.prix from internal.modeles_prix p where p.rarete = p_rarete
$$;

revoke all on function internal.modele_prix(text) from public, anon, authenticated;

-- La pochette : 3 000 statères et les nouvelles chances, seulement depuis son réglage de départ.
update internal.modeles_pochette
set prix = 3000, commun = 50, peu_commun = 30, epique = 12, mystique = 6, legendaire = 2, maj_le = now()
where id and prix = 2000 and commun = 45 and peu_commun = 28 and epique = 15 and mystique = 8 and legendaire = 4;

-- Les Gaulois uniques du compte connecté (remplace celle de la migration 20261115001000, ligne pour ligne, sauf les prix,
-- qui viennent maintenant de internal.modeles_prix) : { ok: true, solde, peut_acheter, prix: { rareté: statères },
-- pochette: { prix, chances }, modeles: [{ modele, acquis_le }], porte }.
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
    'prix', (select jsonb_object_agg(p.rarete, p.prix) from internal.modeles_prix p),
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
