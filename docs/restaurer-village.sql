-- La restauration du village des Gaulois depuis une sauvegarde chiffrée ouverte (export_site, version 6), APRÈS celle des
-- comptes (docs/DIRECTION.md, « La sauvegarde chiffrée »). Le contenu du fichier .json ouvert par `npm run sauvegarde:ouvrir`
-- est d'abord collé dans une table `sauvegarde (contenu jsonb)`, puis ce fichier se colle en entier dans l'éditeur SQL.
--
-- L'étape 6 ne s'oublie pas : sans elle, la relecture des parties repaie celles d'avant la sauvegarde, déjà comptées
-- dans la « reprise » (essai du 13 novembre 2026 : un solde de 60 passait à 210).
--
-- Les étapes 1 à 7 ont été essayées telles quelles sur PGlite (restauration complète sur une base neuve : soldes retrouvés,
-- partie d'avant la sauvegarde pas payée deux fois, partie d'après payée). Les étapes 8 et 9 reprennent les requêtes de
-- l'essai de la version 6. Jamais essayée sur le vrai projet. Une partie pas encore relue à l'heure de la sauvegarde est
-- perdue pour les statères : c'est accepté. Si le projet Supabase est perdu, les identifiants des comptes changent : les
-- `user_id` de la sauvegarde sont alors à faire correspondre aux nouveaux comptes avant ces étapes.

-- 1. Les tenues des Gaulois.
insert into internal.gaulois (user_id, tenue, created_at, updated_at)
select r.user_id, r.tenue, r.created_at, r.updated_at
from sauvegarde, jsonb_to_recordset(contenu -> 'gaulois') as r (user_id uuid, tenue jsonb, created_at timestamptz, updated_at timestamptz)
on conflict (user_id) do nothing;

-- 2. Les réglages des prix et de la pochette.
update internal.village_prix p set prix = r.prix, maj_le = r.maj_le
from sauvegarde, jsonb_to_recordset(contenu -> 'village_prix') as r (rarete text, prix integer, maj_le timestamptz)
where p.rarete = r.rarete;
update internal.village_pochette p
set prix = r.prix, commun = r.commun, peu_commun = r.peu_commun, epique = r.epique, mystique = r.mystique, legendaire = r.legendaire, maj_le = r.maj_le
from sauvegarde, jsonb_to_recordset(contenu -> 'village_pochette') as r (prix integer, commun numeric, peu_commun numeric, epique numeric, mystique numeric, legendaire numeric, maj_le timestamptz)
where p.id;

-- 3. Les inventaires.
insert into internal.gaulois_inventaire (user_id, emplacement, objet, quantite, origine, acquis_le, du_marche)
select r.user_id, r.emplacement, r.objet, r.quantite, r.origine, r.acquis_le, r.du_marche
from sauvegarde, jsonb_to_recordset(contenu -> 'gaulois_inventaire') as r (user_id uuid, emplacement text, objet text, quantite integer, origine text, acquis_le timestamptz, du_marche integer);

-- 4. Les offres du marché, avec leur numéro (le journal les nomme « offre/<numéro> »).
insert into internal.marche_offres (id, vendeur_id, emplacement, objet, prix, origine, etat, acheteur_id, cree_le, expire_le, ferme_le)
overriding system value
select r.id, r.vendeur_id, r.emplacement, r.objet, r.prix, r.origine, r.etat, r.acheteur_id, r.cree_le, r.expire_le, r.ferme_le
from sauvegarde, jsonb_to_recordset(contenu -> 'marche_offres') as r (id bigint, vendeur_id uuid, emplacement text, objet text, prix integer, origine text, etat text, acheteur_id uuid, cree_le timestamptz, expire_le timestamptz, ferme_le timestamptz);
select setval(pg_get_serial_sequence('internal.marche_offres', 'id'), greatest(coalesce((select max(id) from internal.marche_offres), 0), 1));

-- 5. Le journal des statères : pour chaque compte, le total des points rapportés au clan (« reprise », en lignes d'un
-- million au plus), puis les autres lignes dans leur ordre. Le solde suit le journal.
insert into internal.stateres_mouvements (user_id, nature, montant, ref)
select r.user_id, 'reprise', least(1000000, r.stateres - g * 1000000), 'sauvegarde'
from sauvegarde, jsonb_to_recordset(contenu -> 'stateres_victoires_totaux') as r (user_id uuid, stateres bigint),
  generate_series(0, (r.stateres - 1) / 1000000) as g
where r.stateres > 0
order by r.user_id, g;
insert into internal.stateres_mouvements (user_id, nature, montant, ref, regle, cree_le)
select r.user_id, r.nature, r.montant, r.ref, r.regle, r.cree_le
from sauvegarde, jsonb_to_recordset(contenu -> 'stateres_mouvements') as r (id bigint, user_id uuid, nature text, montant integer, ref text, regle text, cree_le timestamptz)
order by r.id;

-- 6. La relecture ne repaie pas les parties d'avant la sauvegarde, déjà comptées dans la « reprise » : une suspension pour
-- les statères, de toujours à l'heure de la sauvegarde, pour chaque compte.
insert into internal.stateres_suspensions (user_id, debut, fin)
select p.user_id, '-infinity', (select (contenu ->> 'exported_at')::timestamptz from sauvegarde)
from public.profiles p;

-- 7. Contrôle : chaque solde doit être celui de la sauvegarde (aucune ligne attendue).
with r as (
  select x.user_id, x.solde from sauvegarde, jsonb_to_recordset(contenu -> 'stateres_soldes') as x (user_id uuid, solde bigint)
)
select coalesce(s.user_id, r.user_id) as user_id, s.solde, r.solde as sauvegarde
from r full join internal.stateres_soldes s on s.user_id = r.user_id
where s.solde is distinct from r.solde;

-- 8. Le réglage des bulles (une seule ligne ; `maj_par` n'est pas repris : ce compte peut ne plus exister).
update internal.village_vie_reglage v
set bulles = r.bulles, plafond = r.plafond, modele = r.modele, prix_entree = r.prix_entree, prix_sortie = r.prix_sortie, maj_le = r.maj_le
from sauvegarde, jsonb_populate_recordset(null::internal.village_vie_reglage, contenu -> 'village_vie_reglage') as r
where v.id;

-- 9. La dépense des bulles, mois par mois : sans elle, le compteur du plafond du mois repart de zéro.
insert into internal.village_vie_depense
select r.* from sauvegarde, jsonb_populate_recordset(null::internal.village_vie_depense, contenu -> 'village_vie_depense') as r
on conflict do nothing;
