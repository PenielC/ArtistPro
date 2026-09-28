import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Epk, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PUBLIC_ARTIST_FIELDS } from '../artists/artists.service';
import { UpdateEpkDto } from './dto/update-epk.dto';

export interface DiscographyItem { title: string; kind?: string; year?: number; url?: string }
export interface PerformanceItem { name: string; location?: string; year?: number }
export interface PressQuote { quote: string; source: string; url?: string }
export interface GalleryItem { url: string; caption?: string }
export interface MediaItem { title?: string; url: string }

export interface EpkContent {
  achievements: string[];
  discography: DiscographyItem[];
  performances: PerformanceItem[];
  pressQuotes: PressQuote[];
  gallery: GalleryItem[];
  media: MediaItem[];
}

export const EMPTY_EPK: EpkContent = {
  achievements: [],
  discography: [],
  performances: [],
  pressQuotes: [],
  gallery: [],
  media: [],
};

function toContent(epk: Epk): EpkContent {
  return {
    achievements: epk.achievements as unknown as string[],
    discography: epk.discography as unknown as DiscographyItem[],
    performances: epk.performances as unknown as PerformanceItem[],
    pressQuotes: epk.pressQuotes as unknown as PressQuote[],
    gallery: epk.gallery as unknown as GalleryItem[],
    media: epk.media as unknown as MediaItem[],
  };
}

/**
 * Copies each item into a plain object with trimmed strings, dropping blank
 * optional fields, so the stored JSON never carries "   " or stray keys.
 * A required field that is blank once trimmed is a 400, naming the section.
 */
function clean<T extends object>(section: string, items: T[], required: (keyof T)[]): T[] {
  return items.map((item, index) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item)) {
      const v = typeof value === 'string' ? value.trim() : value;
      if (v === undefined || v === null || v === '') continue;
      out[key] = v;
    }
    for (const key of required) {
      if (out[key as string] === undefined) {
        throw new BadRequestException(`${section} item ${index + 1}: ${String(key)} cannot be blank.`);
      }
    }
    return out as T;
  });
}

export function sanitizeEpk(dto: UpdateEpkDto): Partial<EpkContent> {
  const content: Partial<EpkContent> = {};
  if (dto.achievements) content.achievements = dto.achievements.map((a) => a.trim()).filter(Boolean);
  if (dto.discography) content.discography = clean('Discography', dto.discography, ['title']);
  if (dto.performances) content.performances = clean('Performances', dto.performances, ['name']);
  if (dto.pressQuotes) content.pressQuotes = clean('Press quotes', dto.pressQuotes, ['quote', 'source']);
  if (dto.gallery) content.gallery = clean('Gallery', dto.gallery, ['url']);
  if (dto.media) content.media = clean('Videos & music', dto.media, ['url']);
  return content;
}

@Injectable()
export class EpkService {
  constructor(private readonly prisma: PrismaService) {}

  private async findArtist(organizationId: string, artistId: string) {
    const artist = await this.prisma.artist.findFirst({
      where: { id: artistId, organizationId },
      select: { ...PUBLIC_ARTIST_FIELDS, id: true, isPublished: true },
    });
    if (!artist) throw new NotFoundException('Artist not found.');
    return artist;
  }

  /** The artist's kit for the editor and private preview. An artist with no kit yet gets an empty, unpublished one. */
  async get(organizationId: string, artistId: string) {
    const artist = await this.findArtist(organizationId, artistId);
    const epk = await this.prisma.epk.findUnique({ where: { artistId } });
    return {
      artist,
      epk: epk
        ? { ...toContent(epk), isPublished: epk.isPublished, updatedAt: epk.updatedAt }
        : { ...EMPTY_EPK, isPublished: false, updatedAt: null },
    };
  }

  async update(organizationId: string, artistId: string, dto: UpdateEpkDto) {
    await this.findArtist(organizationId, artistId);
    const content = sanitizeEpk(dto) as Record<string, Prisma.InputJsonValue>;
    const data = { ...content, ...(dto.isPublished !== undefined && { isPublished: dto.isPublished }) };

    await this.prisma.epk.upsert({
      where: { artistId },
      create: { artistId, ...data },
      update: data,
    });
    return this.get(organizationId, artistId);
  }

  async findPublic(slug: string) {
    // Published kit only. Deliberately independent of the profile's own toggle:
    // publishing the kit is an explicit choice to share what's in it.
    const epk = await this.prisma.epk.findFirst({
      where: { isPublished: true, artist: { slug } },
      include: { artist: { select: PUBLIC_ARTIST_FIELDS } },
    });
    if (!epk) throw new NotFoundException('Press kit not found.');
    return { artist: epk.artist, epk: { ...toContent(epk), updatedAt: epk.updatedAt } };
  }
}
