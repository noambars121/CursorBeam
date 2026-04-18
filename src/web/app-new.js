// Cursor Mobile PWA - Enhanced with Auth, Projects, and Models

// State Management
const state = {
  token: localStorage.getItem('authToken') || null,
  currentTab: localStorage.getItem('currentTab') || 'chat',
  selectedProject: localStorage.getItem('selectedProject') || '',
  selectedModel: localStorage.getItem('selectedModel') || '',
  projects: [],
  models: [],
  conversationHistory: [],
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
  
  // Check if logged in
  if (state.token) {
    const isValid = await verifyToken();
    if (isValid) {
      showMainApp();
      await loadInitialData();
    } else {
      showLoginScreen();
    }
  } else {
    showLoginScreen();
  }
  
  // Set up event listeners
  setupEventListeners();
}

// Authentication Functions
function showLoginScreen() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('main-app').style.display = 'none';
}

function showMainApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-app').style.display = 'block';
  switchTab(state.currentTab);
}

async function verifyToken() {
  try {
    const response = await apiCall('/api/auth/verify', {
      method: 'GET',
    });
    const result = await response.json();
    return result.valid;
  } catch {
    return false;
  }
}

async function login(password) {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }
    
    const result = await response.json();
    state.token = result.token;
    localStorage.setItem('authToken', result.token);
    
    showToast(result.message || 'התחברת בהצלחה!', 'success');
    showMainApp();
    await loadInitialData();
  } catch (error) {
    showToast(error.message, 'error');
    document.getElementById('login-error').textContent = error.message;
    document.getElementById('login-error').style.display = 'block';
  }
}

function logout() {
  state.token = null;
  localStorage.removeItem('authToken');
  state.conversationHistory = [];
  showToast('התנתקת בהצלחה', 'success');
  showLoginScreen();
}

// Data Loading Functions
async function loadInitialData() {
  try {
    // Load server status
    await loadServerStatus();
    
    // Load projects
    await loadProjects();
    
    // Load models from status
    if (state.serverStatus) {
      state.models = state.serverStatus.availableModels || [];
      updateModelSelectors();
    }
    
    // Set initial selections
    if (!state.selectedProject && state.projects.length > 0) {
      state.selectedProject = state.projects[0].name;
      localStorage.setItem('selectedProject', state.selectedProject);
    }
    
    if (!state.selectedModel && state.models.length > 0) {
      state.selectedModel = state.models[0];
      localStorage.setItem('selectedModel', state.selectedModel);
    }
    
    updateProjectSelectors();
  } catch (error) {
    console.error('Failed to load initial data:', error);
    showToast('שגיאה בטעינת נתונים', 'error');
  }
}

async function loadServerStatus() {
  try {
    const response = await apiCall('/api/status');
    state.serverStatus = await response.json();
    updateServerStatusDisplay();
  } catch (error) {
    console.error('Failed to load server status:', error);
  }
}

async function loadProjects() {
  try {
    const response = await apiCall('/api/projects');
    const data = await response.json();
    state.projects = data.projects || [];
    updateProjectsList();
  } catch (error) {
    console.error('Failed to load projects:', error);
    showToast('שגיאה בטעינת פרויקטים', 'error');
  }
}

// UI Update Functions
function updateProjectSelectors() {
  const selectors = [
    document.getElementById('chat-project-select'),
    document.getElementById('files-project-select'),
  ];
  
  selectors.forEach(select => {
    if (!select) return;
    
    select.innerHTML = '';
    state.projects.forEach(project => {
      const option = document.createElement('option');
      option.value = project.name;
      option.textContent = `${project.name}${project.running ? ' (פועל)' : ''}`;
      if (project.name === state.selectedProject) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  });
}

function updateModelSelectors() {
  const select = document.getElementById('chat-model-select');
  if (!select) return;
  
  select.innerHTML = '';
  state.models.forEach(model => {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = getModelDisplayName(model);
    if (model === state.selectedModel) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

function getModelDisplayName(model) {
  const names = {
    'claude-3.5-sonnet': 'Claude 3.5 Sonnet',
    'claude-3-opus': 'Claude 3 Opus',
    'gpt-4': 'GPT-4',
    'gpt-4-turbo': 'GPT-4 Turbo',
    'gemini-pro': 'Gemini Pro',
  };
  return names[model] || model;
}

function updateProjectsList() {
  const container = document.getElementById('projects-list');
  if (!container) return;
  
  if (state.projects.length === 0) {
    container.innerHTML = '<p>לא נמצאו פרויקטים</p>';
    return;
  }
  
  container.innerHTML = '';
  state.projects.forEach(project => {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.innerHTML = `
      <div class="project-info">
        <h3>${project.running ? '🟢' : '⚪'} ${project.name}</h3>
        <p>${project.hasPackageJson ? '📦 npm project' : '📁 folder'}</p>
        ${project.running ? `<p class="project-url">
          <a href="http://noam.tailf4f5e8.ts.net:${project.port}" target="_blank">
            פתח באתר ↗
          </a>
        </p>` : ''}
      </div>
      <div class="project-actions">
        ${project.running ?
          `<button onclick="stopProject('${project.name}')" class="secondary-btn">עצור</button>` :
          `<button onclick="startProject('${project.name}')" class="primary-btn">הפעל</button>`
        }
      </div>
    `;
    container.appendChild(card);
  });
}

function updateServerStatusDisplay() {
  const statusDiv = document.getElementById('server-status');
  if (!statusDiv || !state.serverStatus) return;
  
  statusDiv.innerHTML = `
    <div><strong>גרסה:</strong> ${state.serverStatus.bridge}</div>
    <div><strong>Cursor CLI:</strong> ${state.serverStatus.cursorCmd}</div>
    <div><strong>תיקיית פרויקטים:</strong> ${state.serverStatus.projectsRoot}</div>
    <div><strong>פרויקט ברירת מחדל:</strong> ${state.serverStatus.defaultProject}</div>
    <div><strong>מודלים זמינים:</strong> ${state.serverStatus.availableModels.length}</div>
    <div><strong>Git מופעל:</strong> ${state.serverStatus.git ? 'כן' : 'לא'}</div>
    <div><strong>זמן פעילות:</strong> ${Math.floor(state.serverStatus.uptime / 60)} דקות</div>
  `;
}

// Chat Functions
async function sendChatMessage() {
  const promptInput = document.getElementById('chat-prompt');
  const prompt = promptInput.value.trim();
  
  if (!prompt) {
    showToast('נא להזין prompt', 'warning');
    return;
  }
  
  const project = state.selectedProject;
  const model = state.selectedModel;
  
  if (!project || !model) {
    showToast('נא לבחור פרויקט ומודל', 'warning');
    return;
  }
  
  // Add user message to chat
  addMessageToChat('user', prompt);
  promptInput.value = '';
  
  // Scroll to bottom
  scrollChatToBottom();
  
  showLoading(true);
  
  try {
    const response = await apiCall('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        project,
        model,
        conversationHistory: state.conversationHistory.slice(-10), // Last 10 messages
      }),
    });
    
    showLoading(false);
    
    // Start showing assistant message
    const messageId = addMessageToChat('assistant', '', true);
    let fullResponse = '';
    
    // Parse SSE stream
    await parseSSEStream(response, (event, data) => {
      if (event === 'start') {
        console.log('Chat started:', data);
      } else if (event === 'chunk') {
        fullResponse += data.data;
        updateMessageContent(messageId, fullResponse);
        scrollChatToBottom();
      } else if (event === 'end') {
        updateMessageContent(messageId, fullResponse, false);
        
        // Add to conversation history
        state.conversationHistory.push(
          { role: 'user', content: prompt },
          { role: 'assistant', content: fullResponse }
        );
        
        showToast('התשובה הסתיימה', 'success');
      } else if (event === 'error') {
        showToast(`שגיאה: ${data.message}`, 'error');
      }
    });
  } catch (error) {
    showLoading(false);
    showToast(error.message, 'error');
    addMessageToChat('system', `שגיאה: ${error.message}`);
  }
}

function addMessageToChat(role, content, streaming = false) {
  const messagesContainer = document.getElementById('chat-messages');
  
  // Remove welcome message if exists
  const welcome = messagesContainer.querySelector('.welcome-message');
  if (welcome) {
    welcome.remove();
  }
  
  const messageId = `msg-${Date.now()}`;
  const messageDiv = document.createElement('div');
  messageDiv.id = messageId;
  messageDiv.className = `chat-message ${role}-message ${streaming ? 'streaming' : ''}`;
  
  const avatar = {
    'user': '👤',
    'assistant': '🤖',
    'system': '⚠️',
  }[role] || '💬';
  
  messageDiv.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-content">${escapeHtml(content)}</div>
  `;
  
  messagesContainer.appendChild(messageDiv);
  return messageId;
}

function updateMessageContent(messageId, content, streaming = true) {
  const messageDiv = document.getElementById(messageId);
  if (!messageDiv) return;
  
  const contentDiv = messageDiv.querySelector('.message-content');
  contentDiv.textContent = content;
  
  if (!streaming) {
    messageDiv.classList.remove('streaming');
  }
}

function scrollChatToBottom() {
  const messagesContainer = document.getElementById('chat-messages');
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Project Management Functions
async function startProject(projectName) {
  showLoading(true);
  
  try {
    const response = await apiCall('/api/projects/start', {
      method: 'POST',
      body: JSON.stringify({ project: projectName }),
    });
    
    const result = await response.json();
    showLoading(false);
    
    showToast(result.message || 'הפרויקט התחיל', 'success');
    
    // Reload projects list
    await loadProjects();
  } catch (error) {
    showLoading(false);
    showToast(error.message, 'error');
  }
}

async function stopProject(projectName) {
  showLoading(true);
  
  try {
    const response = await apiCall('/api/projects/stop', {
      method: 'POST',
      body: JSON.stringify({ project: projectName }),
    });
    
    const result = await response.json();
    showLoading(false);
    
    showToast(result.message || 'הפרויקט נעצר', 'success');
    
    // Reload projects list
    await loadProjects();
  } catch (error) {
    showLoading(false);
    showToast(error.message, 'error');
  }
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
  if (tabName === 'projects') {
    loadProjects();
  } else if (tabName === 'settings') {
    loadServerStatus();
  }
}

// Event Listeners Setup
function setupEventListeners() {
  // Login
  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('login-password').value;
    await login(password);
  });
  
  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', logout);
  document.getElementById('logout-settings-btn')?.addEventListener('click', logout);
  
  // Chat
  document.getElementById('chat-send-btn')?.addEventListener('click', sendChatMessage);
  document.getElementById('chat-prompt')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      sendChatMessage();
    }
  });
  
  // Project selection
  document.getElementById('chat-project-select')?.addEventListener('change', (e) => {
    state.selectedProject = e.target.value;
    localStorage.setItem('selectedProject', state.selectedProject);
  });
  
  // Model selection
  document.getElementById('chat-model-select')?.addEventListener('change', (e) => {
    state.selectedModel = e.target.value;
    localStorage.setItem('selectedModel', state.selectedModel);
  });
  
  // Projects
  document.getElementById('projects-refresh-btn')?.addEventListener('click', loadProjects);
  
  // Files
  document.getElementById('files-refresh-btn')?.addEventListener('click', refreshFiles);
  document.getElementById('file-close-btn')?.addEventListener('click', closeFileViewer);
  
  // Tab navigation
  setupTabNavigation();
}

// Files Functions
async function refreshFiles() {
  const project = state.selectedProject;
  if (!project) {
    showToast('נא לבחור פרויקט', 'warning');
    return;
  }
  
  showLoading(true);
  
  try {
    const response = await apiCall(`/api/files?projectPath=${encodeURIComponent(state.serverStatus.projectsRoot + '\\' + project)}`);
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
    tbody.innerHTML = '<tr><td colspan="3">אין קבצים</td></tr>';
    return;
  }
  
  files.forEach(file => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${file.isDir ? '📁' : '📄'} ${file.path}</td>
      <td>${formatFileSize(file.size)}</td>
      <td>${formatDate(file.mtime)}</td>
    `;
    if (!file.isDir) {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => openFile(file.path));
    }
    tbody.appendChild(row);
  });
}

async function openFile(filePath) {
  const project = state.selectedProject;
  const projectPath = state.serverStatus.projectsRoot + '\\' + project;
  
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

// API Helper
async function apiCall(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  
  const response = await fetch(endpoint, {
    ...options,
    headers,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    
    // Check if needs login
    if (error.requiresLogin) {
      logout();
    }
    
    throw new Error(error.error || error.message || 'Request failed');
  }
  
  return response;
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

// Make functions global for onclick handlers
window.startProject = startProject;
window.stopProject = stopProject;

