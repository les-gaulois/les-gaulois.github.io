-- Les concours du clan sur Discord (docs/DIRECTION.md, « Les concours sur Discord »), demandés par le pilote le 12 novembre
-- 2026 : refaire « en mieux » le concours (giveaway) de DraftBot, avec le robot « Le Gaulois ». L'encadrement lance un
-- concours par /concours dans un salon ; les membres participent d'un clic ; à la fin, le serveur tire au sort.
--
-- La fonction serveur code-discord (supabase/functions/code-discord/concours.ts) reçoit les commandes et les clics signés
-- par Discord, puis appelle les fonctions ci-dessous avec la clé de service : ni un visiteur ni un membre du site ne peut
-- les appeler. L'identifiant Discord d'un participant et ses rôles viennent donc de Discord, jamais d'un navigateur.
--
-- Le tirage se fait ici, dans la base, au hasard (gen_random_uuid, le générateur sûr de Postgres) : l'ordre de tous les
-- participants est tiré une fois, à la fin, et gardé. La fonction prend les gagnants dans cet ordre, sans en sauter aucun :
-- elle ne peut passer que ceux qui ont quitté le serveur ou perdu le rôle demandé, et la base vérifie qu'elle suit l'ordre.
-- Un « nouveau tirage » prend le suivant dans le même ordre.
--
-- Chaque minute, une tâche planifiée (pg_cron, gal-concours) regarde si un concours a besoin du robot : un tirage à faire,
-- le nombre de participants à mettre à jour, un résultat à annoncer. Si oui, elle réveille la fonction par pg_net, à
-- l'adresse que la fonction lui a donnée elle-même au premier concours. Sinon, rien ne part.
--
-- Ce qui est gardé : l'identifiant Discord de chaque participant, effacé 30 jours après le tirage (tout de suite si le
-- concours est annulé), comme celui des tirés au sort passés ou remplacés ; celui des gagnants, de qui a lancé et de qui a
-- annulé le concours, effacés avec le concours, un an après sa fin. Ni nom, ni pseudo, ni photo.
--
-- Cette migration ne fait qu'ajouter : quatre tables, des fonctions et une tâche planifiée. Rien n'est retiré. Rejouée,
-- elle ne change rien.

/* ---------- Les tables ---------- */

-- Un concours. `statut` : « brouillon » entre la commande et l'envoi du formulaire, « ouvert » une fois son message posté,
-- « termine » dès le tirage, « annule ». Les colonnes du bas servent au robot : ce que le message montre, et ses essais.
create table if not exists internal.concours (
  id bigint generated always as identity primary key,
  guild_id text not null check (guild_id ~ '^[0-9]{17,20}$'),
  salon_id text not null check (salon_id ~ '^[0-9]{17,20}$'),
  message_id text unique check (message_id ~ '^[0-9]{17,20}$'),
  createur_id text not null check (createur_id ~ '^[0-9]{17,20}$'),
  titre text check (char_length(titre) between 1 and 100),
  lot text not null check (char_length(lot) between 1 and 100),
  texte text check (char_length(texte) between 1 and 1500),
  gagnants smallint not null check (gagnants between 1 and 20),
  -- Le rôle qu'il faut avoir pour participer (null : tout le serveur), et celui que le message prévient au lancement.
  role_id text check (role_id ~ '^[0-9]{17,20}$'),
  notifier_id text check (notifier_id ~ '^[0-9]{17,20}$'),
  image_url text check (image_url ~ '^https://[^[:space:]]+$' and char_length(image_url) <= 500),
  image_alt text check (char_length(image_alt) between 1 and 200),
  fin timestamptz not null,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'ouvert', 'termine', 'annule')),
  cree_at timestamptz not null default now(),
  lance_at timestamptz,
  tire_at timestamptz,
  -- L'heure du dernier tirage : le premier, puis chaque nouveau tirage.
  tirage_at timestamptz,
  -- Tous les participants, dans l'ordre tiré au sort à la fin, et leur nombre au tirage ou à l'annulation.
  ordre text[],
  compte_tirage integer check (compte_tirage >= 0),
  -- Les gagnants qui restent à choisir dans l'ordre : `gagnants` au tirage, puis un par gagnant remplacé.
  a_tirer smallint not null default 0 check (a_tirer >= 0),
  -- Le numéro du tirage : 1 à la fin, puis un de plus à chaque nouveau tirage.
  tirage smallint not null default 0 check (tirage >= 0),
  -- Plus personne à tirer dans l'ordre.
  epuise boolean not null default false,
  -- Combien de tirés au sort ont été passés (partis du serveur, ou sans le rôle), et combien de gagnants remplacés : le
  -- message le dit encore quand leurs lignes sont effacées, 30 jours après le tirage.
  nb_passes integer not null default 0 check (nb_passes >= 0),
  nb_remplaces integer not null default 0 check (nb_remplaces >= 0),
  annule_par text check (annule_par ~ '^[0-9]{17,20}$'),
  annule_at timestamptz,
  -- Le nombre de participants que le message montre, et l'heure de sa dernière mise à jour.
  compte_affiche integer not null default 0 check (compte_affiche >= 0),
  maj_at timestamptz,
  -- `rendu` augmente à chaque changement que le message doit montrer (tirage, gagnants, confirmation, annulation).
  -- `final_affiche` : le message montre l'état du rendu en cours ; une modification faite sur un rendu plus ancien ne compte pas.
  rendu integer not null default 0 check (rendu >= 0),
  final_affiche boolean not null default false,
  -- Le message retiré de Discord n'est plus modifié ; le salon supprimé, le robot laisse ce concours.
  message_perdu boolean not null default false,
  salon_perdu boolean not null default false,
  -- Le robot travaille sur ce concours depuis cette heure, sous ce jeton : deux réveils ne font jamais le même travail, et
  -- le compte rendu d'un réveil dont la prise a expiré ne compte pas.
  travail_at timestamptz,
  travail_jeton uuid,
  -- Ses essais ratés de suite, l'heure du dernier et sa raison, sans rien de secret : un essai par minute au plus, puis,
  -- au-delà de dix, un par demi-heure.
  essais integer not null default 0 check (essais >= 0),
  essai_at timestamptz,
  erreur text check (char_length(erreur) <= 200),
  check (statut = 'brouillon' or titre is not null)
);
create index if not exists concours_par_serveur on internal.concours (guild_id, cree_at desc);
create index if not exists concours_par_statut on internal.concours (statut, fin);

-- Un participant : son identifiant Discord et son heure d'inscription. Un second clic ne l'inscrit pas deux fois.
create table if not exists internal.concours_participants (
  concours_id bigint not null references internal.concours (id) on delete cascade,
  discord_id text not null check (discord_id ~ '^[0-9]{17,20}$'),
  inscrit_at timestamptz not null default now(),
  primary key (concours_id, discord_id)
);

-- Ceux que le tirage a atteints : `rang`, leur place dans l'ordre tiré au sort ; `issue`, gagnant, remplacé par un nouveau
-- tirage, ou passé (parti du serveur, ou sans le rôle demandé) ; `annonce_id`, le message qui l'a annoncé gagnant.
create table if not exists internal.concours_tires (
  concours_id bigint not null references internal.concours (id) on delete cascade,
  discord_id text not null check (discord_id ~ '^[0-9]{17,20}$'),
  rang integer not null check (rang >= 1),
  tirage smallint not null check (tirage >= 1),
  issue text not null check (issue in ('gagnant', 'remplace', 'parti', 'sans_role')),
  tire_at timestamptz not null default now(),
  confirme_at timestamptz,
  annonce_id text check (annonce_id ~ '^[0-9]{17,20}$'),
  primary key (concours_id, discord_id)
);

-- L'adresse où la tâche planifiée réveille la fonction, donnée par la fonction elle-même, et l'heure du dernier réveil.
create table if not exists internal.concours_reglages (
  id boolean primary key default true check (id),
  reveil_url text check (reveil_url ~ '^https://[a-z0-9]{20}\.supabase\.co/functions/v1/code-discord/concours/tic$'),
  reveil_at timestamptz
);

alter table internal.concours enable row level security;
alter table internal.concours_participants enable row level security;
alter table internal.concours_tires enable row level security;
alter table internal.concours_reglages enable row level security;
revoke all on internal.concours, internal.concours_participants, internal.concours_tires, internal.concours_reglages from public, anon, authenticated;

/* ---------- Les outils ---------- */

-- Une ligne écrite par l'encadrement : les caractères de contrôle et les blancs en série deviennent une espace, ceux du
-- début et de la fin partent. De 1 à p_max caractères ; sinon null.
create or replace function internal.concours_ligne(p_texte text, p_max integer) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case when char_length(x.v) between 1 and p_max then x.v end
  from (select btrim(regexp_replace(coalesce(p_texte, ''), '[[:space:][:cntrl:]]+', ' ', 'g')) as v) x
$$;

-- Un texte de plusieurs lignes : les retours à la ligne restent (trois de suite au plus), les autres caractères de
-- contrôle deviennent des espaces, les blancs du début et de la fin partent. De 1 à p_max caractères ; sinon null.
create or replace function internal.concours_bloc(p_texte text, p_max integer) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case when char_length(x.v) between 1 and p_max then x.v end
  from (
    select regexp_replace(
      regexp_replace(
        regexp_replace(replace(replace(coalesce(p_texte, ''), E'\r\n', E'\n'), E'\r', E'\n'), E'[\\x01-\\x09\\x0b-\\x1f\\x7f]', ' ', 'g'),
        E'\n{4,}', E'\n\n\n', 'g'),
      E'^[ \n]+|[ \n]+$', '', 'g') as v
  ) x
$$;

-- Un identifiant Discord : membre, rôle, salon ou message.
create or replace function internal.concours_numero(p_valeur text) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select coalesce(p_valeur, '') ~ '^[0-9]{17,20}$'
$$;

-- Tout ce que la fonction code-discord doit savoir d'un concours pour écrire ou modifier ses messages, avec le jeton de sa
-- prise quand le robot travaille dessus.
create or replace function internal.concours_vue(p_id bigint) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', c.id, 'guild_id', c.guild_id, 'salon_id', c.salon_id, 'message_id', c.message_id, 'createur_id', c.createur_id,
    'titre', c.titre, 'lot', c.lot, 'texte', c.texte, 'gagnants', c.gagnants, 'role_id', c.role_id,
    'notifier_id', c.notifier_id, 'image_url', c.image_url, 'image_alt', c.image_alt, 'fin', c.fin, 'statut', c.statut,
    'tire_at', c.tire_at, 'tirage_at', c.tirage_at, 'annule_par', c.annule_par, 'annule_at', c.annule_at, 'a_tirer', c.a_tirer,
    'tirage', c.tirage, 'epuise', c.epuise, 'nb_passes', c.nb_passes, 'nb_remplaces', c.nb_remplaces,
    'compte', (select count(*) from internal.concours_participants p where p.concours_id = c.id),
    'compte_tirage', c.compte_tirage, 'compte_affiche', c.compte_affiche, 'rendu', c.rendu, 'final_affiche', c.final_affiche,
    'message_perdu', c.message_perdu, 'salon_perdu', c.salon_perdu, 'essais', c.essais, 'jeton', c.travail_jeton,
    'ordre', to_jsonb(c.ordre),
    'tires', coalesce((
      select jsonb_agg(jsonb_build_object('discord_id', t.discord_id, 'rang', t.rang, 'tirage', t.tirage, 'issue', t.issue,
        'confirme_at', t.confirme_at, 'annonce_id', t.annonce_id) order by t.rang)
      from internal.concours_tires t where t.concours_id = c.id
    ), '[]'::jsonb)
  )
  from internal.concours c
  where c.id = p_id
$$;

-- Ce concours a-t-il besoin du robot ? Un tirage à faire, le nombre de participants à mettre à jour sur son message, des
-- gagnants à choisir ou à annoncer, son état final à montrer. Après un essai raté, pas de nouvel essai avant une minute ;
-- après dix de suite, un par demi-heure. Plus rien si son salon a été supprimé. La porte sans secret de la fonction ne peut
-- donc pas faire tourner les essais plus vite.
create or replace function internal.concours_a_faire(c internal.concours) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select not c.salon_perdu
    and (c.essais = 0 or c.essai_at is null or c.essai_at < now() - interval '50 seconds')
    and (c.essais < 10 or c.essai_at is null or c.essai_at < now() - interval '30 minutes')
    and (
      (c.statut = 'ouvert' and c.fin <= now())
      or (c.statut = 'ouvert' and c.message_id is not null and not c.message_perdu
          and c.compte_affiche <> (select count(*) from internal.concours_participants p where p.concours_id = c.id))
      or (c.statut = 'termine' and (c.a_tirer > 0 or not c.final_affiche or exists (
            select 1 from internal.concours_tires t where t.concours_id = c.id and t.issue = 'gagnant' and t.annonce_id is null)))
      or (c.statut = 'annule' and not c.final_affiche)
    )
$$;

-- Efface ce qui ne sert plus : les brouillons d'un jour ; 30 jours après le tirage ou l'annulation, les participants, les
-- tirés au sort passés ou remplacés (leurs nombres restent) et l'ordre du tirage (plus de nouveau tirage possible, et un
-- tirage inachevé s'arrête) ; les
-- concours un an après leur fin ; et l'historique de la tâche planifiée au bout d'une heure. Appelée à chaque réveil et à
-- chaque concours lancé.
create or replace function internal.concours_purge() returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from internal.concours where statut = 'brouillon' and cree_at < now() - interval '1 day';
  delete from internal.concours_participants p using internal.concours c
  where p.concours_id = c.id and c.statut in ('termine', 'annule') and coalesce(c.tire_at, c.annule_at) < now() - interval '30 days';
  delete from internal.concours_tires t using internal.concours c
  where t.concours_id = c.id and t.issue <> 'gagnant' and c.tire_at < now() - interval '30 days';
  update internal.concours
     set ordre = null, a_tirer = 0, epuise = epuise or a_tirer > 0,
         final_affiche = final_affiche and a_tirer = 0, rendu = rendu + case when a_tirer > 0 then 1 else 0 end
   where statut = 'termine' and ordre is not null and tire_at < now() - interval '30 days';
  delete from internal.concours where statut in ('termine', 'annule') and coalesce(tire_at, annule_at, fin) < now() - interval '365 days';
  delete from cron.job_run_details
  where jobid in (select jobid from cron.job where jobname = 'gal-concours') and end_time < now() - interval '1 hour';
$$;

-- Le tirage des concours dont la fin est passée : l'ordre de tous les participants, au hasard, gardé. Chaque concours est
-- d'abord verrouillé : un clic encore en cours finit avant, et la commande suivante, qui voit tout ce qui est enregistré,
-- compte ce participant. Appelée à chaque réveil, même quand le salon du concours a disparu, et par le robot.
create or replace function internal.concours_tirer() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id bigint;
begin
  for v_id in select id from internal.concours where statut = 'ouvert' and fin <= now() order by id for update loop
    update internal.concours c
       set statut = 'termine', tire_at = now(), tirage_at = now(), tirage = 1,
           -- Sans salon, rien ne peut y être annoncé : pas de gagnant à choisir.
           a_tirer = case when c.salon_perdu then 0 else c.gagnants end, epuise = c.salon_perdu,
           final_affiche = c.salon_perdu, rendu = c.rendu + 1, essais = 0, essai_at = null, erreur = null,
           ordre = coalesce((
             select array_agg(p.discord_id order by gen_random_uuid()) from internal.concours_participants p where p.concours_id = c.id
           ), '{}'::text[]),
           compte_tirage = (select count(*) from internal.concours_participants p where p.concours_id = c.id)
     where c.id = v_id and c.statut = 'ouvert';
  end loop;
end $$;

/* ---------- Pour la fonction code-discord, avec la clé de service ---------- */

-- /concours lancer : un brouillon, le temps que l'encadrement écrive le titre et le texte dans le formulaire de Discord.
-- La fonction a déjà lu la date de fin (au moins une minute, au plus 31 jours) ; la base la revérifie, avec trente secondes
-- de marge pour le trajet. Au plus 20 concours ouverts à la fois sur le serveur, et 20 brouillons par heure et par
-- personne. `p_reveil` : l'adresse de la fonction, gardée pour la tâche planifiée.
create or replace function public.concours_brouillon(
  p_guild text, p_salon text, p_createur text, p_lot text, p_fin timestamptz, p_gagnants integer,
  p_role text, p_notifier text, p_image_url text, p_image_alt text, p_reveil text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lot text := internal.concours_ligne(p_lot, 100);
  v_alt text := internal.concours_ligne(p_image_alt, 200);
  v_id bigint;
begin
  if not internal.concours_numero(p_guild) or not internal.concours_numero(p_salon) or not internal.concours_numero(p_createur)
     or v_lot is null or p_fin is null or p_gagnants is null or p_gagnants not between 1 and 20
     or (p_role is not null and not internal.concours_numero(p_role))
     or (p_notifier is not null and not internal.concours_numero(p_notifier))
     or (p_image_url is not null and (p_image_url !~ '^https://[^[:space:]]+$' or char_length(p_image_url) > 500))
     or (p_image_alt is not null and v_alt is null) then
    return internal.error_json('invalid_request', '');
  end if;
  if p_fin < now() + interval '30 seconds' then return internal.error_json('fin_trop_proche', ''); end if;
  if p_fin > now() + interval '31 days' then return internal.error_json('fin_trop_loin', ''); end if;
  perform internal.concours_purge();
  if (select count(*) from internal.concours where guild_id = p_guild and statut = 'ouvert') >= 20 then
    return internal.error_json('trop_de_concours', '');
  end if;
  if (select count(*) from internal.concours where createur_id = p_createur and cree_at > now() - interval '1 hour') >= 20 then
    return internal.error_json('trop_de_brouillons', '');
  end if;
  if p_reveil ~ '^https://[a-z0-9]{20}\.supabase\.co/functions/v1/code-discord/concours/tic$' then
    insert into internal.concours_reglages (id, reveil_url) values (true, p_reveil)
    on conflict (id) do update set reveil_url = excluded.reveil_url;
  end if;
  insert into internal.concours (guild_id, salon_id, createur_id, lot, fin, gagnants, role_id, notifier_id, image_url, image_alt)
  values (p_guild, p_salon, p_createur, v_lot, date_trunc('second', p_fin), p_gagnants, p_role, p_notifier, p_image_url, v_alt)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Le formulaire envoyé : le titre et le texte du concours. Seul qui a tapé la commande, dans l'heure, et tant que la fin
-- n'est pas passée. Rend tout le concours, pour son message.
create or replace function public.concours_texte(p_id bigint, p_createur text, p_titre text, p_texte text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v internal.concours;
  v_titre text := internal.concours_ligne(p_titre, 100);
  v_texte text := internal.concours_bloc(p_texte, 1500);
begin
  if p_id is null or not internal.concours_numero(p_createur) or v_titre is null
     or (v_texte is null and internal.concours_bloc(p_texte, 100000) is not null) then
    return internal.error_json('invalid_request', '');
  end if;
  select * into v from internal.concours where id = p_id for update;
  if not found or v.statut <> 'brouillon' or v.createur_id <> p_createur or v.cree_at < now() - interval '1 hour' then
    return internal.error_json('brouillon_perdu', '');
  end if;
  if v.fin < now() + interval '30 seconds' then return internal.error_json('fin_passee', ''); end if;
  update internal.concours set titre = v_titre, texte = v_texte where id = p_id;
  return jsonb_build_object('ok', true, 'concours', internal.concours_vue(p_id));
end $$;

-- Le message du concours est posté : le concours s'ouvre.
create or replace function public.concours_lance(p_id bigint, p_message_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_id is null or not internal.concours_numero(p_message_id) then return internal.error_json('invalid_request', ''); end if;
  update internal.concours
     set statut = 'ouvert', message_id = p_message_id, lance_at = now(), maj_at = now(), compte_affiche = 0
   where id = p_id and statut = 'brouillon' and titre is not null;
  if not found then return internal.error_json('brouillon_perdu', ''); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Un clic sur « Participer ». `p_roles` : les rôles du membre, tels que Discord les a signés avec le clic. Rend l'état
-- (« inscrit » ou « deja »), le nombre de participants et, toutes les trois secondes au plus, tout le concours avec
-- `maj` : la fonction met alors à jour le nombre sur le message. Sinon, le réveil suivant s'en charge.
create or replace function public.concours_participer(p_id bigint, p_discord_id text, p_roles text[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v internal.concours;
  v_nouveau boolean;
  v_compte integer;
  v_maj boolean;
begin
  if p_id is null or not internal.concours_numero(p_discord_id) then return internal.error_json('invalid_request', ''); end if;
  -- Verrouillé (sans toucher à la clé) : deux clics passent l'un après l'autre, en quelques millisecondes, et le tirage
  -- attend la fin de ce clic, et le compte.
  select * into v from internal.concours where id = p_id for no key update;
  if not found or v.statut = 'brouillon' then return internal.error_json('inconnu', ''); end if;
  if v.statut = 'annule' then return internal.error_json('annule', ''); end if;
  if v.statut = 'termine' or v.fin <= clock_timestamp() then return internal.error_json('termine', ''); end if;
  if v.role_id is not null and not (v.role_id = any (coalesce(p_roles, '{}'::text[]))) then
    return jsonb_build_object('ok', false, 'error', 'sans_role', 'role_id', v.role_id);
  end if;
  insert into internal.concours_participants (concours_id, discord_id) values (p_id, p_discord_id) on conflict do nothing;
  v_nouveau := found;
  select count(*) into v_compte from internal.concours_participants where concours_id = p_id;
  update internal.concours set maj_at = now()
   where id = p_id and message_id is not null and not message_perdu and compte_affiche <> v_compte
     and (maj_at is null or maj_at < now() - interval '3 seconds');
  v_maj := found;
  return jsonb_build_object('ok', true, 'etat', case when v_nouveau then 'inscrit' else 'deja' end, 'compte', v_compte,
    'titre', v.titre, 'fin', v.fin, 'maj', v_maj, 'concours', case when v_maj then internal.concours_vue(p_id) end);
end $$;

-- « Me retirer », tant que le concours est ouvert. Rend l'état (« retire », ou « absent » s'il ne participait pas).
create or replace function public.concours_quitter(p_id bigint, p_discord_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v internal.concours;
  v_retire boolean;
  v_compte integer;
  v_maj boolean;
begin
  if p_id is null or not internal.concours_numero(p_discord_id) then return internal.error_json('invalid_request', ''); end if;
  -- Verrouillé (sans toucher à la clé) : deux clics passent l'un après l'autre, en quelques millisecondes, et le tirage
  -- attend la fin de ce clic, et le compte.
  select * into v from internal.concours where id = p_id for no key update;
  if not found or v.statut = 'brouillon' then return internal.error_json('inconnu', ''); end if;
  if v.statut = 'annule' then return internal.error_json('annule', ''); end if;
  if v.statut = 'termine' or v.fin <= clock_timestamp() then return internal.error_json('termine', ''); end if;
  delete from internal.concours_participants where concours_id = p_id and discord_id = p_discord_id;
  v_retire := found;
  select count(*) into v_compte from internal.concours_participants where concours_id = p_id;
  update internal.concours set maj_at = now()
   where id = p_id and message_id is not null and not message_perdu and compte_affiche <> v_compte
     and (maj_at is null or maj_at < now() - interval '3 seconds');
  v_maj := found;
  return jsonb_build_object('ok', true, 'etat', case when v_retire then 'retire' else 'absent' end, 'compte', v_compte,
    'titre', v.titre, 'fin', v.fin, 'maj', v_maj, 'concours', case when v_maj then internal.concours_vue(p_id) end);
end $$;

-- « Participants » : leur nombre, les 150 premiers inscrits (leurs identifiants, que Discord écrit en noms), si celui qui
-- demande en est, et les gagnants une fois le tirage fait.
create or replace function public.concours_participants(p_id bigint, p_discord_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v internal.concours;
begin
  if p_id is null or not internal.concours_numero(p_discord_id) then return internal.error_json('invalid_request', ''); end if;
  select * into v from internal.concours where id = p_id;
  if not found or v.statut = 'brouillon' then return internal.error_json('inconnu', ''); end if;
  return jsonb_build_object('ok', true, 'statut', v.statut, 'titre', v.titre, 'fin', v.fin,
    'ouvert', v.statut = 'ouvert' and v.fin > now(),
    'compte', (select count(*) from internal.concours_participants where concours_id = p_id),
    'compte_tirage', v.compte_tirage,
    'inscrit', exists (select 1 from internal.concours_participants where concours_id = p_id and discord_id = p_discord_id),
    'ids', coalesce((
      select jsonb_agg(x.discord_id order by x.inscrit_at, x.discord_id)
      from (
        select discord_id, inscrit_at from internal.concours_participants where concours_id = p_id
        order by inscrit_at, discord_id limit 150
      ) x
    ), '[]'::jsonb),
    'gagnants', coalesce((
      select jsonb_agg(t.discord_id order by t.tirage, t.rang)
      from internal.concours_tires t where t.concours_id = p_id and t.issue = 'gagnant'
    ), '[]'::jsonb));
end $$;

-- Les concours du serveur que /concours propose pendant la saisie : les ouverts d'abord (la fin la plus proche en tête),
-- puis les autres (les plus récents en tête) ; 25 au plus, dont le titre contient ce qui est tapé. Avec la raison du
-- dernier essai raté du robot, s'il en a : l'encadrement voit qu'un concours est bloqué.
create or replace function public.concours_liste(p_guild text, p_filtre text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not internal.concours_numero(p_guild) then return internal.error_json('invalid_request', ''); end if;
  return jsonb_build_object('ok', true, 'concours', coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'titre', x.titre, 'statut', x.statut, 'fin', x.fin, 'tire_at', x.tire_at,
                                        'erreur', case when x.essais > 0 then x.erreur end)
                     order by x.groupe, x.cle)
    from (
      select c.id, c.titre, c.statut, c.fin, c.tire_at, c.essais, c.erreur,
             case when c.statut = 'ouvert' then 0 else 1 end as groupe,
             case when c.statut = 'ouvert' then extract(epoch from c.fin)
                  else -extract(epoch from coalesce(c.tire_at, c.annule_at, c.fin)) end as cle
      from internal.concours c
      where c.guild_id = p_guild and c.statut <> 'brouillon'
        and (coalesce(btrim(p_filtre), '') = '' or strpos(lower(c.titre), lower(btrim(p_filtre))) > 0 or c.id::text = btrim(p_filtre))
      order by groupe, cle
      limit 25
    ) x
  ), '[]'::jsonb));
end $$;

-- Ce que l'encadrement fait d'un concours, par /concours : « terminer » (le tirage, tout de suite), « annuler » (sans
-- tirage ; les participants sont effacés, leur nombre reste) ou « remplacer » (un nouveau tirage pour le gagnant nommé, ou
-- pour tous ceux qui n'ont pas confirmé). Discord ne propose la commande qu'à l'encadrement : droit « Gérer le serveur »,
-- ou ce que les réglages des intégrations du serveur en disent.
create or replace function public.concours_action(p_guild text, p_id bigint, p_action text, p_par text, p_gagnant text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v internal.concours;
  v_nombre integer := 0;
  v_issue text;
begin
  if not internal.concours_numero(p_guild) or p_id is null or not internal.concours_numero(p_par)
     or coalesce(p_action, '') not in ('terminer', 'annuler', 'remplacer')
     or (p_gagnant is not null and not internal.concours_numero(p_gagnant)) then
    return internal.error_json('invalid_request', '');
  end if;
  select * into v from internal.concours where id = p_id and guild_id = p_guild for update;
  if not found or v.statut = 'brouillon' then return internal.error_json('inconnu', ''); end if;
  if p_action in ('terminer', 'annuler') then
    if v.statut = 'annule' then return internal.error_json('annule', ''); end if;
    if v.statut <> 'ouvert' then return internal.error_json('deja_termine', ''); end if;
    if p_action = 'terminer' then
      update internal.concours set fin = least(fin, now()), essais = 0, essai_at = null, erreur = null where id = p_id;
    else
      update internal.concours
         set statut = 'annule', annule_par = p_par, annule_at = now(), final_affiche = false, rendu = rendu + 1,
             compte_tirage = (select count(*) from internal.concours_participants where concours_id = p_id),
             essais = 0, essai_at = null, erreur = null
       where id = p_id;
      delete from internal.concours_participants where concours_id = p_id;
    end if;
  else
    if v.statut = 'annule' then return internal.error_json('annule', ''); end if;
    if v.statut <> 'termine' then return internal.error_json('pas_termine', ''); end if;
    if v.a_tirer > 0 then return internal.error_json('tirage_en_cours', ''); end if;
    if v.ordre is null then return internal.error_json('trop_ancien', ''); end if;
    if p_gagnant is not null then
      select issue into v_issue from internal.concours_tires where concours_id = p_id and discord_id = p_gagnant;
      if v_issue is distinct from 'gagnant' then return internal.error_json('pas_gagnant', ''); end if;
      update internal.concours_tires set issue = 'remplace' where concours_id = p_id and discord_id = p_gagnant;
      v_nombre := 1;
    else
      if not exists (select 1 from internal.concours_tires where concours_id = p_id and issue = 'gagnant') then
        return internal.error_json('aucun_gagnant', '');
      end if;
      update internal.concours_tires set issue = 'remplace' where concours_id = p_id and issue = 'gagnant' and confirme_at is null;
      get diagnostics v_nombre = row_count;
      if v_nombre = 0 then return internal.error_json('tous_confirmes', ''); end if;
    end if;
    update internal.concours
       set a_tirer = v_nombre, tirage = tirage + 1, tirage_at = now(), epuise = false, nb_remplaces = nb_remplaces + v_nombre,
           final_affiche = false, rendu = rendu + 1, essais = 0, essai_at = null, erreur = null
     where id = p_id;
  end if;
  return jsonb_build_object('ok', true, 'nombre', v_nombre, 'titre', v.titre);
end $$;

-- Le travail du robot, à chaque réveil, ou juste après une commande de l'encadrement pour un seul concours (`p_id`) :
--  1. le tirage des concours dont la fin est passée (internal.concours_tirer) ;
--  2. jusqu'à `p_limite` concours qui ont besoin du robot, pris pour cinq minutes sous un jeton neuf : un second réveil ne
--     les prend pas, et le compte rendu d'un réveil dont la prise a expiré ne compte pas.
-- Rend tout ce qu'il faut savoir de chacun.
create or replace function public.concours_travail(p_limite integer, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ids bigint[];
begin
  perform internal.concours_tirer();
  with prises as (
    select c.id from internal.concours c
     where (p_id is null or c.id = p_id) and internal.concours_a_faire(c)
       and (c.travail_at is null or c.travail_at < now() - interval '5 minutes')
     order by c.fin, c.id
     limit greatest(1, least(coalesce(p_limite, 1), 10))
     for update skip locked
  ), prises_maj as (
    update internal.concours c set travail_at = now(), travail_jeton = gen_random_uuid() from prises where c.id = prises.id returning c.id
  )
  select coalesce(array_agg(id), '{}'::bigint[]) into v_ids from prises_maj;
  return jsonb_build_object('ok', true, 'taches', coalesce((
    select jsonb_agg(internal.concours_vue(x.id) order by x.id) from unnest(v_ids) as x(id)
  ), '[]'::jsonb));
end $$;

-- Les gagnants choisis par la fonction, et ceux qu'elle a passés (partis du serveur, ou sans le rôle demandé). Ensemble,
-- ils doivent être exactement les suivants dans l'ordre du tirage : la fonction ne peut sauter personne sans le dire.
-- `p_jeton` : la prise de la fonction, toujours la sienne ; `p_tirage` : le tirage pour lequel elle a choisi (si
-- l'encadrement en a demandé un autre entre-temps, rien n'est écrit). `p_epuise` : plus personne après eux, ce que la base
-- revérifie. Tout est vérifié avant d'écrire quoi que ce soit.
create or replace function public.concours_choix(p_id bigint, p_jeton uuid, p_tirage integer, p_elus text[], p_passes jsonb, p_epuise boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v internal.concours;
  v_elus text[] := coalesce(p_elus, '{}'::text[]);
  v_passes jsonb := coalesce(p_passes, '[]'::jsonb);
  v_tous text[];
  v_reste text[];
begin
  if p_id is null or p_jeton is null or p_tirage is null or jsonb_typeof(v_passes) <> 'array' then
    return internal.error_json('invalid_request', '');
  end if;
  select * into v from internal.concours where id = p_id for update;
  if not found or v.travail_jeton is distinct from p_jeton or v.statut <> 'termine' or v.tirage <> p_tirage or v.ordre is null then
    return internal.error_json('perime', '');
  end if;
  if cardinality(v_elus) > v.a_tirer then return internal.error_json('invalid_request', ''); end if;
  if exists (select 1 from jsonb_array_elements(v_passes) e
             where jsonb_typeof(e) <> 'object' or coalesce(e ->> 'raison', '') not in ('parti', 'sans_role')) then
    return internal.error_json('invalid_request', '');
  end if;
  v_tous := v_elus || coalesce((select array_agg(e ->> 'id') from jsonb_array_elements(v_passes) e), '{}'::text[]);
  -- Ceux que le tirage n'a pas encore atteints, dans l'ordre.
  v_reste := coalesce(array(
    select u.x from unnest(v.ordre) with ordinality as u(x, n)
    where not exists (select 1 from internal.concours_tires t where t.concours_id = p_id and t.discord_id = u.x)
    order by u.n
  ), '{}'::text[]);
  -- Chacun une fois, et tous ensemble exactement les premiers de ce reste ; épuisé : tout le reste.
  if (select count(distinct x) from unnest(v_tous) x) <> cardinality(v_tous)
     or exists (select 1 from unnest(v_tous) x where x is null)
     or coalesce((select array_agg(x order by x) from unnest(v_tous) x), '{}'::text[])
        is distinct from coalesce((select array_agg(x order by x) from unnest(v_reste[1:cardinality(v_tous)]) x), '{}'::text[])
     or (coalesce(p_epuise, false) and cardinality(v_tous) <> cardinality(v_reste)) then
    return internal.error_json('invalid_request', '');
  end if;
  insert into internal.concours_tires (concours_id, discord_id, rang, tirage, issue)
  select p_id, x, array_position(v.ordre, x), v.tirage, 'gagnant' from unnest(v_elus) x;
  insert into internal.concours_tires (concours_id, discord_id, rang, tirage, issue)
  select p_id, e ->> 'id', array_position(v.ordre, e ->> 'id'), v.tirage, e ->> 'raison' from jsonb_array_elements(v_passes) e;
  update internal.concours
     set a_tirer = case when coalesce(p_epuise, false) then 0 else a_tirer - cardinality(v_elus) end,
         epuise = epuise or coalesce(p_epuise, false),
         nb_passes = nb_passes + jsonb_array_length(v_passes),
         rendu = rendu + 1, final_affiche = false
   where id = p_id;
  return jsonb_build_object('ok', true, 'concours', internal.concours_vue(p_id));
end $$;

-- Ce que la fonction a fait sur Discord, sous sa prise (`p_jeton`) : le nombre de participants que le message montre, le
-- rendu qu'il montre (`p_rendu`, s'il est final : un changement arrivé entre-temps le fera refaire), le message d'annonce
-- et les gagnants qu'il annonce, le message du concours ou son salon retirés de Discord, ou l'erreur. Libère le concours.
-- Une prise expirée, reprise par un autre réveil : rien n'est écrit.
create or replace function public.concours_fait(
  p_id bigint, p_jeton uuid, p_rendu integer, p_compte integer, p_final boolean, p_annonce_id text, p_annonces text[],
  p_perdu boolean, p_salon_perdu boolean, p_erreur text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_id is null or p_jeton is null or (p_annonce_id is not null and not internal.concours_numero(p_annonce_id)) or coalesce(p_compte, 0) < 0 then
    return internal.error_json('invalid_request', '');
  end if;
  perform 1 from internal.concours where id = p_id and travail_jeton = p_jeton for update;
  if not found then return internal.error_json('perime', ''); end if;
  if p_annonce_id is not null then
    update internal.concours_tires set annonce_id = p_annonce_id
     where concours_id = p_id and issue in ('gagnant', 'remplace') and annonce_id is null and discord_id = any (coalesce(p_annonces, '{}'::text[]));
  end if;
  update internal.concours
     set compte_affiche = coalesce(p_compte, compte_affiche),
         maj_at = case when p_compte is null then maj_at else now() end,
         final_affiche = final_affiche or (coalesce(p_final, false) and rendu = p_rendu),
         message_perdu = message_perdu or coalesce(p_perdu, false) or coalesce(p_salon_perdu, false),
         salon_perdu = salon_perdu or coalesce(p_salon_perdu, false),
         essais = case when p_erreur is null then 0 else essais + 1 end,
         essai_at = case when p_erreur is null then essai_at else now() end,
         erreur = left(internal.concours_ligne(p_erreur, 100000), 200),
         travail_at = null,
         travail_jeton = null
   where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- Le nombre de participants mis à jour sur le message juste après un clic, sans prendre le concours. Si le concours a été
-- tiré au sort entre-temps, cette modification tardive a pu cacher son résultat : le réveil suivant le remontre.
create or replace function public.concours_affiche(p_id bigint, p_compte integer, p_perdu boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_id is null or p_compte is null or p_compte < 0 then return internal.error_json('invalid_request', ''); end if;
  update internal.concours set compte_affiche = p_compte, message_perdu = message_perdu or coalesce(p_perdu, false)
   where id = p_id and statut = 'ouvert';
  update internal.concours set final_affiche = false, rendu = rendu + 1, message_perdu = message_perdu or coalesce(p_perdu, false)
   where id = p_id and statut in ('termine', 'annule');
  return jsonb_build_object('ok', true);
end $$;

-- « Je confirme », sous l'annonce : le gagnant dit qu'il est là. Seulement sur l'annonce qui le nomme ; son rôle est
-- revérifié, tel que Discord l'a signé avec le clic. Rend tout le concours, pour remettre l'annonce à jour ; le message du
-- concours, qui le dit aussi, est remis à jour au réveil suivant.
create or replace function public.concours_confirmer(p_id bigint, p_annonce_id text, p_discord_id text, p_roles text[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v internal.concours;
  t internal.concours_tires;
begin
  if p_id is null or not internal.concours_numero(p_annonce_id) or not internal.concours_numero(p_discord_id) then
    return internal.error_json('invalid_request', '');
  end if;
  -- Le concours puis la ligne du gagnant, verrouillés dans cet ordre, comme le fait un remplacement : jamais un remplacé
  -- noté « confirmé ».
  select * into v from internal.concours where id = p_id for update;
  if not found then return internal.error_json('inconnu', ''); end if;
  select * into t from internal.concours_tires where concours_id = p_id and discord_id = p_discord_id and annonce_id = p_annonce_id for update;
  if not found then return internal.error_json('pas_gagnant', ''); end if;
  if t.issue = 'remplace' then return internal.error_json('remplace', ''); end if;
  if t.issue <> 'gagnant' then return internal.error_json('pas_gagnant', ''); end if;
  if v.role_id is not null and not (v.role_id = any (coalesce(p_roles, '{}'::text[]))) then
    return jsonb_build_object('ok', false, 'error', 'sans_role', 'role_id', v.role_id);
  end if;
  update internal.concours_tires set confirme_at = coalesce(confirme_at, now())
   where concours_id = p_id and discord_id = p_discord_id and issue = 'gagnant';
  if t.confirme_at is null and v.statut = 'termine' then
    update internal.concours set final_affiche = false, rendu = rendu + 1 where id = p_id;
  end if;
  return jsonb_build_object('ok', true, 'etat', case when t.confirme_at is null then 'confirme' else 'deja' end,
    'concours', internal.concours_vue(p_id));
end $$;

-- Les images de l'inventaire de la Direction que /concours propose pendant la saisie (25 au plus, dont le nom contient ce
-- qui est tapé), ou celle dont le fichier est `p_path`. Seulement celles dont le fichier est encore dans l'espace.
create or replace function public.concours_images(p_filtre text, p_path text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return jsonb_build_object('ok', true, 'images', coalesce((
    select jsonb_agg(jsonb_build_object('name', x.name, 'path', x.path) order by lower(x.name), x.id)
    from (
      select i.id, i.name, i.path
      from internal.discord_images i
      join storage.objects o on o.bucket_id = 'discord-images' and o.name = i.path
      where (p_path is null or i.path = p_path)
        and (coalesce(btrim(p_filtre), '') = '' or strpos(lower(i.name), lower(btrim(p_filtre))) > 0)
      order by lower(i.name), i.id
      limit 25
    ) x
  ), '[]'::jsonb));
end $$;

/* ---------- Le réveil, chaque minute ---------- */

-- Fait les tirages dus, puis, si un concours a besoin du robot, réveille la fonction code-discord par pg_net, une fois par
-- minute au plus. Sans adresse (aucun concours encore lancé), rien. Une panne de pg_net n'arrête rien : la minute suivante
-- réessaie.
create or replace function internal.concours_reveil() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_url text;
  v_at timestamptz;
begin
  perform internal.concours_purge();
  perform internal.concours_tirer();
  select reveil_url, reveil_at into v_url, v_at from internal.concours_reglages where id;
  if v_url is null or (v_at is not null and v_at > now() - interval '50 seconds') then return; end if;
  if not exists (
    select 1 from internal.concours c
    where internal.concours_a_faire(c) and (c.travail_at is null or c.travail_at < now() - interval '5 minutes')
  ) then
    return;
  end if;
  update internal.concours_reglages set reveil_at = now() where id;
  begin
    perform net.http_post(url := v_url, body := '{}'::jsonb, timeout_milliseconds := 30000);
  exception when others then
    null;
  end;
end $$;

/* ---------- Droits ---------- */

revoke all on function internal.concours_ligne(text, integer) from public, anon, authenticated;
revoke all on function internal.concours_bloc(text, integer) from public, anon, authenticated;
revoke all on function internal.concours_numero(text) from public, anon, authenticated;
revoke all on function internal.concours_vue(bigint) from public, anon, authenticated;
revoke all on function internal.concours_a_faire(internal.concours) from public, anon, authenticated;
revoke all on function internal.concours_purge() from public, anon, authenticated;
revoke all on function internal.concours_tirer() from public, anon, authenticated;
revoke all on function internal.concours_reveil() from public, anon, authenticated;
revoke all on function public.concours_brouillon(text, text, text, text, timestamptz, integer, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.concours_texte(bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.concours_lance(bigint, text) from public, anon, authenticated;
revoke all on function public.concours_participer(bigint, text, text[]) from public, anon, authenticated;
revoke all on function public.concours_quitter(bigint, text) from public, anon, authenticated;
revoke all on function public.concours_participants(bigint, text) from public, anon, authenticated;
revoke all on function public.concours_liste(text, text) from public, anon, authenticated;
revoke all on function public.concours_action(text, bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.concours_travail(integer, bigint) from public, anon, authenticated;
revoke all on function public.concours_choix(bigint, uuid, integer, text[], jsonb, boolean) from public, anon, authenticated;
revoke all on function public.concours_fait(bigint, uuid, integer, integer, boolean, text, text[], boolean, boolean, text) from public, anon, authenticated;
revoke all on function public.concours_affiche(bigint, integer, boolean) from public, anon, authenticated;
revoke all on function public.concours_confirmer(bigint, text, text, text[]) from public, anon, authenticated;
revoke all on function public.concours_images(text, text) from public, anon, authenticated;

-- La clé de service seule : c'est elle qu'utilise la fonction code-discord.
grant execute on function public.concours_brouillon(text, text, text, text, timestamptz, integer, text, text, text, text, text) to service_role;
grant execute on function public.concours_texte(bigint, text, text, text) to service_role;
grant execute on function public.concours_lance(bigint, text) to service_role;
grant execute on function public.concours_participer(bigint, text, text[]) to service_role;
grant execute on function public.concours_quitter(bigint, text) to service_role;
grant execute on function public.concours_participants(bigint, text) to service_role;
grant execute on function public.concours_liste(text, text) to service_role;
grant execute on function public.concours_action(text, bigint, text, text, text) to service_role;
grant execute on function public.concours_travail(integer, bigint) to service_role;
grant execute on function public.concours_choix(bigint, uuid, integer, text[], jsonb, boolean) to service_role;
grant execute on function public.concours_fait(bigint, uuid, integer, integer, boolean, text, text[], boolean, boolean, text) to service_role;
grant execute on function public.concours_affiche(bigint, integer, boolean) to service_role;
grant execute on function public.concours_confirmer(bigint, text, text, text[]) to service_role;
grant execute on function public.concours_images(text, text) to service_role;

/* ---------- Le réveil planifié ---------- */

-- La tâche porte un nom : la planifier de nouveau la remplace. pg_cron est déjà activé (connexion par code).
select cron.schedule('gal-concours', '* * * * *', 'select internal.concours_reveil()');

-- Les nouvelles fonctions : l'API relit la description des fonctions.
notify pgrst, 'reload schema';
