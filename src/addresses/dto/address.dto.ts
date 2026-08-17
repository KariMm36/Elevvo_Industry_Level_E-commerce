import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAddressDto {
  @ApiProperty({ example: '123 Main St' })
  @IsString()
  street: string;

  @ApiProperty({ example: 'Cairo' })
  @IsString()
  city: string;

  @ApiProperty({ example: 'Cairo Governorate' })
  @IsString()
  state: string;

  @ApiProperty({ example: 'Egypt' })
  @IsString()
  country: string;

  @ApiProperty({ example: '11511' })
  @IsString()
  postalCode: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
