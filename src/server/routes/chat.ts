import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { config } from '../env.js';
import { validateProjectPath } from '../utils/paths.js';
import { createSSEStream } from '../utils/sse.js';
import { runAgent } from '../services/cursorAgent.js';
import { logger } from '../services/logger.js';
import { addAssistantMessage } from './rchat.js';

const router = Router();

const chatSchema = z.object({
  prompt: z.string().min(1).max(10000),
  projectPath: z.string().optional(),
  project: z.string().optional(), // Project name (will be combined with PROJECTS_ROOT)
  model: z.string().optional(), // Model selection
  system: z.string().optional(),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
});

router.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const body = chatSchema.parse(req.body);
    
    // Determine project path
    let projectPath = body.projectPath;
    if (body.project && !projectPath) {
      projectPath = `${config.PROJECTS_ROOT}\\${body.project}`;
    }
    
    // Validate project path
    const cwd = validateProjectPath(
      projectPath,
      `${config.PROJECTS_ROOT}\\${config.DEFAULT_PROJECT}`,
      config.PROJECT_ALLOWLIST
    );
    
    const model = body.model || config.DEFAULT_MODEL;
    
    logger.info({ 
      cwd, 
      model,
      promptLength: body.prompt.length,
      hasHistory: !!body.conversationHistory 
    }, 'Chat request');
    
    // Create SSE stream
    const stream = createSSEStream(res);
    
    // Send initial event
    stream.send('start', {
      type: 'start',
      cwd,
      model,
      startedAt: new Date().toISOString(),
      readOnly: config.READ_ONLY,
    });
    
    // Run agent
    try {
      let assistantText = '';
      
      const result = await runAgent({
        mode: 'chat',
        prompt: body.prompt,
        cwd,
        system: body.system,
        conversationHistory: body.conversationHistory,
        onChunk: (chunk) => {
          stream.send('chunk', {
            type: chunk.type,
            data: chunk.data,
          });
          
          // Accumulate assistant text for remote chat transcript
          if (chunk.type === 'stdout' && typeof chunk.data === 'string') {
            assistantText += chunk.data;
          }
        },
      });
      
      // Add to remote chat transcript if we got a response
      if (assistantText.trim().length > 0) {
        addAssistantMessage(assistantText.trim());
      }
      
      // Send completion event
      stream.send('end', {
        type: 'end',
        code: result.exitCode,
        endedAt: new Date().toISOString(),
        duration: result.duration,
      });
    } catch (error: any) {
      logger.error({ error }, 'Agent error');
      
      stream.send('error', {
        type: 'error',
        message: error.message || 'Agent execution failed',
      });
    }
    
    stream.end();
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    } else {
      logger.error({ error }, 'Chat error');
      res.status(500).json({
        error: error.message || 'Internal server error',
      });
    }
  }
});

export default router;

