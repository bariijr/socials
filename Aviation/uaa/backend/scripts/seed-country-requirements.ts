import 'reflect-metadata';
import { AppDataSource } from '../src/database/data-source';
import { CountryRequirement } from '../src/country-requirements/country-requirement.entity';
import { FormTemplate } from '../src/form-templates/form-template.entity';
import type { ServiceType } from '../src/service-cases/requirement.entity';

// Lead times/working-days-only for TZ/KE/EG/ZA/AE/SA sourced directly from
// actuator/frontend/js/lib/mock-data/countryRules.js (the design spec names this as the
// reused, already-validated source). The remaining countries — the rest of what's actually
// present in the real seeded MAYFLY legs — don't have an actuator entry; their values below
// are reasonable regional defaults (72h, working-days-only for countries with slower permit
// bureaucracies; 24-48h non-working-days-only for faster ones) and should be confirmed with
// a coordinator before this is relied on for a real deadline, not treated as authoritative.
//
// Sub-project B2: each country now needs one row per ServiceType. Real per-type values
// (Overflight vs. Landing may genuinely differ) are a coordinator follow-up — for now both
// types get the same starting values per country, same as every value below already was a
// placeholder before B2.
const BASE_COUNTRY_REQUIREMENTS: Array<Omit<CountryRequirement, 'id' | 'createdAt' | 'updatedAt' | 'serviceType'>> = [
  { country: 'Tanzania', leadTimeHours: 48, workingDaysOnly: false, toleranceHours: 3, requiredDocs: ['AOC', 'Insurance'], submissionEmail: 'permits.tz@example.com' },
  { country: 'Kenya', leadTimeHours: 24, workingDaysOnly: false, toleranceHours: 2, requiredDocs: ['GenDec'], submissionEmail: 'permits.ke@example.com' },
  { country: 'Egypt', leadTimeHours: 96, workingDaysOnly: true, toleranceHours: 6, requiredDocs: ['AOC', 'Insurance', 'Crew List'], submissionEmail: 'permits.eg@example.com' },
  { country: 'South Africa', leadTimeHours: 24, workingDaysOnly: false, toleranceHours: 2, requiredDocs: [], submissionEmail: 'permits.za@example.com' },
  { country: 'UAE', leadTimeHours: 12, workingDaysOnly: false, toleranceHours: 1, requiredDocs: [], submissionEmail: 'permits.ae@example.com' },
  { country: 'Saudi Arabia', leadTimeHours: 72, workingDaysOnly: true, toleranceHours: 2, requiredDocs: ['AOC', 'Insurance', 'Overflight Clearance'], submissionEmail: 'permits.sa@example.com' },
  { country: 'Qatar', leadTimeHours: 48, workingDaysOnly: true, toleranceHours: 3, requiredDocs: ['AOC', 'Insurance'], submissionEmail: 'permits.qa@example.com' },
  { country: 'Kuwait', leadTimeHours: 48, workingDaysOnly: true, toleranceHours: 3, requiredDocs: ['AOC', 'Insurance'], submissionEmail: 'permits.kw@example.com' },
  { country: 'India', leadTimeHours: 72, workingDaysOnly: true, toleranceHours: 4, requiredDocs: ['AOC', 'Insurance', 'GenDec'], submissionEmail: 'permits.in@example.com' },
  { country: 'Morocco', leadTimeHours: 48, workingDaysOnly: false, toleranceHours: 3, requiredDocs: ['AOC'], submissionEmail: 'permits.ma@example.com' },
  { country: 'Nigeria', leadTimeHours: 72, workingDaysOnly: true, toleranceHours: 4, requiredDocs: ['AOC', 'Insurance'], submissionEmail: 'permits.ng@example.com' },
  { country: 'Zambia', leadTimeHours: 48, workingDaysOnly: false, toleranceHours: 3, requiredDocs: ['AOC'], submissionEmail: 'permits.zm@example.com' },
  { country: 'Botswana', leadTimeHours: 48, workingDaysOnly: false, toleranceHours: 3, requiredDocs: ['AOC'], submissionEmail: 'permits.bw@example.com' },
  { country: 'Algeria', leadTimeHours: 72, workingDaysOnly: true, toleranceHours: 4, requiredDocs: ['AOC', 'Insurance'], submissionEmail: 'permits.dz@example.com' },
  { country: 'Israel', leadTimeHours: 72, workingDaysOnly: true, toleranceHours: 4, requiredDocs: ['AOC', 'Insurance', 'Crew List'], submissionEmail: 'permits.il@example.com' },
];

const SERVICE_TYPES: ServiceType[] = ['OVERFLIGHT', 'LANDING'];

async function main() {
  await AppDataSource.initialize();

  const countryRequirementRepo = AppDataSource.getRepository(CountryRequirement);
  const formTemplateRepo = AppDataSource.getRepository(FormTemplate);

  let crCreated = 0;
  let ftCreated = 0;

  for (const base of BASE_COUNTRY_REQUIREMENTS) {
    for (const serviceType of SERVICE_TYPES) {
      const exists = await countryRequirementRepo.findOne({ where: { country: base.country, serviceType } });
      if (!exists) {
        await countryRequirementRepo.save(countryRequirementRepo.create({ ...base, serviceType }));
        crCreated++;
      }

      const templateExists = await formTemplateRepo.findOne({ where: { country: base.country, serviceType } });
      if (!templateExists) {
        await formTemplateRepo.save(
          formTemplateRepo.create({
            country: base.country,
            serviceType,
            name: `${base.country} ${serviceType === 'OVERFLIGHT' ? 'Overflight' : 'Landing'} Permit Request`,
            bodyTemplate:
              'Requesting a landing/overflight permit for trip #1, aircraft #2 (#3), ' +
              'arriving #4. Captain: #5 (#6). Please confirm clearance number and validity window.',
            mergeFields: ['tripNo', 'tail', 'acType', 'icao', 'captName', 'captEmail'],
          }),
        );
        ftCreated++;
      }
    }
  }

  console.log(`Seeded ${crCreated} CountryRequirement(s), ${ftCreated} FormTemplate(s).`);
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
