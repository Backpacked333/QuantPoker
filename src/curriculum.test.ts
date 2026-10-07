import { describe, expect, it } from "vitest";
import { modules, moduleById } from "./curriculum";

describe("curriculum architecture", () => {
  it("has unique modules and ordered, acyclic prerequisites", () => {
    const seen = new Set<string>();
    for (const module of modules) {
      expect(seen.has(module.id)).toBe(false);
      for (const prerequisite of module.prerequisites)
        expect(seen.has(prerequisite)).toBe(true);
      seen.add(module.id);
      expect(moduleById[module.id]).toBe(module);
    }
    expect(seen.size).toBe(7);
  });
  it("gives every connection objectives, a boundary, a worked example and two valid checks", () => {
    for (const module of modules) {
      expect(module.objectives).toHaveLength(3);
      expect(module.boundary.length).toBeGreaterThan(50);
      expect(module.scenario.calculation.length).toBeGreaterThan(20);
      expect(module.questions).toHaveLength(2);
      for (const question of module.questions) {
        expect(question.correct).toBeGreaterThanOrEqual(0);
        expect(question.correct).toBeLessThan(question.choices.length);
        expect(question.explanation.length).toBeGreaterThan(20);
      }
    }
  });
  it("covers every requested concept explicitly", () => {
    const concepts = modules
      .flatMap((module) => [module.poker, module.finance])
      .join(" ")
      .toLowerCase();
    for (const concept of [
      "pot odds",
      "outs",
      "equity",
      "expected value",
      "fold equity",
      "variance",
      "implied volatility",
      "delta hedging",
      "put-call parity",
      "expected payoff",
      "risk-neutral pricing",
    ]) {
      expect(concepts).toContain(concept);
    }
  });
});
