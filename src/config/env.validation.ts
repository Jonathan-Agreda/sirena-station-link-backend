import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:5173'),

  // Placeholders para fases siguientes:
  DATABASE_URL: z.string().optional(),

  KEYCLOAK_BASE_URL: z.string().optional(),
  KEYCLOAK_REALM: z.string().default('alarma'),
  KEYCLOAK_CLIENT_ID: z.string().optional(),
  KEYCLOAK_CLIENT_SECRET: z.string().optional(),

  EMQX_HOST: z.string().optional(),
  EMQX_PORT: z.coerce.number().optional(),
  EMQX_USERNAME: z.string().optional(),
  EMQX_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = EnvSchema.safeParse(config);
  if (!parsed.success) {
    const formatted = parsed.error.flatten().fieldErrors;
    throw new Error(
      '❌ Invalid environment variables:\n' +
        JSON.stringify(formatted, null, 2),
    );
  }
  return parsed.data;
}
