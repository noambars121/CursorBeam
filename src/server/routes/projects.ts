import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { config } from '../env.js';
import { logger } from '../services/logger.js';
import { createSSEStream } from '../utils/sse.js';

const router = Router();

// Store running projects
const runningProjects = new Map<string, {
  process: ChildProcess;
  port: number;
  startedAt: Date;
  logs: string[];
}>();

const startProjectSchema = z.object({
  project: z.string(),
  command: z.string().optional(),
});

const stopProjectSchema = z.object({
  project: z.string(),
});

// Get current project open in Cursor (via extension)
router.get('/api/projects/current', async (_req: Request, res: Response) => {
  try {
    const extensionUrl = `http://${config.DIRECT_CURSOR_HOST}:${config.DIRECT_CURSOR_PORT}/workspace`;
    
    const response = await fetch(extensionUrl, {
      method: 'GET',
      headers: {
        'x-api-key': config.DIRECT_CURSOR_API_KEY,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Extension returned ${response.status}`);
    }
    
    const workspaceInfo = await response.json() as any;
    
    // Try to match with known projects
    let currentProject = null;
    if (workspaceInfo.folders && workspaceInfo.folders.length > 0) {
      const currentPath = workspaceInfo.folders[0].path;
      const projectsRoot = config.PROJECTS_ROOT.toLowerCase();
      
      // Check if current folder is under PROJECTS_ROOT
      if (currentPath.toLowerCase().startsWith(projectsRoot)) {
        // Extract project name from path
        const relativePath = currentPath.substring(projectsRoot.length);
        const projectName = relativePath.split(/[/\\]/)[1] || relativePath.split(/[/\\]/)[0];
        if (projectName) {
          currentProject = {
            name: projectName,
            path: currentPath,
          };
        }
      } else {
        // Not in PROJECTS_ROOT, but still show what's open
        currentProject = {
          name: workspaceInfo.name || workspaceInfo.folders[0].name,
          path: currentPath,
          external: true, // Flag that it's not in PROJECTS_ROOT
        };
      }
    }
    
    res.json({
      ok: true,
      connected: true,
      workspace: workspaceInfo,
      currentProject,
    });
  } catch (error: any) {
    logger.debug({ error: error.message }, 'Could not get current project from extension');
    
    res.json({
      ok: true,
      connected: false,
      currentProject: null,
      message: 'ההרחבה לא מחוברת - לא ניתן לזהות פרויקט פתוח',
    });
  }
});

// Get list of available projects
router.get('/api/projects', async (_req: Request, res: Response) => {
  try {
    const projectsRoot = config.PROJECTS_ROOT;
    const entries = await fs.readdir(projectsRoot, { withFileTypes: true });
    
    const projects: Array<{
      name: string;
      path: string;
      hasPackageJson: boolean;
      running: boolean;
      port?: number;
    }> = [];
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const projectPath = path.join(projectsRoot, entry.name);
        const packageJsonPath = path.join(projectPath, 'package.json');
        
        let hasPackageJson = false;
        try {
          await fs.access(packageJsonPath);
          hasPackageJson = true;
        } catch {
          // No package.json
        }
        
        const runningInfo = runningProjects.get(entry.name);
        
        projects.push({
          name: entry.name,
          path: projectPath,
          hasPackageJson,
          running: !!runningInfo,
          port: runningInfo?.port,
        });
      }
    }
    
    logger.debug({ count: projects.length }, 'Listed projects');
    
    res.json({
      projects,
      root: projectsRoot,
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to list projects');
    res.status(500).json({
      error: error.message || 'Failed to list projects',
    });
  }
});

// Start a project
router.post('/api/projects/start', async (req: Request, res: Response) => {
  try {
    const body = startProjectSchema.parse(req.body);
    const projectPath = path.join(config.PROJECTS_ROOT, body.project);
    
    // Check if already running
    if (runningProjects.has(body.project)) {
      res.status(400).json({
        error: 'Project already running',
        message: 'הפרויקט כבר רץ',
      });
      return;
    }
    
    // Find available port
    const port = await findAvailablePort();
    
    // Determine command
    let command = body.command || 'npm';
    let args = ['run', 'dev'];
    
    // Try to detect the project type
    try {
      const packageJson = JSON.parse(
        await fs.readFile(path.join(projectPath, 'package.json'), 'utf-8')
      );
      
      // Check for common dev scripts
      if (packageJson.scripts) {
        if (packageJson.scripts.dev) {
          command = 'npm';
          args = ['run', 'dev', '--', '--host', '0.0.0.0', '--port', port.toString()];
        } else if (packageJson.scripts.start) {
          command = 'npm';
          args = ['start'];
        }
      }
    } catch (error) {
      logger.warn({ error, project: body.project }, 'Could not read package.json');
    }
    
    logger.info({ project: body.project, port, command, args }, 'Starting project');
    
    // Spawn the process
    const proc = spawn(command, args, {
      cwd: projectPath,
      shell: true,
      env: { ...process.env, PORT: port.toString() },
    });
    
    const logs: string[] = [];
    
    proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      logs.push(text);
      if (logs.length > 100) logs.shift(); // Keep last 100 lines
    });
    
    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      logs.push(text);
      if (logs.length > 100) logs.shift();
    });
    
    proc.on('error', (error) => {
      logger.error({ error, project: body.project }, 'Project process error');
      runningProjects.delete(body.project);
    });
    
    proc.on('close', (code) => {
      logger.info({ code, project: body.project }, 'Project process closed');
      runningProjects.delete(body.project);
    });
    
    // Store running project info
    runningProjects.set(body.project, {
      process: proc,
      port,
      startedAt: new Date(),
      logs,
    });
    
    // Wait a bit to see if it starts successfully
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    res.json({
      success: true,
      project: body.project,
      port,
      url: `http://noam.tailf4f5e8.ts.net:${port}`,
      localUrl: `http://localhost:${port}`,
      message: 'הפרויקט התחיל בהצלחה',
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    } else {
      logger.error({ error }, 'Failed to start project');
      res.status(500).json({
        error: error.message || 'Failed to start project',
      });
    }
  }
});

// Stop a project
router.post('/api/projects/stop', async (req: Request, res: Response) => {
  try {
    const body = stopProjectSchema.parse(req.body);
    
    const projectInfo = runningProjects.get(body.project);
    if (!projectInfo) {
      res.status(404).json({
        error: 'Project not running',
        message: 'הפרויקט לא רץ',
      });
      return;
    }
    
    logger.info({ project: body.project }, 'Stopping project');
    
    // Kill the process
    projectInfo.process.kill('SIGTERM');
    
    // Wait for it to die
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (projectInfo.process.exitCode === null) {
      projectInfo.process.kill('SIGKILL');
    }
    
    runningProjects.delete(body.project);
    
    res.json({
      success: true,
      message: 'הפרויקט נעצר בהצלחה',
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    } else {
      logger.error({ error }, 'Failed to stop project');
      res.status(500).json({
        error: error.message || 'Failed to stop project',
      });
    }
  }
});

// Switch project in Cursor (open folder via extension)
const switchProjectSchema = z.object({
  project: z.string(),
});

router.post('/api/projects/switch', async (req: Request, res: Response) => {
  try {
    const body = switchProjectSchema.parse(req.body);
    const projectPath = path.join(config.PROJECTS_ROOT, body.project);
    
    // Verify the project exists
    try {
      await fs.access(projectPath);
    } catch {
      res.status(404).json({
        error: 'Project not found',
        message: 'הפרויקט לא נמצא',
      });
      return;
    }
    
    logger.info({ project: body.project, path: projectPath }, 'Switching to project in Cursor');
    
    // Send request to Cursor extension to open the folder
    try {
      const extensionUrl = `http://${config.DIRECT_CURSOR_HOST}:${config.DIRECT_CURSOR_PORT}/open-folder`;
      
      const response = await fetch(extensionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.DIRECT_CURSOR_API_KEY,
        },
        body: JSON.stringify({ path: projectPath }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Extension returned ${response.status}`);
      }
      
      const result = await response.json() as any;
      
      res.json({
        success: true,
        project: body.project,
        path: projectPath,
        message: 'הפרויקט נפתח ב-Cursor',
        extensionResponse: result,
      });
    } catch (fetchError: any) {
      // Extension not available
      logger.warn({ error: fetchError.message }, 'Cursor extension not available for project switch');
      
      res.status(503).json({
        error: 'Cursor extension not available',
        message: 'ההרחבה לא זמינה. וודא ש-Cursor פתוח וההרחבה פועלת (Ctrl+Shift+P → "Cursor Mobile: Start Bridge Server")',
        path: projectPath,
      });
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    } else {
      logger.error({ error }, 'Failed to switch project');
      res.status(500).json({
        error: error.message || 'Failed to switch project',
      });
    }
  }
});

// Get project logs (streaming)
router.get('/api/projects/:project/logs', (req: Request, res: Response) => {
  const projectName = req.params.project;
  const projectInfo = runningProjects.get(projectName);
  
  if (!projectInfo) {
    res.status(404).json({
      error: 'Project not running',
    });
    return;
  }
  
  const stream = createSSEStream(res);
  
  // Send existing logs
  projectInfo.logs.forEach(log => {
    stream.send('log', { data: log });
  });
  
  // Set up listener for new logs
  const onData = (data: Buffer) => {
    stream.send('log', { data: data.toString() });
  };
  
  projectInfo.process.stdout?.on('data', onData);
  projectInfo.process.stderr?.on('data', onData);
  
  // Cleanup on disconnect
  req.on('close', () => {
    projectInfo.process.stdout?.off('data', onData);
    projectInfo.process.stderr?.off('data', onData);
    stream.end();
  });
});

// Helper: Find available port
async function findAvailablePort(): Promise<number> {
  const start = config.PORT_RANGE_START;
  const end = config.PORT_RANGE_END;
  
  // Simple implementation - just increment from start
  // In production, you'd want to check if the port is actually free
  const usedPorts = Array.from(runningProjects.values()).map(p => p.port);
  
  for (let port = start; port <= end; port++) {
    if (!usedPorts.includes(port)) {
      return port;
    }
  }
  
  throw new Error('No available ports in range');
}

export default router;

