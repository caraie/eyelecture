import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import AppDataSource from './data-source';
import { User } from '../modules/users/entities/user.entity';
import { Institution } from '../modules/institutions/entities/institution.entity';
import { InstitutionDomain } from '../modules/institutions/entities/institution-domain.entity';
import { UserRole } from '../modules/users/enums/user-role.enum';
import { UserStatus } from '../modules/users/enums/user-status.enum';
import {
  ValidationMethod,
  ValidationStatus,
} from '../modules/users/enums/validation-status.enum';

/**
 * Idempotent development seed. Run with `npm run seed`.
 * Creates the first admin plus a demo institution so the validation flow can be
 * exercised without clicking through the API by hand.
 */
async function seed(): Promise<void> {
  const dataSource = await AppDataSource.initialize();

  const institutions = dataSource.getRepository(Institution);
  const domains = dataSource.getRepository(InstitutionDomain);
  const users = dataSource.getRepository(User);

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@eyelecture.app';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

  let admin = await users.findOne({ where: { email: adminEmail } });
  if (!admin) {
    admin = await users.save(
      users.create({
        email: adminEmail,
        emailDomain: adminEmail.split('@')[1],
        passwordHash: await bcrypt.hash(adminPassword, 12),
        firstName: 'Platform',
        lastName: 'Admin',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        validationStatus: ValidationStatus.VALIDATED,
        validationMethod: ValidationMethod.MANUAL,
        validatedAt: new Date(),
      }),
    );
    console.log(`Created admin ${adminEmail} with password "${adminPassword}"`);
  } else {
    console.log(`Admin ${adminEmail} already exists, skipping`);
  }

  let demo = await institutions.findOne({ where: { slug: 'stanford-medicine' } });
  if (!demo) {
    demo = await institutions.save(
      institutions.create({
        name: 'Stanford University School of Medicine',
        slug: 'stanford-medicine',
        description: 'Demo institution created by the seed script.',
        isActive: true,
      }),
    );
    await domains.save([
      domains.create({ domain: 'stanford.edu', institutionId: demo.id }),
      domains.create({ domain: 'med.stanford.edu', institutionId: demo.id }),
    ]);
    console.log('Created demo institution with @stanford.edu and @med.stanford.edu');
  } else {
    console.log('Demo institution already exists, skipping');
  }

  await dataSource.destroy();
  console.log('Seed finished.');
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
