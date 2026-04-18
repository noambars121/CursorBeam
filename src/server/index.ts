import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { config } from './env.js';
import { logger } from './services/logger.js';
import {
  requireAuth,
  rateLimiter,
  getCorsMiddleware,
  errorHandler,
} from './security.js';
import { initWebSocket } from './services/websocket.js';

// Import routes
import authRouter from './routes/auth.js';
import statusRouter from './routes/status.js';
import projectsRouter from './routes/projects.js';
import chatRouter from './routes/chat.js';
import planRouter from './routes/plan.js';
import filesRouter from './routes/files.js';
import gitRouter from './routes/git.js';
import execRouter from './routes/exec.js';
import { rchatRouter } from './routes/rchat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(express.json({ limit: '1mb' }));

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim(), 'HTTP request'),
  },
}));

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for PWA
}));

// CORS
app.use(getCorsMiddleware());

// Rate limiting
app.use('/api/', rateLimiter);

// JWT authentication
app.use('/api/', requireAuth);

// Serve static PWA files
const webDir = path.join(__dirname, '../web');
app.use(express.static(webDir));

// API routes
app.use(authRouter);
app.use(statusRouter);
app.use(projectsRouter);
app.use(chatRouter);
app.use(planRouter);
app.use(filesRouter);
app.use(gitRouter);
app.use(execRouter);
app.use('/api/rchat', rchatRouter);

// Fallback to index.html for client-side routing
app.get('*', (_req, res) => {
  res.sendFile(path.join(webDir, 'index.html'));
});

// Error handler
app.use(errorHandler);

// Start server
const PORT = config.PORT;
const HOST = '0.0.0.0'; // Bind to all interfaces for Tailscale

// Create HTTP server for both Express and WebSocket
const server = createServer(app);

// Initialize WebSocket server
initWebSocket(server);

server.listen(PORT, HOST, () => {
  logger.info(
    {
      port: PORT,
      host: HOST,
      defaultProject: config.DEFAULT_PROJECT,
      allowlistCount: config.PROJECT_ALLOWLIST.length,
      readOnly: config.READ_ONLY,
      gitEnabled: config.GIT_ENABLE,
      websocket: true,
    },
    'Cursor Mobile server started'
  );
  
  console.log('\n🚀 Cursor Mobile listening on:');
  console.log(`  - Local:     http://localhost:${PORT}`);
  console.log(`  - Network:   http://${HOST}:${PORT}`);
  console.log(`  - WebSocket: ws://localhost:${PORT}/ws/chat`);
  console.log(`  - Tailscale: Check 'tailscale status' for your hostname`);
  console.log(`\n💡 PWA available at http://localhost:${PORT}/`);
  console.log(`📡 API status: http://localhost:${PORT}/api/status\n`);
});

