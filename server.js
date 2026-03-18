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

// Serve static files from both root and frontend folder to prevent ENOENT errors
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    // Serve index.html from root
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
    tamil: { type: Number, min: 0, max: 100 },
    english: { type: Number, min: 0, max: 100 },
    maths: { type: Number, min: 0, max: 100 },
    science: { type: Number, min: 0, max: 100 },
    social: { type: Number, min: 0, max: 100 }
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
    sender_id: Number,
    receiver_id: Number,
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

// --- Automatic Task Cleanup Scheduler ---
setInterval(async () => {
    try {
        const tasks = await Task.find();
        const now = new Date();
        const expiredIds = tasks.filter(task => {
            if (!task.due_date || !task.due_time) return false;
            const dueDateTime = new Date(`${task.due_date}T${task.due_time}`);
            return !isNaN(dueDateTime) && dueDateTime < now;
        }).map(task => task._id);

        if (expiredIds.length > 0) {
            await Task.deleteMany({ _id: { $in: expiredIds } });
        }
    } catch (err) {
        console.error('Error auto-deleting expired tasks:', err);
    }
}, 60000); // Check every minute

// --- Robust Database Connection with Retry and SSL fix ---
const connectWithRetry = () => {
    console.log('Attempting to connect to MongoDB Atlas...');
    mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000,
        family: 4,
        tls: true,
        tlsAllowInvalidCertificates: true, // Helps bypass some local network SSL issues
        retryWrites: true
    })
        .then(() => {
            console.log('✅ Connected to MongoDB Atlas');
            seedUsers();
        })
        .catch(err => {
            console.error('❌ MongoDB Connection Error:', err.message);
            if (err.message.includes('querySrv ECONNREFUSED')) {
                console.error('👉 DNS ISSUE: Use the "Standard Connection String" (mongodb://) in your .env');
            } else if (err.message.includes('SSL routines') || err.message.includes('alert number 80')) {
                console.error('👉 SSL ISSUE: Ensure your IP is whitelisted (0.0.0.0/0) in MongoDB Atlas Dashboard.');
            }
            console.log('Retrying in 5 seconds...');
            setTimeout(connectWithRetry, 5000);
        });
};

connectWithRetry();

async function seedUsers() {
    const users = [
        { id: 0, name: 'Teacher', email: 'teacher@school.com', password: 'teacher123', role: 'teacher' },
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
app.get('/api/students', authenticateToken, async (req, res) => {
    try {
        const students = await User.find({ role: 'student' }, 'id name email');
        res.json(students);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const users = await User.find({}, 'id name email role');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/test-scores', authenticateToken, async (req, res) => {
    try {
        const score = await TestScore.create(req.body);
        io.to(`user_${req.body.student_id}`).emit('dataUpdate', { type: 'score' });
        res.json({ success: true, id: score._id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/test-scores', authenticateToken, async (req, res) => {
    try {
        const scores = await TestScore.find().sort({ test_date: -1 });
        res.json(scores);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/attendance', authenticateToken, async (req, res) => {
    const { student_id, attendance_date, attendance_time, status } = req.body;
    try {
        await Attendance.findOneAndUpdate(
            { student_id, attendance_date },
            { attendance_time, status },
            { upsert: true, new: true }
        );

        // New notification logic for attendance
        let remarkText = '';
        const thresholdTime = '10:00:00';
        const dateParts = attendance_date.split('-');
        const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

        if (status === 'absent') {
            remarkText = `❌ ABSENT: You were marked absent on ${formattedDate}. Please contact your teacher if this is a mistake.`;
        } else if (status === 'present') {
            if (attendance_time > thresholdTime) {
                remarkText = `🕒 LATE: You were marked present on ${formattedDate}, but you were late. Punctuality is important.`;
            } else {
                remarkText = `✅ ON TIME: You were marked present on ${formattedDate} with good timing. Keep it up!`;
            }
        }

        if (remarkText) {
            await Remark.create({ student_id: parseInt(student_id, 10), remark: remarkText });
            io.to(`user_${student_id}`).emit('notification', { type: 'remark', message: remarkText });
        }

        io.to(`user_${student_id}`).emit('dataUpdate', { type: 'attendance' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/attendance', authenticateToken, async (req, res) => {
    try {
        const records = await Attendance.find().sort({ attendance_date: -1 });
        res.json(records);
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

app.post('/api/tasks', authenticateToken, async (req, res) => {
    try {
        const task = await Task.create(req.body);
        io.emit('newTask', { name: task.name, due_date: task.due_date });
        res.json({ success: true, id: task._id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
    try {
        await Task.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/remarks', authenticateToken, async (req, res) => {
    try {
        const remark = await Remark.create(req.body);
        io.to(`user_${req.body.student_id}`).emit('notification', { type: 'remark', message: 'You have a new remark.' });
        res.json({ success: true, id: remark._id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/remarks', authenticateToken, async (req, res) => {
    try {
        const remarks = await Remark.find().sort({ created_at: -1 });
        res.json(remarks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Student APIs ---
app.get('/api/test-scores/:studentId', authenticateToken, async (req, res) => {
    try {
        const studentId = parseInt(req.params.studentId, 10);
        if (isNaN(studentId)) {
            return res.status(400).json({ error: 'Invalid student ID' });
        }
        const scores = await TestScore.find({ student_id: studentId }).sort({ test_date: -1 });
        res.json(scores);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/attendance/:studentId', authenticateToken, async (req, res) => {
    try {
        const studentId = parseInt(req.params.studentId, 10);
        if (isNaN(studentId)) {
            return res.status(400).json({ error: 'Invalid student ID' });
        }
        const history = await Attendance.find({ student_id: studentId }).sort({ attendance_date: -1 });
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/remarks/:studentId', authenticateToken, async (req, res) => {
    try {
        const studentId = parseInt(req.params.studentId, 10);
        if (isNaN(studentId)) {
            return res.status(400).json({ error: 'Invalid student ID' });
        }
        const remarks = await Remark.find({ student_id: studentId }).sort({ created_at: -1 });
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
        io.emit('newMaterial', material);
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
        io.emit('deleteMaterial', { id: req.params.id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Messaging ---
app.get('/api/messages/:userId/:peerId', authenticateToken, async (req, res) => {
    try {
        const { userId, peerId } = req.params;
        // Ensure the user is requesting their own messages
        if (req.user.id.toString() !== userId) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const numUserId = parseInt(userId, 10);
        const numPeerId = parseInt(peerId, 10);

        if (isNaN(numUserId) || isNaN(numPeerId)) {
            return res.status(400).json({ error: 'Invalid user or peer ID' });
        }

        const messages = await Message.find({
            $or: [
                { sender_id: numUserId, receiver_id: numPeerId },
                { sender_id: numPeerId, receiver_id: numUserId },
            ]
        }).sort({ timestamp: 'asc' });
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

io.on('connection', (socket) => {
    socket.on('joinRoom', (userId) => {
        socket.join(`user_${userId}`);
    });

    socket.on('sendMessage', async (data) => {
        const { sender_id, receiver_id, message } = data;
        try {
            const newMessage = await Message.create({
                sender_id: parseInt(sender_id, 10),
                receiver_id: parseInt(receiver_id, 10),
                message
            });
            io.to(`user_${receiver_id}`).emit('receiveMessage', newMessage);
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