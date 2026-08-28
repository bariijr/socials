import { Global, Module } from '@nestjs/common';
import { ContactChannelsService } from './contact-channels.service';

// @Global(): every entity module (Reference/Clients/Persons) injects
// ContactChannelsService without listing ContactsModule in its own
// `imports` — same convention this codebase already uses for
// PrismaModule/AuditModule (see src/server/prisma/prisma.module.ts).
@Global()
@Module({
  providers: [ContactChannelsService],
  exports: [ContactChannelsService],
})
export class ContactsModule {}
