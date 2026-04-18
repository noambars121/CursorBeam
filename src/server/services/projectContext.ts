import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from './logger.js';

export interface ProjectContext {
  projectName: string;
  files: string[];
  packageJson?: any;
  readme?: string;
  gitBranch?: string;
  recentFiles: string[];
}

/**
 * Gather project context to provide AI with workspace awareness
 * This mimics what Cursor IDE does internally
 */
export async function gatherProjectContext(cwd: string): Promise<ProjectContext> {
  const context: ProjectContext = {
    projectName: path.basename(cwd),
    files: [],
    recentFiles: [],
  };
  
  try {
    // Read package.json if exists
    try {
      const packagePath = path.join(cwd, 'package.json');
      const content = await fs.readFile(packagePath, 'utf-8');
      context.packageJson = JSON.parse(content);
    } catch {
      // No package.json
    }
    
    // Read README if exists
    try {
      const readmePath = path.join(cwd, 'README.md');
      context.readme = await fs.readFile(readmePath, 'utf-8');
      // Truncate if too long
      if (context.readme.length > 2000) {
        context.readme = context.readme.substring(0, 2000) + '\n...(truncated)';
      }
    } catch {
      // No README
    }
    
    // Get file list (shallow, important files only)
    const entries = await fs.readdir(cwd, { withFileTypes: true });
    context.files = entries
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
      .map(e => e.name)
      .slice(0, 50); // Limit to avoid token overflow
    
    // Try to get git branch
    try {
      const gitHeadPath = path.join(cwd, '.git', 'HEAD');
      const headContent = await fs.readFile(gitHeadPath, 'utf-8');
      const match = headContent.match(/ref: refs\/heads\/(.+)/);
      if (match) {
        context.gitBranch = match[1].trim();
      }
    } catch {
      // No git or error
    }
    
    logger.debug({ projectName: context.projectName, fileCount: context.files.length }, 'Gathered project context');
  } catch (error) {
    logger.error({ error }, 'Error gathering project context');
  }
  
  return context;
}

/**
 * Build enhanced system prompt with project context
 * Makes AI feel like it's inside Cursor IDE
 */
export function buildEnhancedSystemPrompt(context: ProjectContext, basePrompt?: string): string {
  let prompt = basePrompt || 'You are a helpful AI coding assistant integrated into Cursor IDE.';
  
  prompt += '\n\n## Current Workspace Context:\n\n';
  
  prompt += `**Project:** ${context.projectName}\n`;
  
  if (context.gitBranch) {
    prompt += `**Git Branch:** ${context.gitBranch}\n`;
  }
  
  if (context.packageJson) {
    prompt += `\n**Package Info:**\n`;
    if (context.packageJson.name) prompt += `- Name: ${context.packageJson.name}\n`;
    if (context.packageJson.version) prompt += `- Version: ${context.packageJson.version}\n`;
    if (context.packageJson.description) prompt += `- Description: ${context.packageJson.description}\n`;
    
    if (context.packageJson.dependencies) {
      const deps = Object.keys(context.packageJson.dependencies).slice(0, 10);
      prompt += `- Dependencies: ${deps.join(', ')}${Object.keys(context.packageJson.dependencies).length > 10 ? ', ...' : ''}\n`;
    }
  }
  
  if (context.readme) {
    prompt += `\n**README:**\n\`\`\`markdown\n${context.readme}\n\`\`\`\n`;
  }
  
  if (context.files.length > 0) {
    prompt += `\n**Project Files:**\n${context.files.map(f => `- ${f}`).join('\n')}\n`;
  }
  
  prompt += '\n---\n\n';
  prompt += 'When answering, consider the project context above. Provide specific, actionable advice relevant to this codebase.';
  prompt += '\nIf asked to create or modify files, reference actual project structure.';
  prompt += '\nRespond in Hebrew if the user writes in Hebrew.';
  
  return prompt;
}

