-- Le coffre du druide s'arrête (décision du pilote, 19 novembre 2026 : « coffre de druide je pense l'arrêter », puis, à la
-- question « comment l'arrêter ? », « Tout de suite, mises rendues » ; docs/DIRECTION.md, « Le coffre du druide »).
--
-- Ce que fait la migration, en une fois, sous le verrou des réglages du coffre (un essai ou une lettre en cours passe
-- avant ou après elle, jamais pendant) :
-- - le coffre est fermé (internal.coffre_reglages.ouvert) : coffre_ouvrir et coffre_indice répondent 'closed', plus aucun
--   essai, aucune lettre ni aucune mise n'est pris ;
-- - les essais encore sans réponse sont marqués annulés, comme un essai auquel Claude n'a pas répondu : si le robot
--   d'avant rend une réponse après la fermeture, coffre_clore ne les trouve plus ('unknown_attempt'), ne prend aucune mise
--   et n'ouvre aucun coffre ;
-- - la cagnotte est rendue à ceux qui l'ont payée. Elle est faite des mises ('coffre_mise') et des lettres achetées
--   ('coffre_indice') des manches dont la cagnotte n'a pas encore été versée : celles d'après la dernière manche qui a
--   versé une cagnotte ('coffre_gain'), c'est-à-dire la manche en cours et, s'il y en a, celles gagnées par un joueur sans
--   compte, dont la cagnotte attendait la manche suivante. Chaque joueur reçoit, par manche, un mouvement 'coffre_rendu'
--   du montant exact qu'il a payé : rien n'est créé, aucune prime ('coffre_prime') ni part ('coffre_part') n'est versée.
--   La cagnotte baisse d'autant. Si la somme à rendre dépassait la cagnotte (ce qui ne se peut que si elle a été changée à
--   la main), rendre créerait des statères : la migration s'arrête alors sur une erreur, sans rien faire, fermeture comprise ;
-- - internal.village_god_mouvement, reprise de 20261119000100_marche_tournant_et_demandes.sql, compte 'coffre_rendu'
--   parmi les vrais gains : rendu pendant un essai du mode GOD, il deviendrait sinon un mouvement d'essai, annulé aussitôt.
--
-- Rien n'est supprimé ni vidé : manches, essais, lettres vendues, réglages et journal des statères restent. La tâche de
-- nuit qui efface les essais de plus de 30 jours continue, comme le dit la page de confidentialité. Les fonctions du coffre
-- restent en place, fermées. Le robot qui suit n'a plus les commandes du jeu (supabase/functions/code-discord).
-- Rejouée, la migration ne rend rien une seconde fois : un joueur déjà remboursé pour une manche ne l'est plus.

create or replace function internal.village_god_mouvement() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.nature ~ '^(god|test)_' then return new; end if;
  if not exists (select 1 from internal.village_god d where d.user_id = new.user_id) then return new; end if;
  if new.nature in ('victoire', 'pronostic_gain', 'pronostic_rendu', 'marche_vente', 'loterie_lot', 'don', 'marche_demande_rendue', 'coffre_rendu') then return new; end if;
  if new.nature in ('marche_achat', 'pronostic_mise', 'marche_demande') then perform internal.fail('mode_god'); end if;
  new.nature := left('test_' || new.nature, 32);
  return new;
end $$;

revoke all on function internal.village_god_mouvement() from public, anon, authenticated;

do $$
declare
  -- La dernière manche dont la cagnotte a été versée : ce qui a été payé jusqu'à elle est déjà parti au gagnant.
  v_versee bigint;
  v_cagnotte bigint;
  v_rendu bigint := 0;
  q record;
begin
  select cagnotte into v_cagnotte from internal.coffre_reglages where id for update;
  update internal.coffre_reglages set ouvert = false where id and ouvert;
  update internal.coffre_essais set annule = true where reponse is null and not annule;

  select coalesce(max(substring(v.ref from '^manche/([0-9]+)$')::bigint), 0) into v_versee
  from internal.stateres_mouvements v
  where v.nature = 'coffre_gain';

  for q in
    select v.user_id, v.ref, (-sum(v.montant))::integer as paye
    from internal.stateres_mouvements v
    where v.nature in ('coffre_mise', 'coffre_indice')
      and substring(v.ref from '^manche/([0-9]+)$')::bigint > v_versee
      and not exists (select 1 from internal.stateres_mouvements d
                      where d.nature = 'coffre_rendu' and d.user_id = v.user_id and d.ref = v.ref)
    group by v.user_id, v.ref
    having sum(v.montant) < 0
    order by v.ref, v.user_id
  loop
    -- Un versement ne demande pas le verrou du compte : le solde suit le journal par son déclencheur.
    insert into internal.stateres_mouvements (user_id, nature, montant, ref) values (q.user_id, 'coffre_rendu', q.paye, q.ref);
    v_rendu := v_rendu + q.paye;
  end loop;

  -- Rendre plus que la cagnotte créerait des statères : cela ne se peut que si la cagnotte a été changée à la main. Rien
  -- n'est alors fait, fermeture comprise, et la question revient au pilote.
  if v_rendu > coalesce(v_cagnotte, 0) then
    raise exception 'Coffre : % statères à rendre, plus que la cagnotte (%). Rien n''est fait : demander à Claude.', v_rendu, coalesce(v_cagnotte, 0);
  end if;
  if v_rendu > 0 then
    update internal.coffre_reglages set cagnotte = cagnotte - v_rendu::integer where id;
  end if;
end $$;
