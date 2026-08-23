import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Leg } from '../legs/leg.entity';
import { CountryRequirement } from '../country-requirements/country-requirement.entity';
import { FormTemplate } from '../form-templates/form-template.entity';
import { PermitRequest } from '../permits/permit-request.entity';
import { Comm } from '../permits/comm.entity';
import { Team } from '../notifications/team.entity';
import { Trip } from '../trips/trip.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User, Leg, CountryRequirement, FormTemplate, PermitRequest, Comm, Team, Trip],
  migrations: ['migrations/*.ts'],
  synchronize: false,
});
