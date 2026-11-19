import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/db";
import { assertPermission, type AuthenticatedUser } from "@/lib/auth/guards";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { trackSchema, type TrackInput } from "../schemas";

/** Cache tag of the public track reads; every track change expires it. */
export const PUBLIC_TRACKS_TAG = "tracks:public";

const PUBLIC_TRACK_CACHE_LIFE = { stale: 300, revalidate: 300, expire: 86_400 } as const;

const publicTrackSelect = { id: true, slug: true, name: true, description: true } as const;

export type PublicTrack = { id: string; slug: string; name: string; description: string | null };

/** Public Query (cached): active tracks in display order. */
export async function listActiveTracks(): Promise<PublicTrack[]> {
  "use cache";
  cacheTag(PUBLIC_TRACKS_TAG);
  cacheLife(PUBLIC_TRACK_CACHE_LIFE);

  return prisma.track.findMany({
    where: { isActive: true },
    select: publicTrackSelect,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** Public Query (cached): an active track by slug, or null. */
export async function getActiveTrackBySlug(slug: string): Promise<PublicTrack | null> {
  "use cache";
  cacheTag(PUBLIC_TRACKS_TAG);
  cacheLife(PUBLIC_TRACK_CACHE_LIFE);

  return prisma.track.findFirst({ where: { slug, isActive: true }, select: publicTrackSelect });
}

function parseTrack(input: unknown): TrackInput {
  const parsed = trackSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid track details", parsed.error.issues);
  }
  return { ...parsed.data, description: parsed.data.description?.trim() || null };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

/** Staff Query: every track (hidden ones too) with how many openings use it. */
export async function listTracksForStaff(user: AuthenticatedUser) {
  await assertPermission(user, "canOpenings");
  return prisma.track.findMany({
    select: { ...publicTrackSelect, sortOrder: true, isActive: true, _count: { select: { openings: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export type StaffTrack = Awaited<ReturnType<typeof listTracksForStaff>>[number];

/** Tracks for the opening form: the active ones, plus the opening's current track if hidden. */
export async function getTrackOptions(user: AuthenticatedUser, currentTrackId?: string | null) {
  const tracks = await listTracksForStaff(user);
  return tracks
    .filter((track) => track.isActive || track.id === currentTrackId)
    .map((track) => ({ id: track.id, name: track.name, isActive: track.isActive }));
}

/** Staff Mutation: adds a track. The slug is unique. */
export async function createTrack(rawInput: TrackInput, user: AuthenticatedUser) {
  await assertPermission(user, "canOpenings");
  const input = parseTrack(rawInput);
  try {
    return await prisma.$transaction(async (tx) => {
      const track = await tx.track.create({ data: input, select: { id: true, slug: true } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0],
          action: "TRACK_CREATED",
          resourceType: "track",
          resourceId: track.id,
          diffPayload: input,
        },
      });
      return track;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError(`A track with the slug "${input.slug}" already exists.`);
    throw error;
  }
}

/** Staff Mutation: edits a track (renaming, reordering or hiding it). */
export async function updateTrack(id: string, rawInput: TrackInput, user: AuthenticatedUser) {
  await assertPermission(user, "canOpenings");
  const input = parseTrack(rawInput);
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.track.findUnique({ where: { id }, select: { slug: true } });
      if (!existing) throw new NotFoundError("Track does not exist.");
      const track = await tx.track.update({ where: { id }, data: input, select: { id: true, slug: true } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0],
          action: "TRACK_UPDATED",
          resourceType: "track",
          resourceId: id,
          diffPayload: { ...input, previousSlug: existing.slug },
        },
      });
      return { ...track, previousSlug: existing.slug };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError(`A track with the slug "${input.slug}" already exists.`);
    throw error;
  }
}
