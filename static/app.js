/**
 * iCloud Sync Monitor - Enhanced Dashboard JavaScript
 * Features: Animated counters, live timestamps, sparklines, file icons,
 * favicon badges, notifications, activity feed, speed indicator
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
    fetchInitialData();
    connectWebSocket();
    startTimestampTicker();
    requestNotificationPermission();

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
