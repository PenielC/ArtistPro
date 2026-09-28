import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PUBLIC_ARTIST_FIELDS } from '../artists/artists.service';
import { UpdateEpkDto } from './dto/update-epk.dto';
import { EMPTY_EPK, EpkService, sanitizeEpk } from './epk.service';

async function errorsFor(body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(UpdateEpkDto, body), { whitelist: true });
  const flatten = (e: (typeof errors)[number]): string[] => [
    ...Object.values(e.constraints ?? {}),
    ...(e.children ?? []).flatMap(flatten),
  ];
  return errors.flatMap(flatten);
}

function epkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'epk-1',
    artistId: 'artist-1',
    ...EMPTY_EPK,
    achievements: ['HIFA 2025 headliner'],
    isPublished: false,
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-02'),
    ...overrides,
  };
}

describe('UpdateEpkDto validation', () => {
  it('accepts a full, well-formed kit', async () => {
    expect(
      await errorsFor({
        achievements: ['Nominated, ZIMA 2024'],
        discography: [{ title: 'Moyo', kind: 'Album', year: 2023, url: 'https://open.spotify.com/album/abc' }],
        performances: [{ name: 'HIFA', location: 'Harare', year: 2025 }],
        pressQuotes: [{ quote: 'A voice that fills a stadium.', source: 'The Herald' }],
        gallery: [{ url: 'https://cdn.example.com/1.jpg', caption: 'Live at HIFA' }],
        media: [{ title: 'Live session', url: 'https://youtu.be/dQw4w9WgXcQ' }],
        isPublished: true,
      }),
    ).toEqual([]);
  });

  it('rejects non-http links anywhere a link is rendered', async () => {
    const errors = await errorsFor({
      gallery: [{ url: 'javascript:alert(1)' }],
      media: [{ url: 'data:text/html,hi' }],
      pressQuotes: [{ quote: 'q', source: 's', url: 'ftp://x.com' }],
    });
    expect(errors).toHaveLength(3);
  });

  it('enforces required fields, list sizes and year bounds', async () => {
    expect(await errorsFor({ discography: [{ kind: 'EP' }] })).not.toEqual([]);
    expect(await errorsFor({ pressQuotes: [{ quote: 'Great' }] })).not.toEqual([]);
    expect(await errorsFor({ performances: [{ name: 'Gig', year: 1800 }] })).not.toEqual([]);
    expect(await errorsFor({ gallery: Array.from({ length: 25 }, () => ({ url: 'https://x.com/a.jpg' })) })).not.toEqual([]);
  });
});

describe('sanitizeEpk', () => {
  it('trims strings, drops blank optional fields and blank achievements, and only returns sent sections', () => {
    const result = sanitizeEpk({
      achievements: ['  Headlined HIFA ', '   '],
      discography: [{ title: ' Moyo ', kind: '  ', year: 2023 }],
    });

    expect(result).toEqual({ achievements: ['Headlined HIFA'], discography: [{ title: 'Moyo', year: 2023 }] });
    expect(result).not.toHaveProperty('gallery');
  });

  it('rejects a required field that is only whitespace, naming the section and item', () => {
    expect(() => sanitizeEpk({ pressQuotes: [{ quote: 'Great', source: 'Herald' }, { quote: '  ', source: 'X' }] })).toThrow(
      new BadRequestException('Press quotes item 2: quote cannot be blank.'),
    );
  });
});

describe('EpkService', () => {
  let service: EpkService;
  let prisma: {
    artist: { findFirst: jest.Mock };
    epk: { findUnique: jest.Mock; findFirst: jest.Mock; upsert: jest.Mock };
  };
  const artist = { id: 'artist-1', name: 'Tamy Moyo', slug: 'tamy-moyo', isPublished: true };

  beforeEach(() => {
    prisma = {
      artist: { findFirst: jest.fn().mockResolvedValue(artist) },
      epk: { findUnique: jest.fn(), findFirst: jest.fn(), upsert: jest.fn() },
    };
    service = new EpkService(prisma as unknown as PrismaService);
  });

  it('scopes the artist lookup to the organisation', async () => {
    prisma.artist.findFirst.mockResolvedValue(null);

    await expect(service.get('org-1', 'artist-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update('org-1', 'artist-1', { isPublished: true })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.artist.findFirst.mock.calls[0][0].where).toEqual({ id: 'artist-1', organizationId: 'org-1' });
    expect(prisma.epk.upsert).not.toHaveBeenCalled();
  });

  it('returns an empty, unpublished kit for an artist who has not started one', async () => {
    prisma.epk.findUnique.mockResolvedValue(null);

    const result = await service.get('org-1', 'artist-1');

    expect(result.artist).toBe(artist);
    expect(result.epk).toEqual({ ...EMPTY_EPK, isPublished: false, updatedAt: null });
  });

  it('upserts only the sections that were sent, plus the publish flag', async () => {
    prisma.epk.findUnique.mockResolvedValue(epkRow());

    await service.update('org-1', 'artist-1', { achievements: [' Won ZIMA '], isPublished: true });

    expect(prisma.epk.upsert).toHaveBeenCalledWith({
      where: { artistId: 'artist-1' },
      create: { artistId: 'artist-1', achievements: ['Won ZIMA'], isPublished: true },
      update: { achievements: ['Won ZIMA'], isPublished: true },
    });
  });

  it('serves a published kit by slug with public artist fields only', async () => {
    prisma.epk.findFirst.mockResolvedValue({ ...epkRow({ isPublished: true }), artist: { name: 'Tamy Moyo' } });

    const result = await service.findPublic('tamy-moyo');

    expect(prisma.epk.findFirst).toHaveBeenCalledWith({
      where: { isPublished: true, artist: { slug: 'tamy-moyo' } },
      include: { artist: { select: PUBLIC_ARTIST_FIELDS } },
    });
    expect(result.artist).toEqual({ name: 'Tamy Moyo' });
    expect(result.epk.achievements).toEqual(['HIFA 2025 headliner']);
    for (const internal of ['id', 'artistId', 'isPublished', 'createdAt']) {
      expect(result.epk).not.toHaveProperty(internal);
    }
  });

  it('404s for a draft or missing kit', async () => {
    prisma.epk.findFirst.mockResolvedValue(null);

    await expect(service.findPublic('tamy-moyo')).rejects.toBeInstanceOf(NotFoundException);
  });
});
