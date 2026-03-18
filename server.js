#!/usr/bin/env node
const express = require('express');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
}

function isGitRepo(dir) {
  try {
    git(['rev-parse', '--is-inside-work-tree'], dir);
    return true;
  } catch { return false; }
}

app.get('/api/validate-path', (req, res) => {
  const p = req.query.path;
  if (!p) return res.json({ valid: false, error: 'No path provided' });
  try {
    const resolved = path.resolve(p);
    if (!fs.existsSync(resolved)) return res.json({ valid: false, error: 'Path does not exist' });
    if (!fs.statSync(resolved).isDirectory()) return res.json({ valid: false, error: 'Not a directory' });
    if (!isGitRepo(resolved)) return res.json({ valid: false, error: 'Not a git repository' });
    return res.json({ valid: true, path: resolved });
  } catch (e) {
    return res.json({ valid: false, error: e.message });
  }
});

app.get('/api/branches', (req, res) => {
  const p = req.query.path;
  if (!p) return res.status(400).json({ error: 'No path' });
  try {
    const raw = git(['branch', '-a', '--no-color'], p);
    const branches = raw.split('\n')
      .map(b => b.replace(/^\*?\s+/, '').trim())
      .filter(b => b && !b.includes('->'))
      .map(b => b.replace(/^remotes\/origin\//, ''))
      .filter((b, i, arr) => arr.indexOf(b) === i)
      .sort();
    let current = '';
    try { current = git(['symbolic-ref', '--short', 'HEAD'], p).trim(); } catch {}
    res.json({ branches, current });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function parseGitAttributes(repoPath, branch) {
  const patterns = [];
  try {
    let content;
    try {
      content = git(['show', `${branch}:.gitattributes`], repoPath);
    } catch {
      const attrPath = path.join(repoPath, '.gitattributes');
      if (fs.existsSync(attrPath)) {
        content = fs.readFileSync(attrPath, 'utf-8');
      } else {
        return patterns;
      }
    }
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length < 2) continue;
      const pattern = parts[0];
      const attrs = parts.slice(1).join(' ');
      if (attrs.includes('linguist-generated') || attrs.includes('-diff') ||
          attrs.includes('diff=false') || attrs.includes('binary')) {
        patterns.push(pattern);
      }
    }
  } catch {}
  return patterns;
}

function matchGitPattern(filePath, pattern) {
  let regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*')
    .replace(/\?/g, '[^/]');
  if (!pattern.includes('/')) {
    return new RegExp(`(^|/)${regex}$`).test(filePath);
  }
  return new RegExp(`^${regex}$`).test(filePath) || new RegExp(`^${regex}(/|$)`).test(filePath);
}

function isGeneratedFile(filePath, patterns) {
  return patterns.some(p => matchGitPattern(filePath, p));
}

function parseDiff(rawDiff, generatedPatterns) {
  const files = [];
  const lines = rawDiff.split('\n');
  let i = 0;

  while (i < lines.length) {
    if (!lines[i].startsWith('diff --git')) { i++; continue; }

    const file = { path: '', oldPath: '', status: 'modified', hunks: [], binary: false, generated: false };
    const match = lines[i].match(/diff --git a\/(.+?) b\/(.+)/);
    if (match) { file.oldPath = match[1]; file.path = match[2]; }
    i++;

    while (i < lines.length && !lines[i].startsWith('diff --git') &&
           !lines[i].startsWith('---') && !lines[i].startsWith('@@') &&
           !lines[i].startsWith('Binary')) {
      if (lines[i].startsWith('new file')) file.status = 'added';
      else if (lines[i].startsWith('deleted file')) file.status = 'deleted';
      else if (lines[i].startsWith('rename from')) { file.status = 'renamed'; file.oldPath = lines[i].replace('rename from ', ''); }
      else if (lines[i].startsWith('rename to')) file.path = lines[i].replace('rename to ', '');
      else if (lines[i].startsWith('similarity index')) file.status = 'renamed';
      i++;
    }

    if (i < lines.length && lines[i].startsWith('Binary')) {
      file.binary = true;
      file.generated = isGeneratedFile(file.path, generatedPatterns);
      files.push(file);
      i++;
      continue;
    }

    if (i < lines.length && lines[i].startsWith('---')) i++;
    if (i < lines.length && lines[i].startsWith('+++')) i++;

    while (i < lines.length && !lines[i].startsWith('diff --git')) {
      if (lines[i].startsWith('@@')) {
        const hunkMatch = lines[i].match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/);
        if (hunkMatch) {
          const hunk = {
            oldStart: parseInt(hunkMatch[1]),
            oldCount: parseInt(hunkMatch[2] || '1'),
            newStart: parseInt(hunkMatch[3]),
            newCount: parseInt(hunkMatch[4] || '1'),
            header: hunkMatch[5] ? hunkMatch[5].trim() : '',
            lines: []
          };
          i++;
          while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('diff --git')) {
            const lc = lines[i];
            if (lc.startsWith('+')) hunk.lines.push({ type: 'add', content: lc.substring(1) });
            else if (lc.startsWith('-')) hunk.lines.push({ type: 'del', content: lc.substring(1) });
            else if (lc.startsWith('\\')) { /* no newline marker */ }
            else hunk.lines.push({ type: 'context', content: lc.length > 0 ? lc.substring(1) : '' });
            i++;
          }
          file.hunks.push(hunk);
        } else { i++; }
      } else { i++; }
    }

    file.generated = isGeneratedFile(file.path, generatedPatterns);
    files.push(file);
  }
  return files;
}

function resolveRef(ref, cwd) {
  try {
    git(['rev-parse', '--verify', ref], cwd);
    return ref;
  } catch {
    try {
      git(['rev-parse', '--verify', 'origin/' + ref], cwd);
      return 'origin/' + ref;
    } catch {
      return ref;
    }
  }
}

app.get('/api/diff', (req, res) => {
  const { path: repoPath, source, target } = req.query;
  if (!repoPath || !source || !target) return res.status(400).json({ error: 'Missing params' });
  try {
    const resolvedSource = resolveRef(source, repoPath);
    const resolvedTarget = resolveRef(target, repoPath);
    const generatedPatterns = parseGitAttributes(repoPath, resolvedTarget);
    let rawDiff;
    try {
      rawDiff = git(['diff', '--no-color', '-U5', `${resolvedTarget}...${resolvedSource}`], repoPath);
    } catch {
      rawDiff = git(['diff', '--no-color', '-U5', resolvedTarget, resolvedSource], repoPath);
    }
    const files = parseDiff(rawDiff, generatedPatterns);
    res.json({ files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/file-content', (req, res) => {
  const { path: repoPath, branch, file } = req.query;
  if (!repoPath || !branch || !file) return res.status(400).json({ error: 'Missing params' });
  try {
    const resolvedBranch = resolveRef(branch, repoPath);
    const content = git(['show', `${resolvedBranch}:${file}`], repoPath);
    const fileLines = content.split('\n');
    if (fileLines.length > 0 && fileLines[fileLines.length - 1] === '') fileLines.pop();
    res.json({ lines: fileLines, totalLines: fileLines.length });
  } catch (e) {
    res.json({ lines: [], totalLines: 0, error: e.message });
  }
});

const preferredPort = parseInt(process.argv.find((a, i) => process.argv[i-1] === '--port') || '3000');
const cliPath = process.argv.find((a, i) => process.argv[i-1] === '--path') || '';
const cliExportMode = process.argv.find((a, i) => process.argv[i-1] === '--export') || '';

let initialPath = cliPath;
if (!initialPath) {
  try {
    initialPath = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim();
  } catch {
    initialPath = '';
  }
}

app.get('/api/initial-path', (req, res) => {
  res.json({ path: initialPath, exportMode: cliExportMode || '' });
});

app.post('/api/submit', (req, res) => {
  const { markdown } = req.body;
  if (!markdown) return res.status(400).json({ error: 'No markdown provided' });
  res.json({ ok: true });
  process.stdout.write(markdown);
  setTimeout(() => process.exit(0), 100);
});

function startServer(port) {
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`\n  Arbiter running at: http://localhost:${port}\n`);
    if (initialPath) console.log(`  Pre-selected path: ${initialPath}\n`);
  }).on('error', (e) => {
    if (e.code === 'EADDRINUSE') startServer(port + 1);
    else { console.error('Failed to start server:', e.message); process.exit(1); }
  });
}

startServer(preferredPort);
