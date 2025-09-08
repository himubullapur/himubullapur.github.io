// Theme Management
let currentTheme = localStorage.getItem('theme') || 'light';

// Initialize theme on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeTheme();
});

function initializeTheme() {
    const body = document.body;
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = themeToggle.querySelector('i');
    
    // Set initial theme
    body.setAttribute('data-theme', currentTheme);
    
    // Update theme toggle icon
    if (currentTheme === 'dark') {
        themeIcon.className = 'fas fa-sun';
        themeToggle.title = 'Switch to Light Mode';
    } else {
        themeIcon.className = 'fas fa-moon';
        themeToggle.title = 'Switch to Dark Mode';
    }
}

function toggleTheme() {
    const body = document.body;
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = themeToggle.querySelector('i');
    
    // Toggle theme
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    // Apply theme
    body.setAttribute('data-theme', currentTheme);
    
    // Update icon and title
    if (currentTheme === 'dark') {
        themeIcon.className = 'fas fa-sun';
        themeToggle.title = 'Switch to Light Mode';
    } else {
        themeIcon.className = 'fas fa-moon';
        themeToggle.title = 'Switch to Dark Mode';
    }
    
    // Save theme preference
    localStorage.setItem('theme', currentTheme);
    
    // Show notification
    showNotification(`Switched to ${currentTheme} mode`, 'info');
}

function toggleMobileMenu() {
    const navMenu = document.getElementById('nav-menu');
    const menuToggle = document.getElementById('mobile-menu-toggle');
    
    navMenu.classList.toggle('active');
    menuToggle.classList.toggle('active');
}

// Close mobile menu when clicking on nav links
function closeMobileMenu() {
    const navMenu = document.getElementById('nav-menu');
    const menuToggle = document.getElementById('mobile-menu-toggle');
    
    navMenu.classList.remove('active');
    menuToggle.classList.remove('active');
}

// Close mobile menu when clicking outside
document.addEventListener('click', function(event) {
    const navMenu = document.getElementById('nav-menu');
    const menuToggle = document.getElementById('mobile-menu-toggle');
    
    if (!navMenu.contains(event.target) && !menuToggle.contains(event.target)) {
        navMenu.classList.remove('active');
        menuToggle.classList.remove('active');
    }
});

// Firebase Database Functions
let isFirebaseReady = false;
let firebaseListeners = {};

// Wait for Firebase to be ready
function waitForFirebase() {
    return new Promise((resolve) => {
        if (window.firebaseDatabase && window.firebaseRef) {
            isFirebaseReady = true;
            resolve();
        } else {
            setTimeout(() => waitForFirebase().then(resolve), 100);
        }
    });
}

// Firebase Database Functions
async function saveDataToFirebase(data) {
    if (!isFirebaseReady) await waitForFirebase();
    
    try {
            // Clean data for Firebase (remove functions and undefined values)
            const cleanData = {
                jobs: data.jobs || [],
                shortlistedData: data.shortlistedData || [],
                jobShortlisted: data.jobShortlisted || {},
                notifications: (data.notifications || []).map(notification => ({
                    id: notification.id || '',
                    title: notification.title || '',
                    message: notification.message || '',
                    type: notification.type || 'info',
                    timestamp: notification.timestamp || Date.now(),
                    // Remove the action.callback function
                    action: notification.action && notification.action.text ? {
                        text: notification.action.text
                    } : null
                })).filter(notification => notification.id && notification.title), // Remove empty notifications
                admins: data.admins || []
            };
        
        const dataRef = window.firebaseRef(window.firebaseDatabase, 'placementPortalData');
        await window.firebaseSet(dataRef, cleanData);
        console.log('✅ Data saved to Firebase successfully');
        showNotification('Data synced to cloud!', 'success');
    } catch (error) {
        console.error('❌ Error saving to Firebase:', error);
        console.error('Error details:', error.message);
        // Fallback to localStorage
        localStorage.setItem('placementPortalData', JSON.stringify(data));
        showNotification('Using offline mode - data saved locally', 'warning');
    }
}

async function loadDataFromFirebase() {
    if (!isFirebaseReady) await waitForFirebase();
    
    try {
        const dataRef = window.firebaseRef(window.firebaseDatabase, 'placementPortalData');
        const snapshot = await window.firebaseGet(dataRef);
        
        if (snapshot.exists()) {
            const data = snapshot.val();
            
            // Load saved data
            AppState.jobs = data.jobs !== undefined ? data.jobs : [];
            AppState.shortlistedData = data.shortlistedData || [];
            AppState.jobShortlisted = data.jobShortlisted || {};
            
            // Restore notifications with callback functions
            AppState.notifications = (data.notifications || []).map(notification => {
                const restoredNotification = {
                    id: notification.id,
                    title: notification.title,
                    message: notification.message,
                    type: notification.type,
                    timestamp: notification.timestamp || Date.now(),
                    time: notification.time || new Date(notification.timestamp || Date.now()).toISOString(),
                    read: notification.read || false
                };
                
                // Restore action with callback function
                if (notification.action && notification.action.text) {
                    restoredNotification.action = {
                        text: notification.action.text,
                        link: notification.action.link || null,
                        callback: () => {
                            // If there's a link, open it
                            if (notification.action.link) {
                                window.open(notification.action.link, '_blank');
                            } else {
                                // Determine the appropriate callback based on notification content
                                if (notification.action.text.toLowerCase().includes('shortlisted') || 
                                    notification.title.toLowerCase().includes('shortlisted') ||
                                    notification.message.toLowerCase().includes('shortlisted')) {
                                    showShortlistedView();
                                } else if (notification.action.text.toLowerCase().includes('view details') ||
                                          notification.action.text.toLowerCase().includes('details')) {
                                    // Find the job by title or message to restore callback
                                    const job = AppState.jobs.find(j => 
                                        notification.title.includes(j.company) || 
                                        notification.message.includes(j.company) ||
                                        notification.title.includes(j.title) ||
                                        notification.message.includes(j.title)
                                    );
                                    if (job) {
                                        showJobDetail(job.id);
                                    } else {
                                        showNotification('Job details not found', 'error');
                                    }
                                } else {
                                    // Default action for other notifications
                                    showNotification('Action executed', 'info');
                                }
                            }
                        }
                    };
                }
                
                return restoredNotification;
            });
            
            AppState.admins = data.admins || [];
            
            console.log('✅ Data loaded from Firebase - Jobs count:', AppState.jobs.length);
            showNotification('Data loaded from cloud!', 'success');
            
            // Check and update job statuses based on deadlines
            checkAndUpdateJobStatuses();
        } else {
            // First time load - start with empty data
            AppState.jobs = [];
            AppState.shortlistedData = [];
            AppState.jobShortlisted = {};
            AppState.notifications = [];
            AppState.admins = [];
            
            // Save initial empty data
            await saveDataToFirebase({
                jobs: AppState.jobs,
                shortlistedData: AppState.shortlistedData,
                jobShortlisted: AppState.jobShortlisted,
                notifications: AppState.notifications,
                admins: AppState.admins
            });
            console.log('✅ First time load - empty data saved to Firebase');
        }
        
        AppState.filteredJobs = [...AppState.jobs];
        AppState.filteredShortlistedData = [...AppState.shortlistedData];
        
    } catch (error) {
        console.error('❌ Error loading from Firebase:', error);
        console.error('Error details:', error.message);
        showNotification('Using offline mode - loading from local storage', 'warning');
        // Fallback to localStorage
        loadDataFromStorage();
    }
}

// Connection status management
function updateConnectionStatus(status) {
    const indicator = document.getElementById('connection-indicator');
    if (!indicator) return;
    
    const icon = indicator.querySelector('i');
    const text = indicator.querySelector('span');
    
    switch (status) {
        case 'connected':
            indicator.className = 'connection-indicator connected';
            icon.className = 'fas fa-wifi';
            text.textContent = 'Live Sync';
            break;
        case 'connecting':
            indicator.className = 'connection-indicator connecting';
            icon.className = 'fas fa-wifi';
            text.textContent = 'Connecting...';
            break;
        case 'offline':
            indicator.className = 'connection-indicator offline';
            icon.className = 'fas fa-wifi-slash';
            text.textContent = 'Offline Mode';
            break;
        case 'error':
            indicator.className = 'connection-indicator error';
            icon.className = 'fas fa-exclamation-triangle';
            text.textContent = 'Sync Error';
            break;
    }
}

// Real-time listeners for instant updates
function setupFirebaseListeners() {
    if (!isFirebaseReady) {
        updateConnectionStatus('connecting');
        return;
    }
    
    try {
        const dataRef = window.firebaseRef(window.firebaseDatabase, 'placementPortalData');
        
        // Listen for real-time updates
        const unsubscribe = window.firebaseOnValue(dataRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                
                // Update app state
                AppState.jobs = data.jobs || [];
                AppState.shortlistedData = data.shortlistedData || [];
                AppState.jobShortlisted = data.jobShortlisted || {};
                AppState.notifications = data.notifications || [];
                AppState.admins = data.admins || [];
                
                AppState.filteredJobs = [...AppState.jobs];
                AppState.filteredShortlistedData = [...AppState.shortlistedData];
                
                // Update UI if needed
                if (document.getElementById('admin-job-list')) {
                    loadAdminJobList();
                }
                if (document.getElementById('job-listings')) {
                    loadJobs();
                }
                if (document.getElementById('admin-list')) {
                    loadAdminList();
                }
                if (document.getElementById('companies-grid')) {
                    loadCompanyView();
                }
                
                updateConnectionStatus('connected');
                console.log('Real-time update received from Firebase');
            }
        }, (error) => {
            console.error('Firebase listener error:', error);
            updateConnectionStatus('error');
        });
        
        firebaseListeners.data = unsubscribe;
        console.log('Firebase real-time listeners set up');
        
    } catch (error) {
        console.error('Error setting up Firebase listeners:', error);
        updateConnectionStatus('error');
    }
}

// Global State Management
const AppState = {
    currentUser: null,
    jobs: [],
    filteredJobs: [],
    currentJobId: null,
    editingJobId: null,
    shortlistedData: [],
    filteredShortlistedData: [],
    currentCompanyData: [],
    currentCompanyFullData: null,
    showShortlistedBanner: false,
    notifications: [],
    jobShortlisted: {}, // Store shortlisted data per job
    admins: [] // Store admin users
};

// Sample Data - Empty array for clean start
const sampleJobs = [];

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    initializePWA();
});

async function initializeApp() {
    // Load data from Firebase (with localStorage fallback)
    await loadDataFromFirebase();
    
    // Set up real-time listeners
    setupFirebaseListeners();
    
    // Set up offline detection
    setupOfflineDetection();
    
    // Show student dashboard by default
    showStudentDashboard();
    
    // Load jobs
    loadJobs();
    
    // Initialize animations
    animateElements();
    
    // Set up periodic job status checks (every 5 minutes)
    setInterval(checkAndUpdateJobStatuses, 5 * 60 * 1000);
}

// Offline detection and handling
function setupOfflineDetection() {
    // Listen for online/offline events
    window.addEventListener('online', () => {
        console.log('Connection restored');
        updateConnectionStatus('connecting');
        // Try to reconnect to Firebase
        setTimeout(() => {
            setupFirebaseListeners();
        }, 1000);
    });
    
    window.addEventListener('offline', () => {
        console.log('Connection lost');
        updateConnectionStatus('offline');
    });
    
    // Initial connection status
    if (navigator.onLine) {
        updateConnectionStatus('connecting');
    } else {
        updateConnectionStatus('offline');
    }
}

// Data persistence functions (Firebase with localStorage fallback)
async function saveDataToStorage() {
    const dataToSave = {
        jobs: AppState.jobs,
        shortlistedData: AppState.shortlistedData,
        jobShortlisted: AppState.jobShortlisted,
        notifications: AppState.notifications,
        admins: AppState.admins
    };
    
    // Save to Firebase (primary)
    await saveDataToFirebase(dataToSave);
    
    // Also save to localStorage as backup
    try {
        localStorage.setItem('placementPortalData', JSON.stringify(dataToSave));
        console.log('Data saved to localStorage as backup');
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
}

function loadDataFromStorage() {
    try {
        const savedData = localStorage.getItem('placementPortalData');
        if (savedData) {
            const data = JSON.parse(savedData);
            
            // Load saved data (even if empty array - this preserves deletions)
            AppState.jobs = data.jobs !== undefined ? data.jobs : [...sampleJobs];
            AppState.shortlistedData = data.shortlistedData || [];
            AppState.jobShortlisted = data.jobShortlisted || {};
            AppState.notifications = data.notifications || [];
            AppState.admins = data.admins || [];
            
            console.log('Data loaded from localStorage - Jobs count:', AppState.jobs.length);
            console.log('Loaded jobs:', AppState.jobs);
        } else {
            // First time load - start with empty data
            AppState.jobs = [];
            AppState.shortlistedData = [];
            AppState.jobShortlisted = {};
            AppState.notifications = [];
            AppState.admins = [];
            
            // Save initial empty data
            saveDataToStorage();
            console.log('First time load - empty data saved');
        }
        
        AppState.filteredJobs = [...AppState.jobs];
        AppState.filteredShortlistedData = [...AppState.shortlistedData];
        
    } catch (error) {
        console.error('Error loading from localStorage:', error);
        // Fallback to empty data
        AppState.jobs = [];
        AppState.filteredJobs = [];
        AppState.shortlistedData = [];
        AppState.jobShortlisted = {};
        AppState.notifications = [];
        AppState.admins = [];
    }
}


// Debug function to check localStorage data
function debugLocalStorage() {
    const savedData = localStorage.getItem('placementPortalData');
    if (savedData) {
        const data = JSON.parse(savedData);
        console.log('Current localStorage data:', data);
        console.log('Jobs in storage:', data.jobs ? data.jobs.length : 'undefined');
    } else {
        console.log('No data in localStorage');
    }
}

// Make debug function available globally for testing
window.debugLocalStorage = debugLocalStorage;

// Debug function to create a test job
function createTestJob() {
    const testJob = {
        id: 1,
        company: "Test Company",
        title: "Test Position",
        status: "Open",
        deadline: "2024-12-31",
        description: "This is a test job for debugging purposes.",
        salary: "5-7 LPA",
        location: "Test City",
        eligibility: "B.Tech in any field",
        batches: "2024, 2025",
        branches: "CSE, IT, ECE",
        selectionProcess: "Written test followed by interview",
        formLink: "https://forms.google.com/test",
        applicants: []
    };
    
    AppState.jobs.push(testJob);
    AppState.filteredJobs = [...AppState.jobs];
    saveDataToStorage();
    loadAdminJobList();
    loadJobs();
    
    console.log('Test job created:', testJob);
    showNotification('Test job created successfully!', 'success');
}

// Make test function available globally
window.createTestJob = createTestJob;

// Navigation Functions
function showStudentDashboard() {
    hideAllPages();
    document.getElementById('student-dashboard').classList.add('active');
    setActiveNav('student-nav');
    loadJobs();
    checkShortlistedBanner();
    closeMobileMenu();
    loadNotifications();
}

function showAdminLogin() {
    if (AppState.currentUser) {
        showAdminDashboard();
    } else {
        hideAllPages();
        document.getElementById('admin-login').classList.add('active');
        setActiveNav('admin-nav');
    }
    closeMobileMenu();
}

function showAdminDashboard() {
    hideAllPages();
    document.getElementById('admin-dashboard').classList.add('active');
    setActiveNav('admin-nav');
    loadAdminDashboard();
}

function showShortlistedView() {
    hideAllPages();
    document.getElementById('shortlisted-view').classList.add('active');
    setActiveNav('shortlisted-nav');
    closeMobileMenu();
    
    // Update global shortlisted data from job-specific data
    updateGlobalShortlistedData();
    
    // Check if data exists
    if (AppState.shortlistedData.length === 0) {
        document.getElementById('no-shortlisted-data').style.display = 'block';
        document.getElementById('shortlisted-data-section').style.display = 'none';
    } else {
        document.getElementById('no-shortlisted-data').style.display = 'none';
        document.getElementById('shortlisted-data-section').style.display = 'block';
        showCompanyView(); // Show company view by default
    }
}

function hideAllPages() {
    const pages = document.querySelectorAll('.page-content');
    pages.forEach(page => page.classList.remove('active'));
}

function setActiveNav(activeId) {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => link.classList.remove('active'));
    document.getElementById(activeId).classList.add('active');
}

// Student Dashboard Functions
function loadJobs() {
    // Check and update job statuses before displaying
    checkAndUpdateJobStatuses();
    
    const jobListings = document.getElementById('job-listings');
    jobListings.innerHTML = '';
    
    AppState.filteredJobs.forEach((job, index) => {
        const jobCard = createJobCard(job, index);
        jobListings.appendChild(jobCard);
    });
    
    // Animate job cards
    animateJobCards();
}

function createJobCard(job, index) {
    const card = document.createElement('div');
    card.className = 'job-card';
    card.style.animationDelay = `${index * 0.1}s`;
    card.onclick = () => showJobDetail(job.id);
    
    const statusClass = job.status.toLowerCase().replace(' ', '-');
    const formattedDeadline = new Date(job.deadline).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
    
    card.innerHTML = `
        <div class="job-header">
            <div>
                <div class="company-name">${job.company}</div>
                <div class="job-title">${job.title}</div>
            </div>
            <span class="status-badge ${statusClass}">${job.status}</span>
        </div>
        <div class="job-details">
            <div class="job-detail-item">
                <i class="fas fa-calendar-alt"></i>
                <span>Deadline: ${formattedDeadline}</span>
            </div>
            <div class="job-detail-item">
                <i class="fas fa-map-marker-alt"></i>
                <span>${job.location}</span>
            </div>
            <div class="job-detail-item">
                <i class="fas fa-rupee-sign"></i>
                <span>${job.salary}</span>
            </div>
        </div>
        <div class="job-actions">
            <button class="view-details-btn">
                <span>View Details</span>
                <i class="fas fa-arrow-right"></i>
            </button>
        </div>
    `;
    
    return card;
}

function animateJobCards() {
    const cards = document.querySelectorAll('.job-card');
    cards.forEach((card, index) => {
        setTimeout(() => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, index * 100);
    });
}

function filterJobs() {
    const searchTerm = document.getElementById('job-search').value.toLowerCase();
    const statusFilter = document.getElementById('status-filter').value;
    
    AppState.filteredJobs = AppState.jobs.filter(job => {
        const matchesSearch = job.company.toLowerCase().includes(searchTerm) || 
                             job.title.toLowerCase().includes(searchTerm);
        const matchesStatus = !statusFilter || job.status === statusFilter;
        
        return matchesSearch && matchesStatus;
    });
    
    loadJobs();
}

// Job Detail Functions
function showJobDetail(jobId) {
    const job = AppState.jobs.find(j => j.id === jobId);
    if (!job) return;
    
    const modal = document.getElementById('job-detail-modal');
    const content = document.getElementById('job-detail-content');
    
    const formattedDeadline = new Date(job.deadline).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
    
    const statusClass = job.status.toLowerCase().replace(' ', '-');
    
    content.innerHTML = `
        <div class="job-detail-header">
            <div class="job-detail-title">${job.title}</div>
            <div class="job-detail-company">${job.company}</div>
            <span class="status-badge ${statusClass}">${job.status}</span>
        </div>
        
        <div class="job-detail-section">
            <h3><i class="fas fa-info-circle"></i> Job Description</h3>
            <p>${job.description}</p>
        </div>
        
        <div class="job-detail-grid">
            <div class="detail-item">
                <h4><i class="fas fa-calendar-alt"></i> Application Deadline</h4>
                <p>${formattedDeadline}</p>
            </div>
            <div class="detail-item">
                <h4><i class="fas fa-map-marker-alt"></i> Location</h4>
                <p>${job.location}</p>
            </div>
            <div class="detail-item">
                <h4><i class="fas fa-rupee-sign"></i> Salary Range</h4>
                <p>${job.salary}</p>
            </div>
            <div class="detail-item">
                <h4><i class="fas fa-building"></i> Company</h4>
                <p>${job.company}</p>
            </div>
        </div>
        
        <div class="job-detail-grid">
            <div class="detail-item">
                <h4><i class="fas fa-graduation-cap"></i> Eligible Branches</h4>
                <p>${job.branches || 'Not specified'}</p>
            </div>
            <div class="detail-item">
                <h4><i class="fas fa-calendar-check"></i> Eligible Batches</h4>
                <p>${job.batches || 'Not specified'}</p>
            </div>
        </div>
        
        <div class="job-detail-section">
            <h3><i class="fas fa-check-circle"></i> Eligibility Criteria</h3>
            <p>${job.eligibility}</p>
        </div>
        
        ${job.selectionProcess ? `
            <div class="job-detail-section">
                <h3><i class="fas fa-tasks"></i> Selection Process</h3>
                <p>${job.selectionProcess}</p>
            </div>
        ` : ''}
        
        <div class="job-detail-grid">
            <div class="detail-item">
                <h4><i class="fas fa-clock"></i> Status</h4>
                <p><span class="status-badge ${statusClass}">${job.status}</span></p>
            </div>
            <div class="detail-item">
                <h4><i class="fas fa-calendar-alt"></i> Application Deadline</h4>
                <p>${formattedDeadline}</p>
            </div>
        </div>
        
        ${job.status === 'Open' ? `
            <div class="apply-section">
                <div class="apply-header">
                    <h3><i class="fas fa-paper-plane"></i> Ready to Apply?</h3>
                    <p>Click the button below to access the application form</p>
                </div>
                <a href="${job.formLink}" target="_blank" class="apply-btn">
                    <i class="fas fa-external-link-alt"></i>
                    <span>Apply Now</span>
                </a>
                <p class="apply-note">You will be redirected to the company's application form</p>
            </div>
        ` : `
            <div class="apply-section">
                <div class="apply-header">
                    <h3><i class="fas fa-info-circle"></i> Application Status</h3>
                    <p>${job.status === 'Closed' ? 'Applications are no longer being accepted' : 'Applications are currently being reviewed'}</p>
                </div>
                <button class="apply-btn" disabled style="opacity: 0.6; cursor: not-allowed;">
                    <i class="fas fa-times-circle"></i>
                    <span>Applications ${job.status === 'Closed' ? 'Closed' : 'In Review'}</span>
                </button>
            </div>
        `}
    `;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeJobDetail() {
    const modal = document.getElementById('job-detail-modal');
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

// Admin Authentication
function handleAdminLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('admin-username').value;
    const password = document.getElementById('admin-password').value;
    
    // Check against default admin or stored admins
    let isValidAdmin = false;
    
    // Check default admin
    if (username === 'himu' && password === 'Himu*1bca') {
        isValidAdmin = true;
    } else {
        // Check stored admins
        const admin = AppState.admins.find(admin => admin.username === username && admin.password === password);
        if (admin) {
            isValidAdmin = true;
        }
    }
    
    if (isValidAdmin) {
        AppState.currentUser = { username: username, role: 'admin' };
        showNotification('Login successful!', 'success');
        showAdminDashboard();
    } else {
        showNotification('Invalid credentials', 'error');
    }
}

function logout() {
    AppState.currentUser = null;
    showNotification('Logged out successfully', 'info');
    showStudentDashboard();
}

// Admin Dashboard Functions
function loadAdminDashboard() {
    loadAdminJobList();
    loadAdminNotifications();
    loadAdminList();
}


function loadAdminJobList() {
    // Check and update job statuses before displaying
    checkAndUpdateJobStatuses();
    
    const adminJobList = document.getElementById('admin-job-list');
    if (!adminJobList) {
        console.log('admin-job-list element not found, skipping reload');
        return;
    }
    
    adminJobList.innerHTML = '';
    
    AppState.jobs.forEach(job => {
        const jobCard = createAdminJobCard(job);
        adminJobList.appendChild(jobCard);
    });
}

function createAdminJobCard(job) {
    const card = document.createElement('div');
    card.className = 'admin-job-card';
    
    const formattedDeadline = new Date(job.deadline).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
    const statusClass = job.status.toLowerCase().replace(' ', '-');
    const hasShortlisted = AppState.jobShortlisted[job.id] && AppState.jobShortlisted[job.id].length > 0;
    
    card.innerHTML = `
        <div class="admin-job-header">
            <div class="admin-job-info">
                <h4>${job.title}</h4>
                <p>${job.company} • ${job.location} • Deadline: ${formattedDeadline}</p>
                ${hasShortlisted ? `
                    <div class="shortlisted-indicator">
                        <i class="fas fa-users"></i>
                        <span>${AppState.jobShortlisted[job.id].length - 1} candidates shortlisted</span>
                    </div>
                ` : ''}
            </div>
            <div class="admin-job-actions">
                <select class="status-select" onchange="updateJobStatus(${job.id}, this.value)">
                    <option value="Open" ${job.status === 'Open' ? 'selected' : ''}>Open</option>
                    <option value="Interviewing" ${job.status === 'Interviewing' ? 'selected' : ''}>Interviewing</option>
                    <option value="Closed" ${job.status === 'Closed' ? 'selected' : ''}>Closed</option>
                </select>
                <button class="admin-btn edit-btn" onclick="editJob(${job.id})">
                    <i class="fas fa-edit"></i>
                    Edit
                </button>
                <button class="admin-btn shortlist-btn" onclick="showJobShortlistUpload(${job.id})" title="Upload Shortlisted Candidates">
                    <i class="fas fa-user-check"></i>
                    ${hasShortlisted ? 'Update' : 'Shortlist'}
                </button>
                ${hasShortlisted ? `
                    <button class="admin-btn view-shortlist-btn" onclick="viewJobShortlist(${job.id})" title="View Shortlisted Candidates">
                        <i class="fas fa-eye"></i>
                        View
                    </button>
                    <button class="admin-btn delete-shortlist-btn" onclick="deleteJobShortlisted(${job.id})" title="Delete Shortlisted Candidates">
                        <i class="fas fa-user-times"></i>
                        Delete Shortlisted
                    </button>
                ` : ''}
                <button class="admin-btn delete-btn" onclick="deleteJob(${job.id})">
                    <i class="fas fa-trash"></i>
                    Delete
                </button>
            </div>
        </div>
        <div class="admin-job-details">
            <span class="status-badge ${statusClass}">${job.status}</span>
            <span class="job-salary">${job.salary}</span>
        </div>
    `;
    
    return card;
}

// Job Management Functions
function showAddJobModal() {
    AppState.editingJobId = null;
    document.getElementById('job-form-title').textContent = 'Add New Job';
    document.getElementById('job-form').reset();
    document.getElementById('job-form-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function editJob(jobId) {
    const job = AppState.jobs.find(j => j.id === jobId);
    if (!job) return;
    
    AppState.editingJobId = jobId;
    document.getElementById('job-form-title').textContent = 'Edit Job';
    
    // Populate form with job data
    document.getElementById('job-company').value = job.company;
    document.getElementById('job-title').value = job.title;
    // Format deadline for datetime-local input (YYYY-MM-DDTHH:MM)
    const deadlineDate = new Date(job.deadline);
    const formattedDeadline = deadlineDate.toISOString().slice(0, 16);
    document.getElementById('job-deadline').value = formattedDeadline;
    document.getElementById('job-status').value = job.status;
    document.getElementById('job-description').value = job.description;
    document.getElementById('job-salary').value = job.salary;
    document.getElementById('job-location').value = job.location;
    document.getElementById('job-eligibility').value = job.eligibility;
    document.getElementById('job-batches').value = job.batches || '';
    document.getElementById('job-branches').value = job.branches || '';
    document.getElementById('job-selection-process').value = job.selectionProcess || '';
    document.getElementById('job-form-link').value = job.formLink;
    
    document.getElementById('job-form-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function handleJobSubmit(event) {
    event.preventDefault();
    
    const jobData = {
        company: document.getElementById('job-company').value,
        title: document.getElementById('job-title').value,
        deadline: new Date(document.getElementById('job-deadline').value).toISOString(),
        status: document.getElementById('job-status').value,
        description: document.getElementById('job-description').value,
        salary: document.getElementById('job-salary').value,
        location: document.getElementById('job-location').value,
        eligibility: document.getElementById('job-eligibility').value,
        batches: document.getElementById('job-batches').value,
        branches: document.getElementById('job-branches').value,
        selectionProcess: document.getElementById('job-selection-process').value,
        formLink: document.getElementById('job-form-link').value
    };
    
    if (AppState.editingJobId) {
        // Update existing job
        const jobIndex = AppState.jobs.findIndex(j => j.id === AppState.editingJobId);
        AppState.jobs[jobIndex] = { ...AppState.jobs[jobIndex], ...jobData };
        showNotification('Job updated successfully!', 'success');
    } else {
        // Add new job
        const newJob = {
            id: AppState.jobs.length > 0 ? Math.max(...AppState.jobs.map(j => j.id)) + 1 : 1,
            ...jobData,
            applicants: []
        };
        AppState.jobs.push(newJob);
        
        // Add notification for new job
        addNotification({
            type: 'success',
            title: `New Job Opening: ${jobData.title}`,
            message: `${jobData.company} is hiring for ${jobData.title} position. Application deadline: ${new Date(jobData.deadline).toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            })}`,
            action: {
                text: 'View Details',
                callback: () => showJobDetail(newJob.id)
            }
        });
        
        showNotification('Job added successfully!', 'success');
    }
    
    // Update filtered jobs and reload
    AppState.filteredJobs = [...AppState.jobs];
    saveDataToStorage(); // Save to localStorage
    closeJobForm();
    loadAdminJobList();
    loadJobs();
}

function updateJobStatus(jobId, newStatus) {
    const job = AppState.jobs.find(j => j.id === jobId);
    if (job) {
        job.status = newStatus;
        AppState.filteredJobs = [...AppState.jobs];
        
        // Animate status change
        const statusBadge = event.target.closest('.admin-job-card').querySelector('.status-badge');
        statusBadge.style.opacity = '0';
        
        setTimeout(() => {
            statusBadge.textContent = newStatus;
            statusBadge.className = `status-badge ${newStatus.toLowerCase().replace(' ', '-')}`;
            statusBadge.style.opacity = '1';
        }, 150);
        
        loadJobs();
        saveDataToStorage(); // Save to localStorage
        showNotification(`Job status updated to ${newStatus}`, 'success');
    }
}

function deleteJob(jobId) {
    if (confirm('Are you sure you want to delete this job?')) {
        AppState.jobs = AppState.jobs.filter(j => j.id !== jobId);
        AppState.filteredJobs = [...AppState.jobs];
        // Also remove any shortlisted data for this job
        delete AppState.jobShortlisted[jobId];
        
        console.log('Jobs after deletion:', AppState.jobs.length);
        saveDataToStorage(); // Save to localStorage
        console.log('Data saved to localStorage after deletion');
        
        loadAdminJobList();
        loadJobs();
        showNotification('Job deleted successfully!', 'success');
    }
}

function closeJobForm() {
    document.getElementById('job-form-modal').classList.remove('active');
    document.body.style.overflow = 'auto';
    AppState.editingJobId = null;
    
    // Reset form and clear all fields
    document.getElementById('job-form').reset();
    document.getElementById('job-form-title').textContent = 'Add New Job';
}

// File Upload Functions
function showFileUpload(jobId) {
    AppState.currentJobId = jobId;
    document.getElementById('file-upload-modal').classList.add('active');
    document.getElementById('data-viewer').style.display = 'none';
    document.getElementById('upload-progress').style.display = 'none';
    document.body.style.overflow = 'hidden';
}

function closeFileUpload() {
    document.getElementById('file-upload-modal').classList.remove('active');
    document.body.style.overflow = 'auto';
    AppState.currentJobId = null;
}

function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('drop-zone').classList.add('drag-over');
}

function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('drop-zone').classList.remove('drag-over');
}

function handleFileDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('drop-zone').classList.remove('drag-over');
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
}

function handleFileSelect(event) {
    const files = event.target.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
}

function processFile(file) {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.csv')) {
        showNotification('Please select an XLSX or CSV file', 'error');
        return;
    }
    
    // Show upload progress
    document.getElementById('upload-progress').style.display = 'block';
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    
    // Animate progress
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress >= 100) {
            progress = 100;
            clearInterval(progressInterval);
            progressText.textContent = 'Processing...';
            setTimeout(() => {
                readFile(file);
            }, 500);
        }
        progressFill.style.width = progress + '%';
        progressText.textContent = `Uploading... ${Math.floor(progress)}%`;
    }, 100);
}

function readFile(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            let data;
            
            if (file.name.endsWith('.csv')) {
                data = parseCSV(e.target.result);
            } else {
                const workbook = XLSX.read(e.target.result, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            }
            
            displayData(data);
            showNotification('File processed successfully!', 'success');
            
        } catch (error) {
            showNotification('Error processing file: ' + error.message, 'error');
        }
    };
    
    if (file.name.endsWith('.csv')) {
        reader.readAsText(file);
    } else {
        reader.readAsBinaryString(file);
    }
}

function parseCSV(csvText) {
    const lines = csvText.split('\n');
    const result = [];
    
    for (let line of lines) {
        if (line.trim()) {
            result.push(line.split(',').map(cell => cell.trim()));
        }
    }
    
    return result;
}

function displayData(data) {
    if (!data || data.length === 0) {
        showNotification('No data found in file', 'error');
        return;
    }
    
    const dataViewer = document.getElementById('data-viewer');
    const tableHeader = document.getElementById('table-header');
    const tableBody = document.getElementById('table-body');
    
    // Clear previous data
    tableHeader.innerHTML = '';
    tableBody.innerHTML = '';
    
    // Create header
    const headerRow = document.createElement('tr');
    data[0].forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        headerRow.appendChild(th);
    });
    tableHeader.appendChild(headerRow);
    
    // Create body rows
    for (let i = 1; i < data.length; i++) {
        const row = document.createElement('tr');
        row.style.opacity = '0';
        row.style.transform = 'translateY(10px)';
        
        data[i].forEach(cell => {
            const td = document.createElement('td');
            td.textContent = cell || '';
            row.appendChild(td);
        });
        
        tableBody.appendChild(row);
        
        // Animate row appearance
        setTimeout(() => {
            row.style.transition = 'all 0.3s ease';
            row.style.opacity = '1';
            row.style.transform = 'translateY(0)';
        }, i * 50);
    }
    
    // Store applicant data
    const job = AppState.jobs.find(j => j.id === AppState.currentJobId);
    if (job) {
        job.applicants = data;
    }
    
    // Show data viewer
    document.getElementById('upload-progress').style.display = 'none';
    dataViewer.style.display = 'block';
}

// Utility Functions
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Show notification
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    // Hide notification
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

function animateElements() {
    // Animate elements on scroll
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });
    
    // Observe animated elements
    document.querySelectorAll('.animate-slide-up').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'all 0.8s ease';
        observer.observe(el);
    });
}

// Modal close on outside click
document.addEventListener('click', function(event) {
    const modals = document.querySelectorAll('.modal.active');
    modals.forEach(modal => {
        if (event.target === modal) {
            if (modal.id === 'job-detail-modal') {
                closeJobDetail();
            } else if (modal.id === 'job-form-modal') {
                closeJobForm();
            } else if (modal.id === 'file-upload-modal') {
                closeFileUpload();
            } else if (modal.id === 'add-admin-modal') {
                closeAddAdminModal();
            }
        }
    });
});

// Keyboard shortcuts
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const activeModal = document.querySelector('.modal.active');
        if (activeModal) {
            if (activeModal.id === 'job-detail-modal') {
                closeJobDetail();
            } else if (activeModal.id === 'job-form-modal') {
                closeJobForm();
            } else if (activeModal.id === 'file-upload-modal') {
                closeFileUpload();
            } else if (activeModal.id === 'add-admin-modal') {
                closeAddAdminModal();
            }
        }
    }
});

// Shortlisted Candidates Functions
function handleShortlistedFileDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('shortlisted-drop-zone').classList.remove('drag-over');
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        processShortlistedFile(files[0]);
    }
}

function handleShortlistedFileSelect(event) {
    const files = event.target.files;
    if (files.length > 0) {
        processShortlistedFile(files[0]);
    }
}

function processShortlistedFile(file) {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.csv')) {
        showNotification('Please select an XLSX or CSV file', 'error');
        return;
    }
    
    // Show upload progress
    document.getElementById('shortlisted-upload-progress').style.display = 'block';
    const progressFill = document.getElementById('shortlisted-progress-fill');
    const progressText = document.getElementById('shortlisted-progress-text');
    
    // Animate progress
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress >= 100) {
            progress = 100;
            clearInterval(progressInterval);
            progressText.textContent = 'Processing...';
            setTimeout(() => {
                readShortlistedFile(file);
            }, 500);
        }
        progressFill.style.width = progress + '%';
        progressText.textContent = `Uploading... ${Math.floor(progress)}%`;
    }, 100);
}

function readShortlistedFile(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            let data;
            
            if (file.name.endsWith('.csv')) {
                data = parseCSV(e.target.result);
            } else {
                const workbook = XLSX.read(e.target.result, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            }
            
            displayShortlistedData(data);
            showNotification('Shortlisted candidates file processed successfully!', 'success');
            
        } catch (error) {
            showNotification('Error processing file: ' + error.message, 'error');
        }
    };
    
    if (file.name.endsWith('.csv')) {
        reader.readAsText(file);
    } else {
        reader.readAsBinaryString(file);
    }
}

function displayShortlistedData(data) {
    if (!data || data.length === 0) {
        showNotification('No data found in file', 'error');
        return;
    }
    
    // Store the data
    AppState.shortlistedData = data;
    AppState.filteredShortlistedData = data;
    
    // Show notification banner for students
    AppState.showShortlistedBanner = true;
    
    // Add notification for students
    addNotification({
        type: 'success',
        title: 'New Shortlisted Candidates Available!',
        message: `${data.length - 1} candidates have been shortlisted. Check if you're selected!`,
        action: {
            text: 'View Shortlisted',
            callback: () => showShortlistedView()
        }
    });
    
    // Load company view by default
    loadCompanyView();
    
    // Hide upload progress and show data section
    document.getElementById('shortlisted-upload-progress').style.display = 'none';
    document.getElementById('shortlisted-data-section').style.display = 'block';
    document.getElementById('no-shortlisted-data').style.display = 'none';
}


function filterShortlistedCandidates() {
    const searchTerm = document.getElementById('shortlisted-search').value.toLowerCase().trim();
    
    console.log('Search term:', searchTerm);
    console.log('Original data length:', AppState.shortlistedData ? AppState.shortlistedData.length : 0);
    
    if (!AppState.shortlistedData || AppState.shortlistedData.length === 0) return;
    
    if (!searchTerm) {
        AppState.filteredShortlistedData = AppState.shortlistedData;
        console.log('No search term, showing all data');
    } else {
        const filteredRows = AppState.shortlistedData.slice(1).filter(row => {
            const matches = row.some(cell => {
                if (!cell) return false;
                const cellValue = cell.toString().toLowerCase().trim();
                
                console.log('Checking cell:', cellValue, 'against search term:', searchTerm);
                
                // Simple and reliable search: just check if the search term is contained in the cell value
                if (cellValue.includes(searchTerm)) {
                    console.log('Match found!', cellValue, 'contains', searchTerm);
                    return true;
                }
                
                return false;
            });
            
            if (matches) {
                console.log('Match found in row:', row);
            }
            return matches;
        });
        
        AppState.filteredShortlistedData = [
            AppState.shortlistedData[0], // Keep header
            ...filteredRows
        ];
        
        console.log('Filtered data length:', AppState.filteredShortlistedData.length);
        console.log('Filtered rows:', filteredRows.length);
    }
    
    // Update company view
    loadCompanyView();
}


function exportShortlistedData() {
    if (!AppState.shortlistedData || AppState.shortlistedData.length === 0) {
        showNotification('No data to export', 'error');
        return;
    }
    
    // Create CSV content
    const csvContent = AppState.filteredShortlistedData.map(row => {
        return row.map(cell => {
            // Escape quotes and wrap in quotes if contains comma
            const cellStr = String(cell || '');
            if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                return '"' + cellStr.replace(/"/g, '""') + '"';
            }
            return cellStr;
        }).join(',');
    }).join('\n');
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'shortlisted_candidates.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification('Data exported successfully!', 'success');
}

function clearShortlistedData() {
    if (confirm('Are you sure you want to clear all shortlisted data?')) {
        AppState.shortlistedData = [];
        AppState.filteredShortlistedData = [];
        
        document.getElementById('shortlisted-data-section').style.display = 'none';
        document.getElementById('shortlisted-upload-progress').style.display = 'none';
        document.getElementById('shortlisted-file-input').value = '';
        document.getElementById('shortlisted-search').value = '';
        
        // Update admin stats if on admin page
        if (AppState.currentUser) {
            updateShortlistedStats();
        }
        
        showNotification('Shortlisted data cleared successfully!', 'success');
    }
}

// Admin Shortlisted Functions
function updateShortlistedStats() {
    const totalShortlisted = AppState.shortlistedData.length > 0 ? AppState.shortlistedData.length - 1 : 0;
    const companies = new Set();
    
    if (AppState.shortlistedData.length > 1) {
        // Find company column index (assuming it exists)
        const headers = AppState.shortlistedData[0];
        const companyIndex = headers.findIndex(header => 
            header.toLowerCase().includes('company') || 
            header.toLowerCase().includes('organization')
        );
        
        if (companyIndex !== -1) {
            for (let i = 1; i < AppState.shortlistedData.length; i++) {
                if (AppState.shortlistedData[i][companyIndex]) {
                    companies.add(AppState.shortlistedData[i][companyIndex]);
                }
            }
        }
    }
    
    animateCounter('total-shortlisted', totalShortlisted);
    animateCounter('shortlisted-companies', companies.size);
    
    // Show recent shortlisted preview
    showRecentShortlistedPreview();
}

function showRecentShortlistedPreview() {
    const previewSection = document.getElementById('recent-shortlisted-preview');
    const recentList = document.getElementById('recent-shortlisted-list');
    
    if (AppState.shortlistedData.length <= 1) {
        previewSection.style.display = 'none';
        return;
    }
    
    recentList.innerHTML = '';
    
    // Show last 5 entries
    const headers = AppState.shortlistedData[0];
    const nameIndex = headers.findIndex(header => 
        header.toLowerCase().includes('name') || 
        header.toLowerCase().includes('student')
    );
    const companyIndex = headers.findIndex(header => 
        header.toLowerCase().includes('company') || 
        header.toLowerCase().includes('organization')
    );
    const positionIndex = headers.findIndex(header => 
        header.toLowerCase().includes('position') || 
        header.toLowerCase().includes('role') ||
        header.toLowerCase().includes('job')
    );
    
    const recentEntries = AppState.shortlistedData.slice(-6, -1).reverse(); // Last 5 entries
    
    recentEntries.forEach((entry, index) => {
        const item = document.createElement('div');
        item.className = 'recent-item';
        item.style.opacity = '0';
        item.style.transform = 'translateY(10px)';
        
        const name = nameIndex !== -1 ? entry[nameIndex] : 'N/A';
        const company = companyIndex !== -1 ? entry[companyIndex] : 'Unknown Company';
        const position = positionIndex !== -1 ? entry[positionIndex] : 'Position not specified';
        
        item.innerHTML = `
            <div class="recent-item-info">
                <h5>${name}</h5>
                <p>${position}</p>
            </div>
            <div class="recent-item-company">${company}</div>
        `;
        
        recentList.appendChild(item);
        
        // Animate appearance
        setTimeout(() => {
            item.style.transition = 'all 0.3s ease';
            item.style.opacity = '1';
            item.style.transform = 'translateY(0)';
        }, index * 100);
    });
    
    previewSection.style.display = 'block';
}

function showShortlistedUploadModal() {
    document.getElementById('admin-shortlisted-modal').classList.add('active');
    document.getElementById('admin-data-viewer').style.display = 'none';
    document.getElementById('admin-upload-progress').style.display = 'none';
    document.body.style.overflow = 'hidden';
}

function closeAdminShortlistedModal() {
    document.getElementById('admin-shortlisted-modal').classList.remove('active');
    document.body.style.overflow = 'auto';
    
    // Clear form
    document.getElementById('admin-file-input').value = '';
    document.getElementById('admin-data-viewer').style.display = 'none';
    document.getElementById('admin-upload-progress').style.display = 'none';
}

function handleAdminShortlistedDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('admin-drop-zone').classList.remove('drag-over');
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        processAdminShortlistedFile(files[0]);
    }
}

function handleAdminShortlistedSelect(event) {
    const files = event.target.files;
    if (files.length > 0) {
        processAdminShortlistedFile(files[0]);
    }
}

function processAdminShortlistedFile(file) {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.csv')) {
        showNotification('Please select an XLSX or CSV file', 'error');
        return;
    }
    
    // Show upload progress
    document.getElementById('admin-upload-progress').style.display = 'block';
    const progressFill = document.getElementById('admin-progress-fill');
    const progressText = document.getElementById('admin-progress-text');
    
    // Animate progress
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress >= 100) {
            progress = 100;
            clearInterval(progressInterval);
            progressText.textContent = 'Processing...';
            setTimeout(() => {
                readAdminShortlistedFile(file);
            }, 500);
        }
        progressFill.style.width = progress + '%';
        progressText.textContent = `Uploading... ${Math.floor(progress)}%`;
    }, 100);
}

function readAdminShortlistedFile(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            let data;
            
            if (file.name.endsWith('.csv')) {
                data = parseCSV(e.target.result);
            } else {
                const workbook = XLSX.read(e.target.result, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            }
            
            displayAdminShortlistedPreview(data);
            showNotification('File processed successfully! Review and save.', 'success');
            
        } catch (error) {
            showNotification('Error processing file: ' + error.message, 'error');
        }
    };
    
    if (file.name.endsWith('.csv')) {
        reader.readAsText(file);
    } else {
        reader.readAsBinaryString(file);
    }
}

function displayAdminShortlistedPreview(data) {
    if (!data || data.length === 0) {
        showNotification('No data found in file', 'error');
        return;
    }
    
    // Store temporarily for saving
    window.tempShortlistedData = data;
    
    const dataViewer = document.getElementById('admin-data-viewer');
    const tableHeader = document.getElementById('admin-table-header');
    const tableBody = document.getElementById('admin-table-body');
    
    // Clear previous data
    tableHeader.innerHTML = '';
    tableBody.innerHTML = '';
    
    // Create header
    const headerRow = document.createElement('tr');
    data[0].forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        headerRow.appendChild(th);
    });
    tableHeader.appendChild(headerRow);
    
    // Create body rows (show first 10 for preview)
    const previewRows = Math.min(data.length - 1, 10);
    for (let i = 1; i <= previewRows; i++) {
        const row = document.createElement('tr');
        
        data[i].forEach(cell => {
            const td = document.createElement('td');
            td.textContent = cell || '';
            row.appendChild(td);
        });
        
        tableBody.appendChild(row);
    }
    
    if (data.length > 11) {
        const moreRow = document.createElement('tr');
        const moreCell = document.createElement('td');
        moreCell.colSpan = data[0].length;
        moreCell.textContent = `... and ${data.length - 11} more entries`;
        moreCell.style.textAlign = 'center';
        moreCell.style.fontStyle = 'italic';
        moreCell.style.color = '#4a5568';
        moreRow.appendChild(moreCell);
        tableBody.appendChild(moreRow);
    }
    
    // Hide upload progress and show data viewer
    document.getElementById('admin-upload-progress').style.display = 'none';
    dataViewer.style.display = 'block';
}

function saveShortlistedData() {
    if (!window.tempShortlistedData) {
        showNotification('No data to save', 'error');
        return;
    }
    
    // Save to main state
    AppState.shortlistedData = [...window.tempShortlistedData];
    AppState.filteredShortlistedData = [...window.tempShortlistedData];
    
    // Update public shortlisted view if it exists
    if (document.getElementById('shortlisted-data-section')) {
        displayShortlistedData(AppState.shortlistedData);
    }
    
    // Clear temp data
    window.tempShortlistedData = null;
    
    showNotification('Shortlisted data saved successfully!', 'success');
    closeAdminShortlistedModal();
}

function viewAllShortlisted() {
    if (AppState.shortlistedData.length === 0) {
        showNotification('No shortlisted data available. Please upload some data first.', 'info');
        return;
    }
    
    // Switch to shortlisted view
    showShortlistedView();
}

// Enhanced Student Experience Functions
function checkShortlistedBanner() {
    const banner = document.getElementById('shortlisted-notification');
    if (AppState.showShortlistedBanner && AppState.shortlistedData.length > 0) {
        banner.style.display = 'block';
    } else {
        banner.style.display = 'none';
    }
}

function viewShortlistedFromBanner() {
    showShortlistedView();
    dismissBanner();
}

function dismissBanner() {
    AppState.showShortlistedBanner = false;
    document.getElementById('shortlisted-notification').style.display = 'none';
}

function showCompanyView() {
    document.getElementById('company-view').style.display = 'block';
    loadCompanyView();
}


function loadCompanyView() {
    const companiesGrid = document.getElementById('companies-grid');
    if (!companiesGrid) {
        console.log('companies-grid element not found, skipping company view update');
        return;
    }
    
    // First check if we have job-specific shortlists
    const hasJobShortlists = Object.keys(AppState.jobShortlisted).some(jobId => 
        AppState.jobShortlisted[jobId] && AppState.jobShortlisted[jobId].length > 0
    );
    
    if (!hasJobShortlists && (!AppState.shortlistedData || AppState.shortlistedData.length <= 1)) {
        companiesGrid.innerHTML = `
            <div class="no-companies-message">
                <div class="no-data-icon">
                    <i class="fas fa-building"></i>
                </div>
                <h3>No Companies with Shortlisted Candidates</h3>
                <p>Companies will appear here once the admin uploads shortlisted data.</p>
            </div>
        `;
        return;
    }
    
    companiesGrid.innerHTML = '';
    
    // Create company map from job-specific data if available
    const companiesMap = new Map();
    
    if (hasJobShortlists) {
        // Use job-specific data to create company cards
        Object.keys(AppState.jobShortlisted).forEach(jobId => {
            const shortlistData = AppState.jobShortlisted[jobId];
            const job = AppState.jobs.find(j => j.id == jobId);
            
            if (shortlistData && shortlistData.length > 0 && job) {
                const companyName = job.company;
                const candidateCount = shortlistData.length - 1; // Minus header
                
                if (!companiesMap.has(companyName)) {
                    companiesMap.set(companyName, 0);
                }
                companiesMap.set(companyName, companiesMap.get(companyName) + candidateCount);
            }
        });
    } else if (AppState.shortlistedData.length > 1) {
        // Fallback to global shortlisted data - use filtered data if available
        const dataToUse = AppState.filteredShortlistedData && AppState.filteredShortlistedData.length > 0 ? 
                         AppState.filteredShortlistedData : AppState.shortlistedData;
        
        const headers = dataToUse[0];
        const companyIndex = headers.findIndex(header => 
            header.toLowerCase().includes('company') || 
            header.toLowerCase().includes('organization')
        );
        
        if (companyIndex !== -1) {
            for (let i = 1; i < dataToUse.length; i++) {
                const row = dataToUse[i];
                const company = row[companyIndex] || 'Unknown Company';
                
                if (!companiesMap.has(company)) {
                    companiesMap.set(company, 0);
                }
                companiesMap.set(company, companiesMap.get(company) + 1);
            }
        }
    }
    
    // Create company cards
    if (companiesMap.size > 0) {
        let cardIndex = 0;
        companiesMap.forEach((candidateCount, companyName) => {
            const card = createCompanyCard(companyName, candidateCount);
            companiesGrid.appendChild(card);
            
            // Animate card appearance
            setTimeout(() => {
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, cardIndex * 100);
            cardIndex++;
        });
    } else {
        companiesGrid.innerHTML = `
            <div class="no-companies-message">
                <div class="no-data-icon">
                    <i class="fas fa-building"></i>
                </div>
                <h3>No Companies Found</h3>
                <p>Unable to identify companies from the shortlisted data.</p>
            </div>
        `;
    }
}

function createCompanyCard(companyName, candidateCount) {
    const card = document.createElement('div');
    card.className = 'company-card';
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.onclick = () => openCompanyModal(companyName);
    
    // Determine company type for icon
    const companyLower = companyName.toLowerCase();
    let icon = 'fas fa-building';
    if (companyLower.includes('tech') || companyLower.includes('software')) {
        icon = 'fas fa-laptop-code';
    } else if (companyLower.includes('bank') || companyLower.includes('finance')) {
        icon = 'fas fa-university';
    } else if (companyLower.includes('consult')) {
        icon = 'fas fa-handshake';
    }
    
    card.innerHTML = `
        <div class="company-card-header">
            <div class="company-card-icon">
                <i class="${icon}"></i>
            </div>
            <div class="company-card-info">
                <h4>${companyName}</h4>
                <p>Click to view selected candidates</p>
            </div>
        </div>
        <div class="company-card-stats">
            <div class="candidate-count">
                <i class="fas fa-users"></i>
                <span>${candidateCount} candidate${candidateCount !== 1 ? 's' : ''}</span>
            </div>
            <div class="view-arrow">
                <i class="fas fa-arrow-right"></i>
            </div>
        </div>
    `;
    
    return card;
}

function openCompanyModal(companyName) {
    // Get candidates for this company from job-specific data
    const companyCandidates = [];
    let headers = [];
    
    // First try to get data from job-specific shortlists
    Object.keys(AppState.jobShortlisted).forEach(jobId => {
        const shortlistData = AppState.jobShortlisted[jobId];
        const job = AppState.jobs.find(j => j.id == jobId);
        
        if (shortlistData && shortlistData.length > 0 && job && job.company === companyName) {
            if (headers.length === 0) {
                headers = [...shortlistData[0]];
                companyCandidates.push(headers);
            }
            
            // Add all candidates from this job
            for (let i = 1; i < shortlistData.length; i++) {
                companyCandidates.push([...shortlistData[i]]);
            }
        }
    });
    
    // Fallback to global shortlisted data if no job-specific data
    if (companyCandidates.length === 0 && AppState.shortlistedData.length > 0) {
        const globalHeaders = AppState.shortlistedData[0];
        const companyIndex = globalHeaders.findIndex(header => 
            header.toLowerCase().includes('company') || 
            header.toLowerCase().includes('organization')
        );
        
        if (companyIndex !== -1) {
            companyCandidates.push(globalHeaders);
            
            for (let i = 1; i < AppState.shortlistedData.length; i++) {
                const row = AppState.shortlistedData[i];
                if (row[companyIndex] === companyName) {
                    companyCandidates.push(row);
                }
            }
        }
    }
    
    AppState.currentCompanyData = companyCandidates;
    
    // Update modal content
    const candidateCount = Math.max(0, companyCandidates.length - 1);
    document.getElementById('company-modal-name').textContent = companyName;
    document.getElementById('company-modal-count').textContent = 
        `${candidateCount} candidate${candidateCount !== 1 ? 's' : ''} shortlisted`;
    
    // Update company icon
    updateCompanyIcon(companyName);
    
    // Add company description
    updateCompanyDescription(companyName, candidateCount);
    
    // Populate company candidates table
    populateCompanyCandidatesTable(companyCandidates);
    
    // Clear search
    document.getElementById('company-candidate-search').value = '';
    
    // Show modal
    document.getElementById('company-shortlisted-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function updateCompanyIcon(companyName) {
    const iconElement = document.getElementById('company-modal-icon');
    const companyLower = companyName.toLowerCase();
    
    let icon = 'fas fa-building';
    if (companyLower.includes('tech') || companyLower.includes('software')) {
        icon = 'fas fa-laptop-code';
    } else if (companyLower.includes('bank') || companyLower.includes('finance')) {
        icon = 'fas fa-university';
    } else if (companyLower.includes('consult')) {
        icon = 'fas fa-handshake';
    } else if (companyLower.includes('health') || companyLower.includes('medical')) {
        icon = 'fas fa-heartbeat';
    } else if (companyLower.includes('education')) {
        icon = 'fas fa-graduation-cap';
    }
    
    iconElement.innerHTML = `<i class="${icon}"></i>`;
}

function updateCompanyDescription(companyName, candidateCount) {
    const descriptionElement = document.getElementById('company-modal-description');
    
    // Try to find the actual job's selection process first
    let actualSelectionProcess = '';
    const companyJobs = AppState.jobs.filter(job => job.company === companyName);
    
    if (companyJobs.length > 0) {
        // Use the selection process from the first job of this company
        actualSelectionProcess = companyJobs[0].selectionProcess || '';
    }
    
    let description = '';
    
    if (actualSelectionProcess && actualSelectionProcess.trim()) {
        // Use the actual job's selection process
        description = `
            <h5>About the Selection Process:</h5>
            <p>${actualSelectionProcess}</p>
        `;
    } else {
        // Fallback to generic descriptions based on company type
        const companyLower = companyName.toLowerCase();
        
        if (companyLower.includes('tech') || companyLower.includes('software')) {
            description = `
                <h5>About the Selection Process:</h5>
                <p>Technology company with focus on software development and innovation.</p>
                <ul>
                    <li>Technical interview rounds</li>
                    <li>Coding assessments</li>
                    <li>System design discussions</li>
                    <li>HR and cultural fit interview</li>
                </ul>
            `;
        } else if (companyLower.includes('bank') || companyLower.includes('finance')) {
            description = `
                <h5>About the Selection Process:</h5>
                <p>Financial services organization with emphasis on analytical and communication skills.</p>
                <ul>
                    <li>Aptitude and reasoning tests</li>
                    <li>Financial knowledge assessment</li>
                    <li>Group discussions</li>
                    <li>Personal interview</li>
                </ul>
            `;
        } else if (companyLower.includes('consult')) {
            description = `
                <h5>About the Selection Process:</h5>
                <p>Consulting firm focused on problem-solving and client interaction skills.</p>
                <ul>
                    <li>Case study analysis</li>
                    <li>Presentation skills assessment</li>
                    <li>Client simulation exercises</li>
                    <li>Partner interview</li>
                </ul>
            `;
        } else {
            description = `
                <h5>About the Selection Process:</h5>
                <p>Multi-stage selection process to identify the best candidates.</p>
                <ul>
                    <li>Written examination</li>
                    <li>Technical/domain assessment</li>
                    <li>Personal interview</li>
                    <li>Final HR discussion</li>
                </ul>
            `;
        }
    }
    
    descriptionElement.innerHTML = description;
}

function populateCompanyCandidatesTable(data) {
    const tableHeader = document.getElementById('company-candidates-header');
    const tableBody = document.getElementById('company-candidates-body');
    
    console.log('populateCompanyCandidatesTable called with data:', data);
    console.log('Data length:', data ? data.length : 0);
    
    // Clear previous data
    tableHeader.innerHTML = '';
    tableBody.innerHTML = '';
    
    if (!data || data.length === 0) {
        console.log('No data provided to populateCompanyCandidatesTable');
        return;
    }
    
    // Create header
    const headerRow = document.createElement('tr');
    data[0].forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        headerRow.appendChild(th);
    });
    tableHeader.appendChild(headerRow);
    
    // Create body rows
    for (let i = 1; i < data.length; i++) {
        const row = document.createElement('tr');
        row.style.opacity = '0';
        row.style.transform = 'translateY(10px)';
        
        console.log('Creating row for data:', data[i]);
        
        data[i].forEach(cell => {
            const td = document.createElement('td');
            td.textContent = cell || '';
            row.appendChild(td);
        });
        
        tableBody.appendChild(row);
        
        // Animate row appearance
        setTimeout(() => {
            row.style.transition = 'all 0.3s ease';
            row.style.opacity = '1';
            row.style.transform = 'translateY(0)';
        }, i * 100);
    }
}

function filterCompanyCandidates() {
    const searchTerm = document.getElementById('company-candidate-search').value.toLowerCase().trim();
    
    console.log('filterCompanyCandidates: Search term:', searchTerm);
    console.log('filterCompanyCandidates: Current company data:', AppState.currentCompanyData);
    
    if (!AppState.currentCompanyData || AppState.currentCompanyData.length === 0) {
        console.log('filterCompanyCandidates: No company data available');
        return;
    }
    
    let filteredData;
    if (!searchTerm) {
        filteredData = AppState.currentCompanyData;
        console.log('filterCompanyCandidates: No search term, showing all data');
    } else {
        const filteredRows = AppState.currentCompanyData.slice(1).filter(row => {
            const matches = row.some(cell => {
                if (!cell) return false;
                const cellValue = cell.toString().toLowerCase().trim();
                
                console.log('filterCompanyCandidates: Checking cell:', cellValue, 'against search term:', searchTerm);
                
                // Simple and reliable search: just check if the search term is contained in the cell value
                if (cellValue.includes(searchTerm)) {
                    console.log('filterCompanyCandidates: Match found!', cellValue, 'contains', searchTerm);
                    return true;
                }
                
                return false;
            });
            
            if (matches) {
                console.log('filterCompanyCandidates: Match found in row:', row);
            }
            return matches;
        });
        
        filteredData = [
            AppState.currentCompanyData[0], // Keep headers
            ...filteredRows
        ];
        
        console.log('filterCompanyCandidates: Filtered data length:', filteredData.length);
        console.log('filterCompanyCandidates: Filtered rows:', filteredRows.length);
    }
    
    // Update table with filtered data using the proper function
    console.log('filterCompanyCandidates: Calling populateCompanyCandidatesTable with filtered data');
    populateCompanyCandidatesTable(filteredData);
    
    // Show message if no results
    if (filteredData.length <= 1) {
        const noResultsRow = document.createElement('tr');
        const noResultsCell = document.createElement('td');
        noResultsCell.colSpan = AppState.currentCompanyData[0].length;
        noResultsCell.textContent = 'No candidates found matching your search.';
        noResultsCell.style.textAlign = 'center';
        noResultsCell.style.fontStyle = 'italic';
        noResultsCell.style.color = '#4a5568';
        noResultsCell.style.padding = '2rem';
        noResultsRow.appendChild(noResultsCell);
        tableBody.appendChild(noResultsRow);
    }
}

function closeCompanyShortlistedModal() {
    document.getElementById('company-shortlisted-modal').classList.remove('active');
    document.body.style.overflow = 'auto';
    AppState.currentCompanyData = [];
}

// Notification System Functions
function loadNotifications() {
    const notificationsList = document.getElementById('notifications-list');
    
    if (AppState.notifications.length === 0) {
        // Add sample notifications
        addNotification({
            type: 'info',
            title: 'Welcome to DSI Placement Portal',
            message: 'Check this section regularly for important updates about placements and shortlisted candidates.',
            time: new Date().toISOString()
        });
        
        addNotification({
            type: 'success',
            title: 'New Job Opening: Software Engineer',
            message: 'TechCorp is hiring for Software Engineer position. Application deadline: 15 Dec 2024, 11:59 PM',
            time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
            action: {
                text: 'View Details',
                callback: () => showStudentDashboard()
            }
        });
        
        addNotification({
            type: 'success',
            title: 'Shortlist Updated!',
            message: '25 candidates have been shortlisted for the Software Engineer position at TechCorp.',
            time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
            action: {
                text: 'View Shortlist',
                callback: () => showShortlistedView()
            }
        });
    }
    
    displayNotifications();
}

function addNotification(notification) {
    const newNotification = {
        id: Date.now(),
        type: notification.type || 'info',
        title: notification.title,
        message: notification.message,
        timestamp: Date.now(), // Use timestamp for Firebase compatibility
        time: new Date().toISOString(), // Keep time for display
        read: false,
        action: notification.action || null
    };
    
    
    AppState.notifications.unshift(newNotification);
    
    // Keep only last 10 notifications
    if (AppState.notifications.length > 10) {
        AppState.notifications = AppState.notifications.slice(0, 10);
    }
    
    saveDataToStorage(); // Save to localStorage
    displayNotifications();
}

function displayNotifications() {
    const notificationsList = document.getElementById('notifications-list');
    notificationsList.innerHTML = '';
    
    if (AppState.notifications.length === 0) {
        notificationsList.innerHTML = `
            <div class="notification-item">
                <div class="notification-icon info">
                    <i class="fas fa-info-circle"></i>
                </div>
                <div class="notification-content">
                    <h4>No notifications yet</h4>
                    <p>You'll see important updates and announcements here.</p>
                </div>
            </div>
        `;
        return;
    }
    
    AppState.notifications.forEach((notification, index) => {
        const item = document.createElement('div');
        item.className = `notification-item ${!notification.read ? 'unread' : ''}`;
        item.style.opacity = '0';
        item.style.transform = 'translateY(10px)';
        
        const timeAgo = getTimeAgo(notification.time);
        
        item.innerHTML = `
            <div class="notification-icon ${notification.type}">
                <i class="fas fa-${getNotificationIcon(notification.type)}"></i>
            </div>
            <div class="notification-content">
                <h4>${notification.title}</h4>
                <p>${notification.message}</p>
                <div class="notification-time">${timeAgo}</div>
                ${notification.action ? `
                    <div class="notification-action">
                        <button class="notification-btn" onclick="executeNotificationAction('${notification.id}')">
                            ${notification.action.text}
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
        
        // Mark as read when clicked
        item.onclick = () => markNotificationRead(notification.id);
        
        notificationsList.appendChild(item);
        
        // Animate appearance
        setTimeout(() => {
            item.style.transition = 'all 0.3s ease';
            item.style.opacity = '1';
            item.style.transform = 'translateY(0)';
        }, index * 100);
    });
}

function getNotificationIcon(type) {
    switch (type) {
        case 'success': return 'check-circle';
        case 'warning': return 'exclamation-triangle';
        case 'info': return 'info-circle';
        default: return 'bell';
    }
}

function getTimeAgo(timestamp) {
    if (!timestamp) return 'Just now';
    
    const now = new Date();
    let time;
    
    // Handle different timestamp formats
    if (typeof timestamp === 'string') {
        time = new Date(timestamp);
    } else if (typeof timestamp === 'number') {
        time = new Date(timestamp);
    } else {
        time = new Date();
    }
    
    // Check if the date is valid
    if (isNaN(time.getTime())) {
        return 'Just now';
    }
    
    const diffInMs = now - time;
    const diffInMins = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    if (diffInMins < 1) return 'Just now';
    if (diffInMins < 60) return `${diffInMins} minute${diffInMins !== 1 ? 's' : ''} ago`;
    if (diffInHours < 24) return `${diffInHours} hour${diffInHours !== 1 ? 's' : ''} ago`;
    return `${diffInDays} day${diffInDays !== 1 ? 's' : ''} ago`;
}

function markNotificationRead(notificationId) {
    const notification = AppState.notifications.find(n => n.id === notificationId);
    if (notification) {
        notification.read = true;
        displayNotifications();
    }
}

function markAllNotificationsRead() {
    AppState.notifications.forEach(notification => {
        notification.read = true;
    });
    displayNotifications();
    showNotification('All notifications marked as read', 'success');
}

function executeNotificationAction(notificationId) {
    // Prevent event bubbling
    if (event) {
        event.stopPropagation();
    }
    
    // Convert notificationId to number for comparison
    const id = parseInt(notificationId);
    
    const notification = AppState.notifications.find(n => n.id === id);
    
    if (notification && notification.action && notification.action.callback) {
        try {
            notification.action.callback();
            markNotificationRead(id);
        } catch (error) {
            console.error('Error executing notification action:', error);
            showNotification('Error executing action. Please try again.', 'error');
        }
    } else {
        // Try to restore callback if it's missing
        if (notification && notification.action && notification.action.text) {
            // Restore callback based on action text
            if (notification.action.text.toLowerCase().includes('shortlisted') || 
                notification.title.toLowerCase().includes('shortlisted') ||
                notification.message.toLowerCase().includes('shortlisted')) {
                showShortlistedView();
                markNotificationRead(id);
            } else if (notification.action.text.toLowerCase().includes('view details') || 
                      notification.action.text.toLowerCase().includes('details')) {
                // Try to find job by notification content
                const job = AppState.jobs.find(j => 
                    notification.title.includes(j.company) || 
                    notification.message.includes(j.company) ||
                    notification.title.includes(j.title) ||
                    notification.message.includes(j.title)
                );
                if (job) {
                    showJobDetail(job.id);
                    markNotificationRead(id);
                } else {
                    showNotification('Job details not found', 'error');
                }
            } else {
                showNotification('Action executed', 'info');
                markNotificationRead(id);
            }
        } else {
            showNotification('Action not available for this notification.', 'error');
        }
    }
}

// Job-Specific Shortlist Functions
function showJobShortlistUpload(jobId) {
    const job = AppState.jobs.find(j => j.id === jobId);
    if (!job) {
        showNotification('Job not found. Please try again.', 'error');
        return;
    }
    
    AppState.currentJobId = jobId;
    
    // Store job ID in modal data attribute for persistence
    const modal = document.getElementById('job-shortlist-modal');
    modal.setAttribute('data-job-id', jobId);
    
    // Update modal content
    document.getElementById('job-shortlist-title').textContent = 
        AppState.jobShortlisted[jobId] ? 'Update Shortlisted Candidates' : 'Upload Shortlisted Candidates';
    document.getElementById('job-shortlist-subtitle').textContent = `${job.company} • ${job.title}`;
    
    // Reset modal state
    document.getElementById('job-shortlist-data-viewer').style.display = 'none';
    document.getElementById('job-shortlist-upload-progress').style.display = 'none';
    document.getElementById('job-shortlist-file-input').value = '';
    
    // Show modal
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeJobShortlistModal() {
    document.getElementById('job-shortlist-modal').classList.remove('active');
    document.body.style.overflow = 'auto';
    AppState.currentJobId = null;
    
    // Reset form but keep data-job-id attribute for persistence
    document.getElementById('job-shortlist-file-input').value = '';
    document.getElementById('job-shortlist-data-viewer').style.display = 'none';
    document.getElementById('job-shortlist-upload-progress').style.display = 'none';
}

function handleJobShortlistDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('job-shortlist-drop-zone').classList.remove('drag-over');
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        processJobShortlistFile(files[0]);
    }
}

function handleJobShortlistFileSelect(event) {
    const files = event.target.files;
    if (files.length > 0) {
        processJobShortlistFile(files[0]);
    }
}

function processJobShortlistFile(file) {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.csv')) {
        showNotification('Please select an XLSX or CSV file', 'error');
        return;
    }
    
    // Show upload progress
    document.getElementById('job-shortlist-upload-progress').style.display = 'block';
    const progressFill = document.getElementById('job-shortlist-progress-fill');
    const progressText = document.getElementById('job-shortlist-progress-text');
    
    // Animate progress
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress >= 100) {
            progress = 100;
            clearInterval(progressInterval);
            progressText.textContent = 'Processing...';
            setTimeout(() => {
                readJobShortlistFile(file);
            }, 500);
        }
        progressFill.style.width = progress + '%';
        progressText.textContent = `Uploading... ${Math.floor(progress)}%`;
    }, 100);
}

function readJobShortlistFile(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            let data;
            
            if (file.name.endsWith('.csv')) {
                data = parseCSV(e.target.result);
            } else {
                const workbook = XLSX.read(e.target.result, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            }
            
            displayJobShortlistPreview(data);
            showNotification('File processed successfully! Review and save.', 'success');
            
        } catch (error) {
            showNotification('Error processing file: ' + error.message, 'error');
        }
    };
    
    if (file.name.endsWith('.csv')) {
        reader.readAsText(file);
    } else {
        reader.readAsBinaryString(file);
    }
}

function displayJobShortlistPreview(data) {
    if (!data || data.length === 0) {
        showNotification('No data found in file', 'error');
        return;
    }
    
    // Store temporarily for saving
    window.tempJobShortlistData = data;
    
    const dataViewer = document.getElementById('job-shortlist-data-viewer');
    const tableHeader = document.getElementById('job-shortlist-table-header');
    const tableBody = document.getElementById('job-shortlist-table-body');
    
    // Clear previous data
    tableHeader.innerHTML = '';
    tableBody.innerHTML = '';
    
    // Create header
    const headerRow = document.createElement('tr');
    data[0].forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        headerRow.appendChild(th);
    });
    tableHeader.appendChild(headerRow);
    
    // Create body rows (show first 10 for preview)
    const previewRows = Math.min(data.length - 1, 10);
    for (let i = 1; i <= previewRows; i++) {
        const row = document.createElement('tr');
        
        data[i].forEach(cell => {
            const td = document.createElement('td');
            td.textContent = cell || '';
            row.appendChild(td);
        });
        
        tableBody.appendChild(row);
    }
    
    if (data.length > 11) {
        const moreRow = document.createElement('tr');
        const moreCell = document.createElement('td');
        moreCell.colSpan = data[0].length;
        moreCell.textContent = `... and ${data.length - 11} more entries`;
        moreCell.style.textAlign = 'center';
        moreCell.style.fontStyle = 'italic';
        moreCell.style.color = '#4a5568';
        moreRow.appendChild(moreCell);
        tableBody.appendChild(moreRow);
    }
    
    // Hide upload progress and show data viewer
    document.getElementById('job-shortlist-upload-progress').style.display = 'none';
    dataViewer.style.display = 'block';
}

function saveJobShortlistData() {
    try {
        // Validate data exists
        if (!window.tempJobShortlistData) {
            showNotification('Please upload a file first', 'error');
            return;
        }
        
        // Get job ID from modal data attribute or AppState
        let jobId = AppState.currentJobId;
        
        // If currentJobId is null, try to get it from modal data attribute
        if (!jobId) {
            const modal = document.getElementById('job-shortlist-modal');
            const modalJobId = modal.getAttribute('data-job-id');
            if (modalJobId) {
                jobId = parseInt(modalJobId);
            }
        }
        
        if (!jobId) {
            showNotification('Please select a job first', 'error');
            return;
        }
        
        // Find job
        jobId = parseInt(jobId);
        const job = AppState.jobs.find(j => j.id === jobId);
        
        if (!job) {
            showNotification('Job not found. Please try again.', 'error');
            return;
        }
        
        // Save data
        if (!AppState.jobShortlisted) {
            AppState.jobShortlisted = {};
        }
        
        AppState.jobShortlisted[jobId] = window.tempJobShortlistData.slice();
        
        // Update global data
        updateGlobalShortlistedData();
        
        // Add notification for students
        addNotification({
            type: 'success',
            title: `${job.company} Shortlist Updated!`,
            message: `${window.tempJobShortlistData.length - 1} candidates shortlisted for ${job.title} position.`,
            action: {
                text: 'View Shortlist',
                callback: () => showShortlistedView()
            }
        });
        
        // Clear temp data
        window.tempJobShortlistData = null;
        
        // Save to localStorage
        saveDataToStorage();
        
        // Reload admin interface (only if on admin page)
        if (document.getElementById('admin-job-list')) {
            loadAdminJobList();
        }
        
        // Show success
        showNotification(`Successfully saved ${AppState.jobShortlisted[jobId].length - 1} shortlisted candidates!`, 'success');
        
        // Close modal
        closeJobShortlistModal();
        
    } catch (error) {
        console.error('Save error:', error);
        showNotification('Error saving data: ' + error.message, 'error');
    }
}

function updateGlobalShortlistedData() {
    // Combine all job shortlists into global shortlisted data
    const allShortlisted = [];
    let headers = [];
    
    // Check if we have any job-specific shortlisted data
    const hasJobShortlists = Object.keys(AppState.jobShortlisted).some(jobId => 
        AppState.jobShortlisted[jobId] && AppState.jobShortlisted[jobId].length > 0
    );
    
    if (hasJobShortlists) {
        Object.keys(AppState.jobShortlisted).forEach(jobId => {
            const shortlistData = AppState.jobShortlisted[jobId];
            if (shortlistData && shortlistData.length > 0) {
                if (headers.length === 0) {
                    // Add company column to headers if not exists
                    headers = [...shortlistData[0]];
                    if (!headers.some(h => h.toLowerCase().includes('company'))) {
                        headers.unshift('Company');
                    }
                    allShortlisted.push(headers);
                }
                
                const job = AppState.jobs.find(j => j.id == jobId);
                const companyName = job ? job.company : 'Unknown Company';
                
                // Add data rows with company name
                for (let i = 1; i < shortlistData.length; i++) {
                    const row = [...shortlistData[i]];
                    if (!headers.some(h => h.toLowerCase().includes('company'))) {
                        row.unshift(companyName);
                    }
                    allShortlisted.push(row);
                }
            }
        });
        
        AppState.shortlistedData = allShortlisted;
        AppState.filteredShortlistedData = allShortlisted;
        AppState.showShortlistedBanner = true;
    }
    
    // Update shortlisted view if needed
    if (allShortlisted.length > 0) {
        // Update company view if it's visible
        const companyView = document.getElementById('company-view');
        if (companyView && companyView.style.display !== 'none') {
            loadCompanyView();
        }
        // Note: populateTableView function doesn't exist, so we skip this
        // populateTableView(allShortlisted);
    }
}

function viewJobShortlist(jobId) {
    const job = AppState.jobs.find(j => j.id === jobId);
    const shortlistData = AppState.jobShortlisted[jobId];
    
    if (!job || !shortlistData) {
        showNotification('No shortlist data found for this job', 'error');
        return;
    }
    
    AppState.currentJobId = jobId;
    
    // Update modal content
    document.getElementById('job-shortlist-view-title').textContent = 'Shortlisted Candidates';
    document.getElementById('job-shortlist-view-subtitle').textContent = `${job.company} • ${job.title}`;
    document.getElementById('job-shortlist-view-count').textContent = 
        `${shortlistData.length - 1} candidate${shortlistData.length !== 2 ? 's' : ''} shortlisted`;
    
    // Populate table
    populateJobShortlistViewTable(shortlistData);
    
    // Clear search
    document.getElementById('job-shortlist-search').value = '';
    
    // Show modal
    document.getElementById('job-shortlist-view-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function populateJobShortlistViewTable(data) {
    const tableHeader = document.getElementById('job-shortlist-view-header-table');
    const tableBody = document.getElementById('job-shortlist-view-body');
    
    // Clear previous data
    tableHeader.innerHTML = '';
    tableBody.innerHTML = '';
    
    // Create header
    const headerRow = document.createElement('tr');
    data[0].forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        headerRow.appendChild(th);
    });
    tableHeader.appendChild(headerRow);
    
    // Create body rows
    for (let i = 1; i < data.length; i++) {
        const row = document.createElement('tr');
        
        data[i].forEach(cell => {
            const td = document.createElement('td');
            td.textContent = cell || '';
            row.appendChild(td);
        });
        
        tableBody.appendChild(row);
        
        // Animate row appearance
        setTimeout(() => {
            row.style.opacity = '1';
            row.style.transform = 'translateY(0)';
        }, i * 50);
    }
}

function filterJobShortlistCandidates() {
    const searchTerm = document.getElementById('job-shortlist-search').value.toLowerCase().trim();
    const originalData = AppState.jobShortlisted[AppState.currentJobId];
    
    if (!originalData) return;
    
    let filteredData;
    if (!searchTerm) {
        filteredData = originalData;
    } else {
        filteredData = [
            originalData[0], // Keep headers
            ...originalData.slice(1).filter(row => {
                return row.some(cell => {
                    if (!cell) return false;
                    const cellValue = cell.toString().toLowerCase().trim();
                    // Check for exact match, contains match, or partial word match
                    return cellValue === searchTerm || 
                           cellValue.includes(searchTerm) ||
                           cellValue.split(/\s+/).some(word => word.includes(searchTerm));
                });
            })
        ];
    }
    
    populateJobShortlistViewTable(filteredData);
}

function exportJobShortlistData() {
    const shortlistData = AppState.jobShortlisted[AppState.currentJobId];
    const job = AppState.jobs.find(j => j.id === AppState.currentJobId);
    
    if (!shortlistData || !job) {
        showNotification('No data to export', 'error');
        return;
    }
    
    // Create CSV content
    const csvContent = shortlistData.map(row => {
        return row.map(cell => {
            const cellStr = String(cell || '');
            if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                return '"' + cellStr.replace(/"/g, '""') + '"';
            }
            return cellStr;
        }).join(',');
    }).join('\n');
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${job.company}_${job.title}_shortlisted.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification('Shortlist data exported successfully!', 'success');
}

function deleteJobShortlistData() {
    if (!AppState.currentJobId) return;
    
    const job = AppState.jobs.find(j => j.id === AppState.currentJobId);
    if (!job) return;
    
    if (confirm(`Are you sure you want to delete the shortlist for ${job.company} - ${job.title}?`)) {
        delete AppState.jobShortlisted[AppState.currentJobId];
        
        // Update global shortlisted data
        updateGlobalShortlistedData();
        
        // Reload admin job list
        loadAdminJobList();
        
        showNotification('Shortlist deleted successfully!', 'success');
        closeJobShortlistViewModal();
    }
}

function closeJobShortlistViewModal() {
    document.getElementById('job-shortlist-view-modal').classList.remove('active');
    document.body.style.overflow = 'auto';
    AppState.currentJobId = null;
}

// Admin Notifications Functions
function loadAdminNotifications() {
    const adminNotificationsList = document.getElementById('admin-notifications-list');
    
    if (AppState.notifications.length === 0) {
        adminNotificationsList.innerHTML = `
            <div class="admin-notification-item">
                <div class="admin-notification-icon info">
                    <i class="fas fa-info-circle"></i>
                </div>
                <div class="admin-notification-content">
                    <h5>No notifications posted yet</h5>
                    <p>Use the "Post New Notification" button to add announcements for students.</p>
                </div>
            </div>
        `;
        return;
    }
    
    // Show recent 5 notifications
    const recentNotifications = AppState.notifications.slice(0, 5);
    adminNotificationsList.innerHTML = '';
    
    recentNotifications.forEach(notification => {
        const item = document.createElement('div');
        item.className = 'admin-notification-item';
        
        const timeAgo = getTimeAgo(notification.time);
        
        item.innerHTML = `
            <div class="admin-notification-icon ${notification.type}">
                <i class="fas fa-${getNotificationIcon(notification.type)}"></i>
            </div>
            <div class="admin-notification-content">
                <h5>${notification.title}</h5>
                <p>${notification.message}</p>
                <div class="admin-notification-time">${timeAgo}</div>
            </div>
        `;
        
        adminNotificationsList.appendChild(item);
    });
}

function showAddNotificationModal() {
    document.getElementById('add-notification-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Add event listener for action checkbox
    document.getElementById('notification-action-enabled').onchange = function() {
        const actionSection = document.getElementById('notification-action-section');
        actionSection.style.display = this.checked ? 'block' : 'none';
    };
}

function showEditNotificationModal() {
    // Add event listener for action checkbox
    document.getElementById('edit-notification-action-enabled').onchange = function() {
        const actionSection = document.getElementById('edit-notification-action-section');
        actionSection.style.display = this.checked ? 'block' : 'none';
    };
}

function closeAddNotificationModal() {
    document.getElementById('add-notification-modal').classList.remove('active');
    document.body.style.overflow = 'auto';
    document.getElementById('notification-form').reset();
    document.getElementById('notification-action-section').style.display = 'none';
}

function handleNotificationSubmit(event) {
    event.preventDefault();
    
    const type = document.getElementById('notification-type').value;
    const title = document.getElementById('notification-title').value;
    const message = document.getElementById('notification-message').value;
    const actionEnabled = document.getElementById('notification-action-enabled').checked;
    const actionText = document.getElementById('notification-action-text').value;
    const actionLink = document.getElementById('notification-action-link').value;
    
    const notificationData = {
        type: type,
        title: title,
        message: message
    };
    
    if (actionEnabled && actionText) {
        notificationData.action = {
            text: actionText,
            link: actionLink || null,
            callback: actionLink ? 
                () => window.open(actionLink, '_blank') : 
                () => showNotification('Action clicked!', 'info')
        };
    }
    
    addNotification(notificationData);
    showNotification('Notification posted successfully!', 'success');
    
    closeAddNotificationModal();
    loadAdminNotifications();
}

// All Notifications Management Functions
function showAllNotificationsModal() {
    document.getElementById('all-notifications-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
    loadAllNotifications();
}

function closeAllNotificationsModal() {
    document.getElementById('all-notifications-modal').classList.remove('active');
    document.body.style.overflow = 'auto';
}

function loadAllNotifications() {
    const allNotificationsList = document.getElementById('all-notifications-list');
    
    if (AppState.notifications.length === 0) {
        allNotificationsList.innerHTML = `
            <div class="admin-notification-item-full">
                <div class="admin-notification-content-full">
                    <h5>No notifications posted yet</h5>
                    <p>Use the "Post New Notification" button to add announcements for students.</p>
                </div>
            </div>
        `;
        return;
    }
    
    allNotificationsList.innerHTML = '';
    
    AppState.notifications.forEach(notification => {
        const item = document.createElement('div');
        item.className = 'admin-notification-item-full';
        
        const timeAgo = getTimeAgo(notification.time);
        const typeBadge = getNotificationTypeBadge(notification.type);
        
        item.innerHTML = `
            <div class="admin-notification-icon ${notification.type}">
                <i class="fas fa-${getNotificationIcon(notification.type)}"></i>
            </div>
            <div class="admin-notification-content-full">
                <div class="notification-type-badge ${notification.type}">${typeBadge}</div>
                <h5>${notification.title}</h5>
                <p>${notification.message}</p>
                <div class="admin-notification-time-full">${timeAgo}</div>
            </div>
            <div class="admin-notification-actions">
                <button class="notification-action-btn edit-notification-btn" onclick="editNotification(${notification.id})" title="Edit Notification">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="notification-action-btn delete-notification-btn" onclick="deleteNotification(${notification.id})" title="Delete Notification">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        allNotificationsList.appendChild(item);
    });
}

function getNotificationTypeBadge(type) {
    switch(type) {
        case 'info': return 'Information';
        case 'success': return 'Success';
        case 'warning': return 'Warning';
        default: return 'Info';
    }
}

function editNotification(notificationId) {
    const notification = AppState.notifications.find(n => n.id === notificationId);
    if (!notification) return;
    
    // Populate edit form
    document.getElementById('edit-notification-id').value = notificationId;
    document.getElementById('edit-notification-type').value = notification.type;
    document.getElementById('edit-notification-title').value = notification.title;
    document.getElementById('edit-notification-message').value = notification.message;
    
    // Handle action button
    if (notification.action && notification.action.text) {
        document.getElementById('edit-notification-action-enabled').checked = true;
        document.getElementById('edit-notification-action-text').value = notification.action.text;
        document.getElementById('edit-notification-action-link').value = notification.action.link || '';
        document.getElementById('edit-notification-action-section').style.display = 'block';
    } else {
        document.getElementById('edit-notification-action-enabled').checked = false;
        document.getElementById('edit-notification-action-text').value = '';
        document.getElementById('edit-notification-action-link').value = '';
        document.getElementById('edit-notification-action-section').style.display = 'none';
    }
    
    // Show edit modal
    document.getElementById('edit-notification-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
    showEditNotificationModal();
}

function closeEditNotificationModal() {
    document.getElementById('edit-notification-modal').classList.remove('active');
    document.body.style.overflow = 'auto';
}

function handleEditNotificationSubmit(event) {
    event.preventDefault();
    
    const notificationId = parseInt(document.getElementById('edit-notification-id').value);
    const type = document.getElementById('edit-notification-type').value;
    const title = document.getElementById('edit-notification-title').value;
    const message = document.getElementById('edit-notification-message').value;
    const actionEnabled = document.getElementById('edit-notification-action-enabled').checked;
    const actionText = document.getElementById('edit-notification-action-text').value;
    const actionLink = document.getElementById('edit-notification-action-link').value;
    
    // Find and update the notification
    const notificationIndex = AppState.notifications.findIndex(n => n.id === notificationId);
    if (notificationIndex === -1) {
        showNotification('Notification not found', 'error');
        return;
    }
    
    const updatedNotification = {
        ...AppState.notifications[notificationIndex],
        type: type,
        title: title,
        message: message
    };
    
    if (actionEnabled && actionText) {
        updatedNotification.action = {
            text: actionText,
            link: actionLink || null,
            callback: actionLink ? 
                () => window.open(actionLink, '_blank') : 
                () => showNotification('Action clicked!', 'info')
        };
    } else {
        updatedNotification.action = null;
    }
    
    AppState.notifications[notificationIndex] = updatedNotification;
    
    // Save to storage
    saveDataToStorage();
    
    showNotification('Notification updated successfully!', 'success');
    
    closeEditNotificationModal();
    loadAdminNotifications();
    loadAllNotifications();
    displayNotifications(); // Update student view
}

function deleteNotification(notificationId) {
    if (!confirm('Are you sure you want to delete this notification? This action cannot be undone.')) {
        return;
    }
    
    const notificationIndex = AppState.notifications.findIndex(n => n.id === notificationId);
    if (notificationIndex === -1) {
        showNotification('Notification not found', 'error');
        return;
    }
    
    AppState.notifications.splice(notificationIndex, 1);
    
    // Save to storage
    saveDataToStorage();
    
    showNotification('Notification deleted successfully!', 'success');
    
    loadAdminNotifications();
    loadAllNotifications();
    displayNotifications(); // Update student view
}


// Check and update job statuses based on deadlines
function checkAndUpdateJobStatuses() {
    const currentTime = new Date();
    let updatedJobs = false;
    
    AppState.jobs.forEach(job => {
        const deadline = new Date(job.deadline);
        
        // If deadline has passed and job is still "Open", change to "Interviewing"
        if (deadline < currentTime && job.status === 'Open') {
            job.status = 'Interviewing';
            updatedJobs = true;
            console.log(`Job "${job.title}" at ${job.company} automatically moved to Interviewing status (deadline passed)`);
        }
    });
    
    // Save changes if any jobs were updated
    if (updatedJobs) {
        saveDataToStorage();
        showNotification('Some jobs have been automatically moved to Interviewing status (deadlines passed)', 'info');
        
        // Update admin dashboard if it's currently displayed
        if (document.getElementById('admin-dashboard').style.display !== 'none') {
            loadAdminJobList();
        }
        
        // Update student dashboard if it's currently displayed
        if (document.getElementById('student-dashboard').style.display !== 'none') {
            displayJobs();
        }
    }
}

// Delete shortlisted candidates for a specific job
function deleteJobShortlisted(jobId) {
    const job = AppState.jobs.find(j => j.id === jobId);
    if (!job) {
        showNotification('Job not found', 'error');
        return;
    }
    
    const shortlistedCount = AppState.jobShortlisted[jobId] ? AppState.jobShortlisted[jobId].length - 1 : 0;
    
    if (shortlistedCount === 0) {
        showNotification('No shortlisted candidates to delete for this job', 'info');
        return;
    }
    
    const confirmMessage = `Are you sure you want to delete all shortlisted candidates for "${job.title}" at ${job.company}?\n\nThis will remove ${shortlistedCount} shortlisted candidates.\n\nThis action cannot be undone!`;
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    // Remove shortlisted candidates for this job from the main shortlisted data
    if (AppState.jobShortlisted[jobId]) {
        const jobShortlistedIds = AppState.jobShortlisted[jobId].slice(1); // Skip header row
        
        // Remove candidates from main shortlisted data
        AppState.shortlistedData = AppState.shortlistedData.filter(candidate => 
            !jobShortlistedIds.includes(candidate.id)
        );
        
        // Clear the job shortlisted data
        delete AppState.jobShortlisted[jobId];
    }
    
    // Save to storage
    saveDataToStorage();
    
    showNotification(`Successfully deleted ${shortlistedCount} shortlisted candidates for ${job.company}`, 'success');
    
    // Update admin dashboard
    loadAdminJobList();
    
    // Update student view if they're viewing shortlisted data
    if (document.getElementById('shortlisted-view').style.display !== 'none') {
        displayShortlistedData();
    }
}

// Company Modal Functions
function viewFullCompanyList() {
    const companyName = document.getElementById('company-modal-name').textContent;
    
    // Get all shortlisted data for this company
    const allCompanyData = [];
    let headers = [];
    
    Object.keys(AppState.jobShortlisted).forEach(jobId => {
        const shortlistData = AppState.jobShortlisted[jobId];
        const job = AppState.jobs.find(j => j.id == jobId);
        
        if (shortlistData && shortlistData.length > 0 && job && job.company === companyName) {
            if (headers.length === 0) {
                headers = [...shortlistData[0]];
                allCompanyData.push(headers);
            }
            
            // Add all candidates from this job
            for (let i = 1; i < shortlistData.length; i++) {
                allCompanyData.push([...shortlistData[i]]);
            }
        }
    });
    
    AppState.currentCompanyFullData = allCompanyData;
    
    // Update full list modal
    document.getElementById('full-list-company-name').textContent = companyName;
    populateFullCompanyListTable(allCompanyData);
    
    // Close company modal and show full list modal
    document.getElementById('company-shortlisted-modal').classList.remove('active');
    document.getElementById('full-company-list-modal').classList.add('active');
}

function populateFullCompanyListTable(data) {
    const tableHeader = document.getElementById('full-company-list-header');
    const tableBody = document.getElementById('full-company-list-body');
    
    // Clear previous data
    tableHeader.innerHTML = '';
    tableBody.innerHTML = '';
    
    if (!data || data.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="100%" style="text-align: center; padding: 2rem; color: #4a5568;">
                    No data available
                </td>
            </tr>
        `;
        return;
    }
    
    // Create header
    const headerRow = document.createElement('tr');
    data[0].forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        headerRow.appendChild(th);
    });
    tableHeader.appendChild(headerRow);
    
    // Create body rows
    for (let i = 1; i < data.length; i++) {
        const row = document.createElement('tr');
        
        data[i].forEach(cell => {
            const td = document.createElement('td');
            td.textContent = cell || '';
            row.appendChild(td);
        });
        
        tableBody.appendChild(row);
    }
}

function filterFullCompanyList() {
    const searchTerm = document.getElementById('full-list-search').value.toLowerCase().trim();
    const originalData = AppState.currentCompanyFullData;
    
    if (!originalData) return;
    
    let filteredData;
    if (!searchTerm) {
        filteredData = originalData;
    } else {
        filteredData = [
            originalData[0], // Keep headers
            ...originalData.slice(1).filter(row => {
                return row.some(cell => {
                    if (!cell) return false;
                    const cellValue = cell.toString().toLowerCase().trim();
                    // Check for exact match, contains match, or partial word match
                    return cellValue === searchTerm || 
                           cellValue.includes(searchTerm) ||
                           cellValue.split(/\s+/).some(word => word.includes(searchTerm));
                });
            })
        ];
    }
    
    populateFullCompanyListTable(filteredData);
}

function exportFullCompanyList() {
    const companyName = document.getElementById('full-list-company-name').textContent;
    const data = AppState.currentCompanyFullData;
    
    if (!data || data.length === 0) {
        showNotification('No data to export', 'error');
        return;
    }
    
    // Create CSV content
    const csvContent = data.map(row => {
        return row.map(cell => {
            const cellStr = String(cell || '');
            if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                return '"' + cellStr.replace(/"/g, '""') + '"';
            }
            return cellStr;
        }).join(',');
    }).join('\n');
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${companyName}_all_shortlisted.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification('Full company list exported successfully!', 'success');
}

function closeFullCompanyListModal() {
    document.getElementById('full-company-list-modal').classList.remove('active');
    document.body.style.overflow = 'auto';
    AppState.currentCompanyFullData = null;
}

// Admin Management Functions
function loadAdminList() {
    const adminList = document.getElementById('admin-list');
    if (!adminList) {
        console.log('admin-list element not found, skipping admin list load');
        return;
    }
    
    adminList.innerHTML = '';
    
    // Add default admin
    const defaultAdmin = {
        id: 'default',
        username: 'himu',
        email: 'admin@dsi.com',
        isDefault: true,
        createdDate: new Date().toISOString()
    };
    
    const allAdmins = [defaultAdmin, ...AppState.admins];
    
    allAdmins.forEach(admin => {
        const adminCard = createAdminCard(admin);
        adminList.appendChild(adminCard);
    });
}

function createAdminCard(admin) {
    const card = document.createElement('div');
    card.className = 'admin-card';
    
    const createdDate = new Date(admin.createdDate).toLocaleDateString('en-IN');
    
    card.innerHTML = `
        <div class="admin-card-header">
            <div class="admin-card-info">
                <h4>${admin.username}</h4>
                <p>${admin.email || 'No email provided'}</p>
                <span class="admin-role">${admin.isDefault ? 'Default Admin' : 'Admin'}</span>
            </div>
            <div class="admin-card-actions">
                ${!admin.isDefault ? `
                    <button class="admin-btn delete-btn" onclick="deleteAdmin('${admin.id}')" title="Delete Admin">
                        <i class="fas fa-trash"></i>
                        Delete
                    </button>
                ` : `
                    <span class="default-admin-badge">Default</span>
                `}
            </div>
        </div>
        <div class="admin-card-details">
            <span class="admin-created">Created: ${createdDate}</span>
        </div>
    `;
    
    return card;
}

function showAddAdminModal() {
    document.getElementById('add-admin-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
    document.getElementById('admin-form').reset();
}

function closeAddAdminModal() {
    document.getElementById('add-admin-modal').classList.remove('active');
    document.body.style.overflow = 'auto';
    document.getElementById('admin-form').reset();
}

function handleAdminSubmit(event) {
    event.preventDefault();
    
    const username = document.getElementById('new-admin-username').value;
    const password = document.getElementById('new-admin-password').value;
    const email = document.getElementById('new-admin-email').value;
    
    // Check if username already exists
    const existingAdmin = AppState.admins.find(admin => admin.username === username);
    if (existingAdmin || username === 'himu') {
        showNotification('Username already exists. Please choose a different username.', 'error');
        return;
    }
    
    // Create new admin
    const newAdmin = {
        id: Date.now().toString(),
        username: username,
        password: password,
        email: email,
        createdDate: new Date().toISOString()
    };
    
    AppState.admins.push(newAdmin);
    saveDataToStorage();
    loadAdminList();
    
    showNotification(`Admin "${username}" added successfully!`, 'success');
    closeAddAdminModal();
}

function deleteAdmin(adminId) {
    const admin = AppState.admins.find(admin => admin.id === adminId);
    if (!admin) return;
    
    if (confirm(`Are you sure you want to delete admin "${admin.username}"?`)) {
        AppState.admins = AppState.admins.filter(admin => admin.id !== adminId);
        saveDataToStorage();
        loadAdminList();
        showNotification(`Admin "${admin.username}" deleted successfully!`, 'success');
    }
}

// ==================== PWA FUNCTIONALITY ====================

// PWA State
const PWAState = {
    isInstalled: false,
    isOnline: navigator.onLine,
    deferredPrompt: null,
    registration: null
};

// Initialize PWA
async function initializePWA() {
    console.log('Initializing PWA...');
    
    // Register service worker
    await registerServiceWorker();
    
    // Set up install prompt
    setupInstallPrompt();
    
    // Set up online/offline detection
    setupOnlineDetection();
    
    // Request notification permission
    requestNotificationPermission();
    
    // Set up push notifications
    setupPushNotifications();
}

// Register Service Worker
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered successfully:', registration);
            PWAState.registration = registration;
            
            // Listen for updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdateNotification();
                    }
                });
            });
            
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }
}

// Set up install prompt
function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
        console.log('Install prompt triggered');
        e.preventDefault();
        PWAState.deferredPrompt = e;
        showInstallPrompt();
    });
    
    // Check if app is already installed
    window.addEventListener('appinstalled', () => {
        console.log('PWA was installed');
        PWAState.isInstalled = true;
        hideInstallPrompt();
        showNotification('App installed successfully! You can now access it from your home screen.', 'success');
    });
}

// Show install prompt
function showInstallPrompt() {
    // Create install banner
    const installBanner = document.createElement('div');
    installBanner.id = 'install-banner';
    installBanner.className = 'install-banner';
    installBanner.innerHTML = `
        <div class="install-banner-content">
            <div class="install-banner-icon">
                <i class="fas fa-download"></i>
            </div>
            <div class="install-banner-text">
                <h4>Install DSI Placement Portal</h4>
                <p>Add to your home screen for quick access</p>
            </div>
            <div class="install-banner-actions">
                <button onclick="installApp()" class="install-btn">
                    <i class="fas fa-plus"></i>
                    Install
                </button>
                <button onclick="hideInstallPrompt()" class="install-dismiss">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(installBanner);
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
        if (document.getElementById('install-banner')) {
            hideInstallPrompt();
        }
    }, 10000);
}

// Hide install prompt
function hideInstallPrompt() {
    const banner = document.getElementById('install-banner');
    if (banner) {
        banner.remove();
    }
}

// Install app
async function installApp() {
    if (PWAState.deferredPrompt) {
        PWAState.deferredPrompt.prompt();
        const { outcome } = await PWAState.deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        PWAState.deferredPrompt = null;
        hideInstallPrompt();
    }
}

// Set up online/offline detection
function setupOnlineDetection() {
    window.addEventListener('online', () => {
        PWAState.isOnline = true;
        updateConnectionStatus('connected');
        showNotification('You are back online!', 'success');
    });
    
    window.addEventListener('offline', () => {
        PWAState.isOnline = false;
        updateConnectionStatus('offline');
        showNotification('You are offline. Some features may be limited.', 'warning');
    });
}

// Request notification permission
async function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        try {
            const permission = await Notification.requestPermission();
            console.log('Notification permission:', permission);
        } catch (error) {
            console.error('Error requesting notification permission:', error);
        }
    }
}

// Set up push notifications
async function setupPushNotifications() {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
        try {
            const registration = await navigator.serviceWorker.ready;
            
            // Check if already subscribed
            let subscription = await registration.pushManager.getSubscription();
            
            if (!subscription) {
                // Create a new subscription with proper VAPID key
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array('BEl62iUYgUivxIkv69yViEuiBIa40HIcFyVjZvKUKMeaF5Q5F9LGHo9YvuoON0qmxR1y8HyT3uJZikOqStn6yI8')
                });
            }
            
            console.log('Push subscription:', subscription);
            
            // Store subscription for server-side notifications
            localStorage.setItem('pushSubscription', JSON.stringify(subscription));
            
            // Send subscription to server (you'll need to implement this endpoint)
            await sendSubscriptionToServer(subscription);
            
        } catch (error) {
            console.error('Error setting up push notifications:', error);
        }
    }
}

// Send subscription to server
async function sendSubscriptionToServer(subscription) {
    try {
        // This would typically send to your backend server
        // For now, we'll store it locally and use it for local notifications
        console.log('Subscription ready for server:', subscription);
        
        // You can implement this to send to your Firebase or other backend
        // await fetch('/api/subscribe', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify(subscription)
        // });
        
    } catch (error) {
        console.error('Error sending subscription to server:', error);
    }
}

// Convert VAPID key
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Show update notification
function showUpdateNotification() {
    const updateBanner = document.createElement('div');
    updateBanner.className = 'update-banner';
    updateBanner.innerHTML = `
        <div class="update-banner-content">
            <div class="update-banner-icon">
                <i class="fas fa-sync-alt"></i>
            </div>
            <div class="update-banner-text">
                <h4>Update Available</h4>
                <p>A new version of the app is ready</p>
            </div>
            <div class="update-banner-actions">
                <button onclick="updateApp()" class="update-btn">
                    <i class="fas fa-download"></i>
                    Update
                </button>
                <button onclick="hideUpdateBanner()" class="update-dismiss">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(updateBanner);
}

// Update app
function updateApp() {
    if (PWAState.registration && PWAState.registration.waiting) {
        PWAState.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        window.location.reload();
    }
}

// Hide update banner
function hideUpdateBanner() {
    const banner = document.querySelector('.update-banner');
    if (banner) {
        banner.remove();
    }
}

// Send push notification (for testing)
function sendTestNotification() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
            registration.showNotification('🎉 DSI Placement Portal', {
                body: 'New job opportunity available! Check out the latest openings.',
                icon: '/DSi.png',
                badge: '/DSi.png',
                tag: 'job-notification',
                requireInteraction: true,
                silent: false,
                vibrate: [200, 100, 200],
                data: {
                    url: '/',
                    timestamp: Date.now()
                },
                actions: [
                    {
                        action: 'view',
                        title: 'View Jobs',
                        icon: '/DSi.png'
                    },
                    {
                        action: 'dismiss',
                        title: 'Dismiss'
                    }
                ]
            });
        });
    }
}

// Send job notification
function sendJobNotification(jobTitle, companyName) {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
            registration.showNotification('🚀 New Job Posted!', {
                body: `${jobTitle} at ${companyName} - Apply now!`,
                icon: '/DSi.png',
                badge: '/DSi.png',
                tag: 'new-job',
                requireInteraction: true,
                silent: false,
                vibrate: [200, 100, 200],
                data: {
                    url: '/',
                    jobTitle: jobTitle,
                    company: companyName,
                    timestamp: Date.now()
                },
                actions: [
                    {
                        action: 'apply',
                        title: 'Apply Now',
                        icon: '/DSi.png'
                    },
                    {
                        action: 'view',
                        title: 'View Details',
                        icon: '/DSi.png'
                    }
                ]
            });
        });
    }
}

// Send deadline reminder
function sendDeadlineReminder(jobTitle, deadline) {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
            registration.showNotification('⏰ Application Deadline Soon!', {
                body: `${jobTitle} - Deadline: ${deadline}`,
                icon: '/DSi.png',
                badge: '/DSi.png',
                tag: 'deadline-reminder',
                requireInteraction: true,
                silent: false,
                vibrate: [300, 100, 300],
                data: {
                    url: '/',
                    jobTitle: jobTitle,
                    deadline: deadline,
                    timestamp: Date.now()
                },
                actions: [
                    {
                        action: 'apply',
                        title: 'Apply Now',
                        icon: '/DSi.png'
                    }
                ]
            });
        });
    }
}

// Check notification permission and show status
function checkNotificationStatus() {
    if ('Notification' in window) {
        const permission = Notification.permission;
        console.log('Notification permission:', permission);
        
        if (permission === 'granted') {
            showNotification('✅ Notifications enabled! You will receive job updates.', 'success');
        } else if (permission === 'denied') {
            showNotification('❌ Notifications blocked. Please enable them in browser settings.', 'warning');
        } else {
            showNotification('🔔 Click to enable notifications for job updates.', 'info');
        }
        
        return permission;
    }
    return 'not-supported';
}
