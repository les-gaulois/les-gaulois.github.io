/**
 * Vérifie un vrai projet Supabase de l'extérieur, comme le ferait un visiteur :
 * la connexion Discord est-elle active, le schéma est-il installé, les portes sont-elles fermées ?
 * Lancé par scripts/verifier-mise-en-ligne.ts. N'écrit rien et n'affiche jamais une clé.
 */
export interface PreflightOptions {
  url: string;
  publishableKey: string;
  secretKey?: string | undefined;
  fetcher?: typeof fetch;
}

export interface Check {
  label: string;
  /** `warn` : à regarder, sans empêcher la mise en ligne. */
  status: "ok" | "fail" | "warn";
  detail?: string;
}

/** Une route fermée à un visiteur peut répondre 401, 403 ou 404 selon la version de Supabase. */
const isClosed = (status: number) => status >= 400 && status < 500;

export async function runPreflight({ url, publishableKey, secretKey, fetcher = fetch }: PreflightOptions): Promise<Check[]> {
  const base = url.replace(/\/$/, "");
  const checks: Check[] = [];
  const add = (label: string, status: Check["status"], detail?: string) => checks.push(detail === undefined ? { label, status } : { label, status, detail });

  if (publishableKey.startsWith("sb_secret_")) {
    add("La clé publique n'est pas une clé secrète", "fail", "SUPABASE_PUBLISHABLE_KEY contient une clé secrète. Elle partirait dans le navigateur de chaque visiteur : remplacez-la, et régénérez cette clé dans Supabase.");
    return checks;
  }

  const anonHeaders = { apikey: publishableKey, "Content-Type": "application/json" };
  const rpc = (fn: string, body: Record<string, unknown> = {}) => fetcher(`${base}/rest/v1/rpc/${fn}`, { method: "POST", headers: anonHeaders, body: JSON.stringify(body) });

  let settings: { external?: Record<string, boolean> };
  try {
    const res = await fetcher(`${base}/auth/v1/settings`, { headers: { apikey: publishableKey } });
    if (!res.ok) {
      add("Le projet répond", "fail", `Réponse ${res.status}. Vérifiez SUPABASE_URL et la clé publique.`);
      return checks;
    }
    settings = (await res.json()) as typeof settings;
    add("Le projet répond", "ok");
  } catch {
    add("Le projet répond", "fail", "Aucune réponse. Vérifiez SUPABASE_URL. Un projet gratuit se met aussi en pause après une semaine sans activité.");
    return checks;
  }

  if (settings.external?.["discord"]) add("La connexion Discord est activée", "ok");
  else add("La connexion Discord est activée", "fail", "Authentication → Providers → Discord : activez-la, avec le Client ID et le Client Secret.");

  if (settings.external?.["email"]) add("L'inscription par e-mail est coupée", "warn", "Authentication → Providers → Email : désactivez-la. Le site ne s'en sert pas : ces comptes ne peuvent rien demander, mais ils encombrent la base.");
  else add("L'inscription par e-mail est coupée", "ok");

  const news = await rpc("get_site_news");
  if (news.ok) add("Le schéma est installé", "ok");
  else add("Le schéma est installé", "fail", `get_site_news répond ${news.status}. Installez les migrations de supabase/migrations, dans l'ordre.`);

  // Le Gaulois de la semaine : get_site_news donne la case, même vide, dès que sa migration est installée.
  const newsAnswer = news.ok ? ((await news.json().catch(() => null)) as Record<string, unknown> | null) : null;
  if (newsAnswer !== null && Object.hasOwn(newsAnswer, "weekly_pick")) add("Le Gaulois de la semaine est installé", "ok");
  else if (news.ok) add("Le Gaulois de la semaine est installé", "fail", "get_site_news ne donne pas weekly_pick : installez la migration 20261109000200_gaulois_de_la_semaine.sql avant de mettre le site en ligne.");

  const pick = await rpc("save_weekly_pick", { p_player: "verification", p_note: null });
  const pickAnswer = pick.ok ? ((await pick.json().catch(() => null)) as { ok?: boolean } | null) : null;
  if (isClosed(pick.status) || (pick.ok && pickAnswer?.ok === false)) add("Un visiteur ne choisit pas le Gaulois de la semaine", "ok");
  else add("Un visiteur ne choisit pas le Gaulois de la semaine", "fail", `Réponse ${pick.status}. Ne mettez pas en ligne : seul l'encadrement choisit.`);

  // Les visages du site : les photos Discord de ceux qui se montrent, réservées aux membres validés.
  const faces = await rpc("get_member_faces");
  const facesAnswer = faces.ok ? ((await faces.json().catch(() => null)) as { ok?: boolean } | null) : null;
  if (isClosed(faces.status) || (faces.ok && facesAnswer?.ok === false)) add("Un visiteur ne reçoit pas les photos des membres", "ok");
  else add("Un visiteur ne reçoit pas les photos des membres", "fail", `Réponse ${faces.status}. Ne mettez pas en ligne : les photos ne vont qu'aux membres validés.`);

  const bootstrap = await rpc("bootstrap_founder", { p_discord_id: "verification" });
  if (isClosed(bootstrap.status)) add("Un visiteur ne peut pas se désigner fondateur", "ok");
  else add("Un visiteur ne peut pas se désigner fondateur", "fail", `Réponse ${bootstrap.status}. Le fichier …_droits.sql n'a sans doute pas été installé : ne mettez pas en ligne.`);

  // La sauvegarde ne s'exporte qu'avec la clé de service, depuis l'Action : un visiteur n'y a pas accès.
  const exported = await rpc("export_site");
  if (isClosed(exported.status)) add("Un visiteur ne peut pas exporter les données du site", "ok");
  else add("Un visiteur ne peut pas exporter les données du site", "fail", `Réponse ${exported.status}. Ne mettez pas en ligne : retirez le droit d'appeler export_site.`);

  // Le QG est la face privée du site : sans compte validé, le serveur refuse, par son droit d'appel ou par la fonction elle-même.
  const qg = await rpc("get_qg");
  const qgAnswer = qg.ok ? ((await qg.json()) as { ok?: boolean } | null) : null;
  if (isClosed(qg.status) || (qg.ok && qgAnswer?.ok === false)) add("Un visiteur n'entre pas dans le QG", "ok");
  else add("Un visiteur n'entre pas dans le QG", "fail", `Réponse ${qg.status}. Ne mettez pas en ligne : le QG ne doit s'ouvrir qu'à un membre validé.`);

  // Les appels aux salons du QG : lus et lancés par les seuls membres validés. Leur installation se lit avec `supabase migration list`.
  const calls = await rpc("get_lobby_calls");
  const callsAnswer = calls.ok ? ((await calls.json().catch(() => null)) as { ok?: boolean } | null) : null;
  if (isClosed(calls.status) || (calls.ok && callsAnswer?.ok === false)) add("Un visiteur ne voit pas les appels aux salons", "ok");
  else add("Un visiteur ne voit pas les appels aux salons", "fail", `Réponse ${calls.status}. Ne mettez pas en ligne : les appels ne vont qu'aux membres validés.`);

  const callSaved = await rpc("save_lobby_call", { p_game: "verification", p_format: "trios" });
  const callSavedAnswer = callSaved.ok ? ((await callSaved.json().catch(() => null)) as { ok?: boolean } | null) : null;
  if (isClosed(callSaved.status) || (callSaved.ok && callSavedAnswer?.ok === false)) add("Un visiteur ne lance pas d'appel", "ok");
  else add("Un visiteur ne lance pas d'appel", "fail", `Réponse ${callSaved.status}. Ne mettez pas en ligne : seuls les membres validés appellent.`);

  // Les appels sur Discord : le réglage contient le lien qui écrit dans le salon. Seuls les admins et le fondateur le règlent.
  const discordState = await rpc("get_discord_calls");
  const discordStateAnswer = discordState.ok ? ((await discordState.json().catch(() => null)) as { ok?: boolean } | null) : null;
  if (isClosed(discordState.status) || (discordState.ok && discordStateAnswer?.ok === false)) add("Un visiteur ne lit pas le réglage Discord des appels", "ok");
  else add("Un visiteur ne lit pas le réglage Discord des appels", "fail", `Réponse ${discordState.status}. Ne mettez pas en ligne : seuls les admins et le fondateur lisent ce réglage.`);

  const discordSaved = await rpc("save_discord_calls", { p_webhook: "verification", p_role: null });
  const discordSavedAnswer = discordSaved.ok ? ((await discordSaved.json().catch(() => null)) as { ok?: boolean } | null) : null;
  if (isClosed(discordSaved.status) || (discordSaved.ok && discordSavedAnswer?.ok === false)) add("Un visiteur ne règle pas les appels sur Discord", "ok");
  else add("Un visiteur ne règle pas les appels sur Discord", "fail", `Réponse ${discordSaved.status}. Ne mettez pas en ligne : seuls les admins et le fondateur règlent l'envoi.`);

  // Le bouton « Ping sur Discord » du QG : seul un membre validé, pour son propre appel.
  const pinged = await rpc("ping_lobby_call");
  const pingedAnswer = pinged.ok ? ((await pinged.json().catch(() => null)) as { ok?: boolean } | null) : null;
  if (isClosed(pinged.status) || (pinged.ok && pingedAnswer?.ok === false)) add("Un visiteur ne fait pas de ping sur Discord", "ok");
  else add("Un visiteur ne fait pas de ping sur Discord", "fail", `Réponse ${pinged.status}. Ne mettez pas en ligne : seuls les membres validés font un ping.`);

  // Les salons du robot : leur réglage contient les liens qui écrivent dans les salons. Seuls les admins et le fondateur
  // le règlent, et seule la clé de service, celle du robot, reçoit les liens. Leur installation se lit avec `supabase migration list`.
  const salonsState = await rpc("get_discord_salons");
  const salonsStateAnswer = salonsState.ok ? ((await salonsState.json().catch(() => null)) as { ok?: boolean } | null) : null;
  if (isClosed(salonsState.status) || (salonsState.ok && salonsStateAnswer?.ok === false)) add("Un visiteur ne lit pas le réglage des salons du robot", "ok");
  else add("Un visiteur ne lit pas le réglage des salons du robot", "fail", `Réponse ${salonsState.status}. Ne mettez pas en ligne : seuls les admins et le fondateur lisent ce réglage.`);

  const salonSaved = await rpc("save_discord_salon", { p_salon: "nouvelles", p_webhook: "verification" });
  const salonSavedAnswer = salonSaved.ok ? ((await salonSaved.json().catch(() => null)) as { ok?: boolean } | null) : null;
  if (isClosed(salonSaved.status) || (salonSaved.ok && salonSavedAnswer?.ok === false)) add("Un visiteur ne règle pas les salons du robot", "ok");
  else add("Un visiteur ne règle pas les salons du robot", "fail", `Réponse ${salonSaved.status}. Ne mettez pas en ligne : seuls les admins et le fondateur règlent les salons.`);

  // Ces deux-là ne s'ouvrent qu'à la clé de service : un visiteur doit être refusé par le droit d'appel lui-même.
  const robotLinks = await rpc("robot_discord_salons");
  if (isClosed(robotLinks.status)) add("Un visiteur ne reçoit pas les liens des salons du robot", "ok");
  else add("Un visiteur ne reçoit pas les liens des salons du robot", "fail", `Réponse ${robotLinks.status}. Ne mettez pas en ligne : retirez le droit d'appeler robot_discord_salons.`);

  // Un salon qui n'existe pas : même si le droit était mal posé, la fonction refuserait sans rien écrire.
  const robotNote = await rpc("note_discord_salon", { p_salon: "verification", p_source: "none", p_status: null, p_name: null });
  if (isClosed(robotNote.status)) add("Un visiteur ne note pas de contrôle des salons", "ok");
  else add("Un visiteur ne note pas de contrôle des salons", "fail", `Réponse ${robotNote.status}. Ne mettez pas en ligne : retirez le droit d'appeler note_discord_salon.`);

  // « Refaire la demande » : seul un admin remet un compte en attente. Son installation se lit avec `supabase migration list`.
  const reset = await rpc("reset_member_link", { p_user: "00000000-0000-0000-0000-000000000000" });
  const resetAnswer = reset.ok ? ((await reset.json().catch(() => null)) as { ok?: boolean } | null) : null;
  if (isClosed(reset.status) || (reset.ok && resetAnswer?.ok === false)) add("Un visiteur ne remet pas un compte en attente", "ok");
  else add("Un visiteur ne remet pas un compte en attente", "fail", `Réponse ${reset.status}. Ne mettez pas en ligne : seul un admin remet un compte en attente.`);

  // Les outils du QG : lus par les seuls membres validés ; l'objectif de la semaine se fixe par l'encadrement, le salon vocal
  // par les admins et le fondateur. Les valeurs envoyées sont refusées par la fonction elle-même : même si le droit d'appel
  // était mal posé, rien ne serait écrit. Leur installation se lit avec `supabase migration list`.
  const refused = async (res: Response) => isClosed(res.status) || (res.ok && ((await res.json().catch(() => null)) as { ok?: boolean } | null)?.ok === false);
  const tools = await rpc("get_qg_tools");
  if (await refused(tools)) add("Un visiteur ne lit pas les outils du QG", "ok");
  else add("Un visiteur ne lit pas les outils du QG", "fail", `Réponse ${tools.status}. Ne mettez pas en ligne : les outils du QG ne vont qu'aux membres validés.`);
  const goal = await rpc("save_weekly_goal", { p_kind: "verification", p_wins: null, p_clan: null });
  if (await refused(goal)) add("Un visiteur ne fixe pas l'objectif de la semaine", "ok");
  else add("Un visiteur ne fixe pas l'objectif de la semaine", "fail", `Réponse ${goal.status}. Ne mettez pas en ligne : seul l'encadrement fixe l'objectif.`);
  const voice = await rpc("save_voice_channel", { p_url: "verification" });
  if (await refused(voice)) add("Un visiteur ne règle pas le salon vocal", "ok");
  else add("Un visiteur ne règle pas le salon vocal", "fail", `Réponse ${voice.status}. Ne mettez pas en ligne : seuls les admins et le fondateur règlent le salon vocal.`);
  const guess = await rpc("save_prediction", { p_wins: -1 });
  if (await refused(guess)) add("Un visiteur ne fait pas de pronostic", "ok");
  else add("Un visiteur ne fait pas de pronostic", "fail", `Réponse ${guess.status}. Ne mettez pas en ligne : seuls les membres validés font un pronostic.`);

  // Les messages Discord de la Direction : seuls les admins et le fondateur les lisent, les envoient et règlent leurs
  // salons. Le salon et le lien donnés n'existent pas : même si le droit d'appel était mal posé, rien ne partirait.
  // Leur installation se lit avec `supabase migration list`.
  const messages = await rpc("get_discord_messages");
  if (await refused(messages)) add("Un visiteur ne lit pas les messages Discord", "ok");
  else add("Un visiteur ne lit pas les messages Discord", "fail", `Réponse ${messages.status}. Ne mettez pas en ligne : seuls les admins et le fondateur lisent les messages.`);
  const message = await rpc("send_discord_message", { p_salon: "verification", p_message: {} });
  if (await refused(message)) add("Un visiteur n'envoie pas de message Discord", "ok");
  else add("Un visiteur n'envoie pas de message Discord", "fail", `Réponse ${message.status}. Ne mettez pas en ligne : seuls les admins et le fondateur envoient un message.`);
  const messageSalon = await rpc("add_discord_message_salon", { p_name: "verification", p_webhook: "verification" });
  if (await refused(messageSalon)) add("Un visiteur n'ajoute pas de salon pour les messages", "ok");
  else add("Un visiteur n'ajoute pas de salon pour les messages", "fail", `Réponse ${messageSalon.status}. Ne mettez pas en ligne : seuls les admins et le fondateur ajoutent un salon.`);
  // Les images des messages : chacune se lit à son adresse, mais un visiteur ne doit pas pouvoir en dresser la liste.
  const imageList = await fetcher(`${base}/storage/v1/object/list/discord-images`, { method: "POST", headers: anonHeaders, body: JSON.stringify({ prefix: "", limit: 1 }) });
  const listed = imageList.ok ? ((await imageList.json().catch(() => null)) as unknown) : null;
  if (isClosed(imageList.status) || (imageList.ok && Array.isArray(listed) && listed.length === 0)) add("Un visiteur ne liste pas les images des messages Discord", "ok");
  else add("Un visiteur ne liste pas les images des messages Discord", "fail", `Réponse ${imageList.status}. Ne mettez pas en ligne : la règle de lecture de l'espace discord-images est trop ouverte.`);

  // Les réponses « Je viens », les votes, les idées et leurs soutiens sont dans le schéma `internal`, que l'API ne montre pas : rien à lire ici.
  for (const table of ["profiles", "private_links", "admin_log", "clan_roster", "site_announcements", "polls"]) {
    const res = await fetcher(`${base}/rest/v1/${table}?select=*&limit=1`, { headers: anonHeaders });
    const rows = res.ok ? ((await res.json()) as unknown[]) : [];
    if (isClosed(res.status) || (res.ok && rows.length === 0)) add(`Un visiteur ne lit pas la table ${table}`, "ok");
    else add(`Un visiteur ne lit pas la table ${table}`, "fail", `Réponse ${res.status}, ${rows.length} ligne(s) lue(s). Ne mettez pas en ligne.`);
  }

  if (!secretKey) {
    add("Fondateur et liste des membres", "warn", "Non vérifiés : donnez aussi SUPABASE_SECRET_KEY pour les contrôler.");
    return checks;
  }

  const secretHeaders = { apikey: secretKey, "Content-Type": "application/json" };
  const founders = await fetcher(`${base}/rest/v1/profiles?select=gaul_number&role=eq.founder`, { headers: secretHeaders });
  const founderRows = founders.ok ? ((await founders.json()) as unknown[]) : null;
  if (founderRows === null) add("Le clan a un fondateur", "fail", `Lecture refusée (${founders.status}). Vérifiez SUPABASE_SECRET_KEY.`);
  else if (founderRows.length === 0) add("Le clan a un fondateur", "warn", "Pas encore : connectez-vous une fois sur le site, puis lancez bootstrap_founder (docs/DIRECTION.md, étape 4).");
  else add("Le clan a un fondateur", "ok");

  // L'espace des images des messages Discord : public, 8 Mo au plus, images seulement (migration 20261111000600).
  const bucket = await fetcher(`${base}/storage/v1/bucket/discord-images`, { headers: { ...secretHeaders, Authorization: `Bearer ${secretKey}` } });
  const bucketAnswer = bucket.ok ? ((await bucket.json().catch(() => null)) as { public?: unknown; file_size_limit?: unknown } | null) : null;
  if (bucketAnswer?.public === true && bucketAnswer.file_size_limit === 8 * 1024 * 1024) add("L'espace des images des messages Discord est en place", "ok");
  else if (bucket.status === 404 || bucket.status === 400) add("L'espace des images des messages Discord est en place", "warn", "Pas encore : la migration 20261111000600_messages_discord.sql n'est pas installée.");
  else add("L'espace des images des messages Discord est en place", "fail", `Réponse ${bucket.status}. L'espace discord-images doit être public et limité à 8 Mo.`);

  const roster = await fetcher(`${base}/rest/v1/app_state?select=value&key=eq.roster`, { headers: secretHeaders });
  const rosterRows = roster.ok ? ((await roster.json()) as unknown[]) : [];
  if (rosterRows.length > 0) add("La liste des membres a été relue", "ok");
  else add("La liste des membres a été relue", "warn", "Pas encore : lancez l'Action « Données et site » dans GitHub.");

  return checks;
}
