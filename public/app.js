/* =========================================================
   Arbiter — Frontend
   All git-sourced content is escaped via escapeHtml() before
   innerHTML insertion to prevent XSS.
   ========================================================= */

const state = {
  basePath: '',
  branches: [],
  currentBranch: '',
  sourceBranch: '',
  targetBranch: 'main',
  files: [],
  comments: { diff: [], files: {} },
  selectionFileIdx: null,
  selectionStart: null,
  selectionEnd: null,
  fileCache: {},
};

// === Helpers ===
function storageKey() {
  return `arbiter:${state.basePath}:${state.sourceBranch}:${state.targetBranch}`;
}

function loadComments() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) state.comments = JSON.parse(raw);
    else state.comments = { diff: [], files: {} };
  } catch { state.comments = { diff: [], files: {} }; }
}

function saveComments() {
  localStorage.setItem(storageKey(), JSON.stringify(state.comments));
  if (typeof updateCommentNav === 'function') updateCommentNav();
}

function saveSession() {
  localStorage.setItem('arbiter:session', JSON.stringify({
    path: state.basePath,
    target: state.targetBranch,
    source: state.sourceBranch,
  }));
}

function getFileComments(filePath) {
  if (!state.comments.files[filePath]) {
    state.comments.files[filePath] = { file: [], inline: [] };
  }
  return state.comments.files[filePath];
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function langFromPath(p) {
  const ext = p.split('.').pop().toLowerCase();
  const map = {
    js:'javascript', jsx:'javascript', ts:'typescript', tsx:'typescript',
    py:'python', go:'go', rs:'rust', java:'java', c:'c', h:'c',
    cpp:'cpp', hpp:'cpp', cc:'cpp', rb:'ruby', php:'php',
    html:'html', htm:'html', css:'css', scss:'scss', less:'less',
    json:'json', yaml:'yaml', yml:'yaml', md:'markdown',
    sql:'sql', sh:'bash', bash:'bash', zsh:'bash',
    xml:'xml', toml:'toml', ini:'ini', makefile:'makefile',
    dockerfile:'dockerfile', tf:'hcl', proto:'protobuf',
  };
  return map[ext] || '';
}

function statusIcon(status) {
  const map = { added:'A', modified:'M', deleted:'D', renamed:'R' };
  return map[status] || '?';
}

async function api(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('API error: ' + res.status);
  return res.json();
}

// === DOM Builders (safe — no innerHTML with raw content) ===

function createEl(tag, attrs, children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'textContent') el.textContent = v;
      else el.setAttribute(k, v);
    }
  }
  if (children) {
    if (typeof children === 'string') el.textContent = children;
    else if (Array.isArray(children)) children.forEach(c => { if (c) el.appendChild(c); });
    else el.appendChild(children);
  }
  return el;
}

// === Auto-size inputs to content ===
const _sizer = document.createElement('span');
_sizer.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;pointer-events:none';
document.body.appendChild(_sizer);

function autoSizeInput(el) {
  const style = getComputedStyle(el);
  _sizer.style.font = style.font;
  _sizer.style.letterSpacing = style.letterSpacing;
  _sizer.style.padding = '0';
  const text = el.value || el.options?.[el.selectedIndex]?.text || el.placeholder || '';
  _sizer.textContent = text;
  const pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth) + 16;
  el.style.width = (_sizer.offsetWidth + pad) + 'px';
}

// === Sync layout to dynamic header height ===
function syncHeaderHeight() {
  const h = document.getElementById('header').offsetHeight;
  document.documentElement.style.setProperty('--header-height', h + 'px');
}
new ResizeObserver(syncHeaderHeight).observe(document.getElementById('header'));

// === Init ===
document.addEventListener('DOMContentLoaded', async () => {
  const pathInput = document.getElementById('base-path');
  const btnLoad = document.getElementById('btn-load');
  const targetSelect = document.getElementById('target-branch');
  const sourceSelect = document.getElementById('source-branch');

  try {
    const saved = JSON.parse(localStorage.getItem('arbiter:session') || '{}');
    const init = await api('/api/initial-path');
    const initialPath = saved.path || init.path;
    if (initialPath) {
      pathInput.value = initialPath;
      autoSizeInput(pathInput);
      state._savedTarget = saved.target || '';
      state._savedSource = saved.source || '';
      loadRepo();
    }
  } catch {}

  pathInput.addEventListener('input', () => autoSizeInput(pathInput));
  targetSelect.addEventListener('change', () => { autoSizeInput(targetSelect); state.targetBranch = targetSelect.value; saveSession(); loadDiff(); });
  sourceSelect.addEventListener('change', () => { autoSizeInput(sourceSelect); state.sourceBranch = sourceSelect.value; saveSession(); loadDiff(); });

  btnLoad.addEventListener('click', loadRepo);
  pathInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadRepo(); });

  document.getElementById('btn-diff-comment').addEventListener('click', showDiffCommentForm);

  let exportMode = 'clipboard';
  const exportLabel = document.getElementById('export-mode-label');
  const exportDropdown = document.getElementById('export-dropdown');

  document.getElementById('btn-export').addEventListener('click', () => exportComments(exportMode));
  document.getElementById('btn-export-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    exportDropdown.classList.toggle('hidden');
  });
  document.querySelectorAll('.split-btn-option').forEach(btn => {
    btn.addEventListener('click', () => {
      exportMode = btn.dataset.mode;
      exportLabel.textContent = exportMode === 'clipboard' ? 'Copy' : 'Save';
      exportDropdown.classList.add('hidden');
    });
  });
  document.addEventListener('click', () => exportDropdown.classList.add('hidden'));

  const mainContent = document.getElementById('main-content');
  mainContent.addEventListener('scroll', () => {
    updateActiveFile();
    updateCommentNavPosition();
    mainContent.classList.toggle('scrolled', mainContent.scrollTop > 16);
  });

  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
    const mc = document.getElementById('main-content');
    mc.style.left = sidebar.classList.contains('collapsed') ? '40px' : '';
  });

  // Sidebar drag resize
  const resizeHandle = document.getElementById('sidebar-resize');
  const sidebar = document.getElementById('sidebar');
  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    sidebar.style.transition = 'none';
    resizeHandle.classList.add('dragging');
    const onMove = (e) => {
      const width = Math.max(100, Math.min(600, e.clientX));
      sidebar.style.width = width + 'px';
      mainContent.style.left = width + 'px';
      document.documentElement.style.setProperty('--sidebar-width', width + 'px');
    };
    const onUp = () => {
      sidebar.style.transition = '';
      resizeHandle.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
});

async function loadRepo() {
  const pathInput = document.getElementById('base-path');
  const p = pathInput.value.trim();
  if (!p) return;

  const validation = await api('/api/validate-path?path=' + encodeURIComponent(p));
  if (!validation.valid) { alert(validation.error); return; }

  state.basePath = validation.path;
  pathInput.value = validation.path;

  const data = await api('/api/branches?path=' + encodeURIComponent(state.basePath));
  state.branches = data.branches;
  state.currentBranch = data.current;

  const targetSelect = document.getElementById('target-branch');
  const sourceSelect = document.getElementById('source-branch');

  targetSelect.textContent = '';
  sourceSelect.textContent = '';
  const savedTarget = state._savedTarget || '';
  const savedSource = state._savedSource || '';
  state._savedTarget = '';
  state._savedSource = '';

  state.branches.forEach(b => {
    const opt1 = document.createElement('option');
    opt1.value = b; opt1.textContent = b;
    if (savedTarget ? b === savedTarget : b === 'main') opt1.selected = true;
    targetSelect.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = b; opt2.textContent = b;
    if (savedSource ? b === savedSource : b === state.currentBranch) opt2.selected = true;
    sourceSelect.appendChild(opt2);
  });

  state.targetBranch = targetSelect.value;
  state.sourceBranch = sourceSelect.value;

  autoSizeInput(pathInput);
  autoSizeInput(targetSelect);
  autoSizeInput(sourceSelect);

  saveSession();

  await loadDiff();
}

async function loadDiff() {
  state.fileCache = {};
  loadComments();

  const data = await api('/api/diff?path=' + encodeURIComponent(state.basePath) + '&source=' + encodeURIComponent(state.sourceBranch) + '&target=' + encodeURIComponent(state.targetBranch));
  state.files = data.files;

  document.getElementById('file-count').textContent = state.files.length;
  renderFileTree();
  renderDiff();
  renderDiffComments();
  updateCommentNav();
}

// === File Tree ===
function renderFileTree() {
  const container = document.getElementById('file-tree');
  const root = {};
  state.files.forEach((f, idx) => {
    const parts = f.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) node[parts[i]] = {};
      node = node[parts[i]];
    }
    node['__file_' + parts[parts.length - 1]] = { idx, file: f };
  });

  container.textContent = '';
  buildTree(container, root, 0);
}

function buildTree(parent, node, depth) {
  const folders = [];
  const files = [];

  for (const key of Object.keys(node).sort()) {
    if (key.startsWith('__file_')) files.push({ name: key.replace('__file_', ''), data: node[key] });
    else folders.push({ name: key, children: node[key] });
  }

  for (const folder of folders) {
    const div = createEl('div', { className: 'tree-folder' });
    const header = createEl('div', { className: 'tree-folder-header', style: { paddingLeft: (depth * 2 + 8) + 'px' } });
    const arrow = createEl('span', { className: 'arrow', textContent: '\u25BC' });
    const name = createEl('span', { textContent: folder.name + '/' });
    header.appendChild(arrow);
    header.appendChild(name);
    div.appendChild(header);

    const childrenDiv = createEl('div', { className: 'tree-folder-children' });
    buildTree(childrenDiv, folder.children, depth + 1);
    div.appendChild(childrenDiv);

    header.addEventListener('click', () => {
      childrenDiv.classList.toggle('hidden');
      arrow.classList.toggle('collapsed');
    });

    parent.appendChild(div);
  }

  for (const file of files) {
    const f = file.data.file;
    const commentCount = countFileComments(f.path);
    const link = createEl('a', {
      className: 'tree-file' + (f.generated ? ' generated' : ''),
      'data-file-idx': file.data.idx,
      'data-file-path': f.path,
      style: { paddingLeft: (depth * 2 + 20) + 'px' }
    });

    const icon = createEl('span', { className: 'file-status-icon ' + f.status, textContent: statusIcon(f.status) });
    const nameSpan = createEl('span', { style: { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis' }, textContent: file.name });
    link.appendChild(icon);
    link.appendChild(nameSpan);

    if (commentCount > 0) {
      link.appendChild(createEl('span', { className: 'badge-comment', textContent: commentCount }));
    }

    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById('file-' + file.data.idx);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    parent.appendChild(link);
  }
}

function countFileComments(filePath) {
  const fc = state.comments.files[filePath];
  if (!fc) return 0;
  return (fc.file ? fc.file.length : 0) + (fc.inline ? fc.inline.length : 0);
}

function updateActiveFile() {
  const main = document.getElementById('main-content');
  const scrollTop = main.scrollTop + 60;
  let activeIdx = null;

  document.querySelectorAll('.diff-file').forEach(el => {
    if (el.offsetTop <= scrollTop) activeIdx = el.id.replace('file-', '');
  });

  document.querySelectorAll('.tree-file').forEach(el => {
    el.classList.toggle('active', el.dataset.fileIdx === activeIdx);
  });
}

// === Diff Rendering ===
function renderDiff() {
  const container = document.getElementById('diff-container');
  container.textContent = '';

  if (state.files.length === 0) {
    container.appendChild(createEl('div', { className: 'empty-state', textContent: 'No changes between these branches.' }));
    return;
  }

  state.files.forEach((f, idx) => container.appendChild(buildFileBox(f, idx)));
}

function buildFileBox(file, idx) {
  const lang = langFromPath(file.path);
  const box = createEl('div', { className: 'diff-file', id: 'file-' + idx });

  // Header
  const header = createEl('div', { className: 'file-header' });

  const toggle = createEl('span', { className: 'file-collapse-toggle', textContent: '\u25BC' });
  header.appendChild(toggle);

  const pathSpan = createEl('span', { className: 'file-path' });
  if (file.status === 'renamed' && file.oldPath !== file.path) {
    const oldSpan = createEl('span', { className: 'old-path', textContent: file.oldPath });
    pathSpan.appendChild(oldSpan);
    pathSpan.appendChild(document.createTextNode(' \u2192 '));
  }
  pathSpan.appendChild(document.createTextNode(file.path));
  header.appendChild(pathSpan);
  header.appendChild(createEl('span', { className: 'file-status-badge ' + file.status, textContent: file.status }));

  const commentBtn = createEl('button', { className: 'btn btn-small btn-secondary', textContent: 'Comment' });
  commentBtn.addEventListener('click', (e) => { e.stopPropagation(); showFileCommentForm(idx, file.path); });
  header.appendChild(commentBtn);
  box.appendChild(header);

  // Detect when header becomes sticky (pinned)
  const sentinel = createEl('div', { className: 'sticky-sentinel' });
  box.insertBefore(sentinel, header);
  const observer = new IntersectionObserver(([e]) => {
    box.classList.toggle('pinned', e.intersectionRatio === 0);
  }, { root: document.getElementById('main-content'), threshold: 0 });
  observer.observe(sentinel);

  // Collapsible body
  const body = createEl('div', { className: 'diff-file-body' });

  // File comments area
  const fileCommentsDiv = createEl('div', { className: 'file-comments', id: 'file-comments-' + idx });
  renderFileCommentBlocks(fileCommentsDiv, file.path);
  body.appendChild(fileCommentsDiv);

  // Diff content
  if (file.generated) {
    body.appendChild(createEl('div', { className: 'generated-notice', textContent: 'Generated file \u2014 content hidden' }));
  } else if (file.binary) {
    body.appendChild(createEl('div', { className: 'binary-notice', textContent: 'Binary file changed' }));
  } else {
    const outer = createEl('div', { className: 'diff-table-outer' });
    const wrapper = createEl('div', { className: 'diff-table-wrapper' });
    const table = buildDiffTable(file, idx, lang);
    wrapper.appendChild(table);
    outer.appendChild(wrapper);

    // Sticky scrollbar at bottom
    const scrollbar = createEl('div', { className: 'diff-sticky-scrollbar' });
    const scrollInner = createEl('div', { className: 'diff-sticky-scrollbar-inner' });
    scrollbar.appendChild(scrollInner);
    outer.appendChild(scrollbar);

    // Sync widths and scroll positions
    const syncWidth = () => {
      scrollInner.style.width = wrapper.scrollWidth + 'px';
    };
    let syncing = false;
    scrollbar.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      wrapper.scrollLeft = scrollbar.scrollLeft;
      syncing = false;
    });
    wrapper.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      scrollbar.scrollLeft = wrapper.scrollLeft;
      syncing = false;
    });
    // Set initial width after render
    requestAnimationFrame(syncWidth);
    new ResizeObserver(syncWidth).observe(wrapper);

    body.appendChild(outer);
  }

  box.appendChild(body);

  // Toggle collapse
  header.addEventListener('click', () => {
    body.classList.toggle('collapsed');
    toggle.classList.toggle('collapsed');
  });

  return box;
}

function buildDiffTable(file, fileIdx, lang) {
  const langClass = lang ? 'language-' + lang : '';
  const table = createEl('table', { className: 'diff-table' });

  for (let hunkIdx = 0; hunkIdx < file.hunks.length; hunkIdx++) {
    const hunk = file.hunks[hunkIdx];
    const prevHunk = hunkIdx > 0 ? file.hunks[hunkIdx - 1] : null;

    // Expand gap button
    const gapStart = prevHunk ? getHunkEndLines(prevHunk) : { old: 1, new: 1 };
    const gapEnd = { old: hunk.oldStart, new: hunk.newStart };
    if (gapEnd.old > gapStart.old || gapEnd.new > gapStart.new) {
      table.appendChild(buildExpandRow(fileIdx, 'gap', {
        gapOldStart: gapStart.old, gapOldEnd: gapEnd.old,
        gapNewStart: gapStart.new, gapNewEnd: gapEnd.new
      }));
    }

    // Hunk separator
    const sepRow = createEl('tr', { className: 'hunk-separator' });
    sepRow.appendChild(createEl('td', { colspan: '3', textContent: '@@ -' + hunk.oldStart + ',' + hunk.oldCount + ' +' + hunk.newStart + ',' + hunk.newCount + ' @@ ' + hunk.header }));
    table.appendChild(sepRow);

    // Lines
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;

    for (const line of hunk.lines) {
      let oldNum = '', newNum = '';
      let lineClass = 'context';

      if (line.type === 'del') { oldNum = oldLine; lineClass = 'deletion'; oldLine++; }
      else if (line.type === 'add') { newNum = newLine; lineClass = 'addition'; newLine++; }
      else { oldNum = oldLine; newNum = newLine; oldLine++; newLine++; }

      const row = createEl('tr', {
        className: 'diff-line ' + lineClass,
        'data-file-idx': fileIdx,
        'data-old-line': oldNum,
        'data-new-line': newNum,
        'data-line-type': line.type
      });

      const oldTd = createEl('td', { className: 'line-num old', 'data-line': oldNum, textContent: oldNum });
      const newTd = createEl('td', { className: 'line-num new', 'data-line': newNum, textContent: newNum });
      oldTd.addEventListener('click', handleLineClick);
      newTd.addEventListener('click', handleLineClick);

      const contentTd = createEl('td', { className: 'line-content' });
      const code = createEl('code', { className: langClass, textContent: line.content });
      contentTd.appendChild(code);

      row.appendChild(oldTd);
      row.appendChild(newTd);
      row.appendChild(contentTd);
      table.appendChild(row);

      // Highlight
      if (langClass) hljs.highlightElement(code);

      // Inline comments at this position
      const inlineComments = getInlineCommentsAtLine(file.path, oldNum, newNum);
      for (const comment of inlineComments) {
        table.appendChild(buildInlineCommentRow(comment, fileIdx, file.path));
      }
    }
  }

  // Expand-down after last hunk
  if (file.hunks.length > 0) {
    const lastHunk = file.hunks[file.hunks.length - 1];
    const lastLines = getHunkEndLines(lastHunk);
    table.appendChild(buildExpandRow(fileIdx, 'down', { oldStart: lastLines.old, newStart: lastLines.new }));
  }

  return table;
}

function buildExpandRow(fileIdx, direction, data) {
  const row = createEl('tr', { className: 'expand-row' });
  const td = createEl('td', { colspan: '3' });
  const label = direction === 'gap' ? '\u2195 Show hidden lines' : '\u25BC Show more lines below';
  const btn = createEl('button', { className: 'expand-btn', textContent: label });
  btn.dataset.fileIdx = fileIdx;
  btn.dataset.direction = direction;
  for (const [k, v] of Object.entries(data)) btn.dataset[k] = v;
  btn.addEventListener('click', handleExpand);
  td.appendChild(btn);
  row.appendChild(td);
  return row;
}

function getHunkEndLines(hunk) {
  let oldLine = hunk.oldStart;
  let newLine = hunk.newStart;
  for (const line of hunk.lines) {
    if (line.type === 'del') oldLine++;
    else if (line.type === 'add') newLine++;
    else { oldLine++; newLine++; }
  }
  return { old: oldLine, new: newLine };
}

function getInlineCommentsAtLine(filePath, oldNum, newNum) {
  const fc = state.comments.files[filePath];
  if (!fc || !fc.inline) return [];
  return fc.inline.filter(c => c.endOld == oldNum || c.endNew == newNum);
}

function buildInlineCommentRow(comment, fileIdx, filePath) {
  const row = createEl('tr', { className: 'comment-block-row' });
  const td = createEl('td', { colspan: '3' });
  const block = createEl('div', { className: 'comment-block' });
  block.dataset.commentId = comment.id;

  const meta = createEl('div', { className: 'comment-meta' });
  const toggle = createEl('span', { className: 'comment-collapse-toggle', textContent: '\u25BC' });
  meta.appendChild(toggle);
  meta.appendChild(createEl('span', { textContent: 'Lines ' + (comment.startOld || comment.startNew) + '\u2013' + (comment.endOld || comment.endNew) }));
  meta.appendChild(createEl('span', { textContent: new Date(comment.timestamp).toLocaleString() }));
  block.appendChild(meta);

  const body = createEl('div', { className: 'comment-body' });
  body.appendChild(createEl('div', { className: 'comment-text', textContent: comment.text }));

  const actions = createEl('div', { className: 'comment-actions' });
  const editBtn = createEl('button', { className: 'btn btn-small btn-secondary', textContent: 'Edit' });
  editBtn.addEventListener('click', () => editInlineComment(filePath, comment.id));
  const delBtn = createEl('button', { className: 'btn btn-small btn-danger', textContent: 'Delete' });
  delBtn.addEventListener('click', () => deleteInlineComment(filePath, comment.id));
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);
  body.appendChild(actions);
  block.appendChild(body);

  meta.style.cursor = 'pointer';
  meta.addEventListener('click', () => {
    body.classList.toggle('collapsed');
    toggle.classList.toggle('collapsed');
  });

  td.appendChild(block);
  row.appendChild(td);
  return row;
}

// === Line Selection ===
function handleLineClick(e) {
  const td = e.currentTarget;
  const lineNum = parseInt(td.dataset.line);
  if (!lineNum) return;

  const row = td.closest('tr');
  const fileIdx = parseInt(row.dataset.fileIdx);
  const oldLine = parseInt(row.dataset.oldLine) || null;
  const newLine = parseInt(row.dataset.newLine) || null;

  if (e.shiftKey && state.selectionFileIdx === fileIdx && state.selectionStart !== null) {
    state.selectionEnd = { oldLine, newLine, row };
    highlightSelection();
    showCommentPopover(e);
  } else {
    clearSelection();
    state.selectionFileIdx = fileIdx;
    state.selectionStart = { oldLine, newLine, row };
    state.selectionEnd = { oldLine, newLine, row };
    highlightSelection();
    showCommentPopover(e);
  }
}

function clearSelection() {
  document.querySelectorAll('.line-num.selected').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.diff-line.selected-line').forEach(el => el.classList.remove('selected-line'));
  document.getElementById('comment-popover').classList.add('hidden');
  state.selectionStart = null;
  state.selectionEnd = null;
  state.selectionFileIdx = null;
}

function highlightSelection() {
  document.querySelectorAll('.line-num.selected').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.diff-line.selected-line').forEach(el => el.classList.remove('selected-line'));

  if (!state.selectionStart || !state.selectionEnd) return;

  const fileEl = document.getElementById('file-' + state.selectionFileIdx);
  if (!fileEl) return;

  const rows = Array.from(fileEl.querySelectorAll('.diff-line'));
  const startIdx = rows.indexOf(state.selectionStart.row);
  const endIdx = rows.indexOf(state.selectionEnd.row);
  const min = Math.min(startIdx, endIdx);
  const max = Math.max(startIdx, endIdx);

  for (let i = min; i <= max; i++) {
    rows[i].classList.add('selected-line');
    rows[i].querySelectorAll('.line-num').forEach(td => td.classList.add('selected'));
  }
}

function showCommentPopover(e) {
  const popover = document.getElementById('comment-popover');
  const btn = document.getElementById('btn-add-comment');

  popover.classList.remove('hidden');
  popover.style.top = (e.clientY - 10) + 'px';
  popover.style.left = (e.clientX + 20) + 'px';

  btn.onclick = () => {
    popover.classList.add('hidden');
    insertInlineCommentForm();
  };
}

function insertInlineCommentForm() {
  if (!state.selectionStart || !state.selectionEnd) return;

  const fileIdx = state.selectionFileIdx;
  const fileEl = document.getElementById('file-' + fileIdx);
  const rows = Array.from(fileEl.querySelectorAll('.diff-line'));
  const startIdx = rows.indexOf(state.selectionStart.row);
  const endIdx = rows.indexOf(state.selectionEnd.row);
  const lastRow = rows[Math.max(startIdx, endIdx)];
  const firstRow = rows[Math.min(startIdx, endIdx)];

  const startOld = parseInt(firstRow.dataset.oldLine) || null;
  const startNew = parseInt(firstRow.dataset.newLine) || null;
  const endOld = parseInt(lastRow.dataset.oldLine) || null;
  const endNew = parseInt(lastRow.dataset.newLine) || null;

  document.querySelectorAll('.comment-form-row.temp').forEach(el => el.remove());

  const formRow = createEl('tr', { className: 'comment-form-row temp' });
  const td = createEl('td', { colspan: '3' });
  const formDiv = createEl('div', { className: 'comment-form' });
  const textarea = createEl('textarea', { placeholder: 'Add your review comment...' });
  const actionsDiv = createEl('div', { className: 'comment-form-actions' });

  const cancelBtn = createEl('button', { className: 'btn btn-small btn-secondary', textContent: 'Cancel' });
  cancelBtn.addEventListener('click', () => { formRow.remove(); clearSelection(); });

  const saveBtn = createEl('button', { className: 'btn btn-small btn-primary', textContent: 'Save' });
  saveBtn.addEventListener('click', () => {
    const text = textarea.value.trim();
    if (!text) return;
    const filePath = state.files[fileIdx].path;
    const fc = getFileComments(filePath);
    fc.inline.push({ id: genId(), startOld, startNew, endOld, endNew, text, timestamp: Date.now() });
    saveComments();
    formRow.remove();
    clearSelection();
    renderDiff();
    renderFileTree();
  });

  actionsDiv.appendChild(cancelBtn);
  actionsDiv.appendChild(saveBtn);
  formDiv.appendChild(textarea);
  formDiv.appendChild(actionsDiv);
  td.appendChild(formDiv);
  formRow.appendChild(td);

  lastRow.after(formRow);
  textarea.focus();
}

// === File-Level Comments ===
function showFileCommentForm(fileIdx, filePath) {
  const area = document.getElementById('file-comments-' + fileIdx);
  if (area.querySelector('.comment-form')) return;

  const formDiv = createEl('div', { className: 'comment-form' });
  const textarea = createEl('textarea', { placeholder: 'Comment on this file...' });
  const actionsDiv = createEl('div', { className: 'comment-form-actions' });

  const cancelBtn = createEl('button', { className: 'btn btn-small btn-secondary', textContent: 'Cancel' });
  cancelBtn.addEventListener('click', () => formDiv.remove());

  const saveBtn = createEl('button', { className: 'btn btn-small btn-primary', textContent: 'Save' });
  saveBtn.addEventListener('click', () => {
    const text = textarea.value.trim();
    if (!text) return;
    const fc = getFileComments(filePath);
    fc.file.push({ id: genId(), text, timestamp: Date.now() });
    saveComments();
    formDiv.remove();
    renderFileCommentBlocks(area, filePath);
    renderFileTree();
  });

  actionsDiv.appendChild(cancelBtn);
  actionsDiv.appendChild(saveBtn);
  formDiv.appendChild(textarea);
  formDiv.appendChild(actionsDiv);
  area.appendChild(formDiv);
  textarea.focus();
}

function renderFileCommentBlocks(container, filePath) {
  // Clear only comment blocks, not forms
  container.querySelectorAll('.comment-block').forEach(el => el.remove());

  const fc = state.comments.files[filePath];
  if (!fc || !fc.file) return;

  for (const c of fc.file) {
    const block = createEl('div', { className: 'comment-block' });
    block.dataset.commentId = c.id;

    const meta = createEl('div', { className: 'comment-meta' });
    const toggle = createEl('span', { className: 'comment-collapse-toggle', textContent: '\u25BC' });
    meta.appendChild(toggle);
    meta.appendChild(createEl('span', { textContent: 'File comment' }));
    meta.appendChild(createEl('span', { textContent: new Date(c.timestamp).toLocaleString() }));
    block.appendChild(meta);

    const body = createEl('div', { className: 'comment-body' });
    body.appendChild(createEl('div', { className: 'comment-text', textContent: c.text }));

    const actions = createEl('div', { className: 'comment-actions' });
    const editBtn = createEl('button', { className: 'btn btn-small btn-secondary', textContent: 'Edit' });
    editBtn.addEventListener('click', () => editFileComment(filePath, c.id));
    const delBtn = createEl('button', { className: 'btn btn-small btn-danger', textContent: 'Delete' });
    delBtn.addEventListener('click', () => deleteFileComment(filePath, c.id));
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    body.appendChild(actions);
    block.appendChild(body);

    meta.style.cursor = 'pointer';
    meta.addEventListener('click', () => {
      body.classList.toggle('collapsed');
      toggle.classList.toggle('collapsed');
    });

    container.appendChild(block);
  }
}

// === Diff-Level Comments ===
function showDiffCommentForm() {
  const area = document.getElementById('diff-comment-area');
  if (area.querySelector('.comment-form')) return;

  const formDiv = createEl('div', { className: 'comment-form', style: { marginBottom: '16px' } });
  const textarea = createEl('textarea', { placeholder: 'Overall comment on this diff...' });
  const actionsDiv = createEl('div', { className: 'comment-form-actions' });

  const cancelBtn = createEl('button', { className: 'btn btn-small btn-secondary', textContent: 'Cancel' });
  cancelBtn.addEventListener('click', () => formDiv.remove());

  const saveBtn = createEl('button', { className: 'btn btn-small btn-primary', textContent: 'Save' });
  saveBtn.addEventListener('click', () => {
    const text = textarea.value.trim();
    if (!text) return;
    state.comments.diff.push({ id: genId(), text, timestamp: Date.now() });
    saveComments();
    formDiv.remove();
    renderDiffComments();
  });

  actionsDiv.appendChild(cancelBtn);
  actionsDiv.appendChild(saveBtn);
  formDiv.appendChild(textarea);
  formDiv.appendChild(actionsDiv);
  area.appendChild(formDiv);
  textarea.focus();
}

function renderDiffComments() {
  const area = document.getElementById('diff-comment-area');
  area.textContent = '';

  if (!state.comments.diff || state.comments.diff.length === 0) return;

  const wrapper = createEl('div', { className: 'diff-comment-area' });
  for (const c of state.comments.diff) {
    const block = createEl('div', { className: 'comment-block', style: { marginBottom: '8px' } });
    block.dataset.commentId = c.id;

    const meta = createEl('div', { className: 'comment-meta' });
    const toggle = createEl('span', { className: 'comment-collapse-toggle', textContent: '\u25BC' });
    meta.appendChild(toggle);
    meta.appendChild(createEl('span', { textContent: 'Overall comment' }));
    meta.appendChild(createEl('span', { textContent: new Date(c.timestamp).toLocaleString() }));
    block.appendChild(meta);

    const body = createEl('div', { className: 'comment-body' });
    body.appendChild(createEl('div', { className: 'comment-text', textContent: c.text }));

    const actions = createEl('div', { className: 'comment-actions' });
    const editBtn = createEl('button', { className: 'btn btn-small btn-secondary', textContent: 'Edit' });
    editBtn.addEventListener('click', () => editDiffComment(c.id));
    const delBtn = createEl('button', { className: 'btn btn-small btn-danger', textContent: 'Delete' });
    delBtn.addEventListener('click', () => deleteDiffComment(c.id));
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    body.appendChild(actions);
    block.appendChild(body);

    meta.style.cursor = 'pointer';
    meta.addEventListener('click', () => {
      body.classList.toggle('collapsed');
      toggle.classList.toggle('collapsed');
    });

    wrapper.appendChild(block);
  }
  area.appendChild(wrapper);
}

// === Comment CRUD ===
function editInlineComment(filePath, commentId) {
  const fc = getFileComments(filePath);
  const comment = fc.inline.find(c => c.id === commentId);
  if (!comment) return;
  const block = document.querySelector('[data-comment-id="' + commentId + '"]');
  const textEl = block.querySelector('.comment-text');
  const oldText = comment.text;

  textEl.textContent = '';
  const textarea = createEl('textarea', { style: { width: '100%', minHeight: '60px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px', padding: '8px', fontFamily: 'var(--font-sans)', fontSize: '13px' } });
  textarea.value = oldText;
  textEl.appendChild(textarea);

  const btns = createEl('div', { style: { display: 'flex', gap: '6px', marginTop: '6px', justifyContent: 'flex-end' } });
  const cancelBtn = createEl('button', { className: 'btn btn-small btn-secondary', textContent: 'Cancel' });
  cancelBtn.addEventListener('click', () => { textEl.textContent = oldText; });
  const saveBtn = createEl('button', { className: 'btn btn-small btn-primary', textContent: 'Save' });
  saveBtn.addEventListener('click', () => {
    const newText = textarea.value.trim();
    if (!newText) return;
    comment.text = newText;
    saveComments();
    renderDiff();
    renderFileTree();
  });
  btns.appendChild(cancelBtn);
  btns.appendChild(saveBtn);
  textEl.appendChild(btns);
}

function deleteInlineComment(filePath, commentId) {
  const fc = getFileComments(filePath);
  fc.inline = fc.inline.filter(c => c.id !== commentId);
  saveComments();
  renderDiff();
  renderFileTree();
}

function editFileComment(filePath, commentId) {
  const fc = getFileComments(filePath);
  const comment = fc.file.find(c => c.id === commentId);
  if (!comment) return;
  const block = document.querySelector('[data-comment-id="' + commentId + '"]');
  const textEl = block.querySelector('.comment-text');
  const oldText = comment.text;

  textEl.textContent = '';
  const textarea = createEl('textarea', { style: { width: '100%', minHeight: '60px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px', padding: '8px', fontFamily: 'var(--font-sans)', fontSize: '13px' } });
  textarea.value = oldText;
  textEl.appendChild(textarea);

  const btns = createEl('div', { style: { display: 'flex', gap: '6px', marginTop: '6px', justifyContent: 'flex-end' } });
  const cancelBtn = createEl('button', { className: 'btn btn-small btn-secondary', textContent: 'Cancel' });
  cancelBtn.addEventListener('click', () => { textEl.textContent = oldText; });
  const saveBtn = createEl('button', { className: 'btn btn-small btn-primary', textContent: 'Save' });
  saveBtn.addEventListener('click', () => {
    comment.text = textarea.value.trim();
    saveComments();
    const fileIdx = state.files.findIndex(f => f.path === filePath);
    if (fileIdx >= 0) {
      const area = document.getElementById('file-comments-' + fileIdx);
      renderFileCommentBlocks(area, filePath);
    }
  });
  btns.appendChild(cancelBtn);
  btns.appendChild(saveBtn);
  textEl.appendChild(btns);
}

function deleteFileComment(filePath, commentId) {
  const fc = getFileComments(filePath);
  fc.file = fc.file.filter(c => c.id !== commentId);
  saveComments();
  const fileIdx = state.files.findIndex(f => f.path === filePath);
  if (fileIdx >= 0) {
    const area = document.getElementById('file-comments-' + fileIdx);
    renderFileCommentBlocks(area, filePath);
  }
  renderFileTree();
}

function editDiffComment(commentId) {
  const comment = state.comments.diff.find(c => c.id === commentId);
  if (!comment) return;
  const block = document.querySelector('[data-comment-id="' + commentId + '"]');
  const textEl = block.querySelector('.comment-text');
  const oldText = comment.text;

  textEl.textContent = '';
  const textarea = createEl('textarea', { style: { width: '100%', minHeight: '60px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px', padding: '8px', fontFamily: 'var(--font-sans)', fontSize: '13px' } });
  textarea.value = oldText;
  textEl.appendChild(textarea);

  const btns = createEl('div', { style: { display: 'flex', gap: '6px', marginTop: '6px', justifyContent: 'flex-end' } });
  const cancelBtn = createEl('button', { className: 'btn btn-small btn-secondary', textContent: 'Cancel' });
  cancelBtn.addEventListener('click', () => { textEl.textContent = oldText; });
  const saveBtn = createEl('button', { className: 'btn btn-small btn-primary', textContent: 'Save' });
  saveBtn.addEventListener('click', () => {
    comment.text = textarea.value.trim();
    saveComments();
    renderDiffComments();
  });
  btns.appendChild(cancelBtn);
  btns.appendChild(saveBtn);
  textEl.appendChild(btns);
}

function deleteDiffComment(commentId) {
  state.comments.diff = state.comments.diff.filter(c => c.id !== commentId);
  saveComments();
  renderDiffComments();
}

// === Expand Lines ===
async function handleExpand(e) {
  const btn = e.currentTarget;
  const fileIdx = parseInt(btn.dataset.fileIdx);
  const file = state.files[fileIdx];
  const filePath = file.path;

  if (!state.fileCache[filePath]) {
    try {
      const [srcData, tgtData] = await Promise.all([
        api('/api/file-content?path=' + encodeURIComponent(state.basePath) + '&branch=' + encodeURIComponent(state.sourceBranch) + '&file=' + encodeURIComponent(filePath)),
        api('/api/file-content?path=' + encodeURIComponent(state.basePath) + '&branch=' + encodeURIComponent(state.targetBranch) + '&file=' + encodeURIComponent(filePath))
      ]);
      state.fileCache[filePath] = { source: srcData.lines, target: tgtData.lines };
    } catch { return; }
  }

  const cache = state.fileCache[filePath];
  const lang = langFromPath(filePath);
  const langClass = lang ? 'language-' + lang : '';
  const table = btn.closest('table');
  const expandRow = btn.closest('tr');

  if (btn.dataset.direction === 'gap') {
    const gapOldStart = parseInt(btn.dataset.gapOldStart);
    const gapOldEnd = parseInt(btn.dataset.gapOldEnd);
    const gapNewStart = parseInt(btn.dataset.gapNewStart);
    const gapNewEnd = parseInt(btn.dataset.gapNewEnd);
    const totalGap = gapOldEnd - gapOldStart;
    const linesToShow = Math.min(totalGap, 100);

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < linesToShow; i++) {
      const oldNum = gapOldStart + i;
      const newNum = gapNewStart + i;
      const content = (cache.source[newNum - 1] !== undefined ? cache.source[newNum - 1] : cache.target[oldNum - 1]) || '';

      const row = createEl('tr', {
        className: 'diff-line context',
        'data-file-idx': fileIdx, 'data-old-line': oldNum, 'data-new-line': newNum, 'data-line-type': 'context'
      });
      const oldTd = createEl('td', { className: 'line-num old', 'data-line': oldNum, textContent: oldNum });
      const newTd = createEl('td', { className: 'line-num new', 'data-line': newNum, textContent: newNum });
      oldTd.addEventListener('click', handleLineClick);
      newTd.addEventListener('click', handleLineClick);
      const contentTd = createEl('td', { className: 'line-content' });
      const code = createEl('code', { className: langClass, textContent: content });
      if (langClass) hljs.highlightElement(code);
      contentTd.appendChild(code);
      row.appendChild(oldTd);
      row.appendChild(newTd);
      row.appendChild(contentTd);
      fragment.appendChild(row);
    }

    if (linesToShow < totalGap) {
      btn.dataset.gapOldStart = gapOldStart + linesToShow;
      btn.dataset.gapNewStart = gapNewStart + linesToShow;
      expandRow.before(fragment);
    } else {
      expandRow.before(fragment);
      expandRow.remove();
    }
  } else {
    const oldStart = parseInt(btn.dataset.oldStart);
    const newStart = parseInt(btn.dataset.newStart);
    const sourceLines = cache.source;
    const linesToShow = Math.min(100, sourceLines.length - newStart + 1);

    if (linesToShow <= 0) { expandRow.remove(); return; }

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < linesToShow; i++) {
      const oldNum = oldStart + i;
      const newNum = newStart + i;
      const content = sourceLines[newNum - 1] || '';

      const row = createEl('tr', {
        className: 'diff-line context',
        'data-file-idx': fileIdx, 'data-old-line': oldNum, 'data-new-line': newNum, 'data-line-type': 'context'
      });
      const oldTd = createEl('td', { className: 'line-num old', 'data-line': oldNum, textContent: oldNum });
      const newTd = createEl('td', { className: 'line-num new', 'data-line': newNum, textContent: newNum });
      oldTd.addEventListener('click', handleLineClick);
      newTd.addEventListener('click', handleLineClick);
      const contentTd = createEl('td', { className: 'line-content' });
      const code = createEl('code', { className: langClass, textContent: content });
      if (langClass) hljs.highlightElement(code);
      contentTd.appendChild(code);
      row.appendChild(oldTd);
      row.appendChild(newTd);
      row.appendChild(contentTd);
      fragment.appendChild(row);
    }

    const remaining = sourceLines.length - (newStart + linesToShow) + 1;
    if (remaining > 0) {
      btn.dataset.oldStart = oldStart + linesToShow;
      btn.dataset.newStart = newStart + linesToShow;
      expandRow.before(fragment);
    } else {
      expandRow.before(fragment);
      expandRow.remove();
    }
  }
}

// === Export Comments ===
function exportComments(mode) {
  const lines = [];
  lines.push('# Code Review: Apply Requested Changes\n');
  lines.push('You are reviewing a diff of `' + state.sourceBranch + '` compared to `' + state.targetBranch + '` in `' + state.basePath + '`.\n');
  lines.push('Below are review comments left by the reviewer. Follow this process:\n');
  lines.push('1. **Read all comments first** before making any changes.');
  lines.push('2. **Identify duplicates and overarching themes** \u2014 where multiple comments point to the same underlying issue or could be solved by a single refactor, group them and solve them with one unified change. Prefer simplicity: one common solution that addresses multiple comments is better than N individual fixes.');
  lines.push('3. **Resolve broad/architectural comments first** \u2014 these may affect how you approach the specific comments.');
  lines.push('4. **Then fix all remaining specific comments**, applying each requested change precisely.');
  lines.push('5. **Verify** that no comment was missed and that fixes don\'t conflict with each other.\n');
  lines.push('---\n');

  if (state.comments.diff && state.comments.diff.length > 0) {
    lines.push('## Overall Comments\n');
    for (const c of state.comments.diff) {
      lines.push('> ' + c.text + '\n');
    }
    lines.push('---\n');
  }

  for (const file of state.files) {
    const fc = state.comments.files[file.path];
    if (!fc) continue;
    const hasFile = fc.file && fc.file.length > 0;
    const hasInline = fc.inline && fc.inline.length > 0;
    if (!hasFile && !hasInline) continue;

    lines.push('## File: `' + file.path + '`\n');

    if (hasFile) {
      lines.push('### File-Level Comments\n');
      for (const c of fc.file) lines.push('> ' + c.text + '\n');
    }

    if (hasInline) {
      lines.push('### Inline Comments\n');
      const lang = langFromPath(file.path);

      for (const c of fc.inline) {
        const startLine = c.startOld || c.startNew;
        const endLine = c.endOld || c.endNew;
        lines.push('#### Lines ' + startLine + '\u2013' + endLine + '\n');

        const contextLines = getCommentContext(file, c, 3);
        if (contextLines.length > 0) {
          lines.push('```' + lang);
          for (const cl of contextLines) lines.push(cl);
          lines.push('```\n');
        }

        lines.push('**Comment:** ' + c.text + '\n');
      }
    }

    lines.push('---\n');
  }

  const output = lines.join('\n');

  if (mode === 'clipboard') {
    navigator.clipboard.writeText(output).then(() => {
      showToast('Comments copied to clipboard');
    }).catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = output;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast('Comments copied to clipboard');
    });
  } else {
    const blob = new Blob([output], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'review-' + state.sourceBranch.replace(/\//g, '-') + '.md';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Comments saved to file');
  }
}

function getCommentContext(file, comment, contextSize) {
  const result = [];
  const startLine = comment.startOld || comment.startNew || 0;
  const endLine = comment.endOld || comment.endNew || 0;

  for (const hunk of file.hunks) {
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;

    for (const line of hunk.lines) {
      let currentOld = null, currentNew = null;
      if (line.type === 'del') { currentOld = oldLine; oldLine++; }
      else if (line.type === 'add') { currentNew = newLine; newLine++; }
      else { currentOld = oldLine; currentNew = newLine; oldLine++; newLine++; }

      const lineNum = currentOld || currentNew;
      if (lineNum >= startLine - contextSize && lineNum <= endLine + contextSize) {
        const prefix = line.type === 'del' ? '-' : line.type === 'add' ? '+' : ' ';
        result.push(String(lineNum).padStart(4) + ' ' + prefix + ' ' + line.content);
      }
    }
  }

  return result;
}

function showToast(message) {
  const toast = createEl('div', {
    textContent: message,
    style: {
      position: 'fixed', bottom: '24px', right: '24px',
      background: '#238636', color: '#fff',
      padding: '8px 16px', borderRadius: '6px',
      fontSize: '13px', zIndex: '999',
      opacity: '0', transition: 'opacity 0.3s'
    }
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; });
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2000);
}

// === Comment Navigation ===
let _commentNavIdx = -1;

function updateCommentNav() {
  const total = countAllComments();
  const nav = document.getElementById('comment-nav');
  if (total === 0) {
    nav.classList.add('hidden');
    return;
  }
  nav.classList.remove('hidden');
  _commentNavIdx = -1;
  updateCommentNavDisplay();
}

function updateCommentNavDisplay() {
  const countEl = document.getElementById('comment-nav-count');
  const els = getAllCommentElements();
  const current = _commentNavIdx >= 0 ? _commentNavIdx + 1 : getVisibleCommentIndex(els) + 1;
  countEl.textContent = current + ' / ' + els.length;
}

function getVisibleCommentIndex(els) {
  if (els.length === 0) return 0;
  const main = document.getElementById('main-content');
  const mainRect = main.getBoundingClientRect();
  // Find the first comment whose bottom is within or below the visible area
  for (let i = 0; i < els.length; i++) {
    const rect = els[i].getBoundingClientRect();
    if (rect.bottom >= mainRect.top && rect.top <= mainRect.bottom) return i;
  }
  // Fallback: find the last comment above the viewport
  let best = 0;
  for (let i = 0; i < els.length; i++) {
    const rect = els[i].getBoundingClientRect();
    if (rect.bottom < mainRect.top) best = i;
    else break;
  }
  return best;
}

function updateCommentNavPosition() {
  const els = getAllCommentElements();
  if (els.length === 0) return;
  _commentNavIdx = -1;
  updateCommentNavDisplay();
}

function countAllComments() {
  let n = state.comments.diff ? state.comments.diff.length : 0;
  for (const fp of Object.keys(state.comments.files)) {
    const fc = state.comments.files[fp];
    n += (fc.file ? fc.file.length : 0) + (fc.inline ? fc.inline.length : 0);
  }
  return n;
}

function getAllCommentElements() {
  return Array.from(document.querySelectorAll('.comment-block'));
}

function jumpToComment(direction) {
  const els = getAllCommentElements();
  if (els.length === 0) return;
  if (_commentNavIdx < 0) _commentNavIdx = getVisibleCommentIndex(els);
  _commentNavIdx += direction;
  if (_commentNavIdx < 0) _commentNavIdx = els.length - 1;
  if (_commentNavIdx >= els.length) _commentNavIdx = 0;
  els[_commentNavIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
  els.forEach(el => el.classList.remove('comment-highlight'));
  els[_commentNavIdx].classList.add('comment-highlight');
  setTimeout(() => els[_commentNavIdx]?.classList.remove('comment-highlight'), 1500);
  updateCommentNavDisplay();
}

document.getElementById('comment-nav-up').addEventListener('click', () => jumpToComment(-1));
document.getElementById('comment-nav-down').addEventListener('click', () => jumpToComment(1));

// Dismiss popover on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.line-num') && !e.target.closest('.comment-popover') && !e.target.closest('.comment-form')) {
    const popover = document.getElementById('comment-popover');
    if (popover && !popover.classList.contains('hidden')) {
      popover.classList.add('hidden');
    }
  }
});
