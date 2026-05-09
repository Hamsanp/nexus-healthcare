const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PatientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  age: { type: Number, required: true, min: 0, max: 150 },
  bloodType: { type: String, trim: true, default: 'N/A' },
  condition: { type: String, trim: true, default: 'General Checkup' },
  doctorInCharge: { type: String, trim: true, default: 'Unassigned' },
  status: { type: String, enum: ['stable', 'critical', 'recovering'], default: 'stable', lowercase: true },
  dateAdmitted: { type: Date, default: Date.now },
  dateDischarge: { type: Date },
  lastUpdated: { type: Date, default: Date.now }
});
PatientSchema.pre('findOneAndUpdate', function(next) { this.set({ lastUpdated: new Date() }); next(); });
const Patient = mongoose.model('Patient', PatientSchema);

const AppointmentSchema = new mongoose.Schema({
  patientName: { type: String, required: true, trim: true },
  doctor: { type: String, required: true, trim: true },
  date: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});
const Appointment = mongoose.model('Appointment', AppointmentSchema);

const ContactSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now }
});
const Contact = mongoose.model('Contact', ContactSchema);

const DoctorSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  name: { type: String, required: true, trim: true }
});
const Doctor = mongoose.model('Doctor', DoctorSchema);

const sanitizeBody = (req, res, next) => {
  Object.keys(req.body).forEach(key => { if (req.body[key] === '') delete req.body[key]; });
  next();
};

// Prevent crashes if DB disconnects
const checkDB = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: 'Database is not connected. Please check your MongoDB terminal.' });
  }
  next();
};

app.post('/api/auth/login', checkDB, async (req, res) => {
  try {
    const { username, password } = req.body;
    const doctor = await Doctor.findOne({ username, password });
    if (!doctor) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ id: doctor._id, username: doctor.username, name: doctor.name });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/stats', checkDB, async (req, res) => {
  try {
    const [doctorsClockedIn, patientsAdmitted, stableCount, criticalCount, recoveringCount] = await Promise.all([
      Patient.distinct("doctorInCharge").then(d => d.length), Patient.countDocuments(),
      Patient.countDocuments({ status: "stable" }), Patient.countDocuments({ status: "critical" }), Patient.countDocuments({ status: "recovering" }),
    ]);
    const today = new Date(); today.setHours(23, 59, 59, 999);
    const patientsToDischarge = await Patient.countDocuments({ dateDischarge: { $lte: today }, status: { $in: ['stable', 'recovering'] } });
    const hour = new Date().getHours();
    let currentDoctor;
    if (hour >= 6  && hour < 12) currentDoctor = "Dr. Vedhya";
    else if (hour >= 12 && hour < 18) currentDoctor = "Dr. Riya";
    else if (hour >= 18 && hour < 24) currentDoctor = "Dr. Aaradhya";
    else currentDoctor = "Dr. Nirved";
    res.json({ doctorsClockedIn, patientsAdmitted, patientsToDischarge, stableCount, criticalCount, recoveringCount, currentDoctor });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/patients', checkDB, sanitizeBody, async (req, res) => {
  try { const p = new Patient(req.body); await p.save(); res.status(201).json(p); } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/doctors/:username/patients', checkDB, async (req, res) => {
  try { const patients = await Patient.find({ doctorInCharge: req.params.username }).sort({dateAdmitted: -1}); res.json(patients); } catch (err) { res.status(500).json({ error: err.message }); }
});

// NEW: Get Appointments for a specific doctor
app.get('/api/doctors/:username/appointments', checkDB, async (req, res) => {
  try { const appts = await Appointment.find({ doctor: req.params.username }).sort({ date: 1 }); res.json(appts); } catch (err) { res.status(500).json({ error: err.message }); }
});

// NEW: Get all Contacts for the shared helpdesk inbox
app.get('/api/contacts', checkDB, async (req, res) => {
  try { const msgs = await Contact.find().sort({ createdAt: -1 }).limit(30); res.json(msgs); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/patients/:id', checkDB, sanitizeBody, async (req, res) => {
  try { const updated = await Patient.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }); if (!updated) return res.status(404).json({ error: 'Not found' }); res.json(updated); } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/patients/:id', checkDB, async (req, res) => {
  try { await Patient.findByIdAndDelete(req.params.id); res.json({ message: 'Removed' }); } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/appointments', checkDB, sanitizeBody, async (req, res) => {
  try { const appt = new Appointment(req.body); await appt.save(); res.status(201).json(appt); } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/contacts', checkDB, async (req, res) => {
  try { const msg = new Contact(req.body); await msg.save(); res.status(201).json({ message: 'Sent' }); } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/seed', checkDB, async (req, res) => {
  try {
    await Patient.deleteMany({}); await Doctor.deleteMany({}); await Appointment.deleteMany({}); await Contact.deleteMany({});
    await Doctor.insertMany([
      { username: "nirved", password: "nirved123", name: "Dr. Nirved" },
      { username: "riya", password: "riya123", name: "Dr. Riya" },
      { username: "aaradhya", password: "aaradhya123", name: "Dr. Aaradhya" },
      { username: "vedhya", password: "vedhya123", name: "Dr. Vedhya" }
    ]);
    await Patient.insertMany([
      { name: "John Doe", age: 45, bloodType: "O+", condition: "Fracture", doctorInCharge: "nirved", status: "stable", dateDischarge: new Date() },
      { name: "Jane Smith", age: 32, bloodType: "A-", condition: "Flu", doctorInCharge: "riya", status: "recovering" },
      { name: "Mike Johnson", age: 58, bloodType: "B+", condition: "Surgery", doctorInCharge: "aaradhya", status: "critical" },
      { name: "Emily Davis", age: 28, bloodType: "AB+", condition: "Appendicitis", doctorInCharge: "vedhya", status: "stable" }
    ]);
    // Seed some appointments and contacts for the doctor portal
    await Appointment.insertMany([
      { patientName: "Sam Wilson", doctor: "nirved", date: new Date(Date.now() + 86400000) }, // Tomorrow
      { patientName: "Sarah Connor", doctor: "nirved", date: new Date(Date.now() + 172800000) }, // Day after
      { patientName: "Peter Parker", doctor: "riya", date: new Date() }
    ]);
    await Contact.insertMany([
      { name: "General Inquiry", email: "user@test.com", message: "What are the visiting hours?" },
      { name: "Feedback", email: "patient@test.com", message: "Great service from Dr. Aaradhya!" }
    ]);

    res.send('<h1>Database Seeded!</h1><p>Close this tab and go to http://localhost:5000</p>');
  } catch (err) { res.status(500).send('Error seeding database: ' + err.message); }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found' }));
app.use((req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

const PORT = process.env.PORT || 5000;
// Use cloud database if available, otherwise use local database
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/health_nexus';

// Use cloud database if available, otherwise use local database
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/health_nexus';

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected successfully");
    app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error("❌ FATAL ERROR: Could not connect to MongoDB.");
    console.error("👉 Make sure your other terminal with 'mongod' is still running!");
    console.error(err.message);
    process.exit(1);
  });