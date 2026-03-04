/* TASKFLOW — app.js */

/* --- Helpers (shortcuts used throughout) --- */
const el      = id  => document.getElementById(id);
const qAll    = sel => document.querySelectorAll(sel);
const getVal  = id  => el(id).value.trim();
const setVal  = (id, v) => { el(id).value = v; };
const setText = (id, v) => { el(id).textContent = v; };

function esc(s) {
  return (s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function fmtDate(d) {
  return new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}
function dateStr(y,m,d) {
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function emptyHTML(icon,h,sub) {
  return `<div class="empty-state"><div class="icon">${icon}</div><h3>${h}</h3><p>${sub}</p></div>`;
}

/* --- App state --- */
let allTasks=[], activeFilter='all', viewMode='grid', editingId=null, chosenPriority='urgent', calYear, calMonth, toastTimer;

/* --- Storage --- */
function loadTasks() {
  try {
    allTasks = JSON.parse(localStorage.getItem('taskflow_tasks')) || [];
    allTasks = allTasks.map(t => ({...t, priority: ['critical','high'].includes(t.priority) ? 'urgent' : 'normal'}));
  } catch { allTasks = []; }
}
const saveTasks = () => localStorage.setItem('taskflow_tasks', JSON.stringify(allTasks));
const makeId    = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

/* --- Modal --- */
function openModal(id) {
  editingId = id || null;
  const t = id ? allTasks.find(t => t.id === id) : null;
  setText('modalTitle', id ? 'Edit Task' : 'Add New Task');
  setVal('inputTitle',    t?.title    ?? '');
  setVal('inputDesc',     t?.desc     ?? '');
  setVal('inputCategory', t?.category ?? '');
  setVal('inputDue',      t?.due      ?? '');
  if (!id) el('inputDue').valueAsDate = new Date();
  pickPriority(t?.priority ?? 'urgent');
  el('modalBackdrop').classList.add('open');
  setTimeout(() => el('inputTitle').focus(), 80);
}
function closeModal() { el('modalBackdrop').classList.remove('open'); editingId=null; }
el('modalBackdrop').addEventListener('click', e => { if (e.target.id==='modalBackdrop') closeModal(); });

function pickPriority(p) {
  chosenPriority = p;
  qAll('.priority-card').forEach(c => c.classList.toggle('selected', c.classList.contains(p)));
}

function saveTask() {
  const title = getVal('inputTitle'), due = getVal('inputDue');
  if (!title) return toast('Please enter a title','error');
  if (!due)   return toast('Please pick a due date','error');
  const old = allTasks.find(t => t.id === editingId);
  const task = { id:editingId||makeId(), title, desc:getVal('inputDesc'), category:getVal('inputCategory'),
    priority:chosenPriority, due, done:old?.done??false, doneAt:old?.doneAt??null, createdAt:old?.createdAt??Date.now() };
  if (editingId) { allTasks = allTasks.map(t => t.id===editingId ? task : t); toast('Updated ✓','success'); }
  else           { allTasks.unshift(task); toast('Added ✓','success'); }
  saveTasks(); closeModal(); refreshAll();
}

/* --- Task actions --- */
function toggleDone(id) {
  allTasks = allTasks.map(t => t.id!==id ? t : {...t, done:!t.done, doneAt:!t.done?Date.now():null});
  saveTasks(); refreshAll();
  const t = allTasks.find(t => t.id===id);
  toast(t.done ? '✓ Done' : 'Reopened','success');
}
function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  allTasks = allTasks.filter(t => t.id!==id);
  saveTasks(); refreshAll(); toast('Deleted');
}

/* --- Refresh all sections --- */
function refreshAll() { syncCategories(); refreshTaskList(); refreshCalendar(); refreshHistory(); refreshStats(); }

/* --- Category dropdown --- */
function syncCategories() {
  const cats = [...new Set(allTasks.map(t => t.category).filter(Boolean))].sort();
  const sel = el('categoryFilter'), current = sel.value;
  sel.innerHTML = '<option value="">🏷 All Categories</option>';
  cats.forEach(c => { const o = document.createElement('option'); o.value = o.textContent = c; if (c===current) o.selected=true; sel.appendChild(o); });
}

/* --- Tasks page --- */
function refreshTaskList() {
  const search = el('searchInput').value.toLowerCase();
  const cat    = el('categoryFilter').value;
  const box = el('taskList');
  box.className = viewMode==='grid' ? 'task-grid' : 'task-list';

  let active = allTasks.filter(t => !t.done);
  let done   = allTasks.filter(t =>  t.done);

  if (activeFilter==='done') { active=[]; }
  else if (activeFilter==='urgent'||activeFilter==='normal') { active=active.filter(t=>t.priority===activeFilter); done=[]; }

  if (cat) { active=active.filter(t=>t.category===cat); done=done.filter(t=>t.category===cat); }

  if (search) {
    const hit = t => [t.title,t.desc,t.category].some(s=>s?.toLowerCase().includes(search));
    active=active.filter(hit); done=done.filter(hit);
  }

  active.sort((a,b) => a.priority!==b.priority ? (a.priority==='urgent'?-1:1) : a.due.localeCompare(b.due));
  done.sort((a,b) => (b.doneAt||0)-(a.doneAt||0));

  if (!active.length && (activeFilter==='done' ? !done.length : true)) {
    box.innerHTML = emptyHTML('✅','No tasks here','Add a task to get started!'); return;
  }
  let html = active.map(cardHTML).join('');
  if (done.length && activeFilter==='all') html += `<div class="done-divider">Completed (${done.length})</div>`;
  if (activeFilter==='all'||activeFilter==='done') html += done.map(cardHTML).join('');
  box.innerHTML = html;
}

function cardHTML(t) {
  const today=new Date().toISOString().slice(0,10), over=!t.done&&t.due<today, isToday=t.due===today;
  const dueClass=over?'overdue':isToday?'today':'';
  const dueText=over?`⚠ Overdue · ${fmtDate(t.due)}`:isToday?'📌 Due Today':`📅 ${fmtDate(t.due)}`;
  return `<div class="task-card ${t.priority}${t.done?' done-card':''}">
    <div class="card-top">
      <div class="checkbox${t.done?' ticked':''}" onclick="toggleDone('${t.id}')"></div>
      <div class="card-text">
        <div class="task-title">${esc(t.title)}</div>
        ${t.desc?`<div class="task-desc">${esc(t.desc)}</div>`:''}
        ${t.category?`<span class="task-category">🏷 ${esc(t.category)}</span>`:''}
      </div>
      <div class="card-actions">
        <button class="icon-btn"        onclick="openModal('${t.id}')">✏️</button>
        <button class="icon-btn delete" onclick="deleteTask('${t.id}')">🗑</button>
      </div>
    </div>
    <div class="card-bottom">
      <span class="priority-badge ${t.priority}">${t.priority}</span>
      <span class="due-text ${dueClass}">${dueText}</span>
    </div></div>`;
}

/* --- Stats --- */
function refreshStats() {
  const today=new Date().toISOString().slice(0,10);
  setText('stat-total',   allTasks.length);
  setText('stat-active',  allTasks.filter(t=>!t.done).length);
  setText('stat-done',    allTasks.filter(t=>t.done).length);
  setText('stat-urgent',  allTasks.filter(t=>t.priority==='urgent'&&!t.done).length);
  setText('stat-overdue', allTasks.filter(t=>t.due<today&&!t.done).length);
}

/* --- Filters & view --- */
function setFilter(name,chip) {
  activeFilter=name;
  qAll('.chip').forEach(c=>c.classList.remove('selected'));
  chip.classList.add('selected'); refreshTaskList();
}
function setView(mode) {
  viewMode=mode;
  el('gridBtn').classList.toggle('selected',mode==='grid');
  el('listBtn').classList.toggle('selected',mode==='list');
  refreshTaskList();
}

/* --- Calendar --- */
function initCalendar() { const n=new Date(); calYear=n.getFullYear(); calMonth=n.getMonth(); }

function refreshCalendar() {
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  setText('calTitle',`${MONTHS[calMonth]} ${calYear}`);
  const today=new Date().toISOString().slice(0,10);
  const fd=new Date(calYear,calMonth,1).getDay(), dim=new Date(calYear,calMonth+1,0).getDate();
  const dip=new Date(calYear,calMonth,0).getDate(), cells=Math.ceil((fd+dim)/7)*7;
  const byDate={}; allTasks.forEach(t=>{(byDate[t.due]=byDate[t.due]||[]).push(t);});
  let html='', day=1, nxt=1;
  for (let i=0;i<cells;i++) {
    let d,cls='';
    if (i<fd)       { d=dateStr(calYear,calMonth,dip-fd+i+1); cls='other-month'; }
    else if (day<=dim){ d=dateStr(calYear,calMonth+1,day++); if(d===today)cls='today'; }
    else            { const nm=calMonth+2>12?1:calMonth+2, ny=calMonth+2>12?calYear+1:calYear; d=dateStr(ny,nm,nxt++); cls='other-month'; }
    const ts=byDate[d]||[];
    const dots=ts.slice(0,3).map(t=>`<div class="cal-dot ${t.priority}${t.done?' done':''}" title="${esc(t.title)}">${esc(t.title)}</div>`).join('');
    const more=ts.length>3?`<div style="font-size:10px;color:var(--muted)">+${ts.length-3}</div>`:'';
    html+=`<div class="cal-day ${cls}" onclick="showDayDetail('${d}')"><div class="day-num">${+d.slice(-2)}</div>${dots}${more}</div>`;
  }
  el('calDays').innerHTML=html;
}

function showDayDetail(date) {
  const panel=el('calDayDetail'), ts=allTasks.filter(t=>t.due===date);
  if (!ts.length) { panel.style.display='none'; return; }
  panel.style.display='block';
  panel.innerHTML=`<div class="cal-detail-title">📅 ${fmtDate(date)}</div>`+ts.map(t=>`
    <div class="cal-detail-row">
      <div class="checkbox${t.done?' ticked':''}" onclick="toggleDone('${t.id}');showDayDetail('${date}')"></div>
      <span class="priority-badge ${t.priority}">${t.priority}</span>
      <span style="font-weight:${t.done?400:600};text-decoration:${t.done?'line-through':'none'}">${esc(t.title)}</span>
      ${t.category?`<span class="task-category" style="margin-left:4px">🏷 ${esc(t.category)}</span>`:''}
      <button class="icon-btn" onclick="openModal('${t.id}')" style="margin-left:auto">✏️</button>
    </div>`).join('');
}

function changeMonth(dir) {
  calMonth+=dir;
  if(calMonth>11){calMonth=0;calYear++;} if(calMonth<0){calMonth=11;calYear--;}
  el('calDayDetail').style.display='none'; refreshCalendar();
}
function goToday() { const n=new Date(); calYear=n.getFullYear(); calMonth=n.getMonth(); refreshCalendar(); }

/* --- History --- */
function refreshHistory() {
  const box=el('historyList');
  if (!allTasks.length) { box.innerHTML=emptyHTML('🗂','No tasks yet','Your history will appear here.'); return; }
  const groups={};
  [...allTasks].sort((a,b)=>b.createdAt-a.createdAt).forEach(t=>{
    const label=new Date(t.createdAt).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
    (groups[label]=groups[label]||[]).push(t);
  });
  box.innerHTML=Object.entries(groups).map(([label,ts])=>
    `<div class="history-group"><div class="history-date">${label}</div><div class="task-list">${ts.map(cardHTML).join('')}</div></div>`
  ).join('');
}

/* --- Page navigation --- */
function showPage(name) {
  qAll('.page').forEach(p=>p.classList.remove('active'));
  el('page-'+name).classList.add('active');
  ['tasks','calendar','history'].forEach((n,i)=>qAll('.nav-tab')[i].classList.toggle('active',n===name));
  if(name==='calendar')refreshCalendar();
  if(name==='history')refreshHistory();
}

/* --- Toast --- */
function toast(msg,type) {
  const t=el('toast'); t.textContent=msg; t.className=`toast ${type||''} show`;
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),2800);
}

/* --- Start --- */
loadTasks(); initCalendar(); refreshAll();