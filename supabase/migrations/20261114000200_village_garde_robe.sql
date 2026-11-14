-- Le village des Gaulois : la garde-robe (14 novembre 2026, docs/DIRECTION.md, « Le village des Gaulois »).
--
-- Demande du pilote : « 200 modèles de plus avec ensemble des cosmétiques », et « plusieurs modèles œil, bouche, et
-- cicatrice pour leur perso gratuit au départ de la création ». Les dessins sont dans supabase/functions/code-discord/
-- gaulois.ts et garde-robe/ ; la liste du serveur, ici, est la même : un test garde les deux identiques.
--
-- À coller APRÈS le fichier du village (.cache/a-coller-village.sql, migrations 001800 à 002400) : la vérification d'une
-- tenue remplacée ici est celle de la 001900, qui accepte un objet gratuit OU possédé par l'appelant.
--
-- Ce qui change :
-- - internal.gaulois_objets : trois emplacements de plus, gratuits et sans rareté (yeux, bouche, cicatrice), et les objets
--   de la garde-robe. Un objet payant entre de lui-même dans la boutique (prix de sa rareté), la pochette surprise (objets
--   payants seulement) et le marché ; un objet du visage, gratuit, n'est ni vendu, ni tiré, ni mis en vente.
-- - internal.gaulois_tenue_valide (remplacée, depuis la version de la 001900) : les trois clés du visage sont facultatives.
--   Une tenue enregistrée avant n'en a pas et reste valide : le site la dessine avec le visage d'avant, case pour case.
--   Présente, une clé du visage doit nommer un objet de la liste ; aucune autre clé n'est admise.
--
-- Les tenues (internal.gaulois), les inventaires et la sauvegarde chiffrée (export_site, version 6 de la 002400) ne
-- changent pas : une tenue reste un jsonb, ses clés du visage y passent telles quelles.
--
-- Rien n'est effacé : la contrainte d'emplacement est élargie (retirée puis remise avec plus de valeurs), des lignes sont
-- ajoutées. Rejouée, elle se remplace par la même.

alter table internal.gaulois_objets drop constraint if exists gaulois_objets_emplacement_check;
alter table internal.gaulois_objets add constraint gaulois_objets_emplacement_check
  check (emplacement in ('peau', 'cheveux', 'barbe', 'yeux', 'bouche', 'cicatrice', 'tete', 'haut', 'bas', 'pieds', 'arme'));

insert into internal.gaulois_objets (emplacement, objet, rarete, gratuit) values
-- <garde-robe>
  ('yeux', 'vifs', null, true),
  ('yeux', 'ronds', null, true),
  ('yeux', 'severe', null, true),
  ('yeux', 'rieurs', null, true),
  ('yeux', 'clin-d-oeil', null, true),
  ('yeux', 'endormi', null, true),
  ('yeux', 'sourcils-epais', null, true),
  ('yeux', 'sourcil-leve', null, true),
  ('yeux', 'amande', null, true),
  ('yeux', 'bleus', null, true),
  ('yeux', 'cernes', null, true),
  ('bouche', 'sourire', null, true),
  ('bouche', 'grand-sourire', null, true),
  ('bouche', 'moue', null, true),
  ('bouche', 'bee', null, true),
  ('bouche', 'en-coin', null, true),
  ('bouche', 'dents-du-bonheur', null, true),
  ('bouche', 'dent-en-or', null, true),
  ('bouche', 'langue', null, true),
  ('bouche', 'pincees', null, true),
  ('bouche', 'grimace', null, true),
  ('bouche', 'serieuse', null, true),
  ('cicatrice', 'aucune', null, true),
  ('cicatrice', 'balafre', null, true),
  ('cicatrice', 'sourcil-fendu', null, true),
  ('cicatrice', 'griffure', null, true),
  ('cicatrice', 'suture', null, true),
  ('cicatrice', 'pansement', null, true),
  ('cicatrice', 'rousseur', null, true),
  ('cicatrice', 'coquard', null, true),
  ('cicatrice', 'grain-de-beaute', null, true),
  ('tete', 'chapeau-feutre', 'commun', false),
  ('tete', 'bonnet-nuit', 'commun', false),
  ('tete', 'bob', 'commun', false),
  ('tete', 'casquette', 'commun', false),
  ('tete', 'foulard-noue', 'commun', false),
  ('tete', 'cache-oreilles', 'commun', false),
  ('tete', 'bonnet-pompon', 'commun', false),
  ('tete', 'chapeau-pluie', 'commun', false),
  ('tete', 'seau-bois', 'commun', false),
  ('tete', 'entonnoir', 'commun', false),
  ('tete', 'couvercle', 'commun', false),
  ('tete', 'chou', 'commun', false),
  ('tete', 'couronne-papier', 'commun', false),
  ('tete', 'chapeau-fete', 'commun', false),
  ('tete', 'chapeau-berger', 'peu-commun', false),
  ('tete', 'toque-fourrure', 'peu-commun', false),
  ('tete', 'canotier', 'peu-commun', false),
  ('tete', 'chapeau-melon', 'peu-commun', false),
  ('tete', 'chapeau-pecheur', 'peu-commun', false),
  ('tete', 'calot-boulanger', 'peu-commun', false),
  ('tete', 'lunettes-forgeron', 'peu-commun', false),
  ('tete', 'casque-nasal', 'peu-commun', false),
  ('tete', 'passoire', 'peu-commun', false),
  ('tete', 'perruque-frisee', 'peu-commun', false),
  ('tete', 'abat-jour', 'peu-commun', false),
  ('tete', 'pot-fleurs', 'peu-commun', false),
  ('tete', 'pasteque', 'peu-commun', false),
  ('tete', 'haut-de-forme', 'epique', false),
  ('tete', 'couronne-fleurs', 'epique', false),
  ('tete', 'chapka', 'epique', false),
  ('tete', 'chapeau-apiculteur', 'epique', false),
  ('tete', 'barrette-mineur', 'epique', false),
  ('tete', 'heaume', 'epique', false),
  ('tete', 'casque-plumet', 'epique', false),
  ('tete', 'casque-visiere', 'epique', false),
  ('tete', 'masque-bois', 'epique', false),
  ('tete', 'citrouille', 'epique', false),
  ('tete', 'bois-cerf', 'epique', false),
  ('tete', 'couronne-givre', 'mystique', false),
  ('tete', 'toque-paon', 'mystique', false),
  ('tete', 'nuage-orage', 'mystique', false),
  ('tete', 'bocal-poisson', 'mystique', false),
  ('tete', 'nid-oiseau', 'mystique', false),
  ('tete', 'dragon-fete', 'mystique', false),
  ('tete', 'casque-criniere', 'mystique', false),
  ('tete', 'couronne-moissons', 'legendaire', false),
  ('tete', 'chapeau-panache', 'legendaire', false),
  ('tete', 'casque-apparat', 'legendaire', false),
  ('tete', 'candelabre-or', 'legendaire', false),
  ('tete', 'heaume-couronne', 'legendaire', false),
  ('haut', 'tunique-verte', 'commun', false),
  ('haut', 'tunique-rayee', 'commun', false),
  ('haut', 'chemise-carreaux', 'commun', false),
  ('haut', 'gilet-laine', 'commun', false),
  ('haut', 'tablier-boulanger', 'commun', false),
  ('haut', 'pull-tricote', 'commun', false),
  ('haut', 'vareuse-pecheur', 'commun', false),
  ('haut', 'plastron-cuir', 'commun', false),
  ('haut', 'gambison', 'commun', false),
  ('haut', 'cape-voyage', 'commun', false),
  ('haut', 'pelerine-pluie', 'commun', false),
  ('haut', 'maillot-marin', 'peu-commun', false),
  ('haut', 'gilet-berger', 'peu-commun', false),
  ('haut', 'tablier-forgeron', 'peu-commun', false),
  ('haut', 'blouse-peintre', 'peu-commun', false),
  ('haut', 'poncho', 'peu-commun', false),
  ('haut', 'manteau-fourrure', 'peu-commun', false),
  ('haut', 'veste-kaki', 'peu-commun', false),
  ('haut', 'gilet-sauvetage', 'peu-commun', false),
  ('haut', 'cape-capuche', 'peu-commun', false),
  ('haut', 'tunique-brodee', 'epique', false),
  ('haut', 'chemise-jabot', 'epique', false),
  ('haut', 'gilet-cuir-cloute', 'epique', false),
  ('haut', 'tunique-fete', 'epique', false),
  ('haut', 'brigandine', 'epique', false),
  ('haut', 'cuirasse-ecailles', 'epique', false),
  ('haut', 'plastron-fer', 'epique', false),
  ('haut', 'costume-poulet', 'epique', false),
  ('haut', 'deguisement-ours', 'epique', false),
  ('haut', 'tunique-teinturier', 'mystique', false),
  ('haut', 'tunique-etoilee', 'mystique', false),
  ('haut', 'cuirasse-bronze', 'mystique', false),
  ('haut', 'manteau-plumes', 'mystique', false),
  ('haut', 'cape-etoilee', 'mystique', false),
  ('haut', 'armure-os', 'mystique', false),
  ('haut', 'chemise-fil-or', 'legendaire', false),
  ('haut', 'gilet-brocart', 'legendaire', false),
  ('haut', 'armure-doree', 'legendaire', false),
  ('haut', 'manteau-hermine', 'legendaire', false),
  ('haut', 'armure-dragon', 'legendaire', false),
  ('bas', 'braies-vertes', 'commun', false),
  ('bas', 'braies-grises', 'commun', false),
  ('bas', 'braies-rouges', 'commun', false),
  ('bas', 'braies-courtes', 'commun', false),
  ('bas', 'braies-rapiecees', 'commun', false),
  ('bas', 'braies-retroussees', 'commun', false),
  ('bas', 'jupe-laine', 'commun', false),
  ('bas', 'pantalon-toile', 'commun', false),
  ('bas', 'pagne-fourrure', 'commun', false),
  ('bas', 'pagne-lin', 'commun', false),
  ('bas', 'braies-losanges', 'peu-commun', false),
  ('bas', 'kilt-carreaux', 'peu-commun', false),
  ('bas', 'pantalon-marin', 'peu-commun', false),
  ('bas', 'calecon-pois', 'peu-commun', false),
  ('bas', 'bleu-travail', 'peu-commun', false),
  ('bas', 'braies-lacees', 'peu-commun', false),
  ('bas', 'braies-bicolores', 'peu-commun', false),
  ('bas', 'jupe-paille', 'peu-commun', false),
  ('bas', 'cuissards', 'epique', false),
  ('bas', 'jambieres-fer', 'epique', false),
  ('bas', 'braies-fete', 'epique', false),
  ('bas', 'braies-loup', 'epique', false),
  ('bas', 'pantalon-bouffant', 'epique', false),
  ('bas', 'braies-fleurs', 'epique', false),
  ('bas', 'jambieres-ecailles', 'mystique', false),
  ('bas', 'braies-flammes', 'mystique', false),
  ('bas', 'jupe-plumes', 'mystique', false),
  ('bas', 'tonneau', 'mystique', false),
  ('bas', 'jupe-guerre-or', 'legendaire', false),
  ('bas', 'braies-royales', 'legendaire', false),
  ('pieds', 'sabots-bois', 'commun', false),
  ('pieds', 'chaussons-laine', 'commun', false),
  ('pieds', 'mocassins', 'commun', false),
  ('pieds', 'bottes-pluie', 'commun', false),
  ('pieds', 'bottes-lacees', 'commun', false),
  ('pieds', 'espadrilles', 'commun', false),
  ('pieds', 'chaussettes-trouees', 'commun', false),
  ('pieds', 'souliers-boucle', 'commun', false),
  ('pieds', 'guetres', 'peu-commun', false),
  ('pieds', 'bottes-cavalier', 'peu-commun', false),
  ('pieds', 'chaussures-marche', 'peu-commun', false),
  ('pieds', 'bottes-pecheur', 'peu-commun', false),
  ('pieds', 'bottes-neige', 'peu-commun', false),
  ('pieds', 'poulaines', 'peu-commun', false),
  ('pieds', 'bottes-armee', 'peu-commun', false),
  ('pieds', 'bottes-eperons', 'epique', false),
  ('pieds', 'patins-glace', 'epique', false),
  ('pieds', 'raquettes-neige', 'epique', false),
  ('pieds', 'bottes-bronze', 'epique', false),
  ('pieds', 'bottes-ecailles', 'epique', false),
  ('pieds', 'pantoufles-lapin', 'mystique', false),
  ('pieds', 'bottes-plumes', 'mystique', false),
  ('pieds', 'bottes-ressorts', 'mystique', false),
  ('pieds', 'bottes-couronnees', 'legendaire', false),
  ('pieds', 'bottes-soleil', 'legendaire', false),
  ('arme', 'baton-marche', 'commun', false),
  ('arme', 'fronde', 'commun', false),
  ('arme', 'dague', 'commun', false),
  ('arme', 'coutelas', 'commun', false),
  ('arme', 'lance', 'commun', false),
  ('arme', 'javelot', 'commun', false),
  ('arme', 'fourche-guerre', 'commun', false),
  ('arme', 'rouleau-patisserie', 'commun', false),
  ('arme', 'balai', 'commun', false),
  ('arme', 'louche', 'commun', false),
  ('arme', 'saucisson', 'commun', false),
  ('arme', 'epee-bois', 'commun', false),
  ('arme', 'tue-mouche', 'commun', false),
  ('arme', 'epee-courte', 'peu-commun', false),
  ('arme', 'epee-longue', 'peu-commun', false),
  ('arme', 'sabre-courbe', 'peu-commun', false),
  ('arme', 'faux-guerre', 'peu-commun', false),
  ('arme', 'cor-guerre', 'peu-commun', false),
  ('arme', 'bouclier-rond-peint', 'peu-commun', false),
  ('arme', 'bouclier-long', 'peu-commun', false),
  ('arme', 'rateau', 'peu-commun', false),
  ('arme', 'pelle-tranchee', 'peu-commun', false),
  ('arme', 'torche', 'peu-commun', false),
  ('arme', 'gamelle', 'peu-commun', false),
  ('arme', 'jumelles', 'peu-commun', false),
  ('arme', 'parapluie', 'peu-commun', false),
  ('arme', 'hallebarde', 'epique', false),
  ('arme', 'fleau-armes', 'epique', false),
  ('arme', 'marteau-guerre', 'epique', false),
  ('arme', 'hache-double', 'epique', false),
  ('arme', 'arbalete', 'epique', false),
  ('arme', 'bouclier-umbo', 'epique', false),
  ('arme', 'marteau-forgeron', 'epique', false),
  ('arme', 'canne-peche', 'epique', false),
  ('arme', 'clairon', 'epique', false),
  ('arme', 'tambour', 'epique', false),
  ('arme', 'jambon', 'epique', false),
  ('arme', 'lanterne', 'epique', false),
  ('arme', 'fourchette-geante', 'epique', false),
  ('arme', 'masse-ailettes', 'mystique', false),
  ('arme', 'trident', 'mystique', false),
  ('arme', 'epee-bronze', 'mystique', false),
  ('arme', 'epee-flamboyante', 'mystique', false),
  ('arme', 'rondache-bronze', 'mystique', false),
  ('arme', 'oie', 'mystique', false),
  ('arme', 'sucre-orge', 'mystique', false),
  ('arme', 'cornemuse', 'mystique', false),
  ('arme', 'chat', 'mystique', false),
  ('arme', 'lance-ceremonie', 'legendaire', false),
  ('arme', 'etendard', 'legendaire', false),
  ('arme', 'bouclier-or-cisele', 'legendaire', false),
  ('arme', 'harpe-or', 'legendaire', false),
  ('arme', 'pelle-tarte-or', 'legendaire', false),
  ('arme', 'sceptre-bois-flotte', 'legendaire', false),
  ('arme', 'plume-or', 'legendaire', false)
-- </garde-robe>
on conflict (emplacement, objet) do update set rarete = excluded.rarete, gratuit = excluded.gratuit;

-- Une tenue valide pour l'appelant : à chaque emplacement, un objet gratuit ou de son inventaire ; le visage peut manquer.
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
  if jsonb_typeof(p_tenue -> 'teinte_cheveux') is distinct from 'string'
    or not ((p_tenue ->> 'teinte_cheveux') = any (array['roux', 'blond', 'chatain', 'noir', 'gris', 'blanc'])) then
    return false;
  end if;
  return (select count(*) from jsonb_object_keys(p_tenue)) = v_cles;
end $$;

revoke all on function internal.gaulois_tenue_valide(jsonb) from public, anon, authenticated;
