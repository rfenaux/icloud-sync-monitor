/**
 * iCloud Sync Monitor - Dashboard JavaScript
 */

const API_BASE = '';
const WS_URL = `ws://${window.location.hostname}:8431`;

let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 3000;

// DOM Elements
const elements = {
    connectionIndicator: document.getElementById('connection-indicator'),
    connectionText: document.getElementById('connection-text'),
    downloadsCount: document.getElementById('downloads-count'),
    downloadsTotal: document.getElementById('downloads-total'),
    uploadsCount: document.getElementById('uploads-count'),
    uploadsTotal: document.getElementById('uploads-total'),
    errorsCount: document.getElementById('errors-count'),
    quotaText: document.getElementById('quota-text'),
    quotaFill: document.getElementById('quota-fill'),
    transfersList: document.getElementById('transfers-list'),
    errorsList: document.getElementById('errors-list'),
    lastUpdate: document.getElementById('last-update'),
    statusText: document.getElementById('status-text'),
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    fetchInitialData();
    connectWebSocket();
});

// Fetch initial data via REST API
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
    } catch (error) {
        console.error('Failed to fetch initial data:', error);
    }
}

// WebSocket connection
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
        elements.lastUpdate.textContent = `Last update: ${formatTime(new Date())}`;
    }
}

// Update functions
function updateStatusCards(data) {
    // Downloads
    const downloadsActive = data.downloads?.active;
    elements.downloadsCount.textContent = downloadsActive ?? '--';
    elements.downloadsTotal.textContent = data.downloads?.total
        ? `${data.downloads.total} total`
        : '-- queued';

    // Uploads
    const uploadsActive = data.uploads?.active;
    elements.uploadsCount.textContent = uploadsActive ?? '--';
    elements.uploadsTotal.textContent = data.uploads?.total
        ? `${data.uploads.total} total`
        : '-- queued';

    // Errors
    const errorsCount = data.errors?.count;
    elements.errorsCount.textContent = errorsCount ?? '--';

    // Status
    const statusMap = {
        'idle': 'Idle',
        'syncing': 'Syncing...',
        'error': 'Errors detected',
        'busy': 'Database busy (sync active)',
    };
    elements.statusText.textContent = statusMap[data.status] || data.status || '--';
}

function updateQuota(quota) {
    if (!quota || !quota.remaining_bytes) {
        elements.quotaText.textContent = 'Unknown';
        return;
    }

    elements.quotaText.textContent = `${quota.remaining_human} remaining`;

    // Estimate percentage (assuming 50GB total for visualization)
    // This is approximate since we don't have total storage info
    const totalEstimate = 50 * 1024 * 1024 * 1024; // 50GB
    const usedEstimate = totalEstimate - quota.remaining_bytes;
    const percentage = Math.min(100, Math.max(0, (usedEstimate / totalEstimate) * 100));
    elements.quotaFill.style.width = `${percentage}%`;
}

function updateTransfersList(downloads, uploads) {
    const items = [
        ...downloads.map(d => ({ ...d, type: 'download' })),
        ...uploads.map(u => ({ ...u, type: 'upload' })),
    ];

    if (items.length === 0) {
        elements.transfersList.innerHTML = '<div class="empty-state">No active transfers</div>';
        return;
    }

    elements.transfersList.innerHTML = items.slice(0, 20).map(item => `
        <div class="transfer-item">
            <span class="transfer-icon ${item.type === 'upload' ? 'upload' : ''}">
                ${item.type === 'download' ? '&#x2193;' : '&#x2191;'}
            </span>
            <span class="transfer-name" title="${escapeHtml(item.filename)}">
                ${escapeHtml(item.filename)}
            </span>
            <span class="transfer-size">${formatBytes(item.size)}</span>
            <span class="transfer-status">${item.state}</span>
        </div>
    `).join('');
}

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
}

// Action handlers
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
    const dialog = document.getElementById('dialog');
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
            alert(result.message || 'Action completed');
        } else {
            alert(result.message || 'Action failed');
        }
    } catch (error) {
        alert('Failed to execute action: ' + error.message);
    }
}

// Utility functions
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

function formatTime(date) {
    return date.toLocaleTimeString();
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

// Periodic refresh as fallback if WebSocket fails
setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        fetchInitialData();
    }
}, 10000);
