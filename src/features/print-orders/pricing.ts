/*
 * Printed certificate pricing (shared by the server and the order form). Prices and delivery
 * times come from the administrators' print settings; courier orders are priced by zone, NCR or
 * outside NCR, decided from the delivery PIN code. The server always recomputes the price.
 */

export type PrintZone = "NCR" | "OUTSIDE_NCR";

export interface PrintPrice {
  pricePaise: number;
  expectedDelivery: string | null;
}

/** What a student can order right now. */
export interface PrintOffer {
  /** Ordering is switched on and at least one option has a price. */
  open: boolean;
  collegeBulk: PrintPrice | null;
  courierNcr: PrintPrice | null;
  courierOutside: PrintPrice | null;
  ncrPinPrefixes: string[];
  courierPartner: string | null;
}

export const PIN_CODE_PATTERN = /^[1-9]\d{5}$/;
export const PIN_PREFIX_PATTERN = /^[1-9]\d{1,5}$/;

export const ZONE_LABELS: Record<PrintZone, string> = {
  NCR: "Within NCR",
  OUTSIDE_NCR: "Outside NCR",
};

/** NCR when the PIN code starts with one of the configured prefixes. */
export function zoneForPincode(pincode: string, ncrPinPrefixes: readonly string[]): PrintZone {
  const pin = pincode.trim();
  return ncrPinPrefixes.some((prefix) => prefix.length > 0 && pin.startsWith(prefix)) ? "NCR" : "OUTSIDE_NCR";
}

/** The courier price for a PIN code, or null when that zone has no price. */
export function courierPriceFor(offer: PrintOffer, pincode: string): { zone: PrintZone; price: PrintPrice | null } {
  const zone = zoneForPincode(pincode, offer.ncrPinPrefixes);
  return { zone, price: zone === "NCR" ? offer.courierNcr : offer.courierOutside };
}

/** Lowest and highest courier price (for "₹149–₹179"), or null when courier is closed. */
export function courierPriceRange(offer: PrintOffer): { min: number; max: number } | null {
  const prices = [offer.courierNcr, offer.courierOutside].flatMap((price) => (price ? [price.pricePaise] : []));
  if (prices.length === 0) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/** Parses "110, 201 122" into unique prefixes, keeping the order typed. */
export function parsePinPrefixes(value: string): string[] {
  return [...new Set(value.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean))];
}
