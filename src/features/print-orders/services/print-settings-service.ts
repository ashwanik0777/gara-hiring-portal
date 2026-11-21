import { cacheLife, cacheTag } from "next/cache";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { PIN_PREFIX_PATTERN, type PrintOffer, type PrintPrice } from "../pricing";

/*
 * Printed certificate settings: prices, delivery times, the PIN codes that count as NCR and
 * whether ordering is open. Administrators change them from Print Orders → Settings; one row
 * (id 1). Without a row nothing can be ordered.
 */

export const PRINT_SETTINGS_TAG = "print:settings";
const SETTINGS_ID = 1;
const PUBLIC_CACHE_LIFE = { stale: 300, revalidate: 300, expire: 86_400 } as const;

export interface PrintSettingsValues {
  orderingOpen: boolean;
  collegeBulkPricePaise: number | null;
  courierNcrPricePaise: number | null;
  courierOutsidePricePaise: number | null;
  collegeBulkDelivery: string | null;
  courierNcrDelivery: string | null;
  courierOutsideDelivery: string | null;
  ncrPinPrefixes: string[];
  courierPartner: string | null;
}

export const EMPTY_PRINT_SETTINGS: PrintSettingsValues = {
  orderingOpen: false,
  collegeBulkPricePaise: null,
  courierNcrPricePaise: null,
  courierOutsidePricePaise: null,
  collegeBulkDelivery: null,
  courierNcrDelivery: null,
  courierOutsideDelivery: null,
  ncrPinPrefixes: [],
  courierPartner: null,
};

const settingsSelect = {
  orderingOpen: true,
  collegeBulkPricePaise: true,
  courierNcrPricePaise: true,
  courierOutsidePricePaise: true,
  collegeBulkDelivery: true,
  courierNcrDelivery: true,
  courierOutsideDelivery: true,
  ncrPinPrefixes: true,
  courierPartner: true,
} as const;

/** The saved settings (not cached: checkout prices must be current). */
export async function readPrintSettings(): Promise<PrintSettingsValues> {
  const row = await prisma.printSettings.findUnique({ where: { id: SETTINGS_ID }, select: settingsSelect });
  return row ? { ...row, ncrPinPrefixes: row.ncrPinPrefixes ?? [] } : EMPTY_PRINT_SETTINGS;
}

function price(pricePaise: number | null, expectedDelivery: string | null): PrintPrice | null {
  return pricePaise !== null && pricePaise > 0 ? { pricePaise, expectedDelivery } : null;
}

export function toPrintOffer(settings: PrintSettingsValues): PrintOffer {
  const collegeBulk = price(settings.collegeBulkPricePaise, settings.collegeBulkDelivery);
  const courierNcr = settings.ncrPinPrefixes.length > 0 ? price(settings.courierNcrPricePaise, settings.courierNcrDelivery) : null;
  const courierOutside = price(settings.courierOutsidePricePaise, settings.courierOutsideDelivery);
  return {
    open: settings.orderingOpen && Boolean(collegeBulk || courierNcr || courierOutside),
    collegeBulk,
    courierNcr,
    courierOutside,
    ncrPinPrefixes: settings.ncrPinPrefixes,
    courierPartner: settings.courierPartner,
  };
}

/** Current offer, read fresh (order form, checkout, admin pages). */
export async function getPrintOffer(): Promise<PrintOffer> {
  return toPrintOffer(await readPrintSettings());
}

/** Current offer for public pages (cached; refreshed when the settings are saved). */
export async function getPublicPrintOffer(): Promise<PrintOffer> {
  "use cache";
  cacheTag(PRINT_SETTINGS_TAG);
  cacheLife(PUBLIC_CACHE_LIFE);
  return getPrintOffer();
}

// ----------------------------------------------------------------------------- admin

const rupees = (label: string) =>
  z
    .string()
    .trim()
    .max(6, `${label} is too long`)
    .refine((value) => value === "" || /^\d+$/.test(value), `${label}: enter a whole rupee amount`)
    .transform((value) => (value === "" ? null : Number(value) * 100))
    .refine((value) => value === null || (value >= 100 && value <= 1_000_000), `${label} must be between ₹1 and ₹10,000`);

const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long`)
    .transform((value) => value || null);

export const printSettingsSchema = z
  .object({
    orderingOpen: z.boolean(),
    collegeBulkPrice: rupees("College bulk price"),
    courierNcrPrice: rupees("NCR courier price"),
    courierOutsidePrice: rupees("Outside NCR courier price"),
    collegeBulkDelivery: optionalText("College bulk delivery time", 60),
    courierNcrDelivery: optionalText("NCR delivery time", 60),
    courierOutsideDelivery: optionalText("Outside NCR delivery time", 60),
    ncrPinPrefixes: z
      .array(z.string().trim().regex(PIN_PREFIX_PATTERN, "NCR PIN codes are 2 to 6 digits and do not start with 0"))
      .max(50, "Add at most 50 NCR PIN codes")
      .transform((items) => [...new Set(items)]),
    courierPartner: optionalText("Courier partner", 80),
  })
  .superRefine((value, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (value.collegeBulkPrice !== null && !value.collegeBulkDelivery) issue("Enter the delivery time for college bulk.");
    if (value.courierNcrPrice !== null && !value.courierNcrDelivery) issue("Enter the delivery time within NCR.");
    if (value.courierOutsidePrice !== null && !value.courierOutsideDelivery) issue("Enter the delivery time outside NCR.");
    if (value.courierNcrPrice !== null && value.ncrPinPrefixes.length === 0) issue("Add the NCR PIN codes, or clear the NCR courier price.");
    if (value.orderingOpen && value.collegeBulkPrice === null && value.courierNcrPrice === null && value.courierOutsidePrice === null) {
      issue("Set at least one price before opening orders.");
    }
  });

export type PrintSettingsInput = z.input<typeof printSettingsSchema>;

/** Administrators: save the print settings (audited with the old and new values). */
export async function updatePrintSettings(user: AuthenticatedUser, raw: unknown): Promise<PrintSettingsValues> {
  if (!user.roles.includes(Role.ADMIN)) throw new ForbiddenError("Only administrators can change print settings.");
  const parsed = printSettingsSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Check the print settings.");
  const input = parsed.data;
  const next: PrintSettingsValues = {
    orderingOpen: input.orderingOpen,
    collegeBulkPricePaise: input.collegeBulkPrice,
    courierNcrPricePaise: input.courierNcrPrice,
    courierOutsidePricePaise: input.courierOutsidePrice,
    collegeBulkDelivery: input.collegeBulkDelivery,
    courierNcrDelivery: input.courierNcrDelivery,
    courierOutsideDelivery: input.courierOutsideDelivery,
    ncrPinPrefixes: input.ncrPinPrefixes,
    courierPartner: input.courierPartner,
  };
  return prisma.$transaction(async (tx) => {
    const before = await tx.printSettings.findUnique({ where: { id: SETTINGS_ID }, select: settingsSelect });
    await tx.printSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...next, updatedById: user.id },
      update: { ...next, updatedById: user.id },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: Role.ADMIN,
        action: "PRINT_SETTINGS_UPDATED",
        resourceType: "PrintSettings",
        resourceId: String(SETTINGS_ID),
        diffPayload: { before: before ?? null, after: { ...next } },
      },
    });
    return next;
  });
}
