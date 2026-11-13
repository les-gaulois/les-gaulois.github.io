/**
 * Compte la page ouverte, pour l'onglet « Activité du site » de la Direction : sans cookie, sans adresse IP, sans service
 * extérieur. Voir `src/lib/activite-site.ts` pour ce qui part et ce qui reste.
 *
 * Seul le site publié compte : ni le serveur de développement, ni un aperçu local, ni un navigateur piloté par un
 * programme (tests), ni un robot qui se déclare, ni un navigateur qui demande de ne pas être suivi (Global Privacy
 * Control, Do Not Track), ni celui d'un visiteur qui a choisi « Ne plus compter mes visites » sur la page Confidentialité.
 * Sans `PUBLIC_SUPABASE_URL`, rien ne part : le site reste entièrement statique. L'envoi (`noteSiteVisit`) ne charge pas
 * le code de Supabase ; un échec ne se voit pas.
 */
import { AUTH_ENABLED, SESSION_KEY, noteSiteVisit } from "../lib/compte/api";
import { EARLIER_VISIT_KEYS, VISIT_COUNT_KEY, VISIT_COUNT_REFUSED, isDeclaredBot, pageKey, parisDay, readVisitMark, sourceOf, visitFlags, writeVisitMark } from "../lib/activite-site";

function published(): boolean {
  if (!import.meta.env.PROD || !AUTH_ENABLED) return false;
  try {
    return new URL(import.meta.env.SITE).origin === location.origin && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  } catch {
    return false;
  }
}

function refusesTracking(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.webdriver || isDeclaredBot(nav.userAgent) || nav.globalPrivacyControl === true || nav.doNotTrack === "1";
}

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Une trace d'une visite d'avant ? Notée par un petit script en tête de page (`Base.astro`), avant que les composants de
 * la page n'écrivent la leur ; à défaut, lue ici.
 */
function cameBefore(): boolean {
  const noted = document.documentElement.dataset.visiteAvant;
  if (noted === "1" || noted === "0") return noted === "1";
  return [VISIT_COUNT_KEY, ...EARLIER_VISIT_KEYS].some((key) => stored(key) !== null);
}

function count() {
  const today = parisDay(new Date());
  const mark = readVisitMark(stored(VISIT_COUNT_KEY), today);
  let flags = visitFlags(mark, today, cameBefore());
  if (flags.newDay) {
    try {
      localStorage.setItem(VISIT_COUNT_KEY, writeVisitMark(mark, today));
    } catch {
      // Sans stockage, ce navigateur ne peut pas dire s'il est déjà venu aujourd'hui : il ne compte que des pages vues.
      flags = { newDay: false, newWeek: false, newMonth: false, first: false };
    }
  }
  noteSiteVisit(
    JSON.stringify({
      // Le modèle d'adresse, jamais l'adresse elle-même : celle d'une fiche porte l'identifiant du joueur.
      p_page: pageKey(document.body.dataset.route ?? "/autre"),
      p_new_day: flags.newDay,
      p_new_week: flags.newWeek,
      p_new_month: flags.newMonth,
      p_first: flags.first,
      p_source: flags.newDay ? sourceOf(document.referrer, location.hostname) : null,
      p_touch: flags.newDay && matchMedia("(pointer: coarse)").matches,
      p_signed_in: flags.newDay && stored(SESSION_KEY) !== null,
    }),
  );
}

// Tout de suite : un visiteur qui change vite de page compte quand même. L'envoi part sans rien bloquer.
if (published() && !refusesTracking() && stored(VISIT_COUNT_KEY) !== VISIT_COUNT_REFUSED) count();
