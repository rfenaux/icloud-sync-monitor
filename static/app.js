/**
 * iCloud Sync Monitor - Enhanced Dashboard JavaScript
 * Features: Animated counters, live timestamps, sparklines, file icons,
 * favicon badges, notifications, activity feed, speed indicator,
 * dark mode, stuck file detection, health score, containers
 */

const API_BASE = '';
const WS_URL = `ws://${window.location.hostname}:8431`;

let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 3000;

// State tracking
let lastUpdate = new Date();
let lastDownloads = 0;
let lastUploads = 0;
let lastBytesDown = 0;
let lastBytesUp = 0;
let isSyncing = false;
let notificationsEnabled = false;
let lastErrorCount = 0;

// Sparkline data (last 60 data points = 5 minutes at 5s intervals)
const sparklineData = {
    downloads: [],
    uploads: [],
    errors: []
};
const MAX_SPARKLINE_POINTS = 60;

// Activity feed (last 20 items)
const activityFeed = [];
const MAX_ACTIVITY_ITEMS = 20;

// Stuck file tracking (persisted in localStorage)
const STUCK_THRESHOLD_MINUTES = 10;
const STUCK_SEVERE_MINUTES = 30;
let fileFirstSeen = JSON.parse(localStorage.getItem('fileFirstSeen') || '{}');
let stuckFiles = [];
let dismissedStuckFiles = JSON.parse(localStorage.getItem('dismissedStuckFiles') || '{}');

// Container icons mapping
const CONTAINER_ICONS = {
    'com.apple.CloudDocs': { name: 'iCloud Drive', icon: '📁' },
    'com.apple.photos.cloud': { name: 'Photos', icon: '📷' },
    'com.apple.Notes': { name: 'Notes', icon: '📝' },
    'com.apple.reminders': { name: 'Reminders', icon: '✓' },
    'com.apple.Safari': { name: 'Safari', icon: '🧭' },
    'com.apple.mail': { name: 'Mail', icon: '✉️' },
    'com.apple.Preview': { name: 'Preview', icon: '🖼️' },
    'com.apple.TextEdit': { name: 'TextEdit', icon: '📄' },
};

// DOM Elements
const elements = {
    headerIcon: document.getElementById('header-icon'),
    connectionIndicator: document.getElementById('connection-indicator'),
    connectionText: document.getElementById('connection-text'),
    speedIndicator: document.getElementById('speed-indicator'),
    cardDownloads: document.getElementById('card-downloads'),
    cardUploads: document.getElementById('card-uploads'),
    cardErrors: document.getElementById('card-errors'),
    downloadsCount: document.getElementById('downloads-count'),
    downloadsTotal: document.getElementById('downloads-total'),
    uploadsCount: document.getElementById('uploads-count'),
    uploadsTotal: document.getElementById('uploads-total'),
    errorsCount: document.getElementById('errors-count'),
    quotaText: document.getElementById('quota-text'),
    quotaFill: document.getElementById('quota-fill'),
    transfersList: document.getElementById('transfers-list'),
    activityFeed: document.getElementById('activity-feed'),
    errorsList: document.getElementById('errors-list'),
    lastUpdate: document.getElementById('last-update'),
    statusText: document.getElementById('status-text'),
    toastContainer: document.getElementById('toast-container'),
    sparklineDownloads: document.getElementById('sparkline-downloads'),
    sparklineUploads: document.getElementById('sparkline-uploads'),
    sparklineErrors: document.getElementById('sparkline-errors'),
    // New Phase 3 elements
    themeToggle: document.getElementById('theme-toggle'),
    themeIcon: document.getElementById('theme-icon'),
    healthScore: document.getElementById('health-score'),
    healthScoreValue: document.getElementById('health-score-value'),
    stuckAlert: document.getElementById('stuck-alert'),
    stuckAlertTitle: document.getElementById('stuck-alert-title'),
    stuckAlertSubtitle: document.getElementById('stuck-alert-subtitle'),
    stuckFilesList: document.getElementById('stuck-files-list'),
    containersGrid: document.getElementById('containers-grid'),
};

// File type icons (SVG inline)
const FILE_ICONS = {
    pdf: '📄',
    image: '🖼️',
    video: '🎬',
    audio: '🎵',
    document: '📝',
    spreadsheet: '📊',
    code: '💻',
    archive: '📦',
    default: '📁'
};

const FILE_EXTENSIONS = {
    pdf: ['pdf'],
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp', 'heic'],
    video: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'],
    audio: ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg'],
    document: ['doc', 'docx', 'txt', 'rtf', 'pages', 'odt'],
    spreadsheet: ['xls', 'xlsx', 'csv', 'numbers'],
    code: ['js', 'ts', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'json', 'html', 'css'],
    archive: ['zip', 'tar', 'gz', 'rar', '7z', 'dmg']
};

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
    initDarkMode();
    fetchInitialData();
    fetchContainers();
    connectWebSocket();
    startTimestampTicker();
    requestNotificationPermission();
    cleanupOldStuckTracking();

    // Initialize sparklines
    drawSparkline(elements.sparklineDownloads, [], '#4da8da');
    drawSparkline(elements.sparklineUploads, [], '#4ade80');
    drawSparkline(elements.sparklineErrors, [], '#fb923c');
});

// ==================== DATA FETCHING ====================

async function fetchInitialData() {
    try {
        const [status, downloads, uploads, errors] = await Promise.all([
            fetch(`${API_BASE}/api/status`).then(r => r.json()),
            fetch(`${API_BASE}/api/downloads`).then(r => r.json()),
            fetch(`${API_BASE}/api/uploads`).then(r => r.json()),
            fetch(`${API_BASE}/api/errors`).then(r => r.json()),
        ]);

        updateStatusCards(status);
        updateTransfersList(downloads.active || [], uploads.active || []);
        updateErrorsList(errors.errors || []);
        updateQuota(status.quota);
        lastUpdate = new Date();
    } catch (error) {
        console.error('Failed to fetch initial data:', error);
    }
}

// ==================== WEBSOCKET ====================

function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts = 0;
        setConnectionStatus(true);
    };

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            handleWebSocketMessage(message);
        } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        setConnectionStatus(false);
        scheduleReconnect();
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus(false);
    };
}

function scheduleReconnect() {
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        setTimeout(connectWebSocket, RECONNECT_DELAY);
    }
}

function setConnectionStatus(connected) {
    elements.connectionIndicator.className = `indicator ${connected ? 'connected' : 'disconnected'}`;
    elements.connectionText.textContent = connected ? 'Connected' : 'Disconnected';
}

function handleWebSocketMessage(message) {
    if (message.event === 'sync_update') {
        updateStatusCards(message.data);
        updateQuota(message.data.quota);
        lastUpdate = new Date();

        // Update sparklines
        addSparklinePoint('downloads', message.data.downloads?.active || 0);
        addSparklinePoint('uploads', message.data.uploads?.active || 0);
        addSparklinePoint('errors', message.data.errors?.count || 0);
    }
}

// ==================== STATUS CARDS ====================

function updateStatusCards(data) {
    const downloadsActive = data.downloads?.active ?? 0;
    const uploadsActive = data.uploads?.active ?? 0;
    const errorsCount = data.errors?.count ?? 0;

    // Animated counter updates
    animateValue(elements.downloadsCount, lastDownloads, downloadsActive, 300);
    animateValue(elements.uploadsCount, lastUploads, uploadsActive, 300);
    animateValue(elements.errorsCount, parseInt(elements.errorsCount.textContent) || 0, errorsCount, 300);

    lastDownloads = downloadsActive;
    lastUploads = uploadsActive;
    lastErrorCount = errorsCount;

    // Update totals
    elements.downloadsTotal.textContent = data.downloads?.total
        ? `${formatNumber(data.downloads.total)} total`
        : '-- queued';
    elements.uploadsTotal.textContent = data.uploads?.total
        ? `${formatNumber(data.uploads.total)} total`
        : '-- queued';

    // Update syncing state
    isSyncing = downloadsActive > 0 || uploadsActive > 0;
    updateSyncingState();

    // Card animations
    elements.cardDownloads.classList.toggle('syncing', downloadsActive > 0);
    elements.cardUploads.classList.toggle('syncing', uploadsActive > 0);
    elements.cardErrors.classList.toggle('warning', errorsCount > 0);

    // Status text
    const statusMap = {
        'idle': 'Idle',
        'syncing': 'Syncing...',
        'error': 'Errors detected',
        'busy': 'Database busy',
    };
    elements.statusText.textContent = statusMap[data.status] || data.status || '--';

    // Update favicon badge
    updateFaviconBadge(downloadsActive + uploadsActive, errorsCount > 0);

    // Update health score
    updateHealthScore(data);
}

function updateSyncingState() {
    elements.headerIcon.classList.toggle('syncing', isSyncing);
}

// ==================== ANIMATED COUNTER ====================

function animateValue(element, start, end, duration) {
    if (start === end) return;

    const startTime = performance.now();
    const diff = end - start;

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(start + diff * easeOut);

        element.textContent = formatNumber(current);

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.classList.add('updating');
            setTimeout(() => element.classList.remove('updating'), 300);
        }
    }

    requestAnimationFrame(update);
}

// ==================== LIVE TIMESTAMP ====================

function startTimestampTicker() {
    setInterval(updateTimestamp, 1000);
}

function updateTimestamp() {
    const seconds = Math.floor((new Date() - lastUpdate) / 1000);

    let text;
    if (seconds < 5) {
        text = 'Updated just now';
    } else if (seconds < 60) {
        text = `Updated ${seconds}s ago`;
    } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        text = `Updated ${minutes}m ago`;
    } else {
        const hours = Math.floor(seconds / 3600);
        text = `Updated ${hours}h ago`;
    }

    elements.lastUpdate.textContent = text;
    elements.lastUpdate.classList.toggle('stale', seconds > 30);
}

// ==================== QUOTA ====================

function updateQuota(quota) {
    if (!quota || !quota.remaining_bytes) {
        elements.quotaText.textContent = 'Unknown';
        return;
    }

    elements.quotaText.textContent = `${quota.remaining_human} remaining`;

    // Calculate percentage based on common iCloud tiers
    // Detect tier from remaining bytes
    const remaining = quota.remaining_bytes;
    let total;
    if (remaining > 1000 * 1024 * 1024 * 1024) { // > 1TB
        total = 2 * 1024 * 1024 * 1024 * 1024; // Assume 2TB
    } else if (remaining > 100 * 1024 * 1024 * 1024) { // > 100GB
        total = 200 * 1024 * 1024 * 1024; // Assume 200GB
    } else if (remaining > 20 * 1024 * 1024 * 1024) { // > 20GB
        total = 50 * 1024 * 1024 * 1024; // Assume 50GB
    } else {
        total = 5 * 1024 * 1024 * 1024; // Assume 5GB free tier
    }

    const used = total - remaining;
    const percentage = Math.min(100, Math.max(0, (used / total) * 100));
    elements.quotaFill.style.width = `${percentage}%`;
    elements.quotaFill.classList.toggle('low', percentage > 90);
}

// ==================== TRANSFERS LIST ====================

function updateTransfersList(downloads, uploads) {
    const items = [
        ...downloads.map(d => ({ ...d, type: 'download' })),
        ...uploads.map(u => ({ ...u, type: 'upload' })),
    ];

    // Check for stuck files
    checkStuckFiles(items);

    if (items.length === 0) {
        elements.transfersList.innerHTML = '<div class="empty-state">No active transfers</div>';
        return;
    }

    elements.transfersList.innerHTML = items.slice(0, 30).map(item => {
        const icon = getFileIcon(item.filename);
        const isUpload = item.type === 'upload';
        const progress = item.progress || Math.floor(Math.random() * 100); // Simulated for now

        return `
        <div class="transfer-item ${isUpload ? 'upload' : ''}">
            <span class="file-icon">${icon}</span>
            <span class="transfer-icon ${isUpload ? 'upload' : ''}">
                ${isUpload ? '↑' : '↓'}
            </span>
            <span class="transfer-name" title="${escapeHtml(item.filename)}">
                ${escapeHtml(item.filename)}
            </span>
            <span class="transfer-size">${formatBytes(item.size)}</span>
            <div class="transfer-progress">
                <div class="transfer-progress-fill" style="width: ${progress}%"></div>
            </div>
            <span class="transfer-status ${item.state === 'queued' ? 'queued' : ''}">${item.state}</span>
        </div>
    `}).join('');
}

// ==================== FILE ICONS ====================

function getFileIcon(filename) {
    if (!filename) return FILE_ICONS.default;

    const ext = filename.split('.').pop()?.toLowerCase();
    if (!ext) return FILE_ICONS.default;

    for (const [type, extensions] of Object.entries(FILE_EXTENSIONS)) {
        if (extensions.includes(ext)) {
            return FILE_ICONS[type];
        }
    }
    return FILE_ICONS.default;
}

// ==================== ACTIVITY FEED ====================

function addActivityItem(text, type = 'success') {
    const item = {
        text,
        type,
        time: new Date()
    };

    activityFeed.unshift(item);
    if (activityFeed.length > MAX_ACTIVITY_ITEMS) {
        activityFeed.pop();
    }

    renderActivityFeed();
}

function renderActivityFeed() {
    if (activityFeed.length === 0) {
        elements.activityFeed.innerHTML = '<div class="empty-state">No recent activity</div>';
        return;
    }

    elements.activityFeed.innerHTML = activityFeed.map(item => {
        const icon = item.type === 'success' ? '✓' : item.type === 'error' ? '✗' : '↓';
        const iconClass = item.type;
        const timeAgo = formatTimeAgo(item.time);

        return `
        <div class="activity-item">
            <span class="activity-icon ${iconClass}">${icon}</span>
            <span class="activity-text">${escapeHtml(item.text)}</span>
            <span class="activity-time">${timeAgo}</span>
        </div>
    `}).join('');
}

// ==================== ERRORS LIST ====================

function updateErrorsList(errors) {
    if (errors.length === 0) {
        elements.errorsList.innerHTML = '<div class="empty-state">No errors</div>';
        return;
    }

    elements.errorsList.innerHTML = errors.slice(0, 10).map(error => `
        <div class="error-item">
            <span class="error-message">${escapeHtml(error.message || error.domain)}</span>
            <span class="error-time">${formatTimestamp(error.timestamp)}</span>
        </div>
    `).join('');

    // Notify on new errors
    if (notificationsEnabled && errors.length > 0) {
        const latestError = errors[0];
        showNotification('iCloud Sync Error', latestError.message || latestError.domain);
    }
}

// ==================== SPARKLINES ====================

function addSparklinePoint(type, value) {
    sparklineData[type].push(value);
    if (sparklineData[type].length > MAX_SPARKLINE_POINTS) {
        sparklineData[type].shift();
    }

    const colors = {
        downloads: '#4da8da',
        uploads: '#4ade80',
        errors: '#fb923c'
    };

    const canvas = {
        downloads: elements.sparklineDownloads,
        uploads: elements.sparklineUploads,
        errors: elements.sparklineErrors
    }[type];

    drawSparkline(canvas, sparklineData[type], colors[type]);
}

function drawSparkline(canvas, data, color) {
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (data.length < 2) return;

    const max = Math.max(...data, 1);
    const min = 0;
    const range = max - min || 1;

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;

    data.forEach((value, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((value - min) / range) * height;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.stroke();

    // Fill area under line
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = color + '20';
    ctx.fill();
}

// ==================== FAVICON BADGE ====================

function updateFaviconBadge(count, hasError) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    // Draw cloud emoji base
    ctx.font = '28px serif';
    ctx.fillText('☁️', 2, 26);

    // Draw badge if count > 0
    if (count > 0 || hasError) {
        const badgeColor = hasError ? '#f87171' : '#4ade80';
        ctx.fillStyle = badgeColor;
        ctx.beginPath();
        ctx.arc(24, 8, 8, 0, Math.PI * 2);
        ctx.fill();

        // Draw count
        if (count > 0 && count < 100) {
            ctx.fillStyle = 'white';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(count.toString(), 24, 12);
        }
    }

    // Update favicon
    const link = document.getElementById('favicon') || document.createElement('link');
    link.type = 'image/x-icon';
    link.rel = 'shortcut icon';
    link.href = canvas.toDataURL();
    link.id = 'favicon';
    document.head.appendChild(link);
}

// ==================== NOTIFICATIONS ====================

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            notificationsEnabled = permission === 'granted';
        });
    } else if (Notification.permission === 'granted') {
        notificationsEnabled = true;
    }
}

function showNotification(title, body) {
    if (!notificationsEnabled) return;

    new Notification(title, {
        body,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">☁️</text></svg>'
    });
}

// ==================== TOAST NOTIFICATIONS ====================

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = { success: '✓', error: '✗', warning: '⚠' };
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || '•'}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeSlideOut 0.3s ease-out forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==================== ACTION HANDLERS ====================

function showDownloadDialog() {
    showDialog('Force Download', 'Enter the full path to the file:', (path) => {
        executeAction('/api/actions/download', { path });
    });
}

function showEvictDialog() {
    showDialog('Evict File', 'Enter the full path to evict:', (path) => {
        executeAction('/api/actions/evict', { path });
    });
}

function confirmRestartBird() {
    showConfirmDialog(
        'Restart iCloud Sync',
        'This will restart the bird daemon and temporarily interrupt sync. Continue?',
        () => {
            executeAction('/api/actions/restart-bird', { confirm: true });
        },
        true
    );
}

function showDialog(title, placeholder, onConfirm) {
    const overlay = document.getElementById('dialog-overlay');
    const input = document.getElementById('dialog-input');
    const confirmBtn = document.getElementById('dialog-confirm');

    document.getElementById('dialog-title').textContent = title;
    input.placeholder = placeholder;
    input.value = '';
    input.style.display = 'block';
    confirmBtn.className = 'btn-confirm';
    confirmBtn.textContent = 'Confirm';

    confirmBtn.onclick = () => {
        const value = input.value.trim();
        if (value) {
            closeDialog();
            onConfirm(value);
        }
    };

    overlay.classList.remove('hidden');
    input.focus();
}

function showConfirmDialog(title, message, onConfirm, danger = false) {
    const overlay = document.getElementById('dialog-overlay');
    const input = document.getElementById('dialog-input');
    const confirmBtn = document.getElementById('dialog-confirm');
    const content = document.getElementById('dialog-content');

    document.getElementById('dialog-title').textContent = title;
    input.style.display = 'none';
    content.innerHTML = `<p style="margin-bottom: 16px; color: var(--text-secondary)">${message}</p>`;
    confirmBtn.className = danger ? 'btn-confirm danger' : 'btn-confirm';
    confirmBtn.textContent = 'Confirm';

    confirmBtn.onclick = () => {
        closeDialog();
        onConfirm();
    };

    overlay.classList.remove('hidden');
}

function closeDialog() {
    const overlay = document.getElementById('dialog-overlay');
    const content = document.getElementById('dialog-content');
    overlay.classList.add('hidden');
    content.innerHTML = '<input type="text" id="dialog-input" placeholder="Enter file path...">';
}

async function executeAction(endpoint, data) {
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        const result = await response.json();

        if (result.success) {
            showToast(result.message || 'Action completed', 'success');
            addActivityItem(result.message || 'Action completed', 'success');
        } else {
            showToast(result.message || 'Action failed', 'error');
        }
    } catch (error) {
        showToast('Failed to execute action: ' + error.message, 'error');
    }
}

// ==================== UTILITY FUNCTIONS ====================

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '--';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
    }
    return `${bytes.toFixed(1)} ${units[i]}`;
}

function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '--';
    return num.toLocaleString();
}

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '--';
    try {
        const date = new Date(timestamp);
        return date.toLocaleString();
    } catch {
        return timestamp;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ==================== PERIODIC REFRESH ====================

// Fallback polling if WebSocket fails
setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        fetchInitialData();
    }
}, 10000);

// Refresh activity feed timestamps
setInterval(() => {
    renderActivityFeed();
}, 30000);

// Refresh containers every minute
setInterval(() => {
    fetchContainers();
}, 60000);

// ==================== DARK MODE ====================

function initDarkMode() {
    // Check localStorage first
    const savedMode = localStorage.getItem('darkMode');

    if (savedMode !== null) {
        // User has set a preference
        if (savedMode === 'true') {
            document.body.classList.add('dark-mode');
            updateThemeIcon(true);
        } else {
            document.body.classList.remove('dark-mode');
            updateThemeIcon(false);
        }
    } else {
        // Respect system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            document.body.classList.add('dark-mode');
        }
        updateThemeIcon(prefersDark);
    }

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (localStorage.getItem('darkMode') === null) {
            document.body.classList.toggle('dark-mode', e.matches);
            updateThemeIcon(e.matches);
        }
    });
}

function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDark);
    updateThemeIcon(isDark);
}

function updateThemeIcon(isDark) {
    if (elements.themeIcon) {
        elements.themeIcon.textContent = isDark ? '☀️' : '🌙';
    }
}

// ==================== HEALTH SCORE ====================

function calculateHealthScore(data) {
    let score = 100;

    // Deduct for errors (5 points each, max 30)
    const errorCount = data.errors?.count || 0;
    score -= Math.min(30, errorCount * 5);

    // Deduct for stuck files (10 points each, max 40)
    score -= Math.min(40, stuckFiles.length * 10);

    // Deduct for queue depth (0.1 per file in queue, max 20)
    const queueDepth = (data.downloads?.total || 0) + (data.uploads?.total || 0);
    score -= Math.min(20, queueDepth * 0.1);

    // Deduct for severe stuck files (extra 5 points each)
    const severeStuck = stuckFiles.filter(f => f.minutes >= STUCK_SEVERE_MINUTES).length;
    score -= severeStuck * 5;

    return Math.max(0, Math.round(score));
}

function updateHealthScore(data) {
    const score = calculateHealthScore(data);

    if (elements.healthScoreValue) {
        elements.healthScoreValue.textContent = score;
    }

    if (elements.healthScore) {
        elements.healthScore.classList.remove('good', 'warning', 'critical');
        if (score >= 80) {
            elements.healthScore.classList.add('good');
        } else if (score >= 50) {
            elements.healthScore.classList.add('warning');
        } else {
            elements.healthScore.classList.add('critical');
        }
    }
}

// ==================== STUCK FILE DETECTION ====================

function checkStuckFiles(transfers) {
    const now = Date.now();
    const newStuckFiles = [];
    const currentPaths = new Set();

    transfers.forEach(t => {
        const path = t.path || t.filename;
        if (!path) return;

        currentPaths.add(path);

        // Track first seen time
        if (!fileFirstSeen[path]) {
            fileFirstSeen[path] = now;
        }

        // Check if stuck
        const minutes = (now - fileFirstSeen[path]) / 60000;

        // Skip if dismissed recently (within 1 hour)
        if (dismissedStuckFiles[path] && (now - dismissedStuckFiles[path]) < 3600000) {
            return;
        }

        if (minutes >= STUCK_THRESHOLD_MINUTES) {
            newStuckFiles.push({
                path,
                filename: t.filename || path.split('/').pop(),
                minutes: Math.round(minutes),
                severe: minutes >= STUCK_SEVERE_MINUTES
            });
        }
    });

    // Clean up files no longer in queue
    Object.keys(fileFirstSeen).forEach(path => {
        if (!currentPaths.has(path)) {
            delete fileFirstSeen[path];
        }
    });

    // Save to localStorage
    localStorage.setItem('fileFirstSeen', JSON.stringify(fileFirstSeen));

    // Sort by time (oldest first)
    stuckFiles = newStuckFiles.sort((a, b) => b.minutes - a.minutes);

    updateStuckAlert();
    return stuckFiles;
}

function updateStuckAlert() {
    if (stuckFiles.length === 0) {
        elements.stuckAlert?.classList.add('hidden');
        return;
    }

    elements.stuckAlert?.classList.remove('hidden');

    const oldest = stuckFiles[0];
    const count = stuckFiles.length;

    if (elements.stuckAlertTitle) {
        elements.stuckAlertTitle.textContent = `${count} file${count > 1 ? 's' : ''} appear${count === 1 ? 's' : ''} stuck`;
    }

    if (elements.stuckAlertSubtitle) {
        elements.stuckAlertSubtitle.textContent = `Oldest: ${oldest.filename} (${oldest.minutes} min)`;
    }

    // Notify on first detection of stuck files
    if (notificationsEnabled && stuckFiles.some(f => f.minutes === STUCK_THRESHOLD_MINUTES)) {
        showNotification('Files Stuck', `${count} file(s) haven't progressed in ${STUCK_THRESHOLD_MINUTES}+ minutes`);
    }
}

function toggleStuckList() {
    const list = elements.stuckFilesList;
    if (!list) return;

    const isExpanded = list.classList.toggle('expanded');

    if (isExpanded) {
        list.innerHTML = stuckFiles.map(f => `
            <div class="stuck-file-item">
                <span class="stuck-file-name" title="${escapeHtml(f.path)}">${escapeHtml(f.filename)}</span>
                <span class="stuck-file-time">${f.minutes}m</span>
                <button class="stuck-file-btn" onclick="retryStuckFile('${escapeHtml(f.path)}')">Retry</button>
                <button class="stuck-file-btn" onclick="dismissStuckFile('${escapeHtml(f.path)}')">Dismiss</button>
            </div>
        `).join('');
    }
}

async function fixAllStuck() {
    showToast(`Retrying ${stuckFiles.length} stuck files...`, 'warning');

    for (const file of stuckFiles) {
        await executeAction('/api/actions/download', { path: file.path });
    }

    // Clear tracking for these files
    stuckFiles.forEach(f => {
        delete fileFirstSeen[f.path];
    });
    localStorage.setItem('fileFirstSeen', JSON.stringify(fileFirstSeen));

    showToast('Retry commands sent for all stuck files', 'success');
}

async function retryStuckFile(path) {
    await executeAction('/api/actions/download', { path });
    delete fileFirstSeen[path];
    localStorage.setItem('fileFirstSeen', JSON.stringify(fileFirstSeen));
}

function dismissStuckFile(path) {
    dismissedStuckFiles[path] = Date.now();
    localStorage.setItem('dismissedStuckFiles', JSON.stringify(dismissedStuckFiles));

    stuckFiles = stuckFiles.filter(f => f.path !== path);
    updateStuckAlert();
    toggleStuckList(); // Refresh list
    toggleStuckList();
}

function cleanupOldStuckTracking() {
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    // Clean up old dismissed entries
    Object.keys(dismissedStuckFiles).forEach(path => {
        if (dismissedStuckFiles[path] < oneHourAgo) {
            delete dismissedStuckFiles[path];
        }
    });
    localStorage.setItem('dismissedStuckFiles', JSON.stringify(dismissedStuckFiles));

    // Clean up very old firstSeen entries (older than 24 hours)
    const oneDayAgo = now - 86400000;
    Object.keys(fileFirstSeen).forEach(path => {
        if (fileFirstSeen[path] < oneDayAgo) {
            delete fileFirstSeen[path];
        }
    });
    localStorage.setItem('fileFirstSeen', JSON.stringify(fileFirstSeen));
}

// ==================== CONTAINERS ====================

async function fetchContainers() {
    try {
        const response = await fetch(`${API_BASE}/api/containers`);
        const data = await response.json();
        renderContainers(data.containers || []);
    } catch (error) {
        console.error('Failed to fetch containers:', error);
    }
}

function renderContainers(containers) {
    if (!elements.containersGrid) return;

    if (containers.length === 0) {
        elements.containersGrid.innerHTML = '<div class="empty-state">No containers found</div>';
        return;
    }

    elements.containersGrid.innerHTML = containers.map(container => {
        const mapped = CONTAINER_ICONS[container.id] || {
            name: formatContainerName(container.id),
            icon: '📱'
        };

        const statusClass = container.state === 'syncing' ? 'syncing' :
                           container.state === 'error' ? 'error' : 'idle';

        return `
            <div class="container-card ${container.state === 'syncing' ? 'syncing' : ''}">
                <div class="container-icon">${mapped.icon}</div>
                <div class="container-info">
                    <div class="container-name">${escapeHtml(mapped.name)}</div>
                    <div class="container-stats">
                        <span class="container-status ${statusClass}"></span>
                        <span>${container.items || 0} items</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function formatContainerName(containerId) {
    // Convert com.company.AppName to "App Name"
    const parts = containerId.split('.');
    const name = parts[parts.length - 1];
    return name.replace(/([A-Z])/g, ' $1').trim();
}
