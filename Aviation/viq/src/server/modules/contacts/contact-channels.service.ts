import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ContactChannelDto } from './dto/contact-channel.dto';

export interface ContactChannelOwner {
  providerId?: string;
  operatorId?: string;
  clientId?: string;
  personId?: string;
}

const OWNER_KEYS = ['providerId', 'operatorId', 'clientId', 'personId'] as const;

// Reusable Prisma `include` fragment so every entity's list/get query
// returns channels in a stable, display-ready order.
export const CONTACT_CHANNELS_INCLUDE = {
  channels: { orderBy: { sortOrder: 'asc' as const } },
};

@Injectable()
export class ContactChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  // Whole-list replace: delete every existing row for this owner, then
  // insert the new set in the order given (array index becomes sortOrder).
  // No separate CRUD routes — every entity's create/update passes its
  // full `channels` array here after the entity row itself is written.
  async replace(owner: ContactChannelOwner, channels: ContactChannelDto[] = []) {
    const setKeys = OWNER_KEYS.filter((k) => owner[k]);
    if (setKeys.length !== 1) {
      throw new BadRequestException('Exactly one owner (providerId, operatorId, clientId, or personId) must be set.');
    }
    await this.prisma.$transaction([
      this.prisma.contactChannel.deleteMany({ where: owner }),
      ...channels.map((c, i) =>
        this.prisma.contactChannel.create({
          data: {
            ...owner,
            channelType: c.channelType,
            value: c.value,
            label: c.label,
            preferred: c.preferred ?? false,
            forBilling: c.forBilling ?? false,
            sortOrder: i,
          },
        }),
      ),
    ]);
  }
}
