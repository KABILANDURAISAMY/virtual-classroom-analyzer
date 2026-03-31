// --- Configuration & State ---
const APP_CONFIG = window.APP_CONFIG || {};
const API_BASE = APP_CONFIG.API_BASE_URL || '/api';
const SOCKET_URL = APP_CONFIG.SOCKET_URL || window.location.origin;
const SAME_ORIGIN_API_BASE = '/api';
const token = localStorage.getItem('token');
const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
let students = [];
let studyMaterials = [];
let subjectChartInstances = {};
let pendingNotifications = {};
let currentChatPeerId = null;
let studentsWithMarksAdded = new Set();
let tempAttendanceData = {};
let unreadCounts = {};
let totalUnreadMessages = 0;

// --- DOM Elements ---
let studentGrid;
let studentGridSection;
let studentDetailSection;
let studentDetailsContainer;
let addTestScoreSection;
let addTaskSection;
let assignedTasksSection;
let addStudyMaterialSection;
let uploadedMaterialsSection;
let subjectAnalysisSection;
let attendanceSection;
let sidebar;
let sidebarToggle;
let chatFab;
let teacherChatModal;
let closeChatModal;
let chatStudentList;
let chatStudentListView;
let chatConversationView;
let backToStudentList;
let chatHeaderTitle;
let chatTotalCount;
let teacherChatMessages;
let teacherChatInput;
let sendChatMessageBtn;
let clearChatBtn;
let closeSidebar;
let logoutButton;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // Inject Google Font 'Inter' for a more professional dashboard look
    const fontLink = document.createElement('link');
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap';
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);

    const style = document.createElement('style');
    style.innerHTML = `
        :root {
            --primary: #1e40af;
            --primary-hover: #1e3a8a;
            --secondary: #64748b;
            --success: #10b981;
            --danger: #ef4444;
            --warning: #f59e0b;
            --info: #3b82f6;
            --bg-body: #eef2f6;
            --bg-card: #ffffff;
            --text-main: #0f172a;
            --text-secondary: #475569;
            --border: #e3e8ef;
            --radius: 6px;
            --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
            --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05);
            --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
        }
        body {
            font-family: 'Outfit', sans-serif !important;
            background-color: var(--bg-body);
            color: var(--text-main);
            margin: 0;
            line-height: 1.5;
        }
        h1, h2, h3, h4, h5, h6 { color: var(--text-main); font-weight: 700; letter-spacing: -0.025em; }
        
        /* Card Styling */
        .student-card, .detail-card, .task-card, .material-card {
            background: var(--bg-card);
            border-radius: var(--radius);
            border: 1px solid var(--border);
            box-shadow: var(--shadow-sm);
            border-top: 3px solid var(--primary);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .student-card:hover, .task-card:hover {
            transform: translateY(-2px);
            box-shadow: var(--shadow-md);
        }

        /* Form Elements */
        input, select, textarea {
            border: 1px solid var(--border) !important;
            border-radius: 4px !important;
            padding: 0.75rem 1rem !important;
            font-size: 0.95rem !important;
            transition: border-color 0.15s ease;
            background-color: #fff;
        }
        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: var(--primary) !important;
            box-shadow: 0 0 0 2px rgba(30, 64, 175, 0.1);
        }

        /* Buttons */
        button {
            font-weight: 600;
            border-radius: 4px;
            transition: all 0.2s;
            cursor: pointer;
        }
        button.primary-btn {
            background: var(--primary);
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
        }
        button.primary-btn:hover { background: var(--primary-hover); }
        
        /* Tables */
        .details-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
        }
        .details-table th {
            background: #f8fafc;
            color: var(--text-secondary);
            font-weight: 600;
            text-transform: uppercase;
            font-size: 0.75rem;
            letter-spacing: 0.05em;
            padding: 12px 16px;
            border-bottom: 1px solid var(--border);
        }
        .details-table td {
            padding: 16px;
            border-bottom: 1px solid var(--border);
            color: var(--text-main);
        }
        .details-table tr:last-child td { border-bottom: none; }

        /* Chat Improvements */
        .message-bubble {
            max-width: 75%;
            padding: 12px 16px;
            border-radius: 16px;
            margin-bottom: 8px;
            position: relative;
            font-size: 0.95rem;
            line-height: 1.4;
            box-shadow: var(--shadow-sm);
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
        .message-time {
            display: block;
            font-size: 0.7rem;
            opacity: 0.8;
            margin-top: 4px;
            text-align: right;
        }
    `;
    document.head.appendChild(style);

    if (!token || currentUser.id === undefined) {
        alert('Authentication error. Please log in again.');
        window.location.href = 'index.html';
        return;
    }

    // Initialize Elements safely inside DOMContentLoaded
    studentGrid = document.getElementById('studentGrid');
    studentGridSection = document.getElementById('student-grid-section');
    studentDetailSection = document.getElementById('student-detail-section');
    studentDetailsContainer = document.getElementById('studentDetailsContainer');
    addTestScoreSection = document.getElementById('add-test-score-section');
    addTaskSection = document.getElementById('add-task-section');
    assignedTasksSection = document.getElementById('assigned-tasks-section');
    addStudyMaterialSection = document.getElementById('add-study-material-section');
    uploadedMaterialsSection = document.getElementById('uploaded-materials-section');
    subjectAnalysisSection = document.getElementById('subject-analysis-section');
    attendanceSection = document.getElementById('attendance-section');
    sidebar = document.getElementById('sidebar');
    sidebarToggle = document.getElementById('sidebarToggle');
    closeSidebar = document.getElementById('closeSidebar');
    logoutButton = document.getElementById('logoutButton');
    chatFab = document.getElementById('chatFab');
    teacherChatModal = document.getElementById('teacherChatModal');
    closeChatModal = document.getElementById('closeChatModal');
    chatStudentList = document.getElementById('chatStudentList');
    chatStudentListView = document.getElementById('chatStudentListView');
    chatConversationView = document.getElementById('chatConversationView');
    backToStudentList = document.getElementById('backToStudentList');
    chatHeaderTitle = document.getElementById('chatHeaderTitle');
    chatTotalCount = document.getElementById('chatTotalCount');
    teacherChatMessages = document.getElementById('teacherChatMessages');
    teacherChatInput = document.getElementById('teacherChatInput');
    sendChatMessageBtn = document.getElementById('sendChatMessageBtn');
    clearChatBtn = document.getElementById('clearChatBtn');

    updateUserInfo();
    fetchTasks();
    fetchStudyMaterials();
    
    await fetchStudents(); // Wait for students to load first
    fetchUnreadCounts();   // Then calculate unread messages based on student list
    setupEventListeners();

    initializeSocket();
});

function setupEventListeners() {
    const dropdowns = document.querySelectorAll('.has-dropdown > .menu-link');
    dropdowns.forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const parent = link.parentElement;
            parent.classList.toggle('show-dropdown');
        });
    });

    if (sidebarToggle && closeSidebar) {
        sidebarToggle.addEventListener('click', () => sidebar.classList.add('active'));
        closeSidebar.addEventListener('click', () => sidebar.classList.remove('active'));
    }

    // Logout
    logoutButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to log out?')) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'index.html';
        }
    });

    // --- Navigation ---
    const navMap = {
        'navHome': showGrid,
        'navAddTestScore': showAddTestScoreSection,
        'navSubjectAnalysis': showSubjectAnalysisSection,
        'navAttendance': showAttendanceSection,
        'navAddTask': showAddTaskSection,
        'navAssignedTasks': showAssignedTasksSection,
        'navAddStudyMaterial': showAddStudyMaterialSection,
        'navUploadedMaterials': showUploadedMaterialsSection,
    };

    for (const [id, handler] of Object.entries(navMap)) {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('click', (e) => {
                e.preventDefault();
                handler();
                if (sidebar) sidebar.classList.remove('active');
            });
        }
    }

    const openTestScoreBtn = document.getElementById('openTestScoreBtn');
    if (openTestScoreBtn) {
        openTestScoreBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showAddTestScoreSection();
        });
    }

    const openAddTaskBtn = document.getElementById('openAddTaskBtn');
    if (openAddTaskBtn) {
        openAddTaskBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showAddTaskSection();
        });
    }

    // Chat Event Listeners
    if (chatFab) {
        chatFab.addEventListener('click', openChatModal);
    }
    if (closeChatModal) {
        closeChatModal.addEventListener('click', () => teacherChatModal.classList.add('hidden'));
    }
    if (backToStudentList) {
        backToStudentList.addEventListener('click', showChatStudentList);
    }
    if (sendChatMessageBtn) {
        sendChatMessageBtn.addEventListener('click', sendChatMessage);
    }
    if (teacherChatInput) {
        teacherChatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendChatMessage();
        });
    }

    if (clearChatBtn) {
        clearChatBtn.onclick = (e) => {
            e.preventDefault();
            window.clearCurrentChat();
        };
    }
}

function initializeSocket() {
    socket = io(SOCKET_URL);
    socket.on('connect', () => {
        socket.emit('joinRoom', currentUser.id);
    });

    socket.on('receiveMessage', (msg) => {
        const senderId = parseInt(msg.sender_id);
        const currentPeer = currentChatPeerId ? parseInt(currentChatPeerId) : null;

        // If the chat modal is open and the message is from the currently selected student
        if (!teacherChatModal.classList.contains('hidden') && senderId === currentPeer) {
            appendChatMessage(msg);
            // Mark as read immediately in local storage if chat is open
            localStorage.setItem(`lastRead_${senderId}`, new Date().toISOString());
        } else {
            // Increment counters
            unreadCounts[senderId] = (unreadCounts[senderId] || 0) + 1;
            updateTotalUnreadCount();
            renderChatStudentList();
            if (chatFab && teacherChatModal.classList.contains('hidden')) {
                chatFab.style.animation = 'pulse 1s infinite'; // Pulse if closed
            }
        }
    });
}

function updateUserInfo() {
    const userNameEl = document.querySelector('.user-name');
    const userEmailEl = document.querySelector('.user-email');

    if (userNameEl) userNameEl.textContent = 'Teacher';
    if (userEmailEl) {
        userEmailEl.textContent = currentUser.email || '';
    }
}

async function apiFetch(url, options = {}) {
    const defaultHeaders = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
    const requestOptions = {
        ...options,
        headers: { ...defaultHeaders, ...options.headers }
    };
    let response;

    try {
        response = await fetch(url, requestOptions);
    } catch (error) {
        const fallbackUrl = url.replace(API_BASE, SAME_ORIGIN_API_BASE);
        if (fallbackUrl === url) {
            throw error;
        }
        response = await fetch(fallbackUrl, requestOptions);
    }

    if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
    }
    const text = await response.text();
    if (!text) {
        return {}; 
    }
    return JSON.parse(text);
}

// --- Student Grid Functions ---
async function fetchStudents() {
    try {
        students = await apiFetch(`${API_BASE}/students`);
        renderStudentGrid();
        populateTestStudentDropdown();
        renderChatStudentList();
    } catch (error) {
        console.error('Failed to fetch students:', error);
        studentGrid.innerHTML = '<p class="error-message">Could not load students.</p>';
    }
}

function renderStudentGrid() {
    studentGrid.innerHTML = '';
    if (!students || students.length === 0) {
        studentGrid.innerHTML = '<p>No students found.</p>';
        return;
    }
    students.forEach(student => {
        const card = document.createElement('div');
        card.className = 'student-card';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.onclick = () => showStudentDetails(student.id);
        card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') showStudentDetails(student.id); };
        
        card.innerHTML = `
            <div class="card-header" style="display: flex; align-items: center; margin-bottom: 20px; text-align: left;">
                <div class="student-avatar" style="width: 56px; height: 56px; background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%); color: var(--primary); border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; margin-right: 16px; box-shadow: inset 0 2px 4px 0 rgba(255, 255, 255, 0.3);">
                    ${student.name.charAt(0).toUpperCase()}
                </div>
                <div>
                    <h3 style="margin: 0; color: var(--text-main); font-size: 1.1rem; font-weight: 700;">${student.name}</h3>
                    <p style="margin: 4px 0 0; color: var(--text-secondary); font-size: 0.85rem;">${student.email}</p>
                </div>
            </div>
            <div style="border-top: 1px solid var(--border); padding-top: 16px; margin-top: auto; display: flex; justify-content: space-between; align-items: center;">
                <p style="margin: 0; color: var(--text-secondary); font-size: 0.875rem; font-weight: 500;">ID: <span style="color: var(--text-main); font-weight: 600;">${student.id}</span></p>
                <div class="view-details-link" style="color: #4f46e5; font-weight: 600; font-size: 0.875rem; padding: 8px 16px; background: #e0e7ff; border-radius: 8px; transition: all 0.2s;">
                    View Details
                </div>
            </div>
        `;
        
        studentGrid.appendChild(card);
    });
}

// --- Student Details Functions ---
window.showStudentDetails = async function(id) {
    const student = students.find(s => s.id === id);
    if (!student) return;

    try {
        const [scores, attendance, remarks] = await Promise.all([
            apiFetch(`${API_BASE}/test-scores/${id}`),
            apiFetch(`${API_BASE}/attendance/${id}`),
            apiFetch(`${API_BASE}/remarks/${id}`)
        ]);

        const presentCount = attendance.filter(a => a.status === 'present').length;
        const absentCount = attendance.length - presentCount;
        const attendancePercentage = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;

        const getScorePill = (score) => {
            let color, bgColor;
            if (score < 40) { color = '#ef4444'; bgColor = '#fef2f2'; }
            else if (score < 75) { color = '#f59e0b'; bgColor = '#fffbeb'; }
            else { color = '#10b981'; bgColor = '#ecfdf5'; }
            return `<span style="background-color:${bgColor}; color:${color}; padding: 4px 10px; border-radius: 999px; font-weight: 600; font-size: 0.875rem;">${score}</span>`;
        };

        // Filter for teacher remarks (exclude system generated ones)
        const teacherRemarks = remarks.filter(r => 
            !(r.remark.includes('📈') || r.remark.includes('📉') || r.remark.includes('📊') || r.remark.includes('👍') || r.remark.includes('👎') || r.remark.includes('🏁') || r.remark.includes('✅') || r.remark.includes('❌') || r.remark.includes('🕒'))
        );

        studentDetailsContainer.innerHTML = `
            <div class="detail-header" style="background: var(--white); padding: 32px; border-radius: 16px; box-shadow: var(--shadow-sm); margin-bottom: 32px; display: flex; align-items: center; border: 1px solid var(--border);">
                <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #e0e7ff, #c7d2fe); color: var(--primary); border-radius: 20px; display: flex; align-items: center; justify-content: center; font-size: 32px; margin-right: 24px; box-shadow: var(--shadow-sm);">
                    <i class="fas fa-user-graduate"></i>
                </div>
                <div>
                    <h2 style="margin: 0; color: var(--text-main); font-size: 2rem; font-weight: 800; letter-spacing: -0.03em;">${student.name}</h2>
                    <p style="margin: 6px 0 0; color: var(--text-secondary); font-size: 1rem;">Student Performance Overview</p>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 32px; margin-bottom: 32px;">
                <div class="detail-card" style="padding: 24px;">
                    <h3 style="color: var(--text-main); margin-top: 0; margin-bottom: 20px; font-size: 1.2rem; font-weight: 700; display:flex; align-items:center;"><i class="fas fa-chart-line" style="color: var(--info); margin-right: 12px; background:#eff6ff; padding:8px; border-radius:8px;"></i> Test Scores</h3>
                    ${scores.length > 0 ? `
                        <table class="details-table" style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th style="text-align: center;">Mat</th>
                                    <th style="text-align: center;">Sci</th>
                                    <th style="text-align: center;">Soc</th>
                                    <th style="text-align: center;">Tam</th>
                                    <th style="text-align: center;">Eng</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${scores.map(s => `
                                    <tr style="transition: background 0.2s;" onmouseover="this.style.background='var(--bg-body)'" onmouseout="this.style.background='transparent'">
                                        <td style="padding: 16px 12px; font-weight: 500;">${s.test_date}</td>
                                        <td style="padding: 14px 12px; text-align: center;">${getScorePill(s.maths)}</td>
                                        <td style="padding: 14px 12px; text-align: center;">${getScorePill(s.science)}</td>
                                        <td style="padding: 14px 12px; text-align: center;">${getScorePill(s.social)}</td>
                                        <td style="padding: 14px 12px; text-align: center;">${getScorePill(s.tamil)}</td>
                                        <td style="padding: 14px 12px; text-align: center;">${getScorePill(s.english)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : '<p style="color: #9ca3af; text-align: center; padding: 40px;">No scores recorded yet.</p>'}
                </div>

                <div class="detail-card" style="padding: 24px;">
                    <h3 style="color: var(--text-main); margin-top: 0; margin-bottom: 20px; font-size: 1.2rem; font-weight: 700; display:flex; align-items:center;"><i class="fas fa-user-check" style="color: var(--primary); margin-right: 12px; background:#e0e7ff; padding:8px; border-radius:8px;"></i> Attendance</h3>
                    
                    <div style="display: flex; justify-content: space-around; align-items: center; margin: 24px 0; text-align: center;">
                        <div style="background: #f0fdf4; padding: 15px 25px; border-radius: 12px; min-width: 120px; border: 1px solid #bbf7d0;">
                            <div style="font-size: 2.25rem; font-weight: 800; color: var(--success);">${presentCount}</div>
                            <div style="font-size: 0.8rem; color: #15803d; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Present</div>
                        </div>
                        <div style="background: #fff1f2; padding: 15px 25px; border-radius: 12px; min-width: 120px; border: 1px solid #fecaca;">
                            <div style="font-size: 2.25rem; font-weight: 800; color: var(--danger);">${absentCount}</div>
                            <div style="font-size: 0.8rem; color: #9f1239; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Absent</div>
                        </div>
                    </div>

                    <div class="progress-bar" style="position: relative; background: var(--bg-body); border-radius: 9999px; height: 10px; margin-bottom: 24px; overflow: hidden;">
                        <div class="progress-bar-fill" style="width:${attendancePercentage}%; background: var(--primary); height: 100%; transition: width 0.5s ease; border-radius: 9999px;"></div>
                        <span style="position: absolute; right: 0; top: -24px; color: var(--text-main); font-weight: 700; font-size: 0.85rem;">${attendancePercentage}% Rate</span>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h4 style="margin: 0; color: var(--text-secondary); font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">History</h4>
                        <div class="filter-buttons" style="display: flex; gap: 8px;">
                            <button onclick="filterStudentAttendanceHistory('all', this)" class="active" style="padding: 6px 14px; border: 1px solid var(--border); background: var(--white); color: var(--text-secondary); border-radius: 8px; cursor: pointer; font-size: 0.8rem; transition: all 0.2s;">All</button>
                            <button onclick="filterStudentAttendanceHistory('present', this)" style="padding: 6px 14px; border: 1px solid var(--border); background: var(--white); color: var(--text-secondary); border-radius: 8px; cursor: pointer; font-size: 0.8rem; transition: all 0.2s;">Present</button>
                            <button onclick="filterStudentAttendanceHistory('absent', this)" style="padding: 6px 14px; border: 1px solid var(--border); background: var(--white); color: var(--text-secondary); border-radius: 8px; cursor: pointer; font-size: 0.8rem; transition: all 0.2s;">Absent</button>
                        </div>
                    </div>
                    <div class="history-list" style="max-height: 150px; overflow-y: auto; padding-right: 5px;">
                        ${attendance.map(a => `
                            <div class="history-item attendance-history-item" data-status="${a.status}" style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #f9fafb; align-items: center;">
                                <span style="color: var(--text-main); font-size: 0.9rem;"><i class="far fa-calendar-alt" style="margin-right: 10px; color: var(--text-secondary);"></i> ${a.attendance_date}</span>
                                <span style="font-weight: 600; padding: 3px 10px; border-radius: 999px; font-size: 0.8rem; background-color: ${
                                    a.status === 'present' ? '#dcfce7' : '#ffe4e6'
                                }; color: ${a.status === 'present' ? '#166534' : '#9f1239'};">
                                    ${a.status.toUpperCase()}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <div class="detail-card" style="padding: 24px;">
                <h3 style="color: var(--text-main); margin-top: 0; margin-bottom: 20px; font-size: 1.2rem; font-weight: 700; display:flex; align-items:center;"><i class="fas fa-comment-dots" style="color: var(--warning); margin-right: 12px; background:#fffbeb; padding:8px; border-radius:8px;"></i> Remarks & Feedback</h3>
                
                <div class="add-remark-form" style="display: flex; gap: 10px; margin-bottom: 20px;">
                    <input type="text" id="newRemarkInput" placeholder="Type a new remark for ${student.name}..." style="flex: 1;">
                    <button onclick="addRemark(${student.id})" class="primary-btn">Add</button>
                </div>
                
                <div class="remarks-list">
                    ${teacherRemarks.length > 0 ? `
                        <ul style="list-style: none; padding: 0; display: grid; gap: 12px;">
                            ${teacherRemarks.map(r => `
                                <li style="position: relative; padding: 16px; background: #f8fafc; border-left: 4px solid var(--warning); border-radius: 8px;">
                                    <p style="margin:0 0 8px 0; color: var(--text-main); line-height: 1.6;">${r.remark}</p>
                                    <small style="color: var(--text-secondary);"><i class="far fa-clock"></i> ${new Date(r.created_at).toLocaleString()}</small>
                                    <button onclick="deleteRemark('${r._id}', ${student.id})" style="position: absolute; top: 50%; right: 15px; transform: translateY(-50%); background: #fee2e2; color: var(--danger); border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" title="Delete Remark" onmouseover="this.style.background='var(--danger)'; this.style.color='var(--white)';" onmouseout="this.style.background='#fee2e2'; this.style.color='var(--danger)';">
                                        <i class="fas fa-trash-alt"></i>
                                    </button>
                                </li>
                            `).join('')}
                        </ul>
                    ` : '<p style="color: #9ca3af; font-style: italic; text-align: center; padding: 20px;">No manual remarks or feedback added yet.</p>'}
                </div>
            </div>
        `;
    } catch (error) {
        console.error(`Failed to load details for student ${id}:`, error);
        studentDetailsContainer.innerHTML = `<p class="error-message">Could not load details for ${student.name}.</p>`;
    }

    // Toggle Views
    studentGridSection.classList.add('hidden');
    if (addTestScoreSection) addTestScoreSection.classList.add('hidden');
    if (addTaskSection) addTaskSection.classList.add('hidden');
    if (assignedTasksSection) assignedTasksSection.classList.add('hidden');
    if (addStudyMaterialSection) addStudyMaterialSection.classList.add('hidden');
    if (uploadedMaterialsSection) uploadedMaterialsSection.classList.add('hidden');
    if (attendanceSection) attendanceSection.classList.add('hidden');
    if (subjectAnalysisSection) subjectAnalysisSection.classList.add('hidden');
    studentDetailSection.classList.remove('hidden');
};


window.showGrid = function() {
    if (studentDetailSection) studentDetailSection.classList.add('hidden');
    if (addTaskSection) addTaskSection.classList.add('hidden');
    if (assignedTasksSection) assignedTasksSection.classList.add('hidden');
    if (addStudyMaterialSection) addStudyMaterialSection.classList.add('hidden');
    if (uploadedMaterialsSection) uploadedMaterialsSection.classList.add('hidden');
    if (attendanceSection) attendanceSection.classList.add('hidden');
    if (subjectAnalysisSection) subjectAnalysisSection.classList.add('hidden');
    studentGridSection.classList.remove('hidden');
};

window.showAddTestScoreSection = function() {
    if (studentGridSection) studentGridSection.classList.add('hidden');
    if (studentDetailSection) studentDetailSection.classList.add('hidden');
    if (addTestScoreSection) addTestScoreSection.classList.remove('hidden');
    if (addTaskSection) addTaskSection.classList.add('hidden');
    if (assignedTasksSection) assignedTasksSection.classList.add('hidden');
    if (addStudyMaterialSection) addStudyMaterialSection.classList.add('hidden');
    if (uploadedMaterialsSection) uploadedMaterialsSection.classList.add('hidden');
    if (attendanceSection) attendanceSection.classList.add('hidden');
    if (subjectAnalysisSection) subjectAnalysisSection.classList.add('hidden');
    populateTestStudentDropdown();

    // Enforce No Future Dates in UI
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('testDate');
    if(dateInput) dateInput.max = today;
}

window.showAddTaskSection = function() {
    if (studentGridSection) studentGridSection.classList.add('hidden');
    if (studentDetailSection) studentDetailSection.classList.add('hidden');
    if (addTestScoreSection) addTestScoreSection.classList.add('hidden');
    if (addTaskSection) addTaskSection.classList.remove('hidden');
    if (assignedTasksSection) assignedTasksSection.classList.add('hidden');
    if (addStudyMaterialSection) addStudyMaterialSection.classList.add('hidden');
    if (attendanceSection) attendanceSection.classList.add('hidden');
    if (subjectAnalysisSection) subjectAnalysisSection.classList.add('hidden');


    fetchTasks();
    const todayDate = new Date().toISOString().split('T')[0];
    const taskDateInput = document.getElementById('taskDate');
    if(taskDateInput) taskDateInput.min = todayDate;
}

window.showAssignedTasksSection = function() {
    if (studentGridSection) studentGridSection.classList.add('hidden');
    if (studentDetailSection) studentDetailSection.classList.add('hidden');
    if (addTestScoreSection) addTestScoreSection.classList.add('hidden');
    if (addTaskSection) addTaskSection.classList.add('hidden');
    if (assignedTasksSection) assignedTasksSection.classList.remove('hidden');
    if (addStudyMaterialSection) addStudyMaterialSection.classList.add('hidden');
    if (uploadedMaterialsSection) uploadedMaterialsSection.classList.add('hidden');
    if (attendanceSection) attendanceSection.classList.add('hidden');
    if (subjectAnalysisSection) subjectAnalysisSection.classList.add('hidden');

    fetchTasks();
}

window.showAddStudyMaterialSection = function() {
    if (studentGridSection) studentGridSection.classList.add('hidden');
    if (studentDetailSection) studentDetailSection.classList.add('hidden');
    if (addTestScoreSection) addTestScoreSection.classList.add('hidden');
    if (addTaskSection) addTaskSection.classList.add('hidden');
    if (assignedTasksSection) assignedTasksSection.classList.add('hidden');
    if (addStudyMaterialSection) addStudyMaterialSection.classList.remove('hidden');
    if (uploadedMaterialsSection) uploadedMaterialsSection.classList.add('hidden');
    if (subjectAnalysisSection) subjectAnalysisSection.classList.add('hidden');
    if (attendanceSection) attendanceSection.classList.add('hidden');
}

window.showUploadedMaterialsSection = function() {
    if (studentGridSection) studentGridSection.classList.add('hidden');
    if (studentDetailSection) studentDetailSection.classList.add('hidden');
    if (addTestScoreSection) addTestScoreSection.classList.add('hidden');
    if (addTaskSection) addTaskSection.classList.add('hidden');
    if (assignedTasksSection) assignedTasksSection.classList.add('hidden');
    if (addStudyMaterialSection) addStudyMaterialSection.classList.add('hidden');
    if (uploadedMaterialsSection) uploadedMaterialsSection.classList.remove('hidden');
    if (attendanceSection) attendanceSection.classList.add('hidden');
    if (subjectAnalysisSection) subjectAnalysisSection.classList.add('hidden');
    fetchStudyMaterials();
}

window.showAttendanceSection = function() {
    if (studentGridSection) studentGridSection.classList.add('hidden');
    if (studentDetailSection) studentDetailSection.classList.add('hidden');
    if (addTestScoreSection) addTestScoreSection.classList.add('hidden');
    if (addTaskSection) addTaskSection.classList.add('hidden');
    if (addStudyMaterialSection) addStudyMaterialSection.classList.add('hidden');
    if (uploadedMaterialsSection) uploadedMaterialsSection.classList.add('hidden');
    if (subjectAnalysisSection) subjectAnalysisSection.classList.add('hidden');
    if (attendanceSection) attendanceSection.classList.remove('hidden');

    // Initialize Date Picker
    const dateInput = document.getElementById('attendanceDate');
    const today = new Date().toISOString().split('T')[0];
    dateInput.max = today; // No future dates
    dateInput.value = today;
    
    // Load initial list
    loadAttendanceList();
}

window.showSubjectAnalysisSection = async function() {
    if (studentDetailSection) studentDetailSection.classList.add('hidden');
    if (addTestScoreSection) addTestScoreSection.classList.add('hidden');
    if (addTaskSection) addTaskSection.classList.add('hidden');
    if (assignedTasksSection) assignedTasksSection.classList.add('hidden');
    if (addStudyMaterialSection) addStudyMaterialSection.classList.add('hidden');
    if (uploadedMaterialsSection) uploadedMaterialsSection.classList.add('hidden');
    if (attendanceSection) attendanceSection.classList.add('hidden');
    if (subjectAnalysisSection) subjectAnalysisSection.classList.remove('hidden');

    try {
        const [studentsData, scoresData] = await Promise.all([
            apiFetch(`${API_BASE}/students`),
            apiFetch(`${API_BASE}/test-scores`)
        ]);

        const subjects = ['tamil', 'english', 'maths', 'science', 'social'];
        for (const subject of subjects) {
            // Call a function to generate chart for each subject
            generateSingleSubjectChart(subject, studentsData, scoresData);
        }
    } catch (error) {
        console.error('Error loading data for subject analysis:', error);
        alert('Could not load data for analysis.');
    }
}

function generateSingleSubjectChart(subject, studentsData, scoresData) {
    const canvasId = `${subject}AnalysisChart`;
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) {
        console.error(`Canvas with id ${canvasId} not found.`);
        return;
    }

    const gradient = ctx.createLinearGradient(0, 400, 0, 0); // Vertical Gradient
    gradient.addColorStop(0, '#4f46e5'); // Indigo
    gradient.addColorStop(1, '#a855f7'); // Purple

    // Calculate average for each student in the selected subject
    const studentAverages = studentsData.map(student => {
        const studentScores = scoresData.filter(s => s.student_id === student.id && s[subject] !== undefined && s[subject] !== null);
        
        if (studentScores.length === 0) return { name: student.name, avg: 0 };
        
        const total = studentScores.reduce((sum, s) => sum + (parseInt(s[subject]) || 0), 0);
        const avg = total / studentScores.length;
        return { name: student.name, avg: Math.round(avg) };
    });

    // Sort from low to high
    studentAverages.sort((a, b) => a.avg - b.avg);

    // Destroy old chart if it exists
    if (subjectChartInstances[subject]) {
        subjectChartInstances[subject].destroy();
    }

    // Create new chart
    subjectChartInstances[subject] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: studentAverages.map(s => s.name),
            datasets: [{
                label: `Average Mark`,
                data: studentAverages.map(s => s.avg),
                backgroundColor: gradient,
                borderRadius: 8,
                barPercentage: 0.6,
                hoverBackgroundColor: '#818cf8'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleFont: { family: 'Outfit', size: 14 },
                    bodyFont: { family: 'Outfit', size: 13 },
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${context.raw}%`
                    }
                }
            },
            scales: {
                y: { 
                    beginAtZero: true, 
                    max: 100, 
                    grid: { borderDash: [5, 5], color: '#f1f5f9' },
                    title: { display: true, text: 'Average Score (%)', font: { family: 'Outfit', weight: '600' } },
                    ticks: { font: { family: 'Outfit' } }
                },
                x: { 
                    grid: { display: false },
                    ticks: { font: { family: 'Outfit', weight: '500' } }
                }
            }
        }
    });
}
async function loadAttendanceList(showLoading = true) {
    const date = document.getElementById('attendanceDate').value;
    const container = document.getElementById('attendanceListContainer');
    if (!date) return;

    if (showLoading !== false) {
        container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    }
    
    try {
        // Fetch existing attendance records for the selected date
        const attendanceRecords = await apiFetch(`${API_BASE}/attendance/date/${date}`);
        let statusMap = {};
        attendanceRecords.forEach(r => statusMap[r.student_id] = r.status);
        tempAttendanceData = statusMap; // Sync local state with DB

        container.innerHTML = students.map(student => {
            const status = tempAttendanceData[student.id];
            return `
            <div id="att-row-${student.id}" style="background:white; padding:20px; border-radius:12px; border:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; box-shadow: var(--shadow-sm); transition: all 0.2s; margin-bottom: 12px;">
                <div style="display:flex; align-items:center;">
                    <div style="width: 44px; height: 44px; background: var(--bg-body); color: var(--text-main); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 700; margin-right: 16px;">${student.name.charAt(0)}</div>
                    <div>
                        <strong style="color:var(--text-main); font-size:1rem;">${student.name}</strong>
                        <span style="color:var(--text-secondary); font-size:0.85rem; display:block;">ID: ${student.id}</span>
                    </div>
                </div>
                <div style="display:flex; gap:10px;">
                    <button onclick="markStudentAttendance(${student.id}, 'present')" style="padding:8px 20px; border:1px solid; border-radius:8px; cursor:pointer; font-weight:600; font-size: 0.9rem; transition:all 0.2s; ${status === 'present' ? 'background:var(--success); color:white; border-color:var(--success);' : 'background:transparent; color:var(--text-secondary); border-color:var(--border);'}"><i class="fas fa-check" style="margin-right: 6px;"></i> Present</button>
                    <button onclick="markStudentAttendance(${student.id}, 'absent')" style="padding:8px 20px; border:1px solid; border-radius:8px; cursor:pointer; font-weight:600; font-size: 0.9rem; transition:all 0.2s; ${status === 'absent' ? 'background:var(--danger); color:white; border-color:var(--danger);' : 'background:transparent; color:var(--text-secondary); border-color:var(--border);'}"><i class="fas fa-times" style="margin-right: 6px;"></i> Absent</button>
                </div>
            </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading attendance:', error);
        container.innerHTML = '<p class="error-message">Failed to load attendance list.</p>';
    }
}

window.markStudentAttendance = function(studentId, status) {
    // Update local state only
    tempAttendanceData[studentId] = status;

    // Update UI immediately
    const row = document.getElementById(`att-row-${studentId}`);
    if (row) {
        const btns = row.querySelectorAll('button');
        const presentBtn = btns[0];
        const absentBtn = btns[1];

        if (status === 'present') {
            presentBtn.style.cssText = "padding:8px 20px; border:1px solid; border-radius:8px; cursor:pointer; font-weight:600; font-size: 0.9rem; transition:all 0.2s; background:var(--success); color:white; border-color:var(--success);";
            absentBtn.style.cssText = "padding:8px 20px; border:1px solid; border-radius:8px; cursor:pointer; font-weight:600; font-size: 0.9rem; transition:all 0.2s; background:transparent; color:var(--text-secondary); border-color:var(--border);";
        } else {
            presentBtn.style.cssText = "padding:8px 20px; border:1px solid; border-radius:8px; cursor:pointer; font-weight:600; font-size: 0.9rem; transition:all 0.2s; background:transparent; color:var(--text-secondary); border-color:var(--border);";
            absentBtn.style.cssText = "padding:8px 20px; border:1px solid; border-radius:8px; cursor:pointer; font-weight:600; font-size: 0.9rem; transition:all 0.2s; background:var(--danger); color:white; border-color:var(--danger);";
        }
    }
}

window.saveStudentAttendance = async function(studentId) {
    const date = document.getElementById('attendanceDate').value;
    if (!date) return alert('Please select a date.');
    
    const status = tempAttendanceData[studentId];
    if (!status) return alert('Please mark attendance for this student first.');

    const time = new Date().toTimeString().split(' ')[0];

    try {
        await apiFetch(`${API_BASE}/attendance`, {
            method: 'POST',
            body: JSON.stringify({ 
                student_id: parseInt(studentId), 
                attendance_date: date, 
                attendance_time: time, 
                status: status 
            })
        });
        alert('Attendance saved for student.');
    } catch (error) {
        console.error('Error saving attendance:', error);
        alert('Failed to save attendance.');
    }
}

window.saveAttendance = async function() {
    const date = document.getElementById('attendanceDate').value;
    if (!date) return alert('Please select a date.');

    try {
        const time = new Date().toTimeString().split(' ')[0];
        const promises = Object.entries(tempAttendanceData).map(([studentId, status]) => {
            return apiFetch(`${API_BASE}/attendance`, {
                method: 'POST',
                body: JSON.stringify({ student_id: parseInt(studentId), attendance_date: date, attendance_time: time, status: status })
            });
        });

        await Promise.all(promises);
        alert('Attendance saved successfully!');
    } catch (error) {
        console.error('Error saving attendance:', error);
        alert('Failed to save attendance.');
    }
}

// --- Action Functions ---
window.addRemark = async function(studentId) {
    const input = document.getElementById('newRemarkInput');
    const remarkText = input.value.trim();
    if (!remarkText) return alert("Please enter a remark.");

    try {
        await apiFetch(`${API_BASE}/remarks`, {
            method: 'POST',
            body: JSON.stringify({ student_id: studentId, remark: remarkText })
        });
        // Refresh details to show new remark
        showStudentDetails(studentId);
    } catch (error) {
        console.error('Error adding remark:', error);
        alert('Failed to add remark.');
    }
};

window.deleteRemark = async function(remarkId, studentId) {
    if (!confirm('Are you sure you want to delete this remark?')) return;

    try {
        await apiFetch(`${API_BASE}/remarks/${remarkId}`, {
            method: 'DELETE'
        });
        showStudentDetails(studentId); // Refresh to remove from list
    } catch (error) {
        console.error('Error deleting remark:', error);
        alert('Failed to delete remark.');
    }
}

window.filterStudentAttendanceHistory = function(status, clickedButton) {
    const items = document.querySelectorAll('.attendance-history-item');
    items.forEach(item => {
        if (status === 'all' || item.dataset.status === status) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });

    // Update active button style
    if (clickedButton && clickedButton.parentElement) {
        const buttons = clickedButton.parentElement.querySelectorAll('button');
        buttons.forEach(button => button.classList.remove('active'));
        clickedButton.classList.add('active');
    }
}

// --- Chat Functions ---
function updateTotalUnreadCount() {
    totalUnreadMessages = Object.values(unreadCounts).reduce((a, b) => a + (parseInt(b) || 0), 0);
    
    // Ensure element exists
    if (!chatTotalCount) {
        chatTotalCount = document.getElementById('chatTotalCount');
        if (!chatTotalCount && chatFab) {
            chatTotalCount = document.createElement('span');
            chatTotalCount.id = 'chatTotalCount';
            chatTotalCount.className = 'chat-fab-badge hidden';
            chatFab.appendChild(chatTotalCount);
        }
    }

    if (chatTotalCount) {
        if (totalUnreadMessages > 0) {
            chatTotalCount.textContent = totalUnreadMessages > 9 ? '9+' : totalUnreadMessages;
            chatTotalCount.classList.remove('hidden');
        } else {
            chatTotalCount.classList.add('hidden');
        }
    }
}

function openChatModal() {
    teacherChatModal.classList.remove('hidden');
    // Stop pulsing animation when opened
    if (chatFab) {
        chatFab.style.animation = '';
    }
    showChatStudentList();
}

function renderChatStudentList() {
    if (!chatStudentList) return;
    
    chatStudentList.innerHTML = '';
    students.forEach(student => {
        const item = document.createElement('div');
        item.className = 'chat-student-item';
        
        const count = unreadCounts[student.id] || 0;
        const badgeHtml = count > 0 ? `<span class="chat-badge-inline">${count}</span>` : '';
        const avatarBadge = count > 0 ? `<span class="chat-avatar-badge"></span>` : '';

        item.innerHTML = `
            <div style="position: relative; margin-right: 12px;">
                <div class="chat-avatar-small" style="margin-right: 0;">${student.name.charAt(0)}</div>
                ${avatarBadge}
            </div>
            <div class="chat-student-info">
                <span class="chat-student-name">${student.name}</span>
            </div>
            ${badgeHtml}
        `;
        item.onclick = () => openStudentChat(student);
        chatStudentList.appendChild(item);
    });
}

function showChatStudentList() {
    chatStudentListView.classList.remove('hidden');
    chatConversationView.classList.add('hidden');
    if(clearChatBtn) clearChatBtn.classList.add('hidden');
    backToStudentList.classList.add('hidden');
    chatHeaderTitle.textContent = "Chats";
    currentChatPeerId = null;
}

function openStudentChat(student) {
    currentChatPeerId = student.id;
    chatStudentListView.classList.add('hidden');
    chatConversationView.classList.remove('hidden');
    if(clearChatBtn) clearChatBtn.classList.remove('hidden');
    backToStudentList.classList.remove('hidden');
    chatHeaderTitle.textContent = student.name;
    
    // Set local last-read timestamp (Persistence logic copied from student)
    localStorage.setItem(`lastRead_${student.id}`, new Date().toISOString());

    // Clear unread count for this student
    if (unreadCounts[student.id]) {
        unreadCounts[student.id] = 0;
        updateTotalUnreadCount();
        renderChatStudentList();
    }

    loadChatHistory(currentUser.id, student.id);
}

async function loadChatHistory(userId, peerId) {
    if (!teacherChatMessages) return;
    teacherChatMessages.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const messages = await apiFetch(`${API_BASE}/messages/${userId}/${peerId}`);
        teacherChatMessages.innerHTML = '';
        if (messages.length === 0) {
            teacherChatMessages.innerHTML = '<p class="chat-placeholder">No messages yet. Start the conversation!</p>';
        } else {
            messages.forEach(msg => appendChatMessage(msg));
        }
    } catch (error) {
        console.error('Failed to load chat history:', error);
        teacherChatMessages.innerHTML = '<p class="error-message">Could not load chat.</p>';
    }
}

function appendChatMessage(msg) {
    if (!teacherChatMessages) return;

    const placeholder = teacherChatMessages.querySelector('.chat-placeholder, .loading-spinner');
    if (placeholder) placeholder.remove();

    const isSent = msg.sender_id === currentUser.id;
    const messageEl = document.createElement('div');
    messageEl.className = `message-bubble ${isSent ? 'sent' : 'received'}`;
    
    const time = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageEl.innerHTML = `<span>${msg.message}</span><small class="message-time">${time}</small>`;
    
    teacherChatMessages.appendChild(messageEl);

    teacherChatMessages.scrollTop = teacherChatMessages.scrollHeight;
}

function sendChatMessage() {
    const messageText = teacherChatInput.value.trim();
    if (!messageText || currentChatPeerId === null) return;

    const messageData = { sender_id: currentUser.id, receiver_id: currentChatPeerId, message: messageText };
    // Add timestamp for immediate display

    messageData.timestamp = new Date().toISOString();
    
    socket.emit('sendMessage', messageData);

    appendChatMessage(messageData);
    teacherChatInput.value = '';
}

async function fetchUnreadCounts() {
    unreadCounts = {};
    if (!students || students.length === 0) return;

    // Fetch messages for each student to calculate unread counts based on local timestamp
    // This matches the student dashboard notification logic exactly
    await Promise.all(students.map(async (student) => {
        try {
            const messages = await apiFetch(`${API_BASE}/messages/${currentUser.id}/${student.id}`);
            const lastRead = localStorage.getItem(`lastRead_${student.id}`);
            
            let count = 0;
            if (messages && messages.length > 0) {
                if (lastRead) {
                    count = messages.filter(m => m.sender_id === student.id && new Date(m.timestamp) > new Date(lastRead)).length;
                } else {
                    count = messages.filter(m => m.sender_id === student.id).length;
                }
            }
            if (count > 0) unreadCounts[student.id] = count;
        } catch (e) { console.error(e); }
    }));

    updateTotalUnreadCount();
    renderChatStudentList();
}

window.clearCurrentChat = async function() {
    if (currentChatPeerId === null || currentChatPeerId === undefined) return;
    
    if (currentUser.id === undefined || currentUser.id === null) {
        alert('Session invalid. Please log in again.');
        return;
    }

    if (!confirm('Are you sure you want to clear the chat history with this student? This cannot be undone.')) return;

    try {
        await apiFetch(`${API_BASE}/messages/${currentUser.id}/${currentChatPeerId}`, { method: 'DELETE' });
        teacherChatMessages.innerHTML = '<p class="chat-placeholder">Chat history cleared.</p>';
    } catch (error) {
        console.error('Error clearing chat:', error);
        alert('Failed to clear chat history.');
    }
}
// --- Add Test Score Functions ---
window.addTestScore = async function() {
    console.log("Add Test Score button clicked"); // Debugging check
    const studentId = document.getElementById('testStudentId').value;
    const testDate = document.getElementById('testDate').value;
    const tamil = document.getElementById('tamilScore').value;
    const english = document.getElementById('englishScore').value;
    const maths = document.getElementById('mathsScore').value;
    const science = document.getElementById('scienceScore').value;
    const social = document.getElementById('socialScore').value;
    const msgEl = document.getElementById('testScoreMessage');

    if (!studentId || !testDate) {
        msgEl.style.color = '#dc3545';
        msgEl.textContent = '⚠️ Please select a student and a date.';
        return;
    }

    const scores = {
        tamil: parseInt(tamil, 10),
        english: parseInt(english, 10),
        maths: parseInt(maths, 10),
        science: parseInt(science, 10),
        social: parseInt(social, 10)
    };

    // Validate scores
    for (const [subject, score] of Object.entries(scores)) {
        if (isNaN(score) || score < 0 || score > 100) {
            msgEl.style.color = '#dc3545';
            msgEl.textContent = `⚠️ Invalid score for ${subject}. Must be between 0 and 100.`;
            return;
        }
    }

    try {
        msgEl.style.color = '#007bff';
        msgEl.textContent = 'Submitting...';

        await apiFetch(`${API_BASE}/test-scores`, {
            method: 'POST',
            body: JSON.stringify({
                student_id: parseInt(studentId), // Ensure integer
                test_date: testDate,
                ...scores
            })
        });

        msgEl.style.color = '#28a745';
        msgEl.textContent = '✅ Score added successfully! Notification sent to student.';

        // Clear form fields after successful submission
        ['testStudentId', 'testStudentName', 'testDate', 'tamilScore', 'englishScore', 'mathsScore', 'scienceScore', 'socialScore'].forEach(id => document.getElementById(id).value = '');
        setTimeout(() => msgEl.textContent = '', 5000);

    } catch (error) {
        console.error('Error adding test score:', error);
        msgEl.style.color = '#dc3545';
        msgEl.textContent = '❌ Failed to add score. Please try again.';
    }
};

function populateTestStudentDropdown() {
    const select = document.getElementById('testStudentName');
    if (!select) return;
    
    select.innerHTML = '<option value="">Select Student...</option>';
    students.forEach(student => {
        const option = document.createElement('option');
        option.value = student.id;
        option.textContent = student.name;
        select.appendChild(option);
    });
}

window.updateIdFromName = function() {
    const select = document.getElementById('testStudentName');
    const input = document.getElementById('testStudentId');
    if (select && input) input.value = select.value;
}

window.updateNameFromId = function() {
    const select = document.getElementById('testStudentName');
    const input = document.getElementById('testStudentId');
    if (select && input) select.value = input.value;
}

// --- Add Task Functions ---
async function fetchTasks() {
    try {
        tasks = await apiFetch(`${API_BASE}/tasks`);
        renderTasks();
    } catch (error) {
        console.error('Failed to fetch tasks:', error);
    }
}

function renderTasks() {
    const tasksList = document.getElementById('tasksList');
    if (!tasksList) return;

    if (!tasks || tasks.length === 0) {
        tasksList.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">No tasks assigned yet</p>';
        return;
    }

    tasksList.innerHTML = tasks.map(task => `
        <div class="task-card" style="padding: 24px; margin-bottom: 16px; border-left: 4px solid var(--primary);">
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px;">
                <h4 style="color:var(--text-main); margin:0; font-size:1.1rem; font-weight:700;"><i class="fas fa-tasks" style="color:var(--primary); margin-right:10px;"></i> ${task.name}</h4>
                <button onclick="deleteTask('${task._id}')" style="background:transparent; color:var(--danger); border:1px solid #fecaca; padding:6px 12px; border-radius:6px; font-size:0.8rem; transition:all 0.2s;" onmouseover="this.style.background='#fef2f2'">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
            <p style="color:var(--text-secondary); margin:12px 0; line-height:1.6; font-size:0.95rem;">${task.description}</p>
            <div style="display:flex;gap:20px;margin-top:15px;">
                <span style="color:var(--primary); font-weight:600; font-size:0.85rem; background:#e0e7ff; padding:6px 12px; border-radius:6px;"><i class="fas fa-calendar" style="margin-right:5px;"></i> ${task.due_date}</span>
                <span style="color:#0ea5e9; font-weight:600; font-size:0.85rem; background:#e0f2fe; padding:6px 12px; border-radius:6px;"><i class="fas fa-clock" style="margin-right:5px;"></i> ${task.due_time}</span>
            </div>
        </div>
    `).join('');
}

window.addTask = async function() {
    const name = document.getElementById('taskName').value.trim();
    const description = document.getElementById('taskDescription').value.trim();
    const date = document.getElementById('taskDate').value;
    const time = document.getElementById('taskTime').value;
    const msg = document.getElementById('taskMessage');

    if (!name || !description || !date || !time) {
        if(msg) { msg.style.color = '#dc3545'; msg.textContent = '⚠️ Please fill all fields'; }
        else alert('Please fill all fields');
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    if (date < today) {
        if(msg) { msg.style.color = '#dc3545'; msg.textContent = '⚠️ Date cannot be in the past'; }
        else alert('Date cannot be in the past');
        return;
    }

    try {
        await apiFetch(`${API_BASE}/tasks`, {
            method: 'POST',
            body: JSON.stringify({ name, description, due_date: date, due_time: time })
        });
        
        if(msg) {
            msg.style.color = '#28a745';
            msg.textContent = '✅ Task added successfully!';
            setTimeout(() => msg.textContent = '', 3000);
        }

        document.getElementById('taskName').value = '';
        document.getElementById('taskDescription').value = '';
        document.getElementById('taskDate').value = '';
        document.getElementById('taskTime').value = '';

        fetchTasks();
    } catch (error) {
        console.error('Error adding task:', error);
        if(msg) { msg.style.color = '#dc3545'; msg.textContent = '❌ Error adding task.'; }
        else alert('Error adding task.');
    }
}

window.deleteTask = async function(id) {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
        await apiFetch(`${API_BASE}/tasks/${id}`, {
            method: 'DELETE'
        });
        fetchTasks();
    } catch (error) {
        console.error('Error deleting task:', error);
        alert('Failed to delete task.');
    }
}

// --- Study Material Functions ---
async function fetchStudyMaterials() {
    try {
        studyMaterials = await apiFetch(`${API_BASE}/study-materials`);
        renderStudyMaterials();
    } catch (error) {
        console.error('Failed to fetch study materials:', error);
    }
}

function renderStudyMaterials() {
    const list = document.getElementById('materialsList');
    if (!list) return;
    
    if (!studyMaterials || studyMaterials.length === 0) {
        list.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">No materials uploaded yet.</p>';
        return;
    }

    list.innerHTML = studyMaterials.map(material => `
        <div class="material-card" style="padding: 24px; margin-bottom: 16px; border-left: 4px solid #a855f7;">
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px;">
                <h4 style="color:var(--text-main); margin:0; font-size:1.1rem; font-weight:700;"><i class="fas fa-book" style="color:#a855f7; margin-right:10px;"></i> ${material.name}</h4>
                <button onclick="deleteStudyMaterial('${material._id}')" style="background:transparent; color:var(--danger); border:1px solid #fecaca; padding:6px 12px; border-radius:6px; font-size:0.8rem; transition:all 0.2s;" onmouseover="this.style.background='#fef2f2'">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
            <p style="color:var(--text-secondary); margin:12px 0; line-height:1.6; font-size:0.95rem;">${material.description}</p>
            <div style="margin-top:15px;">
                <a href="${material.link}" target="_blank" style="display:inline-block; background:#f3e8ff; color:#7e22ce; font-weight:600; text-decoration:none; padding:8px 20px; border-radius:8px; font-size:0.9rem; transition:all 0.2s;"><i class="fas fa-external-link-alt" style="margin-right:5px;"></i> View Material</a>
            </div>
        </div>
    `).join('');
}

window.addStudyMaterial = async function() {
    const name = document.getElementById('materialName').value.trim();
    const description = document.getElementById('materialDescription').value.trim();
    const link = document.getElementById('materialLink').value.trim();
    const msg = document.getElementById('materialMessage');

    if (!name || !link) {
        if(msg) { msg.style.color = '#dc3545'; msg.textContent = '⚠️ Please provide Name and Link'; }
        else alert('Please provide Name and Link');
        return;
    }

    try {
        await apiFetch(`${API_BASE}/study-materials`, {
            method: 'POST',
            body: JSON.stringify({ name, description, link })
        });
        
        if(msg) {
            msg.style.color = '#28a745';
            msg.textContent = '✅ Material added successfully!';
            setTimeout(() => msg.textContent = '', 3000);
        }

        document.getElementById('materialName').value = '';
        document.getElementById('materialDescription').value = '';
        document.getElementById('materialLink').value = '';

        fetchStudyMaterials();
    } catch (error) {
        console.error('Error adding material:', error);
        if(msg) { msg.style.color = '#dc3545'; msg.textContent = '❌ Error adding material.'; }
        else alert('Error adding material.');
    }
}

window.deleteStudyMaterial = async function(id) {
    if (!confirm('Are you sure you want to delete this material?')) return;

    try {
        await apiFetch(`${API_BASE}/study-materials/${id}`, {
            method: 'DELETE'
        });
        fetchStudyMaterials();
    } catch (error) {
        console.error('Error deleting material:', error);
        alert('Failed to delete material.');
    }
}
