import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

describe('CreateUserDto', () => {
  it('trims user_code when provided', async () => {
    const dto = plainToInstance(CreateUserDto, {
      name: 'Nguyen Van A',
      email: 'student@example.com',
      password: '123456',
      organization_id: 1,
      user_code: '  SV001  ',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect((dto as unknown as { user_code: string }).user_code).toBe('SV001');
  });

  it('rejects user_code longer than 100 characters', async () => {
    const dto = plainToInstance(CreateUserDto, {
      name: 'Nguyen Van A',
      email: 'student@example.com',
      password: '123456',
      organization_id: 1,
      user_code: 'A'.repeat(101),
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'user_code')).toBe(true);
  });
});
