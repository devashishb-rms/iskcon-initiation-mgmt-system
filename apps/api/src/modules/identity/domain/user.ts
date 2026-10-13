import type { Role } from '@iskcon/contracts';

/** A person who can sign in, with the roles they hold. */
export interface UserWithRoles {
  id: string;
  tenantId: string;
  name: string;
  email: string | null;
  phone: string | null;
  locale: string;
  active: boolean;
  totpSecretSealed: string | null;
  totpEnabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles: Role[];
}
