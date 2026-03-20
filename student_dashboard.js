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
    return response.json();
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
        const { className, icon } = getNotificationStyle(notif.remark);
        return `
            <div class="notification-item ${className}">
                <div class="notif-header">
                    <p><i class="fas ${icon} icon"></i> ${notif.remark}</p>
                    <button class="delete-notif-btn" onclick="deleteNotification(${index})" title="Dismiss"><i class="fas fa-times"></i></button>
                </div>
                <small>${new Date(notif.created_at).toLocaleString()}</small>
            </div>
        `;
    }).join('');
}

function getNotificationStyle(remark) {
    if (remark.includes('ABSENT')) return { className: 'remark-absent', icon: 'fa-user-slash' };
    if (remark.includes('LATE')) return { className: 'remark-late', icon: 'fa-clock' };
    if (remark.includes('ON TIME')) return { className: 'remark-ontime', icon: 'fa-check-circle' };
    if (remark.includes('score')) return { className: 'remark-score', icon: 'fa-chart-line' };
    if (remark.includes('Task')) return { className: 'remark-task', icon: 'fa-tasks' };
    if (remark.includes('Material')) return { className: 'remark-material', icon: 'fa-book' };
    return { className: 'remark-general', icon: 'fa-info-circle' };
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
            container.innerHTML = '<p style="text-align:center; color:#94a3b8; padding:20px;">No scores available.</p>';
            return;
        }
        
        container.innerHTML = `
            <table class="mini-table">
                <thead><tr><th>Date</th><th>Avg</th><th>Action</th></tr></thead>
                <tbody>
                    ${studentScores.map((s, index) => {
                        const avg = Math.round((s.maths + s.science + s.social + s.tamil + s.english) / 5);
                        const color = avg >= 80 ? '#d1fae5' : (avg >= 50 ? '#fef3c7' : '#fee2e2');
                        const text = avg >= 80 ? '#065f46' : (avg >= 50 ? '#92400e' : '#991b1b');
                        return `
                            <tr>
                                <td>${s.test_date}</td>
                                <td><span class="score-pill" style="background:${color}; color:${text}">${avg}%</span></td>
                                <td><button class="view-btn" onclick="openScoreModal(${index})">View Mark</button></td>
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
            container.innerHTML = '<p style="text-align:center;color:#94a3b8;">No data for rankings.</p>';
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
        let rankingHtml = '<table class="mini-table"><thead><tr><th>Subject</th><th>My Avg</th><th>Rank</th><th>1st Rank Holder</th></tr></thead><tbody>';

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
                    <tr>
                        <td style="text-transform:capitalize; font-weight:600;">${subject}</td>
                        <td>${myStat.avg}%</td>
                        <td><span class="rank-badge ${badgeClass}"><i class="fas ${icon}"></i> #${rank}</span></td>
                        <td><small style="color:#64748b; font-weight:600;">${topDisplay} (${topStudent.avg}%)</small></td>
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
                <button class="att-btn present" onclick="filterAttendance('present')">
                    <i class="fas fa-check"></i> Present (${present})
                </button>
                <button class="att-btn absent" onclick="filterAttendance('absent')">
                    <i class="fas fa-times"></i> Absent (${absent})
                </button>
            </div>
            <div id="attendanceDetailsList" class="att-details-list">
                <p style="text-align:center; color:#94a3b8; font-size:0.85rem; padding:10px;">Select a status above to view details.</p>
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
        </div>
    `).join('') : `<p style="text-align:center; padding:15px; color:#94a3b8; font-size:0.9rem;">No records found for ${status}.</p>`;
}

async function fetchTasks() {
    const container = document.getElementById('tasksContainer');
    if(!container) return;
    
    try {
        const tasks = await apiFetch(`${API_BASE}/tasks`); // In real app, might need to filter by student/group
        if(tasks.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#94a3b8; padding:20px;">No pending tasks.</p>';
            return;
        }
        container.innerHTML = tasks.map(t => `
            <div class="task-item">
                <h4>${t.name}</h4>
                <div class="task-meta">
                    <span><i class="far fa-calendar"></i> ${t.due_date}</span>
                    <span><i class="far fa-clock"></i> ${t.due_time}</span>
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
        await apiFetch(`${API_BASE}/messages/${currentUser.id}/${TEACHER_ID}`, { method: 'DELETE' });
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
             container.innerHTML = '<p style="text-align:center;color:#94a3b8; margin-top: 50px;">Start a conversation with your teacher.</p>';
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
            container.innerHTML = '<p style="text-align:center; color:#94a3b8; padding:20px; grid-column:span 12;">No materials uploaded.</p>';
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