/**
 * Ce que les tests du casino partagent. Ce module n'est pas un test : il n'est lancé que par ceux qui l'importent.
 */

/** Un générateur à graine (mulberry32) : le même tirage à chaque passage des tests. */
export function graine(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
