/**
 * Vérifie un vrai projet Supabase de l'extérieur, comme le ferait un visiteur :
 * la connexion Discord est-elle active, le schéma est-il installé, les portes sont-elles fermées ?
 * Lancé par scripts/verifier-mise-en-ligne.ts. N'écrit rien et n'affiche jamais une clé.
 */
import { CODE_LOGIN_OPEN } from "./connexion-code";

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

  // L'activité du site : un visiteur compte sa page (`note_site_visit`, que ce contrôle n'appelle pas : il n'écrit rien),
  // mais seuls les officiers et au-dessus lisent les totaux.
  // Une fonction absente répond 404 : la migration n'est pas collée, et chaque page du site recevrait un refus.
  const activity = await rpc("get_site_activity");
  const activityAnswer = activity.ok ? ((await activity.json().catch(() => null)) as { ok?: boolean } | null) : null;
  if (activity.status === 404) add("Le compte des visites est installé", "warn", "get_site_activity est absente : collez la migration 20261113001500_activite_du_site.sql avant de mettre le site en ligne.");
  else if (isClosed(activity.status) || (activity.ok && activityAnswer?.ok === false)) add("Un visiteur ne lit pas l'activité du site", "ok");
  else add("Un visiteur ne lit pas l'activité du site", "fail", `Réponse ${activity.status}. Ne mettez pas en ligne : seuls les officiers et au-dessus lisent les visites.`);

  // Le vestiaire du village : seul un compte connecté lit ou enregistre son Gaulois. Une fonction absente répond 404 : la
  // migration n'est pas collée, et le vestiaire dirait à chaque compte connecté que le serveur ne répond pas.
  const gaulois = await rpc("get_mon_gaulois");
  const gauloisAnswer = gaulois.ok ? ((await gaulois.json().catch(() => null)) as { ok?: boolean } | null) : null;
  if (gaulois.status === 404) add("Le vestiaire du village est installé", "warn", "get_mon_gaulois est absente : collez la migration 20261113001700_village_des_gaulois_vestiaire.sql avant de mettre le site en ligne.");
  else if (isClosed(gaulois.status) || (gaulois.ok && gauloisAnswer?.ok === false)) add("Un visiteur ne lit pas de Gaulois", "ok");
  else add("Un visiteur ne lit pas de Gaulois", "fail", `Réponse ${gaulois.status}. Ne mettez pas en ligne : seul un compte connecté lit son Gaulois.`);

  // Les statères du village (migration 20261113001800), donnés pour les points rapportés au clan : seul un compte connecté
  // lit son solde. Absente : 404, la migration n'est pas collée.
  const stateres = await rpc("get_mes_stateres");
  const stateresAnswer = stateres.ok ? ((await stateres.json().catch(() => null)) as { ok?: boolean } | null) : null;
  if (stateres.status === 404) add("Les statères du village sont installés", "warn", "get_mes_stateres est absente : collez la migration 20261113001800_village_stateres.sql avant de mettre en ligne ce qui s'en sert.");
  else if (isClosed(stateres.status) || (stateres.ok && stateresAnswer?.ok === false)) add("Un visiteur ne lit pas de solde de statères", "ok");
  else add("Un visiteur ne lit pas de solde de statères", "fail", `Réponse ${stateres.status}. Ne mettez pas en ligne : seul un compte connecté lit son propre solde.`);
  // Ses deux fonctions de la clé de service, celle du workflow des victoires : un visiteur doit être refusé par le droit
  // d'appel lui-même, même si la fonction refuse aussi. Les valeurs données ne notent rien : une partie mal formée fait
  // refuser l'envoi entier, et aucune partie ne commence en 2100.
  const stateresCalls = [
    ["noter_victoires_stateres", { p_parties: [{ partie: "verification" }] }, "Un visiteur ne donne pas de statères"],
    ["stateres_parties_notees", { p_depuis: "2100-01-01T00:00:00Z" }, "Un visiteur ne lit pas les parties notées pour les statères"],
  ] as const;
  for (const [fn, body, label] of stateresCalls) {
    const res = await rpc(fn, body);
    if (isClosed(res.status)) add(label, "ok");
    else add(label, "fail", `Réponse ${res.status}. Ne mettez pas en ligne : retirez le droit d'appeler ${fn}.`);
  }

  // La boutique du village (migration 20261113001900) : seul un compte connecté lit sa boutique ; seul un compte validé avec
  // son Gaulois achète ou ouvre une pochette. Absente : 404, la migration n'est pas collée. L'objet demandé n'existe pas, et un
  // visiteur n'a pas de statères : même si le droit d'appel était mal posé, rien ne serait débité.
  const shop = await rpc("get_ma_boutique");
  const shopAnswer = shop.ok ? ((await shop.json().catch(() => null)) as { ok?: boolean } | null) : null;
  if (shop.status === 404) add("La boutique du village est installée", "warn", "get_ma_boutique est absente : collez la migration 20261113001900_village_boutique.sql avant de mettre en ligne ce qui s'en sert.");
  else if (isClosed(shop.status) || (shop.ok && shopAnswer?.ok === false)) add("Un visiteur ne lit pas de boutique", "ok");
  else add("Un visiteur ne lit pas de boutique", "fail", `Réponse ${shop.status}. Ne mettez pas en ligne : seul un compte connecté lit sa boutique et son solde.`);
  const shopCalls = [
    ["acheter_objet", { p_emplacement: "tete", p_objet: "verification" }, "Un visiteur n'achète pas d'objet"],
    ["ouvrir_pochette", {}, "Un visiteur n'ouvre pas de pochette surprise"],
  ] as const;
  for (const [fn, body, label] of shopCalls) {
    const res = await rpc(fn, body);
    const answer = res.ok ? ((await res.json().catch(() => null)) as { ok?: boolean } | null) : null;
    if (isClosed(res.status) || (res.ok && answer?.ok === false)) add(label, "ok");
    else add(label, "fail", `Réponse ${res.status}. Ne mettez pas en ligne : seul un compte validé avec son Gaulois achète.`);
  }

  // L'onglet « Village » de la Direction (migration 20261113002100) : seuls les officiers et au-dessus lisent l'économie du
  // village, seuls les admins et le fondateur règlent les prix et les chances. Absente : 404, la migration n'est pas collée.
  // Les valeurs envoyées sont refusées par la fonction elle-même (un prix de 0, des chances qui ne font pas 100) : même si
  // le droit d'appel était mal posé, rien ne serait écrit.
  const economie = await rpc("get_village_economie");
  const economieAnswer = economie.ok ? ((await economie.json().catch(() => null)) as { ok?: boolean } | null) : null;
  if (economie.status === 404) add("L'onglet Village de la Direction est installé", "warn", "get_village_economie est absente : collez la migration 20261113002100_village_direction.sql avant de mettre en ligne l'onglet Village.");
  else if (isClosed(economie.status) || (economie.ok && economieAnswer?.ok === false)) add("Un visiteur ne lit pas l'économie du village", "ok");
  else add("Un visiteur ne lit pas l'économie du village", "fail", `Réponse ${economie.status}. Ne mettez pas en ligne : seuls les officiers et au-dessus lisent l'économie du village.`);
  const villageCalls = [
    ["regler_village_prix", { p_prix: { commun: 0 } }, "Un visiteur ne règle pas les prix du village"],
    ["regler_village_pochette", { p_prix: 0, p_chances: {} }, "Un visiteur ne règle pas la pochette surprise"],
  ] as const;
  for (const [fn, body, label] of villageCalls) {
    const res = await rpc(fn, body);
    const answer = res.ok ? ((await res.json().catch(() => null)) as { ok?: boolean } | null) : null;
    if (isClosed(res.status) || (res.ok && answer?.ok === false)) add(label, "ok");
    else add(label, "fail", `Réponse ${res.status}. Ne mettez pas en ligne : seuls les admins et le fondateur règlent les prix et les chances.`);
  }

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
  // L'inventaire d'images des messages (migration 20261112000200) : seuls les admins et le fondateur le lisent et y
  // gardent une image. Le fichier donné n'existe pas : même si le droit d'appel était mal posé, rien ne serait écrit.
  const inventory = await rpc("get_discord_images");
  if (await refused(inventory)) add("Un visiteur ne lit pas l'inventaire d'images", "ok");
  else add("Un visiteur ne lit pas l'inventaire d'images", "fail", `Réponse ${inventory.status}. Ne mettez pas en ligne : seuls les admins et le fondateur lisent l'inventaire.`);
  const kept = await rpc("save_discord_image", { p_path: "verification", p_name: "verification" });
  if (await refused(kept)) add("Un visiteur ne garde pas d'image dans l'inventaire", "ok");
  else add("Un visiteur ne garde pas d'image dans l'inventaire", "fail", `Réponse ${kept.status}. Ne mettez pas en ligne : seuls les admins et le fondateur gardent une image.`);
  // La carte de l'alliance (migration 20261113000400) : réservée aux Gaulois validés et aux alliés invités ; un visiteur n'en
  // lit rien, n'accepte aucune invitation et ne dessine aucune zone. Les valeurs données ne sont celles d'aucune invitation
  // ni d'aucune zone : même si le droit d'appel était mal posé, rien ne serait écrit.
  const allianceCalls = [
    ["get_alliance_map", {}, "Un visiteur ne lit pas la carte de l'alliance"],
    ["accept_alliance_invite", { p_token: "0".repeat(32), p_alias: "verification" }, "Un visiteur n'accepte pas d'invitation à la carte de l'alliance"],
    ["save_alliance_zone", { p_id: null, p_title: "verification", p_tag: null, p_x: 0, p_y: 0, p_w: 1, p_h: 1, p_mask: "AQ==" }, "Un visiteur ne dessine pas de zone de l'alliance"],
    // Depuis la migration 20261113000700, un allié supprime les zones de son clan : un visiteur, aucune. Le numéro 0 n'est celui d'aucune zone.
    ["delete_alliance_zone", { p_id: 0 }, "Un visiteur ne supprime pas de zone de l'alliance"],
    // L'accord de l'encadrement (migration 20261113000500) : le numéro 0 n'est celui d'aucun compte.
    ["approve_alliance_ally", { p_number: 0, p_approve: true }, "Un visiteur n'accepte pas de joueur allié"],
    ["list_alliance_allies", {}, "Un visiteur ne lit pas la liste des joueurs alliés"],
    // L'état et l'ordre des zones, le message épinglé (migration 20261113001000) : l'encadrement seul. Aucune zone ni aucun
    // message n'a le numéro 0, et une liste vide n'est pas un ordre valable : rien ne serait écrit.
    ["set_alliance_zone_state", { p_id: 0, p_state: "tenue" }, "Un visiteur ne change pas l'état d'une zone de l'alliance"],
    ["order_alliance_zones", { p_ids: [] }, "Un visiteur ne range pas les zones de l'alliance"],
    ["pin_alliance_message", { p_id: 0 }, "Un visiteur n'épingle pas de message de l'alliance"],
    // L'accord des zones des alliés (migration 20261113001100) : aucune zone n'a le numéro 0.
    ["review_alliance_zone", { p_id: 0, p_approve: false, p_seen: "2026-01-01T00:00:00Z" }, "Un visiteur n'accepte ni ne refuse de zone de l'alliance"],
  ] as const;
  for (const [fn, body, label] of allianceCalls) {
    const res = await rpc(fn, body);
    if (await refused(res)) add(label, "ok");
    else add(label, "fail", `Réponse ${res.status}. Ne mettez pas en ligne : la carte de l'alliance ne s'ouvre qu'aux Gaulois validés et aux alliés invités.`);
  }
  // Les images des messages : chacune se lit à son adresse, mais un visiteur ne doit pas pouvoir en dresser la liste.
  const imageList = await fetcher(`${base}/storage/v1/object/list/discord-images`, { method: "POST", headers: anonHeaders, body: JSON.stringify({ prefix: "", limit: 1 }) });
  const listed = imageList.ok ? ((await imageList.json().catch(() => null)) as unknown) : null;
  if (isClosed(imageList.status) || (imageList.ok && Array.isArray(listed) && listed.length === 0)) add("Un visiteur ne liste pas les images des messages Discord", "ok");
  else add("Un visiteur ne liste pas les images des messages Discord", "fail", `Réponse ${imageList.status}. Ne mettez pas en ligne : la règle de lecture de l'espace discord-images est trop ouverte.`);

  // La connexion par code (migration 20261112000500) : ses trois fonctions ne s'ouvrent qu'à la clé de service, celle de la
  // fonction code-discord. Les valeurs données ne sont celles d'aucun code ni d'aucun compte. Leur installation se lit avec
  // `supabase migration list`.
  const codeCalls = [
    ["discord_code_issue", { p_code_hash: "0".repeat(64), p_discord_id: "000000000000000000", p_discord_name: "verification", p_interaction_id: "000000000000000000" }, "Un visiteur ne crée pas de code de connexion"],
    ["discord_code_redeem", { p_code_hash: "0".repeat(64) }, "Un visiteur n'essaie pas de code de connexion"],
    ["discord_code_attach", { p_user: "00000000-0000-0000-0000-000000000000", p_discord_id: "000000000000000000", p_discord_name: "verification" }, "Un visiteur ne donne pas d'identifiant Discord à un compte"],
    // La commande /moi (migration 20261112000700) : relie un identifiant Discord, que tout le serveur voit, à un pseudo.
    ["discord_moi", { p_discord_id: "000000000000000000" }, "Un visiteur ne retrouve pas le pseudo d'un compte Discord"],
    // La commande /gaulois (migration 20261113001700) : relie un identifiant Discord à la tenue d'un compte.
    ["discord_gaulois", { p_discord_id: "000000000000000000" }, "Un visiteur ne retrouve pas le Gaulois d'un compte Discord"],
    // Les concours (migration 20261112000800) : réservés à la fonction code-discord, qui reçoit les clics signés par Discord.
    ["concours_participer", { p_id: 0, p_discord_id: "000000000000000000", p_roles: [] }, "Un visiteur ne participe pas à un concours à la place d'un membre"],
    ["concours_travail", { p_limite: 1, p_id: 0 }, "Un visiteur ne commande pas le robot des concours"],
  ] as const;
  for (const [fn, body, label] of codeCalls) {
    const res = await rpc(fn, body);
    if (isClosed(res.status)) add(label, "ok");
    else add(label, "fail", `Réponse ${res.status}. Ne mettez pas en ligne : retirez le droit d'appeler ${fn}.`);
  }

  // La fonction serveur code-discord : ses réglages, et un moteur qui sait vérifier les signatures de Discord. À regarder
  // tant que la connexion par code n'est pas ouverte ; bloquant une fois ouverte.
  const codeLabel = "La connexion par code est en place";
  const notReady = CODE_LOGIN_OPEN ? "fail" : "warn";
  try {
    const etat = await fetcher(`${base}/functions/v1/code-discord/etat`);
    const answer = etat.ok ? ((await etat.json().catch(() => null)) as { discord?: unknown; service?: unknown; signature?: unknown; robot?: unknown; concours?: unknown; inscription?: unknown } | null) : null;
    if (!answer) add(codeLabel, notReady, `La fonction code-discord répond ${etat.status} : elle n'est pas encore déployée. Voir docs/DIRECTION.md, « Se connecter avec un code ».`);
    else if (answer.discord === true && answer.service === true && answer.signature === true) add(codeLabel, "ok");
    else {
      const missing = [
        answer.discord === true ? null : "il lui manque le serveur du clan ou la clé publique de l'application",
        answer.service === true ? null : "la base ne lui répond pas : migration 20261112000500 absente, ou clé de service refusée",
        answer.signature === true ? null : "son moteur ne sait pas vérifier les signatures de Discord",
      ].filter((reason) => reason !== null);
      add(codeLabel, notReady, `La fonction répond, mais ${missing.join(", ")}.`);
    }
    // Le panneau des rôles, les tickets et les concours (docs/DIRECTION.md) : le jeton de « Le Gaulois », que Discord doit accepter. À
    // regarder, jamais bloquant.
    if (answer) {
      if (answer.robot === true) add("Le robot a son jeton, pour les rôles, les tickets et les concours", "ok");
      else add("Le robot a son jeton, pour les rôles, les tickets et les concours", "warn", "Discord n'accepte aucun jeton de « Le Gaulois » pour le robot (secret LE_GAULOIS_BOT_TOKEN de la fonction, absent, périmé ou d'un autre robot) : ni les boutons des rôles, ni les tickets, ni les concours ne marchent. Voir docs/DIRECTION.md, « Les rôles sur Discord » et « Les tickets d'assistance ».");
      // Les concours : leur migration, que la fonction appelle. À regarder, jamais bloquant.
      if (answer.concours === true) add("Les concours ont leur base", "ok");
      else add("Les concours ont leur base", "warn", "La fonction code-discord ne trouve pas les fonctions des concours : migration 20261112000800 absente. Voir docs/DIRECTION.md, « Les concours sur Discord ».");
      // Les commandes du serveur Discord, que la fonction met à jour elle-même (docs/DIRECTION.md, « Les commandes Discord se
      // créent seules ») : une définition refusée par Discord ne se verrait sinon que dans ses journaux. À regarder, jamais bloquant.
      const commandsLabel = "Les commandes du serveur Discord sont celles du code";
      if (answer.inscription === true) add(commandsLabel, "ok");
      else if (answer.inscription === undefined) add(commandsLabel, "warn", "La fonction en ligne ne met pas encore ses commandes à jour elle-même : la remettre en ligne depuis un dossier du projet à jour.");
      else add(commandsLabel, "warn", "La fonction n'a pas pu mettre ses commandes à jour sur Discord (jeton absent ou refusé, refus de Discord, ou commande gardée autrement que dans le code) : rouvrir /etat cinq minutes plus tard, puis voir docs/DIRECTION.md, « Les commandes Discord se créent seules ».");
    }
  } catch {
    add(codeLabel, notReady, "La fonction code-discord ne répond pas.");
  }

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

  // Les statères : le workflow des victoires, avec cette clé, doit pouvoir lire les parties notées. Lecture seule : aucune
  // partie ne commence en 2100, la réponse est vide. À regarder, jamais bloquant : sans elle, seuls les statères attendent.
  const stateresLabel = "Le workflow peut noter les parties pour les statères";
  const notees = await fetcher(`${base}/rest/v1/rpc/stateres_parties_notees`, { method: "POST", headers: secretHeaders, body: JSON.stringify({ p_depuis: "2100-01-01T00:00:00Z" }) });
  const noteesAnswer = notees.ok ? ((await notees.json().catch(() => null)) as { ok?: unknown; parties?: unknown } | null) : null;
  if (noteesAnswer?.ok === true && Array.isArray(noteesAnswer.parties)) add(stateresLabel, "ok");
  else if (notees.status === 404) add(stateresLabel, "warn", "stateres_parties_notees est absente : collez la migration 20261113001800_village_stateres.sql. D'ici là, l'étape « Donner les statères des points rapportés au clan » échoue sans rien bloquer.");
  else add(stateresLabel, "warn", `Réponse ${notees.status}. La clé de service n'a pas le droit d'appeler stateres_parties_notees : recollez la migration 20261113001800_village_stateres.sql, qui se rejoue sans rien perdre.`);

  return checks;
}
