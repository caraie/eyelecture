import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { configuration } from '../config/configuration';

loadEnv();

const config = configuration();

/**
 * Standalone DataSource used by the TypeORM CLI (`npm run migration:*`).
 * The running application builds its own connection in AppModule — both read the
 * same configuration function so they can never drift apart.
 */
const AppDataSource = new DataSource({
  type: 'postgres',
  host: config.database.host,
  port: config.database.port,
  username: config.database.username,
  password: config.database.password,
  database: config.database.name,
  ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
  entities: [__dirname + '/../modules/**/entities/*.entity.{ts,js}'],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
  logging: config.database.logging,
});

export default AppDataSource;
