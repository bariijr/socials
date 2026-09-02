import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, Validate, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments, isEmail } from 'class-validator';

const CHANNEL_TYPES = ['Email', 'Phone', 'SMS', 'WhatsApp'] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

@ValidatorConstraint({ name: 'isEmailWhenEmailChannel', async: false })
class IsEmailWhenEmailChannel implements ValidatorConstraintInterface {
  validate(value: string, args: ValidationArguments) {
    const obj = args.object as ContactChannelDto;
    if (obj.channelType !== 'Email') return true;
    return isEmail(value);
  }
  defaultMessage() {
    return 'value must be a valid email address when channelType is Email';
  }
}

export class ContactChannelDto {
  @IsIn(CHANNEL_TYPES)
  channelType!: ChannelType;

  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  @Validate(IsEmailWhenEmailChannel)
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
