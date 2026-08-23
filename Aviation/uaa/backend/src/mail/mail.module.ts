import { Module, forwardRef } from '@nestjs/common';
import { MailService } from './mail.service';
import { ImapService } from './imap.service';
import { PermitsModule } from '../permits/permits.module';

@Module({
  imports: [forwardRef(() => PermitsModule)],
  providers: [MailService, ImapService],
  exports: [MailService, ImapService],
})
export class MailModule {}
