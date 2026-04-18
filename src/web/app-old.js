// Cursor Mobile PWA - Main App Logic

// State
const state = {
  apiKey: localStorage.getItem('apiKey') || '',
  defaultProject: localStorage.getItem('defaultProject') || '',
  currentTab: localStorage.getItem('currentTab') || 'chat',
  serverStatus: null,
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

async function initializeApp() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/pwa-sw.js');
      console.log('Service Worker registered');
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }
  
  // Load settings
  loadSettings();
  
  // Set up tab navigation
  setupTabNavigation();
  
  // Set up event listeners
  setupEventListeners();
  
  // Load server status
  await loadServerStatus();
  
  // Show initial tab
  switchTab(state.currentTab);
  
  // Check if API key is set
  if (!state.apiKey) {
    switchTab('settings');
    showToast('Please enter your API key in Settings', 'warning');
  }
}

// Settings
function loadSettings() {
  const apiKeyInput = document.getElementById('settings-api-key');
  const projectInput = document.getElementById('settings-project');
  
  if (apiKeyInput) apiKeyInput.value = state.apiKey;
  if (projectInput) projectInput.value = state.defaultProject;
}

function saveSettings() {
  const apiKeyInput = document.getElementById('settings-api-key');
  const projectInput = document.getElementById('settings-project');
  
  state.apiKey = apiKeyInput.value;
  state.defaultProject = projectInput.value;
  
  localStorage.setItem('apiKey', state.apiKey);
  localStorage.setItem('defaultProject', state.defaultProject);
  
  showToast('Settings saved', 'success');
}

// Tab Navigation
function setupTabNavigation() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });
}

function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `${tabName}-tab`);
  });
  
  state.currentTab = tabName;
  localStorage.setItem('currentTab', tabName);
  
  // Load tab-specific data
  if (tabName === 'settings') {
    loadServerStatus();
  }
}

// Event Listeners
function setupEventListeners() {
  // Settings
  document.getElementById('settings-save-btn')?.addEventListener('click', saveSettings);
  document.getElementById('toggle-api-key')?.addEventListener('click', toggleApiKeyVisibility);
  document.getElementById('clear-history-btn')?.addEventListener('click', clearHistory);
  
  // Chat
  document.getElementById('chat-send-btn')?.addEventListener('click', sendChatMessage);
  
  // Plan
  document.getElementById('plan-generate-btn')?.addEventListener('click', generatePlan);
  document.getElementById('plan-apply-btn')?.addEventListener('click', applyPlan);
  
  // Files
  document.getElementById('files-refresh-btn')?.addEventListener('click', refreshFiles);
  document.getElementById('file-close-btn')?.addEventListener('click', closeFileViewer);
  
  // Exec
  document.getElementById('exec-run-btn')?.addEventListener('click', runCommand);
}

// API Helper
async function apiCall(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (state.apiKey && endpoint !== '/api/status') {
    headers['x-api-key'] = state.apiKey;
  }
  
  const response = await fetch(endpoint, {
    ...options,
    headers,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || 'Request failed');
  }
  
  return response;
}

// Server Status
async function loadServerStatus() {
  try {
    const response = await apiCall('/api/status');
    const status = await response.json();
    state.serverStatus = status;
    
    // Update UI
    const statusDiv = document.getElementById('server-status');
    if (statusDiv) {
      statusDiv.innerHTML = `
        <div><strong>Bridge:</strong> ${status.bridge}</div>
        <div><strong>Cursor CLI:</strong> ${status.cursorCmd}</div>
        <div><strong>Read-Only:</strong> ${status.readOnly ? 'Yes' : 'No'}</div>
        <div><strong>Git Enabled:</strong> ${status.git ? 'Yes' : 'No'}</div>
        <div><strong>Allowlist Count:</strong> ${status.allowlistCount}</div>
        <div><strong>Uptime:</strong> ${Math.floor(status.uptime / 60)} minutes</div>
      `;
    }
    
    // Update allowed commands in Exec tab
    const cmdSelect = document.getElementById('exec-cmd');
    if (cmdSelect && status.allowedCommands) {
      cmdSelect.innerHTML = '<option value="">Select command...</option>';
      status.allowedCommands.forEach(cmd => {
        const option = document.createElement('option');
        option.value = cmd;
        option.textContent = cmd;
        cmdSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Failed to load server status:', error);
    showToast('Failed to connect to server', 'error');
  }
}

// Chat Functions
async function sendChatMessage() {
  const prompt = document.getElementById('chat-prompt').value.trim();
  if (!prompt) {
    showToast('Please enter a prompt', 'warning');
    return;
  }
  
  const projectPath = document.getElementById('chat-project').value.trim();
  const system = document.getElementById('chat-system').value.trim();
  
  const outputBox = document.getElementById('chat-output');
  outputBox.textContent = '';
  
  showLoading(true);
  
  try {
    const response = await apiCall('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        projectPath: projectPath || undefined,
        system: system || undefined,
      }),
    });
    
    showLoading(false);
    
    // Parse SSE stream
    await parseSSEStream(response, (event, data) => {
      if (event === 'start') {
        outputBox.textContent += `Starting in ${data.cwd}\n\n`;
      } else if (event === 'chunk') {
        outputBox.textContent += data.data;
        outputBox.scrollTop = outputBox.scrollHeight;
      } else if (event === 'end') {
        outputBox.textContent += `\n\nCompleted with exit code ${data.code} (${data.duration}s)`;
        showToast('Chat completed', 'success');
      } else if (event === 'error') {
        outputBox.textContent += `\n\nError: ${data.message}`;
        showToast('Chat failed', 'error');
      }
    });
  } catch (error) {
    showLoading(false);
    showToast(error.message, 'error');
  }
}

// Plan Functions
async function generatePlan() {
  const goal = document.getElementById('plan-goal').value.trim();
  if (!goal) {
    showToast('Please enter a goal', 'warning');
    return;
  }
  
  const projectPath = document.getElementById('plan-project').value.trim();
  
  showLoading(true);
  
  try {
    const response = await apiCall('/api/plan', {
      method: 'POST',
      body: JSON.stringify({
        goal,
        projectPath: projectPath || undefined,
      }),
    });
    
    const result = await response.json();
    showLoading(false);
    
    displayPlan(result.plan);
    showToast('Plan generated', 'success');
  } catch (error) {
    showLoading(false);
    showToast(error.message, 'error');
  }
}

function displayPlan(plan) {
  const container = document.getElementById('plan-steps-container');
  container.innerHTML = '';
  
  if (!plan.steps || plan.steps.length === 0) {
    container.innerHTML = '<p>No steps in plan</p>';
    return;
  }
  
  plan.steps.forEach(step => {
    const card = document.createElement('div');
    card.className = 'step-card';
    card.innerHTML = `
      <div class="step-header">
        <input type="checkbox" id="step-${step.id}" value="${step.id}">
        <label for="step-${step.id}" class="step-title">${step.title}</label>
      </div>
      <div class="step-why">${step.why}</div>
      <div class="step-actions">
        <button class="secondary-btn" onclick="showStepDiff('${step.id}')">הצג diff</button>
      </div>
    `;
    container.appendChild(card);
  });
  
  // Show apply button
  document.getElementById('plan-apply-btn').style.display = 'block';
  
  // Store plan in session
  sessionStorage.setItem('currentPlan', JSON.stringify(plan));
}

function showStepDiff(stepId) {
  const plan = JSON.parse(sessionStorage.getItem('currentPlan'));
  const step = plan.steps.find(s => s.id === stepId);
  
  if (!step) return;
  
  const diffText = step.changes.map(c => 
    `=== ${c.path} (${c.type}) ===\n${c.patch}\n`
  ).join('\n');
  
  alert(diffText); // Simple modal - could be improved with a proper modal
}

async function applyPlan() {
  const checkboxes = document.querySelectorAll('#plan-steps-container input[type="checkbox"]:checked');
  const stepIds = Array.from(checkboxes).map(cb => cb.value);
  
  if (stepIds.length === 0) {
    showToast('Please select at least one step', 'warning');
    return;
  }
  
  const projectPath = document.getElementById('plan-project').value.trim() || state.defaultProject;
  
  const commitMessage = prompt('Commit message (leave empty to skip commit):');
  
  showLoading(true);
  
  try {
    const response = await apiCall('/api/plan/apply', {
      method: 'POST',
      body: JSON.stringify({
        projectPath,
        stepIds,
        commit: commitMessage ? { message: commitMessage } : undefined,
      }),
    });
    
    const result = await response.json();
    showLoading(false);
    
    let message = `Applied ${result.applied.length} steps`;
    if (result.failed.length > 0) {
      message += `, failed ${result.failed.length} steps`;
    }
    
    showToast(message, result.failed.length > 0 ? 'warning' : 'success');
    
    // Clear selections
    checkboxes.forEach(cb => cb.checked = false);
  } catch (error) {
    showLoading(false);
    showToast(error.message, 'error');
  }
}

// Files Functions
async function refreshFiles() {
  const projectPath = document.getElementById('files-project').value.trim() || state.defaultProject;
  
  showLoading(true);
  
  try {
    const response = await apiCall(`/api/files?projectPath=${encodeURIComponent(projectPath)}`);
    const result = await response.json();
    showLoading(false);
    
    displayFiles(result.files);
  } catch (error) {
    showLoading(false);
    showToast(error.message, 'error');
  }
}

function displayFiles(files) {
  const tbody = document.querySelector('#files-list tbody');
  tbody.innerHTML = '';
  
  if (files.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3">No files found</td></tr>';
    return;
  }
  
  files.forEach(file => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${file.isDir ? '📁 ' : '📄 '}${file.path}</td>
      <td>${formatFileSize(file.size)}</td>
      <td>${formatDate(file.mtime)}</td>
    `;
    row.addEventListener('click', () => openFile(file.path));
    tbody.appendChild(row);
  });
}

async function openFile(filePath) {
  const projectPath = document.getElementById('files-project').value.trim() || state.defaultProject;
  
  showLoading(true);
  
  try {
    const response = await apiCall(`/api/file?projectPath=${encodeURIComponent(projectPath)}&path=${encodeURIComponent(filePath)}`);
    const result = await response.json();
    showLoading(false);
    
    document.getElementById('file-path').textContent = filePath;
    document.getElementById('file-content').textContent = result.content;
    document.getElementById('file-viewer').style.display = 'block';
    document.getElementById('files-list-container').style.display = 'none';
  } catch (error) {
    showLoading(false);
    showToast(error.message, 'error');
  }
}

function closeFileViewer() {
  document.getElementById('file-viewer').style.display = 'none';
  document.getElementById('files-list-container').style.display = 'block';
}

// Exec Functions
async function runCommand() {
  const cmd = document.getElementById('exec-cmd').value.trim();
  if (!cmd) {
    showToast('Please select a command', 'warning');
    return;
  }
  
  const projectPath = document.getElementById('exec-project').value.trim();
  const outputBox = document.getElementById('exec-output');
  outputBox.textContent = '';
  
  showLoading(true);
  
  try {
    const response = await apiCall('/api/exec', {
      method: 'POST',
      body: JSON.stringify({
        cmd,
        projectPath: projectPath || undefined,
      }),
    });
    
    showLoading(false);
    
    await parseSSEStream(response, (event, data) => {
      if (event === 'start') {
        outputBox.textContent += `Running: ${data.cmd}\nIn: ${data.cwd}\n\n`;
      } else if (event === 'chunk') {
        const className = data.type === 'stderr' ? 'text-error' : '';
        outputBox.innerHTML += `<span class="${className}">${escapeHtml(data.data)}</span>`;
        outputBox.scrollTop = outputBox.scrollHeight;
      } else if (event === 'end') {
        outputBox.textContent += `\n\nExited with code ${data.code} (${data.duration}s)`;
        showToast('Command completed', 'success');
      } else if (event === 'error') {
        outputBox.textContent += `\n\nError: ${data.message}`;
        showToast('Command failed', 'error');
      }
    });
  } catch (error) {
    showLoading(false);
    showToast(error.message, 'error');
  }
}

// SSE Parser
async function parseSSEStream(response, callback) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line in buffer
    
    let currentEvent = 'message';
    let currentData = '';
    
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7);
      } else if (line.startsWith('data: ')) {
        currentData = line.slice(6);
        
        try {
          const data = JSON.parse(currentData);
          callback(currentEvent, data);
        } catch {
          callback(currentEvent, currentData);
        }
        
        currentEvent = 'message';
        currentData = '';
      }
    }
  }
}

// Utility Functions
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function showLoading(show) {
  document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('settings-api-key');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function clearHistory() {
  if (confirm('Clear all history?')) {
    localStorage.removeItem('chatHistory');
    localStorage.removeItem('execHistory');
    showToast('History cleared', 'success');
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('he-IL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

