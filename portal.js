/* ================================================================
   CONSTANTS & CONFIG
================================================================ */
/* ----------------------------------------------------------------
   SUPABASE
   Replace the values below with YOUR Supabase project's URL + anon key
   (Supabase Dashboard → Project Settings → API).
   You also need to create the table this app stores data in — run this
   once in the Supabase SQL Editor:

     create table attendance_system (
       key   text primary key,
       value jsonb not null default '{}'::jsonb
     );
     alter table attendance_system enable row level security;
     create policy "public read/write (dev only)" on attendance_system
       for all using (true) with check (true);

   (lock the policy down before using real student data in production).
   For live sync across devices, also turn on Realtime for this table:
   Database → Replication → toggle "attendance_system" on.
---------------------------------------------------------------- */
const SUPABASE_URL      = "https://mozopvfzfrxhvvofnsza.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_O-QAeTyqrmc4yuPWwHOwjQ_Yvzhmoie";

/* Never let a missing/blocked Supabase SDK take down the whole app —
   without this guard, a single failed CDN script load throws an
   uncaught ReferenceError here and every function below silently
   stops working. */
let db = null;
let dbInitError = null;
try {
  if (typeof supabase === 'undefined') {
    throw new Error('The Supabase SDK script did not load (blocked by network/firewall/ad-blocker, or no internet connection).');
  }
  db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (err) {
  dbInitError = err;
  console.error('Supabase init failed:', err);
}

/* All data lives in one Supabase table, one row per data set (key/value,
   value is jsonb). This keeps the data shape identical to the old
   localStorage blobs, so the rest of the app's logic barely
   changes — only persistence does. */
const TABLE = 'attendance_system';
const DOCS = { students:'students', teachers:'teachers', attendance:'attendance', settings:'settings', passwords:'passwords', results:'results', invoices:'invoices', expenses:'expenses' };

const DEFAULT_SETTINGS = {
  orgName:'Kobciye International College',
  periods:['8:00 AM','10:00 AM','12:00 PM','2:00 PM','4:00 PM'],
  rooms:['Room A','Room B','Room C'],
  schoolPhone:''
};

/* Rooms are admin-configurable (Settings screen). Colors are assigned
   from a fixed palette based on each room's position in settings.rooms,
   so newly added rooms automatically get a distinct color. */
const ROOM_PALETTE = [
  {bg:'#dff3df',fg:'#007a00'}, {bg:'#e9e7f7',fg:'#282058'}, {bg:'#d2edd2',fg:'#0a5a0a'},
  {bg:'#dedaf3',fg:'#3b3384'}, {bg:'#eef7ee',fg:'#0a8a0a'}, {bg:'#f0effa',fg:'#4a3fa0'},
  {bg:'#e6f6e6',fg:'#008f00'}, {bg:'#e3e1f3',fg:'#332b74'}
];
function roomStyle(room){
  var list = (settings && settings.rooms && settings.rooms.length) ? settings.rooms : DEFAULT_SETTINGS.rooms;
  var idx = list.indexOf(room);
  if (idx < 0) idx = 0;
  return ROOM_PALETTE[idx % ROOM_PALETTE.length];
}
function roomColor(room){ return roomStyle(room).fg; }

/* Default teacher accounts — seeded into Supabase on first run only.
   Admin can add/edit/remove as many teacher accounts as needed from
   the Teachers screen; each teacher signs into the single "Teacher"
   portal with their own username + password. */
const DEFAULT_TEACHERS = [
  {id:'1', name:'Teacher 1', username:'teacher1', password:'teacher123', room:'Room A'},
  {id:'2', name:'Teacher 2', username:'teacher2', password:'teacher123', room:'Room B'},
  {id:'3', name:'Teacher 3', username:'teacher3', password:'teacher123', room:'Room C'}
];

const DEFAULT_PASSWORDS = {admin:'admin123', adminName:'Admin', adminUsername:'admin', finance:'finance123', financeName:'Finance Officer', financeUsername:'finance'};

/* ================================================================
   STATE
================================================================ */
let students   = [];
let teachers   = [];
let attendance = {};
let results    = {};
let invoices   = [];
let nextInvoiceNo = 1;
let expenses   = [];
let currentViewedInvoice = null;
let settings   = {orgName:DEFAULT_SETTINGS.orgName, periods:[...DEFAULT_SETTINGS.periods], rooms:[...DEFAULT_SETTINGS.rooms], schoolPhone:DEFAULT_SETTINGS.schoolPhone};
let nextId     = 1;
let nextTeacherId = 1;
let passwords  = {admin:'admin123', adminName:'Admin', adminUsername:'admin', finance:'finance123', financeName:'Finance Officer', financeUsername:'finance'};
let currentUser = null;
let selectedPortal = null;
let currentRoom   = '';   // '' = all (admin only)
let currentPeriod = '';   // '' = all
let dataReady = false;    // becomes true once the initial Supabase load finishes
let appToken = null;      // signed session token returned by the login Edge Function; null until signed in

let markSelections = {};
let markSelectionsDate = null;

/* ================================================================
   VISIBILITY SCOPE
   Teachers are hard-locked to their room; admin can filter by room+period
================================================================ */
function visibleStudents() {
  var room   = currentUser && currentUser.role === 'teacher' ? currentUser.room : currentRoom;
  var period = currentPeriod;
  return students.filter(function(s) {
    if (room   && s.room   !== room)   return false;
    if (period && s.period !== period) return false;
    return true;
  });
}

function scopeLabel() {
  var room   = currentUser && currentUser.role === 'teacher' ? currentUser.room : currentRoom;
  var parts  = [];
  if (room)   parts.push(room);
  if (currentPeriod) parts.push(currentPeriod);
  return parts.join(' · ');
}

/* ================================================================
   PERSISTENCE (Supabase)
================================================================ */
/* All reads/writes now go through the "app-data" Edge Function instead of
   hitting the table directly with the public anon key. The table itself
   has Row Level Security locked down with no public policies, so the
   anon key alone can no longer read or write it — only the Edge Function
   (using the service-role key, kept secret server-side) can, and only
   after it has verified the signed session token issued at login. This
   is what stops every visitor's browser from being able to download the
   full student/teacher/password list before signing in. */
async function edgeCall(action, key, value) {
  const res = await fetch(SUPABASE_URL + '/functions/v1/app-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
    body: JSON.stringify({ token: appToken, action: action, key: key, value: value })
  });
  const out = await res.json().catch(function(){ return { ok:false, error:'Bad response from server.' }; });
  if (!out.ok) throw new Error(out.error || 'Request failed.');
  return out;
}
async function getDoc(key) {
  const out = await edgeCall('get', key);
  return out.value;
}
async function setDoc(key, value) {
  await edgeCall('set', key, value);
}

/* Admin website-content access (events, gallery, faculty, Life at KIC, admissions).
   These tables are locked against the public key, so the admin portal goes
   through the "admin-content" Edge Function, which checks the signed admin
   session token first. adminFrom() mimics the small part of the Supabase
   query builder the admin screens use, so their code stays unchanged. */
async function adminCall(st){
  try{
    var res = await fetch(SUPABASE_URL + '/functions/v1/admin-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
      body: JSON.stringify({ token: appToken, table: st.table, action: st.action, payload: st.payload, id: st.id, order: st.order })
    });
    var out = await res.json().catch(function(){ return { ok:false, error:'Bad response from server.' }; });
    if (!out.ok) return { data:null, error:{ message: out.error || 'Request failed.' } };
    return { data: out.data || null, error: null };
  }catch(e){
    return { data:null, error:{ message:'Could not reach the server.' } };
  }
}
function adminFrom(table){
  var st = { table:table, action:null, payload:null, id:null, order:[] };
  var b = {
    select:function(){ st.action='list'; return b; },
    order:function(col, opts){ st.order.push({ col:col, asc: !(opts && opts.ascending === false) }); return b; },
    insert:function(pl){ st.action='insert'; st.payload=pl; return b; },
    update:function(pl){ st.action='update'; st.payload=pl; return b; },
    delete:function(){ st.action='delete'; return b; },
    eq:function(col, val){ st.id=val; return b; },
    then:function(res, rej){ return adminCall(st).then(res, rej); }
  };
  return b;
}

async function loadAll() {
  var wantPasswords = currentUser && (currentUser.role === 'admin' || currentUser.role === 'finance');
  const [stu, tea, att, set, pw, res, inv, exp] = await Promise.all([
    getDoc(DOCS.students),
    getDoc(DOCS.teachers),
    getDoc(DOCS.attendance),
    getDoc(DOCS.settings),
    wantPasswords ? getDoc(DOCS.passwords) : Promise.resolve(null),
    getDoc(DOCS.results),
    getDoc(DOCS.invoices),
    getDoc(DOCS.expenses)
  ]);
  students   = (stu && stu.list) || [];
  attendance = (att && att.data) || {};
  results    = (res && res.data) || {};
  invoices   = (inv && inv.list) || [];
  nextInvoiceNo = invoices.reduce(function(mx,i){return Math.max(mx,parseInt(i.receiptNo,10)||0);},0)+1;
  expenses   = (exp && exp.list) || [];
  var s      = set || {};
  settings   = {orgName: s.orgName||DEFAULT_SETTINGS.orgName, periods: s.periods||[...DEFAULT_SETTINGS.periods], rooms: (s.rooms && s.rooms.length) ? s.rooms : [...DEFAULT_SETTINGS.rooms], schoolPhone: s.schoolPhone||DEFAULT_SETTINGS.schoolPhone};
  var p      = pw || {};
  passwords  = {admin:p.admin||DEFAULT_PASSWORDS.admin, adminName:p.adminName||DEFAULT_PASSWORDS.adminName, adminUsername:p.adminUsername||DEFAULT_PASSWORDS.adminUsername,
                finance:p.finance||DEFAULT_PASSWORDS.finance, financeName:p.financeName||DEFAULT_PASSWORDS.financeName, financeUsername:p.financeUsername||DEFAULT_PASSWORDS.financeUsername};
  recomputeNextId();

  if (tea && Array.isArray(tea.list)) {
    teachers = tea.list;
  } else {
    /* First run — seed the default teacher accounts so logins work immediately */
    teachers = DEFAULT_TEACHERS.map(function(t){ return Object.assign({}, t); });
    await saveTeachers();
  }
  recomputeNextTeacherId();
}
function recomputeNextId(){
  nextId = students.reduce(function(mx,s){return Math.max(mx,parseInt(s.id,10)||0);},0)+1;
}
function recomputeNextTeacherId(){
  nextTeacherId = teachers.reduce(function(mx,t){return Math.max(mx,parseInt(t.id,10)||0);},0)+1;
}
async function saveStudents()  { recomputeNextId(); await setDoc(DOCS.students, {list:students}); }
async function saveTeachers()  { recomputeNextTeacherId(); await setDoc(DOCS.teachers, {list:teachers}); }
async function saveAttendance(){ await setDoc(DOCS.attendance, {data:attendance}); }
async function saveResults()   { await setDoc(DOCS.results, {data:results}); }
async function saveInvoices()  { await setDoc(DOCS.invoices, {list:invoices}); }
async function saveExpenses()  { await setDoc(DOCS.expenses, {list:expenses}); }
async function saveSettings()  { await setDoc(DOCS.settings, settings); }
async function savePasswords() { await setDoc(DOCS.passwords, passwords); }

/* Live sync: keep local state up to date if data changes elsewhere
   (e.g. another teacher/admin device), and re-render the active view.
   Requires Realtime to be turned on for this table in the Supabase
   dashboard (Database → Replication). If it isn't, the app still works
   fine — it just won't auto-refresh across devices until a manual reload. */
function attachLiveListeners(){
  db.channel('attendance_system_changes')
    .on('postgres_changes', { event:'*', schema:'public', table: TABLE }, function(payload){
      var row = payload.new || payload.old;
      if (!row || !row.key) return;
      var value = row.value;
      if (row.key === DOCS.students) {
        students = (value && value.list) || [];
        recomputeNextId();
        if (currentUser) renderActiveView();
      } else if (row.key === DOCS.teachers) {
        if (value && Array.isArray(value.list)) {
          teachers = value.list;
          recomputeNextTeacherId();
          if (currentUser) renderActiveView();
        }
      } else if (row.key === DOCS.attendance) {
        attendance = (value && value.data) || {};
        if (currentUser) renderActiveView();
      } else if (row.key === DOCS.results) {
        results = (value && value.data) || {};
        if (currentUser) renderActiveView();
      } else if (row.key === DOCS.invoices) {
        invoices = (value && value.list) || [];
        if (currentUser) renderActiveView();
      } else if (row.key === DOCS.expenses) {
        expenses = (value && value.list) || [];
        if (currentUser) renderActiveView();
      }
    })
    .subscribe();
}

/* ================================================================
   HELPERS
================================================================ */
function pad(n){ return String(n).padStart(2,'0'); }
function todayKey(){ var d=new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function formatDate(key){ var p=key.split('-').map(Number); return new Date(p[0],p[1]-1,p[2]).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}); }
function nowTime(){ return new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }
var WEEKEND=[4,5];
function isWeekend(key){ var p=key.split('-').map(Number); return WEEKEND.indexOf(new Date(p[0],p[1]-1,p[2]).getDay())>-1; }
function isWeekendDate(d){ return WEEKEND.indexOf(d.getDay())>-1; }
function schoolDaysInMonth(y,m0){ var days=new Date(y,m0+1,0).getDate(),c=0; for(var i=1;i<=days;i++){if(!isWeekendDate(new Date(y,m0,i)))c++;} return c; }

/* ---- Results helpers ---- */
function gradeForPct(pct){
  if (pct>=90) return 'A+';
  if (pct>=80) return 'A';
  if (pct>=70) return 'B';
  if (pct>=60) return 'C';
  if (pct>=50) return 'D';
  if (pct>=40) return 'E';
  return 'F';
}
function gradeColor(grade){
  if (grade==='F') return 'var(--red)';
  if (grade==='A+'||grade==='A') return 'var(--green)';
  if (grade==='E'||grade==='D') return 'var(--gold-dark)';
  return 'var(--blue)';
}
var EXAM_TYPES = {monthly:'Monthly Exam', bookend:'Book End Exam', final:'Final Exam'};
function computeResultTotals(entry){
  if (!entry || !entry.subjects || !entry.subjects.length) return null;
  var totalMarks=0, totalMax=0;
  entry.subjects.forEach(function(s){ totalMarks += Number(s.marks)||0; totalMax += Number(s.max)||0; });
  var pct = totalMax ? (totalMarks/totalMax*100) : 0;
  return {totalMarks:totalMarks, totalMax:totalMax, pct:pct, grade:gradeForPct(pct), pass: pct>=50};
}
function formatMonthLabel(monthKey){
  if (!monthKey) return '';
  var p = monthKey.split('-');
  return new Date(parseInt(p[0],10), parseInt(p[1],10)-1, 1).toLocaleDateString(undefined,{year:'numeric',month:'long'});
}
function currentMonthKey(){
  var d = new Date();
  return d.getFullYear()+'-'+pad(d.getMonth()+1);
}
function monthlyAttendancePct(studentId, monthKey){
  var p=0,a=0,l=0;
  Object.keys(attendance).forEach(function(date){
    if (!date.startsWith(monthKey)) return;
    var rec = attendance[date][studentId];
    if (rec) { if (rec.status==='Present') p++; else if (rec.status==='Absent') a++; else if (rec.status==='Leave') l++; }
  });
  var marked = p + a + l;
  return marked ? {pct:(p/marked*100), present:p, absent:a, leave:l, marked:marked} : null;
}
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);}); }
function statusPill(st){
  if(st==='Present') return '<span class="pill pill-present">Present</span>';
  if(st==='Absent')  return '<span class="pill pill-absent">Absent</span>';
  if(st==='Leave')   return '<span class="pill pill-leave">On Leave</span>';
  return '<span class="pill pill-pending">Not Marked</span>';
}
function roomPill(r){ if(!r) return '<span class="pill">—</span>'; var st=roomStyle(r); return '<span class="pill" style="background:'+st.bg+';color:'+st.fg+';">'+esc(r)+'</span>'; }
function showToast(msg){ var t=document.getElementById('toast'); document.getElementById('toastMsg').textContent=msg; t.classList.add('show'); clearTimeout(t._t); t._t=setTimeout(function(){t.classList.remove('show');},2400); }
function byId(id){ return students.find(function(s){return s.id===id;}); }

/* ================================================================
   LOGIN
================================================================ */
/* Load data from Supabase before the login page becomes interactive */
function setLoginBusy(busy, msg){
  var btn = document.getElementById('loginBtn');
  var txt = document.getElementById('loginBtnText');
  var spin = document.getElementById('loginBtnSpinner');
  btn.disabled = busy;
  btn.style.opacity = busy ? 0.75 : 1;
  if (busy) {
    txt.textContent = msg || 'Loading…';
    spin.style.display = 'inline-block';
  } else {
    txt.textContent = 'Sign In →';
    spin.style.display = 'none';
  }
}
function showConnError(msg){
  document.getElementById('connErrorMsg').textContent = msg;
  document.getElementById('connError').style.display = 'block';
}
function hideConnError(){
  document.getElementById('connError').style.display = 'none';
}
async function bootApp(){
  hideConnError();
  if (dbInitError || !db) {
    setLoginBusy(true, 'Connection failed — see message below');
    showConnError('Could not load Supabase: ' + dbInitError.message + ' Check your internet connection, disable any ad-blocker for this page, and reload.');
    return;
  }
  /* Nothing is fetched here anymore — school data (students, teachers,
     passwords, attendance, results, invoices) is only loaded AFTER a
     successful sign-in, once the login Edge Function has issued a
     session token. This is what keeps that data out of the browser for
     anyone who hasn't actually logged in. */
  dataReady = true;
  setLoginBusy(false);
  applyPortalFromURL();
}
bootApp();
document.getElementById('retryConnBtn').addEventListener('click', function(e){ e.stopPropagation(); bootApp(); });

var PORTAL_ROLE_NAMES = {admin:'Admin', teacher:'Teacher', student:'Student', finance:'Finance'};

function applyPortalFromURL(){
  var params = new URLSearchParams(window.location.search);
  var role = (params.get('portal') || '').toLowerCase();
  if (!PORTAL_ROLE_NAMES[role]) return;
  document.getElementById('portalGrid').style.display = 'none';
  document.getElementById('portalCardTitle').textContent = 'Sign in as ' + PORTAL_ROLE_NAMES[role];
  document.getElementById('portalCardSub').textContent = 'Enter your username and password to continue.';
  document.getElementById('portalBackLink').style.display = 'inline-block';
  selectPortal(role);
}
/* Apply the pre-selected portal role immediately (before the async Supabase
   load finishes) so the "Select Portal & Sign In" grid never flashes on
   screen when the site links straight into a specific portal. This must
   run after PORTAL_ROLE_NAMES/selectPortal are defined above. */
applyPortalFromURL();

function backToWebsite(){
  try {
    if (window.parent && window.parent !== window) {
      try { if (typeof window.parent.closePortal === 'function') { window.parent.closePortal(); return; } } catch (e2) {}
      window.parent.postMessage({ type: 'kic-close-portal' }, '*');
      return;
    }
  } catch (e) { /* cross-origin or standalone */ }
}
document.getElementById('backToWebsiteLink').addEventListener('click', backToWebsite);

document.getElementById('portalBackLink').addEventListener('click', function(){
  document.getElementById('portalGrid').style.display = '';
  document.getElementById('portalCardTitle').textContent = 'Select Portal & Sign In';
  document.getElementById('portalCardSub').textContent = 'Click your portal, then enter your username and password.';
  document.getElementById('portalBackLink').style.display = 'none';
  document.getElementById('usernameWrap').style.display = 'none';
  document.getElementById('passwordWrap').style.display = 'none';
  selectedPortal = null;
  document.querySelectorAll('.portal-btn').forEach(function(b){ b.classList.remove('selected'); });
  var url = new URL(window.location.href);
  url.searchParams.delete('portal');
  window.history.replaceState({}, '', url);
});

function selectPortal(role) {
  selectedPortal = role;
  document.querySelectorAll('.portal-btn').forEach(function(b){
    b.classList.toggle('selected', b.dataset.role === role);
  });
  document.getElementById('usernameWrap').style.display = 'block';
  document.getElementById('passwordWrap').style.display = 'block';
  var label = document.getElementById('loginUsernameLabel');
  var input = document.getElementById('loginUsername');
  if (role === 'student') {
    label.textContent = 'Roll Number';
    input.placeholder = 'Enter your roll number';
  } else {
    label.textContent = 'Username';
    input.placeholder = role === 'admin' ? "Enter '"+(passwords.adminUsername||'admin')+"'" : role === 'finance' ? "Enter '"+(passwords.financeUsername||'finance')+"'" : 'Enter your username';
  }
  input.value = '';
  document.getElementById('loginPassword').value = '';
  input.focus();
  document.getElementById('loginError').style.display = 'none';
}

/* Credential checking now happens server-side in the "login" Edge
   Function, which is the only thing allowed to read the passwords table
   (via the service-role key). The browser never sees anyone's password —
   it sends what the person typed and gets back either a signed session
   token or a generic error. */
async function doLogin() {
  if (dbInitError || !db) { showLoginErr('Cannot sign in — Supabase did not connect. See the message above the portals.'); return; }
  if (!selectedPortal) { showLoginErr('Please select a portal first.'); return; }

  var username = document.getElementById('loginUsername').value.trim();
  var pw       = document.getElementById('loginPassword').value;
  if (!username) {
    showLoginErr('Please enter your ' + (selectedPortal === 'student' ? 'roll number' : 'username') + '.');
    return;
  }
  if (!pw) { showLoginErr('Please enter your password.'); return; }

  setLoginBusy(true, 'Signing in…');
  var out;
  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
      body: JSON.stringify({ portal: selectedPortal, username: username, password: pw })
    });
    out = await res.json().catch(function(){ return { ok:false, error:'Bad response from server.' }; });
  } catch (err) {
    setLoginBusy(false);
    showLoginErr('Could not reach the server. Please check your connection and try again.');
    return;
  }
  if (!out.ok) {
    setLoginBusy(false);
    showLoginErr(out.error || 'Login failed. Please try again.');
    return;
  }

  appToken = out.token;
  var p = out.profile || {};
  if (selectedPortal === 'admin') {
    currentUser = {key:'admin', label:p.label||'Admin', role:'admin', color:'#282058', initials:(p.label||'Admin').trim().slice(0,2).toUpperCase(), room:null};
  } else if (selectedPortal === 'finance') {
    currentUser = {key:'finance', label:p.label||'Finance Officer', role:'finance', color:'#4a3fa0', initials:(p.label||'Finance Officer').trim().slice(0,2).toUpperCase(), room:null};
  } else if (selectedPortal === 'teacher') {
    currentUser = {key:'teacher_'+p.id, label:p.label, role:'teacher',
                   color:roomColor(p.room), initials:(p.label||'T').trim().slice(0,2).toUpperCase(),
                   room:p.room, teacherId:p.id};
  } else if (selectedPortal === 'student') {
    currentUser = {key:'student', label:p.label, role:'student', color:'#0a5a0a',
                   initials:(p.label||'??').trim().slice(0,2).toUpperCase(), room:p.room, studentId:p.id};
  } else {
    setLoginBusy(false);
    showLoginErr('Unknown portal.');
    return;
  }

  setLoginBusy(true, 'Loading…');
  try {
    await loadAll();
    attachLiveListeners();
    dataReady = true;
  } catch (err) {
    setLoginBusy(false);
    appToken = null;
    currentUser = null;
    showLoginErr('Signed in, but could not load school data: ' + err.message);
    return;
  }
  setLoginBusy(false);
  launchApp();
}
function showLoginErr(msg){ var el=document.getElementById('loginError'); el.textContent=msg; el.style.display='block'; }

/* ================================================================
   LAUNCH / LOGOUT
================================================================ */
function launchApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('mainApp').classList.add('visible');

  var u = currentUser;
  var isAdmin   = u.role === 'admin';
  var isTeacher = u.role === 'teacher';
  var isStudent = u.role === 'student';
  var isFinance = u.role === 'finance';

  /* Sidebar user info */
  var av = document.getElementById('sidebarAvatar');
  av.textContent = u.initials;
  av.style.background = u.color;
  av.style.color = '#fff';
  document.getElementById('sidebarUserName').textContent = u.label;
  document.getElementById('sidebarUserRole').textContent = isAdmin ? 'Administrator' : isFinance ? 'Finance Officer' : isStudent ? 'Student — ' + (u.room||'') : 'Teacher — ' + (u.room||'');

  /* Top bar */
  document.getElementById('topWelcome').textContent = 'Welcome, ' + u.label;
  var ta = document.getElementById('topAvatar');
  ta.textContent = u.initials[0];
  ta.style.background = u.color;

  /* Room filter UI — students don't need it at all */
  document.getElementById('adminRoomWrap').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('teacherRoomBadge').style.display = isTeacher ? 'block' : 'none';
  if (isAdmin) {
    currentRoom = '';
    document.getElementById('sidebarRoomSelect').value = '';
  } else if (isTeacher) {
    var badge = document.getElementById('teacherRoomBadgeInner');
    var bst = roomStyle(u.room);
    badge.style.background = bst.bg;
    badge.style.color = bst.fg;
    document.getElementById('teacherRoomLabel').textContent = u.room;
    currentRoom = u.room; /* LOCKED */
  } else {
    currentRoom = '';
  }
  document.querySelector('.filter-wrap').style.display = (isStudent || isFinance) ? 'none' : 'flex';

  /* Admin-only elements */
  document.querySelectorAll('.admin-only').forEach(function(el){
    el.style.display = isAdmin ? '' : 'none';
  });
  if (isAdmin) {
    document.getElementById('addStudentBtn').style.display = '';
    document.getElementById('adminRoomOverview').style.display = 'block';
  }

  /* Staff-only nav/views (dashboard, students, attendance, reports, results,
     view student) are only for admin & teacher */
  document.querySelectorAll('.staff-only').forEach(function(el){
    el.style.display = (isAdmin || isTeacher) ? '' : 'none';
  });
  document.querySelectorAll('.student-only').forEach(function(el){
    el.style.display = isStudent ? '' : 'none';
  });
  /* fin-access: shared by Admin & Finance (e.g. Record Payment / Finance list) */
  document.querySelectorAll('.fin-access').forEach(function(el){
    el.style.display = (isAdmin || isFinance) ? '' : 'none';
  });
  /* finance-only: exclusive to the Finance portal (e.g. Finance Dashboard) */
  document.querySelectorAll('.finance-only').forEach(function(el){
    el.style.display = isFinance ? '' : 'none';
  });
  document.getElementById('navProfile').style.display = '';

  currentPeriod = '';
  applySettingsToUI();
  document.getElementById('attendanceDate').value = todayKey();
  document.getElementById('attendanceDate').max   = todayKey();

  /* Wire nav */
  document.querySelectorAll('.nav-item').forEach(function(btn){
    btn.addEventListener('click', function(){ switchView(btn.dataset.view); });
  });
  document.querySelectorAll('[data-go]').forEach(function(btn){
    btn.addEventListener('click', function(){ switchView(btn.dataset.go); });
  });

  switchView(isStudent ? 'myattendance' : isFinance ? 'findashboard' : 'dashboard');
}

function logoutApp() {
  document.getElementById('mainApp').classList.remove('visible');
  document.getElementById('exitOverlay').classList.add('hidden');
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginUsername').value = '';
  document.getElementById('usernameWrap').style.display = 'none';
  document.getElementById('passwordWrap').style.display = 'none';
  document.getElementById('loginError').style.display = 'none';
  selectedPortal = null; currentUser = null; currentRoom = ''; currentPeriod = ''; appToken = null;
  document.querySelectorAll('.portal-btn').forEach(function(b){ b.classList.remove('selected'); });
  /* Clone nav items to remove duplicate listeners */
  document.querySelectorAll('.nav-item').forEach(function(btn){
    var c = btn.cloneNode(true); btn.parentNode.replaceChild(c, btn);
  });
  /* Return to the main website instead of staying on this internal login
     screen — the portal is embedded in an overlay on the school site, and
     the parent page owns the "close" behavior. */
  try {
    if (window.parent && window.parent !== window) {
      try { if (typeof window.parent.closePortal === 'function') { window.parent.closePortal(); return; } } catch (e2) {}
      window.parent.postMessage({ type: 'kic-close-portal' }, '*');
      return;
    }
  } catch (e) { /* cross-origin or standalone — fall back below */ }
  document.getElementById('loginPage').style.display = 'flex';
}

document.getElementById('returnBtn').addEventListener('click', logoutApp);
document.getElementById('menuBtn').addEventListener('click', function(){
  document.getElementById('sidebar').classList.toggle('open');
});

/* ================================================================
   NAVIGATION
================================================================ */
var ALL_VIEWS = ['dashboard','students','attendance','reports','results','search','teachers','users','admissions','websiteevents','websitegallery','websitefaculty','websitelife','finance','feestatus','findashboard','settings','backup','myattendance','myresults','myinvoices','profile'];
var VIEW_TITLES = {dashboard:'Dashboard',students:'Students',attendance:'Mark Attendance',
  reports:'Reports',results:'Results',search:'View Student',teachers:'Teachers',users:'Users',admissions:'Admissions',websiteevents:'Website Events',websitegallery:'Moments Gallery',websitefaculty:'Website Faculty',websitelife:'Life at KIC',finance:'Finance',feestatus:'Fee Status',findashboard:'Finance Dashboard',settings:'Settings',backup:'Backup & Restore',myattendance:'My Attendance',myresults:'My Results',myinvoices:'My Invoices',profile:'My Profile'};

function switchView(view) {
  if (view === 'exit') { document.getElementById('exitOverlay').classList.remove('hidden'); return; }
  window.scrollTo(0, 0);
  ALL_VIEWS.forEach(function(v){
    var el = document.getElementById('view-'+v);
    if (el) el.classList.toggle('active', v === view);
  });
  document.querySelectorAll('.nav-item').forEach(function(b){ b.classList.toggle('active', b.dataset.view === view); });
  document.getElementById('pageTitle').textContent = VIEW_TITLES[view] || view;
  document.getElementById('sidebar').classList.remove('open');
  if(view==='dashboard')  renderDashboard();
  if(view==='students')   renderStudents();
  if(view==='attendance') renderAttendanceView();
  if(view==='reports')    renderReports();
  if(view==='results')    renderResults();
  if(view==='search')     renderSearch();
  if(view==='teachers')   renderTeachers();
  if(view==='users')      renderUsers();
  if(view==='admissions') renderAdmissions();
  if(view==='websiteevents') renderWebEvents();
  if(view==='websitegallery') renderGallery();
  if(view==='websitefaculty') renderFacultyWeb();
  if(view==='websitelife') renderLife();
  if(view==='finance')    renderFinance();
  if(view==='feestatus')  renderFeeStatus();
  if(view==='findashboard') renderFinanceDashboard();
  if(view==='settings')   renderSettings();
  if(view==='backup')     renderBackup();
  if(view==='myattendance') renderMyAttendance();
  if(view==='myresults')    renderMyResults();
  if(view==='myinvoices')   renderMyInvoices();
  if(view==='profile')      renderMyProfile();
}

function renderActiveView() {
  var ab = document.querySelector('.nav-item.active');
  var v  = ab ? ab.dataset.view : (currentUser && currentUser.role==='student' ? 'myattendance' : 'dashboard');
  switchView(v);
}

/* ================================================================
   SETTINGS & SIDEBAR SELECTS
================================================================ */
function applySettingsToUI() {
  document.getElementById('orgNameDisplay').textContent = settings.orgName.toUpperCase();
  populatePeriodSelect();
  populateRoomFilterSelects();
}

function populatePeriodSelect() {
  var sel = document.getElementById('sidebarPeriodSelect');
  if (settings.periods.indexOf(currentPeriod) === -1) currentPeriod = '';
  sel.innerHTML = '<option value="">All Periods</option>' +
    settings.periods.map(function(p){ return '<option value="'+esc(p)+'"'+( p===currentPeriod?' selected':'')+'>'+esc(p)+'</option>'; }).join('');
}

/* Every dropdown with class "room-filter-select" (sidebar + per-page filters on
   Students/Attendance/Results/View Student) shares the same currentRoom state
   and stays in sync with each other. */
function populateRoomFilterSelects() {
  var isTeacher = currentUser && currentUser.role === 'teacher';
  if (!isTeacher && settings.rooms.indexOf(currentRoom) === -1) currentRoom = '';
  var opts = '<option value="">All Rooms</option>' +
    settings.rooms.map(function(r){ return '<option value="'+esc(r)+'">'+esc(r)+'</option>'; }).join('');
  document.querySelectorAll('.room-filter-select').forEach(function(sel){
    sel.innerHTML = opts;
    if (!isTeacher) sel.value = currentRoom;
  });
}

document.addEventListener('change', function(e){
  if (e.target.classList && e.target.classList.contains('room-filter-select')) {
    currentRoom = e.target.value;
    populateRoomFilterSelects();
    renderActiveView();
  }
});

document.getElementById('sidebarPeriodSelect').addEventListener('change', function(e){
  currentPeriod = e.target.value;
  renderActiveView();
});

document.getElementById('saveSettingsBtn').addEventListener('click', function(){
  settings.orgName     = document.getElementById('orgNameInput').value.trim() || DEFAULT_SETTINGS.orgName;
  settings.schoolPhone = document.getElementById('schoolPhoneInput').value.trim();
  saveSettings();
  applySettingsToUI();
  showToast('Settings saved');
});

function renderSettings() {
  document.getElementById('orgNameInput').value     = settings.orgName;
  document.getElementById('schoolPhoneInput').value = settings.schoolPhone || '';
  renderRoomChips();
  renderPeriodChips();
}

/* ---- Rooms management ---- */
function renderRoomChips(){
  var wrap = document.getElementById('roomChipList');
  wrap.innerHTML = settings.rooms.length
    ? settings.rooms.map(function(r){ return '<span class="chip">'+esc(r)+
        '<button type="button" class="rename-btn" data-rename-room="'+esc(r)+'" title="Rename room">✎</button>'+
        '<button type="button" data-remove-room="'+esc(r)+'" title="Remove room">&times;</button></span>'; }).join('')
    : '<span class="note">No rooms yet — add one below.</span>';
  wrap.querySelectorAll('[data-remove-room]').forEach(function(b){
    b.addEventListener('click', function(){ removeRoom(b.dataset.removeRoom); });
  });
  wrap.querySelectorAll('[data-rename-room]').forEach(function(b){
    b.addEventListener('click', function(){ renameRoom(b.dataset.renameRoom); });
  });
}
function addRoom(){
  var input = document.getElementById('addRoomInput');
  var v = input.value.trim();
  if (!v) return;
  if (settings.rooms.some(function(r){return r.toLowerCase()===v.toLowerCase();})) { showToast('That room already exists'); return; }
  settings.rooms.push(v);
  saveSettings();
  input.value = '';
  renderRoomChips();
  applySettingsToUI();
  showToast('Room added');
}
function renameRoom(oldName){
  var newName = prompt('Rename room', oldName);
  if (newName === null) return;
  newName = newName.trim();
  if (!newName) { showToast('Room name cannot be empty'); return; }
  if (newName === oldName) return;
  if (settings.rooms.some(function(r){ return r.toLowerCase() === newName.toLowerCase() && r !== oldName; })) {
    showToast('That room name is already in use'); return;
  }
  var idx = settings.rooms.indexOf(oldName);
  if (idx === -1) return;
  settings.rooms[idx] = newName;
  students.forEach(function(s){ if (s.room === oldName) s.room = newName; });
  teachers.forEach(function(t){ if (t.room === oldName) t.room = newName; });
  saveSettings();
  saveStudents();
  saveTeachers();
  renderRoomChips();
  applySettingsToUI();
  showToast('Room renamed to "' + newName + '"');
}
function removeRoom(room){
  if (settings.rooms.length <= 1) { showToast('You need at least one room'); return; }
  var used = students.some(function(s){return s.room===room;}) || teachers.some(function(t){return t.room===room;});
  if (used && !confirm('Some students/teachers are assigned to "'+room+'". Remove it anyway?')) return;
  settings.rooms = settings.rooms.filter(function(r){return r!==room;});
  saveSettings();
  renderRoomChips();
  applySettingsToUI();
  showToast('Room removed');
}
document.getElementById('addRoomBtn').addEventListener('click', addRoom);
document.getElementById('addRoomInput').addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); addRoom(); } });

/* ---- Periods management ---- */
function renderPeriodChips(){
  var wrap = document.getElementById('periodChipList');
  wrap.innerHTML = settings.periods.length
    ? settings.periods.map(function(p){ return '<span class="chip">'+esc(p)+'<button type="button" data-remove-period="'+esc(p)+'" title="Remove period">&times;</button></span>'; }).join('')
    : '<span class="note">No periods yet — add one below.</span>';
  wrap.querySelectorAll('[data-remove-period]').forEach(function(b){
    b.addEventListener('click', function(){ removePeriod(b.dataset.removePeriod); });
  });
}
function addPeriod(){
  var input = document.getElementById('addPeriodInput');
  var v = input.value.trim();
  if (!v) return;
  if (settings.periods.some(function(p){return p.toLowerCase()===v.toLowerCase();})) { showToast('That period already exists'); return; }
  settings.periods.push(v);
  saveSettings();
  input.value = '';
  renderPeriodChips();
  populatePeriodSelect();
  showToast('Period added');
}
function removePeriod(period){
  if (settings.periods.length <= 1) { showToast('You need at least one period'); return; }
  settings.periods = settings.periods.filter(function(p){return p!==period;});
  saveSettings();
  renderPeriodChips();
  populatePeriodSelect();
  showToast('Period removed');
}
document.getElementById('addPeriodBtn').addEventListener('click', addPeriod);
document.getElementById('addPeriodInput').addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); addPeriod(); } });

/* ================================================================
   DASHBOARD
================================================================ */
function renderDashboard() {
  var key = todayKey();
  var wknd = isWeekend(key);
  document.getElementById('dashTodayDate').textContent = formatDate(key) + (wknd ? ' · Weekend' : '');

  var scope = scopeLabel();
  document.getElementById('dashSubtitle').textContent = scope
    ? 'Attendance for ' + scope + '.'
    : 'Attendance across all students.';

  var scoped = visibleStudents();
  var ids    = {};
  scoped.forEach(function(s){ ids[s.id] = true; });
  var todays = attendance[key] || {};
  var present=0, absent=0, leave=0;
  Object.keys(todays).forEach(function(sid){
    if (!ids[sid]) return;
    var st = todays[sid].status;
    if(st==='Present') present++;
    else if(st==='Absent') absent++;
    else if(st==='Leave') leave++;
  });

  document.getElementById('statTotal').textContent   = scoped.length;
  document.getElementById('statPresent').textContent = present;
  document.getElementById('statAbsent').textContent  = absent;
  document.getElementById('statLeave').textContent   = leave;
  document.getElementById('statPercent').textContent = scoped.length ? ((present/scoped.length)*100).toFixed(1)+'%' : '0%';

  /* Admin room overview cards */
  var overviewEl = document.getElementById('adminRoomOverview');
  if (currentUser && currentUser.role === 'admin' && overviewEl.style.display !== 'none') {
    overviewEl.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:20px;">' +
      settings.rooms.map(function(room){
        var rs = students.filter(function(s){ return s.room===room; });
        var rids = {}; rs.forEach(function(s){ rids[s.id]=true; });
        var rp=0,ra=0,rl=0;
        Object.keys(todays).forEach(function(sid){
          if(!rids[sid]) return;
          var st=todays[sid].status;
          if(st==='Present') rp++;
          else if(st==='Absent') ra++;
          else if(st==='Leave') rl++;
        });
        var pct = rs.length ? ((rp/rs.length)*100).toFixed(0) : 0;
        var roomTeachers = teachers.filter(function(t){ return t.room === room; });
        var tc = roomColor(room);
        var teacherLabel = roomTeachers.length ? roomTeachers.map(function(t){return t.name;}).join(', ') : 'Unassigned';
        return '<div class="card" style="margin:0;border-top:4px solid '+tc+';">'+
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'+
            roomPill(room)+
            '<span style="font-size:11px;color:var(--muted);font-weight:700;">'+esc(teacherLabel)+'</span>'+
          '</div>'+
          '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">'+
            '<div class="detail-box" style="padding:10px;"><b>'+rs.length+'</b><span>Students</span></div>'+
            '<div class="detail-box" style="padding:10px;"><b>'+pct+'%</b><span>Attendance</span></div>'+
            '<div class="detail-box" style="padding:10px;"><b style="color:var(--green)">'+rp+'</b><span>Present</span></div>'+
            '<div class="detail-box" style="padding:10px;"><b style="color:var(--red)">'+ra+'</b><span>Absent</span></div>'+
          '</div></div>';
      }).join('') + '</div>';
  }

  /* Today's log table */
  var wrap = document.getElementById('dashTableWrap');
  if (wknd) {
    wrap.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18"/></svg><div>Weekend — no school today.</div></div>';
    return;
  }
  var rows = [];
  Object.keys(todays).forEach(function(sid){
    if (!ids[sid]) return;
    var s = byId(sid); if (!s) return;
    rows.push({id:s.id, name:s.name, room:s.room, period:s.period, status:todays[sid].status, time:todays[sid].time});
  });
  if (!rows.length) {
    wrap.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18"/></svg><div>No attendance marked for today yet.</div></div>';
    return;
  }
  wrap.innerHTML = '<table><thead><tr><th>Name</th><th>Room</th><th>Period</th><th>Status</th><th>Time</th></tr></thead><tbody>'+
    rows.map(function(r){ return '<tr><td><strong>'+esc(r.name)+'</strong></td><td>'+roomPill(r.room)+'</td><td>'+esc(r.period||'—')+'</td><td>'+statusPill(r.status)+'</td><td>'+esc(r.time||'--')+'</td></tr>'; }).join('') +
    '</tbody></table>';
}

/* ================================================================
   STUDENTS
================================================================ */
function renderStudents() {
  var isAdmin = currentUser && currentUser.role === 'admin';
  document.getElementById('studentsSubtitle').textContent = isAdmin
    ? 'Add, edit, or remove students. Each student is assigned to a Room and Period.'
    : 'Students in ' + (currentUser.room||'your room') + (currentPeriod ? ' — ' + currentPeriod : '') + '.';

  var scoped = visibleStudents();
  document.getElementById('studentCount').textContent = scoped.length + ' Student' + (scoped.length===1?'':'s');
  var wrap = document.getElementById('studentsTableWrap');
  if (!scoped.length) {
    wrap.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/></svg><div>No students' + (scopeLabel()?' in '+esc(scopeLabel()):' yet.') + '</div></div>';
    return;
  }
  var sorted = scoped.slice().sort(function(a,b){return a.name.localeCompare(b.name);});
  wrap.innerHTML = '<table><thead><tr><th>Name</th><th>Room</th><th>Period</th><th>Roll No</th><th>Actions</th></tr></thead><tbody>' +
    sorted.map(function(s){
      return '<tr>'+
        '<td><strong>'+esc(s.name)+'</strong></td>'+
        '<td>'+roomPill(s.room)+'</td>'+
        '<td>'+esc(s.period||'—')+'</td>'+
        '<td>'+esc(s.roll||'—')+'</td>'+
        '<td><div style="display:flex;gap:6px;">'+
          '<button class="icon-btn" data-view="'+s.id+'" title="View"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg></button>'+
          (isAdmin ? '<button class="icon-btn" data-edit="'+s.id+'" title="Edit"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>'+
          '<button class="icon-btn danger" data-del="'+s.id+'" title="Delete"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>' : '')+
        '</div></td></tr>';
    }).join('') + '</tbody></table>';

  wrap.querySelectorAll('[data-view]').forEach(function(b){ b.addEventListener('click',function(){ viewStudentProfile(b.dataset.view); }); });
  if (isAdmin) {
    wrap.querySelectorAll('[data-edit]').forEach(function(b){ b.addEventListener('click',function(){ openStudentModal(b.dataset.edit); }); });
    wrap.querySelectorAll('[data-del]').forEach(function(b){ b.addEventListener('click',function(){ deleteStudent(b.dataset.del); }); });
  }
}

function populateRoomOptions(sel, selected) {
  sel.innerHTML = settings.rooms.map(function(r){ return '<option value="'+esc(r)+'"'+(r===selected?' selected':'')+'>'+esc(r)+'</option>'; }).join('') || '<option>No rooms set</option>';
}
function populatePeriodOptions(sel, selected) {
  sel.innerHTML = settings.periods.map(function(p){ return '<option value="'+esc(p)+'"'+(p===selected?' selected':'')+'>'+esc(p)+'</option>'; }).join('') || '<option>No periods set</option>';
}

var ROLL_PREFIX = 'KIC00';
function withKicPrefix(roll){
  roll = (roll||'').trim();
  if (!roll) return roll;
  if (/^KIC00/i.test(roll)) return ROLL_PREFIX + roll.slice(ROLL_PREFIX.length);
  // old GIC1001 / KIC12 / plain 7  ->  KIC001001 / KIC0012 / KIC007
  return ROLL_PREFIX + roll.replace(/^(GIC|KIC)/i,'').replace(/^0+/,'');
}

function openStudentModal(id) {
  var isEdit = !!id;
  document.getElementById('studentModalTitle').textContent = isEdit ? 'Edit Student' : 'Add New Student';
  document.getElementById('studentId').value = id || '';
  var s = isEdit ? byId(id) : null;
  document.getElementById('inputName').value = s ? s.name : '';
  document.getElementById('inputRoll').value = s ? withKicPrefix(s.roll||'') : withKicPrefix(String(nextId));
  document.getElementById('inputPassword').value = s ? (s.password||'') : '';
  populateRoomOptions(document.getElementById('inputRoom'),   s ? s.room   : (currentRoom   || settings.rooms[0]));
  populatePeriodOptions(document.getElementById('inputPeriod'), s ? s.period : (currentPeriod || settings.periods[0]));
  document.getElementById('studentModal').classList.remove('hidden');
  document.getElementById('inputName').focus();
}
function closeStudentModal(){ document.getElementById('studentModal').classList.add('hidden'); }

document.getElementById('addStudentBtn').addEventListener('click', function(){ openStudentModal(null); });
document.getElementById('cancelStudentBtn').addEventListener('click', closeStudentModal);
document.getElementById('studentModal').addEventListener('click', function(e){ if(e.target.id==='studentModal') closeStudentModal(); });
document.getElementById('saveStudentBtn').addEventListener('click', function(){
  var id   = document.getElementById('studentId').value;
  var name = document.getElementById('inputName').value.trim();
  if (!name) { showToast('Please enter a name'); return; }
  var roll = withKicPrefix(document.getElementById('inputRoll').value.trim());
  var data = {
    name:     name,
    room:     document.getElementById('inputRoom').value,
    period:   document.getElementById('inputPeriod').value,
    roll:     roll,
    password: document.getElementById('inputPassword').value.trim() || roll
  };
  if (id) {
    var s = byId(id);
    // if the password was still the old default (= old roll no), keep it in step with the new roll no
    if (s.roll && s.roll !== data.roll && s.password === s.roll && !document.getElementById('inputPassword').value.trim()) data.password = data.roll;
    if (s.roll && s.roll !== data.roll && document.getElementById('inputPassword').value.trim() === s.roll) data.password = data.roll;
    s.name=data.name; s.room=data.room; s.period=data.period; s.roll=data.roll; s.password=data.password;
    showToast('Student updated');
  } else {
    students.push({id:String(nextId), name:data.name, room:data.room, period:data.period, roll:data.roll, password:data.password});
    showToast('Student added');
  }
  saveStudents(); closeStudentModal(); renderStudents(); renderDashboard();
});

function deleteStudent(id) {
  var s = byId(id); if (!s) return;
  if (!confirm('Delete ' + s.name + '? This also removes their attendance history.')) return;
  students = students.filter(function(x){ return x.id!==id; });
  Object.keys(attendance).forEach(function(date){ delete attendance[date][id]; });
  saveStudents(); saveAttendance(); renderStudents(); renderDashboard();
  showToast('Student deleted');
}

/* ================================================================
   ATTENDANCE MARKING
================================================================ */
function renderAttendanceView() {
  if (!document.getElementById('attendanceDate').value) document.getElementById('attendanceDate').value = todayKey();
  buildMarkList();
}
function buildMarkList() {
  var date   = document.getElementById('attendanceDate').value || todayKey();
  var wknd   = isWeekend(date);
  var banner = document.getElementById('weekendBanner');
  banner.style.display = wknd ? 'block' : 'none';
  ['markAllPresentBtn','clearMarksBtn','saveAttendanceBtn'].forEach(function(bid){
    var b=document.getElementById(bid); b.disabled=wknd; b.style.opacity=wknd?0.5:1;
  });
  var list = document.getElementById('markList');
  if (wknd) { list.innerHTML='<div class="empty-state"><svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="16" rx="2"/></svg><div>No school — pick Sat–Wed.</div></div>'; return; }

  var scoped = visibleStudents();
  if (markSelectionsDate !== date) {
    var existing = attendance[date] || {};
    markSelections = {};
    scoped.forEach(function(s){ markSelections[s.id] = existing[s.id] ? existing[s.id].status : null; });
    markSelectionsDate = date;
  }
  if (!scoped.length) {
    list.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/></svg><div>No students '+(scopeLabel()?'in '+esc(scopeLabel()):' yet.')+'. Add students first.</div></div>';
    return;
  }
  var sorted = scoped.slice().sort(function(a,b){return a.name.localeCompare(b.name);});
  list.innerHTML = sorted.map(function(s){
    return '<div class="mark-row" data-id="'+s.id+'">'+
      '<div class="mark-info"><strong>'+esc(s.name)+'</strong>'+
      '<span>'+esc(s.period||'—')+' · '+roomPill(s.room)+(s.roll?' · Roll '+esc(s.roll):'')+' </span></div>'+
      '<div class="mark-actions">'+
        '<button class="mark-btn p" data-status="Present">Present</button>'+
        '<button class="mark-btn a" data-status="Absent">Absent</button>'+
        '<button class="mark-btn l" data-status="Leave">On Leave</button>'+
      '</div></div>';
  }).join('');

  list.querySelectorAll('.mark-row').forEach(function(row){
    var id = row.dataset.id;
    refreshBtns(row, markSelections[id]);
    row.querySelectorAll('.mark-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var st = btn.dataset.status;
        markSelections[id] = (markSelections[id]===st) ? null : st;
        refreshBtns(row, markSelections[id]);
      });
    });
  });
}
function refreshBtns(row, status){
  row.querySelectorAll('.mark-btn').forEach(function(b){ b.classList.toggle('active', b.dataset.status===status); });
}

document.getElementById('attendanceDate').addEventListener('change', buildMarkList);
document.getElementById('markAllPresentBtn').addEventListener('click', function(){
  document.querySelectorAll('.mark-row').forEach(function(row){
    markSelections[row.dataset.id]='Present'; refreshBtns(row,'Present');
  });
});
document.getElementById('clearMarksBtn').addEventListener('click', function(){
  document.querySelectorAll('.mark-row').forEach(function(row){
    markSelections[row.dataset.id]=null; refreshBtns(row,null);
  });
});
document.getElementById('saveAttendanceBtn').addEventListener('click', function(){
  var date = document.getElementById('attendanceDate').value || todayKey();
  if (isWeekend(date)) { showToast('No school on this day'); return; }
  var time = nowTime();
  var dayRec = attendance[date] || {};
  var count  = 0;
  Object.keys(markSelections).forEach(function(id){
    var st = markSelections[id];
    if (st) { dayRec[id]={status:st,time:time}; count++; }
    else    { delete dayRec[id]; }
  });
  attendance[date] = dayRec;
  saveAttendance();
  showToast('Attendance saved for ' + count + ' student' + (count===1?'':'s'));
  renderDashboard();
});

/* ================================================================
   REPORTS
================================================================ */
var reportChart = null;
function renderReports() {
  var mi = document.getElementById('reportMonth');
  if (!mi.value) { var d=new Date(); mi.value=d.getFullYear()+'-'+pad(d.getMonth()+1); }
  buildReport();
  mi.onchange = buildReport;
}
function buildReport() {
  var month = document.getElementById('reportMonth').value;
  var parts  = month.split('-');
  var y = parseInt(parts[0],10), m0 = parseInt(parts[1],10)-1;
  var totalDays = schoolDaysInMonth(y, m0);
  var dateKeys  = Object.keys(attendance).filter(function(k){ return k.startsWith(month) && !isWeekend(k); });
  var totalP=0,totalA=0,totalL=0;
  var perStu = {};
  visibleStudents().forEach(function(s){ perStu[s.id]={name:s.name,room:s.room,period:s.period,p:0,a:0,l:0}; });
  dateKeys.forEach(function(date){
    Object.keys(attendance[date]).forEach(function(sid){
      if (!perStu[sid]) return;
      var st = attendance[date][sid].status;
      if(st==='Present'){perStu[sid].p++;totalP++;}
      else if(st==='Absent'){perStu[sid].a++;totalA++;}
      else if(st==='Leave'){perStu[sid].l++;totalL++;}
    });
  });
  var totalMarks = totalP+totalA+totalL;
  var overallPct = totalMarks ? ((totalP/totalMarks)*100).toFixed(1) : '0.0';
  document.getElementById('reportSummary').innerHTML =
    '<div class="detail-box"><b>'+totalDays+'</b><span>School Days</span></div>'+
    '<div class="detail-box"><b style="color:var(--green)">'+totalP+'</b><span>Present</span></div>'+
    '<div class="detail-box"><b style="color:var(--red)">'+totalA+'</b><span>Absent</span></div>'+
    '<div class="detail-box"><b style="color:var(--blue)">'+totalL+'</b><span>On Leave</span></div>'+
    '<div class="detail-box"><b>'+overallPct+'%</b><span>Attendance</span></div>';

  var rows = Object.values ? Object.values(perStu) : Object.keys(perStu).map(function(k){return perStu[k];});
  rows = rows.map(function(r){
    var unmarked = Math.max(0, totalDays-(r.p+r.a+r.l));
    var pct = totalDays ? ((r.p/totalDays)*100).toFixed(1) : '0.0';
    return {name:r.name,room:r.room,period:r.period,p:r.p,a:r.a,l:r.l,unmarked:unmarked,pct:pct};
  });
  var wrap = document.getElementById('reportTableWrap');
  if (!rows.length) {
    wrap.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7"/></svg><div>No data for this period.</div></div>';
  } else {
    wrap.innerHTML = '<table><thead><tr><th>Name</th><th>Room</th><th>Period</th><th>Present</th><th>Absent</th><th>Leave</th><th>Unmarked</th><th>Rate</th></tr></thead><tbody>'+
      rows.map(function(r){ return '<tr><td>'+esc(r.name)+'</td><td>'+roomPill(r.room)+'</td><td>'+esc(r.period||'—')+'</td><td>'+r.p+'</td><td>'+r.a+'</td><td>'+r.l+'</td><td>'+r.unmarked+'</td><td>'+r.pct+'%</td></tr>'; }).join('')+
      '</tbody></table>';
  }
  if (typeof Chart !== 'undefined') {
    var ctx = document.getElementById('reportChart');
    if (reportChart) reportChart.destroy();
    reportChart = new Chart(ctx,{type:'doughnut',data:{labels:['Present','Absent','On Leave'],datasets:[{data:[totalP,totalA,totalL],backgroundColor:['#00a000','#e0392b','#4a3fa0'],borderWidth:0}]},options:{plugins:{legend:{position:'bottom',labels:{boxWidth:12,font:{size:11}}}},cutout:'65%'}});
  }
  window._reportRows = rows;
}
document.getElementById('exportCsvBtn').addEventListener('click', function(){
  var rows = window._reportRows || [];
  if (!rows.length) { showToast('Nothing to export'); return; }
  var csv = 'Name,Room,Period,Present,Absent,Leave,Unmarked,Rate(%)\n';
  rows.forEach(function(r){ csv+='"'+r.name+'","'+r.room+'","'+(r.period||'')+'",'+r.p+','+r.a+','+r.l+','+r.unmarked+','+r.pct+'\n'; });
  var blob=new Blob([csv],{type:'text/csv'});
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='attendance-report-'+document.getElementById('reportMonth').value+'.csv'; a.click();
});

/* ================================================================
   RESULTS (Admin & Teacher) — enter/manage monthly exam results
================================================================ */
function renderResults(){
  var mi = document.getElementById('resultsMonth');
  if (!mi.value) mi.value = currentMonthKey();
  var et = document.getElementById('resultsExamType');
  if (!mi._wired) {
    mi.addEventListener('change', buildResultsList);
    et.addEventListener('change', buildResultsList);
    mi._wired = true;
  }
  buildResultsList();
}

function buildResultsList(){
  var monthKey = document.getElementById('resultsMonth').value || currentMonthKey();
  var examType = document.getElementById('resultsExamType').value || 'monthly';
  var monthResults = results[monthKey] || {};
  var list = visibleStudents().slice().sort(function(a,b){ return a.name.localeCompare(b.name); });
  var wrap = document.getElementById('resultsListWrap');
  if (!list.length) { wrap.innerHTML = '<div class="empty-state">No students in this scope.</div>'; return; }
  wrap.innerHTML = '<table><thead><tr><th>Name</th><th>Room</th><th>Exam</th><th>Score</th><th>Grade</th><th>Actions</th></tr></thead><tbody>' +
    list.map(function(s){
      var studentEntries = monthResults[s.id] || {};
      var entry = studentEntries[examType];
      var totals = computeResultTotals(entry);
      return '<tr>'+
        '<td>'+esc(s.name)+'</td>'+
        '<td>'+roomPill(s.room)+'</td>'+
        '<td>'+(entry&&entry.examName?esc(entry.examName):'<span class="note" style="display:inline;padding:2px 8px;">Not entered</span>')+'</td>'+
        '<td>'+(totals?totals.totalMarks+'/'+totals.totalMax+' ('+totals.pct.toFixed(1)+'%)':'—')+'</td>'+
        '<td>'+(totals?'<span class="grade-badge" style="background:'+gradeColor(totals.grade)+';">'+totals.grade+'</span>':'—')+'</td>'+
        '<td><div style="display:flex;gap:6px;">'+
          '<button type="button" class="btn btn-ghost btn-sm" data-enter-result="'+s.id+'">'+(entry?'Edit':'Add')+'</button>'+
          (entry?'<button type="button" class="btn btn-ghost btn-sm" style="color:var(--red);" data-delete-result="'+s.id+'">Delete</button>':'')+
        '</div></td>'+
      '</tr>';
    }).join('') + '</tbody></table>';
  wrap.querySelectorAll('[data-enter-result]').forEach(function(b){
    b.addEventListener('click', function(){ openResultModal(b.dataset.enterResult, monthKey, examType); });
  });
  wrap.querySelectorAll('[data-delete-result]').forEach(function(b){
    b.addEventListener('click', function(){ deleteResultEntry(b.dataset.deleteResult, monthKey, examType); });
  });
}

function addSubjectRow(name, marks, max){
  var wrap = document.getElementById('resultSubjectsList');
  var row = document.createElement('div');
  row.className = 'subject-row';
  row.innerHTML =
    '<input type="text" class="subj-name" placeholder="Subject (e.g. Math)" value="'+esc(name||'')+'">'+
    '<input type="number" class="subj-marks" placeholder="Marks" min="0" value="'+(marks!=null&&marks!==''?marks:'')+'">'+
    '<input type="number" class="subj-max" placeholder="Max" min="1" value="'+(max!=null&&max!==''?max:100)+'">'+
    '<button type="button" class="subj-remove" title="Remove subject">&times;</button>';
  row.querySelector('.subj-remove').addEventListener('click', function(){ row.remove(); });
  wrap.appendChild(row);
}
document.getElementById('addSubjectRowBtn').addEventListener('click', function(){ addSubjectRow(); });

var EXAM_NAME_TO_TYPE = {};
Object.keys(EXAM_TYPES).forEach(function(k){ EXAM_NAME_TO_TYPE[EXAM_TYPES[k]] = k; });

function populateResultForm(studentId, monthKey, examType){
  var s = byId(studentId);
  document.getElementById('resultModalTitle').textContent = 'Results — ' + (s ? s.name : '') + ' · ' + EXAM_TYPES[examType] + ' · ' + formatMonthLabel(monthKey);
  var entry = results[monthKey] && results[monthKey][studentId] && results[monthKey][studentId][examType];
  document.getElementById('resultExamName').value = EXAM_TYPES[examType];
  document.getElementById('resultRemarks').value = entry ? (entry.remarks||'') : '';
  var subjWrap = document.getElementById('resultSubjectsList');
  subjWrap.innerHTML = '';
  if (entry && entry.subjects && entry.subjects.length) {
    entry.subjects.forEach(function(sub){ addSubjectRow(sub.name, sub.marks, sub.max); });
  } else {
    addSubjectRow();
  }
}

function openResultModal(studentId, monthKey, examType){
  var s = byId(studentId);
  if (!s) return;
  document.getElementById('resultStudentId').value = studentId;
  document.getElementById('resultMonthKey').value = monthKey;
  document.getElementById('resultExamType').value = examType;
  populateResultForm(studentId, monthKey, examType);
  document.getElementById('resultModal').classList.remove('hidden');
}
function closeResultModal(){ document.getElementById('resultModal').classList.add('hidden'); }
document.getElementById('cancelResultBtn').addEventListener('click', closeResultModal);
document.getElementById('resultExamName').addEventListener('change', function(){
  var newType = EXAM_NAME_TO_TYPE[this.value] || 'monthly';
  var studentId = document.getElementById('resultStudentId').value;
  var monthKey  = document.getElementById('resultMonthKey').value;
  document.getElementById('resultExamType').value = newType;
  populateResultForm(studentId, monthKey, newType);
});

document.getElementById('saveResultBtn').addEventListener('click', function(){
  var studentId = document.getElementById('resultStudentId').value;
  var monthKey  = document.getElementById('resultMonthKey').value;
  var examType  = document.getElementById('resultExamType').value || 'monthly';
  var examName  = document.getElementById('resultExamName').value.trim();
  var remarks   = document.getElementById('resultRemarks').value.trim();
  var rows = document.querySelectorAll('#resultSubjectsList .subject-row');
  var subjects = [];
  rows.forEach(function(row){
    var name  = row.querySelector('.subj-name').value.trim();
    var marks = parseFloat(row.querySelector('.subj-marks').value);
    var max   = parseFloat(row.querySelector('.subj-max').value);
    if (!name || isNaN(marks) || isNaN(max) || max <= 0) return;
    subjects.push({name:name, marks:marks, max:max});
  });
  if (!subjects.length) { showToast('Add at least one complete subject (name, marks, and max)'); return; }
  if (!results[monthKey]) results[monthKey] = {};
  if (!results[monthKey][studentId]) results[monthKey][studentId] = {};
  results[monthKey][studentId][examType] = {examName:examName, subjects:subjects, remarks:remarks};
  saveResults();
  closeResultModal();
  buildResultsList();
  showToast(EXAM_TYPES[examType] + ' results saved');
});

function deleteResultEntry(studentId, monthKey, examType){
  if (!confirm('Delete this '+EXAM_TYPES[examType]+' entry? This cannot be undone.')) return;
  if (results[monthKey] && results[monthKey][studentId]) delete results[monthKey][studentId][examType];
  saveResults();
  buildResultsList();
  showToast('Result deleted');
}

/* ================================================================
   MY RESULTS (Student) — view own results + attendance for a month
================================================================ */
function renderMyResults(){
  var mi = document.getElementById('myResultsMonth');
  if (!mi.value) mi.value = currentMonthKey();
  var et = document.getElementById('myResultsExamType');
  if (!mi._wired) {
    mi.addEventListener('change', buildMyResults);
    et.addEventListener('change', buildMyResults);
    mi._wired = true;
  }
  buildMyResults();
}

function buildMyResults(){
  var s = byId(currentUser.studentId);
  var body = document.getElementById('myResultsBody');
  if (!s) { body.innerHTML = '<div class="empty-state">Your student record could not be found. Contact your teacher or admin.</div>'; return; }

  var examType  = document.getElementById('myResultsExamType').value || 'monthly';
  var monthWrap = document.getElementById('myResultsMonthWrap');

  var monthKey, entry;
  if (examType === 'monthly') {
    /* Monthly exams are tied to a specific month the person picks */
    monthWrap.style.display = '';
    monthKey = document.getElementById('myResultsMonth').value || currentMonthKey();
    entry = results[monthKey] && results[monthKey][s.id] && results[monthKey][s.id][examType];
  } else {
    /* Book End / Final exams aren't month-bound — find the most recent
       one on record for this student without making them pick a month */
    monthWrap.style.display = 'none';
    var matchingMonths = Object.keys(results).filter(function(mk){
      return results[mk] && results[mk][s.id] && results[mk][s.id][examType];
    }).sort();
    monthKey = matchingMonths.length ? matchingMonths[matchingMonths.length - 1] : null;
    entry = monthKey ? results[monthKey][s.id][examType] : null;
  }

  var totals = computeResultTotals(entry);
  var att    = monthKey ? monthlyAttendancePct(s.id, monthKey) : null;

  var roomEntries = (monthKey && results[monthKey]) ? Object.keys(results[monthKey]).map(function(id){
    var stu = byId(id);
    if (!stu || stu.room !== s.room) return null;
    return computeResultTotals(results[monthKey][id][examType]);
  }).filter(Boolean) : [];
  var roomAvg = roomEntries.length ? (roomEntries.reduce(function(sum,t){return sum+t.pct;},0)/roomEntries.length) : null;

  var titleSuffix = monthKey ? ' · '+formatMonthLabel(monthKey) : '';
  var html = '<div class="card">'+
    '<div class="card-head"><h3>'+esc(s.name)+' · '+EXAM_TYPES[examType]+titleSuffix+'</h3></div>'+
    '<div class="detail-grid">'+
      '<div class="detail-box"><b>'+(att?att.pct.toFixed(1)+'%':'—')+'</b><span>Attendance This Month</span></div>'+
      '<div class="detail-box"><b>'+(totals?totals.pct.toFixed(1)+'%':'—')+'</b><span>Exam Score</span></div>'+
      '<div class="detail-box"><b style="'+(totals?'color:'+gradeColor(totals.grade):'')+'">'+(totals?totals.grade:'—')+'</b><span>Grade</span></div>'+
      '<div class="detail-box"><b style="'+(totals?(totals.pass?'color:var(--green)':'color:var(--red)'):'')+'">'+(totals?(totals.pass?'Pass':'Fail'):'—')+'</b><span>Status</span></div>'+
    '</div>'+
  '</div>';

  if (entry && totals) {
    html += '<div class="card">'+
      '<div class="card-head"><h3>'+esc(entry.examName||EXAM_TYPES[examType])+'</h3></div>'+
      '<div class="table-wrap"><table><thead><tr><th>Subject</th><th>Marks</th><th>Max</th><th>%</th></tr></thead><tbody>'+
        entry.subjects.map(function(sub){
          var p = sub.max ? (sub.marks/sub.max*100) : 0;
          return '<tr><td>'+esc(sub.name)+'</td><td>'+sub.marks+'</td><td>'+sub.max+'</td><td>'+p.toFixed(1)+'%</td></tr>';
        }).join('')+
        '<tr style="font-weight:800;"><td>Total</td><td>'+totals.totalMarks+'</td><td>'+totals.totalMax+'</td><td>'+totals.pct.toFixed(1)+'%</td></tr>'+
      '</tbody></table></div>'+
      (roomAvg!=null ? '<p class="note" style="margin-top:14px;">Room average this month: <b>'+roomAvg.toFixed(1)+'%</b> — you scored '+(totals.pct>=roomAvg?'<b style="color:var(--green)">'+(totals.pct-roomAvg).toFixed(1)+'% above</b>':'<b style="color:var(--red)">'+(roomAvg-totals.pct).toFixed(1)+'% below</b>')+' the room average.</p>' : '')+
      (entry.remarks ? '<p class="note" style="margin-top:10px;"><b>Remarks:</b> '+esc(entry.remarks)+'</p>' : '')+
    '</div>';
  } else {
    var emptyMsg = examType === 'monthly'
      ? 'No results published for '+formatMonthLabel(monthKey)+' yet.'
      : 'No '+EXAM_TYPES[examType]+' results published yet.';
    html += '<div class="card"><div class="empty-state">'+emptyMsg+'</div></div>';
  }

  body.innerHTML = html;
}

/* ================================================================
   FINANCE (Admin) — record payments, generate/view/print invoices
================================================================ */
function schoolLogoSrc(){
  var img = document.querySelector('.login-logo-badge img, .brand-badge img');
  return img ? img.src : '';
}

function renderFinance(){
  var mi = document.getElementById('financeMonth');
  if (!mi.value) mi.value = currentMonthKey();
  if (!mi._wired) {
    mi.addEventListener('change', buildFinanceList);
    mi._wired = true;
  }
  buildFinanceList();
}

function buildFinanceList(){
  var monthKey = document.getElementById('financeMonth').value || currentMonthKey();
  var room = currentRoom;
  var list = invoices.filter(function(inv){
    if (inv.month !== monthKey) return false;
    if (room && inv.room !== room) return false;
    return true;
  }).sort(function(a,b){ return (b.createdAt||0) - (a.createdAt||0); });
  var wrap = document.getElementById('financeListWrap');
  if (!list.length) { wrap.innerHTML = '<div class="empty-state">No payments recorded for '+formatMonthLabel(monthKey)+' yet.</div>'; return; }
  wrap.innerHTML = '<table><thead><tr><th>Receipt</th><th>Student</th><th>Room</th><th>Amount</th><th>Date Paid</th><th>Actions</th></tr></thead><tbody>' +
    list.map(function(inv){
      return '<tr>'+
        '<td>#'+esc(inv.receiptNo)+'</td>'+
        '<td>'+esc(inv.studentName)+'</td>'+
        '<td>'+roomPill(inv.room)+'</td>'+
        '<td>'+esc(inv.currency||'')+esc(String(inv.amount))+'</td>'+
        '<td>'+esc(inv.date)+'</td>'+
        '<td><div style="display:flex;gap:6px;">'+
          '<button type="button" class="btn btn-ghost btn-sm" data-view-invoice="'+inv.id+'">View</button>'+
          '<button type="button" class="btn btn-ghost btn-sm" style="color:var(--red);" data-delete-invoice="'+inv.id+'">Delete</button>'+
        '</div></td>'+
      '</tr>';
    }).join('') + '</tbody></table>';
  wrap.querySelectorAll('[data-view-invoice]').forEach(function(b){
    b.addEventListener('click', function(){ viewInvoice(b.dataset.viewInvoice); });
  });
  wrap.querySelectorAll('[data-delete-invoice]').forEach(function(b){
    b.addEventListener('click', function(){ deleteInvoice(b.dataset.deleteInvoice); });
  });
}

/* ================================================================
   FEE STATUS (Admin & Finance) — who has paid / not paid for a month
================================================================ */
function renderFeeStatus(){
  var mi = document.getElementById('feeStatusMonth');
  if (!mi.value) mi.value = currentMonthKey();
  if (!mi._wired) {
    mi.addEventListener('change', buildFeeStatusList);
    document.getElementById('feeStatusFilter').addEventListener('change', buildFeeStatusList);
    document.getElementById('feeStatusPeriod').addEventListener('change', buildFeeStatusList);
    mi._wired = true;
  }
  /* Period dropdown (a room can have several periods, e.g. English has 6) */
  var ps = document.getElementById('feeStatusPeriod');
  var keep = ps.value;
  ps.innerHTML = '<option value="">All Periods</option>' +
    settings.periods.map(function(p){ return '<option value="'+esc(p)+'">'+esc(p)+'</option>'; }).join('');
  ps.value = settings.periods.indexOf(keep) !== -1 ? keep : '';
  buildFeeStatusList();
}

function buildFeeStatusList(){
  var monthKey = document.getElementById('feeStatusMonth').value || currentMonthKey();
  var status = document.getElementById('feeStatusFilter').value;
  var room = currentRoom;
  var period = document.getElementById('feeStatusPeriod').value;
  var pool = students.filter(function(s){ return (!room || s.room === room) && (!period || s.period === period); });
  var rows = pool.map(function(s){
    var inv = null;
    invoices.forEach(function(i){
      if (i.studentId === s.id && i.month === monthKey && (!inv || (i.createdAt||0) > (inv.createdAt||0))) inv = i;
    });
    return { s: s, inv: inv };
  });
  var paidCount = rows.filter(function(r){ return r.inv; }).length;
  document.getElementById('feePaidCount').textContent = paidCount;
  document.getElementById('feeUnpaidCount').textContent = rows.length - paidCount;
  rows = rows.filter(function(r){
    if (status === 'paid') return !!r.inv;
    if (status === 'unpaid') return !r.inv;
    return true;
  }).sort(function(a,b){ return (a.s.name||'').localeCompare(b.s.name||''); });
  var wrap = document.getElementById('feeStatusWrap');
  if (!rows.length) { wrap.innerHTML = '<div class="empty-state">No students to show for '+formatMonthLabel(monthKey)+'.</div>'; return; }
  wrap.innerHTML = '<table><thead><tr><th>Student</th><th>Roll No</th><th>Room</th><th>Period</th><th>Status</th><th>Amount</th><th>Date Paid</th></tr></thead><tbody>' +
    rows.map(function(r){
      var s = r.s, inv = r.inv;
      return '<tr>'+
        '<td>'+esc(s.name)+'</td>'+
        '<td>'+esc(s.roll||'')+'</td>'+
        '<td>'+roomPill(s.room)+'</td>'+
        '<td>'+esc(s.period||'—')+'</td>'+
        '<td>'+(inv ? '<span class="pill pill-present">Paid</span>' : '<span class="pill pill-absent">Not Paid</span>')+'</td>'+
        '<td>'+(inv ? esc(inv.currency||'')+esc(String(inv.amount)) : '—')+'</td>'+
        '<td>'+(inv ? esc(inv.date) : '—')+'</td>'+
      '</tr>';
    }).join('') + '</tbody></table>';
}

var invoiceStudentPool = [];

function studentAlreadyPaid(studentId, month){
  return invoices.some(function(i){ return i.studentId === studentId && i.month === month; });
}

function renderInvoiceStudentList(filterText){
  var list = document.getElementById('invoiceStudentList');
  var month = document.getElementById('invoiceMonth').value;
  var q = (filterText||'').trim().toLowerCase();
  var matches = invoiceStudentPool.filter(function(s){
    if (!q) return true;
    return (s.name||'').toLowerCase().indexOf(q) !== -1 || (s.room||'').toLowerCase().indexOf(q) !== -1 || (s.roll||'').toLowerCase().indexOf(q) !== -1;
  });
  if (!matches.length) {
    list.innerHTML = '<div class="combo-empty">No students match “'+esc(filterText||'')+'”.</div>';
    return;
  }
  list.innerHTML = matches.map(function(s){
    var paid = studentAlreadyPaid(s.id, month);
    return '<div class="combo-item'+(paid?' paid':'')+'" data-student="'+s.id+'" data-name="'+esc(s.name)+'">'+
      '<span><span class="combo-item-name">'+esc(s.name)+'</span> <span class="combo-item-room">— '+esc(s.room)+'</span></span>'+
      (paid ? '<span class="combo-badge">Already Paid</span>' : '') +
    '</div>';
  }).join('');
  list.querySelectorAll('.combo-item').forEach(function(row){
    row.addEventListener('mousedown', function(e){
      e.preventDefault();
      if (row.classList.contains('paid')) { showToast('This student already has a payment recorded for '+formatMonthLabel(month)+'.'); return; }
      document.getElementById('invoiceStudentId').value = row.dataset.student;
      document.getElementById('invoiceStudentSearch').value = row.dataset.name;
      list.classList.remove('open');
    });
  });
}

document.getElementById('addInvoiceBtn').addEventListener('click', function(){
  invoiceStudentPool = visibleStudents().slice().sort(function(a,b){ return a.name.localeCompare(b.name); });
  if (!invoiceStudentPool.length) { showToast('No students in this scope to bill'); return; }
  document.getElementById('invoiceStudentId').value = '';
  document.getElementById('invoiceStudentSearch').value = '';
  document.getElementById('invoiceMonth').value = document.getElementById('financeMonth').value || currentMonthKey();
  var d = new Date();
  document.getElementById('invoiceDate').value = d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  document.getElementById('invoiceAmount').value = '';
  document.getElementById('invoiceCurrency').value = '$';
  document.getElementById('invoiceNote').value = 'Please pay the school fee within five days.';
  renderInvoiceStudentList('');
  document.getElementById('invoiceModal').classList.remove('hidden');
});

var invoiceSearchInput = document.getElementById('invoiceStudentSearch');
invoiceSearchInput.addEventListener('input', function(){
  document.getElementById('invoiceStudentId').value = '';
  document.getElementById('invoiceStudentList').classList.add('open');
  renderInvoiceStudentList(invoiceSearchInput.value);
});
invoiceSearchInput.addEventListener('focus', function(){
  document.getElementById('invoiceStudentList').classList.add('open');
  renderInvoiceStudentList(invoiceSearchInput.value);
});
invoiceSearchInput.addEventListener('blur', function(){
  setTimeout(function(){ document.getElementById('invoiceStudentList').classList.remove('open'); }, 120);
});
document.getElementById('invoiceMonth').addEventListener('change', function(){
  renderInvoiceStudentList(invoiceSearchInput.value);
});

document.getElementById('cancelInvoiceBtn').addEventListener('click', function(){
  document.getElementById('invoiceModal').classList.add('hidden');
});

document.getElementById('saveInvoiceBtn').addEventListener('click', function(){
  var studentId = document.getElementById('invoiceStudentId').value;
  var s = byId(studentId);
  if (!s) { showToast('Search and select a student from the list'); return; }
  var month  = document.getElementById('invoiceMonth').value;
  var date   = document.getElementById('invoiceDate').value;
  var amount = parseFloat(document.getElementById('invoiceAmount').value);
  var currency = document.getElementById('invoiceCurrency').value.trim() || '$';
  var note   = document.getElementById('invoiceNote').value.trim();
  if (!month) { showToast('Select the month covered'); return; }
  if (!date) { showToast('Select the date paid'); return; }
  if (isNaN(amount) || amount <= 0) { showToast('Enter a valid amount'); return; }
  if (studentAlreadyPaid(studentId, month)) { showToast(s.name+' already has a payment recorded for '+formatMonthLabel(month)+'.'); return; }
  var inv = {
    id: 'inv'+Date.now(),
    receiptNo: nextInvoiceNo++,
    studentId: studentId,
    studentName: s.name,
    room: s.room,
    period: s.period,
    roll: s.roll,
    month: month,
    date: date,
    amount: amount,
    currency: currency,
    note: note,
    createdAt: Date.now()
  };
  invoices.push(inv);
  saveInvoices();
  document.getElementById('invoiceModal').classList.add('hidden');
  buildFinanceList();
  showToast('Invoice #'+inv.receiptNo+' saved');
  viewInvoice(inv.id);
});

function deleteInvoice(id){
  if (!confirm('Delete this invoice? This cannot be undone.')) return;
  invoices = invoices.filter(function(i){ return i.id !== id; });
  saveInvoices();
  buildFinanceList();
  showToast('Invoice deleted');
}

function buildInvoiceHTML(inv){
  var logo = schoolLogoSrc();
  return '<div class="invoice-paper">'+
    '<div class="invoice-head">'+
      (logo?'<img src="'+logo+'" alt="School logo">':'')+
      '<div><div class="school-name">'+esc(settings.orgName)+'</div>'+
        '<div class="school-sub">'+(settings.schoolPhone?'Tel: '+esc(settings.schoolPhone)+'<br>':'')+'Baidoa-Somalia</div></div>'+
    '</div>'+
    '<div class="invoice-title">Fee Payment Receipt</div>'+
    '<div class="invoice-meta">'+
      '<div><span>Receipt ID</span>#'+esc(inv.receiptNo)+'</div>'+
      '<div><span>Date Paid</span>'+esc(inv.date)+'</div>'+
      '<div><span>Student Name</span>'+esc(inv.studentName)+'</div>'+
      '<div><span>Roll No.</span>'+esc(inv.roll||'—')+'</div>'+
      '<div><span>Class / Room</span>'+esc(inv.room)+'</div>'+
      '<div><span>Period</span>'+esc(inv.period||'—')+'</div>'+
      '<div><span>Month Covered</span>'+formatMonthLabel(inv.month)+'</div>'+
      '<div><span>Currency</span>'+esc(inv.currency||'$')+'</div>'+
    '</div>'+
    '<div class="invoice-amount">Amount Paid<br><b>'+esc(inv.currency||'$')+esc(String(inv.amount))+'</b></div>'+
    (inv.note?'<div class="invoice-note">'+esc(inv.note)+'</div>':'')+
    '<div class="invoice-footer">'+
      '<div class="sig">_____________________<br>Received By</div>'+
      (logo?'<img class="invoice-stamp" src="'+logo+'" alt="School stamp">':'')+
    '</div>'+
  '</div>';
}

function viewInvoice(id){
  var inv = invoices.find(function(i){ return i.id === id; });
  if (!inv) { showToast('Invoice not found'); return; }
  currentViewedInvoice = inv;
  document.getElementById('invoicePrintArea').innerHTML = buildInvoiceHTML(inv);
  var isStudentView = currentUser && currentUser.role === 'student';
  document.getElementById('downloadInvoiceLabel').textContent = isStudentView ? 'Download' : 'Print';
  document.getElementById('downloadInvoiceIcon').innerHTML = isStudentView
    ? '<path d="M12 3v13M7 11l5 5 5-5"/><path d="M5 21h14"/>'
    : '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>';
  document.getElementById('invoiceViewModal').classList.remove('hidden');
}
document.getElementById('closeInvoiceViewBtn').addEventListener('click', function(){
  document.getElementById('invoiceViewModal').classList.add('hidden');
});
document.getElementById('downloadInvoiceBtn').addEventListener('click', function(){
  var isStudentView = currentUser && currentUser.role === 'student';
  var sourceHTML = document.getElementById('invoicePrintArea').innerHTML;

  if (!isStudentView) {
    /* Admin / Finance / Teacher: clean single-page print. Margin only —
       no forced page size, so it correctly fits whatever paper size
       (A4, A5, Letter...) the person picks in their own print dialog. */
    setPrintMargin('10mm');
    var root = document.getElementById('invoicePrintRoot');
    root.innerHTML = sourceHTML;
    forceDesktopInvoiceLayout(root.querySelector('.invoice-paper'));
    window.print();
    return;
  }

  /* Student: generate and auto-download a real A5 PDF, no print dialog */
  var btn = document.getElementById('downloadInvoiceBtn');
  var label = document.getElementById('downloadInvoiceLabel');
  var originalLabel = label.textContent;
  label.textContent = 'Preparing…';
  btn.disabled = true;

  var root = document.getElementById('invoicePrintRoot');
  root.innerHTML = sourceHTML;
  root.style.cssText = 'display:block;position:fixed;left:-9999px;top:0;width:560px;background:#fff;';
  var node = root.querySelector('.invoice-paper');
  forceDesktopInvoiceLayout(node);

  var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  fontsReady.then(function(){
    return html2canvas(node, {scale:3, useCORS:true, backgroundColor:'#ffffff'});
  }).then(function(canvas){
    var pdf = new window.jspdf.jsPDF({orientation:'portrait', unit:'mm', format:'a5'});
    var pageW = pdf.internal.pageSize.getWidth();
    var pageH = pdf.internal.pageSize.getHeight();
    var margin = 6;
    var usableW = pageW - margin*2;
    var usableH = pageH - margin*2;
    var ratio = Math.min(usableW / canvas.width, usableH / canvas.height);
    var drawW = canvas.width * ratio;
    var drawH = canvas.height * ratio;
    var offsetX = margin + (usableW - drawW) / 2;
    var offsetY = margin + (usableH - drawH) / 2;
    var imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', offsetX, offsetY, drawW, drawH);
    var fname = currentViewedInvoice ? ('Receipt-'+currentViewedInvoice.receiptNo+'-'+currentViewedInvoice.studentName.replace(/[^a-z0-9]+/gi,'-')+'.pdf') : 'Receipt.pdf';
    pdf.save(fname);
  }).catch(function(){
    showToast('Could not generate the PDF. Please try again.');
  }).finally(function(){
    root.style.cssText = 'display:none;';
    root.innerHTML = '';
    label.textContent = originalLabel;
    btn.disabled = false;
  });
});

function setPrintMargin(margin){
  var tag = document.getElementById('printPageSizeStyle');
  if (!tag) {
    tag = document.createElement('style');
    tag.id = 'printPageSizeStyle';
    document.head.appendChild(tag);
  }
  tag.textContent = '@media print{@page{margin:'+margin+';}}';
}

/* The mobile @media(max-width:480px) rule collapses the invoice to one
   column based on the *viewport* width, not the offscreen container's
   width — so on a phone it collapses even when we size the container
   wider. Force the full two-column desktop layout with inline styles
   so print/download always looks the same regardless of the device. */
function forceDesktopInvoiceLayout(node){
  if (!node) return;
  node.style.padding = '32px';
  var meta = node.querySelector('.invoice-meta');
  if (meta) meta.style.gridTemplateColumns = '1fr 1fr';
  var headImg = node.querySelector('.invoice-head img');
  if (headImg) { headImg.style.width = '64px'; headImg.style.height = '64px'; }
  var schoolName = node.querySelector('.invoice-head .school-name');
  if (schoolName) schoolName.style.fontSize = '19px';
}

/* ================================================================
   FINANCE DASHBOARD (Finance portal) — income, expenses, profit
================================================================ */
function renderFinanceDashboard(){
  var mi = document.getElementById('finDashMonth');
  if (!mi.value) mi.value = currentMonthKey();
  if (!mi._wired) {
    mi.addEventListener('change', buildFinanceDashboard);
    mi._wired = true;
  }
  var di = document.getElementById('expenseDate');
  if (!di.value) di.value = todayKey();
  buildFinanceDashboard();
}

function buildFinanceDashboard(){
  var monthKey = document.getElementById('finDashMonth').value || currentMonthKey();

  var monthInvoices = invoices.filter(function(i){ return i.month === monthKey; });
  var totalIncome = monthInvoices.reduce(function(sum,i){ return sum + (Number(i.amount)||0); }, 0);
  var currency = (monthInvoices[0] && monthInvoices[0].currency) || '$';

  var monthExpenses = expenses.filter(function(e){ return (e.date||'').slice(0,7) === monthKey; });
  var totalExpenses = monthExpenses.reduce(function(sum,e){ return sum + (Number(e.amount)||0); }, 0);

  var profit = totalIncome - totalExpenses;

  document.getElementById('finStatIncome').textContent = currency + totalIncome.toFixed(2);
  document.getElementById('finStatIncomeSub').textContent = monthInvoices.length + ' payment' + (monthInvoices.length===1?'':'s') + ' · ' + formatMonthLabel(monthKey);
  document.getElementById('finStatExpenses').textContent = currency + totalExpenses.toFixed(2);
  document.getElementById('finStatExpensesSub').textContent = monthExpenses.length + ' item' + (monthExpenses.length===1?'':'s') + ' recorded';
  var profitEl = document.getElementById('finStatProfit');
  profitEl.textContent = (profit<0?'-':'') + currency + Math.abs(profit).toFixed(2);
  profitEl.style.color = profit < 0 ? 'var(--red)' : 'var(--green)';
  document.getElementById('finStatCount').textContent = monthInvoices.length;

  var wrap = document.getElementById('expenseListWrap');
  if (!monthExpenses.length) { wrap.innerHTML = '<div class="empty-state">No expenses recorded for '+formatMonthLabel(monthKey)+' yet.</div>'; return; }
  var sorted = monthExpenses.slice().sort(function(a,b){ return (b.createdAt||0) - (a.createdAt||0); });
  wrap.innerHTML = '<table><thead><tr><th>Date</th><th>Category</th><th>Note</th><th>Amount</th><th></th></tr></thead><tbody>' +
    sorted.map(function(e){
      return '<tr>'+
        '<td>'+esc(e.date)+'</td>'+
        '<td>'+esc(e.category)+'</td>'+
        '<td>'+esc(e.note||'—')+'</td>'+
        '<td>'+esc(e.currency||'$')+esc(String(e.amount))+'</td>'+
        '<td><button type="button" class="btn btn-ghost btn-sm" style="color:var(--red);" data-delete-expense="'+e.id+'">Delete</button></td>'+
      '</tr>';
    }).join('') + '</tbody></table>';
  wrap.querySelectorAll('[data-delete-expense]').forEach(function(b){
    b.addEventListener('click', function(){ deleteExpense(b.dataset.deleteExpense); });
  });
}

document.getElementById('addExpenseBtn').addEventListener('click', function(){
  var date = document.getElementById('expenseDate').value;
  var category = document.getElementById('expenseCategory').value.trim();
  var amount = parseFloat(document.getElementById('expenseAmount').value);
  var note = document.getElementById('expenseNote').value.trim();
  if (!date) { showToast('Select a date'); return; }
  if (!category) { showToast('Enter a category'); return; }
  if (isNaN(amount) || amount <= 0) { showToast('Enter a valid amount'); return; }
  expenses.push({id:'exp'+Date.now(), date:date, category:category, amount:amount, currency:'$', note:note, createdAt:Date.now()});
  saveExpenses();
  document.getElementById('expenseCategory').value = '';
  document.getElementById('expenseAmount').value = '';
  document.getElementById('expenseNote').value = '';
  buildFinanceDashboard();
  showToast('Expense recorded');
});

function deleteExpense(id){
  if (!confirm('Delete this expense? This cannot be undone.')) return;
  expenses = expenses.filter(function(e){ return e.id !== id; });
  saveExpenses();
  buildFinanceDashboard();
  showToast('Expense deleted');
}

/* ================================================================
   MY INVOICES (Student) — view/download own fee receipts
================================================================ */
function renderMyInvoices(){
  var s = byId(currentUser.studentId);
  var wrap = document.getElementById('myInvoicesList');
  if (!s) { wrap.innerHTML = '<div class="empty-state">Your student record could not be found.</div>'; return; }
  var list = invoices.filter(function(i){ return i.studentId === s.id; })
    .sort(function(a,b){ return (b.createdAt||0) - (a.createdAt||0); });
  if (!list.length) { wrap.innerHTML = '<div class="card"><div class="empty-state">No invoices yet. Your payments will appear here once recorded by the school.</div></div>'; return; }
  wrap.innerHTML = '<div class="card"><div class="table-wrap"><table><thead><tr><th>Receipt</th><th>Month</th><th>Amount</th><th>Date Paid</th><th></th></tr></thead><tbody>'+
    list.map(function(inv){
      return '<tr>'+
        '<td>#'+esc(inv.receiptNo)+'</td>'+
        '<td>'+formatMonthLabel(inv.month)+'</td>'+
        '<td>'+esc(inv.currency||'')+esc(String(inv.amount))+'</td>'+
        '<td>'+esc(inv.date)+'</td>'+
        '<td><button type="button" class="btn btn-ghost btn-sm" data-view-invoice="'+inv.id+'">View / Download</button></td>'+
      '</tr>';
    }).join('') + '</tbody></table></div></div>';
  wrap.querySelectorAll('[data-view-invoice]').forEach(function(b){
    b.addEventListener('click', function(){ viewInvoice(b.dataset.viewInvoice); });
  });
}

/* ================================================================
   VIEW STUDENT / PROFILE
================================================================ */
var profileId = null, profileMonth = '';

function viewStudentProfile(id){ switchView('search'); showStudentDetail(id); }

function renderSearch(){
  document.getElementById('searchInput').value='';
  document.getElementById('searchDetailCard').style.display='none';
  profileId=null;
  buildSearchList('');
}
document.getElementById('searchInput').addEventListener('input', function(e){ buildSearchList(e.target.value); });

function buildSearchList(q){
  q = q.trim().toLowerCase();
  var filtered = visibleStudents().filter(function(s){
    return !q || s.name.toLowerCase().includes(q) || (s.roll||'').toLowerCase().includes(q) || (s.period||'').toLowerCase().includes(q);
  });
  var list = document.getElementById('searchList');
  if (!filtered.length) { list.innerHTML='<div class="empty-state" style="grid-column:1/-1;"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/></svg><div>No students found.</div></div>'; return; }
  var sorted = filtered.slice().sort(function(a,b){return a.name.localeCompare(b.name);});
  list.innerHTML = sorted.map(function(s){
    return '<div class="search-card'+(s.id===profileId?' selected':'')+'" data-id="'+s.id+'">'+
      '<strong>'+esc(s.name)+'</strong><span>'+roomPill(s.room)+' · '+esc(s.period||'—')+(s.roll?' · Roll '+esc(s.roll):'')+' </span></div>';
  }).join('');
  list.querySelectorAll('.search-card').forEach(function(card){
    card.addEventListener('click', function(){
      if (card.classList.contains('selected')) {
        card.classList.remove('selected');
        profileId = null;
        var dc = document.getElementById('searchDetailCard');
        dc.style.display = 'none';
        dc.innerHTML = '';
        return;
      }
      list.querySelectorAll('.search-card').forEach(function(c){c.classList.remove('selected');});
      card.classList.add('selected');
      showStudentDetail(card.dataset.id);
    });
  });
}

function showStudentDetail(id){
  profileId=id; profileMonth=''; renderProfileCard();
  var card = document.getElementById('searchDetailCard');
  if (card && card.style.display !== 'none') {
    requestAnimationFrame(function(){
      var r = card.getBoundingClientRect();
      var alreadyVisible = r.top >= 0 && r.top < (window.innerHeight * 0.5);
      if (!alreadyVisible) card.scrollIntoView({behavior:'smooth', block:'start'});
      card.classList.add('just-shown');
      setTimeout(function(){ card.classList.remove('just-shown'); }, 1200);
    });
  }
}

function updateEntry(sid, date, status){
  var dr = attendance[date]||{};
  if (status) { dr[sid]={status:status,time:(dr[sid]?dr[sid].time:null)||nowTime()}; showToast(formatDate(date)+' → '+status); }
  else         { delete dr[sid]; showToast('Cleared '+formatDate(date)); }
  attendance[date]=dr; saveAttendance();
  if(date===todayKey()) renderDashboard();
}

function renderProfileCard(){
  var s = byId(profileId);
  var card = document.getElementById('searchDetailCard');
  if (!s) { card.style.display='none'; return; }
  var isAdmin = currentUser && currentUser.role==='admin';
  var p=0,a=0,l=0, entries=[];
  Object.keys(attendance).forEach(function(date){
    var rec=attendance[date][profileId];
    if(rec){ if(rec.status==='Present')p++; else if(rec.status==='Absent')a++; else if(rec.status==='Leave')l++; entries.push({date:date,status:rec.status,time:rec.time}); }
  });
  entries.sort(function(x,y){return y.date.localeCompare(x.date);});
  var marked=p+a+l, pct=marked?((p/marked)*100).toFixed(1):'0.0';
  var filtered=profileMonth?entries.filter(function(e){return e.date.startsWith(profileMonth);}):entries;
  card.style.display='block';
  card.innerHTML=
    '<div class="card-head">'+
      '<div><h3>'+esc(s.name)+'</h3><div style="margin-top:4px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">'+roomPill(s.room)+'<span style="font-size:12px;color:var(--muted);">'+esc(s.period||'')+(s.roll?' · Roll '+esc(s.roll):'')+'</span></div></div>'+
      '<div style="display:flex;gap:8px;align-items:flex-start;flex-shrink:0;">'+
        (isAdmin?'<button class="icon-btn" id="profileEditBtn" title="Edit"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>':'')+
        '<button class="icon-btn" id="profileCloseBtn" title="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>'+
      '</div>'+
    '</div>'+
    '<div class="detail-grid">'+
      '<div class="detail-box"><b style="color:var(--green)">'+p+'</b><span>Present</span></div>'+
      '<div class="detail-box"><b style="color:var(--red)">'+a+'</b><span>Absent</span></div>'+
      '<div class="detail-box"><b style="color:var(--blue)">'+l+'</b><span>On Leave</span></div>'+
      '<div class="detail-box"><b>'+pct+'%</b><span>All-Time Rate</span></div>'+
    '</div>'+
    '<div class="filters" style="margin-top:4px;">'+
      '<label class="field">Filter by Month<input type="month" id="profileMonthFilter" value="'+profileMonth+'"></label>'+
      '<button type="button" class="btn btn-ghost btn-sm" id="profileShowAllBtn">Show All</button>'+
    '</div>'+
    '<h4 style="font-size:13px;margin:14px 0 8px;color:var(--muted);">Attendance History — tap P/A/L to correct</h4>'+
    '<div class="table-wrap">'+(filtered.length?
      '<table><thead><tr><th>Date</th><th>Status</th><th>Time</th><th></th></tr></thead><tbody>'+
        filtered.map(function(h){ return '<tr>'+
          '<td>'+formatDate(h.date)+'</td>'+
          '<td><div style="display:inline-flex;gap:4px;">'+
            '<button class="mark-btn p sm'+(h.status==='Present'?' active':'')+'" data-date="'+h.date+'" data-status="Present">P</button>'+
            '<button class="mark-btn a sm'+(h.status==='Absent'?' active':'')+'" data-date="'+h.date+'" data-status="Absent">A</button>'+
            '<button class="mark-btn l sm'+(h.status==='Leave'?' active':'')+'" data-date="'+h.date+'" data-status="Leave">L</button>'+
          '</div></td>'+
          '<td>'+esc(h.time||'--')+'</td>'+
          '<td>'+(isAdmin?'<button class="icon-btn danger sm" data-clear="'+h.date+'" title="Clear"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>':'')+
          '</td></tr>'; }).join('')+
      '</tbody></table>'
      : '<div class="empty-state">No records yet.</div>')+
    '</div>';

  if(isAdmin){
    var eb=document.getElementById('profileEditBtn');
    if(eb) eb.addEventListener('click',function(){ openStudentModal(profileId); });
    card.querySelectorAll('[data-clear]').forEach(function(b){
      b.addEventListener('click',function(){
        if(!confirm('Clear attendance for '+formatDate(b.dataset.clear)+'?')) return;
        updateEntry(profileId,b.dataset.clear,null); renderProfileCard();
      });
    });
  }
  var closeBtn = document.getElementById('profileCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', function(){
    profileId = null;
    card.style.display = 'none';
    card.innerHTML = '';
    var list = document.getElementById('searchList');
    if (list) list.querySelectorAll('.search-card.selected').forEach(function(c){ c.classList.remove('selected'); });
  });
  document.getElementById('profileMonthFilter').addEventListener('change',function(e){ profileMonth=e.target.value; renderProfileCard(); });
  document.getElementById('profileShowAllBtn').addEventListener('click',function(){ profileMonth=''; renderProfileCard(); });
  card.querySelectorAll('.mark-btn[data-date]').forEach(function(btn){
    btn.addEventListener('click',function(){ updateEntry(profileId,btn.dataset.date,btn.dataset.status); renderProfileCard(); });
  });
}

/* ================================================================
   TEACHERS (Admin view)
================================================================ */
function renderTeachers(){
  var todayRec = attendance[todayKey()]||{};
  var list = document.getElementById('teacherCardsList');
  if (!teachers.length) {
    list.innerHTML = '<div class="empty-state">No teacher accounts yet. Click "Add Teacher" to create one.</div>';
  } else {
    list.innerHTML = teachers.slice().sort(function(a,b){return a.name.localeCompare(b.name);}).map(function(t){
      var color = roomColor(t.room);
      var initials = (t.name||'T').trim().slice(0,2).toUpperCase();
      var rs   = students.filter(function(s){ return s.room===t.room; });
      var rids = {}; rs.forEach(function(s){ rids[s.id]=true; });
      var tp=0,ta=0,tl=0;
      Object.keys(todayRec).forEach(function(sid){
        if(!rids[sid]) return;
        var st=todayRec[sid].status;
        if(st==='Present')tp++; else if(st==='Absent')ta++; else if(st==='Leave')tl++;
      });
      var pct = rs.length ? ((tp/rs.length)*100).toFixed(0) : 0;
      return '<div class="teacher-card" style="border-left-color:'+color+';">'+
        '<div class="teacher-avatar" style="background:'+color+';color:#fff;">'+esc(initials)+'</div>'+
        '<div class="teacher-info">'+
          '<strong>'+esc(t.name)+'</strong>'+
          '<div class="t-sub">'+roomPill(t.room)+'<span>@'+esc(t.username)+'</span><span>'+rs.length+' students</span><span>'+pct+'% today</span></div>'+
        '</div>'+
        '<div class="teacher-stats">'+
          '<div class="teacher-stat"><b style="color:var(--green)">'+tp+'</b><span>Present</span></div>'+
          '<div class="teacher-stat"><b style="color:var(--red)">'+ta+'</b><span>Absent</span></div>'+
          '<div class="teacher-stat"><b style="color:var(--blue)">'+tl+'</b><span>Leave</span></div>'+
        '</div>'+
        '<div style="display:flex;gap:6px;margin-left:10px;">'+
          '<button class="icon-btn" data-edit-teacher="'+t.id+'" title="Edit"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>'+
          '<button class="icon-btn danger" data-del-teacher="'+t.id+'" title="Delete"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>'+
        '</div></div>';
    }).join('');
  }
  list.querySelectorAll('[data-edit-teacher]').forEach(function(b){ b.addEventListener('click',function(){ openTeacherModal(b.dataset.editTeacher); }); });
  list.querySelectorAll('[data-del-teacher]').forEach(function(b){ b.addEventListener('click',function(){ deleteTeacher(b.dataset.delTeacher); }); });
}

/* ================================================================
   USERS (Admin only) — all accounts with credentials + reset
================================================================ */
function renderUsers(){
  var q = document.getElementById('usersSearchInput').value.trim().toLowerCase();
  var rows = [];
  rows.push({role:'Admin', name:passwords.adminName||'Admin', username:passwords.adminUsername||'admin', password:passwords.admin, kind:'admin', id:''});
  rows.push({role:'Finance', name:passwords.financeName||'Finance Officer', username:passwords.financeUsername||'finance', password:passwords.finance, kind:'finance', id:''});
  teachers.forEach(function(t){ rows.push({role:'Teacher', name:t.name, username:t.username, password:t.password, kind:'teacher', id:t.id}); });
  students.forEach(function(s){ rows.push({role:'Student', name:s.name, username:s.roll||s.id, password:s.password, kind:'student', id:s.id}); });
  if (q) rows = rows.filter(function(r){ return r.name.toLowerCase().includes(q) || (r.username||'').toLowerCase().includes(q); });
  var wrap = document.getElementById('usersTableWrap');
  if (!rows.length) { wrap.innerHTML = '<div class="empty-state">No users found.</div>'; return; }
  wrap.innerHTML = '<table><thead><tr><th>Role</th><th>Name</th><th>Username</th><th>Password</th><th></th></tr></thead><tbody>' +
    rows.map(function(r){
      return '<tr>'+
        '<td>'+r.role+'</td>'+
        '<td>'+esc(r.name)+'</td>'+
        '<td>'+esc(r.username||'—')+'</td>'+
        '<td><span class="pw-mask" data-pw="'+esc(r.password||'')+'" data-revealed="0" title="Click to reveal">••••••••</span></td>'+
        '<td><button type="button" class="btn btn-ghost btn-sm" data-reset-kind="'+r.kind+'" data-reset-id="'+esc(r.id)+'" data-reset-name="'+esc(r.name)+'">Reset</button></td>'+
      '</tr>';
    }).join('') + '</tbody></table>';
  wrap.querySelectorAll('.pw-mask').forEach(function(el){
    el.addEventListener('click', function(){
      if (el.dataset.revealed === '1') { el.textContent = '••••••••'; el.dataset.revealed = '0'; }
      else { el.textContent = el.dataset.pw || '(none set)'; el.dataset.revealed = '1'; }
    });
  });
  wrap.querySelectorAll('[data-reset-kind]').forEach(function(btn){
    btn.addEventListener('click', function(){
      openResetPwModal(btn.dataset.resetKind, btn.dataset.resetId, btn.dataset.resetName);
    });
  });
}
document.getElementById('usersSearchInput').addEventListener('input', renderUsers);

/* ================================================================
   ADMISSIONS (Admin only) — applications submitted from the public
   website's admission form, stored in the "admissions" Supabase table.
================================================================ */
var admissionsCache = null;
function renderAdmissions(){
  var wrap = document.getElementById('admissionsTableWrap');
  wrap.innerHTML = '<div class="empty-state">Loading applications…</div>';
  adminFrom('admissions').select('*').order('created_at', { ascending: false }).then(function(res){
    if (res.error) { wrap.innerHTML = '<div class="empty-state">Could not load admissions: '+esc(res.error.message)+'</div>'; return; }
    admissionsCache = res.data || [];
    drawAdmissionsTable();
  });
}
function drawAdmissionsTable(){
  var wrap = document.getElementById('admissionsTableWrap');
  var q = (document.getElementById('admissionsSearchInput').value || '').trim().toLowerCase();
  var rows = admissionsCache || [];
  if (q) {
    rows = rows.filter(function(r){
      var hay = [r.first_name, r.last_name, r.email, r.program, r.phone].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }
  if (!rows.length) { wrap.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg><div>No admission applications yet.</div></div>'; return; }
  wrap.innerHTML = '<table><thead><tr><th>Name</th><th>Contact</th><th>Program</th><th>Level</th><th>Previous School</th><th>Message</th><th>Applied</th></tr></thead><tbody>' +
    rows.map(function(r){
      var applied = r.created_at ? new Date(r.created_at).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}) : '—';
      return '<tr>'+
        '<td><strong>'+esc((r.first_name||'')+' '+(r.last_name||''))+'</strong></td>'+
        '<td>'+esc(r.email||'—')+'<br><span class="note" style="padding:0;background:none;border:none;">'+esc(r.phone||'')+'</span></td>'+
        '<td>'+esc(r.program||'—')+'</td>'+
        '<td>'+esc(r.level||'—')+'</td>'+
        '<td>'+esc(r.previous_school||'—')+'</td>'+
        '<td style="max-width:220px;white-space:normal;">'+esc(r.message||'—')+'</td>'+
        '<td>'+applied+'</td>'+
      '</tr>';
    }).join('') + '</tbody></table>';
}
document.getElementById('admissionsSearchInput').addEventListener('input', drawAdmissionsTable);

/* ================================================================
   WEBSITE EVENTS (Admin only) — the "Upcoming Events" cards on the
   public site, stored in the "site_events" Supabase table. The
   public website reads this same table directly, so any add/edit/
   delete here shows up on the site immediately (after a refresh).
================================================================ */
var webEventsCache = null;
function renderWebEvents(){
  var wrap = document.getElementById('webEventsTableWrap');
  wrap.innerHTML = '<div class="empty-state">Loading events…</div>';
  adminFrom('site_events').select('*').order('event_date', { ascending: true }).then(function(res){
    if (res.error) { wrap.innerHTML = '<div class="empty-state">Could not load events: '+esc(res.error.message)+'<br><span class="note" style="display:inline-block;margin-top:10px;">Make sure the "site_events" table exists in Supabase (see setup notes).</span></div>'; return; }
    webEventsCache = res.data || [];
    drawWebEventsTable();
  });
}
function drawWebEventsTable(){
  var wrap = document.getElementById('webEventsTableWrap');
  var rows = webEventsCache || [];
  if (!rows.length) { wrap.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg><div>No events yet. Click "Add Event" to create one.</div></div>'; return; }
  wrap.innerHTML = '<table><thead><tr><th>Date</th><th>Title</th><th>Tag</th><th>Description</th><th>Actions</th></tr></thead><tbody>' +
    rows.map(function(r){
      var d = r.event_date ? new Date(r.event_date+'T00:00:00').toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}) : '—';
      return '<tr>'+
        '<td><strong>'+esc(d)+'</strong></td>'+
        '<td>'+esc(r.title||'—')+'</td>'+
        '<td>'+(r.tag ? '<span class="pill" style="background:var(--blue-bg);color:var(--blue);">'+esc(r.tag)+'</span>' : '—')+'</td>'+
        '<td style="max-width:260px;white-space:normal;">'+esc(r.description||'—')+'</td>'+
        '<td><div style="display:flex;gap:6px;">'+
          '<button class="icon-btn" data-edit-webevent="'+r.id+'" title="Edit"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>'+
          '<button class="icon-btn danger" data-del-webevent="'+r.id+'" title="Delete"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>'+
        '</div></td>'+
      '</tr>';
    }).join('') + '</tbody></table>';
  wrap.querySelectorAll('[data-edit-webevent]').forEach(function(b){ b.addEventListener('click', function(){ openWebEventModal(b.dataset.editWebevent); }); });
  wrap.querySelectorAll('[data-del-webevent]').forEach(function(b){ b.addEventListener('click', function(){ deleteWebEvent(b.dataset.delWebevent); }); });
}
function openWebEventModal(id){
  var isEdit = !!id;
  var r = isEdit ? (webEventsCache||[]).find(function(x){ return String(x.id)===String(id); }) : null;
  document.getElementById('webEventModalTitle').textContent = isEdit ? 'Edit Event' : 'Add New Event';
  document.getElementById('webEventId').value = id || '';
  document.getElementById('webEventTitle').value = r ? (r.title||'') : '';
  document.getElementById('webEventDate').value  = r ? (r.event_date||'') : '';
  document.getElementById('webEventTag').value   = r ? (r.tag||'') : '';
  document.getElementById('webEventDesc').value  = r ? (r.description||'') : '';
  document.getElementById('webEventModal').classList.remove('hidden');
  document.getElementById('webEventTitle').focus();
}
function closeWebEventModal(){ document.getElementById('webEventModal').classList.add('hidden'); }
document.getElementById('addWebEventBtn').addEventListener('click', function(){ openWebEventModal(null); });
document.getElementById('cancelWebEventBtn').addEventListener('click', closeWebEventModal);
document.getElementById('webEventModal').addEventListener('click', function(e){ if(e.target.id==='webEventModal') closeWebEventModal(); });
document.getElementById('saveWebEventBtn').addEventListener('click', function(){
  var id    = document.getElementById('webEventId').value;
  var title = document.getElementById('webEventTitle').value.trim();
  var date  = document.getElementById('webEventDate').value;
  var tag   = document.getElementById('webEventTag').value.trim();
  var desc  = document.getElementById('webEventDesc').value.trim();
  if (!title) { showToast('Please enter an event title'); return; }
  if (!date)  { showToast('Please pick a date'); return; }
  var btn = document.getElementById('saveWebEventBtn');
  btn.disabled = true;
  var payload = { title: title, event_date: date, tag: tag, description: desc };
  var req = id ? adminFrom('site_events').update(payload).eq('id', id) : adminFrom('site_events').insert(payload);
  req.then(function(res){
    btn.disabled = false;
    if (res.error) { showToast('Could not save: ' + res.error.message); return; }
    showToast(id ? 'Event updated' : 'Event added');
    closeWebEventModal();
    renderWebEvents();
  });
});
function deleteWebEvent(id){
  var r = (webEventsCache||[]).find(function(x){ return String(x.id)===String(id); });
  if (!r) return;
  if (!confirm('Delete the event "'+r.title+'"? This cannot be undone.')) return;
  adminFrom('site_events').delete().eq('id', id).then(function(res){
    if (res.error) { showToast('Could not delete: ' + res.error.message); return; }
    showToast('Event deleted');
    renderWebEvents();
  });
}

/* ================================================================
   Shared helper: read a chosen <input type=file> as a base64 data URL,
   with a max-dimension resize so photos don't bloat the database.
================================================================ */
function fileToResizedDataURL(file, maxDim){
  return new Promise(function(resolve, reject){
    var reader = new FileReader();
    reader.onerror = reject;
    reader.onload = function(){
      var img = new Image();
      img.onerror = function(){ resolve(reader.result); }; // fallback: use raw
      img.onload = function(){
        var w = img.width, h = img.height;
        var max = maxDim || 1000;
        if (w > max || h > max) {
          var ratio = Math.min(max / w, max / h);
          w = Math.round(w * ratio); h = Math.round(h * ratio);
        }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function wireFileDrop(dropId, inputId, previewWrapId, isVideo){
  var drop = document.getElementById(dropId);
  var input = document.getElementById(inputId);
  drop.addEventListener('click', function(){ input.click(); });
  return input;
}

/* ================================================================
   MOMENTS GALLERY (Admin only) — "site_gallery" table
================================================================ */
var galleryCache = null, galleryPendingData = null;
function renderGallery(){
  var wrap = document.getElementById('galleryAdminGrid');
  wrap.innerHTML = '<div class="empty-state">Loading photos…</div>';
  adminFrom('site_gallery').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false }).then(function(res){
    if (res.error) { wrap.innerHTML = '<div class="empty-state">Could not load photos: '+esc(res.error.message)+'<br><span class="note">Make sure the "site_gallery" table exists in Supabase.</span></div>'; return; }
    galleryCache = res.data || [];
    drawGalleryGrid();
  });
}
function drawGalleryGrid(){
  var wrap = document.getElementById('galleryAdminGrid');
  var rows = galleryCache || [];
  if (!rows.length) { wrap.innerHTML = '<div class="empty-state">No photos yet. Click "Add Photo" to upload one.</div>'; return; }
  wrap.innerHTML = rows.map(function(r){
    return '<div class="gallery-admin-item">'+
      '<div class="thumb" style="background-image:url(\''+ (r.image_data||'').replace(/'/g,"%27") +'\')"></div>'+
      '<div class="meta"><span>'+esc(r.caption||'Untitled photo')+'</span></div>'+
      '<div class="actions">'+
        '<button class="icon-btn sm" data-edit-gallery="'+r.id+'" title="Edit"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>'+
        '<button class="icon-btn sm danger" data-del-gallery="'+r.id+'" title="Delete"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>'+
      '</div></div>';
  }).join('');
  wrap.querySelectorAll('[data-edit-gallery]').forEach(function(b){ b.addEventListener('click', function(){ openGalleryModal(b.dataset.editGallery); }); });
  wrap.querySelectorAll('[data-del-gallery]').forEach(function(b){ b.addEventListener('click', function(){ deleteGallery(b.dataset.delGallery); }); });
}
function openGalleryModal(id){
  var r = id ? (galleryCache||[]).find(function(x){ return String(x.id)===String(id); }) : null;
  document.getElementById('galleryModalTitle').textContent = id ? 'Edit Photo' : 'Add Photo';
  document.getElementById('galleryId').value = id || '';
  document.getElementById('galleryCaption').value = r ? (r.caption||'') : '';
  galleryPendingData = r ? r.image_data : null;
  document.getElementById('galleryPreviewWrap').innerHTML = galleryPendingData ? '<img src="'+galleryPendingData+'">' : '';
  document.getElementById('galleryModal').classList.remove('hidden');
}
document.getElementById('addGalleryBtn').addEventListener('click', function(){ openGalleryModal(null); });
document.getElementById('cancelGalleryBtn').addEventListener('click', function(){ document.getElementById('galleryModal').classList.add('hidden'); });
document.getElementById('galleryModal').addEventListener('click', function(e){ if(e.target.id==='galleryModal') document.getElementById('galleryModal').classList.add('hidden'); });
wireFileDrop('galleryDrop','galleryFile','galleryPreviewWrap');
document.getElementById('galleryFile').addEventListener('change', function(e){
  var f = e.target.files[0]; if (!f) return;
  fileToResizedDataURL(f, 1000).then(function(dataUrl){
    galleryPendingData = dataUrl;
    document.getElementById('galleryPreviewWrap').innerHTML = '<img src="'+dataUrl+'">';
  });
});
document.getElementById('saveGalleryBtn').addEventListener('click', function(){
  var id = document.getElementById('galleryId').value;
  var caption = document.getElementById('galleryCaption').value.trim();
  if (!galleryPendingData) { showToast('Please choose a photo'); return; }
  var btn = document.getElementById('saveGalleryBtn'); btn.disabled = true;
  var payload = { image_data: galleryPendingData, caption: caption, sort_order: 0 };
  var req = id ? adminFrom('site_gallery').update(payload).eq('id', id) : adminFrom('site_gallery').insert(payload);
  req.then(function(res){
    btn.disabled = false;
    if (res.error) { showToast('Could not save: ' + res.error.message); return; }
    showToast(id ? 'Photo updated' : 'Photo added');
    document.getElementById('galleryModal').classList.add('hidden');
    renderGallery();
  });
});
function deleteGallery(id){
  if (!confirm('Delete this photo? This cannot be undone.')) return;
  adminFrom('site_gallery').delete().eq('id', id).then(function(res){
    if (res.error) { showToast('Could not delete: ' + res.error.message); return; }
    showToast('Photo deleted'); renderGallery();
  });
}

/* ================================================================
   WEBSITE FACULTY (Admin only) — "site_faculty" table
================================================================ */
var facultyWebCache = null, facultyWebPendingData = null;
function renderFacultyWeb(){
  var wrap = document.getElementById('facultyAdminGrid');
  wrap.innerHTML = '<div class="empty-state">Loading faculty…</div>';
  adminFrom('site_faculty').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }).then(function(res){
    if (res.error) { wrap.innerHTML = '<div class="empty-state">Could not load faculty: '+esc(res.error.message)+'<br><span class="note">Make sure the "site_faculty" table exists in Supabase.</span></div>'; return; }
    facultyWebCache = res.data || [];
    drawFacultyWebGrid();
  });
}
function drawFacultyWebGrid(){
  var wrap = document.getElementById('facultyAdminGrid');
  var rows = facultyWebCache || [];
  if (!rows.length) { wrap.innerHTML = '<div class="empty-state">No faculty yet. Click "Add Faculty" to create one.</div>'; return; }
  wrap.innerHTML = rows.map(function(r){
    return '<div class="gallery-admin-item">'+
      '<div class="thumb" style="background-image:url(\''+ (r.photo_data||'').replace(/'/g,"%27") +'\')"></div>'+
      '<div class="meta"><strong>'+esc(r.name||'Untitled')+'</strong><span>'+esc(r.role_title||'')+(r.department?' · '+esc(r.department):'')+'</span></div>'+
      '<div class="actions">'+
        '<button class="icon-btn sm" data-edit-faculty="'+r.id+'" title="Edit"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>'+
        '<button class="icon-btn sm danger" data-del-faculty="'+r.id+'" title="Delete"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>'+
      '</div></div>';
  }).join('');
  wrap.querySelectorAll('[data-edit-faculty]').forEach(function(b){ b.addEventListener('click', function(){ openFacultyWebModal(b.dataset.editFaculty); }); });
  wrap.querySelectorAll('[data-del-faculty]').forEach(function(b){ b.addEventListener('click', function(){ deleteFacultyWeb(b.dataset.delFaculty); }); });
}
function openFacultyWebModal(id){
  var r = id ? (facultyWebCache||[]).find(function(x){ return String(x.id)===String(id); }) : null;
  document.getElementById('facultyWebModalTitle').textContent = id ? 'Edit Faculty Member' : 'Add Faculty Member';
  document.getElementById('facultyWebId').value = id || '';
  document.getElementById('facultyWebName').value = r ? (r.name||'') : '';
  document.getElementById('facultyWebRole').value = r ? (r.role_title||'') : '';
  document.getElementById('facultyWebDept').value = r ? (r.department||'') : '';
  facultyWebPendingData = r ? r.photo_data : null;
  document.getElementById('facultyWebPreviewWrap').innerHTML = facultyWebPendingData ? '<img src="'+facultyWebPendingData+'">' : '';
  document.getElementById('facultyWebModal').classList.remove('hidden');
}
document.getElementById('addFacultyBtn').addEventListener('click', function(){ openFacultyWebModal(null); });
document.getElementById('cancelFacultyWebBtn').addEventListener('click', function(){ document.getElementById('facultyWebModal').classList.add('hidden'); });
document.getElementById('facultyWebModal').addEventListener('click', function(e){ if(e.target.id==='facultyWebModal') document.getElementById('facultyWebModal').classList.add('hidden'); });
wireFileDrop('facultyWebDrop','facultyWebFile','facultyWebPreviewWrap');
document.getElementById('facultyWebFile').addEventListener('change', function(e){
  var f = e.target.files[0]; if (!f) return;
  fileToResizedDataURL(f, 500).then(function(dataUrl){
    facultyWebPendingData = dataUrl;
    document.getElementById('facultyWebPreviewWrap').innerHTML = '<img src="'+dataUrl+'">';
  });
});
document.getElementById('saveFacultyWebBtn').addEventListener('click', function(){
  var id = document.getElementById('facultyWebId').value;
  var name = document.getElementById('facultyWebName').value.trim();
  var role = document.getElementById('facultyWebRole').value.trim();
  var dept = document.getElementById('facultyWebDept').value.trim();
  if (!name) { showToast('Please enter a name'); return; }
  if (!facultyWebPendingData) { showToast('Please choose a photo'); return; }
  var btn = document.getElementById('saveFacultyWebBtn'); btn.disabled = true;
  var payload = { name: name, role_title: role, department: dept, photo_data: facultyWebPendingData, sort_order: 0 };
  var req = id ? adminFrom('site_faculty').update(payload).eq('id', id) : adminFrom('site_faculty').insert(payload);
  req.then(function(res){
    btn.disabled = false;
    if (res.error) { showToast('Could not save: ' + res.error.message); return; }
    showToast(id ? 'Faculty updated' : 'Faculty added');
    document.getElementById('facultyWebModal').classList.add('hidden');
    renderFacultyWeb();
  });
});
function deleteFacultyWeb(id){
  if (!confirm('Delete this faculty member? This cannot be undone.')) return;
  adminFrom('site_faculty').delete().eq('id', id).then(function(res){
    if (res.error) { showToast('Could not delete: ' + res.error.message); return; }
    showToast('Faculty deleted'); renderFacultyWeb();
  });
}

/* ================================================================
   LIFE AT KIC (Admin only) — "site_life_media" table
================================================================ */
var lifeCache = null, lifePendingData = null, lifeVideoPendingFile = null;
function renderLife(){
  var wrap = document.getElementById('lifeAdminGrid');
  wrap.innerHTML = '<div class="empty-state">Loading items…</div>';
  adminFrom('site_life_media').select('*').order('media_type', { ascending: false }).order('sort_order', { ascending: true }).order('created_at', { ascending: false }).then(function(res){
    if (res.error) { wrap.innerHTML = '<div class="empty-state">Could not load items: '+esc(res.error.message)+'<br><span class="note">Make sure the "site_life_media" table exists in Supabase.</span></div>'; return; }
    lifeCache = res.data || [];
    drawLifeGrid();
  });
}
function drawLifeGrid(){
  var wrap = document.getElementById('lifeAdminGrid');
  var rows = lifeCache || [];
  if (!rows.length) { wrap.innerHTML = '<div class="empty-state">No items yet. Click "Add Item" to create one.</div>'; return; }
  wrap.innerHTML = rows.map(function(r){
    var thumb = r.media_type === 'video'
      ? '<div class="thumb"><video muted src="'+esc(r.media_url||'')+'"></video></div>'
      : '<div class="thumb" style="background-image:url(\''+ (r.media_data||'').replace(/'/g,"%27") +'\')"></div>';
    return '<div class="gallery-admin-item">'+ thumb +
      '<div class="meta"><strong>'+esc(r.label||'Untitled')+'</strong><span>'+(r.media_type==='video'?'Video':'Photo')+'</span></div>'+
      '<div class="actions">'+
        '<button class="icon-btn sm" data-edit-life="'+r.id+'" title="Edit"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>'+
        '<button class="icon-btn sm danger" data-del-life="'+r.id+'" title="Delete"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>'+
      '</div></div>';
  }).join('');
  wrap.querySelectorAll('[data-edit-life]').forEach(function(b){ b.addEventListener('click', function(){ openLifeModal(b.dataset.editLife); }); });
  wrap.querySelectorAll('[data-del-life]').forEach(function(b){ b.addEventListener('click', function(){ deleteLife(b.dataset.delLife); }); });
}
function syncLifeTypeFields(){
  var isVideo = document.getElementById('lifeType').value === 'video';
  document.getElementById('lifeFileField').style.display = isVideo ? 'none' : '';
  document.getElementById('lifeUrlField').style.display = isVideo ? '' : 'none';
}
document.getElementById('lifeType').addEventListener('change', syncLifeTypeFields);
function openLifeModal(id){
  var r = id ? (lifeCache||[]).find(function(x){ return String(x.id)===String(id); }) : null;
  document.getElementById('lifeModalTitle').textContent = id ? 'Edit Item' : 'Add Life at KIC Item';
  document.getElementById('lifeId').value = id || '';
  document.getElementById('lifeType').value = r ? (r.media_type||'image') : 'image';
  document.getElementById('lifeLabel').value = r ? (r.label||'') : '';
  document.getElementById('lifeUrl').value = r ? (r.media_url||'') : '';
  lifeVideoPendingFile = null;
  document.getElementById('lifeVideoPreviewWrap').innerHTML = (r && r.media_type==='video' && r.media_url) ? '<video src="'+r.media_url+'" controls></video>' : '';
  lifePendingData = r ? r.media_data : null;
  document.getElementById('lifePreviewWrap').innerHTML = lifePendingData ? '<img src="'+lifePendingData+'">' : '';
  syncLifeTypeFields();
  document.getElementById('lifeModal').classList.remove('hidden');
}
document.getElementById('addLifeBtn').addEventListener('click', function(){ openLifeModal(null); });
document.getElementById('cancelLifeBtn').addEventListener('click', function(){ document.getElementById('lifeModal').classList.add('hidden'); });
document.getElementById('lifeModal').addEventListener('click', function(e){ if(e.target.id==='lifeModal') document.getElementById('lifeModal').classList.add('hidden'); });
wireFileDrop('lifeDrop','lifeFile','lifePreviewWrap');
document.getElementById('lifeFile').addEventListener('change', function(e){
  var f = e.target.files[0]; if (!f) return;
  fileToResizedDataURL(f, 1000).then(function(dataUrl){
    lifePendingData = dataUrl;
    document.getElementById('lifePreviewWrap').innerHTML = '<img src="'+dataUrl+'">';
  });
});
wireFileDrop('lifeVideoDrop','lifeVideoFile','lifeVideoPreviewWrap');
document.getElementById('lifeVideoFile').addEventListener('change', function(e){
  var f = e.target.files[0]; if (!f) return;
  if (f.size > 49 * 1024 * 1024) { showToast('Please pick a video under 50MB (Supabase free plan limit)'); e.target.value=''; return; }
  lifeVideoPendingFile = f;
  document.getElementById('lifeVideoPreviewWrap').innerHTML = '<video src="'+URL.createObjectURL(f)+'" controls></video>';
});
document.getElementById('saveLifeBtn').addEventListener('click', function(){
  var id = document.getElementById('lifeId').value;
  var type = document.getElementById('lifeType').value;
  var label = document.getElementById('lifeLabel').value.trim();
  var typedUrl = document.getElementById('lifeUrl').value.trim();
  if (!label) { showToast('Please enter a label'); return; }
  if (type === 'video' && !lifeVideoPendingFile && !typedUrl) { showToast('Please choose a video file or paste a direct video link'); return; }
  if (type === 'image' && !lifePendingData) { showToast('Please choose a photo'); return; }
  var btn = document.getElementById('saveLifeBtn'); btn.disabled = true;

  function finishSave(videoUrl){
    var payload = { media_type: type, label: label, media_url: type==='video' ? videoUrl : null, media_data: type==='image' ? lifePendingData : null, sort_order: 0 };
    var req = id ? adminFrom('site_life_media').update(payload).eq('id', id) : adminFrom('site_life_media').insert(payload);
    req.then(function(res){
      btn.disabled = false;
      if (res.error) { showToast('Could not save: ' + res.error.message); return; }
      showToast(id ? 'Item updated' : 'Item added');
      document.getElementById('lifeModal').classList.add('hidden');
      renderLife();
    });
  }

  if (type === 'video' && lifeVideoPendingFile) {
    showToast('Uploading video… this can take a minute');
    var path = 'life/' + Date.now() + '-' + lifeVideoPendingFile.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    db.storage.from('site-media').upload(path, lifeVideoPendingFile, { upsert: true }).then(function(res){
      if (res.error) { btn.disabled = false; showToast('Video upload failed: ' + res.error.message + ' — make sure the "site-media" storage bucket is set up.'); return; }
      var pub = db.storage.from('site-media').getPublicUrl(path);
      finishSave(pub.data.publicUrl);
    });
  } else {
    finishSave(type === 'video' ? typedUrl : null);
  }
});
function deleteLife(id){
  if (!confirm('Delete this item? This cannot be undone.')) return;
  adminFrom('site_life_media').delete().eq('id', id).then(function(res){
    if (res.error) { showToast('Could not delete: ' + res.error.message); return; }
    showToast('Item deleted'); renderLife();
  });
}

function openResetPwModal(kind, id, name){
  document.getElementById('resetPwKind').value = kind;
  document.getElementById('resetPwId').value = id;
  document.getElementById('resetPwModalTitle').textContent = 'Reset Password — ' + name;
  document.getElementById('resetPwNew').value = '';
  document.getElementById('resetPwConfirm').value = '';
  document.getElementById('resetPwModal').classList.remove('hidden');
}
function closeResetPwModal(){
  document.getElementById('resetPwModal').classList.add('hidden');
}
document.getElementById('cancelResetPwBtn').addEventListener('click', closeResetPwModal);
document.getElementById('saveResetPwBtn').addEventListener('click', function(){
  var kind = document.getElementById('resetPwKind').value;
  var id   = document.getElementById('resetPwId').value;
  var v1 = document.getElementById('resetPwNew').value.trim();
  var v2 = document.getElementById('resetPwConfirm').value.trim();
  if (!v1 || v1.length < 4) { showToast('Password must be at least 4 characters'); return; }
  if (v1 !== v2) { showToast('Passwords do not match'); return; }
  if (kind === 'admin') {
    passwords.admin = v1;
    savePasswords();
  } else if (kind === 'finance') {
    passwords.finance = v1;
    savePasswords();
  } else if (kind === 'teacher') {
    var t = teachers.find(function(tt){ return tt.id === id; });
    if (!t) { showToast('Could not find that account'); return; }
    t.password = v1;
    saveTeachers();
  } else if (kind === 'student') {
    var s = byId(id);
    if (!s) { showToast('Could not find that account'); return; }
    s.password = v1;
    saveStudents();
  } else {
    return;
  }
  closeResetPwModal();
  renderUsers();
  showToast('Password updated');
});

function openTeacherModal(id){
  var isEdit = !!id;
  document.getElementById('teacherModalTitle').textContent = isEdit ? 'Edit Teacher' : 'Add New Teacher';
  document.getElementById('teacherId').value = id || '';
  var t = isEdit ? teachers.find(function(tt){return tt.id===id;}) : null;
  document.getElementById('teacherInputName').value = t ? t.name : '';
  document.getElementById('teacherInputUsername').value = t ? t.username : '';
  document.getElementById('teacherInputPassword').value = t ? t.password : '';
  populateRoomOptions(document.getElementById('teacherInputRoom'), t ? t.room : settings.rooms[0]);
  document.getElementById('teacherModal').classList.remove('hidden');
  document.getElementById('teacherInputName').focus();
}
function closeTeacherModal(){ document.getElementById('teacherModal').classList.add('hidden'); }

document.getElementById('addTeacherBtn').addEventListener('click', function(){ openTeacherModal(null); });
document.getElementById('cancelTeacherBtn').addEventListener('click', closeTeacherModal);
document.getElementById('teacherModal').addEventListener('click', function(e){ if(e.target.id==='teacherModal') closeTeacherModal(); });
document.getElementById('saveTeacherBtn').addEventListener('click', function(){
  var id       = document.getElementById('teacherId').value;
  var name     = document.getElementById('teacherInputName').value.trim();
  var username = document.getElementById('teacherInputUsername').value.trim();
  var password = document.getElementById('teacherInputPassword').value.trim();
  if (!name)     { showToast('Please enter a name'); return; }
  if (!username) { showToast('Please enter a username'); return; }
  if (!password || password.length<4) { showToast('Password must be at least 4 characters'); return; }
  var dupe = teachers.find(function(t){ return t.username.toLowerCase()===username.toLowerCase() && t.id!==id; });
  if (dupe) { showToast('That username is already in use'); return; }
  var room = document.getElementById('teacherInputRoom').value;
  if (id) {
    var t = teachers.find(function(tt){return tt.id===id;});
    t.name=name; t.username=username; t.password=password; t.room=room;
    showToast('Teacher updated');
  } else {
    teachers.push({id:String(nextTeacherId), name:name, username:username, password:password, room:room});
    showToast('Teacher added');
  }
  saveTeachers(); closeTeacherModal(); renderTeachers();
});
function deleteTeacher(id){
  var t = teachers.find(function(tt){return tt.id===id;});
  if (!t) return;
  if (!confirm('Remove teacher "'+t.name+'"? They will no longer be able to log in.')) return;
  teachers = teachers.filter(function(tt){return tt.id!==id;});
  saveTeachers(); renderTeachers(); showToast('Teacher removed');
}

/* ================================================================
   BACKUP
================================================================ */
function renderBackup(){
  var bytes=new Blob([JSON.stringify(students),JSON.stringify(attendance)]).size;
  document.getElementById('storageInfo').textContent='Approx. '+(bytes/1024).toFixed(1)+' KB in Supabase — '+students.length+' student'+(students.length===1?'':'s')+', '+Object.keys(attendance).length+' day'+(Object.keys(attendance).length===1?'':'s')+' of records.';
}
document.getElementById('exportBackupBtn').addEventListener('click',function(){
  var blob=new Blob([JSON.stringify({students:students,teachers:teachers,attendance:attendance,settings:settings,invoices:invoices,expenses:expenses,results:results,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='attendance-backup-'+todayKey()+'.json'; a.click();
  showToast('Backup downloaded');
});
document.getElementById('importBackupBtn').addEventListener('click',function(){
  var fi=document.getElementById('importFileInput'); var file=fi.files[0];
  if(!file){showToast('Choose a file first');return;}
  if(!confirm('Replace all current data with this backup?')) return;
  var r=new FileReader(); r.onload=async function(e){
    try{
      var d=JSON.parse(e.target.result);
      students=Array.isArray(d.students)?d.students:[];
      teachers=Array.isArray(d.teachers)?d.teachers:teachers;
      attendance=d.attendance&&typeof d.attendance==='object'?d.attendance:{};
      settings={orgName:(d.settings&&d.settings.orgName)||DEFAULT_SETTINGS.orgName, periods:(d.settings&&d.settings.periods)||DEFAULT_SETTINGS.periods.slice(), rooms:(d.settings&&d.settings.rooms&&d.settings.rooms.length)?d.settings.rooms:DEFAULT_SETTINGS.rooms.slice(), schoolPhone:(d.settings&&d.settings.schoolPhone)||''};
      recomputeNextId();
      /* Older backups have no payments/expenses/results — leave those untouched in that case */
      var saves=[saveStudents(),saveTeachers(),saveAttendance(),saveSettings()];
      if(Array.isArray(d.invoices)){ invoices=d.invoices; nextInvoiceNo=invoices.reduce(function(mx,i){return Math.max(mx,parseInt(i.receiptNo,10)||0);},0)+1; saves.push(saveInvoices()); }
      if(Array.isArray(d.expenses)){ expenses=d.expenses; saves.push(saveExpenses()); }
      if(d.results&&typeof d.results==='object'&&!Array.isArray(d.results)){ results=d.results; saves.push(saveResults()); }
      await Promise.all(saves);
      applySettingsToUI(); showToast('Backup restored'); renderBackup(); switchView('dashboard');
    }catch(e){alert('Invalid backup file.');}
  }; r.readAsText(file);
});

/* ================================================================
   MY ATTENDANCE (Student portal — read-only, scoped to self)
================================================================ */
var myAttMonth = '';
var myAttChart = null;

function renderMyAttendance(){
  var s = byId(currentUser.studentId);
  if (!s) {
    document.getElementById('myAttSummary').innerHTML = '<div class="empty-state" style="grid-column:1/-1;">Your student record could not be found. Contact your teacher or admin.</div>';
    return;
  }
  document.getElementById('myAttName').textContent = s.name;
  document.getElementById('myAttSubtitle').textContent = (s.room||'') + ' · ' + (s.period||'—') + (s.roll?' · Roll '+s.roll:'');

  var p=0,a=0,l=0, entries=[];
  Object.keys(attendance).forEach(function(date){
    var rec = attendance[date][s.id];
    if (rec) {
      if(rec.status==='Present') p++; else if(rec.status==='Absent') a++; else if(rec.status==='Leave') l++;
      entries.push({date:date, status:rec.status, time:rec.time});
    }
  });
  entries.sort(function(x,y){ return y.date.localeCompare(x.date); });
  var marked = p+a+l, pct = marked ? ((p/marked)*100).toFixed(1) : '0.0';

  document.getElementById('myAttSummary').innerHTML =
    '<div class="detail-box"><b style="color:var(--green)">'+p+'</b><span>Present</span></div>'+
    '<div class="detail-box"><b style="color:var(--red)">'+a+'</b><span>Absent</span></div>'+
    '<div class="detail-box"><b style="color:var(--blue)">'+l+'</b><span>On Leave</span></div>'+
    '<div class="detail-box"><b>'+pct+'%</b><span>All-Time Rate</span></div>';

  var mi = document.getElementById('myAttMonthFilter');
  if (!mi._wired) {
    mi.addEventListener('change', function(){ myAttMonth = mi.value; renderMyAttendance(); });
    document.getElementById('myAttShowAllBtn').addEventListener('click', function(){ myAttMonth=''; mi.value=''; renderMyAttendance(); });
    mi._wired = true;
  }
  mi.value = myAttMonth;

  var filtered = myAttMonth ? entries.filter(function(e){ return e.date.startsWith(myAttMonth); }) : entries;
  var wrap = document.getElementById('myAttTableWrap');
  wrap.innerHTML = filtered.length
    ? '<table><thead><tr><th>Date</th><th>Status</th><th>Time</th></tr></thead><tbody>'+
        filtered.map(function(h){ return '<tr><td>'+formatDate(h.date)+'</td><td>'+statusPill(h.status)+'</td><td>'+esc(h.time||'--')+'</td></tr>'; }).join('')+
      '</tbody></table>'
    : '<div class="empty-state">No attendance records yet.</div>';

  if (typeof Chart !== 'undefined') {
    var ctx = document.getElementById('myAttChart');
    if (myAttChart) myAttChart.destroy();
    myAttChart = new Chart(ctx,{type:'doughnut',data:{labels:['Present','Absent','On Leave'],datasets:[{data:[p,a,l],backgroundColor:['#00a000','#e0392b','#4a3fa0'],borderWidth:0}]},options:{plugins:{legend:{position:'bottom',labels:{boxWidth:12,font:{size:11}}}},cutout:'65%'}});
  }
}

/* ================================================================
   MY PROFILE (Teacher & Student — change own password)
================================================================ */
function renderMyProfile(){
  var u = currentUser;
  var grid = document.getElementById('profileInfoGrid');
  var nameBtn = document.getElementById('saveMyNameBtn');
  if (!u) return;
  if (u.role === 'admin') {
    document.getElementById('profileSubtitle').textContent = 'Manage your admin account.';
    grid.innerHTML =
      '<label class="field">Display Name<input type="text" id="myNameInput" value="'+esc(passwords.adminName||'Admin')+'"></label>'+
      '<label class="field">Username<input type="text" id="myUsernameInput" value="'+esc(passwords.adminUsername||'admin')+'"></label>';
    nameBtn.style.display = '';
    nameBtn.lastChild.textContent = 'Save Account Info';
  } else if (u.role === 'teacher') {
    var t = teachers.find(function(tt){ return tt.id === u.teacherId; });
    document.getElementById('profileSubtitle').textContent = 'Manage your teacher account.';
    grid.innerHTML =
      '<label class="field">Full Name<input type="text" id="myNameInput" value="'+esc(t?t.name:u.label)+'"></label>'+
      '<label class="field">Username<input type="text" value="'+esc(t?t.username:'')+'" disabled></label>'+
      '<label class="field" style="grid-column:1/-1;">Room<input type="text" value="'+esc(t?t.room:'')+'" disabled></label>';
    nameBtn.style.display = '';
    nameBtn.lastChild.textContent = 'Save Name';
  } else if (u.role === 'finance') {
    document.getElementById('profileSubtitle').textContent = 'Manage your finance account.';
    grid.innerHTML =
      '<label class="field">Display Name<input type="text" id="myNameInput" value="'+esc(passwords.financeName||'Finance Officer')+'"></label>'+
      '<label class="field">Username<input type="text" id="myUsernameInput" value="'+esc(passwords.financeUsername||'finance')+'"></label>';
    nameBtn.style.display = '';
    nameBtn.lastChild.textContent = 'Save Account Info';
  } else if (u.role === 'student') {
    var s = byId(u.studentId);
    document.getElementById('profileSubtitle').textContent = 'Manage your student account.';
    grid.innerHTML =
      '<label class="field">Full Name<input type="text" value="'+esc(s?s.name:u.label)+'" disabled></label>'+
      '<label class="field">Roll No<input type="text" value="'+esc(s?s.roll:'')+'" disabled></label>'+
      '<label class="field">Room<input type="text" value="'+esc(s?s.room:'')+'" disabled></label>'+
      '<label class="field">Period<input type="text" value="'+esc(s?s.period:'')+'" disabled></label>';
    nameBtn.style.display = 'none';
  }
  document.getElementById('myOldPassword').value = '';
  document.getElementById('myNewPassword').value = '';
  document.getElementById('myConfirmPassword').value = '';
}

document.getElementById('saveMyNameBtn').addEventListener('click', function(){
  var u = currentUser;
  if (!u || (u.role !== 'teacher' && u.role !== 'admin' && u.role !== 'finance')) return;
  var nameInput = document.getElementById('myNameInput');
  if (!nameInput) return;
  var name = nameInput.value.trim();
  if (!name) { showToast('Name cannot be empty'); return; }
  if (u.role === 'admin') {
    var usernameInput = document.getElementById('myUsernameInput');
    var username = usernameInput ? usernameInput.value.trim() : passwords.adminUsername;
    if (!username) { showToast('Username cannot be empty'); return; }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) { showToast('Username can only contain letters, numbers, and _ . -'); return; }
    passwords.adminName = name;
    passwords.adminUsername = username;
    savePasswords();
  } else if (u.role === 'finance') {
    var usernameInput2 = document.getElementById('myUsernameInput');
    var username2 = usernameInput2 ? usernameInput2.value.trim() : passwords.financeUsername;
    if (!username2) { showToast('Username cannot be empty'); return; }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username2)) { showToast('Username can only contain letters, numbers, and _ . -'); return; }
    passwords.financeName = name;
    passwords.financeUsername = username2;
    savePasswords();
  } else {
    var t = teachers.find(function(tt){ return tt.id === u.teacherId; });
    if (!t) { showToast('Could not find your account'); return; }
    t.name = name;
    saveTeachers();
  }
  currentUser.label = name;
  currentUser.initials = name.trim().slice(0,2).toUpperCase();
  document.getElementById('sidebarUserName').textContent = name;
  document.getElementById('topWelcome').textContent = 'Welcome, ' + name;
  document.getElementById('sidebarAvatar').textContent = currentUser.initials;
  document.getElementById('topAvatar').textContent = currentUser.initials[0];
  showToast((u.role === 'admin' || u.role === 'finance') ? 'Account info updated' : 'Name updated');
});

document.getElementById('saveMyPasswordBtn').addEventListener('click', async function(){
  var btn = this;
  var oldPw = document.getElementById('myOldPassword').value.trim();
  var v1 = document.getElementById('myNewPassword').value.trim();
  var v2 = document.getElementById('myConfirmPassword').value.trim();
  var u = currentUser;
  if (!u) return;
  if (!oldPw) { showToast('Enter your current password'); return; }
  if (!v1 || v1.length < 4) { showToast('New password must be at least 4 characters'); return; }
  if (v1 !== v2) { showToast('New passwords do not match'); return; }
  if (btn.disabled) return;
  /* Passwords are stored as bcrypt hashes on the server, so the current
     password can only be verified there (the browser cannot compare it). */
  btn.disabled = true;
  var out;
  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
      body: JSON.stringify({ token: appToken, oldPassword: oldPw, newPassword: v1 })
    });
    out = await res.json().catch(function(){ return { ok:false, error:'Bad response from server.' }; });
  } catch (err) {
    btn.disabled = false;
    showToast('Could not reach the server. Check your connection and try again.');
    return;
  }
  btn.disabled = false;
  if (!out.ok) { showToast(out.error || 'Could not change password'); return; }
  /* Keep the local copy in sync with the new hash so a later save of the
     same data set (e.g. editing your name) cannot write the old one back. */
  if (u.role === 'admin') passwords.admin = out.hash;
  else if (u.role === 'finance') passwords.finance = out.hash;
  else if (u.role === 'teacher') { var t = teachers.find(function(tt){ return tt.id === u.teacherId; }); if (t) t.password = out.hash; }
  else if (u.role === 'student') { var s = byId(u.studentId); if (s) s.password = out.hash; }
  document.getElementById('myOldPassword').value = '';
  document.getElementById('myNewPassword').value = '';
  document.getElementById('myConfirmPassword').value = '';
  showToast('Password updated');
});

/* ================================================================
   SAMPLE DATA
================================================================ */
document.getElementById('loadSampleBtn').addEventListener('click',function(){
  if(students.length>0&&!confirm('Add sample students alongside existing data?')) return;
  var names=[
    ['Amina Hassan','Room A'],['Omar Farah','Room A'],['Hodan Warsame','Room A'],
    ['Abdi Jama','Room B'],['Fatima Ali','Room B'],['Mohamud Nur','Room B'],
    ['Sahra Ahmed','Room C'],['Idris Osman','Room C'],['Liban Mohamed','Room C']
  ];
  var added=[];
  names.forEach(function(pair){
    var period=settings.periods[Math.floor(Math.random()*settings.periods.length)]||settings.periods[0];
    var s={id:String(nextId),name:pair[0],room:pair[1],period:period,roll:withKicPrefix(String(nextId)),sample:true};
    students.push(s); added.push(s); nextId++;
  });
  saveStudents();
  for(var i=0;i<7;i++){
    var d=new Date(); d.setDate(d.getDate()-i);
    var key=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
    if(isWeekend(key)) continue;
    var dr=attendance[key]||{};
    added.forEach(function(s){
      var roll=Math.random();
      var st=roll<0.78?'Present':roll<0.93?'Absent':'Leave';
      dr[s.id]={status:st,time:'0'+(8+Math.floor(Math.random()*2))+':'+pad(Math.floor(Math.random()*60))+' AM'};
    });
    attendance[key]=dr;
  }
  saveAttendance(); showToast('Sample data loaded (9 students across 3 rooms)'); renderDashboard();
});

document.getElementById('deleteSampleBtn').addEventListener('click',function(){
  var sampleIds = students.filter(function(s){ return s.sample; }).map(function(s){ return s.id; });
  if (!sampleIds.length) { showToast('No sample data to delete'); return; }
  if (!confirm('Delete the '+sampleIds.length+' sample student(s) and their attendance records? Your real students and data will not be touched.')) return;
  var idSet = {};
  sampleIds.forEach(function(id){ idSet[id]=true; });
  students = students.filter(function(s){ return !idSet[s.id]; });
  Object.keys(attendance).forEach(function(date){
    sampleIds.forEach(function(id){ delete attendance[date][id]; });
  });
  saveStudents(); saveAttendance();
  showToast('Sample data deleted'); renderDashboard();
});

document.getElementById('applyKicPrefixBtn').addEventListener('click',function(){
  var toUpdate = students.filter(function(s){ return s.roll && !/^KIC00/i.test(s.roll); });
  if (!toUpdate.length) { showToast('All roll numbers already start with KIC00'); return; }
  if (!confirm('Change the roll number of '+toUpdate.length+' student(s) to start with "KIC00"? Since Roll Number is also each student\'s login username, they will need to log in with the new roll number afterward (e.g. GIC1001 -> KIC001001).')) return;
  toUpdate.forEach(function(s){
    var newRoll = withKicPrefix(s.roll);
    if (s.password === s.roll) s.password = newRoll;
    s.roll = newRoll;
  });
  saveStudents();
  renderStudents();
  showToast('Updated ' + toUpdate.length + ' roll number(s) to KIC00');
});

/* ================================================================
   LOGIN UI WIRING (always runs last, no inline handlers needed)
================================================================ */
document.querySelectorAll('.portal-btn').forEach(function(btn){
  btn.addEventListener('click', function(){ selectPortal(btn.dataset.role); });
});
document.getElementById('loginBtn').addEventListener('click', doLogin);
document.getElementById('loginPassword').addEventListener('keydown', function(e){ if(e.key==='Enter') doLogin(); });
document.getElementById('loginUsername').addEventListener('keydown', function(e){ if(e.key==='Enter') document.getElementById('loginPassword').focus(); });
