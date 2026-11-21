import { chiffresDesCartes } from "../../lib/jeu/chiffres-de-carte";
import { loadMembers, loadRecordsPersonnels, loadSeriesEnCours } from "../../lib/data";
import { classementDuSite } from "../../lib/rejeu/utiles-site";

/**
 * Les chiffres de clan de « Ma carte » (src/lib/jeu/chiffres-de-carte.ts) : ceux des fiches des membres au pseudo public,
 * sous leur pseudo. Rien de plus que les pages des membres. Lu par l'écran « Ma carte » de /village.
 */
export function GET() {
  const liste = loadMembers();
  const utiles = classementDuSite();
  const chiffres = chiffresDesCartes(liste?.members ?? [], liste?.fetchedAt ?? null, loadSeriesEnCours(), loadRecordsPersonnels(), {
    lignes: utiles.lignes.map((l) => ({ nom: l.nom, utilite: l.utilite, parties: l.parties })),
    ids: utiles.ids,
    fait: utiles.fait,
  });
  return new Response(JSON.stringify(chiffres), { headers: { "Content-Type": "application/json" } });
}
