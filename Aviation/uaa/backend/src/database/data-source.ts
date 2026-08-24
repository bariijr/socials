import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Leg } from '../legs/leg.entity';
import { CountryRequirement } from '../country-requirements/country-requirement.entity';
import { FormTemplate } from '../form-templates/form-template.entity';
import { Comm } from '../permits/comm.entity';
import { Team } from '../notifications/team.entity';
import { Trip } from '../trips/trip.entity';
import { Requirement } from '../service-cases/requirement.entity';
import { RequirementLeg } from '../service-cases/requirement-leg.entity';
import { ServiceCase } from '../service-cases/service-case.entity';
import { ServiceOrder } from '../service-cases/service-order.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User, Leg, CountryRequirement, FormTemplate, Comm, Team, Trip, Requirement, RequirementLeg, ServiceCase, ServiceOrder],
  migrations: ['migrations/*.ts'],
  synchronize: false,
});
