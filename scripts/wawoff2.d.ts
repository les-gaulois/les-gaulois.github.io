// wawoff2 (MIT) n'a pas de types : seule la compression sert, dans scripts/generate-police.ts.
declare module "wawoff2" {
  export function compress(donnees: Uint8Array): Promise<Uint8Array>;
}
