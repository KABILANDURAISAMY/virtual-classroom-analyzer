// --- Configuration & State ---
const API_BASE = '/api';
const token = localStorage.getItem('token');
const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
let notifications = [];
let studentScores = [];
let studentAttendanceData = [];
let socket;
let unreadMessages = 0;
const TEACHER_ID = 0; // Teacher ID is fixed as 0

// --- DOM Elements ---
let notificationList;
let logoutButton;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Inject Google Font 'Inter' for professional look
    const fontLink = document.createElement('link');
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap';
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);

    const style = document.createElement('style');
    style.innerHTML = `
        :root {
            --primary: #4f46e5;
            --bg-body: #f8fafc;
            --bg-surface: #ffffff;
            --text-main: #0f172a;
            --text-muted: #64748b;
            --border: #e2e8f0;
            --success: #10b981;
            --danger: #ef4444;
            --warning: #f59e0b;
            --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        }
        body {
            font-family: 'Outfit', sans-serif !important;
            background-color: var(--bg-body);
            color: var(--text-main);
            margin: 0;
        }
        h1, h2, h3, h4 { letter-spacing: -0.02em; }
        
        /* Enhanced Card Style */
        .notification-item, .task-item, .material-card {
            background: var(--bg-surface);
            border: 1px solid var(--border);
            box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.05);
            transition: all 0.2s ease;
        }
        .notification-item:hover, .task-item:hover, .material-card:hover {
            transform: translateY(-2px);
            box-shadow: var(--shadow);
        }

        /* Modern Chat Bubbles */
        .message-bubble {
            max-width: 80%;
            padding: 12px 16px;
            border-radius: 16px;
            margin-bottom: 8px;
            position: relative;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .message-bubble.sent {
            background: var(--primary);
            color: white;
            align-self: flex-end;
            border-bottom-right-radius: 4px;
        }
        .message-bubble.received {
            background: white;
            color: var(--text-main);
            align-self: flex-start;
            border-bottom-left-radius: 4px;
            border: 1px solid var(--border);
        }

        /* Buttons */
        button { cursor: pointer; transition: opacity 0.2s; }
        button:active { transform: scale(0.98); }
    `;
    document.head.appendChild(style);

    if (!token || currentUser.role !== 'student') {
        alert('Authentication error or invalid role. Please log in again.');
        window.location.href = 'index.html';
        return;
    }

    notificationList = document.getElementById('notificationList');
    logoutButton = document.getElementById('logoutButton');

    updateUserInfo();
    setupEventListeners();
    
    // Load all data immediately
    fetchNotifications();
    fetchScores();
    fetchRankings();
    fetchAttendance();
    fetchTasks();
    fetchMaterials();
    initializeSocket();
    fetchUnreadMessagesCount();
});

function setupEventListeners() {
    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'index.html';
    });

    // Modal Closing Logic
    document.querySelector('.close-modal').addEventListener('click', () => {
        document.getElementById('scoreModal').classList.remove('active');
    });
    window.onclick = function(event) {
        const modal = document.getElementById('scoreModal');
        if (event.target == modal) modal.classList.remove('active');
    }
    
    // Chat Modal Close
    document.querySelector('.close-chat').addEventListener('click', () => {
        document.getElementById('chatModal').classList.remove('active');
    });
    
    // Chat Enter Key
    document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
}

function initializeSocket() {
    socket = io();
    socket.on('connect', () => {
        console.log('Connected to server socket.');
        socket.emit('joinRoom', currentUser.id);
    });

    socket.on('notification', (data) => {
        console.log('Received notification:', data);
        // Create a fake remark object to display
        const newNotification = {
            remark: data.message,
            created_at: new Date().toISOString()
        };
        notifications.unshift(newNotification);
        renderNotifications();
        alert(`New Notification: ${data.message}`);
    });

    socket.on('receiveMessage', (msg) => {
        // If chat modal is open, append message
        const modal = document.getElementById('chatModal');
        if (modal.classList.contains('active')) {
             appendMessage(msg);
        } else {
            // Notify user of new message
            const newNotification = { remark: '💬 You have a new message from the Teacher.', created_at: new Date().toISOString() };
            notifications.unshift(newNotification);
            renderNotifications();
            
            // New count logic
            unreadMessages++;
            updateChatNotificationCount();
        }
    });

    socket.on('dataUpdate', (data) => {
        if (data.type === 'score') {
            // The specific notification is now sent via the 'notification' event.
            // This event just triggers a data refresh.
            fetchScores(); // Refresh scores table
            fetchRankings(); // Refresh rankings
            fetchNotifications(); // Refresh notifications list to see the new remark immediately
        }
        if (data.type === 'attendance') {
            // This is handled by the 'notification' event which is more specific
        }
    });

    socket.on('newTask', (task) => {
        const newNotification = {
            remark: `📝 New Task Added: "${task.name}" due on ${task.due_date}.`,
            created_at: new Date().toISOString()
        };
        notifications.unshift(newNotification);
        renderNotifications();
        fetchTasks(); // Refresh tasks list
        alert('A new task has been assigned!');
    });

    socket.on('newMaterial', (material) => {
        const newNotification = {
            remark: `📚 New Study Material: "${material.name}" is now available.`,
            created_at: new Date().toISOString()
        };
        notifications.unshift(newNotification);
        renderNotifications();
        fetchMaterials(); // Refresh materials list
        alert('New study material has been uploaded!');
    });
}

function updateUserInfo() {
    document.querySelector('.user-name').textContent = currentUser.name || 'Student';
    document.querySelector('.user-email').textContent = currentUser.email || '';
}

async function apiFetch(url, options = {}) {
    const defaultHeaders = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
    const response = await fetch(url, {
        ...options,
        headers: { ...defaultHeaders, ...options.headers }
    });
    if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
    }
    const text = await response.text();
    if (!text) {
        return {};
    }
    return JSON.parse(text);
}

// --- Notification Functions ---
async function fetchNotifications() {
    if (!notificationList) return;
    notificationList.innerHTML = '<p>Loading notifications...</p>';
    try {
        // Remarks are used as notifications
        notifications = await apiFetch(`${API_BASE}/remarks/${currentUser.id}`);
        renderNotifications();
    } catch (error) {
        console.error('Failed to fetch notifications:', error);
        notificationList.innerHTML = '<p class="error-message">Could not load notifications.</p>';
    }
}

function renderNotifications() {
    if (!notificationList) return;

    if (notifications.length === 0) {
        notificationList.innerHTML = '<p>No notifications yet.</p>';
        return;
    }

    notificationList.innerHTML = notifications.map((notif, index) => {
        const { color, icon } = getNotificationStyle(notif.remark);
        
        let title = 'Notification';
        let message = notif.remark;

        if (message.includes('OVERALL:')) {
            title = 'Score Update';
        } else if (message.includes('ABSENT')) {
            title = 'Attendance Alert';
        } else if (message.includes('LATE') || message.includes('ON TIME')) {
            title = 'Attendance Update';
        } else if (message.includes('Task')) {
            title = 'New Task';
        } else if (message.includes('Material')) {
            title = 'New Material';
        } else if (message.includes('message')) {
            title = 'New Message';
        }

        return `
            <div class="notification-item" style="background: var(--bg-surface); border-left: 4px solid ${color}; border-radius: 12px; margin-bottom: 12px; padding: 18px; display: flex; align-items: flex-start;">
                <div class="notif-icon" style="color: ${color}; margin-right: 16px; font-size: 1.2rem; width: 30px; text-align: center; padding-top: 2px;">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="notif-content" style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h4 style="margin: 0 0 4px; font-size: 0.95rem; font-weight: 700; color: var(--text-main);">${title}</h4>
                        <button class="delete-notif-btn" onclick="deleteNotification(${index})" title="Dismiss" style="background: transparent; border: none; color: #9ca3af; cursor: pointer; font-size: 1rem;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <p style="margin: 0 0 8px; font-size: 0.9rem; color: var(--text-muted); line-height: 1.5;">${message}</p>
                    <small style="font-size: 0.75rem; color: #9ca3af;">${new Date(notif.created_at).toLocaleString()}</small>
                </div>
            </div>
        `;
    }).join('');
}

function getNotificationStyle(remark) {
    // Use keywords for styling: 📈 📉 📊 👍 👎 🏁 ✅ ❌ 🕒 📝 📚 💬
    if (remark.includes('📈') || remark.includes('IMPROVEMENT')) return { color: 'var(--success)', icon: 'fa-arrow-trend-up' };
    if (remark.includes('📉') || remark.includes('DECLINE')) return { color: 'var(--danger)', icon: 'fa-arrow-trend-down' };
    if (remark.includes('📊') || remark.includes('STEADY')) return { color: 'var(--info)', icon: 'fa-chart-line' };
    if (remark.includes('ABSENT')) return { color: 'var(--danger)', icon: 'fa-user-slash' };
    if (remark.includes('LATE')) return { color: 'var(--warning)', icon: 'fa-clock' };
    if (remark.includes('ON TIME')) return { color: 'var(--success)', icon: 'fa-check-circle' };
    if (remark.includes('Task') || remark.includes('📝')) return { color: 'var(--purple)', icon: 'fa-tasks' };
    if (remark.includes('Material') || remark.includes('📚')) return { color: '#a855f7', icon: 'fa-book' };
    if (remark.includes('message') || remark.includes('💬')) return { color: 'var(--sky)', icon: 'fa-comments' };
    return { color: 'var(--text-light)', icon: 'fa-info-circle' };
}

window.deleteNotification = async function(index) {
    const notif = notifications[index];
    
    // If it's a persisted remark (has _id), delete from server
    if (notif._id) {
        try {
            await apiFetch(`${API_BASE}/remarks/${notif._id}`, { method: 'DELETE' });
        } catch (error) {
            console.error('Error deleting remark:', error);
            return alert('Failed to delete remark.');
        }
    }
    
    // Remove from local list and re-render
    notifications.splice(index, 1);
    renderNotifications();
}

// --- Data Rendering Functions ---

async function fetchScores() {
    const container = document.getElementById('scoresContainer');
    if(!container) return;
    
    try {
        studentScores = await apiFetch(`${API_BASE}/test-scores/${currentUser.id}`);
        if(studentScores.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:var(--text-light); padding:20px;">No scores available.</p>';
            return;
        }
        
        container.innerHTML = `
            <table class="mini-table" style="width:100%; border-collapse:separate; border-spacing:0 8px;">
                <thead><tr><th style="text-align:left; color:#94a3b8; font-weight:600; padding:0 10px;">Date</th><th style="color:#94a3b8; font-weight:600;">Average</th><th></th></tr></thead>
                <tbody>
                    ${studentScores.map((s, index) => {
                        const avg = Math.round((s.maths + s.science + s.social + s.tamil + s.english) / 5);
                        const bgColor = avg >= 75 ? '#dcfce7' : (avg >= 40 ? '#fef3c7' : '#fee2e2');
                        const textColor = avg >= 75 ? '#15803d' : (avg >= 40 ? '#b45309' : '#b91c1c');
                        return `
                            <tr style="background:white; box-shadow:0 1px 2px rgba(0,0,0,0.05); border-radius:8px;">
                                <td style="padding:12px; border-radius:8px 0 0 8px; font-weight:500;">${s.test_date}</td>
                                <td style="text-align:center;"><span class="score-pill" style="background:${bgColor}; color:${textColor}; padding:4px 12px; border-radius:20px; font-weight:700; font-size:0.85rem;">${avg}%</span></td>
                                <td style="text-align:right; padding-right:12px; border-radius:0 8px 8px 0;"><button class="view-btn" onclick="openScoreModal(${index})" style="background:transparent; color:#4f46e5; border:none; font-weight:600; font-size:0.85rem;">View</button></td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    } catch(e) { console.error(e); }
}

async function fetchRankings() {
    const container = document.getElementById('rankingContainer');
    if(!container) return;

    try {
        // Fetch ALL scores and students to calculate rankings and names
        const [allScores, allStudents] = await Promise.all([
            apiFetch(`${API_BASE}/test-scores`),
            apiFetch(`${API_BASE}/students`)
        ]);
        
        if (allScores.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-light);">No data for rankings.</p>';
            return;
        }

        // Map student IDs to names
        const studentNames = {};
        if (allStudents) {
            allStudents.forEach(s => studentNames[s.id] = s.name);
        }

        // 1. Group scores by student and sum up subject totals
        const studentStats = {};
        const subjects = ['tamil', 'english', 'maths', 'science', 'social'];

        allScores.forEach(score => {
            if (!studentStats[score.student_id]) {
                studentStats[score.student_id] = {};
                subjects.forEach(sub => studentStats[score.student_id][sub] = { total: 0, count: 0 });
            }
            subjects.forEach(sub => {
                if (score[sub] !== undefined && score[sub] !== null) {
                    studentStats[score.student_id][sub].total += Number(score[sub]);
                    studentStats[score.student_id][sub].count += 1;
                }
            });
        });

        // 2. Calculate Rankings for each subject
        let rankingHtml = '<table class="mini-table" style="width:100%; border-collapse:separate; border-spacing:0 8px;"><thead><tr><th style="text-align:left; color:#94a3b8; padding:0 10px;">Subject</th><th>My Avg</th><th>Rank</th><th style="text-align:right; padding-right:10px;">Topper</th></tr></thead><tbody>';

        subjects.forEach(subject => {
            // Create an array of {id, avg} for this subject
            const subjectRankings = Object.keys(studentStats).map(id => {
                const data = studentStats[id][subject];
                const avg = data.count > 0 ? Math.round(data.total / data.count) : 0;
                return { id: parseInt(id), avg: avg };
            });

            // Sort descending by average
            subjectRankings.sort((a, b) => b.avg - a.avg);

            // Find current user's rank
            const myRankIndex = subjectRankings.findIndex(s => s.id === currentUser.id);
            
            if (myRankIndex !== -1) {
                const myStat = subjectRankings[myRankIndex];
                const rank = myRankIndex + 1;
                
                let badgeClass = 'rank-other';
                let icon = 'fa-medal';
                if (rank === 1) { badgeClass = 'rank-1'; icon = 'fa-trophy'; }
                else if (rank === 2) { badgeClass = 'rank-2'; }
                else if (rank === 3) { badgeClass = 'rank-3'; }

                const topStudent = subjectRankings[0];
                const topName = studentNames[topStudent.id] || `ID: ${topStudent.id}`;
                const topDisplay = topStudent.id === currentUser.id ? 'You' : topName;

                rankingHtml += `
                    <tr style="background:white; box-shadow:0 1px 2px rgba(0,0,0,0.05); border-radius:8px;">
                        <td style="text-transform:capitalize; font-weight:600; padding:12px; border-radius:8px 0 0 8px;">${subject}</td>
                        <td style="text-align:center; font-weight:500;">${myStat.avg}%</td>
                        <td style="text-align:center;"><span class="rank-badge ${badgeClass}" style="font-size:0.85rem; padding:4px 8px; border-radius:6px; background:#f1f5f9;"><i class="fas ${icon}" style="margin-right:4px;"></i> ${rank}</span></td>
                        <td style="text-align:right; padding:12px; border-radius:0 8px 8px 0;"><small style="color:#64748b; font-weight:600;">${topDisplay} (${topStudent.avg}%)</small></td>
                    </tr>
                `;
            }
        });

        rankingHtml += '</tbody></table>';
        container.innerHTML = rankingHtml;

    } catch (e) {
        console.error('Error calculating rankings:', e);
        container.innerHTML = '<p class="error-message">Could not load rankings.</p>';
    }
}

window.openScoreModal = function(index) {
    const score = studentScores[index];
    if(!score) return;
    
    const modal = document.getElementById('scoreModal');
    const dateEl = document.getElementById('modalDate');
    const contentEl = document.getElementById('modalScoreDetails');
    
    dateEl.innerHTML = `<i class="fas fa-calendar-alt" style="color:#4f46e5;margin-right:10px;"></i> ${score.test_date}`;
    
    const total = score.maths + score.science + score.social + score.tamil + score.english;
    const avg = Math.round(total / 5);
    
    contentEl.innerHTML = `
        <div class="detail-row"><span>Tamil</span> <span>${score.tamil}</span></div>
        <div class="detail-row"><span>English</span> <span>${score.english}</span></div>
        <div class="detail-row"><span>Maths</span> <span>${score.maths}</span></div>
        <div class="detail-row"><span>Science</span> <span>${score.science}</span></div>
        <div class="detail-row"><span>Social</span> <span>${score.social}</span></div>
    `;
    
    modal.classList.add('active');
}

async function fetchAttendance() {
    const container = document.getElementById('attendanceContainer');
    if(!container) return;
    
    try {
        studentAttendanceData = await apiFetch(`${API_BASE}/attendance/${currentUser.id}`);
        const present = studentAttendanceData.filter(a => a.status === 'present').length;
        const total = studentAttendanceData.length;
        const absent = total - present;
        const percent = total > 0 ? Math.round((present / total) * 100) : 0;
        
        container.innerHTML = `
            <div class="att-stat">
                <div class="att-number">${percent}%</div>
                <div class="att-label">Attendance Rate</div>
            </div>
            <div class="att-btn-container">
                <button class="att-btn present-btn" onclick="filterAttendance('present')">
                    <i class="fas fa-check"></i> Present (${present})
                </button>
                <button class="att-btn absent-btn" onclick="filterAttendance('absent')">
                    <i class="fas fa-times"></i> Absent (${absent})
                </button>
            </div>
            <div id="attendanceDetailsList" class="att-details-list">
                <p style="text-align:center; color:var(--text-light); font-size:0.85rem; padding:10px;">Select a status above to view details.</p>
            </div>
        `;
    } catch(e) { console.error(e); }
}

window.filterAttendance = function(status) {
    const list = document.getElementById('attendanceDetailsList');
    if (!list) return;

    const filtered = studentAttendanceData.filter(a => a.status === status);
    
    list.innerHTML = filtered.length > 0 ? filtered.map(a => `
        <div class="att-record">
            <strong><i class="far fa-calendar-alt"></i> ${a.attendance_date}</strong>
            ${status === 'present' ? `<span><i class="far fa-clock"></i> ${a.attendance_time || 'N/A'}</span>` : ''}
        </div>`).join('') : `<p style="text-align:center; padding:15px; color:var(--text-light); font-size:0.9rem;">No records found for ${status}.</p>`;
}

async function fetchTasks() {
    const container = document.getElementById('tasksContainer');
    if(!container) return;
    
    try {
        const tasks = await apiFetch(`${API_BASE}/tasks`); // In real app, might need to filter by student/group
        if(tasks.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:var(--text-light); padding:20px;">No pending tasks.</p>';
            return;
        }
        container.innerHTML = tasks.map(t => `
            <div class="task-item" style="padding:16px; margin-bottom:12px; border-radius:12px; border-left:4px solid var(--primary);">
                <h4 style="margin:0 0 8px; font-size:1rem; font-weight:700;">${t.name}</h4>
                <div class="task-meta" style="display:flex; gap:12px; font-size:0.85rem; color:var(--text-muted);">
                    <span style="background:#f1f5f9; padding:4px 8px; border-radius:4px;"><i class="far fa-calendar"></i> ${t.due_date}</span>
                    <span style="background:#f1f5f9; padding:4px 8px; border-radius:4px;"><i class="far fa-clock"></i> ${t.due_time}</span>
                </div>
            </div>
        `).join('');
    } catch(e) { console.error(e); }
}

// --- Chat Functions ---
window.openChatModal = async function() {
    const modal = document.getElementById('chatModal');
    modal.classList.add('active');

    // Save last read time to local storage for persistence
    localStorage.setItem('lastChatReadTime', new Date().toISOString());

    // Inject Delete Chat Button if it doesn't exist
    const header = modal.querySelector('.modal-header');
    if (header && !header.querySelector('.student-clear-chat')) {
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
        deleteBtn.className = 'student-clear-chat';
        deleteBtn.type = 'button'; // Prevent form submission
        deleteBtn.title = 'Clear Chat History';
        
        // Insert before the close button
        const closeBtn = modal.querySelector('.close-chat') || header.lastElementChild;
        if (closeBtn) {
            header.insertBefore(deleteBtn, closeBtn);
        } else {
            header.appendChild(deleteBtn);
        }
        
        deleteBtn.onclick = (e) => {
            e.preventDefault();
            window.clearStudentChat();
        };
    }

    // Reset unread count and hide notification
    unreadMessages = 0;
    updateChatNotificationCount();

    await fetchChatHistory();
    scrollToBottom();
}

window.clearStudentChat = async function() {
    if (currentUser.id === undefined || currentUser.id === null) {
        alert('Session invalid. Please log in again.');
        return;
    }

    if (!confirm('Are you sure you want to delete your chat history with the teacher? This cannot be undone.')) return;
    try {
        await apiFetch(`${API_BASE}/messages/${currentUser.id}/${TEACHER_ID}`, { method: 'DELETE' }); // TEACHER_ID is 0
        document.getElementById('chatMessages').innerHTML = '<p style="text-align:center;color:#94a3b8; margin-top: 50px;">Chat history cleared.</p>';
    } catch (e) {
        console.error(e);
        alert('Failed to clear chat.');
    }
}

async function fetchUnreadMessagesCount() {
    try {
        const messages = await apiFetch(`${API_BASE}/messages/${currentUser.id}/${TEACHER_ID}`);
        const lastRead = localStorage.getItem('lastChatReadTime');
        
        if (messages && messages.length > 0) {
            if (lastRead) {
                // Count messages from teacher that are newer than last read time
                unreadMessages = messages.filter(m => m.sender_id === TEACHER_ID && new Date(m.timestamp) > new Date(lastRead)).length;
            } else {
                // If never opened, count all messages from teacher
                unreadMessages = messages.filter(m => m.sender_id === TEACHER_ID).length;
            }
        }
        updateChatNotificationCount();
    } catch (error) {
        console.error('Error fetching unread count:', error);
    }
}

function updateChatNotificationCount() {
    let notifCountEl = document.querySelector('.chat-btn .notif-count');
    
    // Auto-create badge if missing from HTML
    if (!notifCountEl) {
        const chatBtn = document.querySelector('.chat-btn');
        if (chatBtn) {
            notifCountEl = document.createElement('span');
            notifCountEl.className = 'notif-count';
            chatBtn.appendChild(notifCountEl);
        }
    }

    if (notifCountEl) {
        notifCountEl.textContent = unreadMessages > 9 ? '9+' : unreadMessages;
        if (unreadMessages > 0) {
            notifCountEl.classList.add('visible');
        } else {
            notifCountEl.classList.remove('visible');
        }
    }
}

async function fetchChatHistory() {
    const container = document.getElementById('chatMessages');
    container.innerHTML = '<p style="text-align:center;color:#94a3b8;margin-top:20px;">Loading chat...</p>';
    try {
        const messages = await apiFetch(`${API_BASE}/messages/${currentUser.id}/${TEACHER_ID}`);
        container.innerHTML = '';
        if(messages.length === 0) {
             container.innerHTML = '<p style="text-align:center;color:var(--text-light); margin-top: 50px;">Start a conversation with your teacher.</p>';
        } else {
             messages.forEach(msg => appendMessage(msg));
        }
    } catch(e) { console.error(e); }
}

function appendMessage(msg) {
    const container = document.getElementById('chatMessages');
    if(container.querySelector('p')) container.innerHTML = ''; 

    const div = document.createElement('div');
    const isSent = msg.sender_id === currentUser.id;
    div.className = `message-bubble ${isSent ? 'sent' : 'received'}`;

    const time = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    div.innerHTML = `
        <span>${msg.message}</span>
        <small class="message-time">${time}</small>
    `;
    container.appendChild(div);
    scrollToBottom();
}

window.sendChatMessage = function() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if(!text || !socket) return;

    socket.emit('sendMessage', { sender_id: currentUser.id, receiver_id: TEACHER_ID, message: text });
    appendMessage({ sender_id: currentUser.id, message: text, timestamp: new Date() }); // Optimistic update
    input.value = '';
}

function scrollToBottom() {
    const container = document.getElementById('chatMessages');
    container.scrollTop = container.scrollHeight;
}

async function fetchMaterials() {
    const container = document.getElementById('materialsContainer');
    if(!container) return;
    
    try {
        const materials = await apiFetch(`${API_BASE}/study-materials`);
        if(materials.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:var(--text-light); padding:20px; grid-column:span 12;">No materials uploaded.</p>';
            return;
        }
        container.innerHTML = materials.map(m => `
            <a href="${m.link}" target="_blank" class="material-card">
                <i class="fas fa-file-pdf"></i>
                <span>${m.name}</span>
                <small>${m.description.substring(0, 50)}...</small>
            </a>
        `).join('');
    } catch(e) { console.error(e); }
}