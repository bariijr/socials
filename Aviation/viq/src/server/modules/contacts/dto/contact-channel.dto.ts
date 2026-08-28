import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const CHANNEL_TYPES = ['Email', 'Phone', 'SMS', 'WhatsApp'] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export class ContactChannelDto {
  @IsIn(CHANNEL_TYPES)
  channelType!: ChannelType;

  @IsString()
  @MaxLength(200)
  value!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsBoolean()
  preferred?: boolean;

  @IsOptional()
  @IsBoolean()
  forBilling?: boolean;
}

export { CHANNEL_TYPES };
