import { z } from 'zod';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('8765').transform(Number),
  LOGIN_PASSWORD: z.string().min(1, 'LOGIN_PASSWORD is required for security'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  PROJECTS_ROOT: z.string().min(1, 'PROJECTS_ROOT is required'),
  DEFAULT_PROJECT: z.string().min(1, 'DEFAULT_PROJECT is required'),
  PROJECT_ALLOWLIST: z.string().transform((val) => {
    try {
      const parsed = JSON.parse(val);
      if (!Array.isArray(parsed)) {
        throw new Error('PROJECT_ALLOWLIST must be a JSON array');
      }
      // Normalize Windows paths
      return parsed.map((p: string) => path.resolve(p));
    } catch (error) {
      throw new Error(`Invalid PROJECT_ALLOWLIST: ${error}`);
    }
  }),
  READ_ONLY: z.string().default('false').transform(val => val.toLowerCase() === 'true'),
  CURSOR_CMD: z.string().default('cursor'),
  CURSOR_API_KEY: z.string().optional(),
  DEFAULT_MODEL: z.string().default('claude-4.5-sonnet'),
  AVAILABLE_MODELS: z.string().default('["claude-4.5-sonnet","claude-4-sonnet","gpt-5-codex","gpt-5","claude-4.5-haiku","gemini-2.5-pro","gemini-2.5-flash"]').transform((val) => {
    try {
      const parsed = JSON.parse(val);
      if (!Array.isArray(parsed)) {
        throw new Error('AVAILABLE_MODELS must be a JSON array');
      }
      return parsed;
    } catch (error) {
      throw new Error(`Invalid AVAILABLE_MODELS: ${error}`);
    }
  }),
  MAX_RUN_SECONDS: z.string().default('900').transform(Number),
  PROJECT_START_TIMEOUT: z.string().default('60').transform(Number),
  CORS_ORIGINS: z.string().default('*'),
  GIT_ENABLE: z.string().default('true').transform(val => val.toLowerCase() === 'true'),
  ALLOWED_EXEC: z.string().default('[]').transform((val) => {
    try {
      const parsed = JSON.parse(val);
      if (!Array.isArray(parsed)) {
        throw new Error('ALLOWED_EXEC must be a JSON array');
      }
      return parsed;
    } catch (error) {
      throw new Error(`Invalid ALLOWED_EXEC: ${error}`);
    }
  }),
  AUTO_START_ENABLED: z.string().default('true').transform(val => val.toLowerCase() === 'true'),
  PORT_RANGE_START: z.string().default('3000').transform(Number),
  PORT_RANGE_END: z.string().default('3100').transform(Number),
  // Direct Cursor connection (via extension)
  DIRECT_CURSOR: z.string().default('false').transform(val => val.toLowerCase() === 'true'),
  DIRECT_CURSOR_HOST: z.string().default('127.0.0.1'),
  DIRECT_CURSOR_PORT: z.string().default('8766').transform(Number),
  DIRECT_CURSOR_API_KEY: z.string().default('changeme'),
  
  // Disable external API fallback (Claude/GPT/Gemini) - use Cursor directly only
  DISABLE_EXTERNAL_API: z.string().default('true').transform(val => val.toLowerCase() === 'true'),
  
  // Remote Chat (UIA) - Windows UI Automation
  UIA_HOST: z.string().url('UIA_HOST must be a valid URL').default('http://127.0.0.1:8788'),
  UIA_READ_ENABLED: z.string().default('true').transform(val => val.toLowerCase() === 'true'),
  TRANSCRIPT_MODE: z.enum(['hybrid', 'uia', 'server']).default('hybrid'),
  TRANSCRIPT_MAX_ITEMS: z.string().default('200').transform(Number).refine(val => val > 0 && val <= 1000, 'TRANSCRIPT_MAX_ITEMS must be between 1 and 1000'),
  
  // Typing Behavior
  CHAT_TYPING_MODE: z.enum(['pophide', 'cli']).default('pophide'),
  POP_HIDE_SPEED_MS: z.string().default('200').transform(Number).refine(val => val >= 100 && val <= 400, 'POP_HIDE_SPEED_MS must be between 100 and 400'),
  PASTE_STRATEGY: z.enum(['clipboard-first', 'valuepattern-first', 'sendkeys-only']).default('clipboard-first'),
  ENTER_KEY: z.string().default('Enter'),
  
  // Security / Limits
  RCHAT_RATE_LIMIT_PER_MIN: z.string().default('30').transform(Number).refine(val => val > 0 && val <= 120, 'RCHAT_RATE_LIMIT_PER_MIN must be between 1 and 120'),
  RCHAT_MAX_TEXT_LEN: z.string().default('4000').transform(Number).refine(val => val > 0 && val <= 10000, 'RCHAT_MAX_TEXT_LEN must be between 1 and 10000'),
});

export type Config = z.infer<typeof envSchema>;

let config: Config;

try {
  config = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Environment validation failed:');
    error.errors.forEach(err => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
  } else {
    console.error('❌ Environment configuration error:', error);
  }
  process.exit(1);
}

export { config };

