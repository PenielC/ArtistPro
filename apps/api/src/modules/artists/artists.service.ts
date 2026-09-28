import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { firstFreeSlug, slugify } from './artist-slug';
import { CreateArtistDto } from './dto/create-artist.dto';
import { UpdateArtistDto } from './dto/update-artist.dto';

const MAX_SLUG_ATTEMPTS = 3;
const SLUG_TAKEN = 'That profile link is already taken. Please choose another.';

// Linked-work counts for the roster cards, and the press-kit status for the EPK list.
const ARTIST_INCLUDE = {
  _count: { select: { bookings: true, quotes: true, contracts: true, invoices: true } },
  epk: { select: { isPublished: true, updatedAt: true } },
} satisfies Prisma.ArtistInclude;

// Everything the public /a/:slug page may show — never the organisation, internal ids or timestamps.
export const PUBLIC_ARTIST_FIELDS = {
  name: true,
  slug: true,
  category: true,
  genres: true,
  tagline: true,
  bio: true,
  location: true,
  photoUrl: true,
  bookingEmail: true,
  bookingPhone: true,
  website: true,
  instagram: true,
  facebook: true,
  tiktok: true,
  youtube: true,
  spotify: true,
} satisfies Prisma.ArtistSelect;

/** Trimmed, blank-free, case-insensitively de-duplicated. */
export function cleanGenres(genres: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of genres) {
    const genre = raw.trim();
    if (genre && !seen.has(genre.toLowerCase())) {
      seen.add(genre.toLowerCase());
      result.push(genre);
    }
  }
  return result;
}

function isSlugCollision(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  const target = err.meta?.target;
  return Array.isArray(target) ? target.includes('slug') : String(target ?? '').includes('slug');
}

@Injectable()
export class ArtistsService {
  constructor(private readonly prisma: PrismaService) {}

  private async generateSlug(name: string): Promise<string> {
    const base = slugify(name);
    const existing = await this.prisma.artist.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });
    return firstFreeSlug(
      base,
      existing.map((a) => a.slug),
    );
  }

  private async assertSlugFree(slug: string, exceptId?: string) {
    const owner = await this.prisma.artist.findUnique({ where: { slug }, select: { id: true } });
    if (owner && owner.id !== exceptId) throw new ConflictException(SLUG_TAKEN);
  }

  async create(organizationId: string, dto: CreateArtistDto) {
    const { slug: requestedSlug, genres, ...rest } = dto;
    if (requestedSlug) await this.assertSlugFree(requestedSlug);

    // A generated slug can lose a race with a concurrent create, so pick again.
    // A slug the user chose is theirs to change, so that collision is reported.
    for (let attempt = 1; ; attempt++) {
      const slug = requestedSlug ?? (await this.generateSlug(dto.name));
      try {
        return await this.prisma.artist.create({
          data: { organizationId, ...rest, slug, genres: cleanGenres(genres ?? []) },
          include: ARTIST_INCLUDE,
        });
      } catch (err) {
        if (!isSlugCollision(err)) throw err;
        if (requestedSlug || attempt >= MAX_SLUG_ATTEMPTS) throw new ConflictException(SLUG_TAKEN);
      }
    }
  }

  findAll(organizationId: string) {
    return this.prisma.artist.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      include: ARTIST_INCLUDE,
    });
  }

  async findOne(organizationId: string, id: string) {
    const artist = await this.prisma.artist.findFirst({ where: { id, organizationId }, include: ARTIST_INCLUDE });
    if (!artist) throw new NotFoundException('Artist not found.');
    return artist;
  }

  async update(organizationId: string, id: string, dto: UpdateArtistDto) {
    await this.findOne(organizationId, id);
    // Renaming an artist deliberately keeps the slug: a profile link already shared must not break.
    if (dto.slug) await this.assertSlugFree(dto.slug, id);

    const { genres, ...rest } = dto;
    try {
      return await this.prisma.artist.update({
        where: { id },
        data: { ...rest, ...(genres !== undefined && { genres: cleanGenres(genres ?? []) }) },
        include: ARTIST_INCLUDE,
      });
    } catch (err) {
      if (isSlugCollision(err)) throw new ConflictException(SLUG_TAKEN);
      throw err;
    }
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    // Linked bookings, quotes, contracts and invoices are kept; only their artist link is cleared (onDelete: SetNull).
    await this.prisma.artist.delete({ where: { id } });
    return { deleted: true };
  }

  async findPublic(slug: string) {
    const artist = await this.prisma.artist.findFirst({
      where: { slug, isPublished: true },
      select: { ...PUBLIC_ARTIST_FIELDS, epk: { select: { isPublished: true } } },
    });
    // Unpublished and non-existent look identical, so drafts can't be discovered by probing slugs.
    if (!artist) throw new NotFoundException('Artist not found.');
    const { epk, ...profile } = artist;
    return { ...profile, hasEpk: epk?.isPublished ?? false };
  }
}
