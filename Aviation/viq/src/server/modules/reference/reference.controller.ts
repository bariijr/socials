import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { ReferenceService } from './reference.service';
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

@Controller('reference')
export class ReferenceController {
  constructor(private readonly ref: ReferenceService) {}

  @Get('countries')
  countries() {
    return this.ref.countries();
  }

  @Get('countries/:iso2')
  country(@Param('iso2') iso2: string) {
    return this.ref.country(iso2.toUpperCase());
  }

  @Roles('Admin')
  @Post('countries')
  createCountry(@Body() dto: CreateCountryDto) {
    return this.ref.createCountry({ ...dto, iso2: dto.iso2.toUpperCase() });
  }

  @Roles('Admin')
  @Patch('countries/:iso2')
  updateCountry(@Param('iso2') iso2: string, @Body() dto: UpdateCountryDto) {
    return this.ref.updateCountry(iso2.toUpperCase(), dto);
  }

  @Roles('Admin')
  @Delete('countries/:iso2')
  deleteCountry(@Param('iso2') iso2: string, @Query('user') user?: string) {
    return this.ref.deleteCountry(iso2.toUpperCase(), user);
  }

  @Get('airports')
  airports(@Query('page') page?: string, @Query('limit') limit?: string, @Query('search') search?: string) {
    if (page === undefined) {
      return this.ref.airports();
    }
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
    return this.ref.airportsPaginated(pageNum, limitNum, search);
  }

  @Get('airports/:icao')
  airport(@Param('icao') icao: string) {
    return this.ref.airport(icao.toUpperCase());
  }

  @Roles('Admin')
  @Post('airports')
  createAirport(@Body() dto: CreateAirportDto) {
    return this.ref.createAirport({ ...dto, icao: dto.icao.toUpperCase() });
  }

  @Roles('Admin')
  @Patch('airports/:icao')
  updateAirport(@Param('icao') icao: string, @Body() dto: UpdateAirportDto) {
    return this.ref.updateAirport(icao.toUpperCase(), dto);
  }

  @Roles('Admin')
  @Delete('airports/:icao')
  deleteAirport(@Param('icao') icao: string, @Query('user') user?: string) {
    return this.ref.deleteAirport(icao.toUpperCase(), user);
  }

  @Get('cities')
  cities() {
    return this.ref.cities();
  }

  @Get('aircraft-types')
  aircraftTypes() {
    return this.ref.aircraftTypes();
  }

  @Get('aircraft-types/:icaoType')
  aircraftType(@Param('icaoType') icaoType: string) {
    return this.ref.aircraftType(icaoType.toUpperCase());
  }

  @Get('aircraft')
  aircraft() {
    return this.ref.aircraft();
  }

  @Get('aircraft/:registration')
  aircraftByRegistration(@Param('registration') registration: string) {
    return this.ref.resolveAircraft(registration.toUpperCase());
  }

  @Roles('Admin')
  @Post('aircraft')
  createAircraft(@Body() dto: CreateAircraftDto) {
    return this.ref.createAircraft({ ...dto, registration: dto.registration.toUpperCase() });
  }

  @Roles('Admin')
  @Patch('aircraft/:registration')
  updateAircraft(@Param('registration') registration: string, @Body() dto: UpdateAircraftDto) {
    return this.ref.updateAircraft(registration.toUpperCase(), dto);
  }

  @Roles('Admin')
  @Delete('aircraft/:registration')
  deleteAircraft(@Param('registration') registration: string, @Query('user') user?: string) {
    return this.ref.deleteAircraft(registration.toUpperCase(), user);
  }

  @Get('operators')
  operators() {
    return this.ref.operators();
  }

  @Get('operators/:operatorId')
  operator(@Param('operatorId') operatorId: string) {
    return this.ref.operator(operatorId);
  }

  @Roles('Admin')
  @Post('operators')
  createOperator(@Body() dto: CreateOperatorDto) {
    return this.ref.createOperator(dto);
  }

  @Roles('Admin')
  @Patch('operators/:operatorId')
  updateOperator(@Param('operatorId') operatorId: string, @Body() dto: UpdateOperatorDto) {
    return this.ref.updateOperator(operatorId, dto);
  }

  @Roles('Admin')
  @Delete('operators/:operatorId')
  deleteOperator(@Param('operatorId') operatorId: string, @Query('user') user?: string) {
    return this.ref.deleteOperator(operatorId, user);
  }

  @Get('providers')
  providers() {
    return this.ref.providers();
  }

  @Roles('Admin')
  @Post('providers')
  createProvider(@Body() dto: CreateProviderDto) {
    return this.ref.createProvider(dto);
  }

  @Roles('Admin')
  @Patch('providers/:providerId')
  updateProvider(@Param('providerId') providerId: string, @Body() dto: UpdateProviderDto) {
    return this.ref.updateProvider(providerId, dto);
  }

  @Roles('Admin')
  @Delete('providers/:providerId')
  deleteProvider(@Param('providerId') providerId: string, @Query('user') user?: string) {
    return this.ref.deleteProvider(providerId, user);
  }

  @Get('country-rules')
  countryRules() {
    return this.ref.countryRules();
  }

  @Roles('Admin')
  @Post('country-rules')
  createCountryRule(@Body() dto: CreateCountryRuleDto) {
    return this.ref.createCountryRule(dto);
  }

  @Roles('Admin')
  @Patch('country-rules/:id')
  updateCountryRule(@Param('id') id: string, @Body() dto: UpdateCountryRuleDto) {
    return this.ref.updateCountryRule(Number(id), dto);
  }

  @Roles('Admin')
  @Delete('country-rules/:id')
  deleteCountryRule(@Param('id') id: string, @Query('user') user?: string) {
    return this.ref.deleteCountryRule(Number(id), user);
  }

  @Get('country-fees')
  countryFees() {
    return this.ref.countryFees();
  }

  @Get('country-fees/by-country/:countryIso2')
  countryFeesForCountry(@Param('countryIso2') countryIso2: string) {
    return this.ref.countryFeesForCountry(countryIso2);
  }

  @Roles('Admin')
  @Post('country-fees')
  createCountryFee(@Body() dto: CreateCountryFeeDto) {
    return this.ref.createCountryFee(dto);
  }

  @Roles('Admin')
  @Patch('country-fees/:id')
  updateCountryFee(@Param('id') id: string, @Body() dto: UpdateCountryFeeDto) {
    return this.ref.updateCountryFee(Number(id), dto);
  }

  @Roles('Admin')
  @Delete('country-fees/:id')
  deleteCountryFee(@Param('id') id: string, @Query('user') user?: string) {
    return this.ref.deleteCountryFee(Number(id), user);
  }

  @Get('icao-rules')
  icaoRules() {
    return this.ref.icaoRules();
  }

  @Get('icao-rules/:icao')
  icaoRule(@Param('icao') icao: string) {
    return this.ref.icaoRule(icao.toUpperCase());
  }

  @Get('doc-templates')
  docTemplates() {
    return this.ref.docTemplates();
  }

  @Get('price-list')
  priceList() {
    return this.ref.priceList();
  }
}
