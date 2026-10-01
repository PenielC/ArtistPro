import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { firstFreeSlug, slugify } from './artist-slug';
import { ArtistsService, cleanGenres, PUBLIC_ARTIST_FIELDS } from './artists.service';

function slugCollision() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['slug'] },
  });
}

describe('slugify', () => {
  it('lowercases, folds accents and hyphenates everything else', () => {
    expect(slugify('Tamy Moyo & The Band')).toBe('tamy-moyo-the-band');
    expect(slugify('  Beyoncé!!  ')).toBe('beyonce');
    expect(slugify('DJ  Fresh--SA')).toBe('dj-fresh-sa');
  });

  it('never returns a slug shorter than the 3-character minimum', () => {
    expect(slugify('Mo')).toBe('artist-mo');
    expect(slugify('!!!')).toBe('artist');
  });

  it('caps the length at 60 without a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(59)} band`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('firstFreeSlug', () => {
  it('returns the base when free, otherwise the first free numeric suffix', () => {
    expect(firstFreeSlug('jah-prayzah', [])).toBe('jah-prayzah');
    expect(firstFreeSlug('jah-prayzah', ['jah-prayzah', 'jah-prayzah-2'])).toBe('jah-prayzah-3');
  });

  it('keeps suffixed slugs within 60 characters', () => {
    const base = 'a'.repeat(60);
    expect(firstFreeSlug(base, [base])).toBe(`${'a'.repeat(58)}-2`);
  });
});

describe('cleanGenres', () => {
  it('trims, drops blanks and de-duplicates case-insensitively, keeping first spelling', () => {
    expect(cleanGenres([' Afro-pop ', '', 'Jazz', 'afro-pop', '  '])).toEqual(['Afro-pop', 'Jazz']);
  });
});

describe('ArtistsService', () => {
  let service: ArtistsService;
  let prisma: {
    artist: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      artist: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new ArtistsService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('creates an unpublished-by-default artist scoped to the organisation with a slug from the name', async () => {
      prisma.artist.create.mockResolvedValue({ id: 'artist-1' });

      await service.create('org-1', { name: 'Tamy Moyo', genres: ['Afro-pop', 'afro-pop'] });

      const data = prisma.artist.create.mock.calls[0][0].data;
      expect(data).toEqual({ organizationId: 'org-1', name: 'Tamy Moyo', slug: 'tamy-moyo', genres: ['Afro-pop'] });
    });

    it('picks the next free slug when the natural one is taken', async () => {
      prisma.artist.findMany.mockResolvedValue([{ slug: 'tamy-moyo' }, { slug: 'tamy-moyo-2' }]);
      prisma.artist.create.mockResolvedValue({ id: 'artist-1' });

      await service.create('org-1', { name: 'Tamy Moyo' });

      expect(prisma.artist.create.mock.calls[0][0].data.slug).toBe('tamy-moyo-3');
    });

    it('retries with a fresh slug when a concurrent create takes the generated one', async () => {
      prisma.artist.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ slug: 'tamy-moyo' }]);
      prisma.artist.create.mockRejectedValueOnce(slugCollision()).mockResolvedValueOnce({ id: 'artist-1' });

      await service.create('org-1', { name: 'Tamy Moyo' });

      expect(prisma.artist.create).toHaveBeenCalledTimes(2);
      expect(prisma.artist.create.mock.calls[1][0].data.slug).toBe('tamy-moyo-2');
    });

    it('rejects a chosen slug that is already taken instead of silently changing it', async () => {
      prisma.artist.findUnique.mockResolvedValue({ id: 'someone-else' });

      await expect(service.create('org-1', { name: 'Tamy Moyo', slug: 'tamy' })).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.artist.create).not.toHaveBeenCalled();
    });

    it('reports a chosen slug lost to a concurrent create as a conflict, without retrying', async () => {
      prisma.artist.create.mockRejectedValue(slugCollision());

      await expect(service.create('org-1', { name: 'Tamy Moyo', slug: 'tamy' })).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.artist.create).toHaveBeenCalledTimes(1);
    });
  });

  it('lists only the organisation\'s artists, alphabetically, with link counts and press-kit status', async () => {
    await service.findAll('org-1');

    expect(prisma.artist.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { bookings: true, quotes: true, contracts: true, invoices: true } },
        epk: { select: { isPublished: true, updatedAt: true } },
      },
    });
  });

  describe('update', () => {
    it('does not update an artist from another organisation', async () => {
      prisma.artist.findFirst.mockResolvedValue(null);

      await expect(service.update('org-1', 'artist-1', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.artist.update).not.toHaveBeenCalled();
    });

    it('keeps the slug when only the name changes, so shared links still work', async () => {
      prisma.artist.findFirst.mockResolvedValue({ id: 'artist-1', slug: 'tamy-moyo' });
      prisma.artist.update.mockResolvedValue({ id: 'artist-1' });

      await service.update('org-1', 'artist-1', { name: 'Tamy' });

      expect(prisma.artist.update.mock.calls[0][0].data).toEqual({ name: 'Tamy' });
    });

    it('allows re-saving the artist\'s own slug but rejects one owned by another artist', async () => {
      prisma.artist.findFirst.mockResolvedValue({ id: 'artist-1' });
      prisma.artist.update.mockResolvedValue({ id: 'artist-1' });

      prisma.artist.findUnique.mockResolvedValueOnce({ id: 'artist-1' });
      await service.update('org-1', 'artist-1', { slug: 'tamy-moyo' });
      expect(prisma.artist.update).toHaveBeenCalledTimes(1);

      prisma.artist.findUnique.mockResolvedValueOnce({ id: 'artist-2' });
      await expect(service.update('org-1', 'artist-1', { slug: 'taken' })).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.artist.update).toHaveBeenCalledTimes(1);
    });

    it('cleans genres and passes null through to clear an optional field', async () => {
      prisma.artist.findFirst.mockResolvedValue({ id: 'artist-1' });
      prisma.artist.update.mockResolvedValue({ id: 'artist-1' });

      await service.update('org-1', 'artist-1', {
        genres: ['Jazz ', 'jazz'],
        tagline: null as unknown as string,
        isPublished: true,
      });

      expect(prisma.artist.update.mock.calls[0][0].data).toEqual({ genres: ['Jazz'], tagline: null, isPublished: true });
    });
  });

  it('does not delete an artist from another organisation', async () => {
    prisma.artist.findFirst.mockResolvedValue(null);

    await expect(service.remove('org-1', 'artist-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.artist.delete).not.toHaveBeenCalled();
  });

  describe('findPublic', () => {
    it('only returns published profiles of active businesses, selecting public fields only', async () => {
      prisma.artist.findFirst.mockResolvedValue({ name: 'Tamy Moyo', epk: null });

      const result = await service.findPublic('tamy-moyo');

      expect(prisma.artist.findFirst).toHaveBeenCalledWith({
        where: { slug: 'tamy-moyo', isPublished: true, organization: { suspendedAt: null } },
        select: { ...PUBLIC_ARTIST_FIELDS, epk: { select: { isPublished: true } } },
      });
      expect(result).toEqual({ name: 'Tamy Moyo', hasEpk: false });
      for (const privateField of ['id', 'organizationId', 'isPublished', 'createdAt', 'updatedAt']) {
        expect(PUBLIC_ARTIST_FIELDS).not.toHaveProperty(privateField);
      }
    });

    it('flags a published press kit so the profile can link to it, but not a draft one', async () => {
      prisma.artist.findFirst.mockResolvedValueOnce({ name: 'A', epk: { isPublished: true } });
      prisma.artist.findFirst.mockResolvedValueOnce({ name: 'B', epk: { isPublished: false } });

      expect((await service.findPublic('a')).hasEpk).toBe(true);
      expect((await service.findPublic('b')).hasEpk).toBe(false);
    });

    it('404s for an unpublished or unknown slug', async () => {
      prisma.artist.findFirst.mockResolvedValue(null);

      await expect(service.findPublic('draft-artist')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
