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

import { buildShipmentDraft, buildShipmentPayload, parseSallaBranches, parseSallaShippingCompanies, shipToProblems, splitCoordinates } from "../lib/salla";

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

describe("salla shipment duplicates", () => {
  it("flags an order that already has a shipment", () => {
    const withShipment = buildShipmentDraft({ id: 5, shipments: [{ tracking_number: "TRK1", courier_name: "أرامكس" }], items: [] });
    expect(withShipment?.existing).toEqual({ company: "أرامكس", trackingNumber: "TRK1", trackingUrl: "" });
    expect(buildShipmentDraft({ id: 6, items: [] })?.existing).toBeNull();
  });

  it("asks Salla to overwrite a pending shipment only when told to", () => {
    const base = { courierId: "1", orderId: "5", paymentMethod: "cod" as const, shipTo: buildShipmentDraft({ id: 5, items: [] })!.shipTo, packages: [] };
    expect(buildShipmentPayload(base)).not.toHaveProperty("overwrite_exists_pending");
    expect(buildShipmentPayload({ ...base, overwritePending: true })).toMatchObject({ overwrite_exists_pending: true });
  });
});

import { buildOrderUpdatePayload, parseSallaLocations } from "../lib/salla";

describe("salla order address update", () => {
  const shipTo = buildShipmentDraft({
    id: 1, customer: { first_name: "محمد", mobile_code: "+966", mobile: "500000111", email: "m@example.com" },
    shipping: { address: { country: "SA", city: "جدة", street: "شارع التحلية", block: "الروضة", postal_code: "23432", short_address: "JJJJ1111", building_number: "1111", additional_number: "2222", street_number: "5", geo_coordinates: { lat: 21.5, lng: 39.2 } } },
    items: []
  })!.shipTo;

  it("sends the phone with its country prefix and an ISO country code, and Salla's ids for the location", () => {
    const body = buildOrderUpdatePayload(shipTo, { countryId: "1473353380", cityId: "1939592358", districtId: "77" }) as { receiver: Record<string, unknown>; shipping: { ship_to: Record<string, unknown> } };
    expect(body.receiver).toMatchObject({ name: "محمد", phone: "966500000111", country_code: "SA", email: "m@example.com" });
    expect(body.shipping.ship_to).toMatchObject({ country: 1473353380, city: 1939592358, district: 77, address_line: "شارع التحلية", postal_code: "23432", geo_coordinates: { lat: 21.5, lng: 39.2 } });
    expect(body).not.toHaveProperty("items");
    expect(body).not.toHaveProperty("status");
  });

  it("leaves the location ids out when none was chosen", () => {
    const body = buildOrderUpdatePayload(shipTo) as { shipping: { ship_to: Record<string, unknown> } };
    expect(body.shipping.ship_to).not.toHaveProperty("country");
    expect(body.shipping.ship_to).not.toHaveProperty("city");
  });

  it("parses Salla's location lists", () => {
    expect(parseSallaLocations({ data: [{ id: 1, name: "الرياض", name_en: "Riyadh" }, { name: "بلا معرف" }] })).toEqual([{ id: "1", name: "الرياض", nameEn: "Riyadh", code: "" }]);
    expect(parseSallaLocations({ data: [{ id: 5, name: "المملكة", name_en: "Saudi Arabia", code: "SA" }] })[0].code).toBe("SA");
  });
});

import { buildNewOrderPayload, parseSallaProducts } from "../lib/salla";

describe("salla new order", () => {
  it("builds a pending-payment order body with products by id", () => {
    const body = buildNewOrderPayload({
      customer: { name: " سارة ", mobile: "966500000111", email: "s@example.com" },
      products: [{ id: "55", quantity: 2 }],
      acceptedMethods: ["mada", "cod"],
      delivery: { method: "none" },
      couponCode: " SAVE10 "
    });
    expect(body).toEqual({
      customer: { name: "سارة", mobile: "+966500000111", email: "s@example.com" },
      products: [{ identifier_type: "id", identifier: 55, quantity: 2 }],
      payment: { status: "pending_payment", accepted_methods: ["mada", "cod"] },
      delivery_method: null,
      coupon_code: "SAVE10"
    });
  });

  it("adds the branch for pickup", () => {
    const body = buildNewOrderPayload({ customer: { name: "a", mobile: "0096650000011", email: "a@b.co" }, products: [{ id: "1", quantity: 0 }], acceptedMethods: ["mada"], delivery: { method: "pickup", branchId: "9" } });
    expect(body).toMatchObject({ delivery_method: "pickup", branch_id: 9, customer: { mobile: "+96650000011" }, products: [{ quantity: 1 }] });
  });

  it("parses the products list", () => {
    expect(parseSallaProducts({ data: [{ id: 1, name: "قهوة", sku: "C1", price: { amount: 40, currency: "SAR" } }, { name: "بلا معرف" }] })).toEqual([{ id: "1", name: "قهوة", sku: "C1", price: 40, currency: "SAR" }]);
  });
});

import { ordersForPhone, type StoreOrder } from "../lib/salla";

describe("salla orders for a customer's phone", () => {
  const make = (id: string, phone: string): StoreOrder => ({ id, reference: id, statusSlug: "in_progress", statusLabel: "قيد التنفيذ", customerName: "x", customerPhone: phone, total: 10, currency: "SAR", trackingNumber: "", trackingUrl: "", shippingCompany: "" });

  it("matches on the last 9 digits regardless of the country prefix", () => {
    const orders = [make("1", "966500000111"), make("2", "966500000222"), make("3", "500000111")];
    expect(ordersForPhone(orders, "+966 50 000 0111").map((order) => order.id)).toEqual(["1", "3"]);
  });

  it("returns nothing for short or missing phones and respects the limit", () => {
    expect(ordersForPhone([make("1", "966500000111")], "123")).toEqual([]);
    const many = Array.from({ length: 8 }, (_, index) => make(String(index), "966500000111"));
    expect(ordersForPhone(many, "966500000111", 5)).toHaveLength(5);
  });
});

describe("salla shipment items", () => {
  it("reads items whose price is only given as a line total", () => {
    const draft = buildShipmentDraft({ id: 3, items: [{ name: "قهوة", quantity: 2, amounts: { total: { amount: 80 } } }] });
    expect(draft?.packages).toEqual([{ name: "قهوة", sku: "", price: 40, quantity: 2, weight: 1 }]);
  });
});

describe("salla ship_to validation", () => {
  const base = { name: "a", email: "", phone: "", country: "SA", city: "الرياض", address_line: "x", street_number: "", block: "", short_address: "RHMA3184", building_number: "", additional_number: "", postal_code: "", lat: "24.7", lng: "46.6" };

  it("accepts a complete address", () => {
    expect(shipToProblems(base)).toEqual([]);
  });

  it("flags a bad short address and missing coordinates", () => {
    expect(shipToProblems({ ...base, short_address: "RH12" })[0]).toMatch(/4 أحرف/);
    expect(shipToProblems({ ...base, short_address: "" })[0]).toMatch(/مطلوب/);
    expect(shipToProblems({ ...base, lat: "", lng: "" })[0]).toMatch(/الإحداثيات/);
    expect(shipToProblems({ ...base, lat: "200", lng: "46" })[0]).toMatch(/غير صحيحة/);
  });

  it("splits coordinates pasted from Google Maps", () => {
    expect(splitCoordinates("24.7136, 46.6753")).toEqual({ lat: "24.7136", lng: "46.6753" });
    expect(splitCoordinates("24.7136،46.6753")).toEqual({ lat: "24.7136", lng: "46.6753" });
    expect(splitCoordinates("24.7136")).toBeNull();
  });
});
