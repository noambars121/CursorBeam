import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { spawn } from 'child_process';
import { config } from '../env.js';
import { validateProjectPath } from '../utils/paths.js';
import { requireWriteAccess } from '../security.js';
import { gitDiff } from '../services/diff.js';
import { logger } from '../services/logger.js';

const router = Router();

const commitSchema = z.object({
  projectPath: z.string(),
  message: z.string().min(1).max(1000),
  paths: z.array(z.string()).optional(),
});

// Git enabled check middleware
function requireGit(_req: Request, res: Response, next: Function): void {
  if (!config.GIT_ENABLE) {
    res.status(403).json({
      error: 'Git operations are disabled',
      message: 'Set GIT_ENABLE=true in .env to enable',
    });
    return;
  }
  next();
}

// Get diff
router.get('/api/git/diff', requireGit, async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.projectPath as string | undefined;
    const paths = req.query['paths[]'] as string[] | string | undefined;
    
    const cwd = validateProjectPath(
      projectPath,
      config.DEFAULT_PROJECT,
      config.PROJECT_ALLOWLIST
    );
    
    const pathsArray = paths
      ? Array.isArray(paths)
        ? paths
        : [paths]
      : undefined;
    
    logger.debug({ cwd, paths: pathsArray }, 'Git diff request');
    
    const diff = await gitDiff(cwd, pathsArray);
    
    // Parse affected files from diff
    const files: string[] = [];
    const diffLines = diff.split('\n');
    for (const line of diffLines) {
      if (line.startsWith('diff --git')) {
        const match = line.match(/b\/(.+)$/);
        if (match) {
          files.push(match[1]);
        }
      }
    }
    
    // Cap diff size (100KB)
    const MAX_DIFF_SIZE = 100 * 1024;
    const cappedDiff = diff.length > MAX_DIFF_SIZE
      ? diff.substring(0, MAX_DIFF_SIZE) + '\n\n... (diff truncated)'
      : diff;
    
    res.json({
      cwd,
      diff: cappedDiff,
      files,
      truncated: diff.length > MAX_DIFF_SIZE,
    });
  } catch (error: any) {
    logger.error({ error }, 'Git diff error');
    res.status(500).json({
      error: error.message || 'Failed to get diff',
    });
  }
});

// Commit changes
router.post('/api/git/commit', requireGit, requireWriteAccess, async (req: Request, res: Response) => {
  try {
    const body = commitSchema.parse(req.body);
    
    const cwd = validateProjectPath(
      body.projectPath,
      config.DEFAULT_PROJECT,
      config.PROJECT_ALLOWLIST
    );
    
    logger.info({ cwd, message: body.message, paths: body.paths }, 'Git commit request');
    
    // Stage files
    await gitAdd(cwd, body.paths);
    
    // Commit
    const sha = await execCommit(cwd, body.message);
    
    res.json({
      ok: true,
      sha,
      message: body.message,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    } else if (error.message?.includes('nothing to commit')) {
      res.status(400).json({
        error: 'No changes to commit',
      });
    } else if (error.message?.includes('not a git repository')) {
      res.status(400).json({
        error: 'Not a git repository',
      });
    } else {
      logger.error({ error }, 'Git commit error');
      res.status(500).json({
        error: error.message || 'Failed to commit',
      });
    }
  }
});

// Helper: git add
async function gitAdd(cwd: string, paths?: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ['add'];
    
    if (paths && paths.length > 0) {
      args.push(...paths);
    } else {
      args.push('-A');
    }
    
    const proc = spawn('git', args, { cwd, shell: true });
    let stderr = '';
    
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || 'Git add failed'));
      }
    });
    
    proc.on('error', reject);
  });
}

// Helper: git commit
async function execCommit(cwd: string, message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', ['commit', '-m', message], { cwd, shell: true });
    let stderr = '';
    
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        // Get commit SHA
        const revParse = spawn('git', ['rev-parse', 'HEAD'], { cwd, shell: true });
        let sha = '';
        
        revParse.stdout?.on('data', (data: Buffer) => {
          sha += data.toString();
        });
        
        revParse.on('close', (code) => {
          if (code === 0) {
            resolve(sha.trim());
          } else {
            reject(new Error('Failed to get commit SHA'));
          }
        });
      } else {
        reject(new Error(stderr || 'Git commit failed'));
      }
    });
    
    proc.on('error', reject);
  });
}

export default router;

