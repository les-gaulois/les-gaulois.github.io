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
  ('bouche', 'sourire', null, true),
  ('cicatrice', 'aucune', null, true)
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
