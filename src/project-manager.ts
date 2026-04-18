/**
 * Project Manager — enumerates projects by scanning direct child directories
 * of PROJECTS_ROOT, detects the current project from Cursor's window title,
 * and launches Cursor against a selected folder.
 *
 * Project source: direct child directories of PROJECTS_ROOT (defaults to
 * `<home>/Music`). Files are skipped. Hidden and Windows system folders are
 * skipped. No JSON list, no arbitrary filesystem browsing.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  path: string;
}

export interface ProjectListResult {
  projects: Project[];
  activeId: string | null;
}

export interface ProjectSwitchResult {
  ok: boolean;
  projectId?: string;
  projectName?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Load projects (directory scan only — no manually-maintained JSON list)
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * The scan root. `PROJECTS_ROOT` env var wins; otherwise fall back to the
 * user's Music folder. This is intentionally the only source of projects.
 */
function getProjectsRoot(): string {
  const envRoot = process.env.PROJECTS_ROOT;
  if (envRoot && envRoot.trim().length > 0) return path.resolve(envRoot.trim());
  return path.join(os.homedir(), 'Music');
}

// Hidden + Windows system / junk folders that must never surface as projects.
// Kept intentionally short: we don't want to hide real user folders.
const SKIP_FOLDERS = new Set([
  'node_modules', '$RECYCLE.BIN', 'System Volume Information',
  'Thumbs.db', 'desktop.ini',
]);

function isSkippable(name: string): boolean {
  if (name.startsWith('.') || name.startsWith('$')) return true;
  if (SKIP_FOLDERS.has(name)) return true;
  return false;
}

export function loadProjects(): Project[] {
  const root = getProjectsRoot();

  if (!fs.existsSync(root)) {
    console.error(`[ProjectManager] Projects root does not exist: ${root}`);
    return [];
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(root);
  } catch (err) {
    console.error(`[ProjectManager] stat(${root}) failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
  if (!stat.isDirectory()) {
    console.error(`[ProjectManager] Projects root is not a directory: ${root}`);
    return [];
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (err) {
    console.error(`[ProjectManager] readdir(${root}) failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }

  const projects: Project[] = [];
  for (const entry of entries) {
    // Only direct child directories. Files, symlinks-to-files, etc. are skipped.
    if (!entry.isDirectory()) continue;
    if (isSkippable(entry.name)) continue;

    projects.push({
      id: slugify(entry.name),
      name: entry.name,
      path: path.join(root, entry.name),
    });
  }

  projects.sort((a, b) => a.name.localeCompare(b.name));
  return projects;
}

export function reloadProjects(): Project[] {
  // Scan is stateless — nothing to reset. Kept for API parity with callers.
  return loadProjects();
}

export function findProject(id: string): Project | undefined {
  return loadProjects().find((p) => p.id === id);
}

/** Diagnostic: what root is actually being scanned. */
export function getScanRoot(): string {
  return getProjectsRoot();
}

// ---------------------------------------------------------------------------
// Detect active project from window title
// ---------------------------------------------------------------------------

/**
 * Match the Cursor window title against project paths.
 * Title format: "filename - foldername - Cursor" or "foldername - Cursor"
 */
export function detectActiveProject(windowTitle: string): string | null {
  if (!windowTitle) return null;
  const projects = loadProjects();
  const titleLower = windowTitle.toLowerCase();

  for (const p of projects) {
    const folderName = path.basename(p.path).toLowerCase();
    if (titleLower.includes(folderName)) {
      return p.id;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Resolve Cursor CLI
// ---------------------------------------------------------------------------

function findCursorCli(): string {
  const explicit = process.env.V2_CURSOR_CLI;
  if (explicit) return explicit;

  // cursor.cmd should be in PATH
  try {
    const which = execSync('where.exe cursor', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const lines = which.split('\n').map((l) => l.trim()).filter(Boolean);
    const cmd = lines.find((l) => l.endsWith('.cmd'));
    if (cmd) return cmd;
    if (lines[0]) return lines[0];
  } catch { /* fall through */ }

  // Fallback
  const fallback = path.join(
    process.env.LOCALAPPDATA ?? '',
    'Programs', 'cursor', 'resources', 'app', 'bin', 'cursor.cmd',
  );
  if (fs.existsSync(fallback)) return fallback;

  throw new Error('Cannot find Cursor CLI. Set V2_CURSOR_CLI in .env');
}

// ---------------------------------------------------------------------------
// Switch project
// ---------------------------------------------------------------------------

/**
 * Opens a project folder in Cursor in a new window (-n). We deliberately
 * avoid --reuse-window because reusing a window with unsaved edits pops a
 * blocking "save changes?" dialog that freezes the switch. The state
 * manager attaches to the new workbench target by title, so new windows
 * track cleanly.
 */
export function launchCursorWithFolder(projectPath: string): void {
  const cli = findCursorCli();
  const normalized = path.resolve(projectPath);

  if (!fs.existsSync(normalized)) {
    throw new Error(`Project path does not exist: ${normalized}`);
  }

  // Build a single quoted command string. With shell:true + args-array on
  // Windows, Node does not re-quote array entries, so paths with spaces
  // (e.g. "PIZZA BUENA", "cursor mobile") get split by cmd.exe and the
  // switch silently fails. Passing one pre-quoted string avoids that.
  const cmd = `"${cli}" -n "${normalized}"`;
  const child = spawn(cmd, {
    detached: true,
    stdio: 'ignore',
    shell: true,
    windowsHide: true,
  });
  child.unref();

  console.log(`[ProjectManager] Launched: ${cmd}`);
}
