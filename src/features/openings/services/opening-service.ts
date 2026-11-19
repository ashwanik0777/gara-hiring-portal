import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import {
  OpeningStatus,
  OpeningType,
  WorkplaceType,
  Prisma,
} from "@prisma/client";
import type { z } from "zod";
import {
  CreateOpeningInput,
  UpdateOpeningInput,
  createOpeningSchema,
  updateOpeningSchema,
  openingStatusSchema,
  VALID_STATUS_TRANSITIONS,
} from "../schemas";
import {
  formSchemaDefinitionSchema,
  FormSchemaDefinitionInput,
} from "@/features/application-forms/schemas";
import { getDefaultApplicationFormSchema } from "@/features/application-forms/default-form";
import { FormSchemaDefinition } from "@/features/application-forms/types";
import { NotFoundError, ValidationError, ConflictError } from "@/lib/errors";
import { deadlineFromDateKey, normalizeSkills } from "../listing";
import { assertPermission, type AuthenticatedUser } from "@/lib/auth/guards";
import { logger } from "@/lib/logging/logger";

/**
 * Staff access to openings is gated by the granular `canOpenings` module permission
 * (ADMIN always holds it; sub-admin roles hold it through their configured permissions).
 * No additional role rule is applied: the permission matrix is pending OD-019 and the
 * sub-admin configuration UI describes `canOpenings` as "create and publish job postings".
 */
async function assertOpeningsAccess(user: AuthenticatedUser): Promise<void> {
  await assertPermission(user, "canOpenings");
}

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? message, parsed.error.issues);
  }
  return parsed.data;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}

/** Empty text from a form clears the field. */
function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Database values of the optional listing fields present in the input (absent keys are left
 * untouched on update). The deadline is stored as the end of the chosen day.
 */
function listingFieldsData(input: UpdateOpeningInput) {
  const data: {
    trackId?: string | null;
    summary?: string | null;
    skills?: string[];
    eligibility?: string | null;
    durationText?: string | null;
    stipendPolicyText?: string | null;
    openingsCount?: number | null;
    applyDeadline?: Date | null;
  } = {};
  if (input.trackId !== undefined) data.trackId = input.trackId || null;
  if (input.summary !== undefined) data.summary = blankToNull(input.summary);
  if (input.skills !== undefined) data.skills = normalizeSkills(input.skills);
  if (input.eligibility !== undefined) data.eligibility = blankToNull(input.eligibility);
  if (input.durationText !== undefined) data.durationText = blankToNull(input.durationText);
  if (input.stipendPolicyText !== undefined) data.stipendPolicyText = blankToNull(input.stipendPolicyText);
  if (input.openingsCount !== undefined) data.openingsCount = input.openingsCount ?? null;
  if (input.applyDeadline !== undefined) {
    data.applyDeadline = input.applyDeadline ? deadlineFromDateKey(input.applyDeadline) : null;
  }
  return data;
}

const CORE_OPENING_FIELDS = [
  "title",
  "slug",
  "department",
  "type",
  "location",
  "workplaceType",
  "description",
  "requirements",
  "responsibilities",
] as const;

/** The core opening fields present in the input (listing fields are mapped separately). */
function coreFieldsData(input: UpdateOpeningInput): Pick<UpdateOpeningInput, (typeof CORE_OPENING_FIELDS)[number]> {
  const data: Record<string, unknown> = {};
  for (const key of CORE_OPENING_FIELDS) {
    if (input[key] !== undefined) data[key] = input[key];
  }
  return data as Pick<UpdateOpeningInput, (typeof CORE_OPENING_FIELDS)[number]>;
}

/** A chosen track must exist and be active (a hidden track cannot get new openings). */
async function assertAssignableTrack(
  tx: Prisma.TransactionClient,
  trackId: string | null | undefined,
  currentTrackId?: string | null
): Promise<void> {
  if (!trackId || trackId === currentTrackId) return;
  const track = await tx.track.findUnique({ where: { id: trackId }, select: { isActive: true } });
  if (!track || !track.isActive) {
    throw new ValidationError("Choose an active track.", [{ path: ["trackId"], message: "Choose an active track." }]);
  }
}

// -----------------------------------------------------------------------------
// Public reads (served through "use cache")
// -----------------------------------------------------------------------------

/**
 * Cache tags of the public opening reads. Every entry carries the list tag; a single
 * opening also carries a slug tag and an id tag, so the Server Actions can expire the right
 * entries whether they know the slug (status changes) or only the id (form publishing).
 * These functions never read headers, cookies or the session: they are shared by everyone.
 */
export const PUBLIC_OPENINGS_TAG = "openings:public";

export function publicOpeningSlugTag(slug: string): string {
  return `opening:slug:${slug}`;
}

export function publicOpeningIdTag(id: string): string {
  return `opening:id:${id}`;
}

/**
 * Openings change rarely and every change expires the tags, so time-based revalidation is
 * only a safety net: refresh in the background every 5 minutes, serve a stale entry for up
 * to a day when nothing has asked for it, and let the client router reuse it for 5 minutes.
 */
const PUBLIC_OPENING_CACHE_LIFE = { stale: 300, revalidate: 300, expire: 86_400 } as const;

/** A missing or unpublished slug is cached briefly; publishing expires it immediately. */
const MISSING_OPENING_CACHE_LIFE = { stale: 60, revalidate: 60, expire: 600 } as const;

/** Columns the careers pages, the apply page, the metadata and the JobPosting JSON-LD render. */
const publicOpeningSelect = {
  id: true,
  title: true,
  slug: true,
  department: true,
  type: true,
  location: true,
  workplaceType: true,
  description: true,
  requirements: true,
  responsibilities: true,
  summary: true,
  skills: true,
  eligibility: true,
  durationText: true,
  stipendPolicyText: true,
  openingsCount: true,
  applyDeadline: true,
  track: { select: { slug: true, name: true } },
  status: true,
  activeFormVersionId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OpeningSelect;

/**
 * Public Query (cached): Lists all currently published openings.
 * Draft, paused, and closed vacancies are strictly hidden from candidate queries.
 */
export async function getPublicOpenings(filters?: {
  department?: string;
  type?: OpeningType;
  workplaceType?: WorkplaceType;
  search?: string;
  /** Only openings of this track (by track slug). */
  trackSlug?: string;
}) {
  "use cache";
  cacheTag(PUBLIC_OPENINGS_TAG);
  cacheLife(PUBLIC_OPENING_CACHE_LIFE);

  const where: Record<string, unknown> = {
    status: OpeningStatus.PUBLISHED,
  };

  if (filters?.department) {
    where.department = filters.department;
  }
  if (filters?.type) {
    where.type = filters.type;
  }
  if (filters?.workplaceType) {
    where.workplaceType = filters.workplaceType;
  }
  if (filters?.trackSlug) {
    where.track = { slug: filters.trackSlug, isActive: true };
  }
  if (filters?.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
      { department: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const openings = await prisma.opening.findMany({
    where,
    select: {
      id: true,
      title: true,
      slug: true,
      department: true,
      type: true,
      location: true,
      workplaceType: true,
      description: true,
      summary: true,
      durationText: true,
      stipendPolicyText: true,
      applyDeadline: true,
      track: { select: { slug: true, name: true } },
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // The deadline is compared at request time by the pages (a cached list cannot know "now").
  return openings;
}

/**
 * Public Query (cached): slugs and update times of the PUBLISHED openings for sitemap.xml.
 * Shares the list tag, so publishing or closing an opening refreshes the sitemap as well.
 */
export async function listPublishedOpeningSlugs(limit: number) {
  "use cache";
  cacheTag(PUBLIC_OPENINGS_TAG);
  cacheLife(PUBLIC_OPENING_CACHE_LIFE);

  return prisma.opening.findMany({
    where: { status: OpeningStatus.PUBLISHED },
    select: { slug: true, updatedAt: true, applyDeadline: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
}

/**
 * Cached read behind getPublicOpeningBySlug. It returns null instead of throwing so a miss
 * is cached (briefly) and tagged with the slug too; the caller turns null into NotFoundError.
 */
async function loadPublicOpeningBySlug(slug: string) {
  "use cache";
  cacheTag(PUBLIC_OPENINGS_TAG, publicOpeningSlugTag(slug));

  const opening = await prisma.opening.findUnique({
    where: { slug },
    select: {
      ...publicOpeningSelect,
      formVersions: {
        where: { isPublished: true },
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { id: true, versionNumber: true, schemaDefinition: true },
      },
    },
  });

  if (!opening || opening.status !== OpeningStatus.PUBLISHED) {
    cacheLife(MISSING_OPENING_CACHE_LIFE);
    return null;
  }

  cacheTag(publicOpeningIdTag(opening.id));
  cacheLife(PUBLIC_OPENING_CACHE_LIFE);

  const { formVersions, ...publicOpening } = opening;
  const activeForm = formVersions[0] ?? null;

  return {
    ...publicOpening,
    activeForm: activeForm
      ? {
          id: activeForm.id,
          versionNumber: activeForm.versionNumber,
          schemaDefinition: activeForm.schemaDefinition as unknown as FormSchemaDefinition,
        }
      : null,
  };
}

/**
 * Public Query (cached): Fetches a single published opening by slug with its active form version.
 */
export async function getPublicOpeningBySlug(slug: string) {
  const opening = await loadPublicOpeningBySlug(slug);
  if (!opening) {
    throw new NotFoundError(`Opening with slug "${slug}" was not found or is no longer accepting applications.`);
  }
  return opening;
}

export type PublicOpening = Awaited<ReturnType<typeof getPublicOpeningBySlug>>;

// -----------------------------------------------------------------------------
// Staff reads and mutations (never cached)
// -----------------------------------------------------------------------------

/** Upper bound for the staff openings table (newest first); the table has no pagination. */
export const ADMIN_OPENINGS_LIMIT = 500;

/**
 * Administrative Query: Lists openings across all lifecycle statuses, newest first.
 * Selects only the table columns plus the highest published ("Live") form version, never
 * every form version or its schema.
 */
export async function getAdminOpenings(user: AuthenticatedUser) {
  await assertOpeningsAccess(user);

  return prisma.opening.findMany({
    select: {
      id: true,
      title: true,
      slug: true,
      department: true,
      type: true,
      status: true,
      formVersions: {
        where: { isPublished: true },
        select: { id: true, versionNumber: true, isPublished: true },
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    take: ADMIN_OPENINGS_LIMIT,
  });
}

/**
 * Administrative Query: Fetches detailed opening by ID including all form versions.
 */
export async function getAdminOpeningById(id: string, user: AuthenticatedUser) {
  await assertOpeningsAccess(user);

  const opening = await prisma.opening.findUnique({
    where: { id },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      formVersions: {
        orderBy: { versionNumber: "desc" },
      },
    },
  });

  if (!opening) {
    throw new NotFoundError("Opening does not exist.");
  }

  return opening;
}

export type AdminOpeningDetail = Awaited<ReturnType<typeof getAdminOpeningById>>;

/**
 * Administrative Mutation: Creates a new opening in DRAFT status with an initial form version.
 */
export async function createOpening(rawInput: CreateOpeningInput, user: AuthenticatedUser) {
  await assertOpeningsAccess(user);

  const input = parseOrThrow(createOpeningSchema, rawInput, "Invalid opening details");

  // Friendly pre-check; the unique constraint on slug remains the source of truth.
  const existing = await prisma.opening.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError(`An opening with slug "${input.slug}" already exists. Please choose a unique slug.`);
  }

  const defaultFormSchema = getDefaultApplicationFormSchema(input.type);

  // Execute in transaction
  const opening = await prisma.$transaction(async (tx) => {
    await assertAssignableTrack(tx, input.trackId);
    const created = await tx.opening.create({
      data: {
        title: input.title,
        slug: input.slug,
        department: input.department,
        type: input.type,
        location: input.location,
        workplaceType: input.workplaceType,
        description: input.description,
        requirements: input.requirements,
        responsibilities: input.responsibilities,
        ...listingFieldsData(input),
        status: OpeningStatus.DRAFT,
        createdById: user.id,
      },
    });

    // Create initial form version 1
    const formVersion = await tx.openingFormVersion.create({
      data: {
        openingId: created.id,
        versionNumber: 1,
        schemaDefinition: defaultFormSchema as unknown as Prisma.InputJsonValue,
        isPublished: false,
        createdById: user.id,
      },
    });

    // Link active form version
    await tx.opening.update({
      where: { id: created.id },
      data: { activeFormVersionId: formVersion.id },
    });

    // Record audit log
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: user.roles[0],
        action: "OPENING_CREATED",
        resourceType: "opening",
        resourceId: created.id,
        diffPayload: { title: created.title, slug: created.slug, type: created.type },
      },
    });

    return created;
  });

  logger.info(`Opening created: ${opening.title} (${opening.id}) by user ${user.id}`);
  return opening;
}

/**
 * Administrative Mutation: Updates opening details.
 * Read, slug check, update and audit run in one transaction.
 */
export async function updateOpening(id: string, rawInput: UpdateOpeningInput, user: AuthenticatedUser) {
  await assertOpeningsAccess(user);

  const input = parseOrThrow(updateOpeningSchema, rawInput, "Invalid opening details");

  return prisma.$transaction(async (tx) => {
    const existing = await tx.opening.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError("Opening does not exist.");
    }

    if (input.slug && input.slug !== existing.slug) {
      const slugTaken = await tx.opening.findUnique({
        where: { slug: input.slug },
        select: { id: true },
      });
      if (slugTaken) {
        throw new ConflictError(`Slug "${input.slug}" is already in use by another opening.`);
      }
    }

    await assertAssignableTrack(tx, input.trackId, existing.trackId);

    // Guard against a concurrent edit that changed the record after it was read.
    const result = await tx.opening.updateMany({
      where: { id, updatedAt: existing.updatedAt },
      data: { ...coreFieldsData(input), ...listingFieldsData(input), updatedAt: new Date() },
    });
    if (result.count !== 1) {
      throw new ConflictError("This opening was modified by someone else. Refresh and try again.");
    }

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: user.roles[0],
        action: "OPENING_UPDATED",
        resourceType: "opening",
        resourceId: id,
        diffPayload: input as unknown as Prisma.InputJsonValue,
      },
    });

    return tx.opening.findUniqueOrThrow({ where: { id } });
  });
}

/**
 * Administrative Mutation: Enforces valid state machine transitions for an opening.
 * The read, form auto-publish, conditional status update and audit log are atomic;
 * a concurrent transition makes the conditional update fail instead of overwriting it.
 */
export async function updateOpeningStatus(
  id: string,
  rawStatus: OpeningStatus,
  user: AuthenticatedUser
) {
  await assertOpeningsAccess(user);

  const newStatus = parseOrThrow(openingStatusSchema, rawStatus, "Invalid opening status");

  const outcome = await prisma.$transaction(async (tx) => {
    const opening = await tx.opening.findUnique({ where: { id } });
    if (!opening) {
      throw new NotFoundError("Opening does not exist.");
    }

    if (opening.status === newStatus) {
      return { opening, changed: false };
    }

    const allowedTransitions = VALID_STATUS_TRANSITIONS[opening.status];
    if (!allowedTransitions.includes(newStatus)) {
      throw new ValidationError(
        `Invalid status transition: Cannot change opening status from ${opening.status} to ${newStatus}. Valid transitions are: ${allowedTransitions.join(", ") || "none (terminal state)"}`
      );
    }

    // Publishing requires an application form version that candidates can use.
    let activeFormVersionId = opening.activeFormVersionId;
    if (newStatus === OpeningStatus.PUBLISHED) {
      const activeForm = await tx.openingFormVersion.findFirst({
        where: { openingId: id, isPublished: true },
        orderBy: { versionNumber: "desc" },
        select: { id: true },
      });

      if (!activeForm) {
        // Publish the latest form version if none has been published yet
        const latestForm = await tx.openingFormVersion.findFirst({
          where: { openingId: id },
          orderBy: { versionNumber: "desc" },
          select: { id: true },
        });
        if (!latestForm) {
          throw new ValidationError(
            "This opening has no application form. Save a form version before publishing."
          );
        }
        await tx.openingFormVersion.update({
          where: { id: latestForm.id },
          data: { isPublished: true },
        });
        activeFormVersionId = latestForm.id;
      }
    }

    const result = await tx.opening.updateMany({
      where: { id, status: opening.status },
      data: { status: newStatus, activeFormVersionId },
    });
    if (result.count !== 1) {
      throw new ConflictError(
        "The opening status was changed by someone else. Refresh the page and try again."
      );
    }

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: user.roles[0],
        action: "OPENING_STATUS_CHANGED",
        resourceType: "opening",
        resourceId: id,
        diffPayload: { fromStatus: opening.status, toStatus: newStatus },
      },
    });

    return {
      opening: { ...opening, status: newStatus, activeFormVersionId },
      changed: true,
      fromStatus: opening.status,
    };
  });

  if (outcome.changed) {
    logger.info(`Opening ${id} status transitioned from ${outcome.fromStatus} to ${newStatus}`);
  }
  return outcome.opening;
}

/**
 * Administrative Mutation: Dynamic Form Builder Versioning.
 * Ensures historical candidate applications are never reinterpreted by bumping version numbers
 * when updating a published form. Published versions are never modified in place.
 */
export async function saveOpeningFormVersion(
  openingId: string,
  rawSchema: FormSchemaDefinitionInput,
  shouldPublish = true,
  user: AuthenticatedUser
) {
  await assertOpeningsAccess(user);

  const validatedSchema = parseOrThrow(
    formSchemaDefinitionSchema,
    rawSchema,
    "Invalid application form definition"
  );

  try {
    return await prisma.$transaction(async (tx) => {
      const opening = await tx.opening.findUnique({
        where: { id: openingId },
        include: {
          formVersions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
          },
        },
      });

      if (!opening) {
        throw new NotFoundError("Opening does not exist.");
      }

      const latestVersion = opening.formVersions[0];

      // If the latest version was already published or the opening is live, a new version
      // MUST be created to protect historical integrity.
      const mustCreateNewVersion =
        !latestVersion || latestVersion.isPublished || opening.status === OpeningStatus.PUBLISHED;

      if (mustCreateNewVersion) {
        const newVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

        // The (openingId, versionNumber) unique constraint rejects a concurrent save.
        const created = await tx.openingFormVersion.create({
          data: {
            openingId,
            versionNumber: newVersionNumber,
            schemaDefinition: validatedSchema as unknown as Prisma.InputJsonValue,
            isPublished: shouldPublish,
            createdById: user.id,
          },
        });

        if (shouldPublish) {
          await tx.opening.update({
            where: { id: openingId },
            data: { activeFormVersionId: created.id },
          });
        }

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            actorRole: user.roles[0],
            action: "FORM_VERSION_CREATED",
            resourceType: "opening_form_version",
            resourceId: created.id,
            diffPayload: { versionNumber: newVersionNumber, isPublished: shouldPublish },
          },
        });

        logger.info(`New Form Version ${newVersionNumber} created for Opening ${openingId}`);
        return created;
      }

      // The latest version is still an unpublished draft: update it in place, but only
      // while it is still unpublished (it may have been published concurrently).
      const result = await tx.openingFormVersion.updateMany({
        where: { id: latestVersion.id, isPublished: false },
        data: {
          schemaDefinition: validatedSchema as unknown as Prisma.InputJsonValue,
          isPublished: shouldPublish,
        },
      });
      if (result.count !== 1) {
        throw new ConflictError(
          "This form version was published in the meantime. Refresh the page to edit a new version."
        );
      }

      if (shouldPublish) {
        await tx.opening.update({
          where: { id: openingId },
          data: { activeFormVersionId: latestVersion.id },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0],
          action: "FORM_VERSION_UPDATED",
          resourceType: "opening_form_version",
          resourceId: latestVersion.id,
          diffPayload: { versionNumber: latestVersion.versionNumber, isPublished: shouldPublish },
        },
      });

      return {
        ...latestVersion,
        schemaDefinition: validatedSchema as unknown as Prisma.JsonValue,
        isPublished: shouldPublish,
      };
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw new ConflictError(
        "Another form version was saved at the same time. Refresh the page and try again."
      );
    }
    throw error;
  }
}
