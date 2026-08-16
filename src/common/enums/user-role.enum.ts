export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  SCHOOL_ADMIN = 'school_admin',
  ISSUER = 'issuer',
  STUDENT = 'student',
  VERIFIER = 'verifier',
}

export const USER_ROLES: ReadonlyArray<UserRole> = Object.values(UserRole);

export const DEFAULT_USER_ROLE: UserRole = UserRole.STUDENT;
