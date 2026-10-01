/**
 * Demo data for local development: one agency ("Moyo Creative Management") with three artists
 * and a realistic spread of clients, bookings, quotes, invoices, contracts, calendar items,
 * emails and notifications. Dates are relative to today, so the calendar and dashboard always
 * look current.
 *
 *   npm run db:seed --workspace api
 *
 * Re-running is safe: it deletes the demo organisation (found by the demo login) and rebuilds it.
 * Nothing outside that organisation is touched.
 */
import { randomBytes } from 'node:crypto';
import { PrismaClient, type Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { DEFAULT_CONTRACT_TEMPLATE, renderContract } from '../src/modules/contracts/contract-renderer';

const DEMO_EMAIL = 'demo@artbh.local';
const FINANCE_EMAIL = 'finance@artbh.local';
const DEMO_PASSWORD = 'ArtBH-demo-2026';
const TZ = 'Africa/Harare';

const prisma = new PrismaClient();

// ---------- dates ----------
const todayParts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date())
  .split('-')
  .map(Number);

/** A calendar day `offset` days from today, as UTC midnight (how the app stores days). */
function day(offset: number): Date {
  return new Date(Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2] + offset));
}

/** A moment during that day (10:00 Harare), for timestamps like payments and issue dates. */
function at(offset: number, hourUtc = 8): Date {
  const d = day(offset);
  d.setUTCHours(hourUtc);
  return d;
}

// ---------- helpers ----------
async function freeSlug(slug: string): Promise<string> {
  // Slugs are unique platform-wide; if a test run already used one, add a suffix rather than fail.
  for (let i = 0; ; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
    if (!(await prisma.artist.findUnique({ where: { slug: candidate } }))) return candidate;
  }
}

type Line = [description: string, quantity: number, unitPrice: number];
const total = (lines: Line[]) => lines.reduce((sum, [, q, p]) => sum + q * p, 0);
const items = (lines: Line[]) => lines.map(([description, quantity, unitPrice], position) => ({ description, quantity, unitPrice, position }));

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed demo data in production.');

  // ---------- reset ----------
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    await prisma.organization.delete({ where: { id: existing.organizationId } });
    console.log('Removed the previous demo organisation.');
  }
  await prisma.user.deleteMany({ where: { email: FINANCE_EMAIL } });

  // ---------- organisation & users ----------
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const org = await prisma.organization.create({
    data: { name: 'Moyo Creative Management', currency: 'USD', reminderEnabled: true, reminderDays: [1, 7, 14] },
  });
  const owner = await prisma.user.create({
    data: { organizationId: org.id, email: DEMO_EMAIL, passwordHash, firstName: 'Rudo', lastName: 'Moyo', role: 'OWNER', emailVerifiedAt: new Date() },
  });
  const finance = await prisma.user.create({
    data: { organizationId: org.id, email: FINANCE_EMAIL, passwordHash, firstName: 'Tapiwa', lastName: 'Sibanda', role: 'FINANCE', emailVerifiedAt: new Date() },
  });
  const orgId = org.id;

  // ---------- artists ----------
  const tariro = await prisma.artist.create({
    data: {
      organizationId: orgId,
      name: 'Tariro Moyo',
      slug: await freeSlug('tariro-moyo'),
      category: 'Musician',
      genres: ['Afro-soul', 'Afro-jazz', 'Mbira fusion'],
      tagline: 'Afro-soul vocalist blending mbira with modern jazz',
      bio: 'Tariro Moyo is a Harare-born vocalist and songwriter whose music weaves traditional mbira rhythms into warm, modern Afro-soul. Since her debut EP "Mhepo" in 2022 she has headlined HIFA, toured South Africa and Botswana, and become a favourite at weddings and corporate galas for her eight-piece live band.',
      location: 'Harare, Zimbabwe',
      bookingEmail: 'bookings@moyocreative.example.com',
      bookingPhone: '+263 77 123 4567',
      website: 'https://tariromoyo.example.com',
      instagram: 'https://instagram.com/tariromoyo.example',
      youtube: 'https://youtube.com/@tariromoyo.example',
      isPublished: true,
    },
  });
  const kudzi = await prisma.artist.create({
    data: {
      organizationId: orgId,
      name: 'DJ Kudzi',
      slug: await freeSlug('dj-kudzi'),
      category: 'DJ',
      genres: ['Amapiano', 'Afro-house', 'Gqom'],
      tagline: 'Amapiano and Afro-house selector, Harare to Jozi',
      bio: 'DJ Kudzi (Kudzai Mhlanga) has been filling dance floors across Harare, Bulawayo and Johannesburg since 2019. A resident at Moto Republik and a regular on brand activations, Kudzi reads a crowd like few others and is known for seamless three-hour Amapiano sets.',
      location: 'Harare, Zimbabwe',
      bookingEmail: 'bookings@moyocreative.example.com',
      bookingPhone: '+263 78 555 0199',
      instagram: 'https://instagram.com/djkudzi.example',
      tiktok: 'https://tiktok.com/@djkudzi.example',
      isPublished: true,
    },
  });
  const tino = await prisma.artist.create({
    data: {
      organizationId: orgId,
      name: 'Tino Mapfumo',
      slug: await freeSlug('tino-mapfumo'),
      category: 'Comedian',
      genres: ['Stand-up', 'MC'],
      tagline: 'Stand-up comedian and event MC',
      bio: 'Tino Mapfumo turns everyday Zimbabwean life into sharp, clean stand-up. He hosts corporate year-end functions, school fundraisers and awards nights, and is working on his first comedy special.',
      location: 'Bulawayo, Zimbabwe',
      bookingEmail: 'bookings@moyocreative.example.com',
      isPublished: false,
    },
  });

  // ---------- EPKs ----------
  await prisma.epk.create({
    data: {
      artistId: tariro.id,
      isPublished: true,
      achievements: [
        'Headlined the HIFA main stage (2024 and 2025)',
        'Best Female Artist, Zimbabwe Music Awards 2024',
        '"Mhepo" EP: over 1.2 million streams',
        'Toured South Africa and Botswana with an eight-piece band',
      ],
      discography: [
        { title: 'Rudo Rwangu', kind: 'Single', year: 2026 },
        { title: 'Kumusha', kind: 'Album', year: 2024 },
        { title: 'Mhepo', kind: 'EP', year: 2022 },
      ],
      performances: [
        { name: 'Harare International Festival of the Arts', location: 'Harare', year: 2025 },
        { name: 'Bushfire Festival', location: 'Eswatini', year: 2024 },
        { name: 'Joburg Jazz Nights', location: 'Johannesburg', year: 2024 },
      ],
      pressQuotes: [
        { quote: 'A voice that carries the warmth of home and the confidence of a star.', source: 'The Herald' },
        { quote: 'Moyo makes mbira feel brand new.', source: 'NewsDay Arts' },
      ],
    },
  });
  await prisma.epk.create({
    data: {
      artistId: kudzi.id,
      isPublished: false,
      achievements: ['Resident DJ at Moto Republik since 2023', 'Opened for Kabza De Small, Harare 2025'],
      performances: [{ name: 'Moto Republik residency', location: 'Harare', year: 2025 }],
    },
  });

  // ---------- clients ----------
  const clientData = [
    { key: 'rainbow', name: 'Nyasha Chikore', company: 'Rainbow Towers Hotel', email: 'events@rainbowtowers.example.com', phone: '+263 24 277 2633', notes: 'Books a gala every year. Prefers invoices in USD, pays by bank transfer.' },
    { key: 'econet', name: 'Farai Mutasa', company: 'Econet Wireless', email: 'farai.mutasa@econet.example.com', phone: '+263 77 200 3000', notes: 'Corporate events team. Needs a tax invoice and a signed contract before paying.' },
    { key: 'hifa', name: 'Tendai Gumbo', company: 'HIFA', email: 'programming@hifa.example.com', phone: '+263 24 230 0119' },
    { key: 'wedding', name: 'Chipo Ndlovu', email: 'chipo.ndlovu@example.com', phone: '+263 71 888 2211', notes: 'Wedding with Tawanda at Leopard Rock. Wants "Rudo Rwangu" for the first dance.' },
    { key: 'jamtree', name: 'Sipho Dube', company: 'Jam Tree Bulawayo', email: 'sipho@jamtree.example.com', phone: '+263 29 288 0045', notes: 'Usually pays late; send a reminder a week after the gig.' },
    { key: 'delta', name: 'Ruvimbo Chari', company: 'Delta Beverages', email: 'ruvimbo.chari@delta.example.com', phone: '+263 24 288 4010' },
    { key: 'moto', name: 'Takudzwa Mhlanga', company: 'Moto Republik', email: 'bookings@motorepublik.example.com', phone: '+263 78 101 2020' },
    { key: 'station', name: 'Lerato Khumalo', company: 'The Station Club, Johannesburg', email: 'lerato@thestation.example.co.za', phone: '+27 82 555 0147', notes: 'Pays in ZAR.' },
  ];
  const clients: Record<string, { id: string; name: string; email: string | null; phone: string | null; company: string | null }> = {};
  for (const { key, ...data } of clientData) {
    clients[key] = await prisma.client.create({ data: { organizationId: orgId, ...data } });
  }
  const who = (key: string) => {
    const c = clients[key];
    return { clientId: c.id, clientName: c.company ?? c.name, clientEmail: c.email };
  };

  // ---------- bookings ----------
  // createdAt = when the enquiry came in (the dashboard counts bookings by it).
  type BookingSeed = Omit<Prisma.BookingUncheckedCreateInput, 'organizationId'>;
  const booking = (data: BookingSeed) => prisma.booking.create({ data: { organizationId: orgId, ...data } });

  const bHifa = await booking({createdAt: at(-30),  artistId: tariro.id, ...who('hifa'), clientPhone: clients.hifa.phone, eventType: 'Festival', eventDate: day(18), venue: 'HIFA Main Stage, Harare Gardens', fee: 1500, status: 'CONFIRMED', notes: '75-minute headline set. Soundcheck 15:00.' });
  const bWedding = await booking({createdAt: at(-25),  artistId: tariro.id, ...who('wedding'), clientPhone: clients.wedding.phone, eventType: 'Wedding', eventDate: day(32), venue: 'Leopard Rock Hotel, Vumba', fee: 900, status: 'DEPOSIT_PAID', notes: 'Ceremony (acoustic trio) + reception (full band).' });
  const bMoto = await booking({createdAt: at(-6),  artistId: kudzi.id, ...who('moto'), clientPhone: clients.moto.phone, eventType: 'Club night', eventDate: day(9), venue: 'Moto Republik, Harare', fee: 450, status: 'CONTRACT_SENT' });
  await booking({createdAt: at(-2),  artistId: kudzi.id, clientName: 'Kuda Marufu', clientPhone: '+263 77 444 9090', eventType: 'Private party', eventDate: day(9), venue: 'Borrowdale Brooke, Harare', fee: 600, status: 'NEW_ENQUIRY', notes: '30th birthday. Same night as Moto Republik: can we do an early slot?' });
  const bDelta = await booking({createdAt: at(-5),  artistId: kudzi.id, ...who('delta'), clientPhone: clients.delta.phone, eventType: 'Brand activation', eventDate: day(45), venue: 'Borrowdale Racecourse', fee: 1200, status: 'QUOTE_SENT' });
  const bEconet = await booking({createdAt: at(-12),  artistId: tino.id, ...who('econet'), clientPhone: clients.econet.phone, eventType: 'Corporate year-end', eventDate: day(60), venue: 'Econet Park, Harare', fee: 800, status: 'NEGOTIATION', notes: 'Client asked if 45 minutes can include MC duties.' });
  const bRainbow = await booking({createdAt: at(-80),  artistId: tariro.id, ...who('rainbow'), clientPhone: clients.rainbow.phone, eventType: 'Gala dinner', eventDate: day(-40), venue: 'Rainbow Towers, Harare', fee: 2000, status: 'PAYMENT_RECEIVED' });
  const bJamTree = await booking({createdAt: at(-35),  artistId: kudzi.id, ...who('jamtree'), clientPhone: clients.jamtree.phone, eventType: 'Club night', eventDate: day(-12), venue: 'Jam Tree, Bulawayo', fee: 350, status: 'COMPLETED' });
  await booking({createdAt: at(-20),  artistId: tino.id, clientName: 'Theatre in the Park', clientEmail: 'info@theatreinthepark.example.com', eventType: 'Comedy night', eventDate: day(0), venue: 'Theatre in the Park, Harare Gardens', fee: 300, status: 'EVENT' });
  const bStation = await booking({createdAt: at(-18),  artistId: kudzi.id, ...who('station'), clientPhone: clients.station.phone, eventType: 'Club night', eventDate: day(25), venue: 'The Station Club, Johannesburg', fee: 15000, currency: 'ZAR', status: 'CONFIRMED', notes: 'Flights and accommodation covered by the club.' });
  await booking({createdAt: at(-1),  artistId: tariro.id, clientName: 'Rutendo Sibanda', clientPhone: '+263 71 234 5678', eventType: 'Birthday party', eventDate: day(75), venue: 'Private residence, Mount Pleasant', status: 'NEW_ENQUIRY', notes: 'Enquiry via WhatsApp. Asked for an acoustic set, budget unknown.' });
  const bSchool = await booking({createdAt: at(-8),  artistId: tino.id, clientName: "St John's College PTA", clientEmail: 'pta@stjohns.example.com', eventType: 'School fundraiser', eventDate: day(50), venue: "St John's College Hall, Harare", fee: 500, status: 'QUALIFIED' });
  const bStaffParty = await booking({createdAt: at(-90),  artistId: tino.id, ...who('econet'), eventType: 'Staff party', eventDate: day(-70), venue: 'Econet Park, Harare', fee: 400, status: 'PAYMENT_RECEIVED' });

  // ---------- quotes ----------
  let quoteNo = 0;
  const quote = async (data: Omit<Prisma.QuoteUncheckedCreateInput, 'organizationId' | 'number' | 'items'>, lines: Line[]) =>
    prisma.quote.create({ data: { organizationId: orgId, number: ++quoteNo, ...data, items: { create: items(lines) } } });

  const qRainbow = await quote({ artistId: tariro.id, bookingId: bRainbow.id, ...who('rainbow'), title: 'Rainbow Towers annual gala', status: 'ACCEPTED', validUntil: day(-60), createdAt: at(-75) }, [
    ['Tariro Moyo & band: two 45-minute sets', 1, 1700],
    ['Sound engineer', 1, 300],
  ]);
  const qWedding = await quote({ artistId: tariro.id, bookingId: bWedding.id, ...who('wedding'), title: 'Chipo & Tawanda wedding', status: 'ACCEPTED', validUntil: day(-5), createdAt: at(-20), notes: 'Travel to the Vumba included.' }, [
    ['Ceremony: acoustic trio', 1, 300],
    ['Reception: full band, two sets', 1, 600],
  ]);
  const qDelta = await quote({ artistId: kudzi.id, bookingId: bDelta.id, ...who('delta'), title: 'Delta summer launch activation', status: 'SENT', validUntil: day(10), createdAt: at(-4) }, [
    ['DJ Kudzi: 3-hour set', 1, 1000],
    ['Sound and lighting package', 1, 200],
  ]);
  const qEconet = await quote({ artistId: tino.id, bookingId: bEconet.id, ...who('econet'), title: 'Econet year-end function', status: 'SENT', validUntil: day(3), createdAt: at(-9) }, [
    ['Stand-up set (45 minutes)', 1, 700],
    ['Travel from Bulawayo', 1, 100],
  ]);
  await quote({ artistId: tino.id, bookingId: bSchool.id, clientName: "St John's College PTA", clientEmail: 'pta@stjohns.example.com', title: 'School fundraiser comedy night', status: 'DRAFT', validUntil: day(21) }, [
    ['Stand-up set (40 minutes)', 1, 450],
    ['MC for the auction', 1, 50],
  ]);
  await quote({ artistId: tariro.id, ...who('econet'), title: 'Lake Chivero leadership retreat', status: 'DECLINED', validUntil: day(-30), createdAt: at(-45), notes: 'Client went with a local band.' }, [
    ['Acoustic set, two hours', 1, 1500],
    ['Transport and accommodation', 1, 300],
  ]);
  await quote({ artistId: tariro.id, ...who('hifa'), title: 'HIFA vocal workshop', status: 'SENT', validUntil: day(-5), createdAt: at(-25) }, [['Two-hour vocal workshop', 2, 150]]);

  // ---------- invoices ----------
  let invoiceNo = 0;
  const invoice = async (
    data: Omit<Prisma.InvoiceUncheckedCreateInput, 'organizationId' | 'number' | 'items' | 'payments'>,
    lines: Line[],
    payments: { amount: number; offset: number; method: string; note?: string; voidReason?: string }[] = [],
  ) =>
    prisma.invoice.create({
      data: {
        organizationId: orgId,
        number: ++invoiceNo,
        ...data,
        items: { create: items(lines) },
        payments: {
          create: payments.map((p) => ({
            amount: p.amount,
            paidAt: at(p.offset),
            method: p.method,
            note: p.note,
            voidedAt: p.voidReason ? at(p.offset + 1) : undefined,
            voidReason: p.voidReason,
          })),
        },
      },
    });

  await invoice({ artistId: tino.id, bookingId: bStaffParty.id, ...who('econet'), title: 'Econet staff party', status: 'PAID', issueDate: at(-72), dueDate: day(-60) }, [['Stand-up set and MC', 1, 400]], [
    { amount: 400, offset: -63, method: 'Bank transfer' },
  ]);
  await invoice({ artistId: tariro.id, bookingId: bRainbow.id, quoteId: qRainbow.id, ...who('rainbow'), title: 'Rainbow Towers annual gala', status: 'PAID', issueDate: at(-50), dueDate: day(-30) }, [
    ['Tariro Moyo & band: two 45-minute sets', 1, 1700],
    ['Sound engineer', 1, 300],
  ], [
    { amount: 1000, offset: -48, method: 'EcoCash', note: 'Deposit' },
    { amount: 1000, offset: -35, method: 'Bank transfer', note: 'Balance' },
  ]);
  const iJamTree = await invoice({ artistId: kudzi.id, bookingId: bJamTree.id, ...who('jamtree'), title: 'Jam Tree club night', status: 'SENT', issueDate: at(-12), dueDate: day(-5) }, [['DJ Kudzi: club set', 1, 350]], [
    { amount: 350, offset: -8, method: 'Cash', voidReason: 'Recorded against the wrong invoice' },
  ]);
  const iWedding = await invoice({ artistId: tariro.id, bookingId: bWedding.id, quoteId: qWedding.id, ...who('wedding'), title: 'Chipo & Tawanda wedding', status: 'PARTIALLY_PAID', issueDate: at(-15), dueDate: day(25), publicToken: randomBytes(24).toString('base64url') }, [
    ['Ceremony: acoustic trio', 1, 300],
    ['Reception: full band, two sets', 1, 600],
  ], [{ amount: 450, offset: -3, method: 'EcoCash', note: '50% deposit' }]);
  const iHifa = await invoice({ artistId: tariro.id, bookingId: bHifa.id, ...who('hifa'), title: 'HIFA headline performance', status: 'PARTIALLY_PAID', issueDate: at(-10), dueDate: day(14) }, [['Headline set (75 minutes)', 1, 1500]], [
    { amount: 750, offset: -1, method: 'Bank transfer', note: 'Deposit' },
  ]);
  // Rand invoice: the rate (USD per ZAR) is fixed when the invoice is created.
  await invoice({ artistId: kudzi.id, bookingId: bStation.id, ...who('station'), title: 'The Station Club, Johannesburg', currency: 'ZAR', exchangeRate: 0.0548, status: 'SENT', issueDate: at(-1), dueDate: day(20) }, [['DJ Kudzi: headline set', 1, 15000]]);
  await invoice({ artistId: kudzi.id, bookingId: bMoto.id, ...who('moto'), title: 'Moto Republik club night', status: 'DRAFT', issueDate: at(0), dueDate: day(16) }, [['DJ Kudzi: 3-hour set', 1, 450]]);
  await invoice({ artistId: kudzi.id, ...who('jamtree'), title: 'Jam Tree club night (duplicate)', status: 'VOID', issueDate: at(-12), dueDate: day(-5), notes: 'Created twice by mistake.' }, [['DJ Kudzi: club set', 1, 350]]);

  // ---------- contracts ----------
  let contractNo = 0;
  const contract = async (
    data: {
      artist: { id: string; name: string };
      bookingId: string;
      client: { clientId?: string; clientName: string; clientEmail?: string | null };
      quoteId?: string;
      title: string;
      eventType: string;
      eventDate: Date;
      venue: string;
      durationMinutes: number;
      fee: number;
      depositAmount: number;
      status: 'DRAFT' | 'SENT' | 'SIGNED';
      createdOffset: number;
      signedOffset?: number;
      accommodation?: string;
      transport?: string;
      extraTerms?: string;
    },
  ) => {
    const terms = {
      paymentTerms: 'on the day of the event, before the performance',
      cancellationTerms: 'If the Client cancels more than 30 days before the event, the deposit is refunded in full. Within 30 days, the deposit is kept. Within 7 days, the full fee is due.',
      accommodation: data.accommodation ?? null,
      transport: data.transport ?? null,
      extraTerms: data.extraTerms ?? null,
    };
    const body = renderContract(DEFAULT_CONTRACT_TEMPLATE.body, {
      artistName: data.artist.name,
      clientName: data.client.clientName,
      title: data.title,
      eventType: data.eventType,
      eventDate: data.eventDate,
      venue: data.venue,
      durationMinutes: data.durationMinutes,
      currency: 'USD',
      fee: data.fee,
      depositAmount: data.depositAmount,
      today: at(data.createdOffset),
      ...terms,
    });
    return prisma.contract.create({
      data: {
        organizationId: orgId,
        number: ++contractNo,
        artistId: data.artist.id,
        bookingId: data.bookingId,
        quoteId: data.quoteId,
        clientId: data.client.clientId,
        clientName: data.client.clientName,
        clientEmail: data.client.clientEmail,
        artistName: data.artist.name,
        title: data.title,
        eventType: data.eventType,
        eventDate: data.eventDate,
        venue: data.venue,
        durationMinutes: data.durationMinutes,
        currency: 'USD',
        fee: data.fee,
        depositAmount: data.depositAmount,
        ...terms,
        body,
        status: data.status,
        signedAt: data.signedOffset !== undefined ? at(data.signedOffset) : null,
        createdAt: at(data.createdOffset),
      },
    });
  };

  await contract({ artist: tariro, bookingId: bHifa.id, client: who('hifa'), title: 'HIFA headline performance', eventType: 'Festival', eventDate: day(18), venue: 'HIFA Main Stage, Harare Gardens', durationMinutes: 75, fee: 1500, depositAmount: 750, status: 'SIGNED', createdOffset: -14, signedOffset: -11, extraTerms: 'The festival provides backline and a monitor engineer.' });
  await contract({ artist: tariro, bookingId: bWedding.id, quoteId: qWedding.id, client: who('wedding'), title: 'Chipo & Tawanda wedding', eventType: 'Wedding', eventDate: day(32), venue: 'Leopard Rock Hotel, Vumba', durationMinutes: 150, fee: 900, depositAmount: 450, status: 'SIGNED', createdOffset: -16, signedOffset: -4, accommodation: 'Two rooms at Leopard Rock Hotel for the band, provided by the Client.', transport: 'Artist travels by road; fuel included in the fee.' });
  const cMoto = await contract({ artist: kudzi, bookingId: bMoto.id, client: who('moto'), title: 'Moto Republik club night', eventType: 'Club night', eventDate: day(9), venue: 'Moto Republik, Harare', durationMinutes: 180, fee: 450, depositAmount: 150, status: 'SENT', createdOffset: -2 });
  await contract({ artist: tino, bookingId: bEconet.id, client: who('econet'), title: 'Econet year-end function', eventType: 'Corporate year-end', eventDate: day(60), venue: 'Econet Park, Harare', durationMinutes: 45, fee: 800, depositAmount: 400, status: 'DRAFT', createdOffset: -1, transport: 'Return travel from Bulawayo included.' });

  // ---------- calendar entries ----------
  const entry = (data: Omit<Prisma.CalendarEntryUncheckedCreateInput, 'organizationId' | 'createdById'>) =>
    prisma.calendarEntry.create({ data: { organizationId: orgId, createdById: owner.id, ...data } });

  await entry({ kind: 'MEETING', title: 'Monthly planning meeting', startDate: day(2), endDate: day(2), startTime: '10:00', endTime: '11:30', notes: 'Review pipeline and overdue invoices.' });
  await entry({ artistId: tariro.id, kind: 'STUDIO', title: 'Recording "Rudo Rwangu" (single)', startDate: day(4), endDate: day(5), startTime: '09:00', endTime: '17:00', notes: 'Mono Studios, Avondale.' });
  await entry({ artistId: tino.id, kind: 'OTHER', title: 'Writing session: new material', startDate: day(7), endDate: day(7), startTime: '14:00' });
  await entry({ artistId: tariro.id, kind: 'REHEARSAL', title: 'Full band rehearsal for HIFA', startDate: day(16), endDate: day(16), startTime: '14:00', endTime: '18:00' });
  await entry({ artistId: kudzi.id, kind: 'TRAVEL', title: 'Harare to Johannesburg', startDate: day(24), endDate: day(26), notes: 'FlySafair, return on the 26th.' });
  await entry({ artistId: tariro.id, kind: 'RELEASE', title: 'Single release: "Rudo Rwangu"', startDate: day(40), endDate: day(40) });
  await entry({ artistId: kudzi.id, kind: 'BLOCKED', title: 'Family holiday', startDate: day(55), endDate: day(58) });
  await entry({ artistId: tariro.id, kind: 'STUDIO', title: 'Vocal session: album demos', startDate: day(-20), endDate: day(-20), startTime: '10:00', endTime: '15:00' });

  // ---------- email history (already delivered, so the worker leaves them alone) ----------
  const sent = (data: Omit<Prisma.EmailMessageUncheckedCreateInput, 'organizationId' | 'status' | 'attempts'>, offset: number) =>
    prisma.emailMessage.create({ data: { organizationId: orgId, status: 'SENT', attempts: 1, sentAt: at(offset), createdAt: at(offset), ...data } });

  await sent({ kind: 'INVOICE', invoiceId: iJamTree.id, createdById: owner.id, toEmail: clients.jamtree.email!, toName: clients.jamtree.name, replyTo: DEMO_EMAIL, subject: `Invoice INV-${String(iJamTree.number).padStart(4, '0')} from Moyo Creative Management`, bodyText: 'Hi Sipho,\n\nThanks for having DJ Kudzi at Jam Tree. Please find the invoice for the club night attached.\n\nKind regards,\nRudo' }, -12);
  await sent({ kind: 'INVOICE_REMINDER', invoiceId: iJamTree.id, toEmail: clients.jamtree.email!, toName: clients.jamtree.name, replyTo: DEMO_EMAIL, subject: `Reminder: invoice INV-${String(iJamTree.number).padStart(4, '0')} is overdue`, bodyText: 'Hi Sipho,\n\nThis is a friendly reminder that invoice INV-0003 for $350.00 was due recently.', dedupeKey: `reminder:${iJamTree.id}:1` }, -4);
  await sent({ kind: 'CONTRACT', contractId: cMoto.id, createdById: owner.id, toEmail: clients.moto.email!, toName: clients.moto.name, replyTo: DEMO_EMAIL, subject: 'Contract for DJ Kudzi at Moto Republik', bodyText: 'Hi Takudzwa,\n\nHere is the contract for the club night. Please sign and return it with the deposit to confirm the date.\n\nRudo' }, -2);
  await sent({ kind: 'INVOICE', invoiceId: iWedding.id, createdById: finance.id, toEmail: clients.wedding.email!, toName: clients.wedding.name, replyTo: FINANCE_EMAIL, subject: 'Invoice for your wedding performance', bodyText: 'Hi Chipo,\n\nCongratulations again! Here is the invoice. You can pay online using the link below.\n\nTapiwa', ctaLabel: 'Pay invoice', ctaUrl: `http://localhost:5173/pay/${iWedding.publicToken}` }, -15);

  // ---------- bell notifications ----------
  for (const user of [owner, finance]) {
    await prisma.userNotification.createMany({
      data: [
        { userId: user.id, organizationId: orgId, type: 'PAYMENT_RECEIVED', title: 'Payment received: $750.00', body: 'HIFA paid the deposit on "HIFA headline performance".', link: '/invoices', createdAt: at(-1) },
        { userId: user.id, organizationId: orgId, type: 'PAYMENT_RECEIVED', title: 'Payment received: $450.00', body: 'Chipo Ndlovu paid the wedding deposit.', link: '/invoices', createdAt: at(-3), readAt: at(-2) },
        { userId: user.id, organizationId: orgId, type: 'REMINDERS_SENT', title: '1 overdue reminder sent', body: 'Jam Tree Bulawayo was reminded about INV-0003.', link: '/invoices', createdAt: at(-4), readAt: at(-4) },
      ],
    });
  }

  console.log(`
Demo data ready for "${org.name}".
  Log in:   ${DEMO_EMAIL} / ${DEMO_PASSWORD}   (owner)
            ${FINANCE_EMAIL} / ${DEMO_PASSWORD}   (finance)
  Created:  3 artists, 8 clients, 13 bookings, ${quoteNo} quotes, ${invoiceNo} invoices, ${contractNo} contracts, 8 calendar items.
  Public:   /a/${tariro.slug}  and  /a/${tariro.slug}/epk
  Pay page: /pay/${iWedding.publicToken}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
