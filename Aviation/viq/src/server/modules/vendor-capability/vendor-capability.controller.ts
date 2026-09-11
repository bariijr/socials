import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { VendorCapabilityService } from './vendor-capability.service';
import { CreateVendorCapabilityRequestDto } from './dto/create-vendor-capability-request.dto';
import { SubmitVendorCapabilityResponseDto } from './dto/submit-vendor-capability-response.dto';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';

@Controller('vendor-capability')
export class VendorCapabilityController {
  constructor(private readonly capability: VendorCapabilityService) {}

  @Roles('Admin')
  @Post()
  create(@Body() dto: CreateVendorCapabilityRequestDto) {
    return this.capability.create(dto);
  }

  @Roles('Admin')
  @Get()
  findAll(@Query('providerId') providerId?: string, @Query('status') status?: string) {
    return this.capability.findAll({ providerId, status });
  }

  @Roles('Admin')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.capability.findOne(id);
  }

  // Public + throttled, exactly like QuotesController.submit -- a vendor
  // has no VIQ login, the token IS the credential.
  @Public()
  @UseGuards(ThrottlerGuard)
  @Get('token/:token')
  findByToken(@Param('token') token: string) {
    return this.capability.findByToken(token);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('token/:token/submit')
  submit(@Param('token') token: string, @Body() dto: SubmitVendorCapabilityResponseDto) {
    return this.capability.submit(token, dto);
  }
}
