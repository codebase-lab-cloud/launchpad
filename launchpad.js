/* ═══════════════════════════════════════════════════════════════════
   launchpad.js — PUBLIC repo file. Boots directly (no lock screen).
   Data lives in launchpad.json inside your PRIVATE repo, read/written
   through the GitHub Contents API:
     • Reads on load (uses the remembered token, if any)
     • The Add-app form asks for all app details AND your PAT; the first
       successful save remembers username/repo/branch (+token, if you
       tick "remember") on this device so later saves are automatic.
   Notes:
     • The ONLY remote origin contacted is https://api.github.com
       (private-repo contents API + anonymous repo-details lookup).
     • All user-entered content renders via textContent/setAttribute —
       innerHTML is used solely for constant SVG icon markup.
     • If "remember token" is unchecked, the PAT is used in-memory for
       that one save and never stored.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
if(window.Launchpad) return;

var ROOT = null, UI = {}, MODAL = null, state = null;
var saveTimer = null, toastTimer = null, editingId = null, jsonSha = null;
var warnedNoPat = false;

/* ---------------- storage ---------------- */
var STATE_KEY = 'launchpad.state.v3';
var GH_KEY = 'launchpad.github.v1';
function storageOK(){
  try{ localStorage.setItem('__lp_t','1'); localStorage.removeItem('__lp_t'); return true; }
  catch(e){ return false; }
}
var HAS_STORAGE = storageOK();
var mem = {};
function sGet(k){ if(!HAS_STORAGE){ return mem[k] || null; } try{ return localStorage.getItem(k); }catch(e){ return mem[k] || null; } }
function sSet(k,v){ if(!HAS_STORAGE){ mem[k] = v; return; } try{ localStorage.setItem(k,v); }catch(e){ mem[k] = v; } }
function sDel(k){ if(!HAS_STORAGE){ delete mem[k]; return; } try{ localStorage.removeItem(k); }catch(e){} delete mem[k]; }

var gh = { user:'', repo:'', branch:'main', path:'', pat:'', remember:true };
function readGh(){
  try{
    var raw = sGet(GH_KEY);
    if(raw) gh = Object.assign({ user:'', repo:'', branch:'main', path:'', pat:'', remember:true }, JSON.parse(raw));
  }catch(e){}
}
readGh();
function saveGh(){
  var g = { user:gh.user, repo:gh.repo, branch:gh.branch, path:gh.path, remember:gh.remember };
  if(gh.remember) g.pat = gh.pat;
  sSet(GH_KEY, JSON.stringify(g));
}
function ghReady(){ return !!(gh.user && gh.repo); }
function canAutoSave(){ return ghReady() && gh.remember && gh.pat; }

/* ---------------- tiny DOM toolkit (innerHTML only for constant icons) ---------------- */
function el(tag, cls, text){
  var n = document.createElement(tag);
  if(cls) n.className = cls;
  if(text != null) n.textContent = text;
  return n;
}
function icon(paths, vb){
  var s = el('span');
  s.innerHTML = '<svg viewBox="' + (vb || '0 0 24 24') + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  return s;
}
var IC = {
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  plus:'<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  search:'<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  sun:'<circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/>',
  moon:'<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  gear:'<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  x:'<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  pencil:'<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  trash:'<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  up:'<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
  down:'<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
  refresh:'<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  ext:'<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  check:'<polyline points="20 6 9 17 4 12"/>',
  gh:'<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>',
  star:'<path d="M8 .25a.75.75 0 0 1 .67.42l1.88 3.8 4.2.6a.75.75 0 0 1 .42 1.28l-3.04 2.96.72 4.18a.75.75 0 0 1-1.09.79L8 12.35l-3.76 1.97a.75.75 0 0 1-1.09-.79l.72-4.18L.83 6.35a.75.75 0 0 1 .42-1.28l4.2-.6 1.88-3.8A.75.75 0 0 1 8 .25z"/>',
  alert:'<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  left:'<polyline points="15 18 9 12 15 6"/>',
  right:'<polyline points="9 18 15 12 9 6"/>',
  cloud:'<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>'
};
var GH_ICON = icon(IC.gh, '0 0 16 16');
GH_ICON.firstChild.setAttribute('fill','currentColor');
GH_ICON.firstChild.setAttribute('stroke','none');
GH_ICON.firstChild.setAttribute('width','14');
GH_ICON.firstChild.setAttribute('height','14');

/* ---------------- data helpers ---------------- */
var PALETTES = [['#8b5cf6','#d946ef'],['#22d3ee','#3b82f6'],['#34d399','#14b8a6'],['#f59e0b','#f97316'],['#f43f5e','#ec4899'],['#a855f7','#6366f1'],['#06b6d4','#8b5cf6'],['#84cc16','#22c55e'],['#fb7185','#f59e0b'],['#7c3aed','#c026d3'],['#0ea5e9','#6366f1'],['#eab308','#ec4899']];
var LANG_COLORS = { JavaScript:'#f1e05a', TypeScript:'#3178c6', Python:'#3572A5', HTML:'#e34c26', CSS:'#563d7c', Java:'#b07219', 'C++':'#f34b7d', C:'#555555', 'C#':'#178600', Go:'#00ADD8', Rust:'#dea584', Ruby:'#701516', PHP:'#4F5D95', Dart:'#00B4AB', Swift:'#F05138', Kotlin:'#A97BFF', Vue:'#41b883', Svelte:'#ff3e00' };
function hashOf(s){ var h = 0; s = String(s || ''); for(var i=0;i<s.length;i++){ h = (h*31 + s.charCodeAt(i)) >>> 0; } return h; }
function paletteFor(name){ return PALETTES[hashOf(String(name || '').toLowerCase()) % PALETTES.length]; }
function uid(){ return 'a' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8); }
function safeUrl(u){
  try{ var x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.href : null; }
  catch(e){ return null; }
}
function normalizeUrl(u){
  u = String(u || '').trim();
  if(!u) return '';
  if(!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return safeUrl(u) || '';
}
function hostOf(u){ var s = safeUrl(u); if(s){ try{ return new URL(s).hostname.replace(/^www\./,''); }catch(e){} } return String(u || ''); }
function titleFromUrl(u){
  var s = safeUrl(u); if(!s) return 'New app';
  try{
    var x = new URL(s);
    var seg = x.pathname.split('/').filter(Boolean)[0];
    var base = seg ? seg.replace(/[-_]+/g,' ') : x.hostname.replace(/^www\./,'').split('.')[0];
    return base.replace(/\b\w/g, function(c){ return c.toUpperCase(); });
  }catch(e){ return 'New app'; }
}
function normApp(a){
  a = a && typeof a === 'object' ? a : {};
  return {
    id: typeof a.id === 'string' && a.id ? a.id : uid(),
    name: String(a.name || 'Untitled').slice(0,80),
    url: String(a.url || '').slice(0,500),
    openUrl: String(a.openUrl || a.url || '').slice(0,500),
    icon: safeUrl(a.icon) || '',
    desc: String(a.desc || '').slice(0,300),
    tags: Array.isArray(a.tags) ? a.tags.slice(0,6).map(function(t){ return String(t).slice(0,24); }) : [],
    kind: a.kind === 'github' ? 'github' : 'link',
    repo: String(a.repo || '').slice(0,140),
    language: String(a.language || '').slice(0,30),
    stars: (typeof a.stars === 'number' && isFinite(a.stars)) ? a.stars : null
  };
}
function defaultState(){
  return { appId:'launchpad', schema:1, title:'Launchpad', tagline:'Private · synced from your GitHub repo', theme:'dark', updatedAt:0, apps:[] };
}
function payload(){
  state.updatedAt = Date.now();
  return {
    appId:'launchpad', schema:1,
    title: state.title, tagline: state.tagline, theme: state.theme, updatedAt: state.updatedAt,
    apps: state.apps.map(function(a){
      return { id:a.id, name:a.name, url:a.url, openUrl:a.openUrl, icon:a.icon, desc:a.desc, tags:a.tags, kind:a.kind, repo:a.repo, language:a.language, stars:a.stars };
    })
  };
}
function persistLocal(){
  sSet(STATE_KEY, JSON.stringify({ title:state.title, tagline:state.tagline, theme:state.theme, updatedAt:state.updatedAt, apps:state.apps }));
}

/* ---------------- GitHub Contents API ---------------- */
var API = 'https://api.github.com';
function enc(s){ return encodeURIComponent(String(s || '').trim()); }
function jsonPath(){ return (gh.path ? gh.path.replace(/^\/+|\/+$/g,'') + '/' : '') + 'launchpad.json'; }
function apiUrl(write){
  var p = '/repos/' + enc(gh.user) + '/' + enc(gh.repo) + '/contents/' + encodeURIComponent(jsonPath());
  if(!write) p += '?ref=' + enc(gh.branch) + '&t=' + Date.now();
  return p;
}
function b64encode(str){
  var bytes = new TextEncoder().encode(str), bin = '', CH = 0x8000;
  for(var i=0;i<bytes.length;i+=CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i+CH));
  return btoa(bin);
}
function b64decode(b64){
  var bin = atob(String(b64).replace(/[\r\n]/g,''));
  var bytes = new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function friendly(st, what){
  if(st === 401) return 'Token rejected (401) — check the PAT.';
  if(st === 403) return 'Access denied (403) — PAT expired or missing Contents: Read and write for this repo.';
  if(st === 404) return 'Not found (404) — wrong username / repo / branch, or ' + what + ' missing (it is created on your first save).';
  return 'GitHub error (HTTP ' + st + ').';
}
async function ghFetch(path, opts, token){
  var headers = { 'Accept': 'application/vnd.github+json' };
  if(opts && opts.body) headers['Content-Type'] = 'application/json';
  var t = token || gh.pat;
  if(t) headers['Authorization'] = 'token ' + t;
  return fetch(API + path, { method:(opts && opts.method) || 'GET', headers:headers, body: opts && opts.body });
}
async function fetchJsonFile(token){
  var res = await ghFetch(apiUrl(false), {}, token);
  if(res.status === 404) return null;
  if(!res.ok) throw new Error(friendly(res.status, 'launchpad.json'));
  var j = await res.json();
  if(!j || typeof j.content !== 'string') throw new Error('launchpad.json is empty or too large.');
  var text;
  try{ text = b64decode(j.content); }
  catch(e){ throw new Error('launchpad.json has unreadable content.'); }
  var data;
  try{ data = JSON.parse(text); }
  catch(e){ throw new Error('launchpad.json is not valid JSON — fix it in the repo.'); }
  if(!data || !Array.isArray(data.apps)) throw new Error('launchpad.json must contain an "apps" array.');
  return { sha: j.sha, data: data };
}
async function putJsonFile(token, contentStr, sha){
  var body = { message: 'Launchpad: update apps', content: b64encode(contentStr), branch: gh.branch };
  if(sha) body.sha = sha;
  var res = await ghFetch(apiUrl(true), { method:'PUT', body: JSON.stringify(body) }, token);
  if(res.status === 409) return { conflict:true };
  if(!res.ok) throw new Error(friendly(res.status, 'launchpad.json (write)'));
  return res.json();
}
/* pull from the private repo on load */
async function loadData(){
  if(!ghReady()){ setStatus('idle','Not connected'); return; }
  setStatus('saving','Loading…');
  try{
    var f = await fetchJsonFile();
    if(f && f.data){
      state = Object.assign(defaultState(), f.data);
      state.apps = (state.apps || []).map(normApp);
      jsonSha = f.sha;
      persistLocal(); render();
      setStatus('ok','Synced');
    } else { setStatus('idle','Empty'); }
  }catch(e){
    setStatus('err','Load failed');
    toast(e.message || 'Could not load launchpad.json', 'err');
  }
}
/* push state to the private repo; conflict-aware */
async function pushToGithub(token, opts){
  opts = opts || {};
  var prevTs = state.updatedAt || 0;
  var pay = payload();
  var content = JSON.stringify(pay, null, 2);
  var cur = await fetchJsonFile(token);          /* fresh sha + remote state */
  jsonSha = cur ? cur.sha : null;
  if(!opts.force && cur && cur.data && (cur.data.updatedAt || 0) > prevTs &&
     JSON.stringify(cur.data.apps || []) !== JSON.stringify(pay.apps)){
    var err = new Error('Another device updated the data.');
    err.conflict = true; err.remote = cur.data;
    throw err;
  }
  var r = await putJsonFile(token, content, jsonSha);
  if(r && r.conflict){
    var fresh = await fetchJsonFile(token);      /* 409 → retry once with latest sha */
    r = await putJsonFile(token, content, fresh ? fresh.sha : null);
    if(r && r.conflict) throw new Error('Write conflict persisted — try again.');
    jsonSha = (r && r.content && r.content.sha) || jsonSha;
  } else {
    jsonSha = (r && r.content && r.content.sha) || jsonSha;
  }
  persistLocal();
  setStatus('ok','Synced');
}

/* ---------------- save pipeline ---------------- */
function setStatus(kind, txt){
  UI.saveChip.className = 'save-chip ' + kind;
  UI.saveChip.textContent = txt;
}
function scheduleSave(){
  persistLocal();
  if(canAutoSave()){
    setStatus('saving','Saving…');
    if(saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function(){
      pushToGithub(gh.pat, {}).catch(function(e){
        if(e && e.conflict) showConflict(e.remote); else setStatus('err','Save failed');
      });
    }, 2500);
  } else {
    setStatus('idle', ghReady() ? 'Not connected' : 'Not connected');
    if(!warnedNoPat){
      warnedNoPat = true;
      toast('Saved on this device — paste a PAT in the Add-app form (or Settings) to publish to GitHub', 'err');
    }
  }
}
function showConflict(remote){
  setStatus('err','Conflict');
  UI.conflict.classList.add('open');
  UI.conflictRemote = remote;
}
function applyRemoteState(remote){
  UI.conflict.classList.remove('open');
  if(remote && Array.isArray(remote.apps)){
    state = Object.assign(defaultState(), remote);
    state.apps = state.apps.map(normApp);
    persistLocal(); render();
    setStatus('ok','Synced');
    toast('Switched to the newer version from GitHub');
  }
}
function forceMine(){
  UI.conflict.classList.remove('open');
  var t = gh.pat;
  setStatus('saving','Saving…');
  pushToGithub(t, { force:true }).catch(function(e){ setStatus('err','Save failed'); toast(e.message || 'Save failed', 'err'); });
}

/* ---------------- toast ---------------- */
function toast(msg, kind){
  UI.toast.textContent = msg;
  UI.toast.className = 'toast show' + (kind === 'err' ? ' err' : '');
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ UI.toast.className = 'toast'; }, 3200);
}

/* ---------------- build UI ---------------- */
function buildUI(){
  ROOT.textContent = '';

  var blobs = el('div','bg-blobs');
  blobs.appendChild(el('div','blob b1'));
  blobs.appendChild(el('div','blob b2'));
  blobs.appendChild(el('div','blob b3'));

  var wrap = el('div','wrap');

  /* header */
  var header = el('header');
  var brand = el('div','brand');
  var logo = el('div','logo');
  logo.appendChild(icon(IC.grid));
  var brandTxt = el('div');
  var brandName = el('span',null,'Launchpad'); brandName.id = 'brandName';
  var heroP = el('small',null,state.tagline);
  brandTxt.appendChild(brandName); brandTxt.appendChild(heroP);
  brand.appendChild(logo); brand.appendChild(brandTxt);
  var actions = el('div','header-actions');
  var saveChip = el('span','save-chip idle','Not connected'); saveChip.id = 'saveChip';
  var themeBtn = el('button','icon-btn'); themeBtn.type = 'button'; themeBtn.title = 'Toggle theme'; themeBtn.appendChild(icon(IC.sun));
  var gearBtn = el('button','icon-btn'); gearBtn.type = 'button'; gearBtn.title = 'Settings'; gearBtn.appendChild(icon(IC.gear));
  actions.appendChild(saveChip); actions.appendChild(themeBtn); actions.appendChild(gearBtn);
  header.appendChild(brand); header.appendChild(actions);

  /* toolbar */
  var toolbar = el('div','toolbar');
  var search = el('div','search-box');
  search.appendChild(icon(IC.search));
  var searchInput = el('input'); searchInput.type = 'text'; searchInput.placeholder = 'Search apps…  ( / )';
  searchInput.setAttribute('autocomplete','off');
  search.appendChild(searchInput);
  var countPill = el('span','count-pill','0 apps'); countPill.id = 'countPill';
  var addBtn = el('button','btn btn-primary'); addBtn.type = 'button';
  addBtn.appendChild(icon(IC.plus));
  addBtn.appendChild(el('span',null,'Add app'));
  toolbar.appendChild(search); toolbar.appendChild(countPill); toolbar.appendChild(addBtn);

  /* app rail */
  var railHead = el('div','rail-head');
  railHead.appendChild(el('h2',null,'Apps'));
  var railNav = el('div','rail-nav');
  var prevBtn = el('button'); prevBtn.type = 'button'; prevBtn.title = 'Scroll left'; prevBtn.setAttribute('aria-label','Scroll left'); prevBtn.appendChild(icon(IC.left));
  var nextBtn = el('button'); nextBtn.type = 'button'; nextBtn.title = 'Scroll right'; nextBtn.setAttribute('aria-label','Scroll right'); nextBtn.appendChild(icon(IC.right));
  railNav.appendChild(prevBtn); railNav.appendChild(nextBtn);
  railHead.appendChild(railNav);
  var grid = el('main','rail'); grid.id = 'appsGrid';

  var footer = el('footer');
  footer.appendChild(el('span',null,'Apps stored in your private repo · '));
  footer.appendChild(el('b',null,'launchpad.json'));

  wrap.appendChild(header); wrap.appendChild(toolbar); wrap.appendChild(railHead); wrap.appendChild(grid); wrap.appendChild(footer);
  ROOT.appendChild(blobs); ROOT.appendChild(wrap);
  ROOT.appendChild(buildModal());
  var t = el('div','toast'); t.appendChild(icon(IC.check));
  var tmsg = el('span'); t.appendChild(tmsg);
  ROOT.appendChild(t);
  ROOT.appendChild(buildConflict());

  UI = {
    brandName: brandName, saveChip: saveChip, themeBtn: themeBtn, gearBtn: gearBtn,
    searchInput: searchInput, countPill: countPill, addBtn: addBtn,
    grid: grid, heroP: heroP, toast: t, toastMsg: tmsg, conflict: ROOT.querySelector('.conflict-box'),
    modal: ROOT.querySelector('.overlay'), prevBtn: prevBtn, nextBtn: nextBtn, dragFlag: false
  };

  /* events */
  themeBtn.addEventListener('click', function(){
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(); markTheme(); scheduleSave();
  });
  gearBtn.addEventListener('click', function(){ openModal('add'); });
  addBtn.addEventListener('click', function(){ openModal('add'); setTimeout(function(){ MODAL.urlInput.focus(); }, 60); });
  searchInput.addEventListener('input', render);

  prevBtn.addEventListener('click', function(){ grid.scrollBy({ left: -grid.clientWidth * 0.8, behavior: 'smooth' }); });
  nextBtn.addEventListener('click', function(){ grid.scrollBy({ left: grid.clientWidth * 0.8, behavior: 'smooth' }); });
  grid.addEventListener('scroll', function(){ updateNav(); });
  window.addEventListener('resize', function(){ updateNav(); });
  var railDown = false, railMoved = false, railX = 0, railSL = 0;
  grid.addEventListener('pointerdown', function(e){
    if(e.pointerType !== 'mouse' || e.button !== 0) return;
    railDown = true; railMoved = false; railX = e.clientX; railSL = grid.scrollLeft;
    grid.classList.add('dragging');
  });
  window.addEventListener('pointermove', function(e){
    if(!railDown) return;
    var dx = e.clientX - railX;
    if(!railMoved && Math.abs(dx) > 6) railMoved = true;
    if(railMoved) grid.scrollLeft = railSL - dx;
  });
  window.addEventListener('pointerup', function(){
    if(!railDown) return;
    railDown = false; grid.classList.remove('dragging');
    if(railMoved){ UI.dragFlag = true; setTimeout(function(){ UI.dragFlag = false; }, 300); }
  });

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){ closeModal(); UI.conflict.classList.remove('open'); }
    if(e.key === '/' && !/input|textarea/i.test((document.activeElement && document.activeElement.tagName) || '')){
      e.preventDefault(); searchInput.focus();
    }
  });
}

function buildModal(){
  var overlay = el('div','overlay');
  var modal = el('div','modal');
  var head = el('div','modal-head');
  head.appendChild(el('h2',null,'Settings'));
  var closeBtn = el('button','icon-btn'); closeBtn.type = 'button'; closeBtn.title = 'Close'; closeBtn.appendChild(icon(IC.x));
  head.appendChild(closeBtn);
  var tabs = el('div','tabs');
  var tabDefs = [['add', IC.plus, 'Add app'], ['manage', IC.grid, 'Manage'], ['general', IC.gear, 'General']];
  tabDefs.forEach(function(td, i){
    var b = el('button','tab' + (i === 0 ? ' active' : '')); b.type = 'button'; b.dataset.tab = td[0];
    b.appendChild(icon(td[1]));
    b.appendChild(el('span',null,td[2]));
    tabs.appendChild(b);
  });

  /* --- add tab --- */
  var addBody = el('div','tab-body active'); addBody.id = 'tab-add';
  var fUrl = el('div','field');
  fUrl.appendChild(el('label',null,'APP OR REPOSITORY LINK'));
  var urlRow = el('div','url-row');
  var urlInput = el('input'); urlInput.type = 'text'; urlInput.placeholder = 'https://github.com/owner/repo — or any app URL';
  urlInput.setAttribute('autocomplete','off');
  var fetchBtn = el('button','btn btn-primary btn-sm'); fetchBtn.type = 'button'; fetchBtn.style.flex = 'none';
  fetchBtn.appendChild(icon(IC.refresh));
  fetchBtn.appendChild(el('span',null,'Fetch'));
  urlRow.appendChild(urlInput); urlRow.appendChild(fetchBtn);
  fUrl.appendChild(urlRow);
  fUrl.appendChild(el('div','hint','GitHub links auto-fill name, description, language, stars, topics & icon — anonymously from api.github.com.'));
  var status = el('div','status');
  var spin = el('span','spinner');
  var statusMsg = el('span');
  status.appendChild(spin); status.appendChild(statusMsg);
  var preview = el('div','preview-card'); preview.style.display = 'none';
  var pvAvatar = el('div','avatar','A');
  var pvBox = el('div'); pvBox.style.minWidth = '0';
  var pvName = el('div','pv-name','App name');
  var pvMeta = el('div','pv-meta','opens to …');
  var pvChips = el('div','pv-chips');
  pvBox.appendChild(pvName); pvBox.appendChild(pvMeta); pvBox.appendChild(pvChips);
  preview.appendChild(pvAvatar); preview.appendChild(pvBox);
  var two = el('div','two-col');
  var fName = el('div','field'); fName.appendChild(el('label',null,'NAME'));
  var nameInput = el('input'); nameInput.type = 'text'; nameInput.placeholder = 'My awesome app';
  fName.appendChild(nameInput);
  var fOpen = el('div','field'); fOpen.appendChild(el('label',null,'OPENS TO (URL)'));
  var openInput = el('input'); openInput.type = 'text'; openInput.placeholder = 'https://myapp.vercel.app';
  fOpen.appendChild(openInput);
  two.appendChild(fName); two.appendChild(fOpen);
  var fIcon = el('div','field'); fIcon.appendChild(el('label',null,'ICON URL (optional)'));
  var iconInput = el('input'); iconInput.type = 'text'; iconInput.placeholder = 'https://…/icon.png';
  fIcon.appendChild(iconInput);
  var fDesc = el('div','field'); fDesc.appendChild(el('label',null,'DESCRIPTION'));
  var descInput = el('textarea'); descInput.placeholder = 'What does this app do?';
  fDesc.appendChild(descInput);
  var fTags = el('div','field'); fTags.appendChild(el('label',null,'TAGS (comma separated)'));
  var tagsInput = el('input'); tagsInput.type = 'text'; tagsInput.placeholder = 'react, dashboard, ai';
  fTags.appendChild(tagsInput);

  /* --- save-to-GitHub section inside Add tab (asks for PAT) --- */
  var ghSec = el('div','gh-section');
  var ghTitle = el('h4'); ghTitle.appendChild(GH_ICON.cloneNode(true)); ghTitle.appendChild(el('span',null,'Save to your private repo')); ghSec.appendChild(ghTitle);
  var ghTwo = el('div','two-col');
  function ghField(label, ph, id){
    var f = el('div','field'); f.appendChild(el('label',null,label));
    var i = el('input'); i.type = 'text'; i.placeholder = ph; i.setAttribute('autocomplete','off'); i.id = id;
    f.appendChild(i); return f;
  }
  var uF = ghField('GITHUB USERNAME','your-username','ghUser');
  var rF = ghField('PRIVATE REPO NAME','my-private-vault','ghRepo');
  var bF = ghField('BRANCH','main','ghBranch');
  var pF = ghField('SUBFOLDER (optional)','apps/launchpad','ghPath');
  ghTwo.appendChild(uF); ghTwo.appendChild(rF); ghTwo.appendChild(bF); ghTwo.appendChild(pF);
  ghSec.appendChild(ghTwo);
  var patField = el('div','field');
  patField.appendChild(el('label',null,'PERSONAL ACCESS TOKEN (fine-grained · Contents: Read and write)'));
  var patInput = el('input'); patInput.type = 'password'; patInput.id = 'patInput';
  patInput.placeholder = gh.pat ? 'Saved on this device — paste a new one to replace' : 'github_pat_… (required to save)';
  patInput.setAttribute('autocomplete','off');
  patField.appendChild(patInput);
  patField.appendChild(el('div','hint','Asked here so you never see a login page. Use a fine-grained PAT scoped to only this repo, Contents: Read and write, ~90-day expiry.'));
  ghSec.appendChild(patField);
  var chkRow = el('div','check-row');
  var rememberChk = el('input'); rememberChk.type = 'checkbox'; rememberChk.id = 'rememberChk'; rememberChk.checked = gh.remember;
  chkRow.appendChild(rememberChk);
  chkRow.appendChild(el('span',null,'Remember token on this device (enables auto-sync; uncheck to enter it every save)'));
  ghSec.appendChild(chkRow);

  var formActions = el('div','form-actions');
  var clearBtn = el('button','btn btn-ghost btn-sm'); clearBtn.type = 'button'; clearBtn.textContent = 'Clear';
  var saveBtn = el('button','btn btn-primary btn-sm'); saveBtn.type = 'button';
  saveBtn.appendChild(icon(IC.plus));
  var saveLabel = el('span',null,'Add to page');
  saveBtn.appendChild(saveLabel);
  formActions.appendChild(clearBtn); formActions.appendChild(saveBtn);
  [fUrl,status,preview,two,fIcon,fDesc,fTags,ghSec,formActions].forEach(function(n){ addBody.appendChild(n); });

  /* --- manage tab --- */
  var manageBody = el('div','tab-body'); manageBody.id = 'tab-manage';
  var manageList = el('div'); manageList.id = 'manageList';
  manageBody.appendChild(manageList);

  /* --- general tab --- */
  var genBody = el('div','tab-body'); genBody.id = 'tab-general';
  var ghStatus = el('div','gh-status');
  var dot = el('span','dot off'); dot.id = 'ghDot';
  var ghStatusTxt = el('span',null,''); ghStatusTxt.id = 'ghStatusTxt';
  ghStatus.appendChild(dot); ghStatus.appendChild(ghStatusTxt);
  var forgetBtn = el('button','btn btn-ghost btn-sm'); forgetBtn.type = 'button'; forgetBtn.textContent = 'Forget token'; forgetBtn.style.marginLeft = 'auto';
  ghStatus.appendChild(forgetBtn);
  var fTitle = el('div','field'); fTitle.appendChild(el('label',null,'SITE NAME'));
  var titleInput = el('input'); titleInput.type = 'text'; titleInput.placeholder = 'Launchpad';
  fTitle.appendChild(titleInput);
  var fTag = el('div','field'); fTag.appendChild(el('label',null,'TAGLINE (header subtitle)'));
  var tagInput = el('textarea'); tagInput.placeholder = 'All my web apps in one place';
  fTag.appendChild(tagInput);
  var fTheme = el('div','field'); fTheme.appendChild(el('label',null,'THEME'));
  var themePick = el('div','theme-pick');
  var darkBtn = el('button','btn btn-ghost btn-sm'); darkBtn.type = 'button';
  darkBtn.appendChild(icon(IC.moon)); darkBtn.appendChild(el('span',null,'Dark'));
  var lightBtn = el('button','btn btn-ghost btn-sm'); lightBtn.type = 'button';
  lightBtn.appendChild(icon(IC.sun)); lightBtn.appendChild(el('span',null,'Light'));
  themePick.appendChild(darkBtn); themePick.appendChild(lightBtn);
  fTheme.appendChild(themePick);
  var genActions = el('div','form-actions');
  var genSave = el('button','btn btn-primary btn-sm'); genSave.type = 'button'; genSave.textContent = 'Save';
  genActions.appendChild(genSave);
  [ghStatus,fTitle,fTag,fTheme,genActions].forEach(function(n){ genBody.appendChild(n); });

  modal.appendChild(head); modal.appendChild(tabs);
  modal.appendChild(addBody); modal.appendChild(manageBody); modal.appendChild(genBody);
  overlay.appendChild(modal);

  MODAL = {
    overlay: overlay, closeBtn: closeBtn, tabs: tabs,
    urlInput: urlInput, fetchBtn: fetchBtn, status: status, spin: spin, statusMsg: statusMsg,
    preview: preview, pvAvatar: pvAvatar, pvName: pvName, pvMeta: pvMeta, pvChips: pvChips,
    nameInput: nameInput, openInput: openInput, iconInput: iconInput, descInput: descInput, tagsInput: tagsInput,
    ghUser: uF.querySelector('input'), ghRepo: rF.querySelector('input'), ghBranch: bF.querySelector('input'), ghPath: pF.querySelector('input'),
    patInput: patInput, rememberChk: rememberChk,
    clearBtn: clearBtn, saveBtn: saveBtn, saveLabel: saveLabel,
    meta: null, manageList: manageList,
    titleInput: titleInput, tagInput: tagInput, darkBtn: darkBtn, lightBtn: lightBtn, genSave: genSave,
    forgetBtn: forgetBtn
  };

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', function(e){ if(e.target === overlay) closeModal(); });
  tabs.addEventListener('click', function(e){
    var b = e.target.closest('.tab'); if(!b) return;
    switchTab(b.dataset.tab);
  });
  fetchBtn.addEventListener('click', doFetch);
  urlInput.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); doFetch(); } });
  [nameInput, openInput, iconInput, descInput, tagsInput].forEach(function(inp){ inp.addEventListener('input', updatePreview); });
  clearBtn.addEventListener('click', resetForm);
  saveBtn.addEventListener('click', saveForm);
  darkBtn.addEventListener('click', function(){ state.theme = 'dark'; applyTheme(); markTheme(); scheduleSave(); });
  lightBtn.addEventListener('click', function(){ state.theme = 'light'; applyTheme(); markTheme(); scheduleSave(); });
  genSave.addEventListener('click', function(){
    state.title = titleInput.value.trim().slice(0,60) || 'Launchpad';
    state.tagline = tagInput.value.trim().slice(0,200) || defaultState().tagline;
    render(); scheduleSave(); toast('Saved');
  });
  forgetBtn.addEventListener('click', function(){
    gh.pat = ''; saveGh(); renderGhFields(); updateGhStatus();
    toast('Token forgotten on this device');
  });
  manageList.addEventListener('click', manageClick);
  return overlay;
}

function buildConflict(){
  var box = el('div','conflict-box');
  var card = el('div','conflict-card');
  var h3 = el('h3');
  h3.appendChild(icon(IC.alert));
  h3.appendChild(el('span',null,'Data changed on another device'));
  card.appendChild(h3);
  card.appendChild(el('p',null,'Your private repo has a newer version than the edits made here. Choose which one to keep.'));
  var row = el('div','row');
  var theirs = el('button','btn btn-ghost btn-sm'); theirs.type = 'button'; theirs.textContent = 'Use the newer version';
  var mine = el('button','btn btn-primary btn-sm'); mine.type = 'button'; mine.textContent = 'Keep my changes';
  row.appendChild(theirs); row.appendChild(mine);
  card.appendChild(row);
  box.appendChild(card);
  theirs.addEventListener('click', function(){ applyRemoteState(UI.conflictRemote); });
  mine.addEventListener('click', forceMine);
  return box;
}

/* ---------------- modal logic ---------------- */
function openModal(tab){
  MODAL.overlay.classList.add('open');
  if(tab) switchTab(tab);
  MODAL.titleInput.value = state.title;
  MODAL.tagInput.value = state.tagline;
  markTheme(); renderGhFields(); updateGhStatus(); renderManage();
}
function closeModal(){ MODAL.overlay.classList.remove('open'); }
function switchTab(tab){
  MODAL.tabs.querySelectorAll('.tab').forEach(function(t){ t.classList.toggle('active', t.dataset.tab === tab); });
  ['add','manage','general'].forEach(function(id){
    var body = ROOT.querySelector('#tab-' + id);
    if(body) body.classList.toggle('active', id === tab);
  });
}
function renderGhFields(){
  MODAL.ghUser.value = gh.user || '';
  MODAL.ghRepo.value = gh.repo || '';
  MODAL.ghBranch.value = gh.branch || 'main';
  MODAL.ghPath.value = gh.path || '';
  MODAL.patInput.value = '';
  MODAL.patInput.placeholder = gh.pat ? 'Saved on this device — paste a new one to replace' : 'github_pat_… (required to save)';
  MODAL.rememberChk.checked = gh.remember;
}
function updateGhStatus(){
  var d = ROOT.querySelector('#ghDot'), tx = ROOT.querySelector('#ghStatusTxt');
  if(!d) return;
  if(canAutoSave()){ d.className = 'dot on'; tx.textContent = 'Connected: ' + gh.user + '/' + gh.repo + ' · token saved on this device (auto-sync on)'; }
  else if(ghReady()){ d.className = 'dot off'; tx.textContent = 'Connected: ' + gh.user + '/' + gh.repo + ' · no remembered token — paste a PAT with each save'; }
  else { d.className = 'dot off'; tx.textContent = 'Not connected — fill the GitHub section when adding an app.'; }
}
function setFetchStatus(kind, msg){
  MODAL.status.className = 'status show ' + kind;
  MODAL.spin.style.display = kind === 'loading' ? 'inline-block' : 'none';
  MODAL.statusMsg.textContent = msg || '';
}
function updatePreview(){
  MODAL.preview.style.display = 'flex';
  MODAL.pvName.textContent = MODAL.nameInput.value.trim() || 'Untitled app';
  MODAL.pvMeta.textContent = 'opens to ' + (normalizeUrl(MODAL.openInput.value) || '…');
  var g = paletteFor(MODAL.pvName.textContent);
  MODAL.pvAvatar.style.setProperty('--g1', g[0]);
  MODAL.pvAvatar.style.setProperty('--g2', g[1]);
  MODAL.pvAvatar.textContent = (MODAL.pvName.textContent[0] || '?').toUpperCase();
  MODAL.pvChips.textContent = '';
  MODAL.tagsInput.value.split(',').slice(0,4).forEach(function(t){
    t = t.trim(); if(!t) return;
    MODAL.pvChips.appendChild(el('span','chip',t));
  });
}
function resetForm(){
  editingId = null;
  MODAL.meta = null;
  MODAL.urlInput.value = '';
  [MODAL.nameInput, MODAL.openInput, MODAL.iconInput, MODAL.descInput, MODAL.tagsInput, MODAL.patInput].forEach(function(i){ i.value = ''; });
  MODAL.preview.style.display = 'none';
  MODAL.status.className = 'status';
  MODAL.saveLabel.textContent = 'Add to page';
}
function formFromApp(a){
  MODAL.nameInput.value = a.name || '';
  MODAL.openInput.value = a.openUrl || '';
  MODAL.iconInput.value = a.icon || '';
  MODAL.descInput.value = a.desc || '';
  MODAL.tagsInput.value = (a.tags || []).join(', ');
  updatePreview();
}
function appFromForm(){
  return normApp({
    name: MODAL.nameInput.value.trim() || 'Untitled app',
    url: MODAL.urlInput.value.trim(),
    openUrl: normalizeUrl(MODAL.openInput.value) || normalizeUrl(MODAL.urlInput.value),
    icon: MODAL.iconInput.value.trim(),
    desc: MODAL.descInput.value.trim(),
    tags: MODAL.tagsInput.value.split(',').map(function(t){ return t.trim(); }).filter(Boolean)
  });
}
function findById(id){ return state.apps.filter(function(a){ return a.id === id; })[0] || null; }
function upsert(app){
  var existing = editingId ? findById(editingId) : null;
  if(!existing){
    var dup = state.apps.filter(function(a){ return a.url && app.url && normalizeUrl(a.url) === normalizeUrl(app.url); })[0];
    existing = dup || null;
  }
  if(existing) Object.assign(existing, app, { id: existing.id });
  else state.apps.push(Object.assign({ id: uid() }, app));
  render();
}
function saveForm(){
  var app = appFromForm();
  if(!app.openUrl){ toast('Add at least an “Opens to” URL', 'err'); return; }
  var prev = editingId ? findById(editingId) : null;
  if(!prev && app.url){
    prev = state.apps.filter(function(a){ return a.url && normalizeUrl(a.url) === normalizeUrl(app.url); })[0] || null;
  }
  var meta = (MODAL.meta && normalizeUrl(MODAL.meta.url) === normalizeUrl(app.url)) ? MODAL.meta : prev;
  if(meta){
    app.kind = meta.kind; app.repo = meta.repo;
    app.language = app.language || meta.language;
    app.stars = (app.stars != null) ? app.stars : meta.stars;
    if(!app.icon) app.icon = meta.icon;
    if(!app.url) app.url = meta.url;
  }
  upsert(app);
  persistLocal();

  /* collect GitHub credentials from the form */
  gh.user = MODAL.ghUser.value.trim() || gh.user;
  gh.repo = MODAL.ghRepo.value.trim() || gh.repo;
  gh.branch = MODAL.ghBranch.value.trim() || 'main';
  gh.path = MODAL.ghPath.value.trim();
  gh.remember = MODAL.rememberChk.checked;
  var token = MODAL.patInput.value.trim() || (gh.remember ? gh.pat : '');

  if(!ghReady()){
    setStatus('idle','Not connected');
    toast('App saved on this device — add your GitHub username & repo below to publish', 'err');
    switchTab('add');
    return;
  }
  if(!token){
    setStatus('idle','Not connected');
    toast('App saved on this device — paste a PAT to publish to your private repo', 'err');
    return;
  }
  setStatus('saving','Saving…');
  pushToGithub(token, {}).then(function(){
    if(gh.remember){ gh.pat = token; }
    saveGh(); renderGhFields(); updateGhStatus();
    toast('“' + app.name + '” saved to ' + gh.user + '/' + gh.repo + '');
  }).catch(function(e){
    if(e && e.conflict) showConflict(e.remote);
    else { setStatus('err','Save failed'); toast(e.message || 'Save failed', 'err'); }
  });
  resetForm();
  switchTab('manage');
}
function editApp(id){
  var a = findById(id); if(!a) return;
  editingId = id;
  MODAL.urlInput.value = a.url || '';
  formFromApp(a);
  MODAL.saveLabel.textContent = 'Save changes';
  setFetchStatus('ok','Editing ' + a.name + ' — hit Save changes when done.');
  openModal('add');
}
function removeApp(id){
  state.apps = state.apps.filter(function(a){ return a.id !== id; });
  render(); scheduleSave();
  toast('App removed · syncing');
}

/* anonymous GitHub repo-details lookup (api.github.com only) */
function fetchRepoDetails(rawUrl){
  var url = normalizeUrl(rawUrl);
  var m = url.match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\/|$|\?|#)/i);
  if(!m) return Promise.resolve(null);
  var owner = m[1], repo = m[2].replace(/\.git$/i,'');
  return fetch('https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo), {
    headers: { 'Accept': 'application/vnd.github+json' }
  }).then(function(res){ if(!res.ok) return null; return res.json(); }).then(function(d){
    if(!d) return null;
    var open = /^https?:\/\//i.test(d.homepage || '') ? String(d.homepage).trim() : null;
    if(!open && d.has_pages){
      open = (repo.toLowerCase() === owner.toLowerCase() + '.github.io') ? ('https://' + owner + '.github.io/') : ('https://' + owner + '.github.io/' + repo + '/');
    }
    if(!open) open = d.html_url;
    return normApp({
      name: d.name || (owner + '/' + repo), url: d.html_url, openUrl: open,
      icon: (d.owner && d.owner.avatar_url) || '', desc: d.description || '',
      language: d.language || '', stars: (typeof d.stargazers_count === 'number') ? d.stargazers_count : null,
      tags: Array.isArray(d.topics) ? d.topics.slice(0,4) : [], kind: 'github', repo: owner + '/' + repo
    });
  });
}
function doFetch(){
  var raw = MODAL.urlInput.value.trim();
  if(!raw){ setFetchStatus('error','Paste a link first — e.g. https://github.com/owner/repo'); return; }
  var url = normalizeUrl(raw);
  MODAL.fetchBtn.disabled = true;
  setFetchStatus('loading','Fetching details…');
  var fallback = normApp({ name: titleFromUrl(url), url: url, openUrl: url, kind: 'link' });
  fetchRepoDetails(url).then(function(app){
    var finalApp = app || fallback;
    editingId = null;
    MODAL.meta = finalApp;
    formFromApp(finalApp);
    MODAL.fetchBtn.disabled = false;
    setFetchStatus(app ? 'ok' : 'error', app ? 'Auto-filled from GitHub — tweak below, then Add to page.' : 'Not a public GitHub repo — filled basics from the URL; complete the rest manually.');
    var dup = state.apps.filter(function(a){ return a.url && finalApp.url && normalizeUrl(a.url) === normalizeUrl(finalApp.url); })[0];
    if(dup) Object.assign(dup, finalApp, { id: dup.id });
    else state.apps.push(Object.assign({ id: uid() }, finalApp));
    render();
  }).catch(function(){
    MODAL.fetchBtn.disabled = false;
    MODAL.meta = fallback;
    formFromApp(fallback);
    setFetchStatus('error','Could not reach api.github.com — fill the fields manually; they will still save.');
    state.apps.push(Object.assign({ id: uid() }, fallback));
    render();
  });
}

/* ---------------- render ---------------- */
function updateNav(){
  if(!UI.grid || !UI.prevBtn) return;
  UI.prevBtn.disabled = UI.grid.scrollLeft <= 2;
  UI.nextBtn.disabled = UI.grid.scrollLeft + UI.grid.clientWidth >= UI.grid.scrollWidth - 2;
}
function applyTheme(){ ROOT.dataset.theme = state.theme === 'light' ? 'light' : 'dark'; }
function markTheme(){
  MODAL.darkBtn.classList.toggle('on', state.theme === 'dark');
  MODAL.lightBtn.classList.toggle('on', state.theme === 'light');
}
function filtered(){
  var q = UI.searchInput.value.trim().toLowerCase();
  if(!q) return state.apps;
  return state.apps.filter(function(a){
    return (a.name || '').toLowerCase().indexOf(q) >= 0 ||
           (a.desc || '').toLowerCase().indexOf(q) >= 0 ||
           (a.tags || []).join(' ').toLowerCase().indexOf(q) >= 0 ||
           (a.url || '').toLowerCase().indexOf(q) >= 0;
  });
}
function makeAvatar(app){
  var g = paletteFor(app.name || 'app');
  var av = el('div','avatar');
  av.style.setProperty('--g1', g[0]);
  av.style.setProperty('--g2', g[1]);
  av.textContent = (app.name || '?')[0].toUpperCase();
  if(app.icon){
    var img = document.createElement('img');
    img.alt = '';
    img.setAttribute('loading','lazy');
    img.src = app.icon;
    img.addEventListener('error', function(){ img.remove(); });
    av.appendChild(img);
  }
  return av;
}
function makeChip(txt, dotColor, svg){
  var c = el('span','chip');
  if(dotColor){ var d = el('span','lang-dot'); d.style.background = dotColor; c.appendChild(d); }
  if(svg) c.appendChild(svg);
  c.appendChild(document.createTextNode(txt));
  return c;
}
function makeCard(a, idx){
  var card = el('article','card');
  card.tabIndex = 0;
  card.setAttribute('role','button');
  card.style.animationDelay = Math.min(idx*45,420) + 'ms';
  card.setAttribute('aria-label','Open ' + a.name);
  var g = paletteFor(a.name || 'app');
  card.style.setProperty('--c1', g[0]);
  card.style.setProperty('--c2', g[1]);

  var top = el('div','card-top');
  top.appendChild(makeAvatar(a));
  var titles = el('div','card-titles');
  titles.appendChild(el('h3',null,a.name));
  titles.appendChild(el('span','host', a.kind === 'github' && a.repo ? 'github.com/' + a.repo : hostOf(a.openUrl || a.url)));
  top.appendChild(titles);
  var acts = el('div','card-actions');
  var editBtn = el('button','mini-btn'); editBtn.type = 'button'; editBtn.title = 'Edit'; editBtn.appendChild(icon(IC.pencil));
  var delBtn = el('button','mini-btn danger'); delBtn.type = 'button'; delBtn.title = 'Remove'; delBtn.appendChild(icon(IC.trash));
  acts.appendChild(editBtn); acts.appendChild(delBtn);
  top.appendChild(acts);
  card.appendChild(top);

  card.appendChild(a.desc ? el('p','desc',a.desc) : el('p','desc none','No description — edit in Settings to add one.'));

  var chips = el('div','chips');
  if(a.language) chips.appendChild(makeChip(a.language, LANG_COLORS[a.language] || '#94a3b8'));
  if(typeof a.stars === 'number' && a.stars !== null) chips.appendChild(makeChip(a.stars.toLocaleString(), null, icon(IC.star,'0 0 16 16')));
  (a.tags || []).slice(0,4).forEach(function(t){ chips.appendChild(makeChip(t)); });
  card.appendChild(chips);

  var foot = el('div','card-foot');
  var cta = el('span','open-cta','Open ');
  cta.appendChild(icon(IC.ext));
  foot.appendChild(cta);
  if(a.kind === 'github' && a.repo){
    var src = el('a','src-link');
    src.href = 'https://github.com/' + a.repo;
    src.target = '_blank';
    src.rel = 'noopener noreferrer';
    src.title = 'View source on GitHub';
    src.appendChild(GH_ICON.cloneNode(true));
    foot.appendChild(src);
  }
  card.appendChild(foot);

  function open(){
    var u = safeUrl(a.openUrl || a.url);
    if(!u){ toast('No valid URL set for this app — edit it in Settings', 'err'); return; }
    var w = window.open(u, '_blank', 'noopener');
    if(!w) toast('Pop-up blocked by the browser', 'err');
  }
  card.addEventListener('mousemove', function(e){
    var r = card.getBoundingClientRect();
    card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    card.style.setProperty('--my', (e.clientY - r.top) + 'px');
  });
  card.addEventListener('click', function(e){
    if(UI.dragFlag) return;
    if(e.target.closest('.mini-btn') || e.target.closest('.src-link')) return;
    open();
  });
  card.addEventListener('keydown', function(e){
    if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); }
  });
  editBtn.addEventListener('click', function(e){ e.stopPropagation(); editApp(a.id); });
  delBtn.addEventListener('click', function(e){ e.stopPropagation(); removeApp(a.id); });
  return card;
}
function render(){
  UI.brandName.textContent = state.title || 'Launchpad';
  document.title = state.title || 'Launchpad';
  UI.heroP.textContent = state.tagline;
  UI.countPill.textContent = state.apps.length + (state.apps.length === 1 ? ' app' : ' apps');

  UI.grid.textContent = '';
  if(!state.apps.length){
    var empty = el('div','empty');
    var big = el('div','big-plus'); big.appendChild(icon(IC.plus));
    empty.appendChild(big);
    empty.appendChild(el('h2',null,'Add your first app'));
    empty.appendChild(el('p',null,'Paste any GitHub repo link or app URL — the form asks for all details plus your GitHub PAT once, and saves straight to your private repo.'));
    var row = el('div','row');
    var b1 = el('button','btn btn-primary'); b1.type = 'button';
    b1.appendChild(icon(IC.plus)); b1.appendChild(el('span',null,'Add an app'));
    b1.addEventListener('click', function(){ openModal('add'); });
    var b2 = el('button','btn btn-ghost'); b2.type = 'button'; b2.textContent = 'Load 2 sample apps';
    b2.addEventListener('click', loadSamples);
    row.appendChild(b1); row.appendChild(b2);
    empty.appendChild(row);
    UI.grid.appendChild(empty);
    renderManage(); updateNav();
    return;
  }
  var list = filtered();
  if(!list.length){
    UI.grid.appendChild(el('div','no-match','No apps match your search — try another term.'));
    renderManage(); updateNav();
    return;
  }
  list.forEach(function(a,i){ UI.grid.appendChild(makeCard(a,i)); });
  renderManage(); updateNav();
}
function renderManage(){
  if(!MODAL) return;
  var box = MODAL.manageList;
  box.textContent = '';
  if(!state.apps.length){
    box.appendChild(el('div','m-empty','No apps yet — add one from the Add app tab.'));
    return;
  }
  state.apps.forEach(function(a,i){
    var row = el('div','m-row');
    row.appendChild(makeAvatar(a));
    var info = el('div','m-info');
    info.appendChild(el('div','m-name',a.name));
    info.appendChild(el('div','m-url',a.openUrl || a.url || ''));
    row.appendChild(info);
    var btns = el('div','m-btns');
    function mBtn(act, ic, title, disabled){
      var b = el('button','mini-btn'); b.type = 'button'; b.title = title; b.dataset.act = act;
      if(disabled){ b.disabled = true; b.style.opacity = '.35'; }
      b.appendChild(icon(ic));
      return b;
    }
    btns.appendChild(mBtn('up', IC.up, 'Move up', i === 0));
    btns.appendChild(mBtn('down', IC.down, 'Move down', i === state.apps.length-1));
    btns.appendChild(mBtn('edit', IC.pencil, 'Edit', false));
    btns.appendChild(mBtn('del', IC.trash, 'Remove', false));
    row.appendChild(btns);
    box.appendChild(row);
  });
}
function manageClick(e){
  var btn = e.target.closest('[data-act]');
  if(!btn) return;
  var row = btn.closest('.m-row');
  var rows = MODAL.manageList.querySelectorAll('.m-row');
  var idx = -1;
  for(var i=0;i<rows.length;i++){ if(rows[i] === row){ idx = i; break; } }
  if(idx < 0 || !state.apps[idx]) return;
  var act = btn.dataset.act;
  if(act === 'up' && idx > 0){
    var t = state.apps[idx-1]; state.apps[idx-1] = state.apps[idx]; state.apps[idx] = t;
  } else if(act === 'down' && idx < state.apps.length-1){
    var t2 = state.apps[idx+1]; state.apps[idx+1] = state.apps[idx]; state.apps[idx] = t2;
  } else if(act === 'edit'){
    editApp(state.apps[idx].id); return;
  } else if(act === 'del'){
    if(btn.dataset.armed === '1'){ removeApp(state.apps[idx].id); return; }
    btn.dataset.armed = '1'; btn.classList.add('armed'); btn.textContent = 'Sure?';
    setTimeout(function(){
      if(btn.isConnected){ delete btn.dataset.armed; btn.classList.remove('armed'); btn.textContent = ''; btn.appendChild(icon(IC.trash)); }
    }, 2600);
    return;
  } else return;
  render(); scheduleSave();
}
function loadSamples(){
  [
    normApp({ name:'Weather Now', openUrl:'https://weather.com', desc:'Beautiful 7-day forecasts with radar maps and severe alerts.', tags:['weather','forecast'] }),
    normApp({ name:'Kanban Flow', openUrl:'https://trello.com', desc:'Drag-and-drop boards for planning sprints and tracking tasks.', tags:['productivity','tasks'] })
  ].forEach(function(a){ state.apps.push(a); });
  render(); scheduleSave();
  toast('Sample apps added — remove them anytime');
}

/* ---------------- boot / unmount ---------------- */
function boot(){
  readGh();   /* re-read stored config so re-boots pick up changes */
  var raw = sGet(STATE_KEY);
  state = defaultState();
  if(raw){
    try{ state = Object.assign(defaultState(), JSON.parse(raw)); }catch(e){}
  }
  state.apps = (state.apps || []).map(normApp);
  ROOT = document.getElementById('app-root') || document.body;
  buildUI();
  applyTheme();
  render();
  updateGhStatus();
  setStatus(ghReady() ? 'ok' : 'idle', ghReady() ? 'Synced' : 'Not connected');
  loadData();
}
function unmount(){
  if(saveTimer) clearTimeout(saveTimer);
  if(toastTimer) clearTimeout(toastTimer);
  if(ROOT) ROOT.textContent = '';
  ROOT = null; state = null; UI = {}; MODAL = null;
}
window.Launchpad = { boot: boot, unmount: unmount };
if(document.getElementById('app-root')) boot();
})();
