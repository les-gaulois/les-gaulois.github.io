/**
 * Les visages Discord à côté des pseudos, sur les pages du site : podiums de l'accueil et de la gazette, records des joueurs,
 * encadrement de la page Membres, fiche d'un membre. Et, sur la porte du QG de l'accueil, ce qui attend les membres.
 *
 * Rien de tout cela n'est écrit dans les pages publiées : elles ne portent que des emplacements vides, `[data-face="pseudo"]`
 * et `[data-qg-waiting]`. Un pseudo porté par plusieurs membres n'a pas d'emplacement (`singlePseudos`). Le navigateur d'un
 * membre validé connecté demande au serveur les visages (`get_member_faces`, refusé à tout autre compte) : la photo de ceux
 * qui ont choisi de se montrer aux autres membres, avec leur pseudo d'aujourd'hui dans la liste officielle, retrouvé par
 * l'empreinte de leur identifiant OpenFront. Chaque photo va à côté du pseudo identique. Sur la porte du QG seulement, il
 * demande aussi le QG (`get_qg`), pour compter ce qui attend.
 *
 * Ce petit script est commun à toutes les pages. Le code qui lit ces réponses (`qg.ts`), et celui de Supabase, ne sont
 * chargés que pour un visiteur qui a une session et dont la page a un emplacement.
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

  const { memberFacesOf, parseQg, qgWaiting } = await import("../lib/compte/qg");
  // Un refus (pas de compte validé, session perdue) ou un serveur muet : la page reste telle qu'elle est publiée.
  const [faces, qg] = await Promise.all([
    slots.length > 0 ? call("get_member_faces").then(memberFacesOf, () => null) : null,
    waiting ? call("get_qg").then(parseQg, () => null) : null,
  ]);

  if (faces) {
    for (const slot of slots) {
      const url = faces.get(slot.dataset.face ?? "");
      if (url) showPhoto(slot, url);
    }
  }

  const text = waiting && qg ? qgWaiting(qg, Date.now()) : null;
  if (waiting && text) {
    waiting.textContent = text;
    waiting.hidden = false;
  }
}

void main();
