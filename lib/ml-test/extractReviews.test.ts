import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import {
  extractRatingAndReviews,
  parseRatingBr,
  parseReviewsNumberBr,
  preferMaxNullable,
} from "./extractReviews";

describe("extractReviews", () => {
  it("parseReviewsNumberBr lê milhares BR", () => {
    expect(parseReviewsNumberBr("19.304")).toBe(19304);
    expect(parseReviewsNumberBr("1.234")).toBe(1234);
  });

  it("parseRatingBr lê nota com vírgula", () => {
    expect(parseRatingBr("4,5")).toBe(4.5);
    expect(parseRatingBr("5")).toBe(5);
  });

  it("preferMaxNullable", () => {
    expect(preferMaxNullable(10, 20)).toBe(20);
    expect(preferMaxNullable(null, 5)).toBe(5);
    expect(preferMaxNullable(3, null)).toBe(3);
  });

  it("extractRatingAndReviews lê header e JSON embutido", () => {
    const html = `
<!DOCTYPE html><html><body>
<div class="ui-pdp-header__info">
  <span class="ui-pdp-review__rating">4,8</span>
  <span class="ui-pdp-review__amount">(19.304)</span>
</div>
<script type="application/ld+json">
{"@type":"Product","name":"X","aggregateRating":{"ratingValue":4.8,"reviewCount":19304}}
</script>
</body></html>`;
    const $ = load(html);
    const r = extractRatingAndReviews($, html);
    expect(r.rating).toBe(4.8);
    expect(r.reviewsCount).toBe(19304);
  });
});
