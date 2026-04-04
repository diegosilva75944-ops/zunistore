import { describe, expect, it } from "vitest";
import { mergeProductIdsForAffiliateValidation } from "./db";

describe("mergeProductIdsForAffiliateValidation", () => {
  it("prioriza o primeiro array e remove duplicatas da fila", () => {
    const out = mergeProductIdsForAffiliateValidation(
      ["a", "b"],
      [{ id: "b" }, { id: "c" }, { id: "d" }],
      4,
    );
    expect(out).toEqual(["a", "b", "c", "d"]);
  });

  it("respeita o limite", () => {
    const out = mergeProductIdsForAffiliateValidation(
      ["x", "y", "z"],
      [{ id: "w" }],
      2,
    );
    expect(out).toEqual(["x", "y"]);
  });

  it("ignora ids vazios", () => {
    const out = mergeProductIdsForAffiliateValidation(
      ["", "p1"],
      [{ id: "" }, { id: "p2" }],
      10,
    );
    expect(out).toEqual(["p1", "p2"]);
  });
});
