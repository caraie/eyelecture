export interface AppConfig {
  nodeEnv: string;
  port: number;
  corsOrigins: string[];
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    name: string;
    ssl: boolean;
    /** Only ever true for throwaway local databases. Migrations are the real path. */
    synchronize: boolean;
    logging: boolean;
  };
  jwt: {
    accessSecret: string;
    accessTtl: string;
    refreshSecret: string;
    refreshTtl: string;
  };
  app: {
    /** Public URL of the Angular app, used to build links inside emails. */
    frontendUrl: string;
    emailVerificationTtlHours: number;
  };
  mail: {
    /**
     * Off by default. With this false the app keeps its old behaviour — the link
     * goes to the log — so a misconfigured deploy degrades to "no mail" rather
     * than to "mail to the wrong people".
     */
    enabled: boolean;
    /** What recipients see in the From header, e.g. "EyeLecture <no-reply@…>". */
    from: string;
    /**
     * The Workspace mailbox the service account acts as. Gmail sends *as a user*,
     * not as an application, so there has to be a real one — and it must be the
     * same address the domain-wide delegation was granted for.
     */
    impersonate: string;
    /**
     * Domains mail is allowed to reach. Empty means no restriction, which is the
     * current setting. Fill it in and everything else is dropped before it is sent
     * and written to the log instead — the way to guarantee a test build cannot
     * reach a real institution's inbox.
     */
    allowedDomains: string[];
  };
}

const toBool = (value: string | undefined, fallback = false): boolean =>
  value === undefined
    ? fallback
    : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const configuration = (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: toInt(process.env.PORT, 3000),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: toInt(process.env.DB_PORT, 5432),
    username: process.env.DB_USERNAME ?? 'eyelecture',
    password: process.env.DB_PASSWORD ?? 'eyelecture',
    name: process.env.DB_NAME ?? 'eyelecture',
    ssl: toBool(process.env.DB_SSL, false),
    synchronize: toBool(process.env.DB_SYNCHRONIZE, false),
    logging: toBool(process.env.DB_LOGGING, false),
  },
  jwt: {
    accessSecret:
      process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
  },
  app: {
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:4200',
    emailVerificationTtlHours: toInt(
      process.env.EMAIL_VERIFICATION_TTL_HOURS,
      48,
    ),
  },
  mail: {
    enabled: toBool(process.env.MAIL_ENABLED, false),
    from: process.env.MAIL_FROM ?? 'EyeLecture <no-reply@example.com>',
    impersonate: process.env.MAIL_IMPERSONATE ?? '',
    allowedDomains: (process.env.MAIL_ALLOWED_DOMAINS ?? '')
      .split(',')
      .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean),
  },
});
