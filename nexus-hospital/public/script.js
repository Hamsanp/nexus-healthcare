let currentPatientId = null;
window.currentData = [];
let loggedInDoctor = null;

try { loggedInDoctor = JSON.parse(localStorage.getItem('nexusDoctor')); } catch(e) { localStorage.removeItem('nexusDoctor'); }

async function safeFetch(url, options = {}) {
  try {
    const res = await fetch(url, options);
    const text = await res.text(); 
    try {
      const data = JSON.parse(text); 
      if (!res.ok) throw new Error(data.error || `Request failed`);
      return data;
    } catch (parseError) {
      console.error("Server replied with:", text);
      throw new Error("Server error. Press F12 and look in the Console tab for details.");
    }
  } catch (err) {
    if (err.message.includes("Failed to fetch")) throw new Error("Network error. Is Node running?");
    throw new Error(err.message);
  }
}

function getField(p, field) { return p[field] ?? p[field.charAt(0).toUpperCase() + field.slice(1)] ?? ""; }
function getStatus(p) { return (getField(p, 'status') || "").toLowerCase(); }
function titleCase(v) { const s = String(v||"").toLowerCase(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }
function formatDate(val) { if (!val) return "N/A"; const d = new Date(val); return isNaN(d) ? "N/A" : d.toLocaleDateString(); }
function getInitials(name) { return name.split(' ').map(n => n[0]).join('').toUpperCase(); }

function switchTab(tab) {
  document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active-section'));
  document.getElementById(`${tab}-view`).classList.add('active-section');
  document.querySelectorAll('.sidebar nav li').forEach(l => l.classList.remove('active'));
  document.querySelector(`.sidebar nav li[data-tab="${tab}"]`).classList.add('active');
  if (tab === 'dashboard') fetchStats();
  if (tab === 'doctor') checkDoctorLogin();
}

function updateClock() { const el = document.getElementById('clock'); if (el) el.innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
setInterval(updateClock, 1000); updateClock();

async function loginDoctor() {
  const username = document.getElementById('doc-username').value.trim();
  const password = document.getElementById('doc-password').value;
  if (!username || !password) return showToast("Please enter credentials", "error");
  try {
    const data = await safeFetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    localStorage.setItem('nexusDoctor', JSON.stringify(data)); loggedInDoctor = data; checkDoctorLogin(); showToast(`Welcome back, ${data.name}!`, "success");
  } catch (err) { showToast(err.message, "error"); }
}

function logoutDoctor() { localStorage.removeItem('nexusDoctor'); loggedInDoctor = null; checkDoctorLogin(); showToast("Logged out", "info"); }

function checkDoctorLogin() {
  const loginDiv = document.getElementById('doctor-login'); const dashDiv = document.getElementById('doctor-dashboard');
  if (loggedInDoctor) { loginDiv.style.display = 'none'; dashDiv.style.display = 'block'; document.getElementById('doc-welcome').innerText = `Welcome, ${loggedInDoctor.name}`; fetchDoctorPatients(); fetchDoctorAppointments(); fetchDoctorContacts(); } 
  else { loginDiv.style.display = 'flex'; dashDiv.style.display = 'none'; }
}

async function fetchStats() {
  try {
    const data = await safeFetch('/api/stats');
    document.getElementById('doctor-count').innerText = data.doctorsClockedIn; document.getElementById('admitted-count').innerText = data.patientsAdmitted;
    document.getElementById('discharge-count').innerText = data.patientsToDischarge; document.getElementById('stable-count').innerText = data.stableCount;
    document.getElementById('critical-count').innerText = data.criticalCount; document.getElementById('recovering-count').innerText = data.recoveringCount;
    document.getElementById('current-doctor').innerText = data.currentDoctor;
  } catch (err) { showToast(err.message, "error"); }
}

async function fetchDoctorPatients() {
  if (!loggedInDoctor) return;
  try { const data = await safeFetch(`/api/doctors/${loggedInDoctor.username}/patients`); window.currentData = data; renderPatientList(data); } catch (err) { showToast(err.message, "error"); }
}

async function fetchDoctorAppointments() {
  if (!loggedInDoctor) return;
  try { const data = await safeFetch(`/api/doctors/${loggedInDoctor.username}/appointments`); renderAppointmentsList(data); } catch (err) { showToast(err.message, "error"); }
}

async function fetchDoctorContacts() {
  try { const data = await safeFetch('/api/contacts'); renderContactsList(data); } catch (err) { showToast(err.message, "error"); }
}

function renderPatientList(patients) {
  const container = document.getElementById('doctor-patients-list');
  if (!patients.length) { container.innerHTML = `<div class="glass-card" style="padding:20px; text-align:center; color:var(--text-muted)">No patients assigned.</div>`; return; }
  container.innerHTML = patients.map(p => `
    <div class="patient-row" onclick="showDetails('${p._id}')">
      <div class="patient-meta">
        <div class="patient-avatar">${getInitials(getField(p, 'name'))}</div>
        <div style="min-width:0"><div class="patient-name">${getField(p, 'name')}</div><div class="patient-cond">${getField(p, 'condition')}</div></div>
      </div>
      <div class="patient-status status-${getStatus(p)}">${titleCase(getStatus(p))}</div>
    </div>`).join('');
}

function renderAppointmentsList(appts) {
  const container = document.getElementById('doctor-appointments-list');
  if (!appts.length) { container.innerHTML = `<div class="glass-card" style="padding:20px; text-align:center; color:var(--text-muted)">No appointments scheduled.</div>`; return; }
  
  const today = new Date(); today.setHours(0,0,0,0);
  container.innerHTML = appts.map(a => {
    const apptDate = new Date(a.date); apptDate.setHours(0,0,0,0);
    let statusClass = "status-upcoming"; let statusText = "Upcoming";
    if (apptDate.getTime() === today.getTime()) { statusClass = "status-today"; statusText = "Today"; }
    else if (apptDate < today) { statusClass = "status-past"; statusText = "Past"; }
    return `
    <div class="appt-row">
      <div class="appt-meta">
        <div class="appt-avatar"><i class="fas fa-calendar"></i></div>
        <div style="min-width:0"><div class="appt-name">${a.patientName}</div><div class="appt-date">${formatDate(a.date)}</div></div>
      </div>
      <div class="appt-status ${statusClass}">${statusText}</div>
    </div>`;
  }).join('');
}

function renderContactsList(contacts) {
  const container = document.getElementById('doctor-contacts-list');
  if (!contacts.length) { container.innerHTML = `<div class="glass-card" style="padding:20px; text-align:center; color:var(--text-muted)">No messages in the inbox.</div>`; return; }
  container.innerHTML = contacts.map(c => `
    <div class="contact-row">
      <div class="contact-meta">
        <div class="contact-avatar"><i class="fas fa-envelope"></i></div>
        <div style="min-width:0">
          <div class="contact-name">${c.name} <span style="color:var(--text-muted);font-weight:400">&lt;${c.email}&gt;</span></div>
          <div class="contact-msg">${c.message}</div>
        </div>
      </div>
    </div>`).join('');
}

function showDetails(id) {
  currentPatientId = id; const p = window.currentData.find(x => x._id === id); if (!p) return;
  document.getElementById('overlay-name').value = getField(p, 'name'); document.getElementById('overlay-age').value = getField(p, 'age'); 
  document.getElementById('overlay-cond').value = getField(p, 'condition'); document.getElementById('overlay-doc').value = getField(p, 'doctorInCharge'); 
  document.getElementById('overlay-blood').value = getField(p, 'bloodType'); document.getElementById('overlay-status').value = getStatus(p);
  const adm = getField(p, 'dateAdmitted'); const dis = getField(p, 'dateDischarge');
  document.getElementById('overlay-dateAdmitted').value = adm ? new Date(adm).toISOString().split('T')[0] : ""; 
  document.getElementById('overlay-dateDischarge').value = dis ? new Date(dis).toISOString().split('T')[0] : "";
  document.getElementById('overlay').style.display = 'flex';
}
function closeOverlay() { document.getElementById('overlay').style.display = 'none'; currentPatientId = null; }

async function submitOverlayUpdate() {
  if (!currentPatientId) return;
  const body = { name: document.getElementById('overlay-name').value.trim(), age: document.getElementById('overlay-age').value, bloodType: document.getElementById('overlay-blood').value, condition: document.getElementById('overlay-cond').value.trim(), doctorInCharge: document.getElementById('overlay-doc').value, status: document.getElementById('overlay-status').value, dateAdmitted: document.getElementById('overlay-dateAdmitted').value, dateDischarge: document.getElementById('overlay-dateDischarge').value };
  try { await safeFetch(`/api/patients/${currentPatientId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); closeOverlay(); fetchStats(); fetchDoctorPatients(); showToast("Patient updated!", "success"); } catch (err) { showToast(err.message, "error"); }
}

function nextStep(step) { document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active')); document.getElementById(`step-${step}`).classList.add('active'); document.querySelectorAll('.progress-step').forEach((p, i) => p.classList.toggle('active', i < step)); }
function prevStep(step) { nextStep(step); }
function resetAdmissionsForm() { ['p-name','p-age','p-dateAdmitted','p-dateDischarge','p-cond'].forEach(id => document.getElementById(id).value = ''); document.getElementById('p-blood').selectedIndex = 0; document.getElementById('p-doc').selectedIndex = 0; document.getElementById('p-status').selectedIndex = 0; nextStep(1); }

async function addPatient() {
  const name = document.getElementById('p-name').value.trim(); const age = document.getElementById('p-age').value;
  if (!name || !age) { showToast("Name and age are required.", "error"); prevStep(1); return; }
  const body = { name, age, bloodType: document.getElementById('p-blood').value, condition: document.getElementById('p-cond').value.trim(), doctorInCharge: document.getElementById('p-doc').value, status: document.getElementById('p-status').value, dateAdmitted: document.getElementById('p-dateAdmitted').value, dateDischarge: document.getElementById('p-dateDischarge').value };
  try { await safeFetch('/api/patients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); resetAdmissionsForm(); switchTab('dashboard'); showToast("Patient admitted!", "success"); } catch (err) { showToast(err.message, "error"); }
}

async function bookAppointment() {
  const patientName = document.getElementById('appt-name').value.trim(); const date = document.getElementById('appt-date').value; const doctor = document.getElementById('appt-doc').value;
  if (!patientName || !date || !doctor) { showToast("Please fill in all fields.", "error"); return; }
  try { await safeFetch('/api/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patientName, date, doctor }) }); document.getElementById('appt-name').value = ''; document.getElementById('appt-date').value = ''; document.getElementById('appt-doc').selectedIndex = 0; showToast("Appointment booked!", "success"); } catch (err) { showToast(err.message, "error"); }
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById('contact-form');
  if (form) { form.addEventListener("submit", async (e) => { e.preventDefault(); const name = document.getElementById('contact-name').value.trim(); const email = document.getElementById('contact-email').value.trim(); const message = document.getElementById('contact-msg').value.trim(); if (!name || !email || !message) { showToast("Please fill in all fields.", "error"); return; } try { await safeFetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, message }) }); showToast("Message sent to Helpdesk!", "success"); form.reset(); } catch (err) { showToast(err.message, "error"); } }); }
  fetchStats(); setInterval(fetchStats, 30000);
});

function showToast(message, type = "info") { const container = document.getElementById('toast-container'); const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.innerText = message; container.appendChild(toast); setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(40px)'; toast.style.transition = 'all 0.3s'; setTimeout(() => toast.remove(), 300); }, 3500); }