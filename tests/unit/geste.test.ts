import { describe, expect, it } from "vitest";
import { SEUIL_DU_GESTE, dansLeCadre, gesteDeLAppui, sensDeLaPrise } from "../../src/lib/jeu/geste";

// Le geste qui prend une carte du vestiaire du jeu (src/lib/jeu/geste.ts) : au doigt, défiler la rangée ne prend jamais
// une carte.

describe("sensDeLaPrise", () => {
  it("la souris et le stylet prennent dans tous les sens", () => {
    expect(sensDeLaPrise("mouse", "pan-x")).toBe("tous");
    expect(sensDeLaPrise("pen", "pan-y")).toBe("tous");
  });
  it("au doigt, une carte d'une rangée qui défile de côté se prend vers le haut ou le bas", () => {
    expect(sensDeLaPrise("touch", "pan-x")).toBe("vertical");
    expect(sensDeLaPrise("touch", "pan-left pan-right")).toBe("vertical");
  });
  it("au doigt, une carte d'une grille qui défile avec la page se prend de côté", () => {
    expect(sensDeLaPrise("touch", "pan-y")).toBe("horizontal");
    expect(sensDeLaPrise("touch", "pan-up")).toBe("horizontal");
  });
  it("une carte qui laisse tout défiler, ou rien, se prend dans tous les sens", () => {
    expect(sensDeLaPrise("touch", "auto")).toBe("tous");
    expect(sensDeLaPrise("touch", "manipulation")).toBe("tous");
    expect(sensDeLaPrise("touch", "none")).toBe("tous");
    expect(sensDeLaPrise("touch", "pan-x pan-y")).toBe("tous");
  });
});

describe("gesteDeLAppui", () => {
  it("attend tant que l'appui n'a pas franchi le seuil : un clic qui tremble reste un clic", () => {
    expect(gesteDeLAppui(0, 0, "tous")).toBe("attendre");
    expect(gesteDeLAppui(SEUIL_DU_GESTE - 1, 0, "vertical")).toBe("attendre");
    expect(gesteDeLAppui(5, 5, "horizontal")).toBe("attendre");
  });
  it("le doigt qui défile la rangée de côté ne prend pas la carte", () => {
    expect(gesteDeLAppui(-40, 6, "vertical")).toBe("defiler");
    expect(gesteDeLAppui(30, -12, "vertical")).toBe("defiler");
  });
  it("le doigt qui part vers le Gaulois, au-dessus de la rangée, prend la carte", () => {
    expect(gesteDeLAppui(-6, -30, "vertical")).toBe("prendre");
    expect(gesteDeLAppui(10, 10, "vertical")).toBe("prendre");
  });
  it("dans une grille, défiler la page ne prend pas la carte ; partir de côté la prend", () => {
    expect(gesteDeLAppui(3, 40, "horizontal")).toBe("defiler");
    expect(gesteDeLAppui(40, 3, "horizontal")).toBe("prendre");
  });
  it("la souris prend dans tous les sens, une fois le seuil franchi", () => {
    expect(gesteDeLAppui(SEUIL_DU_GESTE, 0, "tous")).toBe("prendre");
    expect(gesteDeLAppui(0, -SEUIL_DU_GESTE, "tous")).toBe("prendre");
  });
});

describe("dansLeCadre", () => {
  const cadre = { left: 10, top: 20, right: 110, bottom: 220 };
  it("dit si le centre de la carte tenue est au-dessus de la scène, bords compris", () => {
    expect(dansLeCadre({ x: 60, y: 100 }, cadre)).toBe(true);
    expect(dansLeCadre({ x: 10, y: 220 }, cadre)).toBe(true);
    expect(dansLeCadre({ x: 9, y: 100 }, cadre)).toBe(false);
    expect(dansLeCadre({ x: 60, y: 221 }, cadre)).toBe(false);
  });
});
