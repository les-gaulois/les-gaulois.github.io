/**
 * Les commandes du serveur Discord du clan, telles que Discord les montre : /code (docs/DIRECTION.md, « Se connecter avec un
 * code »), /fiche (« La commande /fiche »), les commandes du robot (« Les commandes du robot »), /roles (« Les rôles sur
 * Discord »), /tickets (« Les tickets d'assistance ») et /concours (« Les concours sur Discord »). La fonction les crée ou les
 * remet à jour elle-même sur le serveur du clan, avec le jeton qu'elle garde (`inscription.ts`) : depuis le 13 novembre 2026,
 * une nouvelle commande ne demande plus de « Reset Token », seulement une mise en ligne de la fonction.
 *
 * Des données seules, sans import : la fonction (Deno) les lit, et le site (Node) les reprend par `src/lib/discord-commande.ts`
 * pour ses tests et pour le script de secours `npm run discord:commande`. Leurs noms et options sont ceux qu'attendent
 * `index.ts`, `tickets.ts` et `concours.ts` : un test le vérifie.
 */

export const CODE_COMMAND = {
  name: "code",
  // 1 : une commande qui se tape avec « / ».
  type: 1,
  description: "Un code pour vous connecter au site du clan, sans lier votre compte Discord",
} as const;

/**
 * La commande /fiche (docs/DIRECTION.md, « La commande /fiche ») : la fiche d'un membre, montrée à tout le salon. Pendant la
 * saisie, Discord demande des propositions à la fonction serveur (`autocomplete`), qui les lit dans les fiches du site. Ses
 * noms sont ceux qu'attend la fonction (`FICHE_COMMAND_NAME`, `FICHE_OPTION`) : un test le vérifie.
 */
export const FICHE_COMMAND = {
  name: "fiche",
  type: 1,
  description: "Montrer à tous la fiche d'un membre du clan : ses parties sous le tag",
  options: [
    {
      // 3 : du texte.
      type: 3,
      name: "pseudo",
      description: "Son pseudo dans la liste du clan : tapez le début, puis choisissez",
      required: true,
      autocomplete: true,
      max_length: 40,
    },
  ],
} as const;

/**
 * Les commandes du robot (docs/DIRECTION.md, « Les commandes du robot ») : une image que le site dessine à chaque
 * construction, et /moi, la fiche de qui la tape. Leurs noms et options sont ceux qu'attend la fonction serveur.
 */
export const CLAN_COMMAND = { name: "clan", type: 1, description: "La place de GAL au classement officiel, et le podium de la dernière semaine complète" } as const;
export const RECORDS_COMMAND = { name: "records", type: 1, description: "Les records du clan : plus longue série de victoires, meilleure journée…" } as const;
export const CARTE_COMMAND = { name: "carte", type: 1, description: "Le territoire de GAL sur la carte des clans d'OpenFront" } as const;
export const GUIDE_COMMAND = {
  name: "guide",
  type: 1,
  description: "Un chapitre du guide du clan, l'essentiel en une image",
  options: [{ type: 3, name: "chapitre", description: "Le chapitre : tapez le début de son nom, puis choisissez", required: true, autocomplete: true, max_length: 60 }],
} as const;
export const RIVAL_COMMAND = {
  name: "rival",
  type: 1,
  description: "GAL face à un clan de la liste officielle : rang, score, parties, face-à-face",
  options: [{ type: 3, name: "clan", description: "Le tag du clan : tapez le début, puis choisissez", required: true, autocomplete: true, max_length: 10 }],
} as const;
export const MOI_COMMAND = { name: "moi", type: 1, description: "Votre fiche, si le site vous a reconnu comme membre du clan" } as const;

/** Le droit « Gérer les rôles » de Discord (1 << 28), en chiffres. */
export const MANAGE_ROLES = "268435456";

/**
 * /roles (docs/DIRECTION.md, « Les rôles sur Discord ») : poste le panneau des rôles dans le salon où on la tape. Discord ne
 * la propose qu'à qui a le droit « Gérer les rôles » (`default_member_permissions`), et la fonction serveur le vérifie aussi.
 */
export const ROLES_COMMAND = { name: "roles", type: 1, description: "Poster ici le panneau des rôles, un bouton par rôle (encadrement)", default_member_permissions: MANAGE_ROLES } as const;

/**
 * /tickets (docs/DIRECTION.md, « Les tickets d'assistance ») : pose le guichet des tickets dans le salon où elle est tapée.
 * Seuls la voient ceux qui peuvent gérer le serveur (`default_member_permissions`, 32 : « Gérer le serveur ») ; la fonction
 * le vérifie de nouveau. Ses options sont celles qu'attend `supabase/functions/code-discord/tickets.ts` : un test le vérifie.
 */
export const TICKETS_COMMAND = {
  name: "tickets",
  type: 1,
  description: "Poser dans ce salon le guichet des tickets d'assistance (encadrement)",
  default_member_permissions: "32",
  options: [
    // 7 : un salon, ici une catégorie (4) ou un salon écrit (0) ; 8 : un rôle.
    { type: 7, name: "categorie", description: "La catégorie privée où s'ouvrent les tickets", required: true, channel_types: [4] },
    { type: 7, name: "journal", description: "Le salon privé où le robot note chaque ticket ouvert et fermé", required: true, channel_types: [0] },
    { type: 8, name: "encadrement", description: "Le rôle prévenu à chaque ticket, qui peut les prendre et les fermer", required: true },
  ],
} as const;

/** Le concours à choisir, pour terminer, annuler ou remplacer un gagnant : proposé pendant la saisie. */
const CONCOURS_OPTION = { type: 3, name: "concours", description: "Le concours : tapez le début de son titre, puis choisissez", required: true, autocomplete: true, max_length: 100 } as const;

/**
 * La commande des concours (docs/DIRECTION.md, « Les concours sur Discord ») : lancer un concours dans le salon où elle est
 * tapée, le terminer, l'annuler, remplacer un gagnant. Réservée par Discord à qui peut « Gérer le serveur » (32) ; les
 * réglages des intégrations du serveur peuvent l'ouvrir à un rôle. Ses noms sont ceux qu'attend la fonction serveur
 * (`supabase/functions/code-discord/concours.ts`) : un test le vérifie.
 */
export const CONCOURS_COMMAND = {
  name: "concours",
  type: 1,
  description: "Les concours du clan : un bouton pour participer, un tirage au sort à la fin",
  default_member_permissions: "32",
  options: [
    {
      // 1 : une sous-commande.
      type: 1,
      name: "lancer",
      description: "Lancer un concours dans ce salon",
      options: [
        { type: 3, name: "lot", description: "Ce qui est à gagner, par exemple : une clef Steam d'OpenFront", required: true, max_length: 100 },
        { type: 3, name: "fin", description: "Quand tirer au sort : « 3 jours », « 12 h », « 1 j 6 h », ou une date, « 14/11 20:30 »", required: true, autocomplete: true, max_length: 40 },
        // 4 : un nombre entier.
        { type: 4, name: "gagnants", description: "Combien de gagnants : 1 si rien n'est choisi", min_value: 1, max_value: 20 },
        // 8 : un rôle du serveur.
        { type: 8, name: "participants", description: "Le rôle qu'il faut avoir pour participer ; sans rôle, tout le serveur" },
        { type: 8, name: "notifier", description: "Le rôle à prévenir au lancement, celui des alertes de concours par exemple" },
        { type: 3, name: "image", description: "Une image gardée dans l'inventaire de la Direction", autocomplete: true, max_length: 100 },
      ],
    },
    { type: 1, name: "terminer", description: "Tirer au sort maintenant, sans attendre la fin", options: [CONCOURS_OPTION] },
    { type: 1, name: "annuler", description: "Annuler un concours ouvert, sans tirage au sort", options: [CONCOURS_OPTION] },
    {
      type: 1,
      name: "remplacer",
      description: "Nouveau tirage : remplacer un gagnant par le suivant tiré au sort",
      // 6 : un membre du serveur.
      options: [CONCOURS_OPTION, { type: 6, name: "gagnant", description: "Le gagnant à remplacer ; sans lui, tous ceux qui n'ont pas confirmé" }],
    },
  ],
} as const;

/** Les commandes du serveur du clan : la fonction les crée ou les remet à jour, chacune à part (`inscription.ts`). */
export const COMMANDS = [CODE_COMMAND, FICHE_COMMAND, CLAN_COMMAND, RECORDS_COMMAND, CARTE_COMMAND, GUIDE_COMMAND, RIVAL_COMMAND, MOI_COMMAND, ROLES_COMMAND, TICKETS_COMMAND, CONCOURS_COMMAND] as const;
