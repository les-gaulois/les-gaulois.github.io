import { describe, expect, it } from "vitest";
import {
  adresseDeLImport,
  ajouterPrechargements,
  entreesDeLaPage,
  importsStatiques,
  modulesAPrecharger,
} from "../../src/lib/precharge-modules";

describe("préchargement des modules de chaque page", () => {
  it("lit les imports statiques d'un fichier de Vite, pas les dynamiques", () => {
    const source =
      'import{j as e}from"./jsxRuntime.module.D8zRAajv.js";import"./effets.B1.js";import*as t from"../autre/x.js";' +
      'const a=()=>import("./plus-tard.js");export{b as c}from"./ailleurs.js";import{d}from"preact";/*! note */import"./apres-note.js";';
    expect(importsStatiques(source)).toEqual(["./jsxRuntime.module.D8zRAajv.js", "./effets.B1.js", "../autre/x.js", "./ailleurs.js", "./apres-note.js"]);
  });

  it("trouve les scripts de la page et les îles demandées tout de suite", () => {
    const html =
      '<head><script type="module" src="/_astro/page.A.js"></script><script>var x=1</script></head><body>' +
      '<astro-island uid="1" component-url="/_astro/Idle.js" component-export="default" renderer-url="/_astro/client.js" props="{&quot;a&quot;:[0,&quot;&gt;&quot;]}" ssr client="idle"></astro-island>' +
      '<astro-island uid="2" component-url="/_astro/Visible.js" renderer-url="/_astro/client.js" client="visible"></astro-island>' +
      '<astro-island uid="3" component-url="/_astro/Seul.js" renderer-url="/_astro/client.js" client="only"></astro-island>' +
      '<script type="module" src="/_astro/Base.B.js"></script></body>';
    expect(entreesDeLaPage(html)).toEqual({
      scripts: ["/_astro/page.A.js", "/_astro/Base.B.js"],
      iles: ["/_astro/Idle.js", "/_astro/client.js", "/_astro/Seul.js"],
    });
  });

  it("suit toute la chaîne des imports, niveau par niveau, scripts de la page compris", () => {
    const fichiers: Record<string, string> = {
      "/_astro/Base.js": 'import{t}from"./tenue.js";import"./nav.js";',
      "/_astro/tenue.js": 'import{a}from"./api.js";',
      "/_astro/api.js": 'import{p}from"./preload-helper.js";const s=()=>import("./supabase.js");',
      "/_astro/nav.js": 'import{a}from"./api.js";',
      "/_astro/preload-helper.js": "export const p=1;",
      "/_astro/Ile.js": 'import{a}from"./api.js";import{x}from"./Base.js";',
    };
    const lire = (adresse: string): string | null => fichiers[adresse] ?? null;
    expect(modulesAPrecharger({ scripts: ["/_astro/Base.js"], iles: ["/_astro/Ile.js", "/_astro/absent.js"] }, lire)).toEqual([
      "/_astro/Base.js",
      "/_astro/Ile.js",
      "/_astro/tenue.js",
      "/_astro/nav.js",
      "/_astro/api.js",
      "/_astro/preload-helper.js",
    ]);
  });

  it("résout un import depuis l'adresse du module qui l'écrit", () => {
    expect(adresseDeLImport("/_astro/a.js", "./b.js")).toBe("/_astro/b.js");
    expect(adresseDeLImport("/depot/_astro/a.js", "./b.js")).toBe("/depot/_astro/b.js");
    expect(adresseDeLImport("/_astro/sous/a.js", "../c.js")).toBe("/_astro/c.js");
  });

  it("annonce chaque module une fois, juste avant la fin de l'en-tête", () => {
    const html = '<html><head><link rel="modulepreload" href="/_astro/b.js"><title>t</title></head><body></body></html>';
    expect(ajouterPrechargements(html, ["/_astro/a.js", "/_astro/b.js"])).toBe(
      '<html><head><link rel="modulepreload" href="/_astro/b.js"><title>t</title><link rel="modulepreload" href="/_astro/a.js"></head><body></body></html>',
    );
    expect(ajouterPrechargements(html, ["/_astro/b.js"])).toBe(html);
    expect(ajouterPrechargements("<body></body>", ["/_astro/a.js"])).toBe("<body></body>");
  });
});
