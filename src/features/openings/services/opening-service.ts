import { prisma } from "@/lib/db";
import {
  OpeningStatus,
  OpeningType,
  WorkplaceType,
  Role,
  Prisma,
} from "@prisma/client";
import {
  CreateOpeningInput,
  UpdateOpeningInput,
  createOpeningSchema,
  updateOpeningSchema,
  VALID_STATUS_TRANSITIONS,
} from "../schemas";
import {
  formSchemaDefinitionSchema,
  FormSchemaDefinitionInput,
} from "@/features/application-forms/schemas";
import { getDefaultApplicationFormSchema } from "@/features/application-forms/default-form";
import { FormSchemaDefinition } from "@/features/application-forms/types";
import { NotFoundError, ValidationError, ForbiddenError } from "@/lib/errors";
import { AuthenticatedUser } from "@/lib/auth/guards";
import { logger } from "@/lib/logging/logger";

/**
 * Public Query: Lists all currently published openings.
 * Draft, paused, and closed vacancies are strictly hidden from candidate queries.
 */
export async function getPublicOpenings(filters?: {
  department?: string;
  type?: OpeningType;
  workplaceType?: WorkplaceType;
  search?: string;
}) {
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
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return openings;
}

/**
 * Public Query: Fetches a single published opening by slug with its active form version.
 */
export async function getPublicOpeningBySlug(slug: string) {
  const opening = await prisma.opening.findUnique({
    where: { slug },
    include: {
      formVersions: {
        where: { isPublished: true },
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
  });

  if (!opening || opening.status !== OpeningStatus.PUBLISHED) {
    throw new NotFoundError(`Opening with slug "${slug}" was not found or is no longer accepting applications.`);
  }

  const activeForm = opening.formVersions[0] ?? null;

  return {
    ...opening,
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
 * Administrative Query: Lists all openings across all lifecycle statuses.
 */
export async function getAdminOpenings(user: AuthenticatedUser) {
  if (!user.roles.includes(Role.ADMIN) && !user.roles.includes(Role.HR)) {
    throw new ForbiddenError("Administrative authorization required to access opening records.");
  }

  return prisma.opening.findMany({
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      formVersions: {
        select: { id: true, versionNumber: true, isPublished: true },
        orderBy: { versionNumber: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Administrative Query: Fetches detailed opening by ID including all form versions.
 */
export async function getAdminOpeningById(id: string, user: AuthenticatedUser) {
  if (!user.roles.includes(Role.ADMIN) && !user.roles.includes(Role.HR)) {
    throw new ForbiddenError("Administrative authorization required to access opening details.");
  }

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
    throw new NotFoundError(`Opening with ID "${id}" does not exist.`);
  }

  return opening;
}

/**
 * Administrative Mutation: Creates a new opening in DRAFT status with an initial form version.
 */
export async function createOpening(rawInput: CreateOpeningInput, user: AuthenticatedUser) {
  if (!user.roles.includes(Role.ADMIN) && !user.roles.includes(Role.HR)) {
    throw new ForbiddenError("Only Administrators and HR personnel can create job openings.");
  }

  const input = createOpeningSchema.parse(rawInput);

  // Check slug uniqueness
  const existing = await prisma.opening.findUnique({
    where: { slug: input.slug },
  });
  if (existing) {
    throw new ValidationError(`An opening with slug "${input.slug}" already exists. Please choose a unique slug.`);
  }

  const defaultFormSchema = getDefaultApplicationFormSchema(input.type);

  // Execute in transaction
  const opening = await prisma.$transaction(async (tx) => {
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
 */
export async function updateOpening(id: string, rawInput: UpdateOpeningInput, user: AuthenticatedUser) {
  if (!user.roles.includes(Role.ADMIN) && !user.roles.includes(Role.HR)) {
    throw new ForbiddenError("Only Administrators and HR personnel can update job openings.");
  }

  const input = updateOpeningSchema.parse(rawInput);

  const existing = await prisma.opening.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError(`Opening with ID "${id}" does not exist.`);
  }

  if (input.slug && input.slug !== existing.slug) {
    const slugTaken = await prisma.opening.findUnique({ where: { slug: input.slug } });
    if (slugTaken) {
      throw new ValidationError(`Slug "${input.slug}" is already in use by another opening.`);
    }
  }

  const updated = await prisma.opening.update({
    where: { id },
    data: {
      ...input,
      updatedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      actorRole: user.roles[0],
      action: "OPENING_UPDATED",
      resourceType: "opening",
      resourceId: id,
      diffPayload: input as unknown as Prisma.InputJsonValue,
    },
  });

  return updated;
}

/**
 * Administrative Mutation: Enforces valid state machine transitions for an opening.
 */
export async function updateOpeningStatus(
  id: string,
  newStatus: OpeningStatus,
  user: AuthenticatedUser
) {
  if (!user.roles.includes(Role.ADMIN) && !user.roles.includes(Role.HR)) {
    throw new ForbiddenError("Only Administrators and HR personnel can change opening status.");
  }

  const opening = await prisma.opening.findUnique({ where: { id } });
  if (!opening) {
    throw new NotFoundError(`Opening with ID "${id}" does not exist.`);
  }

  if (opening.status === newStatus) {
    return opening;
  }

  const allowedTransitions = VALID_STATUS_TRANSITIONS[opening.status];
  if (!allowedTransitions.includes(newStatus)) {
    throw new ValidationError(
      `Invalid status transition: Cannot change opening status from ${opening.status} to ${newStatus}. Valid transitions are: ${allowedTransitions.join(", ") || "none (terminal state)"}`
    );
  }

  // Publishing requires that an active published form version exists
  if (newStatus === OpeningStatus.PUBLISHED) {
    const activeForm = await prisma.openingFormVersion.findFirst({
      where: { openingId: id, isPublished: true },
    });

    if (!activeForm) {
      // Auto-publish latest form version if not yet marked published
      const latestForm = await prisma.openingFormVersion.findFirst({
        where: { openingId: id },
        orderBy: { versionNumber: "desc" },
      });

      if (latestForm) {
        await prisma.openingFormVersion.update({
          where: { id: latestForm.id },
          data: { isPublished: true },
        });
        await prisma.opening.update({
          where: { id },
          data: { activeFormVersionId: latestForm.id },
        });
      }
    }
  }

  const updated = await prisma.opening.update({
    where: { id },
    data: { status: newStatus },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      actorRole: user.roles[0],
      action: "OPENING_STATUS_CHANGED",
      resourceType: "opening",
      resourceId: id,
      diffPayload: { fromStatus: opening.status, toStatus: newStatus },
    },
  });

  logger.info(`Opening ${id} status transitioned from ${opening.status} to ${newStatus}`);
  return updated;
}

/**
 * Administrative Mutation: Dynamic Form Builder Versioning.
 * Ensures historical candidate applications are never reinterpreted by bumping version numbers
 * when updating a published form.
 */
export async function saveOpeningFormVersion(
  openingId: string,
  rawSchema: FormSchemaDefinitionInput,
  shouldPublish = true,
  user: AuthenticatedUser
) {
  if (!user.roles.includes(Role.ADMIN) && !user.roles.includes(Role.HR)) {
    throw new ForbiddenError("Only Administrators and HR personnel can modify application form definitions.");
  }

  const validatedSchema = formSchemaDefinitionSchema.parse(rawSchema);

  const opening = await prisma.opening.findUnique({
    where: { id: openingId },
    include: {
      formVersions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
  });

  if (!opening) {
    throw new NotFoundError(`Opening with ID "${openingId}" does not exist.`);
  }

  const latestVersion = opening.formVersions[0];

  // If the latest version was already published or opening is published, we MUST create a new version
  // to protect historical integrity
  const mustCreateNewVersion = !latestVersion || latestVersion.isPublished || opening.status === OpeningStatus.PUBLISHED;

  if (mustCreateNewVersion) {
    const newVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

    const newFormVersion = await prisma.$transaction(async (tx) => {
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

      return created;
    });

    logger.info(`New Form Version ${newVersionNumber} created for Opening ${openingId}`);
    return newFormVersion;
  } else {
    // If current latest version was still an unpublished draft, update in-place
    const updated = await prisma.openingFormVersion.update({
      where: { id: latestVersion.id },
      data: {
        schemaDefinition: validatedSchema as unknown as Prisma.InputJsonValue,
        isPublished: shouldPublish,
      },
    });

    if (shouldPublish) {
      await prisma.opening.update({
        where: { id: openingId },
        data: { activeFormVersionId: updated.id },
      });
    }

    return updated;
  }
}
