import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateStopDto } from './create-stop.dto';

// afterLegId is deliberately excluded here (in addition to stopId/tripId):
// it links a Stop to the specific leg-transition that produced it, and is
// only ever meant to be set internally by ensureConnectingStops
// (legs.service.ts) or scripts/backfill-stop-after-leg-id.ts. Leaving it
// on the public update DTO would let a PATCH /stops/:id caller rewrite
// which leg a Stop is linked to with no validation that the leg even
// belongs to the same trip.
export class UpdateStopDto extends PartialType(OmitType(CreateStopDto, ['stopId', 'tripId', 'afterLegId'] as const)) {}
