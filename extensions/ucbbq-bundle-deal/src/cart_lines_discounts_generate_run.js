// Uncle Clarence BBQ — Combo Discount (Sauce + Rub = 3% off Sauce)
// No variant IDs needed. We match by PRODUCT HANDLE coming from the GraphQL input.
// Handles you gave me (storefront URLs):
//  - uncle-clarence-barbecue-sauce-blueberry-flavor  (Sauce)
//  - uncle-clarence-bbq-righteous-rib-rub           (Rub)
//  - all-purpose-herb-spice-blend                   (Rub/Seasoning)
//  - bold-rib-seasoning-mix-righteous-ribs          (Rub/Seasoning)
//  - caribbean-jerk-rub-calypso-heat                (Rub/Seasoning)

const SAUCE_HANDLES = new Set([
  "uncle-clarence-barbecue-sauce-blueberry-flavor",
]);

const RUB_HANDLES = new Set([
  "uncle-clarence-bbq-righteous-rib-rub",
  "all-purpose-herb-spice-blend",
  "bold-rib-seasoning-mix-righteous-ribs",
  "caribbean-jerk-rub-calypso-heat",
]);

export default function cartLinesDiscountsGenerateRun(input) {
  let hasRub = false;
  const sauceTargets = [];

  for (const line of input.cart.lines) {
    // Each line is a ProductVariant; we asked GraphQL for product.handle
    const merch = line.merchandise;
    const handle = merch?.product?.handle || "";

    if (RUB_HANDLES.has(handle)) {
      hasRub = true;
    }
    if (SAUCE_HANDLES.has(handle)) {
      sauceTargets.push({ cartLine: { id: line.id } });
    }
  }

  if (hasRub && sauceTargets.length > 0) {
    return {
      discountApplicationStrategy: "FIRST",
      discounts: [
        {
          message: "Combo deal: Sauce + Rub",
          targets: sauceTargets,
          value: { percentage: { value: 3.0 } }, // 3% off sauce lines
        },
      ],
    };
  }

  return { discountApplicationStrategy: "FIRST", discounts: [] };
}