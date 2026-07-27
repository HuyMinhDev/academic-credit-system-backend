import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateLocationDto {
  @ApiProperty({ example: 'Nha Trang Beach', description: 'Location name' })
  @IsString()
  @IsNotEmpty()
  location_name: string;

  @ApiProperty({ example: 'Khánh Hòa', description: 'Province name' })
  @IsString()
  @IsOptional()
  province?: string;

  @ApiProperty({ example: 'Vietnam', description: 'Country name' })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({
    example: 'https://cdn.myapp.com/uploads/locations/nha-trang.jpg',
    description: 'Image URL of the location',
  })
  @IsString()
  @IsOptional()
  image?: string;
}
