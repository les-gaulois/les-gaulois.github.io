import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";

export default [
  // `.cache/` : les fichiers de travail du robot, dont le moteur d'OpenFront assemblé par le rejeu des victoires, hors de Git.
  { ignores: ["dist/", ".astro/", "node_modules/", "public/", "test-results/", "playwright-report/", ".claude/worktrees/", ".cache/"] },
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
];
