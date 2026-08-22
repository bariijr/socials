import { IsBoolean, IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateLegDto {
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() refNo?: string;
  @IsOptional() @IsString() clientName?: string;
  @IsOptional() @IsString() operatorName?: string;
  @IsOptional() @IsString() clientNo?: string;
  @IsOptional() @IsString() agentName?: string;
  @IsOptional() @IsString() agentContacts?: string;

  @IsString()
  tripNo: string;

  @IsOptional() @IsString() tail?: string;

  @IsString()
  icao: string;

  @IsOptional() @IsDateString() arrDate?: string;
  @IsOptional() @IsDateString() depDate?: string;
  @IsOptional() @IsString() arrFrom?: string;
  @IsOptional() @IsString() depToIcao?: string;
  @IsOptional() @IsString() activityType?: string;
  @IsOptional() @IsString() captName?: string;
  @IsOptional() @IsString() captEmail?: string;
  @IsOptional() @IsString() acType?: string;
  @IsOptional() @IsInt() mtowLb?: number;
  @IsOptional() @IsString() pgh?: string;
  @IsOptional() @IsString() tssTeam?: string;
  @IsOptional() @IsBoolean() serviceReportSent?: boolean;
  @IsOptional() @IsBoolean() returnedInTime?: boolean;
}
