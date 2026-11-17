-- Le lien du profil OpenFront, montré à l'équipe le temps d'une demande (17 novembre 2026, à la demande du pilote, qui
-- voyait des demandes « sans identifiant » : la pastille « Absent de la liste » et rien à côté).
--
-- Depuis le 14 novembre 2026, `request_membership_link` ne gardait que l'empreinte de l'identifiant. Quand la liste
-- officielle ne le connaissait pas, l'officier n'avait donc rien pour reconnaître le joueur dans le jeu. Désormais la
-- demande garde aussi le lien du profil, en clair, dans `claimed_text` : `https://openfront.io/player/<identifiant>`,
-- que l'onglet Demandes de la Direction montre et ouvre (`list_membership_requests`, inchangée, le donne déjà aux
-- officiers seulement).
--
-- Ce lien ne reste que tant que la demande attend : un déclencheur l'efface dès qu'elle est validée, refusée ou annulée,
-- par qui que ce soit. Après la décision, il ne reste que l'empreinte, comme avant. La sauvegarde chiffrée n'emporte
-- toujours pas `claimed_text`. La page Confidentialité le dit.
--
-- Les demandes déjà en attente n'ont que leur empreinte : rien ne permet d'en retrouver l'identifiant.

create or replace function public.request_membership_link(p_public_id text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_id text := btrim(coalesce(p_public_id, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_hash text;
  v_entry public.clan_roster;
  v_detail text;
begin
  if internal.limit_exceeded() then return internal.error_json('rate_limited', ''); end if;
  begin
    if v_uid is null then perform internal.fail('not_signed_in'); end if;
    select * into v_profile from public.profiles where user_id = v_uid;
    if not found then perform internal.fail('not_signed_in'); end if;
    if v_profile.status = 'suspended' then perform internal.fail('suspended'); end if;
    if v_profile.status = 'validated' then perform internal.fail('already_validated'); end if;
    -- La forme des identifiants publics du jeu : 22 signes au plus, lettres, chiffres, « _ » et « - ».
    if v_id !~ '^[A-Za-z0-9_-]{1,22}$' then perform internal.fail('invalid_profile_link'); end if;
    if char_length(coalesce(v_note, '')) > 300 then perform internal.fail('invalid_note'); end if;
    if exists (select 1 from public.membership_requests where user_id = v_uid and status = 'pending') then
      perform internal.fail('request_open');
    end if;

    v_hash := internal.hash_public_id(v_id);
    if exists (select 1 from public.private_links where openfront_hash = v_hash) then
      perform internal.fail('already_linked');
    end if;
    -- Par l'empreinte seulement : un identifiant n'est jamais pris pour un pseudo.
    select * into v_entry from public.clan_roster where public_id_hash = v_hash;

    -- Le lien du profil, pour l'officier, tant que la demande attend (effacé ensuite par le déclencheur ci-dessous).
    insert into public.membership_requests (user_id, openfront_hash, claimed_text, roster_username, in_roster, note)
    values (v_uid, v_hash, 'https://openfront.io/player/' || v_id, v_entry.username, v_entry.public_id_hash is not null, v_note);
    return jsonb_build_object('ok', true, 'in_roster', v_entry.public_id_hash is not null, 'roster_username', v_entry.username);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.request_membership_link(text, text) from public, anon, authenticated;
grant execute on function public.request_membership_link(text, text) to authenticated;

-- Une demande qui n'attend plus ne garde plus ce que le joueur a donné en clair.
create or replace function internal.forget_claim_once_decided() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.status = 'pending' and new.status <> 'pending' then
    new.claimed_text := null;
  end if;
  return new;
end $$;

revoke all on function internal.forget_claim_once_decided() from public, anon, authenticated;

create or replace trigger membership_forgets_claim before update on public.membership_requests
  for each row execute function internal.forget_claim_once_decided();
