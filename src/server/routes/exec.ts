import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { spawn, ChildProcess } from 'child_process';
import { config } from '../env.js';
import { validateProjectPath } from '../utils/paths.js';
import { requireWriteAccess } from '../security.js';
import { createSSEStream } from '../utils/sse.js';
import { logger } from '../services/logger.js';

const router = Router();

const execSchema = z.object({
  projectPath: z.string(),
  cmd: z.string(),
});

router.post('/api/exec', requireWriteAccess, async (req: Request, res: Response) => {
  try {
    const body = execSchema.parse(req.body);
    
    const cwd = validateProjectPath(
      body.projectPath,
      config.DEFAULT_PROJECT,
      config.PROJECT_ALLOWLIST
    );
    
    // Validate command is in allowlist
    const isAllowed = config.ALLOWED_EXEC.some(allowed => {
      return body.cmd === allowed || body.cmd.startsWith(allowed + ' ');
    });
    
    if (!isAllowed) {
      logger.warn({ cmd: body.cmd, ip: req.ip }, 'Exec command not allowed');
      res.status(403).json({
        error: 'Command not allowed',
        message: 'This command is not in the ALLOWED_EXEC list',
        allowedCommands: config.ALLOWED_EXEC,
      });
      return;
    }
    
    logger.info({ cwd, cmd: body.cmd, ip: req.ip }, 'Exec request');
    
    // Create SSE stream
    const stream = createSSEStream(res);
    
    // Send initial event
    stream.send('start', {
      type: 'start',
      cmd: body.cmd,
      cwd,
      startedAt: new Date().toISOString(),
    });
    
    const startTime = Date.now();
    
    // Parse command and args
    const [command, ...args] = body.cmd.split(' ');
    
    // Sanitize environment
    const env = { ...process.env };
    delete env.API_KEY;
    delete env.CURSOR_CMD;
    
    // Spawn process
    const proc: ChildProcess = spawn(command, args, {
      cwd,
      env,
      shell: true,
    });
    
    let killed = false;
    
    // Timeout
    const timeoutHandle = setTimeout(() => {
      logger.warn({ cmd: body.cmd }, 'Exec timeout, killing process');
      killed = true;
      proc.kill('SIGTERM');
      
      setTimeout(() => {
        if (proc.exitCode === null) {
          proc.kill('SIGKILL');
        }
      }, 5000);
    }, config.MAX_RUN_SECONDS * 1000);
    
    // Handle stdout
    proc.stdout?.on('data', (data: Buffer) => {
      stream.send('chunk', {
        type: 'stdout',
        data: data.toString(),
      });
    });
    
    // Handle stderr
    proc.stderr?.on('data', (data: Buffer) => {
      stream.send('chunk', {
        type: 'stderr',
        data: data.toString(),
      });
    });
    
    // Handle errors
    proc.on('error', (error) => {
      clearTimeout(timeoutHandle);
      logger.error({ error, cmd: body.cmd }, 'Exec process error');
      
      stream.send('error', {
        type: 'error',
        message: error.message,
      });
      
      stream.end();
    });
    
    // Handle completion
    proc.on('close', (code) => {
      clearTimeout(timeoutHandle);
      const duration = Math.floor((Date.now() - startTime) / 1000);
      
      logger.info({ code, duration, killed, cmd: body.cmd }, 'Exec completed');
      
      stream.send('end', {
        type: 'end',
        code: code || (killed ? -1 : 0),
        endedAt: new Date().toISOString(),
        duration,
        killed,
      });
      
      stream.end();
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    } else {
      logger.error({ error }, 'Exec error');
      res.status(500).json({
        error: error.message || 'Exec failed',
      });
    }
  }
});

export default router;

