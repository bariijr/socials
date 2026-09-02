import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { Public } from '../auth/public.decorator';

@Controller('quotes')
@UseGuards(ThrottlerGuard)
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Public()
  @Post()
  submit(@Body() dto: CreateQuoteDto) {
    return this.quotes.submit(dto);
  }
}
