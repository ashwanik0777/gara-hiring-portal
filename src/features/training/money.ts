/*
 * Money for Industrial Training: stored as integer paise (INR), shown as rupees.
 * Client and server safe.
 */

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** "₹4,999" or "₹4,999.50". */
export function formatInr(paise: number): string {
  return INR.format(paise / 100);
}

/**
 * Paise from a rupee amount typed by staff ("4999", "4,999.50"); null when it is not a valid
 * positive amount with at most two decimals.
 */
export function rupeesToPaise(input: string | number): number | null {
  const text = String(input).replace(/[,\s₹]/g, "");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return paise > 0 ? paise : null;
}

/** "4999" or "4999.50" for form inputs. */
export function paiseToRupeesInput(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}
