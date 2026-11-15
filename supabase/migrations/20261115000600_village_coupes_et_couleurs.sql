-- Le village des Gaulois : dix coupes, dix barbes et dix couleurs de cheveux de plus (15 novembre 2026, docs/DIRECTION.md,
-- « Le village des Gaulois », lot 8).
--
-- Demande du pilote : « 10 coupes de cheveux en plus, davantage de choix de couleurs, 10 coupes de barbe en plus ». Les
-- dessins sont dans supabase/functions/code-discord/garde-robe/cheveux.ts et barbe.ts, les couleurs dans `POILS` de
-- gaulois.ts ; la liste du serveur, ici, est la même : un test garde les deux identiques.
--
-- À coller APRÈS la garde-robe (20261114000200) : la vérification d'une tenue remplacée ici est la sienne, qui accepte un
-- objet gratuit OU possédé par l'appelant, et un visage absent.
--
-- Ce qui change :
-- - internal.gaulois_objets : vingt lignes de plus, gratuites et sans rareté (le corps, comme les coupes et les barbes
--   d'avant). Gratuites, elles n'entrent ni dans la boutique, ni dans la pochette surprise, ni au marché.
-- - internal.gaulois_tenue_valide (remplacée, depuis la version de la garde-robe) : seize couleurs de cheveux au lieu de
--   six. Rien d'autre ne change : les six d'avant restent, une tenue enregistrée reste valide.
--
-- Rien n'est effacé : des lignes sont ajoutées, une fonction est remplacée par la même avec plus de couleurs. Rejouée, elle
-- se remplace par la même.

insert into internal.gaulois_objets (emplacement, objet, rarete, gratuit) values
-- <coupes>
  ('cheveux', 'queue-de-cheval', null, true),
  ('cheveux', 'chignon', null, true),
  ('cheveux', 'crete', null, true),
  ('cheveux', 'bol', null, true),
  ('cheveux', 'boucles', null, true),
  ('cheveux', 'raie', null, true),
  ('cheveux', 'demi-rase', null, true),
  ('cheveux', 'degarni', null, true),
  ('cheveux', 'mulet', null, true),
  ('cheveux', 'meches', null, true),
  ('barbe', 'trois-jours', null, true),
  ('barbe', 'guidon', null, true),
  ('barbe', 'favoris', null, true),
  ('barbe', 'collier', null, true),
  ('barbe', 'bouc', null, true),
  ('barbe', 'barbiche', null, true),
  ('barbe', 'fourchue', null, true),
  ('barbe', 'tressee', null, true),
  ('barbe', 'deux-tresses', null, true),
  ('barbe', 'fleuve', null, true)
-- </coupes>
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
  -- Les six couleurs d'avant, puis les dix du 15 novembre 2026 (`POILS` de gaulois.ts, dans le même ordre).
  if jsonb_typeof(p_tenue -> 'teinte_cheveux') is distinct from 'string'
    or not ((p_tenue ->> 'teinte_cheveux') = any (array['roux', 'blond', 'chatain', 'noir', 'gris', 'blanc', 'auburn', 'cuivre', 'platine', 'cendre', 'acajou', 'guede', 'vert', 'garance', 'violet', 'rose'])) then
    return false;
  end if;
  return (select count(*) from jsonb_object_keys(p_tenue)) = v_cles;
end $$;

revoke all on function internal.gaulois_tenue_valide(jsonb) from public, anon, authenticated;
