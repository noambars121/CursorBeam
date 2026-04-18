import { Router, Request, Response } from 'express';
import { config } from '../env.js';
import { logger } from '../services/logger.js';
import { readCursorAPIKeys } from '../services/cursorSettingsReader.js';

const router = Router();

const startTime = Date.now();

router.get('/api/status', async (req: Request, res: Response) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  
  // Check for Cursor API keys
  const cursorKeys = await readCursorAPIKeys();
  
  const status = {
    ok: true,
    bridge: 'cursor-mobile@1.0.0',
    cursorCmd: config.CURSOR_CMD,
    projectsRoot: config.PROJECTS_ROOT,
    defaultProject: config.DEFAULT_PROJECT,
    allowlistCount: config.PROJECT_ALLOWLIST.length,
    readOnly: config.READ_ONLY,
    git: config.GIT_ENABLE,
    allowedCommands: config.ALLOWED_EXEC,
    availableModels: config.AVAILABLE_MODELS,
    defaultModel: config.DEFAULT_MODEL,
    uptime,
    directCursor: config.DIRECT_CURSOR,
    directCursorEndpoint: config.DIRECT_CURSOR ? `${config.DIRECT_CURSOR_HOST}:${config.DIRECT_CURSOR_PORT}` : null,
    aiProvider: {
      hasAnthropic: !!cursorKeys.anthropic,
      hasOpenAI: !!cursorKeys.openai,
      hasGoogle: !!cursorKeys.google,
      defaultModel: cursorKeys.defaultModel || config.DEFAULT_MODEL,
    },
  };
  
  logger.debug({ ip: req.ip }, 'Status check');
  res.json(status);
});

export default router;

