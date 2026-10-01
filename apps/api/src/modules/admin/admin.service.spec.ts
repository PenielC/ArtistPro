import { BadRequestException, ConflictException, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlatformAdmins } from '../platform/platform-admins';
import { PlatformConfigService } from '../platform/platform-config.service';
import { AdminService, monthRange, type AdminActor } from './admin.service';
import { ListOrganizationsQueryDto } from './dto/admin.dto';
import { PlatformAdminGuard } from './platform-admin.guard';

const ADMIN: AdminActor = { sub: 'admin-user', email: 'ops@artbh.local', organizationId: 'org-admin' };
const NOW = new Date('2026-09-15T10:00:00Z');

function makePrisma() {
  const prisma = {
    organization: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    user: { count: jest.fn().mockResolvedValue(0) },
    artist: { count: jest.fn().mockResolvedValue(0) },
    booking: { count: jest.fn().mockResolvedValue(0) },
    invoice: { count: jest.fn().mockResolvedValue(0) },
    paymentAttempt: { groupBy: jest.fn().mockResolvedValue([]) },
    aiGeneration: { count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _sum: { costUsd: null } }), groupBy: jest.fn().mockResolvedValue([]) },
    emailMessage: { groupBy: jest.fn().mockResolvedValue([]) },
    refreshToken: { updateMany: jest.fn() },
    adminAuditLog: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    platformConfig: { update: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
  );
  return prisma;
}

describe('PlatformAdminGuard', () => {
  const guard = new PlatformAdminGuard(new PlatformAdmins({ get: () => 'ops@artbh.local' } as unknown as ConfigService));
  const ctx = (email?: string) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user: email ? { email } : undefined }) }) }) as unknown as ExecutionContext;

  it('lets allowlisted emails through, case-insensitively', () => {
    expect(guard.canActivate(ctx('OPS@artbh.local'))).toBe(true);
  });

  it('refuses everyone else, including a missing user', () => {
    expect(() => guard.canActivate(ctx('owner@business.com'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx())).toThrow(ForbiddenException);
  });

  it('grants nobody when the allowlist is empty', () => {
    const empty = new PlatformAdminGuard(new PlatformAdmins({ get: () => undefined } as unknown as ConfigService));
    expect(() => empty.canActivate(ctx('ops@artbh.local'))).toThrow(ForbiddenException);
  });
});

describe('AdminService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let platformConfig: { get: jest.Mock };
  let service: AdminService;

  beforeEach(() => {
    prisma = makePrisma();
    platformConfig = {
      get: jest.fn().mockResolvedValue({ id: 1, signupsEnabled: true, defaultAiMonthlyLimit: 100, announcement: null, announcementTone: 'INFO' }),
    };
    service = new AdminService(prisma as unknown as PrismaService, platformConfig as unknown as PlatformConfigService);
  });

  it('monthRange covers the calendar month in UTC, including December', () => {
    expect(monthRange(2026, 2)).toEqual({ start: new Date('2026-02-01T00:00:00Z'), end: new Date('2026-03-01T00:00:00Z') });
    expect(monthRange(2026, 12).end).toEqual(new Date('2027-01-01T00:00:00Z'));
  });

  describe('overview', () => {
    it('defaults to the current month and trends the six months ending there', async () => {
      const result = await service.overview({}, NOW);

      expect(result.period).toEqual({ year: 2026, month: 9 });
      expect(result.trend.map((t) => `${t.year}-${t.month}`)).toEqual(['2026-4', '2026-5', '2026-6', '2026-7', '2026-8', '2026-9']);
    });

    it('moves the trend window with the selected month, across a year boundary', async () => {
      const result = await service.overview({ year: 2026, month: 2 }, NOW);

      expect(result.trend.map((t) => `${t.year}-${t.month}`)).toEqual(['2025-9', '2025-10', '2025-11', '2025-12', '2026-1', '2026-2']);
      expect(prisma.booking.count).toHaveBeenCalledWith({
        where: { createdAt: { gte: new Date('2026-02-01T00:00:00Z'), lt: new Date('2026-03-01T00:00:00Z') } },
      });
    });

    it('reports money per currency without converting, and totals emails by status', async () => {
      prisma.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) =>
        strings.join('').includes('invoice_payments')
          ? [{ currency: 'USD', count: BigInt(3), total: new Prisma.Decimal('1200.5') }, { currency: 'ZAR', count: BigInt(1), total: new Prisma.Decimal('15000') }]
          : [{ count: BigInt(4) }],
      );
      prisma.paymentAttempt.groupBy.mockResolvedValue([{ currency: 'USD', _count: { _all: 2 }, _sum: { amount: new Prisma.Decimal('450') } }]);
      prisma.emailMessage.groupBy.mockResolvedValue([
        { status: 'SENT', _count: { _all: 10 } },
        { status: 'FAILED', _count: { _all: 2 } },
        { status: 'PENDING', _count: { _all: 1 } },
        { status: 'SENDING', _count: { _all: 1 } },
      ]);
      prisma.aiGeneration.aggregate.mockResolvedValue({ _sum: { costUsd: new Prisma.Decimal('0.123456') } });

      const { month, totals } = await service.overview({}, NOW);

      expect(month.paymentsRecorded).toEqual([
        { currency: 'USD', count: 3, total: 1200.5 },
        { currency: 'ZAR', count: 1, total: 15000 },
      ]);
      expect(month.onlinePayments).toEqual([{ currency: 'USD', count: 2, total: 450 }]);
      expect([month.emailsSent, month.emailsFailed, month.emailsPending]).toEqual([10, 2, 2]);
      expect(month.aiCostUsd).toBe(0.1235);
      expect(totals.activeBusinesses).toBe(4);
    });
  });

  describe('organizations', () => {
    const query = (over: Partial<ListOrganizationsQueryDto> = {}) =>
      Object.assign(new ListOrganizationsQueryDto(), over);

    it('searches names and member emails, filters by status, and pages', async () => {
      prisma.organization.count.mockResolvedValue(45);

      const result = await service.organizations(query({ search: 'moyo', status: 'suspended', page: 2, pageSize: 20 }), NOW);

      const search = {
        OR: [
          { name: { contains: 'moyo', mode: 'insensitive' } },
          { users: { some: { email: { contains: 'moyo', mode: 'insensitive' } } } },
        ],
      };
      expect(prisma.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ...search, suspendedAt: { not: null } }, skip: 20, take: 20 }),
      );
      // Chip counts follow the search, not the status filter.
      expect(prisma.organization.count).toHaveBeenCalledWith({ where: search });
      expect(result.pageCount).toBe(3);
    });

    it('adds the owner, last activity and this month’s AI use to each row', async () => {
      const last = new Date('2026-09-14T08:00:00Z');
      prisma.organization.findMany.mockResolvedValue([
        { id: 'o1', name: 'Moyo', currency: 'USD', createdAt: NOW, suspendedAt: null, suspendedReason: null, aiMonthlyLimit: 100, _count: { users: 2, artists: 3, bookings: 4, invoices: 5 }, users: [{ firstName: 'Rudo', lastName: 'Moyo', email: 'rudo@moyo.co.zw' }] },
        { id: 'o2', name: 'Empty', currency: 'USD', createdAt: NOW, suspendedAt: null, suspendedReason: null, aiMonthlyLimit: 100, _count: { users: 0, artists: 0, bookings: 0, invoices: 0 }, users: [] },
      ]);
      prisma.$queryRaw.mockResolvedValue([{ id: 'o1', last }]);
      prisma.aiGeneration.groupBy.mockResolvedValue([{ organizationId: 'o1', _count: { _all: 7 } }]);

      const { items } = await service.organizations(query(), NOW);

      expect(items[0]).toMatchObject({ owner: { name: 'Rudo Moyo', email: 'rudo@moyo.co.zw' }, lastActiveAt: last, aiUsedThisMonth: 7 });
      expect(items[1]).toMatchObject({ owner: null, lastActiveAt: null, aiUsedThisMonth: 0 });
    });

    it('skips the extra lookups for an empty page', async () => {
      const result = await service.organizations(query({ search: 'nothing' }), NOW);

      expect(result.items).toEqual([]);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('suspend / reactivate', () => {
    const org = { id: 'org-1', name: 'Moyo', suspendedAt: null, suspendedReason: null, aiMonthlyLimit: 100 };

    beforeEach(() => {
      // The detail view after the change isn't under test here.
      jest.spyOn(service, 'organization').mockResolvedValue({} as never);
    });

    it('suspends, ends every session of the business, and records who and why', async () => {
      prisma.organization.findUnique.mockResolvedValue(org);
      prisma.organization.updateMany.mockResolvedValue({ count: 1 });

      await service.suspend(ADMIN, 'org-1', 'Chargeback fraud', NOW);

      expect(prisma.organization.updateMany).toHaveBeenCalledWith({
        where: { id: 'org-1', suspendedAt: null },
        data: { suspendedAt: NOW, suspendedReason: 'Chargeback fraud' },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { revokedAt: null, user: { organizationId: 'org-1' } },
        data: { revokedAt: NOW },
      });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: {
          adminUserId: 'admin-user',
          adminEmail: 'ops@artbh.local',
          action: 'ORGANIZATION_SUSPENDED',
          organizationId: 'org-1',
          organizationName: 'Moyo',
          details: { reason: 'Chargeback fraud' },
        },
      });
    });

    it("won't let an admin suspend their own business", async () => {
      prisma.organization.findUnique.mockResolvedValue({ ...org, id: 'org-admin' });

      await expect(service.suspend(ADMIN, 'org-admin', 'oops', NOW)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.organization.updateMany).not.toHaveBeenCalled();
    });

    it('404s for an unknown business and 409s when it is already suspended (no audit entry)', async () => {
      prisma.organization.findUnique.mockResolvedValueOnce(null);
      await expect(service.suspend(ADMIN, 'nope', 'x'.repeat(5), NOW)).rejects.toBeInstanceOf(NotFoundException);

      prisma.organization.findUnique.mockResolvedValue(org);
      prisma.organization.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.suspend(ADMIN, 'org-1', 'again', NOW)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
    });

    it('reactivates and keeps the old reason in the audit trail', async () => {
      const since = new Date('2026-09-01T00:00:00Z');
      prisma.organization.findUnique.mockResolvedValue({ ...org, suspendedAt: since, suspendedReason: 'Unpaid' });
      prisma.organization.updateMany.mockResolvedValue({ count: 1 });

      await service.reactivate(ADMIN, 'org-1', NOW);

      expect(prisma.organization.updateMany).toHaveBeenCalledWith({
        where: { id: 'org-1', suspendedAt: { not: null } },
        data: { suspendedAt: null, suspendedReason: null },
      });
      expect(prisma.adminAuditLog.create.mock.calls[0][0].data).toMatchObject({
        action: 'ORGANIZATION_REACTIVATED',
        details: { suspendedAt: since.toISOString(), previousReason: 'Unpaid' },
      });
    });

    it('409s when reactivating a business that is not suspended', async () => {
      prisma.organization.findUnique.mockResolvedValue(org);
      prisma.organization.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.reactivate(ADMIN, 'org-1', NOW)).rejects.toBeInstanceOf(ConflictException);
    });

    it('changes the AI limit with a from/to audit entry, and does nothing when unchanged', async () => {
      prisma.organization.findUnique.mockResolvedValue(org);

      await service.setAiLimit(ADMIN, 'org-1', 100, NOW);
      expect(prisma.organization.update).not.toHaveBeenCalled();

      await service.setAiLimit(ADMIN, 'org-1', 250, NOW);
      expect(prisma.organization.update).toHaveBeenCalledWith({ where: { id: 'org-1' }, data: { aiMonthlyLimit: 250 } });
      expect(prisma.adminAuditLog.create.mock.calls[0][0].data).toMatchObject({
        action: 'ORGANIZATION_AI_LIMIT_CHANGED',
        details: { from: 100, to: 250 },
      });
    });
  });

  describe('platform settings', () => {
    it('writes and audits only the fields that actually change', async () => {
      prisma.platformConfig.update.mockResolvedValue({ id: 1 });

      await service.updateConfig(ADMIN, { signupsEnabled: true, announcement: 'Maintenance tonight', defaultAiMonthlyLimit: 100 });

      expect(prisma.platformConfig.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { announcement: 'Maintenance tonight', updatedByEmail: 'ops@artbh.local' },
      });
      expect(prisma.adminAuditLog.create.mock.calls[0][0].data).toMatchObject({
        action: 'PLATFORM_CONFIG_UPDATED',
        organizationId: null,
        details: { changes: { announcement: { from: null, to: 'Maintenance tonight' } } },
      });
    });

    it('treats an empty announcement as removing it', async () => {
      platformConfig.get.mockResolvedValue({ id: 1, signupsEnabled: true, defaultAiMonthlyLimit: 100, announcement: 'Old', announcementTone: 'INFO' });
      prisma.platformConfig.update.mockResolvedValue({ id: 1 });

      await service.updateConfig(ADMIN, { announcement: '' });

      expect(prisma.platformConfig.update.mock.calls[0][0].data).toEqual({ announcement: null, updatedByEmail: 'ops@artbh.local' });
    });

    it('saves nothing (and logs nothing) when nothing changed', async () => {
      await service.updateConfig(ADMIN, { signupsEnabled: true, announcement: null });

      expect(prisma.platformConfig.update).not.toHaveBeenCalled();
      expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
    });
  });

  it('filters the audit log by business and action, newest first', async () => {
    await service.audit({ page: 2, pageSize: 10, organizationId: 'org-1', action: 'ORGANIZATION_SUSPENDED' });

    expect(prisma.adminAuditLog.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', action: 'ORGANIZATION_SUSPENDED' },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: 10,
      take: 10,
    });
  });
});
