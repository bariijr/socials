import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { ThrottlingModule } from './modules/throttling/throttling.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { ReferenceModule } from './modules/reference/reference.module';
import { MessageTemplatesModule } from './modules/message-templates/message-templates.module';
import { TripsModule } from './modules/trips/trips.module';
import { LegsModule } from './modules/legs/legs.module';
import { StopsModule } from './modules/stops/stops.module';
import { ServicesModule } from './modules/services/services.module';
import { ServiceTypesModule } from './modules/service-types/service-types.module';
import { LegPurposesModule } from './modules/leg-purposes/leg-purposes.module';
import { PersonsModule } from './modules/persons/persons.module';
import { PersonRatingsModule } from './modules/person-ratings/person-ratings.module';
import { CommsModule } from './modules/comms/comms.module';
import { DocsModule } from './modules/docs/docs.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { UsersModule } from './modules/users/users.module';
import { ClientsModule } from './modules/clients/clients.module';
import { SettingsModule } from './modules/settings/settings.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, 'public'),
      exclude: ['/api*'],
    }),
    PrismaModule,
    ThrottlingModule,
    AuthModule,
    AuditModule,
    ContactsModule,
    ReferenceModule,
    MessageTemplatesModule,
    TripsModule,
    LegsModule,
    StopsModule,
    ServicesModule,
    ServiceTypesModule,
    LegPurposesModule,
    PersonsModule,
    PersonRatingsModule,
    UsersModule,
    ClientsModule,
    SettingsModule,
    CommsModule,
    DocsModule,
    InvoicesModule,
    QuotesModule,
    HealthModule,
  ],
})
export class AppModule {}
