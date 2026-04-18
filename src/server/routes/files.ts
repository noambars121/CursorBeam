import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { config } from '../env.js';
import { validateProjectPath } from '../utils/paths.js';
import { requireWriteAccess } from '../security.js';
import { listFiles, readFile, writeFile } from '../services/fileGuard.js';
import { logger } from '../services/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const router = Router();

// Build tree structure from file paths
function buildFileTree(files: Array<{ path: string; size: number; mtime: Date }>): any {
  const root: any = { name: '/', type: 'folder', children: [] };
  
  files.forEach(file => {
    const parts = file.path.split(/[/\\]/);
    let current = root;
    
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        // File
        current.children.push({
          name: part,
          type: 'file',
          path: file.path,
          size: file.size,
          mtime: file.mtime,
        });
      } else {
        // Folder
        let folder = current.children.find((c: any) => c.name === part && c.type === 'folder');
        if (!folder) {
          folder = {
            name: part,
            type: 'folder',
            children: [],
          };
          current.children.push(folder);
        }
        current = folder;
      }
    });
  });
  
  // Sort: folders first, then files
  function sortChildren(node: any) {
    if (node.children) {
      node.children.sort((a: any, b: any) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      node.children.forEach(sortChildren);
    }
  }
  sortChildren(root);
  
  return root;
}

// List files (or tree)
router.get('/api/files', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.projectPath as string | undefined;
    const project = req.query.project as string | undefined;
    const glob = req.query.glob as string | undefined;
    const tree = req.query.tree as string | undefined;
    
    let actualProjectPath = projectPath;
    if (project && !actualProjectPath) {
      actualProjectPath = `${config.PROJECTS_ROOT}\\${project}`;
    }
    
    const cwd = validateProjectPath(
      actualProjectPath,
      `${config.PROJECTS_ROOT}\\${config.DEFAULT_PROJECT}`,
      config.PROJECT_ALLOWLIST
    );
    
    logger.debug({ cwd, glob, tree }, 'List files request');
    
    const files = await listFiles(cwd, glob);
    
    if (tree === 'true') {
      const fileTree = buildFileTree(files);
      res.json({ cwd, tree: fileTree });
    } else {
      res.json({ cwd, files });
    }
  } catch (error: any) {
    logger.error({ error }, 'List files error');
    res.status(500).json({
      error: error.message || 'Failed to list files',
    });
  }
});

// Read file
router.get('/api/file', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.projectPath as string | undefined;
    const project = req.query.project as string | undefined;
    const filePath = req.query.path as string;
    
    if (!filePath) {
      res.status(400).json({ error: 'path query parameter required' });
      return;
    }
    
    let actualProjectPath = projectPath;
    if (project && !actualProjectPath) {
      actualProjectPath = `${config.PROJECTS_ROOT}\\${project}`;
    }
    
    const cwd = validateProjectPath(
      actualProjectPath,
      `${config.PROJECTS_ROOT}\\${config.DEFAULT_PROJECT}`,
      config.PROJECT_ALLOWLIST
    );
    
    logger.debug({ cwd, filePath }, 'Read file request');
    
    const content = await readFile(cwd, filePath);
    const fullPath = path.join(cwd, filePath);
    const stats = await fs.stat(fullPath);
    
    res.json({
      path: filePath,
      content,
      size: stats.size,
      mtime: stats.mtime,
    });
  } catch (error: any) {
    logger.error({ error }, 'Read file error');
    
    if (error.message === 'File not found') {
      res.status(404).json({ error: 'File not found' });
    } else {
      res.status(500).json({
        error: error.message || 'Failed to read file',
      });
    }
  }
});

// Write file
const updateFileSchema = z.object({
  project: z.string().optional(),
  projectPath: z.string().optional(),
  path: z.string(),
  content: z.string(),
});

router.post('/api/file', requireWriteAccess, async (req: Request, res: Response) => {
  try {
    const body = updateFileSchema.parse(req.body);
    
    let actualProjectPath = body.projectPath;
    if (body.project && !actualProjectPath) {
      actualProjectPath = `${config.PROJECTS_ROOT}\\${body.project}`;
    }
    
    const cwd = validateProjectPath(
      actualProjectPath,
      `${config.PROJECTS_ROOT}\\${config.DEFAULT_PROJECT}`,
      config.PROJECT_ALLOWLIST
    );
    
    logger.info({ cwd, path: body.path, size: body.content.length }, 'Write file request');
    
    await writeFile(cwd, body.path, body.content);
    
    const fullPath = path.join(cwd, body.path);
    const stats = await fs.stat(fullPath);
    
    res.json({
      ok: true,
      path: body.path,
      size: stats.size,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    } else {
      logger.error({ error }, 'Write file error');
      res.status(500).json({
        error: error.message || 'Failed to write file',
      });
    }
  }
});

export default router;

