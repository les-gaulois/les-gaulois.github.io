-- Le message d'essai du salon Discord « alliance », demandé par le pilote le 13 novembre 2026 : le français puis l'anglais,
-- chacun sur sa ligne avec son drapeau, au lieu d'une seule ligne coupée par « · ».
--
-- Elle vient après 20261113001500_activite_du_site.sql, sans en dépendre. Elle reprend telle quelle internal.discord_salon_test de
-- 20261113001000_zones_etats_epingle_annonces.sql, avec seulement la ligne « alliance » changée (« Ajout de 20261113001600 »).
-- Elle ne touche à aucune table ni aucune donnée ; rejouée, elle ne change rien.

create or replace function internal.discord_salon_test(p_salon text) returns bigint
language plpgsql set search_path = public, pg_temp as $$
declare
  v_url text;
  v_request bigint;
begin
  select webhook_url into v_url from internal.discord_salons where salon = p_salon;
  if not found then return null; end if;
  begin
    v_request := net.http_post(
      url := v_url,
      body := jsonb_build_object(
        'content', case p_salon
          when 'nouvelles' then 'Essai du site du clan : la gazette, les alertes, les paliers, les messages du jour et la course du soir arriveront dans ce salon.'
          when 'victoires' then 'Essai du site du clan : chaque victoire du clan, avec l''image de la carte, arrivera dans ce salon.'
          -- Ajout de 20261113001600 : le français puis l'anglais, chacun sur sa ligne avec son drapeau (lettres régionales
          -- F R et G B, que Discord affiche en drapeaux), une ligne vide entre les deux.
          when 'alliance' then chr(127467) || chr(127479) || ' Essai du site du clan : les zones nouvelles de la carte de l''alliance, et chaque zone dont l''état change, arriveront dans ce salon.'
            || chr(10) || chr(10)
            || chr(127468) || chr(127463) || ' Site test: new zones of the alliance map, and zones whose status changes, will be posted here.'
          else 'Essai du site du clan : les demandes qui attendent et le compte rendu des sauvegardes arriveront dans ce salon.'
        end,
        'allowed_mentions', jsonb_build_object('parse', jsonb_build_array())
      ),
      timeout_milliseconds := 5000
    );
    update internal.discord_salons set last_at = now(), last_request = v_request, last_error = null where salon = p_salon;
    return v_request;
  exception when others then
    update internal.discord_salons set last_at = now(), last_request = null, last_error = left(sqlerrm, 300) where salon = p_salon;
    return null;
  end;
end $$;

revoke all on function internal.discord_salon_test(text) from public, anon, authenticated;
