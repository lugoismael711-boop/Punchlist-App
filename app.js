/* ============================================================
   Punchlist — application logic (vanilla JS, no build step)
   Data is stored locally in the browser (localStorage).
   ============================================================ */
(function () {
  'use strict';

  // ---------- Status workflow (Fieldwire-style) ----------
  const STATUSES = [
    { key: 'open',     label: 'Open',        color: '#64748b', done: false },
    { key: 'progress', label: 'In Progress', color: '#2563eb', done: false },
    { key: 'done',     label: 'Done',        color: '#16a34a', done: true  },
    { key: 'verified', label: 'Verified',    color: '#7c3aed', done: true  },
  ];
  const statusDef = k => STATUSES.find(s => s.key === k) || STATUSES[0];
  const isClosed = it => statusDef(it.status).done;
  const nextStatus = k => STATUSES[(STATUSES.findIndex(s => s.key === k) + 1) % STATUSES.length].key;

  // ---------- Storage ----------
  const STORAGE_KEY = 'punchlist.data.v1';
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const defaultData = () => {
    const pid = uid();
    return {
      version: 2,
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
    if (!data.projects.some(p => p.id === data.activeProjectId)) data.activeProjectId = data.projects[0].id;
    migrateItems();
  }
  // Bring older/imported items up to the current schema
  function migrateItems() {
    (data.items || []).forEach(it => {
      if (!STATUSES.some(s => s.key === it.status)) it.status = 'open';
      if (it.dueDate === undefined) it.dueDate = '';
      if (it.category === undefined) it.category = '';
    });
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error(e);
      toast('Storage full — export a backup and remove old photos.');
    }
  }

  // ---------- Helpers ----------
  const $ = sel => document.querySelector(sel);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = s => (s == null ? '' : String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

  const todayStr = () => new Date().toISOString().slice(0, 10);
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const isOverdue = it => it.dueDate && !isClosed(it) && it.dueDate < todayStr();

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
  const contactName = id => { const c = data.contacts.find(x => x.id === id); return c ? c.name : ''; };
  const initials = name => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

  // ============================================================
  //  RENDER — item list
  // ============================================================
  let currentFilter = 'all';

  function render() {
    const proj = activeProject();
    $('#projectName').textContent = proj.name;
    const items = projectItems();
    const closed = items.filter(isClosed).length;
    $('#projectMeta').textContent = proj.location ? proj.location : `${items.length} item${items.length === 1 ? '' : 's'}`;

    const pct = items.length ? Math.round((closed / items.length) * 100) : 0;
    $('#progressFill').style.width = pct + '%';
    $('#progressText').textContent = `${closed}/${items.length}`;

    // sort: not-closed first; among those overdue→due date→priority; closed last
    const rankP = { high: 0, med: 1, low: 2 };
    let list = items.slice().sort((a, b) => {
      const ca = isClosed(a), cb = isClosed(b);
      if (ca !== cb) return ca ? 1 : -1;
      if (!ca) {
        const oa = isOverdue(a), ob = isOverdue(b);
        if (oa !== ob) return oa ? -1 : 1;
        if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
        if (a.dueDate && !b.dueDate) return -1;
        if (!a.dueDate && b.dueDate) return 1;
        if ((rankP[a.priority] ?? 1) !== (rankP[b.priority] ?? 1)) return (rankP[a.priority] ?? 1) - (rankP[b.priority] ?? 1);
      }
      return b.createdAt - a.createdAt;
    });
    if (currentFilter !== 'all') list = list.filter(i => (i.status || 'open') === currentFilter);

    const ul = $('#itemList');
    ul.innerHTML = '';
    $('#emptyState').classList.toggle('hidden', items.length !== 0);
    list.forEach(item => ul.appendChild(itemCard(item)));
  }

  function itemCard(item) {
    const st = statusDef(item.status);
    const li = el('li', 'item-card' + (st.done ? ' done' : ''));

    // status check button — tap advances through the workflow
    const check = el('button', 'item-check st-' + st.key);
    check.setAttribute('aria-label', 'Advance status (currently ' + st.label + ')');
    if (st.key === 'done' || st.key === 'verified') check.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>';
    else if (st.key === 'progress') check.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/></svg>';
    check.addEventListener('click', e => { e.stopPropagation(); advanceStatus(item.id); });

    // thumb
    let thumb;
    if (item.photo) {
      thumb = el('img', 'item-thumb'); thumb.src = item.photo; thumb.alt = item.title || 'Punchlist photo';
    } else {
      thumb = el('div', 'item-thumb placeholder',
        '<svg viewBox="0 0 24 24" style="width:26px;height:26px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>');
    }

    const body = el('div', 'item-body');
    body.appendChild(el('div', 'item-title', esc(item.title || 'Untitled item')));
    if (item.notes) body.appendChild(el('div', 'item-notes', esc(item.notes)));

    const meta = el('div', 'item-meta');
    meta.appendChild(el('span', 'tag status st-' + st.key, esc(st.label)));
    if (item.priority && !st.done) {
      const map = { high: ['prio-high', 'High'], med: ['prio-med', 'Medium'], low: ['prio-low', 'Low'] };
      const m = map[item.priority] || map.med;
      meta.appendChild(el('span', 'tag ' + m[0], m[1]));
    }
    if (item.dueDate) {
      const over = isOverdue(item);
      meta.appendChild(el('span', 'tag due' + (over ? ' overdue' : ''),
        '<svg viewBox="0 0 24 24" style="width:12px;height:12px"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>' +
        (over ? 'Overdue · ' : 'Due ') + esc(fmtDate(item.dueDate))));
    }
    if (item.category) meta.appendChild(el('span', 'tag cat', esc(item.category)));
    if (item.assignedTo && contactName(item.assignedTo)) {
      meta.appendChild(el('span', 'tag assignee',
        '<svg viewBox="0 0 24 24" style="width:12px;height:12px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' + esc(contactName(item.assignedTo))));
    }
    body.appendChild(meta);

    li.appendChild(check); li.appendChild(thumb); li.appendChild(body);
    li.addEventListener('click', () => openItemEditor(item.id));
    return li;
  }

  function advanceStatus(id) {
    const item = data.items.find(i => i.id === id);
    if (!item) return;
    item.status = nextStatus(item.status || 'open');
    item.completedAt = isClosed(item) ? (item.completedAt || Date.now()) : null;
    save(); render();
    toast('→ ' + statusDef(item.status).label);
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
    const body = el('div', 'sheet-body'); body.appendChild(bodyNode);
    sheet.appendChild(head); sheet.appendChild(body);
    if (footNode) { const f = el('div', 'sheet-foot'); f.appendChild(footNode); sheet.appendChild(f); }
    scrim.appendChild(sheet);
    scrim.addEventListener('click', e => { if (e.target === scrim) close(); });
    $('#modalRoot').appendChild(scrim);
    function close() { scrim.remove(); }
    return { close, scrim, body };
  }
  const footRow = () => { const f = el('div'); f.style.display = 'flex'; f.style.gap = '10px'; f.style.width = '100%'; return f; };

  // ============================================================
  //  ITEM editor (create + edit)
  // ============================================================
  function openItemEditor(id, prefillPhoto) {
    const isNew = !id;
    const item = isNew
      ? { id: uid(), projectId: data.activeProjectId, title: '', notes: '', photo: '', photoOriginal: '', status: 'open', priority: 'med', assignedTo: '', dueDate: '', category: '', createdAt: Date.now() }
      : Object.assign({}, data.items.find(i => i.id === id));
    if (prefillPhoto) { item.photo = prefillPhoto; item.photoOriginal = prefillPhoto; }

    const body = el('div');

    // photo preview + actions
    const photoWrap = el('div');
    function refreshPhoto() {
      photoWrap.innerHTML = '';
      if (item.photo) {
        const img = el('img', 'detail-photo'); img.src = item.photo; img.alt = 'Item photo';
        photoWrap.appendChild(img);
        const actions = el('div', 'detail-photo-actions');
        const annBtn = el('button', 'mini-btn', '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg> Annotate');
        annBtn.addEventListener('click', () => openAnnotator(item.photoOriginal || item.photo, dataUrl => { item.photo = dataUrl; refreshPhoto(); }, item.annotations, anns => { item.annotations = anns; }));
        const repBtn = el('button', 'mini-btn', '<svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Replace');
        repBtn.addEventListener('click', () => pickPhoto(d => { item.photo = d; item.photoOriginal = d; item.annotations = null; refreshPhoto(); }));
        const rmBtn = el('button', 'mini-btn', '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg> Remove');
        rmBtn.addEventListener('click', () => { item.photo = ''; item.photoOriginal = ''; item.annotations = null; refreshPhoto(); });
        actions.appendChild(annBtn); actions.appendChild(repBtn); actions.appendChild(rmBtn);
        photoWrap.appendChild(actions);
      } else {
        const addBtn = el('button', 'mini-btn', '<svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Add photo');
        addBtn.style.marginBottom = '14px';
        addBtn.addEventListener('click', () => pickPhoto(d => { item.photo = d; item.photoOriginal = d; item.annotations = null; refreshPhoto(); }));
        photoWrap.appendChild(addBtn);
      }
    }
    refreshPhoto();
    body.appendChild(photoWrap);

    const fTitle = el('div', 'field', '<label>Title</label>');
    const inTitle = el('input'); inTitle.type = 'text'; inTitle.placeholder = 'e.g. Touch up paint by window'; inTitle.value = item.title || '';
    fTitle.appendChild(inTitle); body.appendChild(fTitle);

    const fNotes = el('div', 'field', '<label>Notes</label>');
    const inNotes = el('textarea'); inNotes.placeholder = 'Describe what needs to be fixed…'; inNotes.value = item.notes || '';
    fNotes.appendChild(inNotes); body.appendChild(fNotes);

    // status + priority
    const row1 = el('div', 'field-row');
    const fStatus = el('div', 'field', '<label>Status</label>');
    const selStatus = el('select');
    STATUSES.forEach(s => { const o = el('option', null, s.label); o.value = s.key; if ((item.status || 'open') === s.key) o.selected = true; selStatus.appendChild(o); });
    fStatus.appendChild(selStatus); row1.appendChild(fStatus);
    const fPrio = el('div', 'field', '<label>Priority</label>');
    const selPrio = el('select');
    [['high', 'High'], ['med', 'Medium'], ['low', 'Low']].forEach(([v, l]) => { const o = el('option', null, l); o.value = v; if (item.priority === v) o.selected = true; selPrio.appendChild(o); });
    fPrio.appendChild(selPrio); row1.appendChild(fPrio);
    body.appendChild(row1);

    // due date + category
    const row2 = el('div', 'field-row');
    const fDue = el('div', 'field', '<label>Due date</label>');
    const inDue = el('input'); inDue.type = 'date'; inDue.value = item.dueDate || ''; fDue.appendChild(inDue); row2.appendChild(fDue);
    const fCat = el('div', 'field', '<label>Trade / category</label>');
    const inCat = el('input'); inCat.type = 'text'; inCat.setAttribute('list', 'tradeList'); inCat.placeholder = 'e.g. Electrical'; inCat.value = item.category || '';
    fCat.appendChild(inCat); row2.appendChild(fCat);
    body.appendChild(row2);

    // assignee
    const fAssign = el('div', 'field', '<label>Assign to</label>');
    const selAssign = el('select');
    const none = el('option', null, '— Unassigned —'); none.value = ''; selAssign.appendChild(none);
    data.contacts.forEach(c => { const o = el('option', null, c.name); o.value = c.id; if (item.assignedTo === c.id) o.selected = true; selAssign.appendChild(o); });
    fAssign.appendChild(selAssign); body.appendChild(fAssign);

    const foot = footRow();
    if (!isNew) {
      const del = el('button', 'btn btn-danger', 'Delete'); del.style.flex = '0 0 auto';
      del.addEventListener('click', () => {
        if (confirm('Delete this item?')) { data.items = data.items.filter(i => i.id !== item.id); save(); render(); modal.close(); toast('Deleted'); }
      });
      foot.appendChild(del);
    }
    const saveBtn = el('button', 'btn btn-primary', isNew ? 'Add item' : 'Save');
    saveBtn.addEventListener('click', () => {
      item.title = inTitle.value.trim() || 'Untitled item';
      item.notes = inNotes.value.trim();
      item.status = selStatus.value;
      item.priority = selPrio.value;
      item.dueDate = inDue.value || '';
      item.category = inCat.value.trim();
      item.assignedTo = selAssign.value;
      item.completedAt = isClosed(item) ? (item.completedAt || Date.now()) : null;
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
  function pickPhoto(cb) { photoCallback = cb; const input = $('#photoInput'); input.value = ''; input.click(); }
  $('#photoInput').addEventListener('change', function () {
    const file = this.files && this.files[0];
    if (!file) return;
    readAndResize(file, 1600, dataUrl => { const cb = photoCallback; photoCallback = null; if (cb) cb(dataUrl); });
  });

  function readAndResize(file, maxDim, cb) {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) { const s = maxDim / Math.max(width, height); width = Math.round(width * s); height = Math.round(height * s); }
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
    const state = { tool: 'pen', color: '#ef4444', strokes: existing ? JSON.parse(JSON.stringify(existing)) : [], drawing: false, current: null };
    const scrim = el('div', 'annot-scrim');
    const top = el('div', 'annot-top');
    const cancel = el('button', 'link-btn', 'Cancel');
    const titleEl = el('span', null, 'Markup'); titleEl.style.fontWeight = '700';
    const doneBtn = el('button', 'link-btn', 'Done'); doneBtn.style.fontWeight = '700';
    top.appendChild(cancel); top.appendChild(titleEl); top.appendChild(doneBtn);

    const stage = el('div', 'annot-stage');
    const canvas = el('canvas'); canvas.id = 'annotCanvas'; stage.appendChild(canvas);

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
      b.addEventListener('click', () => { state.tool = name; Object.values(toolBtns).forEach(x => x.classList.remove('active')); b.classList.add('active'); });
      toolBtns[name] = b; tools.appendChild(b);
    });
    tools.appendChild(el('div', 'tool-sep'));
    ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#ffffff', '#000000'].forEach(c => {
      const d = el('button', 'color-dot' + (state.color === c ? ' active' : '')); d.style.background = c;
      d.addEventListener('click', () => { state.color = c; tools.querySelectorAll('.color-dot').forEach(x => x.classList.remove('active')); d.classList.add('active'); });
      tools.appendChild(d);
    });
    tools.appendChild(el('div', 'tool-sep'));
    const undoBtn = el('button', 'tool-btn', '<svg viewBox="0 0 24 24"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>');
    undoBtn.addEventListener('click', () => { state.strokes.pop(); redraw(); });
    tools.appendChild(undoBtn);
    const clearBtn = el('button', 'tool-btn', '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>');
    clearBtn.addEventListener('click', () => { if (confirm('Clear all markup?')) { state.strokes = []; redraw(); } });
    tools.appendChild(clearBtn);

    scrim.appendChild(top); scrim.appendChild(stage); scrim.appendChild(tools);
    $('#modalRoot').appendChild(scrim);

    const baseImg = new Image();
    const ctx = canvas.getContext('2d');
    let scale = 1;
    baseImg.onload = () => { canvas.width = baseImg.width; canvas.height = baseImg.height; fitCanvas(); redraw(); };
    baseImg.src = baseSrc;

    function fitCanvas() {
      const s = Math.min((stage.clientWidth - 8) / canvas.width, (stage.clientHeight - 8) / canvas.height, 1.5);
      scale = s; canvas.style.width = (canvas.width * s) + 'px'; canvas.style.height = (canvas.height * s) + 'px';
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
      ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.w || lineWidth(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (s.type === 'pen') { ctx.beginPath(); s.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); }
      else if (s.type === 'rect') { const [a, b] = s.pts; ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); }
      else if (s.type === 'arrow') {
        const [a, b] = s.pts; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        const ang = Math.atan2(b.y - a.y, b.x - a.x), head = (s.w || lineWidth()) * 4;
        ctx.beginPath(); ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - head * Math.cos(ang - Math.PI / 6), b.y - head * Math.sin(ang - Math.PI / 6));
        ctx.lineTo(b.x - head * Math.cos(ang + Math.PI / 6), b.y - head * Math.sin(ang + Math.PI / 6));
        ctx.closePath(); ctx.fill();
      } else if (s.type === 'text') {
        const size = Math.max(18, Math.round(canvas.width / 22));
        ctx.font = `bold ${size}px -apple-system, Arial, sans-serif`; ctx.textBaseline = 'top';
        ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = s.color === '#ffffff' ? '#000' : '#fff';
        ctx.strokeText(s.text, s.pts[0].x, s.pts[0].y); ctx.fillStyle = s.color; ctx.fillText(s.text, s.pts[0].x, s.pts[0].y);
      }
    }
    function pos(e) {
      const rect = canvas.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      return { x: cx / scale, y: cy / scale };
    }
    function start(e) {
      e.preventDefault(); const p = pos(e);
      if (state.tool === 'text') { const t = prompt('Enter note text:'); if (t && t.trim()) { state.strokes.push({ type: 'text', color: state.color, text: t.trim(), pts: [p] }); redraw(); } return; }
      state.drawing = true;
      state.current = { type: state.tool, color: state.color, w: lineWidth(), pts: state.tool === 'pen' ? [p] : [p, p] };
    }
    function move(e) { if (!state.drawing) return; e.preventDefault(); const p = pos(e); if (state.tool === 'pen') state.current.pts.push(p); else state.current.pts[1] = p; redraw(); }
    function end() { if (!state.drawing) return; state.drawing = false; if (state.current) state.strokes.push(state.current); state.current = null; redraw(); }

    canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false }); canvas.addEventListener('touchmove', move, { passive: false }); canvas.addEventListener('touchend', end);

    function cleanup() { window.removeEventListener('resize', fitCanvas); window.removeEventListener('mouseup', end); scrim.remove(); }
    cancel.addEventListener('click', cleanup);
    doneBtn.addEventListener('click', () => {
      redraw(); const out = canvas.toDataURL('image/jpeg', 0.85);
      if (onSaveAnns) onSaveAnns(state.strokes);
      onSave(out); cleanup(); toast('Markup saved');
    });
  }

  // ============================================================
  //  PROJECTS drawer
  // ============================================================
  function openDrawer() { renderProjects(); $('#drawerScrim').hidden = false; $('#projectsDrawer').classList.add('open'); $('#projectsDrawer').setAttribute('aria-hidden', 'false'); }
  function closeDrawer() { $('#drawerScrim').hidden = true; $('#projectsDrawer').classList.remove('open'); $('#projectsDrawer').setAttribute('aria-hidden', 'true'); }
  function renderProjects() {
    const ul = $('#projectList'); ul.innerHTML = '';
    data.projects.forEach(p => {
      const its = data.items.filter(i => i.projectId === p.id);
      const closed = its.filter(isClosed).length;
      const row = el('li', 'project-row' + (p.id === data.activeProjectId ? ' active' : ''));
      const main = el('div', 'pr-main');
      main.innerHTML = `<div class="pr-name">${esc(p.name)}</div><div class="pr-sub">${closed}/${its.length} done${p.location ? ' · ' + esc(p.location) : ''}</div>`;
      main.addEventListener('click', () => { data.activeProjectId = p.id; currentFilter = 'all'; syncFilterChips(); save(); render(); closeDrawer(); });
      const edit = el('button', 'icon-btn pr-del', '<svg viewBox="0 0 24 24" style="width:18px;height:18px"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>');
      edit.addEventListener('click', e => { e.stopPropagation(); editProject(p); });
      row.appendChild(main); row.appendChild(edit); ul.appendChild(row);
    });
  }
  function editProject(p) {
    const isNew = !p;
    p = p || { id: uid(), name: '', location: '', createdAt: Date.now() };
    const body = el('div');
    const f1 = el('div', 'field', '<label>Punchlist name</label>');
    const n = el('input'); n.type = 'text'; n.placeholder = 'e.g. 123 Main St — Unit 4B'; n.value = p.name || ''; f1.appendChild(n); body.appendChild(f1);
    const f2 = el('div', 'field', '<label>Location / address (optional)</label>');
    const loc = el('input'); loc.type = 'text'; loc.placeholder = 'Project address or area'; loc.value = p.location || ''; f2.appendChild(loc); body.appendChild(f2);
    const foot = footRow();
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
      p.name = n.value.trim() || 'Untitled punchlist'; p.location = loc.value.trim();
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
    const body = el('div'); const list = el('div');
    function renderContacts() {
      list.innerHTML = '';
      if (!data.contacts.length) list.appendChild(el('p', 'helper', 'No contacts yet. Add subs, owners, or teammates so you can assign items and send them the list.'));
      data.contacts.forEach(c => {
        const row = el('div', 'contact-row');
        row.appendChild(el('div', 'contact-avatar', esc(initials(c.name))));
        const info = el('div', 'contact-info');
        info.innerHTML = `<div class="cn">${esc(c.name)}</div><div class="cc">${esc([c.company, c.email, c.phone].filter(Boolean).join(' · '))}</div>`;
        row.appendChild(info);
        const acts = el('div', 'contact-actions');
        const ed = el('button', 'icon-btn', '<svg viewBox="0 0 24 24" style="width:18px;height:18px"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>');
        ed.addEventListener('click', () => editContact(c, renderContacts));
        acts.appendChild(ed); row.appendChild(acts); list.appendChild(row);
      });
    }
    renderContacts(); body.appendChild(list);
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
      const i = el('input'); i.type = type || 'text'; i.placeholder = ph || ''; i.value = c[key] || ''; i.dataset.key = key; f.appendChild(i); body.appendChild(f); return i;
    };
    mk('Name', 'name', 'text', 'Full name'); mk('Company / trade', 'company', 'text', 'e.g. ACME Electric');
    mk('Email', 'email', 'email', 'name@example.com'); mk('Phone', 'phone', 'tel', '(555) 123-4567');
    const foot = footRow();
    if (!isNew) {
      const del = el('button', 'btn btn-danger', 'Delete'); del.style.flex = '0 0 auto';
      del.addEventListener('click', () => {
        if (confirm('Delete this contact?')) { data.contacts = data.contacts.filter(x => x.id !== c.id); data.items.forEach(i => { if (i.assignedTo === c.id) i.assignedTo = ''; }); save(); after && after(); modal.close(); }
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
  //  EXPORT hub — Send list, PDF report, backup
  // ============================================================
  function openExport() {
    if (!projectItems().length) { toast('Add some items first'); return; }
    const body = el('div');
    body.appendChild(el('p', 'helper', 'Send this punchlist or generate a report to share with owners and subs.'));
    const mkOpt = (title, sub, handler) => {
      const b = el('button', 'btn-block'); b.style.textAlign = 'left'; b.style.marginTop = '10px';
      b.innerHTML = `<div style="font-weight:700">${esc(title)}</div><div style="font-size:.78rem;color:var(--text-dim);font-weight:400;margin-top:2px">${esc(sub)}</div>`;
      b.addEventListener('click', () => { modal.close(); handler(); });
      body.appendChild(b);
    };
    mkOpt('📄 PDF report', 'A shareable PDF with photos, notes, status & due dates', openReport);
    mkOpt('✉️ Send as text/email', 'A quick text summary via email or your share sheet', openSend);
    mkOpt('💾 Export backup', 'Save all your data to a file (move to another device)', exportBackup);
    const modal = openSheet('Share / export', body);
  }

  // ---------- Text / email send ----------
  function openSend() {
    const proj = activeProject();
    const body = el('div');
    body.appendChild(el('p', 'helper', 'On a phone this opens your share sheet or email with the summary; photos are attached where your device supports it.'));
    const fTo = el('div', 'field', '<label>Send to</label>');
    const sel = el('select');
    const cust = el('option', null, 'Enter email manually…'); cust.value = '__manual'; sel.appendChild(cust);
    data.contacts.filter(c => c.email).forEach(c => { const o = el('option', null, `${c.name} (${c.email})`); o.value = c.id; sel.appendChild(o); });
    fTo.appendChild(sel); body.appendChild(fTo);
    const fManual = el('div', 'field');
    const man = el('input'); man.type = 'email'; man.placeholder = 'email@example.com'; fManual.appendChild(man); body.appendChild(fManual);
    function syncManual() { fManual.style.display = sel.value === '__manual' ? 'block' : 'none'; }
    sel.addEventListener('change', syncManual); syncManual();
    const fScope = el('div', 'field', '<label>Include</label>');
    const scope = el('select');
    [['open', 'Open / in-progress items'], ['all', 'All items'], ['closed', 'Completed items only']].forEach(([v, l]) => { const o = el('option', null, l); o.value = v; scope.appendChild(o); });
    fScope.appendChild(scope); body.appendChild(fScope);
    const foot = footRow();
    const shareBtn = el('button', 'btn btn-primary', 'Share'); shareBtn.addEventListener('click', () => doSend(proj, sel, man, scope.value, true));
    const emailBtn = el('button', 'btn btn-ghost', 'Email'); emailBtn.addEventListener('click', () => doSend(proj, sel, man, scope.value, false));
    foot.appendChild(emailBtn); foot.appendChild(shareBtn);
    const modal = openSheet('Send punchlist', body, foot);
    openSend._close = modal.close;
  }
  function recipientEmail(sel, man) {
    if (sel.value === '__manual') return man.value.trim();
    const c = data.contacts.find(x => x.id === sel.value); return c ? c.email : '';
  }
  function scopedItems(scope) {
    let items = projectItems();
    if (scope === 'open') items = items.filter(i => !isClosed(i));
    if (scope === 'closed') items = items.filter(isClosed);
    return items.slice().sort((a, b) => (isClosed(a) === isClosed(b) ? b.createdAt - a.createdAt : isClosed(a) ? 1 : -1));
  }
  function buildText(proj, scope) {
    const items = scopedItems(scope);
    const all = projectItems(); const closed = all.filter(isClosed).length;
    const lines = [`PUNCHLIST: ${proj.name}`];
    if (proj.location) lines.push(proj.location);
    lines.push(`Progress: ${closed}/${all.length} complete`, '');
    if (!items.length) lines.push('(No items in this selection.)');
    items.forEach((it, n) => {
      const box = isClosed(it) ? '[x]' : '[ ]';
      const bits = [statusDef(it.status).label];
      if (it.priority === 'high' && !isClosed(it)) bits.push('HIGH');
      if (it.dueDate) bits.push((isOverdue(it) ? 'OVERDUE ' : 'due ') + fmtDate(it.dueDate));
      if (it.category) bits.push(it.category);
      lines.push(`${box} ${n + 1}. ${it.title}  —  ${bits.join(' · ')}`);
      if (it.notes) lines.push(`     ${it.notes.replace(/\n/g, '\n     ')}`);
      const who = contactName(it.assignedTo); if (who) lines.push(`     Assigned: ${who}`);
    });
    lines.push('', 'Sent from Punchlist');
    return { text: lines.join('\n'), items };
  }
  async function doSend(proj, sel, man, scope, preferShare) {
    const email = recipientEmail(sel, man);
    const { text, items } = buildText(proj, scope);
    const subject = `Punchlist: ${proj.name}`;
    if (preferShare && navigator.share) {
      const files = [];
      if (navigator.canShare) {
        for (const it of items) {
          if (it.photo && files.length < 8) {
            try { const blob = await (await fetch(it.photo)).blob(); files.push(new File([blob], `${(it.title || 'item').replace(/[^a-z0-9]+/gi, '_').slice(0, 30)}.jpg`, { type: 'image/jpeg' })); } catch (e) {}
          }
        }
      }
      try {
        const payload = { title: subject, text };
        if (files.length && navigator.canShare && navigator.canShare({ files })) payload.files = files;
        await navigator.share(payload);
        if (openSend._close) openSend._close(); return;
      } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    if (mailto.length > 1900) { try { await navigator.clipboard.writeText(text); toast('Summary copied to clipboard'); } catch (e) {} }
    window.location.href = mailto;
    if (openSend._close) openSend._close();
  }

  // ---------- PDF report ----------
  function openReport() {
    const body = el('div');
    body.appendChild(el('p', 'helper', 'Creates a PDF you can save or email. Great for owner walk-throughs and closing out subs.'));
    const fScope = el('div', 'field', '<label>Include items</label>');
    const scope = el('select');
    [['open', 'Open / in-progress'], ['all', 'All items'], ['closed', 'Completed only']].forEach(([v, l]) => { const o = el('option', null, l); o.value = v; scope.appendChild(o); });
    fScope.appendChild(scope); body.appendChild(fScope);
    const photoRow = el('div', 'checkbox-row');
    const cb = el('input'); cb.type = 'checkbox'; cb.id = 'inclPhotos'; cb.checked = true;
    const lbl = el('label', null, 'Include photos'); lbl.htmlFor = 'inclPhotos';
    photoRow.appendChild(cb); photoRow.appendChild(lbl); body.appendChild(photoRow);
    const foot = footRow();
    const dl = el('button', 'btn btn-ghost', 'Download'); dl.addEventListener('click', () => makePDF(scope.value, cb.checked, 'download'));
    const share = el('button', 'btn btn-primary', 'Share PDF'); share.addEventListener('click', () => makePDF(scope.value, cb.checked, 'share'));
    foot.appendChild(dl); foot.appendChild(share);
    const modal = openSheet('PDF report', body, foot);
    openReport._close = modal.close;
  }

  async function makePDF(scope, includePhotos, mode) {
    if (!window.jspdf || !window.jspdf.jsPDF) { toast('PDF engine not loaded'); return; }
    toast('Building PDF…');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const proj = activeProject();
    const items = scopedItems(scope);
    const all = projectItems(); const closed = all.filter(isClosed).length;

    const M = 40, PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
    const CW = PW - M * 2;
    let y = M;

    // ---- header band ----
    doc.setFillColor(37, 99, 235); doc.rect(0, 0, PW, 74, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
    doc.text('PUNCHLIST', M, 34);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(12);
    doc.text(doc.splitTextToSize(proj.name, CW)[0], M, 54);
    doc.setFontSize(9);
    doc.text(new Date().toLocaleDateString(), PW - M, 30, { align: 'right' });
    doc.text(`${closed}/${all.length} complete`, PW - M, 46, { align: 'right' });
    y = 92;
    doc.setTextColor(30);
    if (proj.location) { doc.setFontSize(10); doc.setTextColor(90); doc.text(proj.location, M, y); y += 16; doc.setTextColor(30); }
    doc.setDrawColor(220); doc.line(M, y, PW - M, y); y += 18;

    const hexToRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    function ensure(h) { if (y + h > PH - M) { addFooter(); doc.addPage(); y = M; } }

    if (!items.length) { doc.setFontSize(11); doc.text('No items in this selection.', M, y); }

    items.forEach((it, n) => {
      const st = statusDef(it.status);
      // measure text block
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
      const titleLines = doc.splitTextToSize(`${n + 1}. ${it.title || 'Untitled item'}`, CW);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      const metaBits = [st.label.toUpperCase()];
      if (it.priority && !st.done) metaBits.push(it.priority === 'high' ? 'HIGH' : it.priority === 'low' ? 'LOW' : 'MED');
      if (it.dueDate) metaBits.push((isOverdue(it) ? 'OVERDUE ' : 'Due ') + fmtDate(it.dueDate));
      if (it.category) metaBits.push(it.category);
      const who = contactName(it.assignedTo); if (who) metaBits.push('→ ' + who);
      const noteLines = it.notes ? doc.splitTextToSize(it.notes, CW) : [];

      // photo dims
      let imgW = 0, imgH = 0;
      if (includePhotos && it.photo) {
        try {
          const props = doc.getImageProperties(it.photo);
          const maxW = Math.min(230, CW), maxH = 175;
          const r = Math.min(maxW / props.width, maxH / props.height);
          imgW = props.width * r; imgH = props.height * r;
        } catch (e) { imgW = imgH = 0; }
      }

      const textH = titleLines.length * 15 + 14 + noteLines.length * 13;
      const blockH = Math.max(textH, imgH) + 16;
      ensure(blockH + 8);

      // status color chip
      const [r, g, bl] = hexToRgb(st.color);
      doc.setFillColor(r, g, bl); doc.roundedRect(M, y - 2, 5, blockH - 8, 2, 2, 'F');

      const tx = M + 14;
      doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
      let ty = y + 11; titleLines.forEach(l => { doc.text(l, tx, ty); ty += 15; });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(r, g, bl);
      doc.text(metaBits.join('   ·   '), tx, ty); ty += 14;
      if (noteLines.length) { doc.setTextColor(70); doc.setFontSize(9.5); noteLines.forEach(l => { doc.text(l, tx, ty); ty += 13; }); }

      if (imgW) {
        try { doc.addImage(it.photo, 'JPEG', PW - M - imgW, y, imgW, imgH); } catch (e) {}
      }

      y += blockH;
      doc.setDrawColor(235); doc.line(M, y - 4, PW - M, y - 4);
      y += 6;
    });

    addFooter();
    function addFooter() {
      const pg = doc.internal.getCurrentPageInfo ? doc.internal.getCurrentPageInfo().pageNumber : doc.internal.getNumberOfPages();
      doc.setFontSize(8); doc.setTextColor(150);
      doc.text('Generated by Punchlist', M, PH - 20);
      doc.text('Page ' + pg, PW - M, PH - 20, { align: 'right' });
    }

    const safe = (proj.name || 'punchlist').replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
    const filename = `Punchlist_${safe}_${todayStr()}.pdf`;

    if (mode === 'share' && navigator.canShare) {
      try {
        const blob = doc.output('blob');
        const file = new File([blob], filename, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Punchlist: ' + proj.name });
          if (openReport._close) openReport._close();
          return;
        }
      } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    // download fallback
    doc.save(filename);
    if (openReport._close) openReport._close();
    toast('PDF ready');
  }

  // ============================================================
  //  Backup export / import
  // ============================================================
  function exportBackup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a'); a.href = url; a.download = `punchlist-backup-${todayStr()}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
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
          migrateItems();
          save(); render(); closeDrawer(); toast('Backup imported');
        }
      } catch (err) { toast('Could not read that file'); }
    };
    reader.readAsText(file);
  }

  // ============================================================
  //  Wire up UI
  // ============================================================
  function syncFilterChips() {
    document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.filter === currentFilter));
  }

  function init() {
    load();
    render();

    $('#addPhotoBtn').addEventListener('click', () => pickPhoto(dataUrl => openItemEditor(null, dataUrl)));
    $('#addNoteBtn').addEventListener('click', () => openItemEditor(null));

    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => { currentFilter = chip.dataset.filter; syncFilterChips(); render(); });
    });

    $('#menuBtn').addEventListener('click', openDrawer);
    $('#closeDrawer').addEventListener('click', closeDrawer);
    $('#drawerScrim').addEventListener('click', closeDrawer);
    $('#newProjectBtn').addEventListener('click', () => editProject(null));
    $('#contactsBtn').addEventListener('click', openContacts);
    $('#shareBtn').addEventListener('click', openExport);

    $('#exportBtn').addEventListener('click', exportBackup);
    $('#importBtn').addEventListener('click', () => $('#importInput').click());
    $('#importInput').addEventListener('change', function () { if (this.files && this.files[0]) importBackup(this.files[0]); this.value = ''; });

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', init);
})();
