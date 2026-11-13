/**
 * Les textes de la fenêtre « Alliance » de la carte, en français et en anglais (`langue.ts`). Les deux langues ont les
 * mêmes entrées : TypeScript refuse un texte oublié dans l'une. Les nombres et les dates suivent la langue choisie ; les
 * heures restent celles de Paris, comme partout sur le site.
 *
 * La partie Gestion, réservée à l'encadrement de GAL, reste en français.
 */
import { enNumber, frNumber } from "../nombre";
import { parisParts } from "../time";
import type { Langue } from "./langue";

const PARIS = "Europe/Paris";

export interface Textes {
  langue: Langue;
  /** Les nombres entiers : « 1 500 000 » ou « 1,500,000 ». */
  nombre: (n: number) => string;
  /** Une part de 0 à 1, en pourcentage à une décimale. */
  pct: (part: number) => string;
  /** Un jour et une heure à Paris, sans l'année. */
  dateHeure: (iso: string) => string;
  /** Un jour seul, avec l'année : « 13 nov. 2026 ». */
  jour: (iso: string) => string;
  /** L'heure d'un message : seule le jour même, « hier » la veille, puis le jour. */
  heureMessage: (iso: string, maintenant: Date) => string;

  titreFenetre: string;
  choixLangue: string;
  carteAria: string;
  zoomPlus: string;
  zoomMoins: string;
  vueDEnsemble: string;
  fermer: string;

  porteInvite: string;
  porteReservee: string;
  seConnecterDiscord: string;
  accepterIntro: string;
  accepterNom: string;
  accepterExemple: string;
  accepterBouton: string;
  seDeconnecter: string;
  quitter: string;
  quitterConfirmer: string;
  lectureCarte: string;
  sansAcces: string;
  sansAccesAide: string;
  carteEnPanne: string;
  chargementCarte: string;
  connecte: string;
  roleAllie: string;
  roleEncadrement: string;
  sansEtat: string;
  ongletsAria: string;
  onglets: { vue: string; zones: string; messages: string; gestion: string };
  /** Après un nombre : « 3 nouveaux messages ». */
  nouveaux: (n: number) => string;
  /** Pour l'encadrement, après un nombre : « 2 alliés attendent votre accord ». */
  alliesAttendent: (n: number) => string;
  reessayer: string;
  demandeEnvoyee: string;
  demandeAttente: (tag: string, alias: string) => string;
  annulerDemande: string;
  annulerDemandeConfirmer: string;

  couleursCarte: string;
  modeClans: string;
  modeAlliances: string;
  /** Chaque clan dans sa couleur du jeu, clans neutres compris. */
  modeTout: string;
  legendeAutres: string;
  releve: (date: string) => string;
  notreAlliance: string;
  territoire: string;
  pixels: string;
  partDesTerres: (pct: string) => string;
  place: string;
  placeSur: (rang: number, total: number) => string;
  placeSeule: (rang: number) => string;
  troupesDeclarees: string;
  parClans: (declares: number, clans: number) => string;
  aucuneDeclaration: string;
  clan: string;
  nonDeclare: string;
  declarePar: (qui: string, date: string) => string;
  troupesAide: string;
  declarerTitre: string;
  troupesAujourdhui: string;
  declarer: string;
  retirerDeclaration: string;
  autresAlliances: string;

  nouvelleZone: string;
  rangerGal: string;
  sansEtatZones: string;
  touteLAlliance: string;
  /** Après la part d'une zone déjà tenue : « 42,0 % prise ». */
  prise: string;
  dejaANous: string;
  terreNeutre: string;
  autresClans: string;
  autresEtPlus: (n: number) => string;
  mer: string;
  total: string;
  auMoins: (n: string) => string;
  aPrevoir: string;
  /** La date de la zone, et qui l'a dessinée ou modifiée en dernier quand le serveur le dit. */
  misAJour: (date: string, par?: string | null) => string;
  modifier: string;
  supprimer: string;
  confirmerSuppression: string;
  supprimerAria: (nom: string) => string;
  confirmerSuppressionAria: (nom: string) => string;
  /** Les règles du jeu qui comptent une zone, et le jour où elles ont été lues dans son code. */
  regles: (neutre: string, ennemi: string, lues: string) => string;
  ici: string;
  terreDuClan: (tag: string) => string;
  clanSupprime: string;
  sansAlliance: string;
  /** La mer, sous la souris. */
  merCourt: string;

  titreNouvelleZone: string;
  titreModifierZone: string;
  nomZone: string;
  pourQui: string;
  outil: string;
  outils: { main: string; crayon: string; rectangle: string; gomme: string };
  aideOutil: { main: string; crayon: string; rectangle: string; gomme: string };
  taille: string;
  tailles: readonly [string, string, string, string];
  annulerGeste: string;
  toutEffacer: string;
  /** Après le nombre de pixels du dessin en cours, écrit en grand. */
  pixelsDessines: string;
  tropGrand: string;
  /** Les pixels retirés du dessin : une autre zone les tient déjà. */
  retiresAutreZone: (n: number) => string;
  zoneVide: string;
  enregistrer: string;
  abandonner: string;
  abandonnerConfirmer: string;

  lectureMessages: string;
  filAria: string;
  marqueEncadrement: string;
  retirerMessage: string;
  retirerMessageConfirmer: string;
  retirerMessageAria: (nom: string) => string;
  retirerMessageConfirmerAria: (nom: string) => string;
  votreMessage: string;
  envoyer: string;
  caracteresRestants: (n: number) => string;
  piedDiscussion: string;
}

/** L'heure d'un message, dans une langue : « 14:05 », « hier, 14:05 », puis « 12 nov., 14:05 ». */
function heureDe(locale: string, hier: string): (iso: string, maintenant: Date) => string {
  const heure = new Intl.DateTimeFormat(locale, { timeZone: PARIS, hour: "2-digit", minute: "2-digit", hour12: false });
  const jour = new Intl.DateTimeFormat(locale, { timeZone: PARIS, day: "numeric", month: "short" });
  return (iso, maintenant) => {
    const d = new Date(iso);
    const ce = parisParts(d).date;
    const h = heure.format(d);
    if (ce === parisParts(maintenant).date) return h;
    if (ce === parisParts(new Date(maintenant.getTime() - 86_400_000)).date) return `${hier}, ${h}`;
    return `${jour.format(d)}, ${h}`;
  };
}

/** Un jour seul, à Paris, avec l'année. */
function jourDe(locale: string): (iso: string) => string {
  const jour = new Intl.DateTimeFormat(locale, { timeZone: PARIS, day: "numeric", month: "short", year: "numeric" });
  return (iso) => jour.format(new Date(iso));
}

/** Un jour et une heure à Paris : « 13 nov., 14:05 ». */
function dateHeureDe(locale: string): (iso: string) => string {
  const jour = new Intl.DateTimeFormat(locale, { timeZone: PARIS, day: "numeric", month: "short" });
  const heure = new Intl.DateTimeFormat(locale, { timeZone: PARIS, hour: "2-digit", minute: "2-digit", hour12: false });
  return (iso) => `${jour.format(new Date(iso))}, ${heure.format(new Date(iso))}`;
}

const frInt = frNumber({ maximumFractionDigits: 0 });
const frDec1 = frNumber({ minimumFractionDigits: 1, maximumFractionDigits: 1 });
const enInt = enNumber({ maximumFractionDigits: 0 });
const enDec1 = enNumber({ minimumFractionDigits: 1, maximumFractionDigits: 1 });
const NBSP = String.fromCharCode(0xa0);

/** « 1st », « 2nd », « 3rd », « 11th ». */
export function ordinalAnglais(n: number): string {
  const dizaine = n % 100;
  if (dizaine >= 11 && dizaine <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
}

/** « 1re », « 2e » : une alliance, au féminin. */
export const ordinalFrancais = (n: number): string => `${n}${n === 1 ? "re" : "e"}`;

const pluriel = (n: number, un: string, plusieurs: string) => (n > 1 ? plusieurs : un);

export const FR: Textes = {
  langue: "fr",
  nombre: (n) => frInt.format(n),
  pct: (part) => `${frDec1.format(part * 100)}${NBSP}%`,
  dateHeure: dateHeureDe("fr-FR"),
  jour: jourDe("fr-FR"),
  heureMessage: heureDe("fr-FR", "hier"),

  titreFenetre: "La carte de l'alliance",
  choixLangue: "Langue",
  carteAria: "Carte de l'alliance : les territoires des clans et les zones à prendre, chacun dans sa couleur. Les mêmes chiffres sont écrits dans la fenêtre Alliance.",
  zoomPlus: "Zoomer sur la carte de l'alliance",
  zoomMoins: "Dézoomer la carte de l'alliance",
  vueDEnsemble: "Vue d'ensemble",
  fermer: "Fermer la fenêtre Alliance",

  porteInvite: "L'encadrement de GAL vous invite. Connectez-vous pour accepter.",
  porteReservee: "Réservée aux Gaulois et aux joueurs des clans alliés que l'encadrement de GAL invite.",
  seConnecterDiscord: "Se connecter avec Discord",
  accepterIntro: "L'encadrement de GAL vous invite sur la carte de l'alliance.",
  accepterNom: "Votre nom sur la carte de l'alliance",
  accepterExemple: "Votre pseudo OpenFront",
  accepterBouton: "Envoyer ma demande",
  seDeconnecter: "Se déconnecter",
  quitter: "Quitter la carte de l'alliance",
  quitterConfirmer: "Confirmer : quitter la carte",
  lectureCarte: "Lecture de la carte de l'alliance…",
  sansAcces: "Ce compte n'a pas accès à la carte de l'alliance.",
  sansAccesAide: "Un joueur allié entre avec le lien d'invitation de l'encadrement de GAL ; un Gaulois, une fois son compte validé.",
  carteEnPanne: "La carte n'a pas pu se charger. Rechargez la page.",
  chargementCarte: "Chargement de la carte…",
  connecte: `Connecté${NBSP}:`,
  roleAllie: "joueur allié",
  roleEncadrement: "encadrement de GAL",
  sansEtat: "La carte pixel par pixel n'est pas publiée pour ce relevé : les zones ne se comptent pas.",
  ongletsAria: "Parties de la carte de l'alliance",
  onglets: { vue: "Alliances", zones: "Zones", messages: "Messages", gestion: "Gestion" },
  nouveaux: (n) => (n > 1 ? "nouveaux messages" : "nouveau message"),
  alliesAttendent: (n) => (n > 1 ? "alliés attendent votre accord" : "allié attend votre accord"),
  reessayer: "Réessayer",
  demandeEnvoyee: "Votre demande est envoyée.",
  demandeAttente: (tag, alias) => `L'encadrement de GAL doit encore vous accepter comme joueur de ${tag}, sous le nom ${alias}. La carte de l'alliance s'ouvrira ici dès son accord.`,
  annulerDemande: "Annuler ma demande",
  annulerDemandeConfirmer: "Confirmer : annuler ma demande",

  couleursCarte: "Couleurs de la carte",
  modeClans: "Nos clans",
  modeAlliances: "Les alliances",
  modeTout: "Tout",
  legendeAutres: "Autres clans",
  releve: (date) => `Carte au relevé du ${date}.`,
  notreAlliance: "notre alliance",
  territoire: "Territoire",
  pixels: "pixels",
  partDesTerres: (pct) => `${pct} des terres prises`,
  place: "Place",
  placeSur: (rang, total) => `${ordinalFrancais(rang)} sur ${total}`,
  placeSeule: (rang) => ordinalFrancais(rang),
  troupesDeclarees: "Troupes déclarées",
  parClans: (declares, clans) => `par ${declares} ${pluriel(declares, "clan", "clans")} sur ${clans}`,
  aucuneDeclaration: "aucun clan n'a déclaré",
  clan: "Clan",
  nonDeclare: "non déclarées",
  declarePar: (qui, date) => `${qui}, ${date}`,
  troupesAide: "Chaque clan déclare ses troupes : OpenFront ne les donne pas au site.",
  declarerTitre: "Déclarer des troupes",
  troupesAujourdhui: "Troupes aujourd'hui",
  declarer: "Déclarer",
  retirerDeclaration: "Retirer la déclaration",
  autresAlliances: "Les autres alliances",

  nouvelleZone: "Dessiner une zone",
  rangerGal: "Rangez d'abord GAL dans une alliance, dans Gestion.",
  sansEtatZones: "La carte pixel par pixel n'est pas publiée pour ce relevé : les zones ne se comptent ni ne se dessinent. Elle revient à la prochaine mise à jour de la carte.",
  touteLAlliance: "Toute l'alliance",
  prise: "prise",
  dejaANous: "Déjà à nous",
  terreNeutre: "Terre neutre",
  autresClans: "Autres clans",
  autresEtPlus: (n) => `et ${n} ${pluriel(n, "autre", "autres")}`,
  mer: "Mer, qui ne se prend pas",
  total: "Total",
  auMoins: (n) => `au moins ${n}`,
  aPrevoir: "Troupes à prévoir",
  misAJour: (date, par) => `Dessinée ou modifiée le ${date}${par ? `, par ${par}` : ""}.`,
  modifier: "Modifier",
  supprimer: "Supprimer",
  confirmerSuppression: "Confirmer la suppression",
  supprimerAria: (nom) => `Supprimer « ${nom} »`,
  confirmerSuppressionAria: (nom) => `Confirmer la suppression de « ${nom} »`,
  regles: (neutre, ennemi, lues) => `${neutre} troupes par pixel neutre, au moins ${ennemi} par pixel d'un autre clan, selon les règles du jeu lues le ${lues}.`,
  ici: `Ici${NBSP}:`,
  terreDuClan: (tag) => `terre de ${tag}`,
  clanSupprime: "Clan supprimé",
  sansAlliance: "sans alliance",
  merCourt: "Mer",

  titreNouvelleZone: "Nouvelle zone",
  titreModifierZone: "Modifier la zone",
  nomZone: "Nom de la zone",
  pourQui: "Qui la prend",
  outil: "Outil",
  outils: { main: "Déplacer", crayon: "Pinceau", rectangle: "Rectangle", gomme: "Gomme" },
  aideOutil: {
    main: "Glissez pour déplacer la carte, molette ou deux doigts pour zoomer.",
    crayon: "Maintenez le clic et passez sur la terre : elle se colore. La mer et les autres zones ne se peignent pas.",
    rectangle: "Cliquez à un coin, tirez jusqu'au coin opposé, relâchez : la terre du rectangle se colore, sauf les autres zones.",
    gomme: "Maintenez le clic et passez sur la zone pour en retirer des pixels.",
  },
  taille: "Taille du pinceau et de la gomme",
  tailles: ["Fin", "Moyen", "Gros", "Très gros"],
  annulerGeste: "Annuler le dernier geste",
  toutEffacer: "Tout effacer",
  pixelsDessines: "pixels dessinés",
  tropGrand: "La zone est trop étendue : son cadre dépasse un million de pixels. Coupez-la en plusieurs zones.",
  retiresAutreZone: (n) => (n > 1 ? `${frInt.format(n)} pixels, déjà dans une autre zone, ont été retirés du dessin.` : "1 pixel, déjà dans une autre zone, a été retiré du dessin."),
  zoneVide: "La zone est vide : dessinez au moins un pixel de terre.",
  enregistrer: "Enregistrer la zone",
  abandonner: "Abandonner le dessin",
  abandonnerConfirmer: "Confirmer : jeter le dessin",

  lectureMessages: "Lecture des messages…",
  filAria: "Messages de l'alliance",
  marqueEncadrement: "encadrement",
  retirerMessage: "retirer",
  retirerMessageConfirmer: "confirmer le retrait",
  retirerMessageAria: (nom) => `Retirer le message de ${nom}`,
  retirerMessageConfirmerAria: (nom) => `Confirmer le retrait du message de ${nom}`,
  votreMessage: "Votre message",
  envoyer: "Envoyer",
  caracteresRestants: (n) => `${n} caractères restants`,
  piedDiscussion: "Lue par les Gaulois et les alliés invités ; effacée au bout de 30 jours.",
};

export const EN: Textes = {
  langue: "en",
  nombre: (n) => enInt.format(n),
  pct: (part) => `${enDec1.format(part * 100)}%`,
  dateHeure: dateHeureDe("en-GB"),
  jour: jourDe("en-GB"),
  heureMessage: heureDe("en-GB", "yesterday"),

  titreFenetre: "Alliance map",
  choixLangue: "Language",
  carteAria: "Alliance map: clan territories and zones to take, each in its colour. The same numbers are written in the Alliance window. With the keyboard, arrows move the map, plus and minus zoom, zero shows the whole map.",
  zoomPlus: "Zoom in on the alliance map",
  zoomMoins: "Zoom out of the alliance map",
  vueDEnsemble: "Whole map",
  fermer: "Close the Alliance window",

  porteInvite: "The GAL leadership invites you. Sign in to accept.",
  porteReservee: "For GAL members and for players of allied clans invited by the GAL leadership.",
  seConnecterDiscord: "Sign in with Discord",
  accepterIntro: "The GAL leadership invites you to the alliance map.",
  accepterNom: "Your name on the alliance map",
  accepterExemple: "Your OpenFront name",
  accepterBouton: "Send my request",
  seDeconnecter: "Sign out",
  quitter: "Leave the alliance map",
  quitterConfirmer: "Confirm: leave the map",
  lectureCarte: "Loading the alliance map…",
  sansAcces: "This account has no access to the alliance map.",
  sansAccesAide: "Allied players join with an invitation link from the GAL leadership; GAL members, once their account is validated.",
  carteEnPanne: "The map could not load. Reload the page.",
  chargementCarte: "Loading the map…",
  connecte: "Signed in:",
  roleAllie: "allied player",
  roleEncadrement: "GAL leadership",
  sansEtat: "The pixel map is not published for this snapshot: zones cannot be counted.",
  ongletsAria: "Alliance map sections",
  onglets: { vue: "Alliances", zones: "Zones", messages: "Chat", gestion: "Gestion" },
  nouveaux: (n) => (n > 1 ? "new messages" : "new message"),
  alliesAttendent: (n) => (n > 1 ? "allies await your approval" : "ally awaits your approval"),
  reessayer: "Try again",
  demandeEnvoyee: "Your request has been sent.",
  demandeAttente: (tag, alias) => `The GAL leadership still has to accept you as a player of ${tag}, under the name ${alias}. The alliance map will open here as soon as they accept.`,
  annulerDemande: "Cancel my request",
  annulerDemandeConfirmer: "Confirm: cancel my request",

  couleursCarte: "Map colours",
  modeClans: "Our clans",
  modeAlliances: "Alliances",
  modeTout: "All",
  legendeAutres: "Other clans",
  releve: (date) => `Map snapshot of ${date} (Paris time).`,
  notreAlliance: "our alliance",
  territoire: "Territory",
  pixels: "pixels",
  partDesTerres: (pct) => `${pct} of claimed land`,
  place: "Rank",
  placeSur: (rang, total) => `${ordinalAnglais(rang)} of ${total}`,
  placeSeule: (rang) => ordinalAnglais(rang),
  troupesDeclarees: "Declared troops",
  parClans: (declares, clans) => `by ${declares} of ${clans} ${pluriel(clans, "clan", "clans")}`,
  aucuneDeclaration: "no clan has declared",
  clan: "Clan",
  nonDeclare: "not declared",
  declarePar: (qui, date) => `${qui}, ${date}`,
  troupesAide: "Each clan declares its own troops: OpenFront does not share them with the site.",
  declarerTitre: "Declare troops",
  troupesAujourdhui: "Troops today",
  declarer: "Declare",
  retirerDeclaration: "Remove declaration",
  autresAlliances: "Other alliances",

  nouvelleZone: "Draw a zone",
  rangerGal: "First put GAL in an alliance, under Gestion.",
  sansEtatZones: "The pixel map is not published for this snapshot: zones can be neither counted nor drawn. It comes back with the next map update.",
  touteLAlliance: "Whole alliance",
  prise: "taken",
  dejaANous: "Already ours",
  terreNeutre: "Neutral land",
  autresClans: "Other clans",
  autresEtPlus: (n) => `and ${n} ${pluriel(n, "other", "others")}`,
  mer: "Sea, which cannot be taken",
  total: "Total",
  auMoins: (n) => `at least ${n}`,
  aPrevoir: "Troops needed",
  misAJour: (date, par) => `Drawn or edited on ${date} (Paris time)${par ? `, by ${par}` : ""}.`,
  modifier: "Edit",
  supprimer: "Delete",
  confirmerSuppression: "Confirm deletion",
  supprimerAria: (nom) => `Delete “${nom}”`,
  confirmerSuppressionAria: (nom) => `Confirm deletion of “${nom}”`,
  regles: (neutre, ennemi, lues) => `${neutre} troops per neutral pixel, at least ${ennemi} per pixel of another clan, per the game rules read on ${lues}.`,
  ici: "Here:",
  terreDuClan: (tag) => `${tag} land`,
  clanSupprime: "Deleted clan",
  sansAlliance: "no alliance",
  merCourt: "Sea",

  titreNouvelleZone: "New zone",
  titreModifierZone: "Edit zone",
  nomZone: "Zone name",
  pourQui: "Who takes it",
  outil: "Tool",
  outils: { main: "Move", crayon: "Brush", rectangle: "Rectangle", gomme: "Eraser" },
  aideOutil: {
    main: "Drag to move the map; mouse wheel or two fingers to zoom.",
    crayon: "Hold the click and move over land: it gets coloured. Sea and other zones cannot be painted.",
    rectangle: "Click a corner, drag to the opposite corner, release: the land in the rectangle gets coloured, except other zones.",
    gomme: "Hold the click and move over the zone to remove pixels.",
  },
  taille: "Brush and eraser size",
  tailles: ["Fine", "Medium", "Large", "Huge"],
  annulerGeste: "Undo last stroke",
  toutEffacer: "Clear all",
  pixelsDessines: "pixels drawn",
  tropGrand: "The zone is too large: its frame is over one million pixels. Split it into several zones.",
  retiresAutreZone: (n) => (n > 1 ? `${enInt.format(n)} pixels already in another zone were removed from the drawing.` : "1 pixel already in another zone was removed from the drawing."),
  zoneVide: "The zone is empty: draw at least one land pixel.",
  enregistrer: "Save the zone",
  abandonner: "Discard the drawing",
  abandonnerConfirmer: "Confirm: discard",

  lectureMessages: "Loading messages…",
  filAria: "Alliance messages",
  marqueEncadrement: "leadership",
  retirerMessage: "remove",
  retirerMessageConfirmer: "confirm removal",
  retirerMessageAria: (nom) => `Remove ${nom}'s message`,
  retirerMessageConfirmerAria: (nom) => `Confirm removal of ${nom}'s message`,
  votreMessage: "Your message",
  envoyer: "Send",
  caracteresRestants: (n) => `${n} characters left`,
  piedDiscussion: "Read by GAL members and invited allies; deleted after 30 days.",
};

export const textesDe = (langue: Langue): Textes => (langue === "en" ? EN : FR);
