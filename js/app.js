/* 教育学学术导航 - 前端逻辑 */
(function () {
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  const els = {
    grid: $('#grid'),
    tags: $('#tags'),
    dParent: $('#disciplineParent'),
    dList: $('#disciplineList'),
    dClear: $('#disciplineClear'),
    search: $('#searchInput'),
    count: $('#countInfo'),
    lastUpdated: $('#lastUpdated'),
    themeToggle: $('#themeToggle'),
    importBtn: $('#importBtn'),
    exportBtn: $('#exportBtn'),
    resetBtn: $('#resetBtn'),
    fileInput: $('#fileInput'),
  };

  const STORAGE_KEYS = {
    data: 'nav:resourcesJSON',
    theme: 'nav:theme',
    admin: 'nav:admin',
  };

  const state = {
    data: { meta: {}, resources: [] },
    disc: { root: { code: '04', name: '教育学' }, categories: [] },
    allTags: [],
    tagCounts: new Map(),
    selectedTags: new Set(),
    selectedDisciplines: new Set(),
    selectedParent: 'all',
    searchText: '',
  };

  // 管理员模式：默认仅在本地/带参时启用
  const isLocal = ['localhost','127.0.0.1','::1'].includes(location.hostname) || location.protocol === 'file:';
  const url = new URL(location.href);
  const adminByParam = url.searchParams.get('admin') === '1' || (location.hash || '').toLowerCase().includes('admin');
  let isAdmin = isLocal || adminByParam || localStorage.getItem(STORAGE_KEYS.admin) === '1';
  if (isAdmin) document.documentElement.classList.add('admin');

  let dragDropReady = false;

  init();

  async function init() {
    initTheme();
    await loadData();
    await loadDisciplines();
    buildTagIndex();
    bindEvents();
    renderAll();
    if (isAdmin) setupDragDrop();
    bindAdminHotkey();
  }

  function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEYS.theme);
    let theme = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(theme);
    els.themeToggle.addEventListener('click', () => {
      theme = (document.documentElement.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
      applyTheme(theme);
      localStorage.setItem(STORAGE_KEYS.theme, theme);
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function bindAdminHotkey() {
    // Ctrl+. 或 Cmd+. 切换管理员模式（持久化到 localStorage）
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '.') {
        e.preventDefault();
        isAdmin = !document.documentElement.classList.contains('admin');
        document.documentElement.classList.toggle('admin');
        localStorage.setItem(STORAGE_KEYS.admin, document.documentElement.classList.contains('admin') ? '1' : '0');
        if (document.documentElement.classList.contains('admin') && !dragDropReady) {
          setupDragDrop();
        }
      }
    });
  }

  async function loadData() {
    const local = localStorage.getItem(STORAGE_KEYS.data);
    if (local) {
      try {
        state.data = JSON.parse(local);
        updateLastUpdated();
        return;
      } catch (e) {
        console.warn('本地数据解析失败，将加载默认数据。', e);
      }
    }
    // 加载默认数据
    try {
      const res = await fetch('data/resources.json', { cache: 'no-store' });
      state.data = await res.json();
      updateLastUpdated();
    } catch (e) {
      console.error('无法加载默认数据。', e);
      state.data = { meta: {}, resources: [] };
    }
  }

  async function loadDisciplines() {
    try {
      const res = await fetch('data/disciplines.json', { cache: 'no-store' });
      state.disc = await res.json();
    } catch (e) {
      console.warn('未能加载学科分类，将使用内置最小分类。', e);
      state.disc = { root: { code: '04', name: '教育学' }, categories: [] };
    }
  }

  function updateLastUpdated() {
    const metaDate = state.data?.meta?.lastUpdated;
    let latest = metaDate ? new Date(metaDate) : null;
    for (const r of state.data.resources || []) {
      if (r.updatedAt) {
        const d = new Date(r.updatedAt);
        if (!latest || d > latest) latest = d;
      }
    }
    els.lastUpdated.textContent = '上次更新：' + (latest ? latest.toISOString().slice(0, 10) : '—');
  }

  function buildTagIndex() {
    const counts = new Map();
    for (const r of state.data.resources) {
      for (const t of (r.tags || [])) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    state.tagCounts = counts;
    state.allTags = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b, 'zh'));
  }

  function bindEvents() {
    els.search.addEventListener('input', (e) => {
      state.searchText = e.target.value.trim();
      renderAll();
    });

    els.importBtn.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', onPickFile);
    els.exportBtn.addEventListener('click', doExport);
    els.resetBtn.addEventListener('click', () => {
      if (confirm('确定要移除本地数据并恢复默认吗？')) {
        localStorage.removeItem(STORAGE_KEYS.data);
        location.reload();
      }
    });

    // 学科筛选交互
    renderDisciplineParents();
    els.dParent.addEventListener('change', () => {
      state.selectedParent = els.dParent.value;
      // 移除不属于当前父类的已选项
      if (state.selectedParent !== 'all') {
        const allowed = new Set(getChildrenCodes(state.selectedParent));
        for (const c of Array.from(state.selectedDisciplines)) {
          if (!allowed.has(c)) state.selectedDisciplines.delete(c);
        }
      }
      renderAll();
    });
    els.dClear.addEventListener('click', () => {
      state.selectedDisciplines.clear();
      renderAll();
    });
  }

  function setupDragDrop() {
    const overlay = document.createElement('div');
    overlay.className = 'drop-overlay';
    overlay.textContent = '释放以导入本地 JSON 数据';
    document.body.appendChild(overlay);

    ['dragenter','dragover'].forEach(evt => document.addEventListener(evt, (e) => {
      if (hasFiles(e)) { e.preventDefault(); overlay.classList.add('active'); }
    }));
    ['dragleave','drop'].forEach(evt => document.addEventListener(evt, (e) => {
      if (evt === 'drop') return; // 在 drop 时统一处理
      overlay.classList.remove('active');
    }));
    document.addEventListener('drop', (e) => {
      overlay.classList.remove('active');
      if (!hasFiles(e)) return;
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      readJSONFile(file);
    });

    function hasFiles(e) {
      return e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    }
    dragDropReady = true;
  }

  function onPickFile(e) {
    const file = e.target.files?.[0];
    if (file) readJSONFile(file);
    e.target.value = '';
  }

  function readJSONFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (!obj || typeof obj !== 'object' || !Array.isArray(obj.resources)) {
          alert('JSON 结构无效：需要包含 resources 数组。');
          return;
        }
        localStorage.setItem(STORAGE_KEYS.data, JSON.stringify(obj, null, 2));
        state.data = obj;
        updateLastUpdated();
        buildTagIndex();
        state.selectedTags.clear();
        state.searchText = '';
        els.search.value = '';
        renderAll();
        alert('导入成功！已使用本地数据预览。部署时请同步更新 data/resources.json。');
      } catch (err) {
        console.error(err);
        alert('解析失败：请确认是有效的 JSON 文件。');
      }
    };
    reader.readAsText(file);
  }

  function doExport() {
    const data = localStorage.getItem(STORAGE_KEYS.data) || JSON.stringify(state.data, null, 2);
    const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().slice(0,10);
    a.download = `resources-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderAll() {
    renderTags();
    renderDisciplineList();
    renderGrid();
  }

  function renderDisciplineParents() {
    const sel = els.dParent;
    if (!sel) return;
    // 清空并重建
    sel.innerHTML = '<option value="all">全部一级学科</option>';
    for (const cat of state.disc.categories || []) {
      const opt = document.createElement('option');
      opt.value = cat.code;
      opt.textContent = `${cat.code} ${cat.name}`;
      sel.appendChild(opt);
    }
    sel.value = state.selectedParent || 'all';
  }

  function renderDisciplineList() {
    const host = els.dList;
    if (!host) return;
    host.innerHTML = '';
    const frag = document.createDocumentFragment();

    let items = [];
    if (state.selectedParent === 'all') {
      for (const cat of state.disc.categories || []) {
        if (cat.children && cat.children.length) {
          items.push(...cat.children);
        } else {
          // 无子项，使用自身作为可选项
          items.push({ code: cat.code, name: cat.name });
        }
      }
    } else {
      const cat = (state.disc.categories || []).find(c => c.code === state.selectedParent);
      if (cat) {
        items = (cat.children && cat.children.length) ? cat.children : [{ code: cat.code, name: cat.name }];
      }
    }

    // 去重并按代码排序
    const seen = new Set();
    items = items.filter(i => {
      if (seen.has(i.code)) return false; seen.add(i.code); return true;
    }).sort((a,b) => a.code.localeCompare(b.code));

    for (const d of items) {
      const btn = document.createElement('button');
      const selected = state.selectedDisciplines.has(d.code);
      btn.className = 'tag' + (selected ? ' selected' : '');
      btn.type = 'button';
      btn.innerHTML = `<span>${d.code} ${escapeHTML(d.name)}</span>`;
      btn.addEventListener('click', () => {
        if (state.selectedDisciplines.has(d.code)) state.selectedDisciplines.delete(d.code);
        else state.selectedDisciplines.add(d.code);
        renderAll();
      });
      frag.appendChild(btn);
    }
    host.appendChild(frag);
  }

  function renderTags() {
    els.tags.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const tag of state.allTags) {
      const count = state.tagCounts.get(tag) || 0;
      const el = document.createElement('button');
      el.className = 'tag' + (state.selectedTags.has(tag) ? ' selected' : '');
      el.type = 'button';
      el.setAttribute('aria-pressed', state.selectedTags.has(tag) ? 'true' : 'false');
      el.innerHTML = `<span>${escapeHTML(tag)}</span><span class="count">${count}</span>`;
      el.addEventListener('click', () => {
        if (state.selectedTags.has(tag)) state.selectedTags.delete(tag); else state.selectedTags.add(tag);
        renderAll();
      });
      frag.appendChild(el);
    }
    els.tags.appendChild(frag);
  }

  function renderGrid() {
    const term = state.searchText.toLowerCase();
    const needTags = state.selectedTags;
    const data = state.data.resources
      .filter(r => filterByText(r, term))
      .filter(r => filterByTags(r, needTags))
      .filter(r => filterByDisciplines(r, state.selectedDisciplines))
      .sort((a, b) => {
        const pa = !!a.pinned, pb = !!b.pinned;
        if (pa !== pb) return pb - pa; // 置顶优先
        return a.name.localeCompare(b.name, 'zh');
      });

    els.grid.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const r of data) frag.appendChild(renderCard(r));
    els.grid.appendChild(frag);

    const total = state.data.resources.length;
    els.count.textContent = `共 ${total} 个资源，筛选出 ${data.length} 个`;
  }

  function filterByText(r, term) {
    if (!term) return true;
    const hay = `${r.name}\n${r.description || ''}\n${(r.tags || []).join(' ')}`.toLowerCase();
    return hay.includes(term);
  }

  function filterByTags(r, need) {
    if (!need || need.size === 0) return true;
    const set = new Set(r.tags || []);
    for (const t of need) if (!set.has(t)) return false;
    return true;
  }

  function filterByDisciplines(r, need) {
    if (!need || need.size === 0) return true;
    const list = r.disciplines || [];
    if (!Array.isArray(list) || list.length === 0) return false;
    // 匹配规则：代码前缀视为祖先/后代匹配（如 0401 包含 040101）
    for (const sel of need) {
      for (const code of list) {
        if (code.startsWith(sel) || sel.startsWith(code)) return true;
      }
    }
    return false;
  }

  function getChildrenCodes(parentCode) {
    const cat = (state.disc.categories || []).find(c => c.code === parentCode);
    if (!cat) return [];
    const children = (cat.children && cat.children.length) ? cat.children.map(x => x.code) : [cat.code];
    return children;
  }

  function renderCard(r) {
    const card = document.createElement('div');
    card.className = 'card';

    const a = document.createElement('a');
    a.href = r.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    const fav = document.createElement('div');
    fav.className = 'favicon';
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    try {
      const domain = new URL(r.url).hostname;
      img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
    } catch {
      img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; // 占位
    }
    fav.appendChild(img);

    const main = document.createElement('div');
    main.className = 'card-main';
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = r.name;
    const desc = document.createElement('div');
    desc.className = 'card-desc';
    desc.textContent = r.description || '';
    const tags = document.createElement('div');
    tags.className = 'card-tags';
    for (const t of (r.tags || [])) {
      const s = document.createElement('span');
      s.className = 'card-tag';
      s.textContent = t;
      tags.appendChild(s);
    }

    main.appendChild(title);
    main.appendChild(desc);
    main.appendChild(tags);

    a.appendChild(fav);
    a.appendChild(main);
    card.appendChild(a);
    return card;
  }

  function escapeHTML(s) {
    const map = {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"};
    return s.replace(/[&<>\"']/g, c => map[c] || c);
  }
})();
