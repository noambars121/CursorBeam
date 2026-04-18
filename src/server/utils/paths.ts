import * as path from 'path';
import { logger } from '../services/logger.js';

/**
 * Normalize Windows path - resolve and ensure consistent format
 */
export function normalizeWindowsPath(p: string): string {
  return path.resolve(p);
}

/**
 * Check if target path is within allowed roots (case-insensitive for Windows)
 */
export function isPathAllowed(targetPath: string, allowlist: string[]): boolean {
  const normalized = path.resolve(targetPath).toLowerCase();
  
  // Check for path traversal attempts
  if (normalized.includes('..')) {
    logger.warn({ targetPath, normalized }, 'Path traversal attempt detected');
    return false;
  }
  
  return allowlist.some(allowed => {
    const allowedNormalized = path.resolve(allowed).toLowerCase();
    return normalized.startsWith(allowedNormalized);
  });
}

/**
 * Validate and return project path, using default if not provided
 * Throws if path is not in allowlist
 */
export function validateProjectPath(
  projectPath: string | undefined,
  defaultProject: string,
  allowlist: string[]
): string {
  const cwd = projectPath || defaultProject;
  const resolved = path.resolve(cwd);
  
  if (!isPathAllowed(resolved, allowlist)) {
    throw new Error(
      `Project path "${resolved}" is not in the allowlist. Configure PROJECT_ALLOWLIST in .env`
    );
  }
  
  return resolved;
}

