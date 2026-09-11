import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateAircraftDto } from './dto/create-aircraft.dto';
import { UpdateAircraftDto } from './dto/update-aircraft.dto';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { CreateAirportDto } from './dto/create-airport.dto';
import { UpdateAirportDto } from './dto/update-airport.dto';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { CreateOperatorDto } from './dto/create-operator.dto';
import { UpdateOperatorDto } from './dto/update-operator.dto';
import { CreateCountryFeeDto } from './dto/create-country-fee.dto';
import { UpdateCountryFeeDto } from './dto/update-country-fee.dto';
import { CreateCountryRuleDto } from './dto/create-country-rule.dto';
import { UpdateCountryRuleDto } from './dto/update-country-rule.dto';
import { ContactChannelsService, CONTACT_CHANNELS_INCLUDE } from '../contacts/contact-channels.service';

@Injectable()
export class ReferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly contactChannels: ContactChannelsService,
  ) {}

  countries() {
    return this.prisma.country.findMany({ orderBy: { name: 'asc' } });
  }

  country(iso2: string) {
    return this.prisma.country.findUnique({ where: { iso2 } });
  }

  async createCountry(dto: CreateCountryDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    const country = await this.prisma.country.create({ data: rest });
    await this.audit.log(user, 'Country', country.iso2, 'Created', '', country.iso2);
    return country;
  }

  async updateCountry(iso2: string, dto: UpdateCountryDto) {
    const before = await this.prisma.country.findUnique({ where: { iso2 } });
    if (!before) throw new NotFoundException(`Country ${iso2} not found`);
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    const country = await this.prisma.country.update({ where: { iso2 }, data: rest });
    await this.audit.logDiff(user, 'Country', iso2, before as unknown as Record<string, unknown>, country as unknown as Record<string, unknown>);
    return country;
  }

  async deleteCountry(iso2: string, user = 'SYSTEM') {
    const existing = await this.prisma.country.findUnique({ where: { iso2 } });
    if (!existing) throw new NotFoundException(`Country ${iso2} not found`);
    try {
      await this.prisma.country.delete({ where: { iso2 } });
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && (e as Prisma.PrismaClientKnownRequestError).code === 'P2003') {
        throw new BadRequestException('Cannot delete a country with airports or country rules on file.');
      }
      throw e;
    }
    await this.audit.log(user, 'Country', iso2, 'Deleted', iso2, '');
    return { iso2, deleted: true };
  }

  airports() {
    return this.prisma.airport.findMany({ orderBy: { icao: 'asc' } });
  }

  // Opt-in pagination, same convention as GET /trips (page absent -> the
  // full array, unchanged, for every existing caller that scans/caches the
  // whole list). Added once the Airports table genuinely needed it — a
  // ~34,000-row import (Item 17) is what the world's real airport count
  // actually looks like, and the Reference Data page's plain client-side
  // filter-and-render-every-row pattern was never built for that.
  async airportsPaginated(page: number, limit: number, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? {
          OR: [
            { icao: { contains: search, mode: 'insensitive' as const } },
            { iata: { contains: search, mode: 'insensitive' as const } },
            { name: { contains: search, mode: 'insensitive' as const } },
            { city: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : undefined;
    const [data, total] = await Promise.all([
      this.prisma.airport.findMany({ where, orderBy: { icao: 'asc' }, skip, take: limit }),
      this.prisma.airport.count({ where }),
    ]);
    return { data, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  airport(icao: string) {
    return this.prisma.airport.findUnique({ where: { icao } });
  }

  async createAirport(dto: CreateAirportDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    const airport = await this.prisma.airport.create({ data: rest });
    await this.audit.log(user, 'Airport', airport.icao, 'Created', '', airport.icao);
    return airport;
  }

  async updateAirport(icao: string, dto: UpdateAirportDto) {
    const before = await this.prisma.airport.findUnique({ where: { icao } });
    if (!before) throw new NotFoundException(`Airport ${icao} not found`);
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    const airport = await this.prisma.airport.update({ where: { icao }, data: rest });
    await this.audit.logDiff(user, 'Airport', icao, before as unknown as Record<string, unknown>, airport as unknown as Record<string, unknown>);
    return airport;
  }

  async deleteAirport(icao: string, user = 'SYSTEM') {
    const existing = await this.prisma.airport.findUnique({ where: { icao } });
    if (!existing) throw new NotFoundException(`Airport ${icao} not found`);
    await this.prisma.airport.delete({ where: { icao } });
    await this.audit.log(user, 'Airport', icao, 'Deleted', icao, '');
    return { icao, deleted: true };
  }

  cities() {
    return this.prisma.city.findMany({ orderBy: { name: 'asc' } });
  }

  aircraftTypes() {
    return this.prisma.aircraftType.findMany({ orderBy: { icaoType: 'asc' } });
  }

  aircraftType(icaoType: string) {
    return this.prisma.aircraftType.findUnique({ where: { icaoType } });
  }

  aircraft() {
    return this.prisma.aircraft.findMany({ include: { type: true, operator: true }, orderBy: { registration: 'asc' } });
  }

  aircraftByRegistration(registration: string) {
    return this.prisma.aircraft.findUnique({ where: { registration }, include: { type: true, operator: true } });
  }

  async createAircraft(dto: CreateAircraftDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, insuranceValidUntil, airworthinessValidUntil, ...rest } = dto;
    const aircraft = await this.prisma.aircraft.create({
      data: {
        ...rest,
        insuranceValidUntil: insuranceValidUntil ? new Date(insuranceValidUntil) : undefined,
        airworthinessValidUntil: airworthinessValidUntil ? new Date(airworthinessValidUntil) : undefined,
      },
      include: { type: true, operator: true },
    });
    await this.audit.log(user, 'Aircraft', aircraft.registration, 'Created', '', aircraft.registration);
    return aircraft;
  }

  async updateAircraft(registration: string, dto: UpdateAircraftDto) {
    const before = await this.prisma.aircraft.findUnique({ where: { registration } });
    if (!before) throw new NotFoundException(`Aircraft ${registration} not found`);
    const user = dto.user || 'SYSTEM';
    const { user: _user, insuranceValidUntil, airworthinessValidUntil, ...rest } = dto;
    const aircraft = await this.prisma.aircraft.update({
      where: { registration },
      data: {
        ...rest,
        insuranceValidUntil: insuranceValidUntil ? new Date(insuranceValidUntil) : undefined,
        airworthinessValidUntil: airworthinessValidUntil ? new Date(airworthinessValidUntil) : undefined,
      },
      include: { type: true, operator: true },
    });
    await this.audit.logDiff(user, 'Aircraft', registration, before as unknown as Record<string, unknown>, aircraft as unknown as Record<string, unknown>);
    return aircraft;
  }

  async deleteAircraft(registration: string, user = 'SYSTEM') {
    const existing = await this.prisma.aircraft.findUnique({ where: { registration } });
    if (!existing) throw new NotFoundException(`Aircraft ${registration} not found`);
    await this.prisma.aircraft.delete({ where: { registration } });
    await this.audit.log(user, 'Aircraft', registration, 'Deleted', registration, '');
    return { registration, deleted: true };
  }

  operators() {
    return this.prisma.operator.findMany({ orderBy: { name: 'asc' }, include: CONTACT_CHANNELS_INCLUDE });
  }

  operator(operatorId: string) {
    return this.prisma.operator.findUnique({ where: { operatorId }, include: CONTACT_CHANNELS_INCLUDE });
  }

  async createOperator(dto: CreateOperatorDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, channels, ...rest } = dto;
    const operator = await this.prisma.operator.create({ data: rest });
    await this.contactChannels.replace({ operatorId: operator.operatorId }, channels ?? []);
    await this.audit.log(user, 'Operator', operator.operatorId, 'Created', '', operator.operatorId);
    return this.operator(operator.operatorId);
  }

  async updateOperator(operatorId: string, dto: UpdateOperatorDto) {
    const before = await this.prisma.operator.findUnique({ where: { operatorId } });
    if (!before) throw new NotFoundException(`Operator ${operatorId} not found`);
    const user = dto.user || 'SYSTEM';
    const { user: _user, channels, ...rest } = dto;
    const operator = await this.prisma.operator.update({ where: { operatorId }, data: rest });
    if (channels !== undefined) await this.contactChannels.replace({ operatorId }, channels);
    await this.audit.logDiff(user, 'Operator', operatorId, before as unknown as Record<string, unknown>, operator as unknown as Record<string, unknown>);
    return this.operator(operatorId);
  }

  async deleteOperator(operatorId: string, user = 'SYSTEM') {
    const existing = await this.prisma.operator.findUnique({ where: { operatorId } });
    if (!existing) throw new NotFoundException(`Operator ${operatorId} not found`);
    try {
      await this.prisma.operator.delete({ where: { operatorId } });
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && (e as Prisma.PrismaClientKnownRequestError).code === 'P2003') {
        throw new BadRequestException('Cannot delete an operator with aircraft assigned to it.');
      }
      throw e;
    }
    await this.audit.log(user, 'Operator', operatorId, 'Deleted', operatorId, '');
    return { operatorId, deleted: true };
  }

  providers() {
    return this.prisma.provider.findMany({ orderBy: { name: 'asc' }, include: CONTACT_CHANNELS_INCLUDE });
  }

  // VEN-000041 style, atomically incremented -- mirrors ClientsService.nextClientId()
  // and TripsService.nextTripId(). Reuses trip_id_counters under a distinct
  // 'VEN' prefix key, so no schema migration is needed for this counter.
  async nextProviderId(): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO trip_id_counters (prefix, count)
      VALUES ('VEN', 1)
      ON CONFLICT (prefix) DO UPDATE SET count = trip_id_counters.count + 1
      RETURNING count
    `;
    return `VEN-${String(rows[0].count).padStart(6, '0')}`;
  }

  async createProvider(dto: CreateProviderDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, channels, ...rest } = dto;
    const providerId = await this.nextProviderId();
    const provider = await this.prisma.provider.create({ data: { ...rest, providerId } });
    await this.contactChannels.replace({ providerId: provider.providerId }, channels ?? []);
    await this.audit.log(user, 'Provider', provider.providerId, 'Created', '', provider.providerId);
    return this.prisma.provider.findUnique({ where: { providerId: provider.providerId }, include: CONTACT_CHANNELS_INCLUDE });
  }

  async updateProvider(providerId: string, dto: UpdateProviderDto) {
    const before = await this.prisma.provider.findUnique({ where: { providerId } });
    if (!before) throw new NotFoundException(`Provider ${providerId} not found`);
    const user = dto.user || 'SYSTEM';
    const { user: _user, channels, ...rest } = dto;
    const provider = await this.prisma.provider.update({ where: { providerId }, data: rest });
    if (channels !== undefined) await this.contactChannels.replace({ providerId }, channels);
    await this.audit.logDiff(user, 'Provider', providerId, before as unknown as Record<string, unknown>, provider as unknown as Record<string, unknown>);
    return this.prisma.provider.findUnique({ where: { providerId }, include: CONTACT_CHANNELS_INCLUDE });
  }

  async deleteProvider(providerId: string, user = 'SYSTEM') {
    const existing = await this.prisma.provider.findUnique({ where: { providerId } });
    if (!existing) throw new NotFoundException(`Provider ${providerId} not found`);
    await this.prisma.provider.delete({ where: { providerId } });
    await this.audit.log(user, 'Provider', providerId, 'Deleted', providerId, '');
    return { providerId, deleted: true };
  }

  countryRules() {
    return this.prisma.countryRule.findMany();
  }

  countryRule(countryIso2: string, serviceType: string) {
    return this.prisma.countryRule.findUnique({
      where: { countryIso2_serviceType: { countryIso2, serviceType } },
    });
  }

  async createCountryRule(dto: CreateCountryRuleDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    const rule = await this.prisma.countryRule.create({ data: rest });
    await this.audit.log(user, 'CountryRule', String(rule.id), 'Created', '', `${rule.countryIso2}/${rule.serviceType}`);
    return rule;
  }

  async updateCountryRule(id: number, dto: UpdateCountryRuleDto) {
    const before = await this.prisma.countryRule.findUnique({ where: { id } });
    if (!before) throw new NotFoundException(`Country rule ${id} not found`);
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    const rule = await this.prisma.countryRule.update({ where: { id }, data: rest });
    await this.audit.logDiff(user, 'CountryRule', String(id), before as unknown as Record<string, unknown>, rule as unknown as Record<string, unknown>);
    return rule;
  }

  async deleteCountryRule(id: number, user = 'SYSTEM') {
    const existing = await this.prisma.countryRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Country rule ${id} not found`);
    await this.prisma.countryRule.delete({ where: { id } });
    await this.audit.log(user, 'CountryRule', String(id), 'Deleted', `${existing.countryIso2}/${existing.serviceType}`, '');
    return { id, deleted: true };
  }

  countryFees() {
    return this.prisma.countryFee.findMany({ orderBy: [{ countryIso2: 'asc' }, { feeType: 'asc' }] });
  }

  countryFeesForCountry(countryIso2: string) {
    return this.prisma.countryFee.findMany({ where: { countryIso2 }, orderBy: { feeType: 'asc' } });
  }

  countryFee(id: number) {
    return this.prisma.countryFee.findUnique({ where: { id } });
  }

  async createCountryFee(dto: CreateCountryFeeDto) {
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    const fee = await this.prisma.countryFee.create({ data: rest });
    await this.audit.log(user, 'CountryFee', String(fee.id), 'Created', '', `${fee.countryIso2}/${fee.feeType}`);
    return fee;
  }

  async updateCountryFee(id: number, dto: UpdateCountryFeeDto) {
    const before = await this.prisma.countryFee.findUnique({ where: { id } });
    if (!before) throw new NotFoundException(`Country fee ${id} not found`);
    const user = dto.user || 'SYSTEM';
    const { user: _user, ...rest } = dto;
    const fee = await this.prisma.countryFee.update({ where: { id }, data: rest });
    await this.audit.logDiff(user, 'CountryFee', String(id), before as unknown as Record<string, unknown>, fee as unknown as Record<string, unknown>);
    return fee;
  }

  async deleteCountryFee(id: number, user = 'SYSTEM') {
    const existing = await this.prisma.countryFee.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Country fee ${id} not found`);
    await this.prisma.countryFee.delete({ where: { id } });
    await this.audit.log(user, 'CountryFee', String(id), 'Deleted', `${existing.countryIso2}/${existing.feeType}`, '');
    return { id, deleted: true };
  }

  icaoRules() {
    return this.prisma.iCAORule.findMany();
  }

  icaoRule(icao: string) {
    return this.prisma.iCAORule.findUnique({ where: { icao } });
  }

  docTemplates() {
    return this.prisma.docTemplate.findMany();
  }

  priceList() {
    return this.prisma.priceItem.findMany();
  }

  // Resolved MTOW/Manufacturer/NoiseCert for a fleet tail — instance override
  // falls back to the type-level default (mirrors the frontend's resolveAircraftInstance).
  async resolveAircraft(registration: string) {
    const inst = await this.aircraftByRegistration(registration);
    if (!inst) return null;
    return {
      registration: inst.registration,
      icaoType: inst.icaoType,
      manufacturer: inst.manufacturerOverride || inst.type.manufacturer,
      mtowKg: inst.mtowOverrideKg || inst.type.mtowKg,
      noiseCert: inst.noiseCertOverride || inst.type.noiseCert,
    };
  }
}
