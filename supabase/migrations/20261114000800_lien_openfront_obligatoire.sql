-- Le lien du profil OpenFront, obligatoire pour demander sa validation (14 novembre 2026, à la demande du pilote :
-- « au moment de se connecter en code ou discord il doit obligatoirement mettre son lien openfront »).
--
-- Le site lit l'identifiant public dans le lien collé (`src/lib/compte/lien-openfront.ts`) et l'envoie ici. Le serveur
-- revérifie sa forme, le cherche dans la liste officielle par son empreinte seulement, et ne garde jamais l'identifiant
-- lui-même : `claimed_text` reste vide, même quand la liste ne le connaît pas, comme le promet la page Confidentialité.
-- À la validation, le compte est lié à cette empreinte : celle d'un identifiant, que la liste retrouve même si le joueur
-- n'entre dans le clan qu'ensuite, et non plus celle d'un pseudo tapé, qu'elle ne retrouvait jamais.
--
-- L'ancienne demande, par pseudo ou identifiant tapé (`request_membership`), n'est plus ouverte aux comptes : elle gardait
-- en clair un texte que la liste ne reconnaissait pas. Elle reste dans la base, sans droit pour personne.
-- Le refus « discord_required » (un compte sans Discord ne demande rien) vient toujours du déclencheur de la table.

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

    insert into public.membership_requests (user_id, openfront_hash, claimed_text, roster_username, in_roster, note)
    values (v_uid, v_hash, null, v_entry.username, v_entry.public_id_hash is not null, v_note);
    return jsonb_build_object('ok', true, 'in_roster', v_entry.public_id_hash is not null, 'roster_username', v_entry.username);
  exception when sqlstate 'GA001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return internal.error_json(sqlerrm, v_detail);
  end;
end $$;

revoke all on function public.request_membership_link(text, text) from public, anon, authenticated;
grant execute on function public.request_membership_link(text, text) to authenticated;

revoke all on function public.request_membership(text, text) from public, anon, authenticated;
