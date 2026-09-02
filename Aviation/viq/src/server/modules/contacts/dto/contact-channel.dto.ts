import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf, IsEmail } from 'class-validator';

const CHANNEL_TYPES = ['Email', 'Phone', 'SMS', 'WhatsApp'] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export class ContactChannelDto {
  @IsIn(CHANNEL_TYPES)
  channelType!: ChannelType;

  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  @ValidateIf((o) => o.channelType === 'Email')
  @IsEmail()
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
