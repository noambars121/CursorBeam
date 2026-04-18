import { z } from 'zod';
import { runAgent } from './cursorAgent.js';
import { applyPatch } from './diff.js';
import { writeFile } from './fileGuard.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from './logger.js';

const changeSchema = z.object({
  path: z.string(),
  type: z.enum(['modify', 'create', 'delete']),
  patch: z.string(),
});

const stepSchema = z.object({
  id: z.string(),
  title: z.string(),
  why: z.string(),
  changes: z.array(changeSchema),
});

const planSchema = z.object({
  steps: z.array(stepSchema),
  notes: z.string().optional(),
});

export type Change = z.infer<typeof changeSchema>;
export type Step = z.infer<typeof stepSchema>;
export type Plan = z.infer<typeof planSchema>;

export interface ApplyResult {
  applied: string[];
  failed: Array<{ id: string; error: string }>;
}

// In-memory cache: cwd -> Plan
const planCache = new Map<string, Plan>();
const MAX_CACHE_SIZE = 10;

/**
 * Generate an implementation plan
 */
export async function generatePlan(
  goal: string,
  cwd: string,
  timeoutSec?: number
): Promise<Plan> {
  logger.info({ goal, cwd }, 'Generating plan');
  
  // Try native CLI plan command first
  try {
    const result = await runAgent({
      mode: 'plan',
      prompt: goal,
      cwd,
      timeoutSec,
    });
    
    // Try to parse as JSON
    const plan = parsePlanFromOutput(result.output);
    
    // Cache the plan
    cachePlan(cwd, plan);
    
    return plan;
  } catch (error) {
    logger.warn({ error }, 'Native plan command failed, trying fallback');
    
    // Fallback: use chat mode with planner system prompt
    return await generatePlanFallback(goal, cwd, timeoutSec);
  }
}

/**
 * Fallback planner using chat mode with JSON prompt
 */
async function generatePlanFallback(
  goal: string,
  cwd: string,
  timeoutSec?: number
): Promise<Plan> {
  const systemPrompt = `You are a code planner. Generate a step-by-step implementation plan in strict JSON format.
Output ONLY valid JSON, no markdown, no explanations.

Format:
{
  "steps": [
    {
      "id": "s1",
      "title": "Step title",
      "why": "Explanation of why this step is needed",
      "changes": [
        {
          "path": "relative/file/path",
          "type": "modify" | "create" | "delete",
          "patch": "unified diff format for modify, or file content for create"
        }
      ]
    }
  ],
  "notes": "Optional implementation notes"
}`;
  
  const result = await runAgent({
    mode: 'chat',
    prompt: `Goal: ${goal}\n\nGenerate an implementation plan.`,
    cwd,
    system: systemPrompt,
    timeoutSec,
  });
  
  const plan = parsePlanFromOutput(result.output);
  cachePlan(cwd, plan);
  
  return plan;
}

/**
 * Parse plan from agent output (extract JSON)
 */
function parsePlanFromOutput(output: string): Plan {
  try {
    // Try to find JSON in the output
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in output');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    return planSchema.parse(parsed);
  } catch (error) {
    logger.error({ error, output: output.substring(0, 500) }, 'Failed to parse plan');
    throw new Error('Failed to parse plan from agent output. Make sure Cursor CLI returns valid plan JSON.');
  }
}

/**
 * Cache a plan
 */
function cachePlan(cwd: string, plan: Plan): void {
  // Limit cache size
  if (planCache.size >= MAX_CACHE_SIZE) {
    const firstKey = planCache.keys().next().value;
    if (firstKey !== undefined) {
      planCache.delete(firstKey);
    }
  }
  
  planCache.set(cwd, plan);
  logger.debug({ cwd, steps: plan.steps.length }, 'Cached plan');
}

/**
 * Get cached plan
 */
export function getCachedPlan(cwd: string): Plan | null {
  return planCache.get(cwd) || null;
}

/**
 * Apply selected plan steps
 */
export async function applyPlanSteps(
  cwd: string,
  stepIds: string[],
  plan: Plan
): Promise<ApplyResult> {
  const result: ApplyResult = {
    applied: [],
    failed: [],
  };
  
  logger.info({ cwd, stepIds }, 'Applying plan steps');
  
  for (const stepId of stepIds) {
    const step = plan.steps.find(s => s.id === stepId);
    
    if (!step) {
      result.failed.push({ id: stepId, error: 'Step not found in plan' });
      continue;
    }
    
    try {
      await applyStep(cwd, step);
      result.applied.push(stepId);
      logger.info({ stepId, title: step.title }, 'Step applied successfully');
    } catch (error: any) {
      const message = error.message || String(error);
      result.failed.push({ id: stepId, error: message });
      logger.error({ error, stepId }, 'Failed to apply step');
    }
  }
  
  return result;
}

/**
 * Apply a single step
 */
async function applyStep(cwd: string, step: Step): Promise<void> {
  for (const change of step.changes) {
    const fullPath = path.join(cwd, change.path);
    
    switch (change.type) {
      case 'create':
        // Create new file
        await writeFile(cwd, change.path, change.patch);
        break;
        
      case 'modify':
        // Apply unified diff patch
        await applyPatch(cwd, change.patch);
        break;
        
      case 'delete':
        // Delete file
        try {
          await fs.unlink(fullPath);
          logger.info({ path: change.path }, 'Deleted file');
        } catch (error) {
          logger.error({ error, path: change.path }, 'Failed to delete file');
          throw error;
        }
        break;
    }
  }
}

