/**
 * Les visages Discord à côté des pseudos, sur les pages du site : podiums de l'accueil et de la gazette, records des joueurs,
 * encadrement de la page Membres, fiche d'un membre. Et, sur la porte du QG de l'accueil, ce qui attend les membres.
 *
 * Rien de tout cela n'est écrit dans les pages publiées : elles ne portent que des emplacements vides, `[data-face="pseudo"]`
 * et `[data-qg-waiting]`. Un pseudo porté par plusieurs membres n'a pas d'emplacement (`singlePseudos`). Le navigateur d'un
 * membre validé connecté demande le QG au serveur (`get_qg`, refusé à tout autre compte), y lit le mur, c'est-à-dire ceux qui
 * ont choisi de se montrer aux autres membres avec leur photo, puis met chaque photo à côté du pseudo identique.
 *
 * La limite à connaître : le nom d'un compte validé est son pseudo de la liste officielle le jour de sa validation. S'il en
 * change, sa photo ne s'affiche plus ; si un autre membre prend ensuite son ancien pseudo, la photo irait à côté du pseudo de
 * cet autre membre. Voir docs/DIRECTION.md.
 *
 * Ce petit script est commun à toutes les pages. Le code qui lit le QG (`qg.ts`), et celui de Supabase, ne sont chargés que
 * pour un visiteur qui a une session et dont la page a un emplacement.
 */
import { AUTH_ENABLED, call, mayHaveSession } from "../lib/compte/api";

function showPhoto(slot: HTMLElement, url: string) {
  const before = [...slot.childNodes];
  const wasHidden = slot.hidden;
  const img = document.createElement("img");
  img.alt = "";
  img.width = 56;
  img.height = 56;
  img.decoding = "async";
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";
  img.className = "size-full object-cover";
  img.draggable = false;
  // Une photo qui ne se charge pas rend sa place : l'initiale revient, ou l'emplacement se referme.
  img.addEventListener("error", () => {
    slot.replaceChildren(...before);
    slot.hidden = wasHidden;
  });
  img.src = url;
  slot.replaceChildren(img);
  slot.hidden = false;
}

async function main() {
  if (!AUTH_ENABLED || !mayHaveSession()) return;
  const slots = [...document.querySelectorAll<HTMLElement>("[data-face]")];
  const waiting = document.querySelector<HTMLElement>("[data-qg-waiting]");
  if (slots.length === 0 && !waiting) return;

  const { parseQg, qgWaiting, wallPhotos } = await import("../lib/compte/qg");
  let raw: unknown;
  try {
    raw = await call("get_qg");
  } catch {
    // Pas de compte validé, session perdue ou serveur muet : la page reste telle qu'elle est publiée.
    return;
  }
  const data = parseQg(raw);
  if (!data) return;

  const photos = wallPhotos(data.wall);
  for (const slot of slots) {
    const url = photos.get(slot.dataset.face ?? "");
    if (url) showPhoto(slot, url);
  }

  const text = waiting ? qgWaiting(data, Date.now()) : null;
  if (waiting && text) {
    waiting.textContent = text;
    waiting.hidden = false;
  }
}

void main();
