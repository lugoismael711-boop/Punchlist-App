/* ============================================================
   Punchlist — application logic (vanilla JS, no build step)
   Data is stored locally in the browser (localStorage).
   ============================================================ */
(function () {
  'use strict';

  // ---------- Storage ----------
  const STORAGE_KEY = 'punchlist.data.v1';

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const defaultData = () => {
    const pid = uid();
    return {
      version: 1,
      activeProjectId: pid,
      projects: [{ id: pid, name: 'My First Punchlist', location: '', createdAt: Date.now() }],
      items: [],
      contacts: [],
    };
  };

  let data;
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      data = raw ? JSON.parse(raw) : defaultData();
    } catch (e) {
      console.error('Failed to load data', e);
      data = defaultData();
    }
    if (!data.projects || !data.projects.length) data = defaultData();
    if (!data.projects.some(p => p.id === data.activeProjectId)) {
      data.activeProjectId = data.projects[0].id;
    }
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error(e);
      toast('Storage full — export a backup and remove old photos.');
    }
  }

  // ---------- Small helpers ----------
  const $ = sel => document.querySelector(sel);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = s => (s == null ? '' : String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  const activeProject = () => data.projects.find(p => p.id === data.activeProjectId) || data.projects[0];
  const projectItems = () => data.items.filter(i => i.projectId === data.activeProjectId);
  const contactName = id => {
    const c = data.contacts.find(x => x.id === id);
    return c ? c.name : '';
  };
  const initials = name => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

  // ============================================================
  //  RENDER — item list
  // ============================================================
  let currentFilter = 'all';

  function render() {
    const proj = activeProject();
    $('#projectName').textContent = proj.name;
    const items = projectItems();
    const done = items.filter(i => i.status === 'done').length;
    $('#projectMeta').textContent = proj.location
      ? proj.location
      : `${items.length} item${items.length === 1 ? '' : 's'}`;

    // progress
    const pct = items.length ? Math.round((done / items.length) * 100) : 0;
    $('#progressFill').style.width = pct + '%';
    $('#progressText').textContent = `${done}/${items.length}`;

    // filter
    let list = items.slice().sort((a, b) => {
      if (a.status !== b.status) return a.status === 'done' ? 1 : -1;
      const rank = { high: 0, med: 1, low: 2 };
      if (a.status === 'open' && rank[a.priority] !== rank[b.priority]) {
        return (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1);
      }
      return b.createdAt - a.createdAt;
    });
    if (currentFilter === 'open') list = list.filter(i => i.status !== 'done');
    if (currentFilter === 'done') list = list.filter(i => i.status === 'done');

    const ul = $('#itemList');
    ul.innerHTML = '';
    $('#emptyState').classList.toggle('hidden', items.length !== 0);

    list.forEach(item => ul.appendChild(itemCard(item)));
  }

  function itemCard(item) {
    const li = el('li', 'item-card' + (item.status === 'done' ? ' done' : ''));

    // checkbox
    const check = el('button', 'item-check' + (item.status === 'done' ? ' checked' : ''));
    check.setAttribute('aria-label', item.status === 'done' ? 'Mark as open' : 'Mark as done');
    check.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>';
    check.addEventListener('click', e => { e.stopPropagation(); toggleDone(item.id); });

    // thumb
    let thumb;
    if (item.photo) {
      thumb = el('img', 'item-thumb');
      thumb.src = item.photo;
      thumb.alt = item.title || 'Punchlist photo';
    } else {
      thumb = el('div', 'item-thumb placeholder',
        '<svg viewBox="0 0 24 24" style="width:26px;height:26px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>');
    }

    // body
    const body = el('div', 'item-body');
    body.appendChild(el('div', 'item-title', esc(item.title || 'Untitled item')));
    if (item.notes) body.appendChild(el('div', 'item-notes', esc(item.notes)));

    const meta = el('div', 'item-meta');
    if (item.priority && item.status !== 'done') {
      const map = { high: ['prio-high', 'High'], med: ['prio-med', 'Medium'], low: ['prio-low', 'Low'] };
      const m = map[item.priority] || map.med;
      meta.appendChild(el('span', 'tag ' + m[0], m[1]));
    }
    if (item.assignedTo && contactName(item.assignedTo)) {
      meta.appendChild(el('span', 'tag assignee',
        '<svg viewBox="0 0 24 24" style="width:12px;height:12px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' + esc(contactName(item.assignedTo))));
    }
    if (meta.children.length) body.appendChild(meta);

    li.appendChild(check);
    li.appendChild(thumb);
    li.appendChild(body);
    li.addEventListener('click', () => openItemEditor(item.id));
    return li;
  }

  function toggleDone(id) {
    const item = data.items.find(i => i.id === id);
    if (!item) return;
    item.status = item.status === 'done' ? 'open' : 'done';
    item.completedAt = item.status === 'done' ? Date.now() : null;
    save();
    render();
    toast(item.status === 'done' ? '✓ Marked complete' : 'Reopened');
  }

  // ============================================================
  //  MODAL infrastructure
  // ============================================================
  function openSheet(title, bodyNode, footNode) {
    const scrim = el('div', 'modal-scrim');
    const sheet = el('div', 'sheet');
    const head = el('div', 'sheet-head');
    head.appendChild(el('h2', null, esc(title)));
    const x = el('button', 'icon-btn', '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>');
    x.addEventListener('click', close);
    head.appendChild(x);
    const body = el('div', 'sheet-body');
    body.appendChild(bodyNode);
    sheet.appendChild(head);
    sheet.appendChild(body);
    if (footNode) { const f = el('div', 'sheet-foot'); f.appendChild(footNode); sheet.appendChild(f); }
    scrim.appendChild(sheet);
    scrim.addEventListener('click', e => { if (e.target === scrim) close(); });
    $('#modalRoot').appendChild(scrim);
    function close() { scrim.remove(); }
    return { close, scrim, body };
  }

  // ============================================================
  //  ITEM editor (create + edit)
  // ============================================================
  function openItemEditor(id, prefillPhoto) {
    const isNew = !id;
    const item = isNew
      ? { id: uid(), projectId: data.activeProjectId, title: '', notes: '', photo: prefillPhoto || '', status: 'open', priority: 'med', assignedTo: '', createdAt: Date.now() }
      : Object.assign({}, data.items.find(i => i.id === id));

    const body = el('div');

    // photo preview + actions
    const photoWrap = el('div');
    function refreshPhoto() {
      photoWrap.innerHTML = '';
      if (item.photo) {
        const img = el('img', 'detail-photo');
        img.src = item.photo;
        img.alt = 'Item photo';
        photoWrap.appendChild(img);
        const actions = el('div', 'detail-photo-actions');
        const annBtn = el('button', 'mini-btn', '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg> Annotate');
        annBtn.addEventListener('click', () => openAnnotator(item.photoOriginal || item.photo, dataUrl => {
          item.photo = dataUrl;
          refreshPhoto();
        }, item.annotations, (anns) => { item.annotations = anns; }));
        const repBtn = el('button', 'mini-btn', '<svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Replace');
        repBtn.addEventListener('click', () => pickPhoto(dataUrl => {
          item.photo = dataUrl; item.photoOriginal = dataUrl; item.annotations = null; refreshPhoto();
        }));
        const rmBtn = el('button', 'mini-btn', '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg> Remove');
        rmBtn.addEventListener('click', () => { item.photo = ''; item.photoOriginal = ''; item.annotations = null; refreshPhoto(); });
        actions.appendChild(annBtn); actions.appendChild(repBtn); actions.appendChild(rmBtn);
        photoWrap.appendChild(actions);
      } else {
        const addBtn = el('button', 'mini-btn', '<svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Add photo');
        addBtn.style.marginBottom = '14px';
        addBtn.addEventListener('click', () => pickPhoto(dataUrl => {
          item.photo = dataUrl; item.photoOriginal = dataUrl; item.annotations = null; refreshPhoto();
        }));
        photoWrap.appendChild(addBtn);
      }
    }
    refreshPhoto();
    body.appendChild(photoWrap);

    // title
    const fTitle = el('div', 'field', '<label>Title</label>');
    const inTitle = el('input'); inTitle.type = 'text'; inTitle.placeholder = 'e.g. Touch up paint by window';
    inTitle.value = item.title || ''; fTitle.appendChild(inTitle); body.appendChild(fTitle);

    // notes
    const fNotes = el('div', 'field', '<label>Notes</label>');
    const inNotes = el('textarea'); inNotes.placeholder = 'Describe what needs to be fixed…';
    inNotes.value = item.notes || ''; fNotes.appendChild(inNotes); body.appendChild(fNotes);

    // priority + assignee row
    const row = el('div', 'field-row');
    const fPrio = el('div', 'field', '<label>Priority</label>');
    const selPrio = el('select');
    [['high', 'High'], ['med', 'Medium'], ['low', 'Low']].forEach(([v, l]) => {
      const o = el('option', null, l); o.value = v; if (item.priority === v) o.selected = true; selPrio.appendChild(o);
    });
    fPrio.appendChild(selPrio); row.appendChild(fPrio);

    const fAssign = el('div', 'field', '<label>Assign to</label>');
    const selAssign = el('select');
    const none = el('option', null, '— Unassigned —'); none.value = ''; selAssign.appendChild(none);
    data.contacts.forEach(c => {
      const o = el('option', null, esc(c.name)); o.value = c.id; if (item.assignedTo === c.id) o.selected = true; selAssign.appendChild(o);
    });
    fAssign.appendChild(selAssign); row.appendChild(fAssign);
    body.appendChild(row);

    // done checkbox
    const doneRow = el('div', 'checkbox-row');
    const cb = el('input'); cb.type = 'checkbox'; cb.id = 'doneChk'; cb.checked = item.status === 'done';
    const lbl = el('label', null, 'Completed'); lbl.htmlFor = 'doneChk';
    doneRow.appendChild(cb); doneRow.appendChild(lbl); body.appendChild(doneRow);

    // footer buttons
    const foot = el('div');
    foot.style.display = 'flex'; foot.style.gap = '10px'; foot.style.width = '100%';
    if (!isNew) {
      const del = el('button', 'btn btn-danger', 'Delete'); del.style.flex = '0 0 auto';
      del.addEventListener('click', () => {
        if (confirm('Delete this item?')) {
          data.items = data.items.filter(i => i.id !== item.id);
          save(); render(); modal.close(); toast('Deleted');
        }
      });
      foot.appendChild(del);
    }
    const saveBtn = el('button', 'btn btn-primary', isNew ? 'Add item' : 'Save');
    saveBtn.addEventListener('click', () => {
      item.title = inTitle.value.trim() || 'Untitled item';
      item.notes = inNotes.value.trim();
      item.priority = selPrio.value;
      item.assignedTo = selAssign.value;
      const nowDone = cb.checked;
      if (nowDone && item.status !== 'done') item.completedAt = Date.now();
      if (!nowDone) item.completedAt = null;
      item.status = nowDone ? 'done' : 'open';

      const idx = data.items.findIndex(i => i.id === item.id);
      if (idx >= 0) data.items[idx] = item; else data.items.push(item);
      save(); render(); modal.close();
      toast(isNew ? 'Item added' : 'Saved');
    });
    foot.appendChild(saveBtn);

    const modal = openSheet(isNew ? 'New item' : 'Edit item', body, foot);
  }

  // ---------- photo picking ----------
  let photoCallback = null;
  function pickPhoto(cb) {
    photoCallback = cb;
    const input = $('#photoInput');
    input.value = '';
    input.click();
  }
  $('#photoInput').addEventListener('change', function () {
    const file = this.files && this.files[0];
    if (!file) return;
    readAndResize(file, 1600, dataUrl => {
      const cb = photoCallback; photoCallback = null;
      if (cb) cb(dataUrl);
    });
  });

  // Read image file, downscale to maxDim, return JPEG dataURL
  function readAndResize(file, maxDim, cb) {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        cb(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => cb(e.target.result);
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ============================================================
  //  ANNOTATION editor — draw on the photo
  // ============================================================
  function openAnnotator(baseSrc, onSave, existing, onSaveAnns) {
    const state = {
      tool: 'pen',
      color: '#ef4444',
      strokes: existing ? JSON.parse(JSON.stringify(existing)) : [],
      drawing: false,
      current: null,
    };

    const scrim = el('div', 'annot-scrim');

    // top bar
    const top = el('div', 'annot-top');
    const cancel = el('button', 'link-btn', 'Cancel');
    const titleEl = el('span', null, 'Markup'); titleEl.style.fontWeight = '700';
    const doneBtn = el('button', 'link-btn', 'Done'); doneBtn.style.fontWeight = '700';
    top.appendChild(cancel); top.appendChild(titleEl); top.appendChild(doneBtn);

    // stage + canvas
    const stage = el('div', 'annot-stage');
    const canvas = el('canvas'); canvas.id = 'annotCanvas';
    stage.appendChild(canvas);

    // tools
    const tools = el('div', 'annot-tools');
    const toolDefs = [
      ['pen', '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'],
      ['arrow', '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'],
      ['rect', '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="1"/></svg>'],
      ['text', '<svg viewBox="0 0 24 24"><path d="M4 7V5h16v2M9 19h6M12 5v14"/></svg>'],
    ];
    const toolBtns = {};
    toolDefs.forEach(([name, svg]) => {
      const b = el('button', 'tool-btn' + (state.tool === name ? ' active' : ''), svg);
      b.addEventListener('click', () => {
        state.tool = name;
        Object.values(toolBtns).forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      });
      toolBtns[name] = b;
      tools.appendChild(b);
    });
    tools.appendChild(el('div', 'tool-sep'));
    ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#ffffff', '#000000'].forEach((c, i) => {
      const d = el('button', 'color-dot' + (state.color === c ? ' active' : ''));
      d.style.background = c;
      d.addEventListener('click', () => {
        state.color = c;
        tools.querySelectorAll('.color-dot').forEach(x => x.classList.remove('active'));
        d.classList.add('active');
      });
      tools.appendChild(d);
    });
    tools.appendChild(el('div', 'tool-sep'));
    const undoBtn = el('button', 'tool-btn', '<svg viewBox="0 0 24 24"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>');
    undoBtn.addEventListener('click', () => { state.strokes.pop(); redraw(); });
    tools.appendChild(undoBtn);
    const clearBtn = el('button', 'tool-btn', '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>');
    clearBtn.addEventListener('click', () => { if (confirm('Clear all markup?')) { state.strokes = []; redraw(); } });
    tools.appendChild(clearBtn);

    scrim.appendChild(top);
    scrim.appendChild(stage);
    scrim.appendChild(tools);
    $('#modalRoot').appendChild(scrim);

    // load base image
    const baseImg = new Image();
    const ctx = canvas.getContext('2d');
    let scale = 1; // display px per source px

    baseImg.onload = () => {
      canvas.width = baseImg.width;
      canvas.height = baseImg.height;
      fitCanvas();
      redraw();
    };
    baseImg.src = baseSrc;

    function fitCanvas() {
      const availW = stage.clientWidth - 8;
      const availH = stage.clientHeight - 8;
      const s = Math.min(availW / canvas.width, availH / canvas.height, 1.5);
      scale = s;
      canvas.style.width = (canvas.width * s) + 'px';
      canvas.style.height = (canvas.height * s) + 'px';
    }
    window.addEventListener('resize', fitCanvas);

    function lineWidth() { return Math.max(3, Math.round(canvas.width / 320)); }

    function redraw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);
      state.strokes.forEach(drawStroke);
      if (state.current) drawStroke(state.current);
    }

    function drawStroke(s) {
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.w || lineWidth();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (s.type === 'pen') {
        ctx.beginPath();
        s.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.stroke();
      } else if (s.type === 'rect') {
        const [a, b] = [s.pts[0], s.pts[1]];
        ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      } else if (s.type === 'arrow') {
        const [a, b] = [s.pts[0], s.pts[1]];
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const head = (s.w || lineWidth()) * 4;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - head * Math.cos(ang - Math.PI / 6), b.y - head * Math.sin(ang - Math.PI / 6));
        ctx.lineTo(b.x - head * Math.cos(ang + Math.PI / 6), b.y - head * Math.sin(ang + Math.PI / 6));
        ctx.closePath(); ctx.fill();
      } else if (s.type === 'text') {
        const size = Math.max(18, Math.round(canvas.width / 22));
        ctx.font = `bold ${size}px -apple-system, Arial, sans-serif`;
        ctx.textBaseline = 'top';
        // outline for legibility
        ctx.lineWidth = Math.max(3, size / 6);
        ctx.strokeStyle = s.color === '#ffffff' ? '#000' : '#fff';
        ctx.strokeText(s.text, s.pts[0].x, s.pts[0].y);
        ctx.fillStyle = s.color;
        ctx.fillText(s.text, s.pts[0].x, s.pts[0].y);
      }
    }

    function pos(e) {
      const rect = canvas.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      return { x: cx / scale, y: cy / scale };
    }

    function start(e) {
      e.preventDefault();
      const p = pos(e);
      if (state.tool === 'text') {
        const text = prompt('Enter note text:');
        if (text && text.trim()) {
          state.strokes.push({ type: 'text', color: state.color, text: text.trim(), pts: [p] });
          redraw();
        }
        return;
      }
      state.drawing = true;
      state.current = { type: state.tool, color: state.color, w: lineWidth(), pts: [p, p] };
      if (state.tool === 'pen') state.current.pts = [p];
    }
    function move(e) {
      if (!state.drawing) return;
      e.preventDefault();
      const p = pos(e);
      if (state.tool === 'pen') state.current.pts.push(p);
      else state.current.pts[1] = p;
      redraw();
    }
    function end() {
      if (!state.drawing) return;
      state.drawing = false;
      if (state.current) state.strokes.push(state.current);
      state.current = null;
      redraw();
    }

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);

    function cleanup() {
      window.removeEventListener('resize', fitCanvas);
      window.removeEventListener('mouseup', end);
      scrim.remove();
    }
    cancel.addEventListener('click', cleanup);
    doneBtn.addEventListener('click', () => {
      redraw();
      const out = canvas.toDataURL('image/jpeg', 0.85);
      if (onSaveAnns) onSaveAnns(state.strokes);
      onSave(out);
      cleanup();
      toast('Markup saved');
    });
  }

  // ============================================================
  //  PROJECTS drawer
  // ============================================================
  function openDrawer() {
    renderProjects();
    $('#drawerScrim').hidden = false;
    $('#projectsDrawer').classList.add('open');
    $('#projectsDrawer').setAttribute('aria-hidden', 'false');
  }
  function closeDrawer() {
    $('#drawerScrim').hidden = true;
    $('#projectsDrawer').classList.remove('open');
    $('#projectsDrawer').setAttribute('aria-hidden', 'true');
  }
  function renderProjects() {
    const ul = $('#projectList');
    ul.innerHTML = '';
    data.projects.forEach(p => {
      const count = data.items.filter(i => i.projectId === p.id).length;
      const doneCount = data.items.filter(i => i.projectId === p.id && i.status === 'done').length;
      const row = el('li', 'project-row' + (p.id === data.activeProjectId ? ' active' : ''));
      const main = el('div', 'pr-main');
      main.innerHTML = `<div class="pr-name">${esc(p.name)}</div><div class="pr-sub">${doneCount}/${count} done${p.location ? ' · ' + esc(p.location) : ''}</div>`;
      main.addEventListener('click', () => {
        data.activeProjectId = p.id; save(); render(); closeDrawer();
      });
      const edit = el('button', 'icon-btn pr-del', '<svg viewBox="0 0 24 24" style="width:18px;height:18px"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>');
      edit.addEventListener('click', e => { e.stopPropagation(); editProject(p); });
      row.appendChild(main); row.appendChild(edit);
      ul.appendChild(row);
    });
  }
  function editProject(p) {
    const isNew = !p;
    p = p || { id: uid(), name: '', location: '', createdAt: Date.now() };
    const body = el('div');
    const f1 = el('div', 'field', '<label>Punchlist name</label>');
    const n = el('input'); n.type = 'text'; n.placeholder = 'e.g. 123 Main St — Unit 4B'; n.value = p.name || '';
    f1.appendChild(n); body.appendChild(f1);
    const f2 = el('div', 'field', '<label>Location / address (optional)</label>');
    const loc = el('input'); loc.type = 'text'; loc.placeholder = 'Project address or area'; loc.value = p.location || '';
    f2.appendChild(loc); body.appendChild(f2);

    const foot = el('div'); foot.style.display = 'flex'; foot.style.gap = '10px'; foot.style.width = '100%';
    if (!isNew && data.projects.length > 1) {
      const del = el('button', 'btn btn-danger', 'Delete'); del.style.flex = '0 0 auto';
      del.addEventListener('click', () => {
        if (confirm('Delete this punchlist and all its items?')) {
          data.items = data.items.filter(i => i.projectId !== p.id);
          data.projects = data.projects.filter(x => x.id !== p.id);
          if (data.activeProjectId === p.id) data.activeProjectId = data.projects[0].id;
          save(); render(); renderProjects(); modal.close();
        }
      });
      foot.appendChild(del);
    }
    const ok = el('button', 'btn btn-primary', isNew ? 'Create' : 'Save');
    ok.addEventListener('click', () => {
      p.name = n.value.trim() || 'Untitled punchlist';
      p.location = loc.value.trim();
      if (isNew) { data.projects.push(p); data.activeProjectId = p.id; }
      save(); render(); renderProjects(); modal.close();
    });
    foot.appendChild(ok);
    const modal = openSheet(isNew ? 'New punchlist' : 'Edit punchlist', body, foot);
  }

  // ============================================================
  //  CONTACTS
  // ============================================================
  function openContacts() {
    const body = el('div');
    const list = el('div');
    function renderContacts() {
      list.innerHTML = '';
      if (!data.contacts.length) {
        list.appendChild(el('p', 'helper', 'No contacts yet. Add subs, owners, or teammates so you can assign items and send them the list.'));
      }
      data.contacts.forEach(c => {
        const row = el('div', 'contact-row');
        row.appendChild(el('div', 'contact-avatar', esc(initials(c.name))));
        const info = el('div', 'contact-info');
        info.innerHTML = `<div class="cn">${esc(c.name)}</div><div class="cc">${esc([c.company, c.email, c.phone].filter(Boolean).join(' · '))}</div>`;
        row.appendChild(info);
        const acts = el('div', 'contact-actions');
        const ed = el('button', 'icon-btn', '<svg viewBox="0 0 24 24" style="width:18px;height:18px"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>');
        ed.addEventListener('click', () => editContact(c, renderContacts));
        acts.appendChild(ed);
        row.appendChild(acts);
        list.appendChild(row);
      });
    }
    renderContacts();
    body.appendChild(list);
    const add = el('button', 'btn-block', '+ Add contact');
    add.addEventListener('click', () => editContact(null, renderContacts));
    body.appendChild(add);
    openSheet('Contacts', body);
  }

  function editContact(c, after) {
    const isNew = !c;
    c = c || { id: uid(), name: '', company: '', email: '', phone: '' };
    const body = el('div');
    const mk = (label, key, type, ph) => {
      const f = el('div', 'field', `<label>${label}</label>`);
      const i = el('input'); i.type = type || 'text'; i.placeholder = ph || ''; i.value = c[key] || '';
      i.dataset.key = key; f.appendChild(i); body.appendChild(f); return i;
    };
    mk('Name', 'name', 'text', 'Full name');
    mk('Company / trade', 'company', 'text', 'e.g. ACME Electric');
    mk('Email', 'email', 'email', 'name@example.com');
    mk('Phone', 'phone', 'tel', '(555) 123-4567');

    const foot = el('div'); foot.style.display = 'flex'; foot.style.gap = '10px'; foot.style.width = '100%';
    if (!isNew) {
      const del = el('button', 'btn btn-danger', 'Delete'); del.style.flex = '0 0 auto';
      del.addEventListener('click', () => {
        if (confirm('Delete this contact?')) {
          data.contacts = data.contacts.filter(x => x.id !== c.id);
          data.items.forEach(i => { if (i.assignedTo === c.id) i.assignedTo = ''; });
          save(); after && after(); modal.close();
        }
      });
      foot.appendChild(del);
    }
    const ok = el('button', 'btn btn-primary', isNew ? 'Add' : 'Save');
    ok.addEventListener('click', () => {
      body.querySelectorAll('input').forEach(i => { c[i.dataset.key] = i.value.trim(); });
      if (!c.name) { toast('Enter a name'); return; }
      if (isNew) data.contacts.push(c);
      save(); after && after(); modal.close();
    });
    foot.appendChild(ok);
    const modal = openSheet(isNew ? 'New contact' : 'Edit contact', body, foot);
  }

  // ============================================================
  //  SEND / SHARE punchlist
  // ============================================================
  function openSend() {
    const proj = activeProject();
    const items = projectItems();
    if (!items.length) { toast('Nothing to send yet'); return; }

    const body = el('div');
    body.appendChild(el('p', 'helper', 'Choose who to send this punchlist to and what to include. On a phone this opens your share sheet or email with the summary; photos can be shared where your device supports it.'));

    // recipient
    const fTo = el('div', 'field', '<label>Send to</label>');
    const sel = el('select');
    const cust = el('option', null, 'Enter email manually…'); cust.value = '__manual'; sel.appendChild(cust);
    data.contacts.filter(c => c.email).forEach(c => {
      const o = el('option', null, `${esc(c.name)} (${esc(c.email)})`); o.value = c.id; sel.appendChild(o);
    });
    fTo.appendChild(sel); body.appendChild(fTo);
    const fManual = el('div', 'field');
    const man = el('input'); man.type = 'email'; man.placeholder = 'email@example.com';
    fManual.appendChild(man); body.appendChild(fManual);
    function syncManual() { fManual.style.display = sel.value === '__manual' ? 'block' : 'none'; }
    sel.addEventListener('change', syncManual); syncManual();

    // scope
    const fScope = el('div', 'field', '<label>Include</label>');
    const scope = el('select');
    [['open', 'Open items only'], ['all', 'All items'], ['done', 'Completed items only']].forEach(([v, l]) => {
      const o = el('option', null, l); o.value = v; scope.appendChild(o);
    });
    fScope.appendChild(scope); body.appendChild(fScope);

    const foot = el('div'); foot.style.display = 'flex'; foot.style.gap = '10px'; foot.style.width = '100%';
    const shareBtn = el('button', 'btn btn-primary', 'Share');
    shareBtn.addEventListener('click', () => doSend(proj, sel, man, scope.value, true));
    const emailBtn = el('button', 'btn btn-ghost', 'Email');
    emailBtn.addEventListener('click', () => doSend(proj, sel, man, scope.value, false));
    foot.appendChild(emailBtn); foot.appendChild(shareBtn);

    const modal = openSheet('Send punchlist', body, foot);
    openSend._close = modal.close;
  }

  function recipientEmail(sel, man) {
    if (sel.value === '__manual') return man.value.trim();
    const c = data.contacts.find(x => x.id === sel.value);
    return c ? c.email : '';
  }

  function buildText(proj, scope) {
    let items = projectItems();
    if (scope === 'open') items = items.filter(i => i.status !== 'done');
    if (scope === 'done') items = items.filter(i => i.status === 'done');
    items.sort((a, b) => (a.status === b.status ? 0 : a.status === 'done' ? 1 : -1));

    const lines = [];
    lines.push(`PUNCHLIST: ${proj.name}`);
    if (proj.location) lines.push(proj.location);
    const total = projectItems().length;
    const done = projectItems().filter(i => i.status === 'done').length;
    lines.push(`Progress: ${done}/${total} complete`);
    lines.push('');
    if (!items.length) lines.push('(No items in this selection.)');
    items.forEach((it, n) => {
      const box = it.status === 'done' ? '[x]' : '[ ]';
      const prio = it.priority === 'high' ? ' (HIGH)' : it.priority === 'low' ? ' (low)' : '';
      lines.push(`${box} ${n + 1}. ${it.title}${prio}`);
      if (it.notes) lines.push(`     ${it.notes.replace(/\n/g, '\n     ')}`);
      const who = contactName(it.assignedTo);
      if (who) lines.push(`     Assigned: ${who}`);
    });
    lines.push('');
    lines.push('Sent from Punchlist');
    return { text: lines.join('\n'), items };
  }

  async function doSend(proj, sel, man, scope, preferShare) {
    const email = recipientEmail(sel, man);
    const { text, items } = buildText(proj, scope);
    const subject = `Punchlist: ${proj.name}`;

    // Try native share with photos where possible
    if (preferShare && navigator.share) {
      const files = [];
      if (navigator.canShare) {
        for (const it of items) {
          if (it.photo && files.length < 8) {
            try {
              const blob = await (await fetch(it.photo)).blob();
              files.push(new File([blob], `${(it.title || 'item').replace(/[^a-z0-9]+/gi, '_').slice(0, 30)}.jpg`, { type: 'image/jpeg' }));
            } catch (e) { /* ignore */ }
          }
        }
      }
      try {
        const payload = { title: subject, text };
        if (files.length && navigator.canShare && navigator.canShare({ files })) payload.files = files;
        await navigator.share(payload);
        if (openSend._close) openSend._close();
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return; // user cancelled
        // fall through to mailto
      }
    }

    // mailto fallback
    const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    if (mailto.length > 1900) {
      // body too long for some mail clients — copy to clipboard as backup
      try { await navigator.clipboard.writeText(text); toast('Summary copied to clipboard'); } catch (e) {}
    }
    window.location.href = mailto;
    if (openSend._close) openSend._close();
  }

  // ============================================================
  //  Backup export / import
  // ============================================================
  function exportBackup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url;
    a.download = `punchlist-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('Backup downloaded');
  }
  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const imported = JSON.parse(e.target.result);
        if (!imported.projects) throw new Error('Not a valid backup');
        if (confirm('Replace all current data with this backup?')) {
          data = imported;
          if (!data.projects.some(p => p.id === data.activeProjectId)) data.activeProjectId = data.projects[0].id;
          save(); render(); closeDrawer(); toast('Backup imported');
        }
      } catch (err) { toast('Could not read that file'); }
    };
    reader.readAsText(file);
  }

  // ============================================================
  //  Wire up UI
  // ============================================================
  function init() {
    load();
    render();

    $('#addPhotoBtn').addEventListener('click', () => {
      pickPhoto(dataUrl => {
        // open editor with photo, then let them annotate right away
        openItemEditor(null, dataUrl);
      });
    });
    $('#addNoteBtn').addEventListener('click', () => openItemEditor(null));

    // filters
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentFilter = chip.dataset.filter;
        render();
      });
    });

    // drawer
    $('#menuBtn').addEventListener('click', openDrawer);
    $('#closeDrawer').addEventListener('click', closeDrawer);
    $('#drawerScrim').addEventListener('click', closeDrawer);
    $('#newProjectBtn').addEventListener('click', () => editProject(null));

    // contacts
    $('#contactsBtn').addEventListener('click', openContacts);

    // header title tap → send menu; long-press project name edits
    $('#projectName').addEventListener('click', () => { /* reserved */ });

    // export / import
    $('#exportBtn').addEventListener('click', exportBackup);
    $('#importBtn').addEventListener('click', () => $('#importInput').click());
    $('#importInput').addEventListener('change', function () {
      if (this.files && this.files[0]) importBackup(this.files[0]);
      this.value = '';
    });

    // Add a "Send" action into the toolbar area via header contacts long-press?
    // Provide an explicit Send button in the drawer footer too.
    addSendButton();

    // service worker for offline / installable
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  function addSendButton() {
    // Insert a send button into the header toolbar (right side, before progress)
    const toolbar = $('#listToolbar');
    const btn = el('button', 'chip', '✈ Send');
    btn.style.marginLeft = '4px';
    btn.addEventListener('click', openSend);
    // place it right after the filters group
    const filters = toolbar.querySelector('.filters');
    filters.appendChild(btn);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
