/**
 * Le format français des nombres, pour tout le site.
 *
 * `Intl` sépare les milliers par une espace fine (U+202F). Outfit et Inter ne contiennent pas ce caractère :
 * le navigateur le prenait dans la police de l'appareil, et « 121 976 » se lisait « 121976 » dans les titres.
 * L'espace insécable (U+00A0) existe dans les deux polices et garde le nombre sur une seule ligne.
 */
export function frNumber(options?: Intl.NumberFormatOptions): { format: (n: number) => string } {
  const inner = new Intl.NumberFormat("fr-FR", options);
  return { format: (n) => inner.format(n).replace(/\u202f/g, "\u00a0") };
}

/**
 * Le format anglais des nombres (« 1,500,000 », « 42.4 »), pour la seule fenêtre « Alliance » de la carte, qui se lit aussi
 * en anglais (`src/lib/alliance/textes.ts`). Le reste du site est en français.
 */
export function enNumber(options?: Intl.NumberFormatOptions): { format: (n: number) => string } {
  const inner = new Intl.NumberFormat("en-GB", options);
  return { format: (n) => inner.format(n) };
}
