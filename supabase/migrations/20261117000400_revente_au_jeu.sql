-- La revente au jeu (17 novembre 2026, demande du pilote : « donner la possibilité de pouvoir revendre au système 70 % de
-- la valeur de son cosmétique » ; puis, sur la question de ce qui se revend : « achetés 70 %, le reste 50 % »).
--
-- Ce que c'est : un objet de la garde-robe (de la tête à l'arme) se rend au jeu contre des statères, au lieu de se vendre à
-- un autre membre au marché. Le jeu ne doit pas créer de statères par ce chemin. La revente ne regarde donc pas l'objet,
-- mais ce que le compte a payé pour lui : chaque paiement noté au journal des statères ouvre un droit de revente, pour ce
-- même objet, qui ne sert qu'une fois.
--
--   - acheté à la boutique (journal : 'achat', à l'étal du sentier aussi) : 70 % du prix de sa rareté aujourd'hui, ou 70 %
--     de ce qui a été payé si c'était moins. L'étal du sentier vend avec une remise : sans cette seconde borne, il
--     rendrait tout ce qu'il a reçu, et l'on achèterait puis revendrait sans fin, sans rien perdre ;
--   - tiré d'une pochette surprise payée (journal : 'pochette') : 50 % du prix de sa rareté. Une pochette de 200 statères
--     donne en moyenne 290 statères d'objets, donc 145 à la revente : elle reste perdante ;
--   - acheté au marché : aucun droit. Les statères sont allés à un autre membre, pas au jeu ; et l'achat à la boutique qui
--     est à l'origine de l'objet a déjà ouvert un droit chez le vendeur : en ouvrir un second chez l'acheteur ferait rendre
--     au jeu plus qu'il n'a reçu. Un objet acheté au marché ne se remet déjà pas en vente au marché ;
--   - reçu sans rien payer : un palier du sentier, une pochette gagnée à la loterie, une fusion à la forge. Aucun droit : il
--     ne se revend pas au jeu (le marché entre membres lui reste ouvert, avec ses règles) ;
--   - un objet divin n'a pas de prix à la boutique : il ne se revend pas ;
--   - un achat fait pendant un essai du mode GOD est noté 'test_…' au journal : il n'ouvre aucun droit.
--
-- Un droit va à l'objet, pas à un exemplaire : qui a acheté un objet, l'a perdu à la forge, puis l'a reçu d'un palier peut
-- revendre ce dernier. Le jeu ne rend jamais plus que ce droit, lui-même payé une fois : rien n'est créé.
--
-- Comme au marché, le dernier exemplaire d'un objet porté ou gravé à la forge ne part pas, ni un exemplaire venu du marché
-- quand il ne reste que lui.
--
-- Ce que le site appelle (formes dans src/lib/village/revente.ts) :
-- - get_ma_revente() : { ok: true, solde, taux: { achat, pochette }, objets: [{ emplacement, objet, rendu, classe, quantite }] },
--   un objet par ligne de l'inventaire qui peut partir, avec ce que rendrait son meilleur droit.
-- - revendre_objet(p_emplacement, p_objet, p_rendu_vu) : retire un exemplaire, crédite le compte, et répond
--   { ok: true, solde, rendu, objet: { emplacement, objet }, reste }. Refus : `pas_possede`, `pas_revendable` (aucun droit),
--   `objet_porte`, `objet_grave`, `achete_au_marche` (il ne reste que l'exemplaire venu du marché), `prix_change` (ce que l'écran a montré n'est plus ce que le jeu rend), `mode_god`, et
--   ceux de tout compte (`not_signed_in`, `not_validated`, `no_gaulois`, `suspended`, `rate_limited`).
--
-- Cette migration ne fait qu'ajouter : une table, six fonctions. Aucune fonction existante n'est remplacée, aucune table,
-- colonne ni ligne existante n'est retirée ou changée.

-- Les droits déjà servis : la ligne du journal qui avait ouvert le droit, et ce que le jeu a rendu.
create table if not exists internal.village_reventes (
  mouvement bigint primary key references internal.stateres_mouvements (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  emplacement text not null,
  objet text not null,
  classe text not null check (classe in ('achat', 'pochette')),
  rendu integer not null check (rendu > 0),
  vendu_le timestamptz not null default now()
);
create index if not exists village_reventes_compte on internal.village_reventes (user_id, vendu_le desc);

-- Table privée : seules les fonctions ci-dessous la lisent ou l'écrivent.
alter table internal.village_reventes enable row level security;
revoke all on table internal.village_reventes from public, anon, authenticated;

-- Les deux parts, en pour cent du prix de la rareté : ce qui a été acheté à la boutique, et le reste de ce qui a été payé.
create or replace function internal.revente_taux_achat() returns integer language sql immutable set search_path = public, pg_temp as $$ select 70 $$;
create or replace function internal.revente_taux_autre() returns integer language sql immutable set search_path = public, pg_temp as $$ select 50 $$;
revoke all on function internal.revente_taux_achat() from public, anon, authenticated;
revoke all on function internal.revente_taux_autre() from public, anon, authenticated;

-- Les droits de revente d'un compte qui n'ont pas encore servi : un par paiement noté au journal, avec ce qu'il rendrait.
create or replace function internal.revente_droits(p_uid uuid)
returns table (mouvement bigint, emplacement text, objet text, classe text, rendu integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with paiements as (
    -- La boutique et la pochette surprise notent l'objet lui-même : « tete/casque-de-fer ». Les familiers, les bannières et
    -- les Gaulois uniques notent autre chose (« familier/… ») : ils ne trouvent aucun objet plus bas.
    select m.id, split_part(m.ref, '/', 1) as emplacement, split_part(m.ref, '/', 2) as objet,
      case when m.nature = 'achat' then 'achat' else 'pochette' end as classe, -m.montant as paye, m.cree_le
    from internal.stateres_mouvements m
    where m.user_id = p_uid and m.nature in ('achat', 'pochette') and m.montant < 0 and m.ref is not null
  )
  select e.id, e.emplacement, e.objet, e.classe,
    (case e.classe
      when 'achat' then least(p.prix, e.paye) * internal.revente_taux_achat() / 100
      else p.prix * internal.revente_taux_autre() / 100
    end)::integer
  from paiements e
  join internal.gaulois_objets g on g.emplacement = e.emplacement and g.objet = e.objet and not g.gratuit
  join internal.village_prix p on p.rarete = g.rarete
  where not exists (select 1 from internal.village_reventes r where r.mouvement = e.id)
    -- Une pochette gagnée à la loterie : son prix est crédité puis débité dans la même opération. Elle n'a rien coûté.
    and not (e.classe = 'pochette' and exists (
      select 1 from internal.stateres_mouvements l
      where l.user_id = p_uid and l.nature = 'loterie_pochette' and l.cree_le = e.cree_le))
$$;

revoke all on function internal.revente_droits(uuid) from public, anon, authenticated;

-- Ce qu'un compte peut revendre maintenant, dans la forme que rend get_ma_revente : un objet par ligne de l'inventaire qui
-- a un droit et dont un exemplaire peut partir, avec ce que rendrait son meilleur droit.
create or replace function internal.revente_json(p_uid uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true,
    'solde', coalesce((select s.solde from internal.stateres_soldes s where s.user_id = p_uid), 0),
    'taux', jsonb_build_object('achat', internal.revente_taux_achat(), 'pochette', internal.revente_taux_autre()),
    'objets', coalesce((
      select jsonb_agg(jsonb_build_object('emplacement', i.emplacement, 'objet', i.objet, 'rendu', d.rendu, 'classe', d.classe, 'quantite', i.quantite)
        order by i.emplacement, i.objet)
      from internal.gaulois_inventaire i
      cross join lateral (
        select x.rendu, x.classe from internal.revente_droits(p_uid) x
        where x.emplacement = i.emplacement and x.objet = i.objet and x.rendu > 0
        order by x.rendu desc, x.mouvement limit 1
      ) d
      where i.user_id = p_uid
        and i.quantite - i.du_marche >= 1
        and not (i.quantite = 1 and exists (select 1 from internal.gaulois g where g.user_id = p_uid and g.tenue ->> i.emplacement = i.objet))
        and not (i.quantite = 1 and exists (select 1 from internal.gaulois_gravures gr where gr.user_id = p_uid and gr.emplacement = i.emplacement and gr.objet = i.objet))
    ), '[]'::jsonb)
  );
$$;

revoke all on function internal.revente_json(uuid) from public, anon, authenticated;

create or replace function public.get_ma_revente() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_detail text;
begin
  begin
    v_uid := internal.village_acheteur();
    return internal.revente_json(v_uid);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.get_ma_revente() from public, anon, authenticated;
grant execute on function public.get_ma_revente() to authenticated;

create or replace function public.revendre_objet(p_emplacement text, p_objet text, p_rendu_vu integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid;
  v_ligne internal.gaulois_inventaire;
  v_droit record;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    v_uid := internal.village_acheteur();
    perform internal.village_verrou(v_uid);
    -- Pendant un essai du mode GOD, l'inventaire est une copie qui disparaît à la fin : rien ne s'y revend.
    if exists (select 1 from internal.village_god d where d.user_id = v_uid) then perform internal.fail('mode_god'); end if;
    select * into v_ligne from internal.gaulois_inventaire i
    where i.user_id = v_uid and i.emplacement = p_emplacement and i.objet = p_objet
    for update;
    if not found then perform internal.fail('pas_possede'); end if;
    -- Le meilleur droit qui reste pour cet objet.
    select x.mouvement, x.classe, x.rendu into v_droit from internal.revente_droits(v_uid) x
    where x.emplacement = p_emplacement and x.objet = p_objet and x.rendu > 0
    order by x.rendu desc, x.mouvement limit 1;
    if not found then perform internal.fail('pas_revendable'); end if;
    if v_ligne.quantite = 1 and exists (select 1 from internal.gaulois g where g.user_id = v_uid and g.tenue ->> p_emplacement = p_objet) then
      perform internal.fail('objet_porte');
    end if;
    if v_ligne.quantite = 1 and exists (select 1 from internal.gaulois_gravures gr where gr.user_id = v_uid and gr.emplacement = p_emplacement and gr.objet = p_objet) then
      perform internal.fail('objet_grave');
    end if;
    if v_ligne.quantite - v_ligne.du_marche < 1 then perform internal.fail('achete_au_marche'); end if;
    if p_rendu_vu is distinct from v_droit.rendu then perform internal.fail('prix_change'); end if;
    -- Un exemplaire qui ne vient pas du marché quitte l'inventaire, comme pour une mise en vente au marché ; s'il ne reste
    -- que celui du marché, la ligne le dit.
    if v_ligne.quantite = 1 then
      delete from internal.gaulois_inventaire i where i.user_id = v_uid and i.emplacement = p_emplacement and i.objet = p_objet;
    else
      update internal.gaulois_inventaire i
      set quantite = i.quantite - 1, origine = case when i.quantite - 1 = i.du_marche then 'marche' else i.origine end
      where i.user_id = v_uid and i.emplacement = p_emplacement and i.objet = p_objet;
    end if;
    insert into internal.village_reventes (mouvement, user_id, emplacement, objet, classe, rendu)
    values (v_droit.mouvement, v_uid, p_emplacement, p_objet, v_droit.classe, v_droit.rendu);
    insert into internal.stateres_mouvements (user_id, nature, montant, ref)
    values (v_uid, 'revente', v_droit.rendu, p_emplacement || '/' || p_objet);
    return jsonb_build_object(
      'ok', true,
      'solde', (select s.solde from internal.stateres_soldes s where s.user_id = v_uid),
      'rendu', v_droit.rendu,
      'objet', jsonb_build_object('emplacement', p_emplacement, 'objet', p_objet),
      'reste', v_ligne.quantite - 1
    );
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.revendre_objet(text, text, integer) from public, anon, authenticated;
grant execute on function public.revendre_objet(text, text, integer) to authenticated;
