import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { logger } from './logger.js';

// ===========================================
// Diff Data Types
// ===========================================

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface FileDiff {
  oldPath: string;
  newPath: string;
  status: 'added' | 'deleted' | 'modified' | 'renamed';
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

export interface ParsedDiff {
  files: FileDiff[];
  totalAdditions: number;
  totalDeletions: number;
  totalFiles: number;
}

/**
 * Get git diff for a project
 */
export async function gitDiff(cwd: string, paths?: string[]): Promise<string> {
  try {
    const args = ['diff'];
    if (paths && paths.length > 0) {
      args.push('--', ...paths);
    }
    
    const diff = await execGit(cwd, args);
    logger.debug({ cwd, paths, length: diff.length }, 'Generated git diff');
    
    return diff;
  } catch (error) {
    logger.error({ error, cwd }, 'Failed to generate git diff');
    
    // Check if it's a git repository
    if (error instanceof Error && error.message.includes('not a git repository')) {
      return '';
    }
    
    throw error;
  }
}

/**
 * Preview if a patch can be applied cleanly
 */
export async function previewPatch(cwd: string, patch: string): Promise<boolean> {
  const tempFile = path.join(os.tmpdir(), `cursor-mobile-${Date.now()}.patch`);
  
  try {
    await fs.writeFile(tempFile, patch, 'utf-8');
    
    // Try dry-run apply
    await execGit(cwd, ['apply', '--check', tempFile]);
    
    logger.debug({ cwd }, 'Patch preview successful');
    return true;
  } catch (error) {
    logger.warn({ error, cwd }, 'Patch would not apply cleanly');
    return false;
  } finally {
    try {
      await fs.unlink(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Apply a patch to the working directory
 */
export async function applyPatch(cwd: string, patch: string): Promise<void> {
  const tempFile = path.join(os.tmpdir(), `cursor-mobile-${Date.now()}.patch`);
  
  try {
    await fs.writeFile(tempFile, patch, 'utf-8');
    
    // Apply the patch
    await execGit(cwd, ['apply', tempFile]);
    
    logger.info({ cwd }, 'Patch applied successfully');
  } catch (error) {
    logger.error({ error, cwd }, 'Failed to apply patch');
    throw new Error(`Failed to apply patch: ${error}`);
  } finally {
    try {
      await fs.unlink(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Execute a git command
 */
function execGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, { cwd, shell: true });
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    
    proc.on('error', reject);
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Git command failed with code ${code}`));
      }
    });
  });
}

// ===========================================
// Diff Parsing Functions
// ===========================================

/**
 * Parse unified diff format into structured data
 */
export function parseDiff(diffText: string): ParsedDiff {
  const files: FileDiff[] = [];
  let totalAdditions = 0;
  let totalDeletions = 0;
  
  if (!diffText || diffText.trim() === '') {
    return { files, totalAdditions, totalDeletions, totalFiles: 0 };
  }
  
  // Split by file diffs
  const fileDiffs = diffText.split(/^diff --git /m).filter(Boolean);
  
  for (const fileDiff of fileDiffs) {
    const parsed = parseFileDiff('diff --git ' + fileDiff);
    if (parsed) {
      files.push(parsed);
      totalAdditions += parsed.additions;
      totalDeletions += parsed.deletions;
    }
  }
  
  return {
    files,
    totalAdditions,
    totalDeletions,
    totalFiles: files.length
  };
}

/**
 * Parse a single file diff
 */
function parseFileDiff(text: string): FileDiff | null {
  const lines = text.split('\n');
  
  // Extract file paths from diff header
  const headerMatch = lines[0]?.match(/^diff --git a\/(.+) b\/(.+)$/);
  if (!headerMatch) return null;
  
  const oldPath = headerMatch[1];
  const newPath = headerMatch[2];
  
  // Determine status
  let status: FileDiff['status'] = 'modified';
  if (text.includes('new file mode')) {
    status = 'added';
  } else if (text.includes('deleted file mode')) {
    status = 'deleted';
  } else if (text.includes('rename from')) {
    status = 'renamed';
  }
  
  // Parse hunks
  const hunks: DiffHunk[] = [];
  let additions = 0;
  let deletions = 0;
  
  const hunkRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
  let currentHunk: DiffHunk | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    
    const hunkMatch = line.match(hunkRegex);
    if (hunkMatch) {
      // Start new hunk
      if (currentHunk) {
        hunks.push(currentHunk);
      }
      
      oldLineNum = parseInt(hunkMatch[1], 10);
      newLineNum = parseInt(hunkMatch[3], 10);
      
      currentHunk = {
        oldStart: oldLineNum,
        oldLines: parseInt(hunkMatch[2] || '1', 10),
        newStart: newLineNum,
        newLines: parseInt(hunkMatch[4] || '1', 10),
        lines: []
      };
      continue;
    }
    
    if (!currentHunk) continue;
    
    // Parse diff lines
    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentHunk.lines.push({
        type: 'add',
        content: line.substring(1),
        newLineNumber: newLineNum++
      });
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      currentHunk.lines.push({
        type: 'remove',
        content: line.substring(1),
        oldLineNumber: oldLineNum++
      });
      deletions++;
    } else if (line.startsWith(' ')) {
      currentHunk.lines.push({
        type: 'context',
        content: line.substring(1),
        oldLineNumber: oldLineNum++,
        newLineNumber: newLineNum++
      });
    }
  }
  
  // Push last hunk
  if (currentHunk) {
    hunks.push(currentHunk);
  }
  
  return {
    oldPath,
    newPath,
    status,
    hunks,
    additions,
    deletions
  };
}

/**
 * Get parsed diff for a project
 */
export async function getParsedDiff(cwd: string, paths?: string[]): Promise<ParsedDiff> {
  const rawDiff = await gitDiff(cwd, paths);
  return parseDiff(rawDiff);
}

/**
 * Get diff statistics
 */
export async function getDiffStats(cwd: string): Promise<{ additions: number; deletions: number; files: number }> {
  try {
    const output = await execGit(cwd, ['diff', '--stat', '--numstat']);
    
    let additions = 0;
    let deletions = 0;
    let files = 0;
    
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const match = line.match(/^(\d+)\t(\d+)\t/);
      if (match) {
        additions += parseInt(match[1], 10);
        deletions += parseInt(match[2], 10);
        files++;
      }
    }
    
    return { additions, deletions, files };
  } catch (error) {
    return { additions: 0, deletions: 0, files: 0 };
  }
}

