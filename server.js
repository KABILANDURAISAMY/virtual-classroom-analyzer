require('dotenv').config();
const dns = require('dns');
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');

// Force use of Google DNS to resolve MongoDB SRV records (fixes querySrv ECONNREFUSED)
dns.setServers(['8.8.8.8', '8.8.4.4']);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());

// Serve static files (index.html, etc.) from the current directory
app.use(express.static(__dirname));

// Route for the root to ensure index.html is served
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- MongoDB Schemas ---
const UserSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String,
    email: { type: String, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['teacher', 'student'] }
});
const User = mongoose.model('User', UserSchema);

const AttendanceSchema = new mongoose.Schema({
    student_id: Number,
    attendance_date: String,
    attendance_time: String,
    status: { type: String, enum: ['present', 'absent'] }
});
const Attendance = mongoose.model('Attendance', AttendanceSchema);

const TestScoreSchema = new mongoose.Schema({
    student_id: Number,
    test_date: String,
    tamil: Number,
    english: Number,
    maths: Number,
    science: Number,
    social: Number
});
const TestScore = mongoose.model('TestScore', TestScoreSchema);

const TaskSchema = new mongoose.Schema({
    name: String,
    description: String,
    due_date: String,
    due_time: String,
    teacher_id: Number
});
const Task = mongoose.model('Task', TaskSchema);

const StudyMaterialSchema = new mongoose.Schema({
    name: String,
    description: String,
    link: String,
    created_at: { type: Date, default: Date.now }
});
const StudyMaterial = mongoose.model('StudyMaterial', StudyMaterialSchema);

const MessageSchema = new mongoose.Schema({
    sender_id: String,
    receiver_id: String,
    message: String,
    timestamp: { type: Date, default: Date.now },
    is_read: { type: Boolean, default: false }
});
const Message = mongoose.model('Message', MessageSchema);

const RemarkSchema = new mongoose.Schema({
    student_id: Number,
    remark: String,
    created_at: { type: Date, default: Date.now }
});
const Remark = mongoose.model('Remark', RemarkSchema);

// --- Robust Database Connection with Retry ---
const connectWithRetry = () => {
    console.log('Attempting to connect to MongoDB Atlas...');
    mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000, // Increase timeout to 10 seconds
        family: 4, // Force IPv4 to resolve DNS issues like ECONNREFUSED
        tls: true,
        tlsAllowInvalidCertificates: false, // Ensure we verify the server certificate
        retryWrites: true
    })
        .then(() => {
            console.log('✅ Connected to MongoDB Atlas');
            seedUsers();
        })
        .catch(err => {
            console.error('❌ MongoDB connection error:', err.message);
            if (err.message.includes('querySrv ECONNREFUSED')) {
                console.error('👉 ANALYSIS: Your network is blocking MongoDB SRV records.');
                console.error('👉 SOLUTION: Use the "Standard Connection String" in your .env file.');
                console.error('   Go to Atlas > Connect > Drivers > Choose Node.js v2.2.12 (Standard).');
            } else if (err.message.includes('SSL routines') || err.message.includes('alert number 80')) {
                console.error('👉 ANALYSIS: SSL Handshake Failed (Alert 80).');
                console.error('👉 SOLUTION: This usually means your IP is not whitelisted in Atlas.');
                console.error('   Please go to Atlas Dashboard > Network Access > Add IP: 0.0.0.0/0');
            }
            console.log('Retrying in 5 seconds...');
            setTimeout(connectWithRetry, 5000);
        });
};

connectWithRetry();

async function seedUsers() {
    const users = [
        { id: 0, name: 'Admin Teacher', email: 'teacher@school.com', password: 'teacher123', role: 'teacher' },
        { id: 1, name: 'Deepika', email: 'deepika@student.com', password: '123', role: 'student' },
        { id: 2, name: 'Kabi', email: 'kabi@student.com', password: '234', role: 'student' },
        { id: 3, name: 'Kamali', email: 'kamali@student.com', password: '345', role: 'student' },
        { id: 4, name: 'Prasanna', email: 'prasanna@student.com', password: '456', role: 'student' },
        { id: 5, name: 'Vaishu', email: 'vaishu@student.com', password: '567', role: 'student' }
    ];

    for (let u of users) {
        const exists = await User.findOne({ email: u.email });
        if (!exists) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(u.password, salt);
            await User.create({ ...u, password: hashedPassword });
            console.log(`Created user: ${u.email}`);
        }
    }
}

// --- Middleware ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- Authentication APIs ---
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ success: false, message: 'User not found' });

        const validPass = await bcrypt.compare(password, user.password);
        if (!validPass) return res.status(400).json({ success: false, message: 'Invalid password' });

        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
        res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- Teacher APIs ---

// Get all students (for teacher dashboard)
app.get('/api/students', authenticateToken, async (req, res) => {
    try {
        const students = await User.find({ role: 'student' }, 'id name email');
        res.json(students);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add Test Score
app.post('/api/test-scores', authenticateToken, async (req, res) => {
    try {
        const score = await TestScore.create(req.body);
        io.emit('dataUpdate', { type: 'score', student_id: req.body.student_id });
        res.json({ success: true, id: score._id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Mark Attendance
app.post('/api/attendance', authenticateToken, async (req, res) => {
    const { student_id, attendance_date, attendance_time, status } = req.body;
    try {
        await Attendance.findOneAndUpdate(
            { student_id, attendance_date },
            { attendance_time, status },
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/attendance/date/:date', authenticateToken, async (req, res) => {
    try {
        const records = await Attendance.find({ attendance_date: req.params.date });
        res.json(records);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add Task
app.post('/api/tasks', authenticateToken, async (req, res) => {
    try {
        const task = await Task.create(req.body);
        io.emit('newTask', { name: task.name, due_date: task.due_date });
        res.json({ success: true, id: task._id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add Remark
app.post('/api/remarks', authenticateToken, async (req, res) => {
    try {
        const remark = await Remark.create(req.body);
        io.emit('notification', { student_id: req.body.student_id, type: 'remark' });
        res.json({ success: true, id: remark._id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Student APIs ---

app.get('/api/test-scores/:studentId', authenticateToken, async (req, res) => {
    try {
        const scores = await TestScore.find({ student_id: req.params.studentId }).sort({ test_date: -1 });
        res.json(scores);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/attendance/:studentId', authenticateToken, async (req, res) => {
    try {
        const history = await Attendance.find({ student_id: req.params.studentId }).sort({ attendance_date: -1 });
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/remarks/:studentId', authenticateToken, async (req, res) => {
    try {
        const remarks = await Remark.find({ student_id: req.params.studentId }).sort({ created_at: -1 });
        res.json(remarks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/remarks/:id', authenticateToken, async (req, res) => {
    try {
        await Remark.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/students/:studentId/remarks', authenticateToken, async (req, res) => {
    try {
        await Remark.deleteMany({ student_id: req.params.studentId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/tasks', authenticateToken, async (req, res) => {
    try {
        const tasks = await Task.find().sort({ due_date: 1 });
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Study Materials ---
app.post('/api/study-materials', authenticateToken, async (req, res) => {
    try {
        const material = await StudyMaterial.create(req.body);
        res.json({ success: true, id: material._id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/study-materials', authenticateToken, async (req, res) => {
    try {
        const materials = await StudyMaterial.find().sort({ created_at: -1 });
        res.json(materials);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/study-materials/:id', authenticateToken, async (req, res) => {
    try {
        await StudyMaterial.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Messaging (Real-time with Socket.IO) ---
io.on('connection', (socket) => {
    socket.on('joinRoom', (userId) => {
        socket.join(`user_${userId}`);
    });

    socket.on('sendMessage', async (data) => {
        const { sender_id, receiver_id, message } = data;
        try {
            await Message.create({ sender_id, receiver_id, message });
            io.to(`user_${receiver_id}`).emit('receiveMessage', data);
        } catch (err) {
            console.error('Message error:', err);
        }
    });
});

const startServer = (port) => {
    server.listen(port)
        .once('listening', () => {
            console.log(`✅ Server running on port ${port}`);
            console.log(`🚀 Access the site at http://localhost:${port}`);
        })
        .once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`⚠️  Port ${port} is busy, trying ${port + 1}...`);
                startServer(port + 1);
            } else {
                console.error('❌ Server error:', err);
                process.exit(1);
            }
        });
};

const initialPort = parseInt(process.env.PORT) || 5000;
startServer(initialPort);