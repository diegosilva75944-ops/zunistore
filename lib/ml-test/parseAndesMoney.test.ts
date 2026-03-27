import { describe, expect, it } from "vitest";
import {
  parseAndesFractionCentsToNumber,
  parseNumberLikeMlBr,
} from "@/lib/ml-test/parseAndesMoney";

describe("parseNumberLikeMlBr", () => {
  it("1.589,12 → 1589.12", () => {
    expect(parseNumberLikeMlBr("1.589,12")).toBe(1589.12);
  });
  it("589,12 → 589.12", () => {
    expect(parseNumberLikeMlBr("589,12")).toBe(589.12);
  });
});

describe("parseAndesFractionCentsToNumber — paridade import vs sync", () => {
  it("fração + centavos separados (layout clássico)", () => {
    expect(parseAndesFractionCentsToNumber("589", "12")).toBe(589.12);
  });

  it("vírgula no span de fração (589,12)", () => {
    expect(parseAndesFractionCentsToNumber("589,12", "")).toBe(589.12);
  });

  it("milhar com ponto na fração", () => {
    expect(parseAndesFractionCentsToNumber("1.589", "12")).toBe(1589.12);
  });

  it("5 dígitos colados sem centavos (58912 → 589,12)", () => {
    expect(parseAndesFractionCentsToNumber("58912", "")).toBe(589.12);
  });
});
