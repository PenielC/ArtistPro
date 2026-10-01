import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { COUNTED_GENERATION, monthStart } from '../ai/ai.service';
import type { JwtPayload } from '../auth/auth.types';
import { PlatformConfigService } from '../platform/platform-config.service';
import type { AuditQueryDto, ListOrganizationsQueryDto, OverviewQueryDto, UpdatePlatformConfigDto } from './dto/admin.dto';

export type AdminActor = Pick<JwtPayload, 'sub' | 'email' | 'organizationId'>;

const TREND_MONTHS = 6;
/** A business counts as active if any member signed in or refreshed a session in this window. */
const ACTIVE_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function monthRange(year: number, month: number) {
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
}

const money = (v: Prisma.Decimal | number | string | null | undefined) => Math.round(Number(v ?? 0) * 100) / 100;

const ORG_ROW_SELECT = {
  id: true,
  name: true,
  currency: true,
  createdAt: true,
  suspendedAt: true,
  suspendedReason: true,
  aiMonthlyLimit: true,
  _count: { select: { users: true, artists: true, bookings: true, invoices: true } },
  users: { where: { role: 'OWNER' }, orderBy: { createdAt: 'asc' }, take: 1, select: { firstName: true, lastName: true, email: true } },
} satisfies Prisma.OrganizationSelect;

const CONFIG_FIELDS = ['signupsEnabled', 'defaultAiMonthlyLimit', 'announcement', 'announcementTone'] as const;

/**
 * The platform operator's view across every business. It deliberately reads business
 * metadata and counts only; it never returns clients, documents or message contents.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformConfig: PlatformConfigService,
  ) {}

  // ─────────────────────────── Overview ───────────────────────────

  async overview(q: OverviewQueryDto, now = new Date()) {
    const year = q.year ?? now.getUTCFullYear();
    const month = q.month ?? now.getUTCMonth() + 1;
    const { start, end } = monthRange(year, month);
    const inMonth = { gte: start, lt: end };
    const p = this.prisma;

    const [
      businesses,
      suspended,
      users,
      artists,
      publishedArtists,
      active30,
      newBusinesses,
      newUsers,
      activeInMonth,
      bookings,
      invoices,
      payments,
      online,
      aiGenerations,
      aiCost,
      emails,
      trend,
    ] = await Promise.all([
      p.organization.count(),
      p.organization.count({ where: { suspendedAt: { not: null } } }),
      p.user.count(),
      p.artist.count(),
      p.artist.count({ where: { isPublished: true } }),
      this.activeBusinesses(new Date(now.getTime() - ACTIVE_WINDOW_DAYS * DAY_MS)),
      p.organization.count({ where: { createdAt: inMonth } }),
      p.user.count({ where: { createdAt: inMonth } }),
      this.activeBusinesses(start, end),
      p.booking.count({ where: { createdAt: inMonth } }),
      p.invoice.count({ where: { createdAt: inMonth } }),
      this.paymentsByCurrency({ from: start, to: end }),
      p.paymentAttempt.groupBy({
        by: ['currency'],
        where: { status: 'PAID', completedAt: inMonth },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      p.aiGeneration.count({ where: { createdAt: inMonth, ...COUNTED_GENERATION } }),
      p.aiGeneration.aggregate({ where: { createdAt: inMonth }, _sum: { costUsd: true } }),
      p.emailMessage.groupBy({ by: ['status'], where: { createdAt: inMonth }, _count: { _all: true } }),
      this.trend(year, month),
    ]);

    const emailCount = (...statuses: string[]) =>
      emails.filter((e) => statuses.includes(e.status)).reduce((sum, e) => sum + e._count._all, 0);

    return {
      period: { year, month },
      totals: { businesses, activeBusinesses: active30, suspendedBusinesses: suspended, users, artists, publishedArtists },
      month: {
        newBusinesses,
        newUsers,
        activeBusinesses: activeInMonth,
        bookingsCreated: bookings,
        invoicesCreated: invoices,
        // Per currency: payments are never converted, so no rate is guessed.
        paymentsRecorded: payments,
        onlinePayments: online
          .map((o) => ({ currency: o.currency, count: o._count._all, total: money(o._sum.amount) }))
          .sort((a, b) => b.total - a.total),
        aiGenerations,
        aiCostUsd: Math.round(Number(aiCost._sum.costUsd ?? 0) * 10000) / 10000,
        emailsSent: emailCount('SENT'),
        emailsFailed: emailCount('FAILED'),
        emailsPending: emailCount('PENDING', 'SENDING'),
      },
      trend,
    };
  }

  /** The six months ending with the selected one, so stepping back in time moves the chart too. */
  private trend(year: number, month: number) {
    return Promise.all(
      Array.from({ length: TREND_MONTHS }, (_, i) => {
        const d = new Date(Date.UTC(year, month - 1 - (TREND_MONTHS - 1 - i), 1));
        const y = d.getUTCFullYear();
        const m = d.getUTCMonth() + 1;
        const { start, end } = monthRange(y, m);
        return Promise.all([
          this.prisma.organization.count({ where: { createdAt: { gte: start, lt: end } } }),
          this.prisma.user.count({ where: { createdAt: { gte: start, lt: end } } }),
          this.activeBusinesses(start, end),
        ]).then(([newBusinesses, newUsers, activeBusinesses]) => ({ year: y, month: m, newBusinesses, newUsers, activeBusinesses }));
      }),
    );
  }

  /** Businesses with a session issued (login or refresh) in the window. */
  private async activeBusinesses(from: Date, to?: Date): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT u."organizationId") AS count
      FROM refresh_tokens rt JOIN users u ON u.id = rt."userId"
      WHERE rt."createdAt" >= ${from} ${to ? Prisma.sql`AND rt."createdAt" < ${to}` : Prisma.empty}`;
    return Number(rows[0]?.count ?? 0);
  }

  /** Recorded (non-voided) invoice payments, grouped by the invoice's currency. */
  private async paymentsByCurrency(opts: { from?: Date; to?: Date; organizationId?: string }) {
    const rows = await this.prisma.$queryRaw<{ currency: string; count: bigint; total: Prisma.Decimal | null }[]>`
      SELECT i.currency AS currency, COUNT(*) AS count, SUM(p.amount) AS total
      FROM invoice_payments p JOIN invoices i ON i.id = p."invoiceId"
      WHERE p."voidedAt" IS NULL
      ${opts.from ? Prisma.sql`AND p."paidAt" >= ${opts.from}` : Prisma.empty}
      ${opts.to ? Prisma.sql`AND p."paidAt" < ${opts.to}` : Prisma.empty}
      ${opts.organizationId ? Prisma.sql`AND i."organizationId" = ${opts.organizationId}` : Prisma.empty}
      GROUP BY i.currency
      ORDER BY SUM(p.amount) DESC`;
    return rows.map((r) => ({ currency: r.currency, count: Number(r.count), total: money(r.total) }));
  }

  // ─────────────────────────── Businesses ───────────────────────────

  async organizations(q: ListOrganizationsQueryDto, now = new Date()) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const search: Prisma.OrganizationWhereInput = q.search
      ? {
          OR: [
            { name: { contains: q.search, mode: 'insensitive' } },
            { users: { some: { email: { contains: q.search, mode: 'insensitive' } } } },
          ],
        }
      : {};
    const status: Prisma.OrganizationWhereInput =
      q.status === 'active' ? { suspendedAt: null } : q.status === 'suspended' ? { suspendedAt: { not: null } } : {};
    const where = { ...search, ...status };
    const orderBy: Prisma.OrganizationOrderByWithRelationInput[] =
      q.sort === 'name' ? [{ name: 'asc' }, { id: 'asc' }] : [{ createdAt: q.sort === 'oldest' ? 'asc' : 'desc' }, { id: 'asc' }];

    const [rows, total, all, active, suspended] = await Promise.all([
      this.prisma.organization.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, select: ORG_ROW_SELECT }),
      this.prisma.organization.count({ where }),
      // Filter chip counts follow the search but not the status filter.
      this.prisma.organization.count({ where: search }),
      this.prisma.organization.count({ where: { ...search, suspendedAt: null } }),
      this.prisma.organization.count({ where: { ...search, suspendedAt: { not: null } } }),
    ]);

    const ids = rows.map((r) => r.id);
    const [lastActive, aiUsed] = ids.length
      ? await Promise.all([this.lastActiveByOrganization(ids), this.aiUsedByOrganization(ids, now)])
      : [new Map<string, Date>(), new Map<string, number>()];

    return {
      items: rows.map((r) => {
        const owner = r.users[0];
        return {
          id: r.id,
          name: r.name,
          currency: r.currency,
          createdAt: r.createdAt,
          suspendedAt: r.suspendedAt,
          owner: owner ? { name: `${owner.firstName} ${owner.lastName}`.trim(), email: owner.email } : null,
          counts: r._count,
          aiMonthlyLimit: r.aiMonthlyLimit,
          aiUsedThisMonth: aiUsed.get(r.id) ?? 0,
          lastActiveAt: lastActive.get(r.id) ?? null,
        };
      }),
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      counts: { all, active, suspended },
    };
  }

  private async lastActiveByOrganization(ids: string[]) {
    const rows = await this.prisma.$queryRaw<{ id: string; last: Date }[]>`
      SELECT u."organizationId" AS id, MAX(rt."createdAt") AS last
      FROM refresh_tokens rt JOIN users u ON u.id = rt."userId"
      WHERE u."organizationId" IN (${Prisma.join(ids)})
      GROUP BY u."organizationId"`;
    return new Map(rows.map((r) => [r.id, r.last]));
  }

  private async aiUsedByOrganization(ids: string[], now: Date) {
    const rows = await this.prisma.aiGeneration.groupBy({
      by: ['organizationId'],
      where: { organizationId: { in: ids }, createdAt: { gte: monthStart(now) }, ...COUNTED_GENERATION },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.organizationId, r._count._all]));
  }

  async organization(id: string, now = new Date()) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        currency: true,
        createdAt: true,
        suspendedAt: true,
        suspendedReason: true,
        aiMonthlyLimit: true,
        reminderEnabled: true,
        _count: {
          select: { users: true, artists: true, clients: true, bookings: true, quotes: true, invoices: true, contracts: true, calendarEntries: true },
        },
        users: { orderBy: { createdAt: 'asc' }, select: { id: true, firstName: true, lastName: true, email: true, role: true, createdAt: true } },
        artists: { orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, isPublished: true, epk: { select: { isPublished: true } } } },
        paymentAccounts: { orderBy: { currency: 'asc' }, select: { provider: true, currency: true, createdAt: true } },
      },
    });
    if (!org) throw new NotFoundException('Business not found.');

    const [userActivity, payments, aiUsed, audit] = await Promise.all([
      this.prisma.$queryRaw<{ id: string; last: Date }[]>`
        SELECT rt."userId" AS id, MAX(rt."createdAt") AS last
        FROM refresh_tokens rt JOIN users u ON u.id = rt."userId"
        WHERE u."organizationId" = ${id}
        GROUP BY rt."userId"`,
      this.paymentsByCurrency({ organizationId: id }),
      this.prisma.aiGeneration.count({ where: { organizationId: id, createdAt: { gte: monthStart(now) }, ...COUNTED_GENERATION } }),
      this.prisma.adminAuditLog.findMany({ where: { organizationId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    const lastByUser = new Map(userActivity.map((r) => [r.id, r.last]));
    const users = org.users.map((u) => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`.trim(),
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      lastActiveAt: lastByUser.get(u.id) ?? null,
    }));
    const lastActiveAt = users.reduce<Date | null>((max, u) => (u.lastActiveAt && (!max || u.lastActiveAt > max) ? u.lastActiveAt : max), null);

    return {
      id: org.id,
      name: org.name,
      currency: org.currency,
      createdAt: org.createdAt,
      suspendedAt: org.suspendedAt,
      suspendedReason: org.suspendedReason,
      aiMonthlyLimit: org.aiMonthlyLimit,
      aiUsedThisMonth: aiUsed,
      reminderEnabled: org.reminderEnabled,
      lastActiveAt,
      counts: org._count,
      users,
      artists: org.artists.map((a) => ({ id: a.id, name: a.name, slug: a.slug, isPublished: a.isPublished, epkPublished: a.epk?.isPublished ?? false })),
      paymentAccounts: org.paymentAccounts,
      paymentsRecorded: payments,
      audit,
    };
  }

  async suspend(admin: AdminActor, id: string, reason: string, now = new Date()) {
    const org = await this.findOrganization(id);
    if (org.id === admin.organizationId) throw new BadRequestException("You can't suspend your own business.");
    await this.prisma.$transaction(async (tx) => {
      // Conditional update, so two admins acting at once can't both "suspend" it.
      const { count } = await tx.organization.updateMany({ where: { id, suspendedAt: null }, data: { suspendedAt: now, suspendedReason: reason } });
      if (!count) throw new ConflictException('This business is already suspended.');
      // Existing sessions end now as well; the per-request check covers access tokens already issued.
      await tx.refreshToken.updateMany({ where: { revokedAt: null, user: { organizationId: id } }, data: { revokedAt: now } });
      await tx.adminAuditLog.create({ data: this.auditEntry(admin, 'ORGANIZATION_SUSPENDED', org, { reason }) });
    });
    return this.organization(id, now);
  }

  async reactivate(admin: AdminActor, id: string, now = new Date()) {
    const org = await this.findOrganization(id);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.organization.updateMany({ where: { id, suspendedAt: { not: null } }, data: { suspendedAt: null, suspendedReason: null } });
      if (!count) throw new ConflictException('This business is not suspended.');
      await tx.adminAuditLog.create({
        data: this.auditEntry(admin, 'ORGANIZATION_REACTIVATED', org, {
          suspendedAt: org.suspendedAt?.toISOString() ?? null,
          previousReason: org.suspendedReason,
        }),
      });
    });
    return this.organization(id, now);
  }

  async setAiLimit(admin: AdminActor, id: string, aiMonthlyLimit: number, now = new Date()) {
    const org = await this.findOrganization(id);
    if (org.aiMonthlyLimit !== aiMonthlyLimit) {
      await this.prisma.$transaction([
        this.prisma.organization.update({ where: { id }, data: { aiMonthlyLimit } }),
        this.prisma.adminAuditLog.create({
          data: this.auditEntry(admin, 'ORGANIZATION_AI_LIMIT_CHANGED', org, { from: org.aiMonthlyLimit, to: aiMonthlyLimit }),
        }),
      ]);
    }
    return this.organization(id, now);
  }

  private async findOrganization(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: { id: true, name: true, suspendedAt: true, suspendedReason: true, aiMonthlyLimit: true },
    });
    if (!org) throw new NotFoundException('Business not found.');
    return org;
  }

  // ─────────────────────────── Platform settings ───────────────────────────

  config() {
    return this.platformConfig.get();
  }

  async updateConfig(admin: AdminActor, dto: UpdatePlatformConfigDto) {
    const current = await this.platformConfig.get();
    const next: Record<string, unknown> = {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of CONFIG_FIELDS) {
      let value = dto[field];
      if (value === undefined) continue;
      if (field === 'announcement' && (value === '' || value === null)) value = null;
      if (value !== current[field]) {
        next[field] = value;
        changes[field] = { from: current[field], to: value };
      }
    }
    if (!Object.keys(changes).length) return current;

    const [updated] = await this.prisma.$transaction([
      this.prisma.platformConfig.update({ where: { id: current.id }, data: { ...next, updatedByEmail: admin.email } }),
      this.prisma.adminAuditLog.create({
        data: this.auditEntry(admin, 'PLATFORM_CONFIG_UPDATED', null, { changes } as Prisma.InputJsonValue),
      }),
    ]);
    return updated;
  }

  // ─────────────────────────── Audit log ───────────────────────────

  async audit(q: AuditQueryDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.AdminAuditLogWhereInput = {
      ...(q.organizationId ? { organizationId: q.organizationId } : {}),
      ...(q.action ? { action: q.action } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.adminAuditLog.count({ where }),
    ]);
    return { items, page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
  }

  private auditEntry(
    admin: AdminActor,
    action: AdminAction,
    org: { id: string; name: string } | null,
    details: Prisma.InputJsonValue,
  ): Prisma.AdminAuditLogUncheckedCreateInput {
    return {
      adminUserId: admin.sub,
      adminEmail: admin.email,
      action,
      organizationId: org?.id ?? null,
      organizationName: org?.name ?? null,
      details,
    };
  }
}
