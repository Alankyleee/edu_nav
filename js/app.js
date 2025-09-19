/* 教育学学术导航 - 前端逻辑 */
(function () {
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  const els = {
    grid: $('#grid'),
    tags: $('#tags'),
    acadForm: $('#acadForm'),
    acadProvider: $('#acadProvider'),
    acadQuery: $('#acadQuery'),
    acadSite: $('#acadSite'),
    acadTime: $('#acadTime'),
    dMenuBtn: $('#disciplineMenuBtn'),
    dMenu: $('#disciplineDropdown'),
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
    submitBtn: $('#submitBtn'),
    drawer: $('#submitDrawer'),
    drawerClose: $('#drawerClose'),
    sForm: $('#submitForm'),
    sName: $('#sName'),
    sUrl: $('#sUrl'),
    sDesc: $('#sDesc'),
    sTags: $('#sTags'),
    sDisc: $('#sDisc'),
    sContact: $('#sContact'),
    capQ: $('#capQuestion'),
    capRefresh: $('#capRefresh'),
    capAnswer: $('#capAnswer'),
    submitHint: $('#submitHint'),
    reviewBtn: $('#reviewBtn'),
    reviewDrawer: $('#reviewDrawer'),
    reviewClose: $('#reviewClose'),
    adminToken: $('#adminToken'),
    saveAdminToken: $('#saveAdminToken'),
    clearAdminToken: $('#clearAdminToken'),
    reviewFilter: $('#reviewFilter'),
    reviewOnlyPending: $('#reviewOnlyPending'),
    reviewList: $('#reviewList'),
    reviewLoadMore: $('#reviewLoadMore'),
    reviewHint: $('#reviewHint'),
  };

  const STORAGE_KEYS = {
    data: 'nav:resourcesJSON',
    theme: 'nav:theme',
    admin: 'nav:admin',
    acadProvider: 'nav:acadProvider',
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
    acadProvider: 'gscholar',
    acadTime: '',
    captcha: { a: 0, b: 0, op: '+', ans: 0 },
    review: { items: [], cursor: null, busy: false, status: 'all', onlyPending: false },
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
    initAcademicSearch();
    await loadData();
    await loadDisciplines();
    buildTagIndex();
    bindEvents();
    renderAll();
    if (isAdmin) setupDragDrop();
    bindAdminHotkey();
    setupSubmitDrawer();
    setupReviewDrawer();
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

    // 学术搜索
    if (els.acadForm) {
      els.acadForm.addEventListener('submit', (e) => {
        e.preventDefault();
        let q = (els.acadQuery?.value || '').trim();
        const site = sanitizeSite((els.acadSite?.value || '').trim());
        const prov = (els.acadProvider?.value) || state.acadProvider || 'gscholar';
        const timeSel = (els.acadTime?.value || '').trim();
        openAcademicSearch(prov, q, site, timeSel);
      });
      els.acadProvider?.addEventListener('change', () => {
        state.acadProvider = els.acadProvider.value;
        localStorage.setItem(STORAGE_KEYS.acadProvider, state.acadProvider);
      });
      els.acadTime?.addEventListener('change', () => {
        state.acadTime = els.acadTime.value;
      });
    }

    // 学科筛选交互
    if (els.dMenuBtn && els.dMenu) {
      // 用 pointerdown 提升稳定性，避免 select 弹出时误触发外部关闭
      els.dMenuBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const shouldOpen = els.dMenu.hasAttribute('hidden');
        toggleDisciplineDropdown(shouldOpen);
      });
      document.addEventListener('pointerdown', (e) => {
        if (!els.dMenu || els.dMenu.hasAttribute('hidden')) return;
        const target = e.target;
        if (els.dMenu.contains(target) || els.dMenuBtn.contains(target)) return;
        toggleDisciplineDropdown(false);
      });
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && els.dMenu && !els.dMenu.hasAttribute('hidden')) {
          toggleDisciplineDropdown(false);
        }
        if ((e.key === 'Enter' || e.key === ' ') && document.activeElement === els.dMenuBtn) {
          e.preventDefault();
          const shouldOpen = els.dMenu.hasAttribute('hidden');
          toggleDisciplineDropdown(shouldOpen);
        }
      });
    }
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

  function setupSubmitDrawer() {
    if (!els.submitBtn || !els.drawer) return;
    const open = () => { els.drawer.removeAttribute('hidden'); newCaptcha(); els.capAnswer && (els.capAnswer.value = ''); els.submitHint && (els.submitHint.textContent = ''); };
    const close = () => { els.drawer.setAttribute('hidden', ''); };
    els.submitBtn.addEventListener('click', open);
    els.drawerClose?.addEventListener('click', close);
    els.drawer.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-close') === 'drawer') close();
    });
    els.capRefresh?.addEventListener('click', (e) => { e.preventDefault(); newCaptcha(); els.capAnswer && (els.capAnswer.value = ''); });
    els.sForm?.addEventListener('submit', onSubmitForm);
  }

  function setupReviewDrawer() {
    if (!els.reviewBtn || !els.reviewDrawer) return;
    const open = () => {
      els.reviewDrawer.removeAttribute('hidden');
      // preload token
      const t = localStorage.getItem('nav:adminToken') || '';
      if (els.adminToken) els.adminToken.value = t;
      state.review.items = [];
      state.review.cursor = null;
      renderReviewList();
      // auto-load first page
      reviewLoad(true).catch(() => {});
    };
    const close = () => { els.reviewDrawer.setAttribute('hidden', ''); };
    els.reviewBtn.addEventListener('click', open);
    els.reviewClose?.addEventListener('click', close);
    els.reviewDrawer.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-close') === 'review') close();
    });
    els.saveAdminToken?.addEventListener('click', () => {
      const v = (els.adminToken?.value || '').trim();
      localStorage.setItem('nav:adminToken', v);
      state.review.items = [];
      state.review.cursor = null;
      renderReviewList();
      reviewLoad(true).catch(() => {});
    });
    els.clearAdminToken?.addEventListener('click', () => {
      localStorage.removeItem('nav:adminToken');
      if (els.adminToken) els.adminToken.value = '';
    });
    els.reviewLoadMore?.addEventListener('click', () => reviewLoad(false));
    els.reviewFilter?.addEventListener('change', () => {
      state.review.status = els.reviewFilter.value;
      renderReviewList();
    });
    els.reviewOnlyPending?.addEventListener('change', () => {
      state.review.onlyPending = !!els.reviewOnlyPending.checked;
      renderReviewList();
    });
  }

  async function reviewLoad(reset) {
    if (state.review.busy) return;
    const token = localStorage.getItem('nav:adminToken') || '';
    if (!token) { setReviewHint('请先填写管理员令牌'); return; }
    state.review.busy = true;
    setReviewHint('加载中…');
    try {
      const params = new URLSearchParams();
      params.set('limit', '20');
      if (!reset && state.review.cursor) params.set('cursor', state.review.cursor);
      const r = await fetch(`/api/admin_list?${params.toString()}`, { headers: { 'x-admin-token': token } });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);
      if (reset) state.review.items = [];
      state.review.items.push(...(data.items || []));
      state.review.cursor = data.nextCursor || null;
      renderReviewList();
      setReviewHint(data.complete ? '已加载全部' : '');
    } catch (err) {
      console.warn(err);
      setReviewHint('加载失败：令牌或网络错误');
    } finally {
      state.review.busy = false;
    }
  }

  function setReviewHint(msg) { if (els.reviewHint) els.reviewHint.textContent = msg; }

  function renderReviewList() {
    if (!els.reviewList) return;
    const filter = state.review.status || 'all';
    let items = (state.review.items || []).filter(x => filter === 'all' ? true : (x.status || 'pending') === filter);
    if (state.review.onlyPending) items = items.filter(x => (x.status || 'pending') === 'pending');
    els.reviewList.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const it of items) frag.appendChild(renderReviewItem(it));
    els.reviewList.appendChild(frag);
  }

  function renderReviewItem(it) {
    const div = document.createElement('div');
    div.className = 'review-item';
    const status = it.status || 'pending';
    const pill = `<span class="pill ${status}">${status}</span>`;
    const desc = escapeHTML(it.description || '');
    const tags = (it.tags || []).map(t => `<span class="pill">${escapeHTML(t)}</span>`).join(' ');
    const disc = (it.disciplines || []).map(d => `<span class="pill">${escapeHTML(d)}</span>`).join(' ');
    div.innerHTML = `
      <div class="row"><span class="title">${escapeHTML(it.name)}</span> ${pill}</div>
      <div class="row"><a href="${it.url}" target="_blank" rel="noopener noreferrer">${escapeHTML(it.url)}</a></div>
      <div class="row">${desc}</div>
      <div class="row">标签：${tags || '—'}</div>
      <div class="row">学科：${disc || '—'}</div>
      <div class="row small muted">提交时间：${escapeHTML(it.ts || '')}，联系：${escapeHTML(it.contact || '-')}, 来源：${escapeHTML(it.page || '-')}</div>
      <div class="row" style="width:100%;">
        <input class="note" type="text" placeholder="备注（可选，仅管理员可见）" value="${escapeHTML(it.adminNote || '')}" style="flex:1 1 auto; min-width:200px; padding:8px 10px; border:1px solid var(--border); border-radius:8px; background:var(--bg); color:var(--fg);" />
      </div>
      <div class="row">
        <button class="btn btn-minor act-approve">通过</button>
        <button class="btn btn-minor act-reject">拒绝</button>
      </div>
    `;
    const approveBtn = div.querySelector('.act-approve');
    const rejectBtn = div.querySelector('.act-reject');
    const noteEl = div.querySelector('.note');
    const disabled = status === 'approved' || status === 'rejected';
    if (disabled) {
      approveBtn.setAttribute('disabled','true');
      rejectBtn.setAttribute('disabled','true');
    }
    approveBtn.addEventListener('click', () => changeStatus(it.id, 'approved', div, noteEl?.value || ''));
    rejectBtn.addEventListener('click', () => changeStatus(it.id, 'rejected', div, noteEl?.value || ''));
    return div;
  }

  async function changeStatus(id, status, container, note) {
    const token = localStorage.getItem('nav:adminToken') || '';
    if (!token) { setReviewHint('缺少管理员令牌'); return; }
    try {
      const r = await fetch('/api/admin_update', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ id, status, note }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);
      // 更新本地项的状态
      const it = state.review.items.find(x => x.id === id);
      if (it) { it.status = status; it.adminNote = note; }
      // 更新 UI pill
      if (container) {
        const pill = container.querySelector('.pill');
        if (pill) { pill.textContent = status; pill.className = `pill ${status}`; }
        const approveBtn = container.querySelector('.act-approve');
        const rejectBtn = container.querySelector('.act-reject');
        approveBtn && approveBtn.setAttribute('disabled','true');
        rejectBtn && rejectBtn.setAttribute('disabled','true');
      }
      setReviewHint('状态已更新');
    } catch (err) {
      console.warn(err);
      setReviewHint('更新失败：请检查令牌或网络');
    }
  }

  function newCaptcha() {
    const a = 1 + Math.floor(Math.random() * 9);
    const b = 1 + Math.floor(Math.random() * 9);
    state.captcha = { a, b, op: '+', ans: a + b };
    if (els.capQ) els.capQ.textContent = `${a} + ${b} = ?`;
  }

  function onSubmitForm(e) {
    e.preventDefault();
    if (!els.sName || !els.sUrl || !els.capAnswer) return;
    const name = els.sName.value.trim();
    const url = els.sUrl.value.trim();
    const desc = (els.sDesc?.value || '').trim();
    const tags = (els.sTags?.value || '').split(',').map(s => s.trim()).filter(Boolean);
    const disc = (els.sDisc?.value || '').split(',').map(s => s.trim()).filter(Boolean);
    const contact = (els.sContact?.value || '').trim();
    const cap = (els.capAnswer.value || '').trim();

    if (!name || !url) { setSubmitHint('请填写必填项：名称与链接。'); return; }
    if (!isValidUrl(url)) { setSubmitHint('链接格式不正确，请以 http(s):// 开头。'); return; }
    if (String(state.captcha.ans) !== cap) { setSubmitHint('验证码不正确，请重试。'); newCaptcha(); els.capAnswer.value = ''; return; }

    const payload = { name, url, description: desc, tags, disciplines: disc, contact, from: location.href, ts: new Date().toISOString() };

    // 管理员模式：直接加入本地数据，便于预览
    if (document.documentElement.classList.contains('admin')) {
      try {
        state.data.resources.push({ name, url, description: desc, tags, disciplines: disc, updatedAt: new Date().toISOString().slice(0,10) });
        localStorage.setItem(STORAGE_KEYS.data, JSON.stringify(state.data, null, 2));
        buildTagIndex();
        renderAll();
        setSubmitHint('已添加到本地预览（管理员模式）。如需上线请同步到 data/resources.json。');
      } catch (err) {
        console.error(err);
        setSubmitHint('添加失败，请稍后再试。');
      }
      return;
    }

    // 访客：先尝试后端 API，失败再回退邮件/剪贴板
    const submitBtn = els.sForm?.querySelector('button[type="submit"]');
    submitBtn && (submitBtn.disabled = true);
    setSubmitHint('正在提交，请稍候…');

    const apiPayload = { name, url, description: desc, tags, disciplines: disc, contact, page: location.href, captcha: { a: state.captcha.a, b: state.captcha.b, op: state.captcha.op, answer: cap } };

    fetch('/api/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(apiPayload),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(()=>({})))?.error || `HTTP ${r.status}`);
      setSubmitHint('提交成功，感谢你的贡献！我们会尽快审核。');
      newCaptcha();
      els.capAnswer.value = '';
      // 清空主要字段
      els.sName.value = '';
      els.sUrl.value = '';
      els.sDesc && (els.sDesc.value = '');
      els.sTags && (els.sTags.value = '');
      els.sDisc && (els.sDisc.value = '');
      els.sContact && (els.sContact.value = '');
    }).catch((err) => {
      console.warn('API 提交失败，回退到邮件/剪贴板。', err);
      const to = (state.data?.meta?.submitEmail) || '';
      if (to) {
        const subject = encodeURIComponent(`网站提交: ${name}`);
        const body = encodeURIComponent(`以下是用户提交的网站信息：\n\n${JSON.stringify(apiPayload, null, 2)}`);
        const mailto = `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;
        window.location.href = mailto;
        setSubmitHint('API 暂不可用，已尝试打开邮件客户端，请在邮件中确认并发送。');
      } else {
        navigator.clipboard?.writeText(JSON.stringify(apiPayload, null, 2)).then(() => {
          setSubmitHint('API 暂不可用，已复制提交内容到剪贴板，请发送给站点维护者。');
        }).catch(() => {
          setSubmitHint('API 和复制均失败：请手动复制以下 JSON 后提交给维护者。\n' + JSON.stringify(apiPayload, null, 2));
        });
      }
    }).finally(() => {
      submitBtn && (submitBtn.disabled = false);
    });
  }

  function setSubmitHint(msg) { if (els.submitHint) els.submitHint.textContent = msg; }

  function isValidUrl(u) {
    try { const _ = new URL(u); return _.protocol === 'http:' || _.protocol === 'https:'; } catch { return false; }
  }

  function initAcademicSearch() {
    const saved = localStorage.getItem(STORAGE_KEYS.acadProvider);
    if (saved) state.acadProvider = saved;
    if (els.acadProvider) els.acadProvider.value = state.acadProvider;
    if (els.acadTime) els.acadTime.value = state.acadTime;
  }

  const ACADEMIC_PROVIDERS = {
    gscholar: {
      name: 'Google 学术',
      supportsSite: true,
      supportsTimeSince: true,
      build: (q, site, timeSel) => {
        const qq = appendSite(q, site, true);
        if (!qq) return 'https://scholar.google.com/';
        const url = new URL('https://scholar.google.com/scholar');
        url.searchParams.set('q', qq);
        const since = timeSelToSinceYear(timeSel);
        if (since) url.searchParams.set('as_ylo', String(since));
        return url.toString();
      }
    },
    baiduxueshu: {
      name: '百度学术',
      supportsSite: true,
      build: (q, site) => {
        const qq = appendSite(q, site, true);
        return qq ? `https://xueshu.baidu.com/s?wd=${encodeURIComponent(qq)}` : 'https://xueshu.baidu.com/';
      }
    },
    cnki: {
      name: 'CNKI',
      supportsSite: false,
      build: (q) => q ? `https://scholar.cnki.net/scholar?q=${encodeURIComponent(q)}` : 'https://www.cnki.net/'
    },
    eric: {
      name: 'ERIC',
      supportsSite: false,
      build: (q) => q ? `https://eric.ed.gov/?q=${encodeURIComponent(q)}` : 'https://eric.ed.gov/'
    },
    semanticscholar: {
      name: 'Semantic Scholar',
      supportsSite: false,
      build: (q) => q ? `https://www.semanticscholar.org/search?q=${encodeURIComponent(q)}` : 'https://www.semanticscholar.org/'
    },
    jstor: {
      name: 'JSTOR',
      supportsSite: false,
      build: (q) => q ? `https://www.jstor.org/action/doBasicSearch?Query=${encodeURIComponent(q)}` : 'https://www.jstor.org/'
    },
    sage: {
      name: 'SAGE',
      supportsSite: false,
      build: (q) => q ? `https://journals.sagepub.com/action/doSearch?AllField=${encodeURIComponent(q)}` : 'https://journals.sagepub.com/'
    },
    wiley: {
      name: 'Wiley',
      supportsSite: false,
      build: (q) => q ? `https://onlinelibrary.wiley.com/action/doSearch?AllField=${encodeURIComponent(q)}` : 'https://onlinelibrary.wiley.com/'
    },
    tandf: {
      name: 'Taylor & Francis',
      supportsSite: false,
      build: (q) => q ? `https://www.tandfonline.com/action/doSearch?AllField=${encodeURIComponent(q)}` : 'https://www.tandfonline.com/'
    },
    springer: {
      name: 'Springer',
      supportsSite: false,
      build: (q) => q ? `https://link.springer.com/search?query=${encodeURIComponent(q)}` : 'https://link.springer.com/'
    },
    sciencedirect: {
      name: 'ScienceDirect',
      supportsSite: false,
      build: (q) => q ? `https://www.sciencedirect.com/search?qs=${encodeURIComponent(q)}` : 'https://www.sciencedirect.com/'
    }
  };

  function openAcademicSearch(provider, query, siteOpt, timeSel) {
    const p = ACADEMIC_PROVIDERS[provider] || ACADEMIC_PROVIDERS.gscholar;
    const url = p.build(query, siteOpt, timeSel);
    window.open(url, '_blank', 'noopener');
  }

  function sanitizeSite(site) {
    if (!site) return '';
    // 去掉协议和路径，只保留主机名部分
    try {
      const u = new URL(site.includes('://') ? site : `https://${site}`);
      return u.hostname || '';
    } catch {
      // 简单回退：去除空白和斜杠
      return site.replace(/^https?:\/\//i, '').split('/')[0].trim();
    }
  }

  function appendSite(q, site, enabled) {
    if (!q) return q;
    if (enabled && site) return `${q} site:${site}`;
    return q;
  }

  function timeSelToSinceYear(sel) {
    if (!sel) return null;
    const now = new Date();
    const y = now.getFullYear();
    if (sel === '1') return y;         // 近1年 → 当年
    if (sel === '3') return y - 2;     // 近3年 → 从 y-2 开始
    if (sel === '5') return y - 4;     // 近5年 → 从 y-4 开始
    return null;
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
    updateDisciplineButton();
  }

  function toggleDisciplineDropdown(show) {
    if (!els.dMenu || !els.dMenuBtn) return;
    if (show) {
      els.dMenu.removeAttribute('hidden');
      els.dMenuBtn.setAttribute('aria-expanded', 'true');
    } else {
      els.dMenu.setAttribute('hidden', '');
      els.dMenuBtn.setAttribute('aria-expanded', 'false');
    }
  }

  function updateDisciplineButton() {
    if (!els.dMenuBtn) return;
    const n = state.selectedDisciplines.size;
    els.dMenuBtn.textContent = n > 0 ? `📚 学科筛选 (${n})` : '📚 学科筛选';
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
