import * as fs from 'fs/promises';
import * as path from 'path';
import fg from 'fast-glob';
import { logger } from './logger.js';

export interface FileInfo {
  path: string;
  size: number;
  mtime: Date;
  isDir: boolean;
}

const MAX_FILES = 1000;
const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const MAX_DEPTH = 3;

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.nuxt/**',
];

const BINARY_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.ico',
  '.pdf', '.zip', '.tar', '.gz', '.rar',
  '.mp4', '.avi', '.mov', '.mp3', '.wav',
]);

/**
 * Check if a file is likely binary based on extension
 */
function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * List files in a project directory
 */
export async function listFiles(
  projectPath: string,
  globPattern?: string
): Promise<FileInfo[]> {
  try {
    const pattern = globPattern || '**/*';
    const files = await fg(pattern, {
      cwd: projectPath,
      ignore: IGNORE_PATTERNS,
      deep: MAX_DEPTH,
      stats: true,
      onlyFiles: false,
    });
    
    const results: FileInfo[] = [];
    
    for (const file of files.slice(0, MAX_FILES)) {
      const stats = file.stats!;
      
      results.push({
        path: file.path,
        size: stats.size,
        mtime: stats.mtime,
        isDir: stats.isDirectory(),
      });
    }
    
    logger.debug({ projectPath, count: results.length }, 'Listed files');
    return results;
  } catch (error) {
    logger.error({ error, projectPath }, 'Failed to list files');
    throw new Error(`Failed to list files: ${error}`);
  }
}

/**
 * Read a file's content (text files only)
 */
export async function readFile(projectPath: string, filePath: string): Promise<string> {
  const fullPath = path.join(projectPath, filePath);
  const normalized = path.resolve(fullPath);
  const projectNormalized = path.resolve(projectPath);
  
  // Security check: prevent path traversal
  if (!normalized.startsWith(projectNormalized)) {
    throw new Error('Path traversal attempt detected');
  }
  
  // Check if binary
  if (isBinaryFile(fullPath)) {
    throw new Error('Binary files are not supported');
  }
  
  try {
    const stats = await fs.stat(fullPath);
    
    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(`File too large (max ${MAX_FILE_SIZE / 1024}KB)`);
    }
    
    const content = await fs.readFile(fullPath, 'utf-8');
    logger.debug({ filePath, size: stats.size }, 'Read file');
    
    return content;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error('File not found');
    }
    logger.error({ error, filePath }, 'Failed to read file');
    throw error;
  }
}

/**
 * Write a file's content atomically
 */
export async function writeFile(
  projectPath: string,
  filePath: string,
  content: string
): Promise<void> {
  const fullPath = path.join(projectPath, filePath);
  const normalized = path.resolve(fullPath);
  const projectNormalized = path.resolve(projectPath);
  
  // Security check: prevent path traversal
  if (!normalized.startsWith(projectNormalized)) {
    throw new Error('Path traversal attempt detected');
  }
  
  try {
    // Ensure parent directory exists
    const dirname = path.dirname(fullPath);
    await fs.mkdir(dirname, { recursive: true });
    
    // Write atomically using temp file
    const tempPath = `${fullPath}.tmp`;
    await fs.writeFile(tempPath, content, 'utf-8');
    await fs.rename(tempPath, fullPath);
    
    logger.info({ filePath, size: content.length }, 'Wrote file');
  } catch (error) {
    logger.error({ error, filePath }, 'Failed to write file');
    throw new Error(`Failed to write file: ${error}`);
  }
}

