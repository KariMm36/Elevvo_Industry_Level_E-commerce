import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReturnRequestDto {
  @ApiProperty({ example: 'Item arrived damaged' })
  @IsString()
  @MinLength(10)
  reason: string;
}

export class ResolveReturnRequestDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'], example: 'APPROVED' })
  @IsString()
  action: 'APPROVED' | 'REJECTED';
}
