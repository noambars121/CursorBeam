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
  currentCursorProject: null, // Currently open project in Cursor
  extensionConnected: false,
  wsConnected: false, // WebSocket connection state
};

// ===========================================
// WebSocket for Real-time Chat Updates
// ===========================================

let ws = null;
let wsReconnectTimeout = null;
let wsReconnectAttempts = 0;
const WS_MAX_RECONNECT_ATTEMPTS = 10;
const WS_RECONNECT_DELAY = 3000;

function initWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    return; // Already connected
  }
  
  // Construct WebSocket URL
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/chat`;
  
  console.log('🔌 Connecting to WebSocket:', wsUrl);
  
  try {
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('✅ WebSocket connected');
      state.wsConnected = true;
      wsReconnectAttempts = 0;
      updateWsConnectionStatus(true);
      
      // Stop polling when WebSocket is active
      stopRemoteChatPolling();
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (error) {
        console.error('WebSocket message parse error:', error);
      }
    };
    
    ws.onclose = (event) => {
      console.log('🔌 WebSocket disconnected:', event.code, event.reason);
      state.wsConnected = false;
      updateWsConnectionStatus(false);
      
      // Resume polling as fallback
      if (state.currentTab === 'chat') {
        startRemoteChatPolling();
      }
      
      // Try to reconnect
      scheduleReconnect();
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      state.wsConnected = false;
    };
    
  } catch (error) {
    console.error('Failed to create WebSocket:', error);
    // Fall back to polling
    startRemoteChatPolling();
  }
}

function handleWebSocketMessage(data) {
  switch (data.type) {
    case 'init':
      // Initial transcript received
      if (data.items && data.items.length > 0) {
        renderRemoteChatTranscript(data.items, 'websocket');
      }
      break;
    
    case 'newMessage':
      // New message received
      if (data.message) {
        addRemoteChatItem(data.message, true);
        
        // Show notification if tab is not active
        if (document.hidden && data.message.role === 'assistant') {
          showNotification('תשובה חדשה מ-Cursor', data.message.text.substring(0, 100));
        }
      }
      break;
    
    case 'transcriptUpdate':
      // Full transcript update
      if (data.items) {
        renderRemoteChatTranscript(data.items, 'websocket');
      }
      break;
    
    case 'pong':
      // Keep-alive response
      break;
    
    default:
      console.log('Unknown WebSocket message type:', data.type);
  }
}

function scheduleReconnect() {
  if (wsReconnectAttempts >= WS_MAX_RECONNECT_ATTEMPTS) {
    console.log('Max WebSocket reconnect attempts reached, using polling');
    return;
  }
  
  wsReconnectAttempts++;
  const delay = WS_RECONNECT_DELAY * Math.min(wsReconnectAttempts, 5);
  
  console.log(`Scheduling WebSocket reconnect in ${delay}ms (attempt ${wsReconnectAttempts})`);
  
  wsReconnectTimeout = setTimeout(() => {
    if (!state.wsConnected && state.token) {
      initWebSocket();
    }
  }, delay);
}

function closeWebSocket() {
  if (wsReconnectTimeout) {
    clearTimeout(wsReconnectTimeout);
    wsReconnectTimeout = null;
  }
  
  if (ws) {
    ws.close();
    ws = null;
  }
  
  state.wsConnected = false;
}

function updateWsConnectionStatus(connected) {
  const indicator = document.getElementById('ws-status');
  if (indicator) {
    indicator.className = `ws-indicator ${connected ? 'connected' : 'disconnected'}`;
    indicator.title = connected ? 'WebSocket מחובר' : 'WebSocket מנותק';
  }
}

function showNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/icon-192.png' });
  }
}

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
  localStorage.removeItem('biometricEnabled');
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
    
    // Initialize WebSocket for real-time updates
    initWebSocket();
    
    // Start remote chat polling as fallback if on chat tab
    if (state.currentTab === 'chat' && !state.wsConnected) {
      startRemoteChatPolling();
    }
    
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
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
    // Load both projects list and current project in parallel
    const [projectsResponse, currentResponse] = await Promise.all([
      apiCall('/api/projects'),
      apiCall('/api/projects/current').catch(() => null),
    ]);
    
    const data = await projectsResponse.json();
    state.projects = data.projects || [];
    
    // Update current project info
    if (currentResponse) {
      const currentData = await currentResponse.json();
      state.extensionConnected = currentData.connected;
      state.currentCursorProject = currentData.currentProject;
      
      // Auto-select current project if none selected
      if (state.currentCursorProject && !state.selectedProject) {
        state.selectedProject = state.currentCursorProject.name;
        localStorage.setItem('selectedProject', state.selectedProject);
      }
    }
    
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
    document.getElementById('rchat-project-select'), // Added for Remote Chat
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
  const selectors = [
    document.getElementById('chat-model-select'),
    document.getElementById('rchat-model-select'), // Added for Remote Chat
  ];
  
  selectors.forEach(select => {
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
  });
}

function getModelDisplayName(model) {
  const names = {
    'claude-4.5-sonnet': 'Claude 4.5 Sonnet',
    'claude-4-sonnet': 'Claude 4 Sonnet',
    'gpt-5-codex': 'GPT-5 Codex',
    'gpt-5': 'GPT-5',
    'claude-4.5-haiku': 'Claude 4.5 Haiku',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
  };
  return names[model] || model;
}

function updateProjectsList() {
  const container = document.getElementById('projects-list');
  if (!container) return;
  
  if (state.projects.length === 0) {
    container.innerHTML = '<p>טוען פרויקטים...</p>';
    return;
  }
  
  container.innerHTML = '';
  
  // Show current project status at top
  const statusDiv = document.createElement('div');
  statusDiv.className = 'current-project-status';
  
  if (state.extensionConnected && state.currentCursorProject) {
    const isKnownProject = state.projects.some(p => 
      p.name.toLowerCase() === state.currentCursorProject.name.toLowerCase()
    );
    
    statusDiv.innerHTML = `
      <div class="status-box success">
        <span class="status-icon">🎯</span>
        <div class="status-text">
          <strong>פרויקט פתוח ב-Cursor:</strong>
          <span class="project-name">${state.currentCursorProject.name}</span>
          ${state.currentCursorProject.external ? '<span class="badge external">חיצוני</span>' : ''}
          ${!isKnownProject && !state.currentCursorProject.external ? '<span class="badge unknown">לא ברשימה</span>' : ''}
        </div>
      </div>
    `;
  } else if (state.extensionConnected) {
    statusDiv.innerHTML = `
      <div class="status-box warning">
        <span class="status-icon">📂</span>
        <div class="status-text">
          <strong>Cursor מחובר</strong> - אין פרויקט פתוח
        </div>
      </div>
    `;
  } else {
    statusDiv.innerHTML = `
      <div class="status-box offline">
        <span class="status-icon">🔌</span>
        <div class="status-text">
          <strong>ההרחבה לא מחוברת</strong>
          <span class="hint">Ctrl+Shift+P → "Cursor Mobile: Start Bridge Server"</span>
        </div>
      </div>
    `;
  }
  container.appendChild(statusDiv);
  
  // Project list
  state.projects.forEach(project => {
    const card = document.createElement('div');
    
    // Check if this is the currently open project
    const isCurrentProject = state.currentCursorProject && 
      state.currentCursorProject.name.toLowerCase() === project.name.toLowerCase();
    
    card.className = `project-card ${isCurrentProject ? 'current-project' : ''}`;
    
    const statusIcon = project.running ? '🟢' : '⚪';
    const statusText = project.running ? 'פועל' : 'מנותק';
    const currentBadge = isCurrentProject ? '<span class="badge current">פתוח כעת</span>' : '';
    
    card.innerHTML = `
      <div class="project-info">
        <h3>${statusIcon} ${project.name} ${currentBadge}</h3>
        <p>${project.hasPackageJson ? '📦 npm project' : '📁 folder'} • ${statusText}</p>
        ${project.running && project.port ? `
          <p class="project-url">
            <a href="http://noam.tailf4f5e8.ts.net:${project.port}" target="_blank">
              🌐 פתח: http://noam.tailf4f5e8.ts.net:${project.port} ↗
            </a>
          </p>
        ` : ''}
      </div>
      <div class="project-actions">
        ${isCurrentProject ? 
          `<button class="secondary-btn" disabled>✓ פתוח</button>` :
          `<button onclick="switchToProject('${project.name}')" class="primary-btn" title="פתח פרויקט זה ב-Cursor">📂 פתח בCursor</button>`
        }
        ${project.running ?
          `<button onclick="stopProject('${project.name}')" class="secondary-btn">⏹ עצור</button>` :
          `<button onclick="startProject('${project.name}')" class="primary-btn">▶ הפעל</button>`
        }
      </div>
    `;
    container.appendChild(card);
  });
  
  // הוסף כפתור רענון
  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'secondary-btn';
  refreshBtn.textContent = '🔄 רענן רשימה';
  refreshBtn.onclick = loadProjects;
  container.appendChild(refreshBtn);
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
  
  // Show connecting indicator
  showToast(`🔄 מתחבר ל-${getModelDisplayName(model)}...`, 'info');
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
    let isConnected = false;
    await parseSSEStream(response, (event, data) => {
      if (event === 'start') {
        console.log('Chat started:', data);
        if (!isConnected) {
          showToast(`✅ מחובר ל-${getModelDisplayName(data.model || model)}`, 'success');
          isConnected = true;
        }
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
        
        showToast(`✅ התשובה הסתיימה (${data.duration}s)`, 'success');
      } else if (event === 'error') {
        showToast(`❌ שגיאה: ${data.message}`, 'error');
        addMessageToChat('system', `⚠️ שגיאה: ${data.message}\n\nוודא שCursor CLI מותקן ופועל.`);
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

async function switchToProject(projectName) {
  showLoading(true);
  showToast('📂 פותח פרויקט ב-Cursor...', 'info');
  
  try {
    const response = await apiCall('/api/projects/switch', {
      method: 'POST',
      body: JSON.stringify({ project: projectName }),
    });
    
    const result = await response.json();
    showLoading(false);
    
    showToast(result.message || `✅ הפרויקט ${projectName} נפתח ב-Cursor!`, 'success');
    
    // Update selected project in state
    state.selectedProject = projectName;
    localStorage.setItem('selectedProject', projectName);
    updateProjectSelectors();
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
  
  // Start/stop remote chat polling
  if (tabName === 'chat') {
    startRemoteChatPolling();
  } else {
    stopRemoteChatPolling();
  }
  
  // Load tab-specific data
  if (tabName === 'projects') {
    loadProjects();
  } else if (tabName === 'files') {
    loadFilesTree();
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
  
  // Remote Chat (UIA)
  document.getElementById('rchat-send-btn')?.addEventListener('click', sendRemoteChatMessage);
  document.getElementById('rchat-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      sendRemoteChatMessage();
    }
  });
  document.getElementById('rchat-refresh-btn')?.addEventListener('click', () => {
    fetchRemoteChatTranscript(true);
  });
  
  // Remote Chat - New Features
  document.getElementById('rchat-image-btn')?.addEventListener('click', () => {
    document.getElementById('rchat-image-input').click();
  });
  document.getElementById('rchat-image-input')?.addEventListener('change', handleImageUpload);
  document.getElementById('rchat-remove-image')?.addEventListener('click', removeUploadedImage);
  document.getElementById('rchat-cancel-btn')?.addEventListener('click', cancelLastMessage);
  
  // Remote Chat - Project & Model Selection
  document.getElementById('rchat-project-select')?.addEventListener('change', (e) => {
    state.selectedProject = e.target.value;
    localStorage.setItem('selectedProject', state.selectedProject);
  });
  document.getElementById('rchat-model-select')?.addEventListener('change', (e) => {
    state.selectedModel = e.target.value;
    localStorage.setItem('selectedModel', state.selectedModel);
  });
  
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
    
    // Auto-reload files if on files tab
    if (state.currentTab === 'files') {
      loadFilesTree();
    }
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
let currentOpenFile = null;
let currentFileContent = '';

async function loadFilesTree() {
  const project = state.selectedProject;
  if (!project) {
    document.getElementById('file-tree').innerHTML = '<p style="padding: 1rem; text-align: center; color: #999;">בחר פרויקט בטאב הצאט</p>';
    return;
  }
  
  showLoading(true);
  
  try {
    const response = await apiCall(`/api/files?project=${encodeURIComponent(project)}&tree=true`);
    const result = await response.json();
    showLoading(false);
    
    renderFileTree(result.tree);
  } catch (error) {
    showLoading(false);
    showToast(error.message, 'error');
    document.getElementById('file-tree').innerHTML = `<p style="padding: 1rem; color: red;">שגיאה: ${error.message}</p>`;
  }
}

function renderFileTree(tree) {
  const container = document.getElementById('file-tree');
  container.innerHTML = '';
  
  if (!tree || !tree.children || tree.children.length === 0) {
    container.innerHTML = '<p style="padding: 1rem; text-align: center; color: #999;">אין קבצים</p>';
    return;
  }
  
  function renderNode(node, parent) {
    if (node.type === 'folder') {
      // Skip root folder
      if (node.name === '/') {
        node.children.forEach(child => renderNode(child, parent));
        return;
      }
      
      const folderDiv = document.createElement('div');
      folderDiv.className = 'file-tree-node folder';
      folderDiv.innerHTML = `📁 ${node.name}`;
      parent.appendChild(folderDiv);
      
      const childrenDiv = document.createElement('div');
      childrenDiv.className = 'file-tree-children';
      parent.appendChild(childrenDiv);
      
      let isOpen = false;
      folderDiv.onclick = () => {
        isOpen = !isOpen;
        childrenDiv.style.display = isOpen ? 'block' : 'none';
        folderDiv.innerHTML = `${isOpen ? '📂' : '📁'} ${node.name}`;
      };
      
      node.children.forEach(child => renderNode(child, childrenDiv));
      childrenDiv.style.display = 'none';
    } else {
      // File
      const fileDiv = document.createElement('div');
      fileDiv.className = 'file-tree-node file';
      fileDiv.innerHTML = `📄 ${node.name}`;
      fileDiv.onclick = () => openFile(node.path);
      parent.appendChild(fileDiv);
    }
  }
  
  renderNode(tree, container);
}

async function openFile(filePath) {
  const project = state.selectedProject;
  if (!project) {
    showToast('נא לבחור פרויקט', 'warning');
    return;
  }
  
  showLoading(true);
  
  try {
    const response = await apiCall(`/api/file?project=${encodeURIComponent(project)}&path=${encodeURIComponent(filePath)}`);
    const result = await response.json();
    showLoading(false);
    
    currentOpenFile = filePath;
    currentFileContent = result.content;
    
    document.getElementById('current-file-name').textContent = filePath;
    document.getElementById('file-editor').value = result.content;
    document.getElementById('file-editor').disabled = false;
    document.getElementById('save-file-btn').style.display = 'inline-block';
    document.getElementById('close-file-btn').style.display = 'inline-block';
    
    // Highlight selected file in tree
    document.querySelectorAll('.file-tree-node').forEach(node => {
      node.classList.remove('selected');
    });
    const selectedNode = Array.from(document.querySelectorAll('.file-tree-node')).find(
      node => node.textContent.includes(filePath.split(/[/\\]/).pop())
    );
    if (selectedNode) {
      selectedNode.classList.add('selected');
    }
  } catch (error) {
    showLoading(false);
    showToast(error.message, 'error');
  }
}

async function saveCurrentFile() {
  if (!currentOpenFile || !state.selectedProject) {
    showToast('אין קובץ פתוח', 'warning');
    return;
  }
  
  const newContent = document.getElementById('file-editor').value;
  
  if (newContent === currentFileContent) {
    showToast('אין שינויים לשמור', 'info');
    return;
  }
  
  showLoading(true);
  
  try {
    await apiCall('/api/file', {
      method: 'POST',
      body: JSON.stringify({
        project: state.selectedProject,
        path: currentOpenFile,
        content: newContent,
      }),
    });
    
    currentFileContent = newContent;
    showLoading(false);
    showToast('✅ הקובץ נשמר בהצלחה!', 'success');
  } catch (error) {
    showLoading(false);
    showToast(`שגיאה בשמירה: ${error.message}`, 'error');
  }
}

function closeFile() {
  currentOpenFile = null;
  currentFileContent = '';
  
  document.getElementById('current-file-name').textContent = 'אין קובץ פתוח';
  document.getElementById('file-editor').value = '';
  document.getElementById('file-editor').disabled = true;
  document.getElementById('save-file-btn').style.display = 'none';
  document.getElementById('close-file-btn').style.display = 'none';
  
  // Remove selection from tree
  document.querySelectorAll('.file-tree-node').forEach(node => {
    node.classList.remove('selected');
  });
}

// Legacy function for compatibility
function refreshFiles() {
  loadFilesTree();
}

function closeFileViewer() {
  closeFile();
}

// Remote Chat (UIA) Functions
let rchatPollingInterval = null;
let rchatIsTyping = false;
let rchatFastPolling = false;
let rchatLastTranscriptLength = 0;

async function sendRemoteChatMessage() {
  // #region agent log
  fetch('http://127.0.0.1:7245/ingest/98576634-5f56-4b09-bb16-7a954cd9de71',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:sendRemoteChatMessage:entry',message:'Function called',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
  const input = document.getElementById('rchat-input');
  const text = input.value.trim();
  
  if (!text && !uploadedImageData) {
    showToast('הזן טקסט או בחר תמונה לשליחה', 'warning');
    return;
  }
  
  // Prepare message with optional image
  const messageData = { text };
  if (uploadedImageData) {
    messageData.image = uploadedImageData;
  }
  
  // Optimistically add to UI
  addRemoteChatItem({
    role: 'user',
    text: text,
    image: uploadedImageData,
    timestamp: Date.now()
  });
  
  // Show cancel button
  showCancelButton();
  
  // Clear input and image
  input.value = '';
  if (uploadedImageData) {
    removeUploadedImage();
  }
  
  // Stop polling while sending
  rchatIsTyping = true;
  
  try {
    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/98576634-5f56-4b09-bb16-7a954cd9de71',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:sendRemoteChatMessage:beforeApiCall',message:'About to call /api/rchat/type',data:{messageData},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    // *** ORIGINAL SENDING LOGIC - DO NOT CHANGE! ***
    const response = await apiCall('/api/rchat/type', {
      method: 'POST',
      body: JSON.stringify(messageData),
    });
    
    const result = await response.json();
    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/98576634-5f56-4b09-bb16-7a954cd9de71',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app.js:sendRemoteChatMessage:afterApiCall',message:'Got response from API',data:{resultOk:result.ok,resultError:result.error},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    
    if (result.ok) {
      showToast('✅ נשלח ל-Cursor!', 'success');
      
      // If we got a response, add it
      if (result.response) {
        addRemoteChatItem({
          role: 'assistant',
          text: result.response,
          timestamp: Date.now(),
          author: 'Cursor AI'
        });
      }
      
      // Start FAST polling to get AI response in real-time
      rchatIsTyping = false;
      startFastPolling();
      fetchRemoteChatTranscript(true);
    } else {
      throw new Error(result.error || 'Failed to send');
    }
  } catch (error) {
    showToast(`שגיאה: ${error.message}`, 'error');
    rchatIsTyping = false;
  }
}

async function fetchRemoteChatTranscript(force = false) {
  // Don't poll while user is typing
  if (rchatIsTyping && !force) {
    return;
  }
  
  try {
    const response = await apiCall('/api/rchat/dump');
    const result = await response.json();
    
    if (result.ok && result.items) {
      renderRemoteChatTranscript(result.items, result.source);
      
      // Check if we should stop fast polling (transcript stopped growing)
      if (rchatFastPolling) {
        if (result.items.length === rchatLastTranscriptLength) {
          // No change in last 2 polls - stop fast polling
          stopFastPolling();
        }
        rchatLastTranscriptLength = result.items.length;
      }
    }
  } catch (error) {
    console.error('Failed to fetch remote chat transcript:', error);
  }
}

function renderRemoteChatTranscript(items, source) {
  const container = document.getElementById('rchat-messages');
  
  if (!items || items.length === 0) {
    container.innerHTML = `
      <div class="rchat-welcome">
        <p>📱 שלח הודעה לצ'אט של Cursor</p>
        <p class="small-text">משתמש ב-Direct Cursor (חיבור ישיר)</p>
        <p class="small-text" style="margin-top: 8px;">עובד מכל מקום דרך Tailscale! 🚀</p>
      </div>
    `;
    return;
  }
  
  // Clear and render items
  container.innerHTML = '';
  
  items.forEach((item, index) => {
    addRemoteChatItem(item, index === items.length - 1);
  });
}

function addRemoteChatItem(item, scrollToBottom = true) {
  const container = document.getElementById('rchat-messages');
  
  // Remove welcome message if present
  const welcome = container.querySelector('.rchat-welcome');
  if (welcome) {
    welcome.remove();
  }
  
  const div = document.createElement('div');
  div.className = `rchat-item ${item.role}`;
  
  let html = '';
  
  if (item.author) {
    html += `<div class="rchat-item-author">${item.author}</div>`;
  }
  
  // Add image if present
  if (item.image && item.image.data) {
    html += `<div class="rchat-item-image"><img src="${item.image.data}" alt="${item.image.name || 'Image'}" style="max-width: 200px; border-radius: 8px; margin-bottom: 8px;"></div>`;
  }
  
  if (item.text) {
    html += `<div class="rchat-item-text">${escapeHtml(item.text)}</div>`;
  }
  
  if (item.timestamp) {
    const time = new Date(item.timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    html += `<div class="rchat-item-time">${time}</div>`;
  }
  
  div.innerHTML = html;
  container.appendChild(div);
  
  if (scrollToBottom) {
    container.scrollTop = container.scrollHeight;
  }
}

function updateUiaHostStatus(statusData) {
  const statusBadge = document.getElementById('uia-status');
  if (!statusBadge) return;
  
  if (statusData.uiaAvailable) {
    statusBadge.textContent = `UIA Host מחובר ✓`;
    statusBadge.className = 'status-badge online';
  } else if (statusData.mode === 'pophide') {
    statusBadge.textContent = 'UIA Host לא זמין (fallback CLI)';
    statusBadge.className = 'status-badge warning';
  } else {
    statusBadge.textContent = `CLI Mode 🖥️`;
    statusBadge.className = 'status-badge offline';
  }
}

function startRemoteChatPolling() {
  // Initial fetch
  fetchRemoteChatTranscript();
  
  // Check status
  checkUiaHostStatus();
  
  // Poll every 3 seconds
  if (rchatPollingInterval) {
    clearInterval(rchatPollingInterval);
  }
  
  rchatPollingInterval = setInterval(() => {
    if (state.currentTab === 'chat' && !rchatIsTyping) {
      fetchRemoteChatTranscript();
    }
  }, 3000);
}

function stopRemoteChatPolling() {
  if (rchatPollingInterval) {
    clearInterval(rchatPollingInterval);
    rchatPollingInterval = null;
  }
}

let rchatFastPollingInterval = null;

function startFastPolling() {
  // Stop regular polling
  if (rchatPollingInterval) {
    clearInterval(rchatPollingInterval);
    rchatPollingInterval = null;
  }
  
  // Start FAST polling (every 300ms to see words in real-time!)
  rchatFastPolling = true;
  rchatLastTranscriptLength = 0;
  
  if (rchatFastPollingInterval) {
    clearInterval(rchatFastPollingInterval);
  }
  
  rchatFastPollingInterval = setInterval(() => {
    if (!rchatIsTyping) {
      fetchRemoteChatTranscript();
    }
  }, 300); // 300ms = ~3 words per second streaming effect!
  
  console.log('🚀 Fast polling started - תשובות בזמן אמת!');
}

function stopFastPolling() {
  if (rchatFastPollingInterval) {
    clearInterval(rchatFastPollingInterval);
    rchatFastPollingInterval = null;
  }
  
  rchatFastPolling = false;
  
  console.log('✅ Fast polling stopped - חזרה לpolling רגיל');
  
  // Resume regular polling
  startRemoteChatPolling();
}

async function checkUiaHostStatus() {
  try {
    const response = await apiCall('/api/rchat/status');
    const result = await response.json();
    
    if (result.ok) {
      updateUiaHostStatus(result);
    }
  } catch (error) {
    console.error('Failed to check UIA Host status:', error);
  }
}

// ========== NEW FEATURES: Image Upload, Cancel, Model/Project Selector ==========

let uploadedImageData = null;

function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('image/')) {
    showToast('יש לבחור קובץ תמונה', 'error');
    return;
  }
  
  if (file.size > 10 * 1024 * 1024) { // 10MB limit
    showToast('התמונה גדולה מדי (מקסימום 10MB)', 'error');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = (e) => {
    uploadedImageData = {
      name: file.name,
      type: file.type,
      data: e.target.result
    };
    
    // Show preview
    const preview = document.getElementById('rchat-image-preview');
    const img = document.getElementById('rchat-preview-img');
    img.src = e.target.result;
    preview.style.display = 'block';
    
    showToast('תמונה נטענה ✓', 'success');
  };
  reader.readAsDataURL(file);
}

function removeUploadedImage() {
  uploadedImageData = null;
  document.getElementById('rchat-image-preview').style.display = 'none';
  document.getElementById('rchat-image-input').value = '';
  showToast('תמונה הוסרה', 'info');
}

let lastUserMessageElement = null;

function cancelLastMessage() {
  const container = document.getElementById('rchat-messages');
  const userMessages = container.querySelectorAll('.rchat-item.user');
  
  if (userMessages.length > 0) {
    const lastMsg = userMessages[userMessages.length - 1];
    lastMsg.style.opacity = '0.4';
    lastMsg.style.textDecoration = 'line-through';
    
    setTimeout(() => {
      lastMsg.remove();
      showToast('ההודעה בוטלה', 'info');
      document.getElementById('rchat-cancel-btn').style.display = 'none';
    }, 500);
  }
}

function showCancelButton() {
  const cancelBtn = document.getElementById('rchat-cancel-btn');
  cancelBtn.style.display = 'block';
  
  // Hide after 10 seconds
  setTimeout(() => {
    cancelBtn.style.display = 'none';
  }, 10000);
}

// ===========================================
// Biometric Authentication (WebAuthn)
// ===========================================

const BIOMETRIC_CREDENTIAL_KEY = 'biometricCredentialId';

async function isBiometricAvailable() {
  if (!window.PublicKeyCredential) {
    return false;
  }
  
  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return available;
  } catch (error) {
    console.log('Biometric check error:', error);
    return false;
  }
}

async function setupBiometric() {
  if (!await isBiometricAvailable()) {
    showToast('זיהוי ביומטרי לא נתמך במכשיר זה', 'error');
    return false;
  }
  
  try {
    // Generate challenge
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    
    // User ID
    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);
    
    const publicKeyCredentialCreationOptions = {
      challenge: challenge,
      rp: {
        name: "Cursor Mobile",
        id: window.location.hostname
      },
      user: {
        id: userId,
        name: "cursor-user",
        displayName: "Cursor Mobile User"
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },  // ES256
        { alg: -257, type: "public-key" } // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required"
      },
      timeout: 60000,
      attestation: "none"
    };
    
    const credential = await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions
    });
    
    if (credential) {
      // Store credential ID
      const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
      localStorage.setItem(BIOMETRIC_CREDENTIAL_KEY, credentialId);
      localStorage.setItem('biometricEnabled', 'true');
      
      showToast('✅ זיהוי ביומטרי הופעל בהצלחה!', 'success');
      return true;
    }
  } catch (error) {
    console.error('Biometric setup error:', error);
    if (error.name === 'NotAllowedError') {
      showToast('הפעולה בוטלה או נדחתה', 'warning');
    } else {
      showToast('שגיאה בהגדרת זיהוי ביומטרי', 'error');
    }
  }
  
  return false;
}

async function authenticateWithBiometric() {
  const credentialId = localStorage.getItem(BIOMETRIC_CREDENTIAL_KEY);
  
  if (!credentialId) {
    showToast('זיהוי ביומטרי לא הוגדר', 'warning');
    return false;
  }
  
  try {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    
    const publicKeyCredentialRequestOptions = {
      challenge: challenge,
      allowCredentials: [{
        id: Uint8Array.from(atob(credentialId), c => c.charCodeAt(0)),
        type: "public-key",
        transports: ["internal"]
      }],
      userVerification: "required",
      timeout: 60000
    };
    
    const assertion = await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions
    });
    
    if (assertion) {
      // Biometric verified - now login
      // In a real app, you'd verify this server-side
      // For now, we'll use the stored token or request password
      
      const storedToken = localStorage.getItem('authToken');
      if (storedToken) {
        state.token = storedToken;
        showToast('✅ התחברת בהצלחה!', 'success');
        showMainApp();
        await loadInitialData();
        return true;
      } else {
        showToast('יש להתחבר עם סיסמה לפחות פעם אחת', 'warning');
      }
    }
  } catch (error) {
    console.error('Biometric auth error:', error);
    if (error.name === 'NotAllowedError') {
      showToast('זיהוי ביומטרי נכשל או בוטל', 'warning');
    } else {
      showToast('שגיאה בזיהוי ביומטרי', 'error');
    }
  }
  
  return false;
}

function isBiometricEnabled() {
  return localStorage.getItem('biometricEnabled') === 'true';
}

// Auto-trigger biometric on load if enabled
async function tryBiometricLogin() {
  if (isBiometricEnabled() && await isBiometricAvailable()) {
    // Show biometric option
    const biometricBtn = document.getElementById('biometric-login-btn');
    if (biometricBtn) {
      biometricBtn.style.display = 'flex';
      biometricBtn.onclick = authenticateWithBiometric;
    }
  }
}

// ===========================================
// Voice Input (Speech Recognition)
// ===========================================

let recognition = null;
let isRecording = false;

function initVoiceInput() {
  // Check for browser support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    console.log('Speech recognition not supported');
    // Hide voice button if not supported
    const voiceBtn = document.getElementById('voice-input-btn');
    if (voiceBtn) voiceBtn.style.display = 'none';
    return;
  }
  
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'he-IL'; // Hebrew by default
  
  recognition.onstart = () => {
    isRecording = true;
    updateVoiceButtonState(true);
    showToast('🎤 מקשיב...', 'info');
  };
  
  recognition.onresult = (event) => {
    let finalTranscript = '';
    let interimTranscript = '';
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }
    
    // Update input field with transcript
    const input = document.getElementById('rchat-input');
    if (input) {
      if (finalTranscript) {
        input.value += finalTranscript + ' ';
      }
      // Show interim results as placeholder or in real-time
      if (interimTranscript) {
        updateInterimText(interimTranscript);
      }
    }
  };
  
  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    isRecording = false;
    updateVoiceButtonState(false);
    
    if (event.error === 'no-speech') {
      showToast('לא זוהה דיבור', 'warning');
    } else if (event.error === 'not-allowed') {
      showToast('יש לאפשר גישה למיקרופון', 'error');
    } else {
      showToast(`שגיאה: ${event.error}`, 'error');
    }
  };
  
  recognition.onend = () => {
    isRecording = false;
    updateVoiceButtonState(false);
    clearInterimText();
  };
}

function toggleVoiceInput() {
  if (!recognition) {
    initVoiceInput();
    if (!recognition) {
      showToast('זיהוי קולי לא נתמך בדפדפן זה', 'error');
      return;
    }
  }
  
  if (isRecording) {
    recognition.stop();
  } else {
    try {
      recognition.start();
    } catch (error) {
      console.error('Failed to start recognition:', error);
      showToast('שגיאה בהפעלת מיקרופון', 'error');
    }
  }
}

function updateVoiceButtonState(recording) {
  const voiceBtn = document.getElementById('voice-input-btn');
  if (voiceBtn) {
    voiceBtn.classList.toggle('recording', recording);
    voiceBtn.innerHTML = recording ? '🔴' : '🎤';
    voiceBtn.title = recording ? 'עצור הקלטה' : 'דבר (Voice Input)';
  }
}

function updateInterimText(text) {
  let interimEl = document.getElementById('voice-interim');
  if (!interimEl) {
    interimEl = document.createElement('div');
    interimEl.id = 'voice-interim';
    interimEl.className = 'voice-interim';
    const inputContainer = document.querySelector('.rchat-input-container');
    if (inputContainer) {
      inputContainer.appendChild(interimEl);
    }
  }
  interimEl.textContent = text;
  interimEl.style.display = text ? 'block' : 'none';
}

function clearInterimText() {
  const interimEl = document.getElementById('voice-interim');
  if (interimEl) {
    interimEl.style.display = 'none';
  }
}

function switchVoiceLanguage() {
  if (!recognition) return;
  
  // Toggle between Hebrew and English
  if (recognition.lang === 'he-IL') {
    recognition.lang = 'en-US';
    showToast('🌍 English mode', 'info');
  } else {
    recognition.lang = 'he-IL';
    showToast('🌍 מצב עברית', 'info');
  }
}

// Initialize voice input on load
document.addEventListener('DOMContentLoaded', () => {
  initVoiceInput();
  
  // Add voice button event listener
  document.getElementById('voice-input-btn')?.addEventListener('click', toggleVoiceInput);
});

// ===========================================
// Keyboard Shortcuts
// ===========================================

const keyboardShortcuts = {
  'Escape': () => {
    // Close modals, cancel operations
    const modal = document.querySelector('.modal.active');
    if (modal) {
      modal.classList.remove('active');
      return true;
    }
    // Cancel voice input
    if (isRecording && recognition) {
      recognition.stop();
      return true;
    }
    return false;
  },
  
  'Enter': (e) => {
    // Submit forms if Ctrl/Cmd is pressed
    if (e.ctrlKey || e.metaKey) {
      if (state.currentTab === 'chat') {
        const input = document.getElementById('rchat-input');
        if (input && document.activeElement === input) {
          sendRemoteChatMessage();
          return true;
        }
      }
    }
    return false;
  },
  
  'k': (e) => {
    // Ctrl+K: Quick command palette (focus chat input)
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      switchTab('chat');
      setTimeout(() => {
        document.getElementById('rchat-input')?.focus();
      }, 100);
      return true;
    }
    return false;
  },
  
  '1': (e) => {
    if (e.altKey) {
      switchTab('chat');
      return true;
    }
    return false;
  },
  
  '2': (e) => {
    if (e.altKey) {
      switchTab('projects');
      return true;
    }
    return false;
  },
  
  '3': (e) => {
    if (e.altKey) {
      switchTab('files');
      return true;
    }
    return false;
  },
  
  '4': (e) => {
    if (e.altKey) {
      switchTab('git');
      return true;
    }
    return false;
  },
  
  '5': (e) => {
    if (e.altKey) {
      switchTab('settings');
      return true;
    }
    return false;
  },
  
  'm': (e) => {
    // Alt+M: Toggle voice input
    if (e.altKey) {
      e.preventDefault();
      toggleVoiceInput();
      return true;
    }
    return false;
  },
  
  'r': (e) => {
    // Ctrl+R: Refresh current view
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      switch (state.currentTab) {
        case 'projects':
          loadProjects();
          break;
        case 'files':
          if (typeof loadFileTree === 'function') loadFileTree();
          break;
        case 'chat':
          fetchRemoteChatTranscript();
          break;
        case 'git':
          if (typeof loadGitStatus === 'function') loadGitStatus();
          break;
      }
      showToast('רענון...', 'info');
      return true;
    }
    return false;
  },
  
  '/': (e) => {
    // Focus search/filter
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const searchInput = document.querySelector(`#${state.currentTab}-view input[type="search"], #${state.currentTab}-view input[type="text"]`);
      if (searchInput) {
        searchInput.focus();
        return true;
      }
    }
    return false;
  }
};

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't handle shortcuts when typing in inputs (except special ones)
    const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    
    // Always handle Escape
    if (e.key === 'Escape') {
      if (keyboardShortcuts['Escape']()) {
        e.preventDefault();
      }
      return;
    }
    
    // Skip if typing in an input (unless using modifier keys)
    if (isTyping && !e.ctrlKey && !e.metaKey && !e.altKey) {
      return;
    }
    
    const handler = keyboardShortcuts[e.key];
    if (handler && handler(e)) {
      // Handler returned true, it handled the event
    }
  });
  
  console.log('⌨️ Keyboard shortcuts initialized');
  console.log('  Alt+1-5: Switch tabs');
  console.log('  Ctrl+K: Focus chat');
  console.log('  Ctrl+R: Refresh view');
  console.log('  Alt+M: Voice input');
  console.log('  Escape: Cancel/Close');
}

// Initialize shortcuts on load
document.addEventListener('DOMContentLoaded', initKeyboardShortcuts);

// ========== END NEW FEATURES ==========

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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

// Make functions global for onclick handlers
window.startProject = startProject;
window.stopProject = stopProject;
window.switchToProject = switchToProject;

