import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { spawn } from 'child_process';
import { config } from '../env.js';
import { validateProjectPath } from '../utils/paths.js';
import { requireWriteAccess } from '../security.js';
import { generatePlan, getCachedPlan, applyPlanSteps } from '../services/planner.js';
import { logger } from '../services/logger.js';

const router = Router();

const planRequestSchema = z.object({
  goal: z.string().min(1).max(5000),
  projectPath: z.string().optional(),
  allowWrites: z.boolean().optional(),
});

const applyRequestSchema = z.object({
  projectPath: z.string(),
  stepIds: z.array(z.string()),
  commit: z.object({
    message: z.string(),
  }).optional(),
});

// Generate plan
router.post('/api/plan', async (req: Request, res: Response) => {
  try {
    const body = planRequestSchema.parse(req.body);
    
    const cwd = validateProjectPath(
      body.projectPath,
      config.DEFAULT_PROJECT,
      config.PROJECT_ALLOWLIST
    );
    
    logger.info({ cwd, goal: body.goal }, 'Plan generation request');
    
    const plan = await generatePlan(body.goal, cwd);
    
    res.json({
      plan,
      cached: false,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    } else {
      logger.error({ error }, 'Plan generation error');
      res.status(500).json({
        error: error.message || 'Plan generation failed',
      });
    }
  }
});

// Apply plan steps
router.post('/api/plan/apply', requireWriteAccess, async (req: Request, res: Response) => {
  try {
    const body = applyRequestSchema.parse(req.body);
    
    const cwd = validateProjectPath(
      body.projectPath,
      config.DEFAULT_PROJECT,
      config.PROJECT_ALLOWLIST
    );
    
    // Get cached plan
    const plan = getCachedPlan(cwd);
    if (!plan) {
      res.status(404).json({
        error: 'Plan not found',
        message: 'Please generate a plan first',
      });
      return;
    }
    
    // Verify step IDs exist
    const invalidSteps = body.stepIds.filter(
      id => !plan.steps.some(s => s.id === id)
    );
    
    if (invalidSteps.length > 0) {
      res.status(400).json({
        error: 'Invalid step IDs',
        invalidSteps,
      });
      return;
    }
    
    logger.info({ cwd, stepIds: body.stepIds }, 'Applying plan steps');
    
    // Apply steps
    const result = await applyPlanSteps(cwd, body.stepIds, plan);
    
    // Optionally commit changes
    let commitSha: string | undefined;
    if (body.commit && config.GIT_ENABLE && result.applied.length > 0) {
      try {
        commitSha = await gitCommit(cwd, body.commit.message);
        logger.info({ cwd, sha: commitSha }, 'Changes committed');
      } catch (error) {
        logger.error({ error }, 'Failed to commit changes');
      }
    }
    
    res.json({
      applied: result.applied,
      failed: result.failed,
      commit: commitSha ? { sha: commitSha } : undefined,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    } else {
      logger.error({ error }, 'Plan apply error');
      res.status(500).json({
        error: error.message || 'Failed to apply plan',
      });
    }
  }
});

// Helper: git commit
async function gitCommit(cwd: string, message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Stage all changes
    const add = spawn('git', ['add', '-A'], { cwd, shell: true });
    
    add.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error('Failed to stage changes'));
      }
      
      // Commit
      const commit = spawn('git', ['commit', '-m', message], { cwd, shell: true });
      let output = '';
      
      commit.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      commit.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error('Failed to commit'));
        }
        
        // Get commit SHA
        const revParse = spawn('git', ['rev-parse', 'HEAD'], { cwd, shell: true });
        let sha = '';
        
        revParse.stdout?.on('data', (data: Buffer) => {
          sha += data.toString();
        });
        
        revParse.on('close', (code) => {
          if (code !== 0) {
            return reject(new Error('Failed to get commit SHA'));
          }
          
          resolve(sha.trim());
        });
      });
    });
  });
}

export default router;

