// --- Configuration & State ---
const API_BASE = '/api';
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
    socket = io();
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
    const response = await fetch(url, {
        ...options,
        headers: { ...defaultHeaders, ...options.headers }
    });
    if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
    }
    return response.json();
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
        // Vibrant Soft UI Card Styling
        card.style.cssText = `
        
            background: #FFFFFF;
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.03);
            padding: 24px;
            text-align: center;
            transition: transform 0.2s, box-shadow 0.2s;
            cursor: pointer;
            border: 1px solid #00509fe1;
            display: flex;
            flex-direction: column;
            align-items: center;
            position: relative;
            overflow: hidden;
        `;
        card.onmouseover = function() { 
            this.style.transform = 'translateY(-5px)'; 
            this.style.boxShadow = '0 10px 20px rgba(0,0,0,0.07)'; 
            this.style.borderColor = '#007BFF';
        };
        card.onmouseout = function() { 
            this.style.transform = 'translateY(0)'; 
            this.style.boxShadow = '0 4px 20px rgba(0,0,0,0.03)'; 
            this.style.borderColor = '#DEE2E6';
        };

        // Make the entire card act as a button for better UX
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.onclick = () => showStudentDetails(student.id);
        card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') showStudentDetails(student.id); };
        
        card.innerHTML = `
            <div class="student-avatar" style="width: 72px; height: 72px; background: linear-gradient(135deg, #007BFF, #0056b3); color: white; border-radius: 24px; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 700; margin-bottom: 16px; box-shadow: 0 8px 16px rgba(0, 123, 255, 0.2); transform: rotate(-5deg);">
                ${student.name.charAt(0).toUpperCase()}
            </div>
            <h3 style="margin: 0 0 4px 0; color: #212529; font-size: 1.25rem; font-weight: 700;">${student.name}</h3>
            <p style="margin: 0; color: #6C757D; font-size: 0.875rem; font-weight: 500;">ID: ${student.id}</p>
            <p style="margin: 4px 0 20px 0; color: #94a3b8; font-size: 0.8125rem;">${student.email}</p>
            <div class="view-details-link" style="margin-top: auto; color: #007BFF; font-weight: 600; font-size: 0.875rem; text-decoration: none; padding: 10px 24px; background: #E7F3FF; border-radius: 12px; transition: all 0.2s;">
                View Dashboard
            </div>
        `;
        // Hover effect for the link button inside the card
        const link = card.querySelector('.view-details-link');
        card.addEventListener('mouseover', () => { link.style.background = '#007BFF'; link.style.color = '#ffffff'; });
        card.addEventListener('mouseout', () => { link.style.background = '#E7F3FF'; link.style.color = '#007BFF'; });
        
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

        // Helper for score color
        const getScoreColor = (score) => {
            if (score < 40) return '#f43f5e'; // Soft Red
            if (score < 60) return '#f59e0b'; // Amber
            return '#10b981'; // Emerald
        };
        const getScoreCellStyle = (score) => `padding: 12px; color: ${getScoreColor(score)}; font-weight: 600; text-align: center;`;

        // Filter for teacher remarks (exclude system generated ones)
        const teacherRemarks = remarks.filter(r => 
            !(r.remark.includes('⚠️') || r.remark.includes('✅') || r.remark.includes('❌') || r.remark.includes('🕒') ||
              r.remark.includes('📊') || r.remark.includes('ALERT') || r.remark.includes('IMPROVEMENT') ||
              r.remark.includes('DECLINE') || r.remark.includes('LOWEST') || r.remark.includes('LATE'))
        );

        studentDetailsContainer.innerHTML = `
            <div class="detail-header" style="background: #FFFFFF; padding: 32px; border-radius: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 32px; display: flex; align-items: center; border: 1px solid #DEE2E6; position: relative; overflow: hidden;">
                <div style="position: absolute; top: 0; left: 0; width: 6px; height: 100%; background: #007BFF;"></div>
                <div style="width: 56px; height: 56px; background: #E7F3FF; color: #007BFF; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 24px; margin-right: 20px;">
                    <i class="fas fa-user-graduate"></i>
                </div>
                <div>
                    <h2 style="margin: 0; color: #212529; font-size: 1.75rem; font-weight: 800;">${student.name}</h2>
                    <p style="margin: 4px 0 0; color: #6C757D; font-size: 0.95rem;">Student Dashboard Overview</p>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(450px, 1fr)); gap: 32px; margin-bottom: 32px;">
                <div class="detail-card" style="background: white; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.04); padding: 32px; border: 1px solid #f1f5f9;">
                    <h3 style="color: #334155; margin-top: 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; font-size: 1.25rem; font-weight: 700;"><i class="fas fa-chart-line" style="color: #6366f1; margin-right: 12px;"></i> Test Scores</h3>
                    ${scores.length > 0 ? `
                        <table class="details-table" style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                            <thead>
                                <tr>
                                    <th style="padding: 16px; text-align: left; color: #6C757D; font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #DEE2E6;">Date</th>
                                    <th style="padding: 16px; text-align: center; color: #6C757D; font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #DEE2E6;">Mat</th>
                                    <th style="padding: 16px; text-align: center; color: #6C757D; font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #DEE2E6;">Sci</th>
                                    <th style="padding: 16px; text-align: center; color: #6C757D; font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #DEE2E6;">Soc</th>
                                    <th style="padding: 16px; text-align: center; color: #6C757D; font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #DEE2E6;">Tam</th>
                                    <th style="padding: 16px; text-align: center; color: #6C757D; font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #DEE2E6;">Eng</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${scores.map(s => `
                                    <tr style="border-bottom: 1px solid #E9ECEF; transition: background 0.2s;" onmouseover="this.style.background='#F8F9FA'" onmouseout="this.style.background='transparent'">
                                        <td style="padding: 16px; color: #495057; font-weight: 500;">${s.test_date}</td>
                                        <td style="${getScoreCellStyle(s.maths)}">${s.maths}</td>
                                        <td style="${getScoreCellStyle(s.science)}">${s.science}</td>
                                        <td style="${getScoreCellStyle(s.social)}">${s.social}</td>
                                        <td style="${getScoreCellStyle(s.tamil)}">${s.tamil}</td>
                                        <td style="${getScoreCellStyle(s.english)}">${s.english}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : '<p style="color: #cbd5e0; text-align: center; padding: 40px;">No scores recorded yet.</p>'}
                </div>

                <div class="detail-card" style="background: white; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.04); padding: 32px; border: 1px solid #f1f5f9;">
                    <h3 style="color: #334155; margin-top: 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; font-size: 1.25rem; font-weight: 700;"><i class="fas fa-clock" style="color: #8b5cf6; margin-right: 12px;"></i> Attendance</h3>
                    
                    <div style="display: flex; justify-content: space-around; align-items: center; margin: 20px 0; text-align: center;">
                        <div style="background: #ecfdf5; padding: 15px 25px; border-radius: 16px; min-width: 120px;">
                            <div style="font-size: 2.5rem; font-weight: 800; color: #10b981;">${presentCount}</div>
                            <div style="font-size: 0.8rem; color: #047857; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Present</div>
                        </div>
                        <div style="background: #fff1f2; padding: 15px 25px; border-radius: 16px; min-width: 120px;">
                            <div style="font-size: 2.5rem; font-weight: 800; color: #f43f5e;">${absentCount}</div>
                            <div style="font-size: 0.8rem; color: #BE123C; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Absent</div>
                        </div>
                    </div>

                    <div class="progress-bar" style="position: relative; background: #E9ECEF; border-radius: 9999px; height: 20px; margin-bottom: 24px; overflow: hidden;">
                        <div class="progress-bar-fill" style="width:${attendancePercentage}%; background: #007BFF; height: 100%; transition: width 0.5s ease;"></div>
                        <span style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); color: white; font-weight: bold; font-size: 0.85rem; text-shadow: 1px 1px 2px rgba(0,0,0,0.6);">${attendancePercentage}% Overall</span>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h4 style="margin: 0; color: #64748b; font-size: 0.95rem; font-weight: 600; text-transform: uppercase;">History</h4>
                        <div class="filter-buttons" style="display: flex; gap: 8px;">
                            <button onclick="filterStudentAttendanceHistory('all', this)" class="active" style="padding: 6px 14px; border: 1px solid #e2e8f0; background: #fff; color: #64748b; border-radius: 8px; cursor: pointer; font-size: 0.85rem; transition: all 0.2s;">All</button>
                            <button onclick="filterStudentAttendanceHistory('present', this)" style="padding: 6px 14px; border: 1px solid #e2e8f0; background: #fff; color: #64748b; border-radius: 8px; cursor: pointer; font-size: 0.85rem; transition: all 0.2s;">Present</button>
                            <button onclick="filterStudentAttendanceHistory('absent', this)" style="padding: 6px 14px; border: 1px solid #e2e8f0; background: #fff; color: #64748b; border-radius: 8px; cursor: pointer; font-size: 0.85rem; transition: all 0.2s;">Absent</button>
                        </div>
                    </div>
                    <div class="history-list" style="max-height: 200px; overflow-y: auto; padding-right: 5px;">
                        ${attendance.map(a => `
                            <div class="history-item attendance-history-item" data-status="${a.status}" style="display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid #f8fafc; align-items: center;">
                                <span style="color: #6C757D; font-size: 0.9rem;"><i class="far fa-calendar-alt" style="margin-right: 10px; color: #CED4DA;"></i> ${a.attendance_date}</span>
                                <span style="font-weight: bold; padding: 4px 10px; border-radius: 4px; font-size: 0.85rem; background-color: ${
                                    a.status === 'present' ? '#dcfce7' : '#ffe4e6'
                                }; color: ${a.status === 'present' ? '#166534' : '#be123c'};">
                                    ${a.status.toUpperCase()}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <div class="detail-card" style="background: white; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.04); padding: 32px; border: 1px solid #f1f5f9;">
                <h3 style="color: #334155; margin-top: 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; font-size: 1.25rem; font-weight: 700;"><i class="fas fa-comment-dots" style="color: #f59e0b; margin-right: 12px;"></i> Remarks</h3>
                
                <div class="add-remark-form" style="display: flex; gap: 10px; margin-bottom: 20px;">
                    <input type="text" id="newRemarkInput" placeholder="Type a new remark..." style="flex: 1; padding: 12px 16px; border: 1px solid #CED4DA; border-radius: 10px; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#007BFF'" onblur="this.style.borderColor='#CED4DA'">
                    <button onclick="addRemark(${student.id})" style="background: #007BFF; color: white; border: none; padding: 0 24px; border-radius: 10px; cursor: pointer; font-weight: 600; transition: all 0.2s;">Add</button>
                </div>
                
                <h4 style="margin-bottom: 15px; color: #64748b; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Notes & Feedback</h4>
                <div class="remarks-list">
                    ${teacherRemarks.length > 0 ? `
                        <ul style="list-style: none; padding: 0; display: grid; gap: 12px;">
                            ${teacherRemarks.map(r => `
                                <li style="position: relative; padding: 16px; background: #F8F9FA; border-left: 4px solid #FFC107; border-radius: 8px;">
                                    <p style="margin:0 0 8px 0; color: #495057; line-height: 1.6;">${r.remark}</p>
                                    <small style="color: #6C757D;"><i class="far fa-clock"></i> ${new Date(r.created_at).toLocaleString()}</small>
                                    <button onclick="deleteRemark('${r._id}', ${student.id})" style="position: absolute; top: 50%; right: 15px; transform: translateY(-50%); background: #F8D7DA; color: #721C24; border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" title="Delete Remark" onmouseover="this.style.background='#DC3545'; this.style.color='#fff';" onmouseout="this.style.background='#F8D7DA'; this.style.color='#721C24';">
                                        <i class="fas fa-trash-alt"></i>
                                    </button>
                                </li>
                            `).join('')}
                        </ul>
                    ` : '<p style="color: #a0aec0; font-style: italic; text-align: center; padding: 20px;">No remarks found.</p>'}
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

    const gradient = ctx.createLinearGradient(0, 0, 400, 0);
    gradient.addColorStop(0, '#6366f1'); // Indigo
    gradient.addColorStop(1, '#8b5cf6'); // Violet

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
                backgroundColor: 'rgba(16, 185, 129, 0.75)',
                borderRadius: 20,
            }]
        },
        options: {
            indexAxis: 'y', // This makes it a horizontal bar chart
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${context.raw}%`
                    }
                }
            },
            scales: {
                x: { 
                    beginAtZero: true, 
                    max: 100, 
                    grid: { display: false },
                    title: { display: true, text: 'Average Score (%)', font: { weight: '600' } } 
                },
                y: { 
                    grid: { borderDash: [5, 5], color: '#f1f5f9' },
                    ticks: { font: { weight: '500' } }
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
        const statusMap = {};
        attendanceRecords.forEach(r => statusMap[r.student_id] = r.status);
        tempAttendanceData = statusMap; // Sync local state with DB

        container.innerHTML = students.map(student => {
            const status = tempAttendanceData[student.id];
            return `
            <div id="att-row-${student.id}" style="background:white; padding:20px; border-radius:16px; border:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; box-shadow: 0 4px 6px rgba(0,0,0,0.01); transition: all 0.2s; margin-bottom: 12px;">
                <div>
                    <strong style="color:#1e293b; font-size:1.1rem;">${student.name}</strong> <span style="color:#94a3b8; font-size:0.9rem; margin-left: 8px;">#${student.id}</span>
                </div>
                <div style="display:flex; gap:10px;">
                    <button onclick="markStudentAttendance(${student.id}, 'present')" style="padding:8px 20px; border:none; border-radius:8px; cursor:pointer; font-weight:600; font-size: 0.9rem; transition:all 0.2s; ${status === 'present' ? 'background:#10b981; color:white; box-shadow:0 4px 10px rgba(16,185,129,0.3);' : 'background:#f1f5f9; color:#64748b;'}">Present</button>
                    <button onclick="markStudentAttendance(${student.id}, 'absent')" style="padding:8px 20px; border:none; border-radius:8px; cursor:pointer; font-weight:600; font-size: 0.9rem; transition:all 0.2s; ${status === 'absent' ? 'background:#f43f5e; color:white; box-shadow:0 4px 10px rgba(244,63,94,0.3);' : 'background:#f1f5f9; color:#64748b;'}">Absent</button>
                    <button onclick="saveStudentAttendance(${student.id})" style="padding:8px 16px; border:none; border-radius:8px; cursor:pointer; font-weight:600; transition:all 0.2s; background:linear-gradient(135deg,#6366f1,#4f46e5); color:white; box-shadow:0 4px 10px rgba(79, 70, 229, 0.3);" title="Save Attendance">
                        <i class="fas fa-save"></i>
                    </button>
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
            presentBtn.style.cssText = "padding:8px 20px; border:none; border-radius:8px; cursor:pointer; font-weight:600; font-size: 0.9rem; transition:all 0.2s; background:#10b981; color:white; box-shadow:0 4px 10px rgba(16,185,129,0.3);";
            absentBtn.style.cssText = "padding:8px 20px; border:none; border-radius:8px; cursor:pointer; font-weight:600; font-size: 0.9rem; transition:all 0.2s; background:#f1f5f9; color:#64748b;";
        } else {
            presentBtn.style.cssText = "padding:8px 20px; border:none; border-radius:8px; cursor:pointer; font-weight:600; font-size: 0.9rem; transition:all 0.2s; background:#f1f5f9; color:#64748b;";
            absentBtn.style.cssText = "padding:8px 20px; border:none; border-radius:8px; cursor:pointer; font-weight:600; font-size: 0.9rem; transition:all 0.2s; background:#f43f5e; color:white; box-shadow:0 4px 10px rgba(244,63,94,0.3);";
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

    const messageEl = document.createElement('div');
    const isSent = msg.sender_id === currentUser.id;
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
        <div style="background:white;padding:24px;border-radius:16px;border-left:5px solid #6366f1;box-shadow:0 4px 6px rgba(0,0,0,0.05); margin-bottom: 16px; transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px;">
                <h4 style="color:#1e293b;margin:0;font-family:'Segoe UI',sans-serif;font-size:1.2rem;font-weight:700;"><i class="fas fa-check-circle" style="color:#6366f1;margin-right:10px;"></i> ${task.name}</h4>
                <button onclick="deleteTask('${task._id}')" style="background:#fff;color:#ef4444;border:1px solid #fee2e2;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:0.8rem;transition:all 0.2s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fff'">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
            <p style="color:#64748b;margin:12px 0;line-height:1.6;font-size:0.95rem;">${task.description}</p>
            <div style="display:flex;gap:20px;margin-top:15px;">
                <span style="color:#6366f1;font-weight:600;font-size:0.9rem;background:#e0e7ff;padding:6px 12px;border-radius:8px;"><i class="fas fa-calendar" style="margin-right:5px;"></i> ${task.due_date}</span>
                <span style="color:#0ea5e9;font-weight:600;font-size:0.9rem;background:#e0f2fe;padding:6px 12px;border-radius:8px;"><i class="fas fa-clock" style="margin-right:5px;"></i> ${task.due_time}</span>
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
        <div style="background:white;padding:24px;border-radius:16px;border-left:5px solid #a855f7;box-shadow:0 4px 6px rgba(0,0,0,0.05); margin-bottom: 16px;">
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px;">
                <h4 style="color:#1e293b;margin:0;font-family:'Segoe UI',sans-serif;font-size:1.2rem;font-weight:700;"><i class="fas fa-book" style="color:#a855f7;margin-right:10px;"></i> ${material.name}</h4>
                <button onclick="deleteStudyMaterial('${material._id}')" style="background:#fff;color:#ef4444;border:1px solid #fee2e2;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:0.8rem;transition:all 0.2s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fff'">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
            <p style="color:#64748b;margin:12px 0;line-height:1.6;font-size:0.95rem;">${material.description}</p>
            <div style="margin-top:15px;">
                <a href="${material.link}" target="_blank" style="display:inline-block;background:#f3e8ff;color:#7e22ce;font-weight:600;text-decoration:none;padding:8px 20px;border-radius:10px;transition:all 0.2s;"><i class="fas fa-external-link-alt" style="margin-right:5px;"></i> View Material</a>
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