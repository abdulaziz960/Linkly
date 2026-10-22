import { describe, expect, it } from "vitest";
import { DEFAULT_SALLA_STATUSES, parseSallaStatuses, updateSallaOrderStatus } from "../lib/salla";

describe("salla order status management", () => {
  it("parses the statuses list and skips entries without a slug or duplicates", () => {
    const parsed = parseSallaStatuses({ data: [
      { id: 1, name: "قيد التنفيذ", slug: "in_progress" },
      { id: 2, name: "حالة مخصصة" },
      { id: 3, name: "تم الشحن", slug: "shipped" },
      { id: 4, name: "مكرر", slug: "shipped" }
    ] });
    expect(parsed).toEqual([{ slug: "in_progress", label: "قيد التنفيذ" }, { slug: "shipped", label: "تم الشحن" }]);
  });

  it("returns an empty list for unexpected payloads", () => {
    expect(parseSallaStatuses(null)).toEqual([]);
    expect(parseSallaStatuses({ data: "x" })).toEqual([]);
  });

  it("ships a default status list covering the common slugs", () => {
    const slugs = DEFAULT_SALLA_STATUSES.map((status) => status.slug);
    expect(slugs).toEqual(expect.arrayContaining(["in_progress", "shipped", "delivered", "canceled"]));
  });

  it("rejects malformed ids and slugs before any network call", async () => {
    expect((await updateSallaOrderStatus("t1", "../orders", "shipped")).status).toBe(400);
    expect((await updateSallaOrderStatus("t1", "123", "bad slug!")).status).toBe(400);
  });
});

import { buildShipmentDraft, buildShipmentPayload, parseSallaBranches, parseSallaShippingCompanies } from "../lib/salla";

describe("salla shipments", () => {
  const order = {
    id: 987, reference_id: 202501, payment_method: "cod",
    customer: { first_name: "محمد", last_name: "العتيبي", mobile_code: "+966", mobile: "500000111", email: "m@example.com" },
    shipping: { address: { name: "محمد العتيبي", country: "SA", city: "الرياض", street: "طريق الملك فهد", block: "العليا", postal_code: "12211", short_address: "RRRD2929", building_number: "2929", additional_number: "1234", street_number: "10", geo_coordinates: { lat: 24.7, lng: 46.6 } } },
    items: [{ name: "قهوة", sku: "C1", quantity: 2, weight: 0.5, price: { amount: 40 } }]
  };

  it("builds a draft from the order and reports nothing missing when complete", () => {
    const draft = buildShipmentDraft(order);
    expect(draft?.paymentMethod).toBe("cod");
    expect(draft?.shipTo.phone).toBe("966500000111");
    expect(draft?.packages).toEqual([{ name: "قهوة", sku: "C1", price: 40, quantity: 2, weight: 0.5 }]);
    expect(draft?.missing).toEqual([]);
  });

  it("lists the required address fields the order lacks", () => {
    const draft = buildShipmentDraft({ id: 1, customer: { first_name: "سارة" }, items: [] });
    expect(draft?.missing).toEqual(expect.arrayContaining(["city", "postal_code", "short_address"]));
    expect(buildShipmentDraft({})).toBeNull();
  });

  it("builds the POST /shipments body", () => {
    const draft = buildShipmentDraft(order)!;
    const body = buildShipmentPayload({ courierId: "55", orderId: "987", paymentMethod: draft.paymentMethod, shipTo: draft.shipTo, packages: draft.packages, branchId: "7" });
    expect(body).toMatchObject({ courier_id: 55, shipment_type: "shipment", payment_method: "cod", order_id: 987, ship_from: { type: "branch", branch_id: 7 } });
    expect((body.ship_to as Record<string, unknown>).geo_coordinates).toEqual({ lat: 24.7, lng: 46.6 });
  });

  it("parses shipping companies and branches", () => {
    expect(parseSallaShippingCompanies({ data: [{ id: 5, name: "أرامكس", activation_type: "api" }, { name: "بلا معرف" }] })).toEqual([{ id: "5", name: "أرامكس", type: "api" }]);
    expect(parseSallaBranches({ data: [{ id: 3, name: "الرياض" }] })).toEqual([{ id: "3", name: "الرياض" }]);
  });
});
