import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { config } from './env.js';
import { logger } from './services/logger.js';

/**
 * JWT Authentication Middleware
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for public endpoints
  const publicPaths = ['/status', '/auth/login', '/auth/verify'];
  const isPublic = publicPaths.some(path => 
    req.path === path || req.originalUrl.includes(`/api${path}`)
  );
  
  if (isPublic) {
    return next();
  }
  
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  
  if (!token) {
    logger.warn({ path: req.path, ip: req.ip }, 'No token provided');
    res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'נדרש להתחבר',
      requiresLogin: true 
    });
    return;
  }
  
  try {
    jwt.verify(token, config.JWT_SECRET);
    next();
  } catch (error) {
    logger.warn({ path: req.path, ip: req.ip, error }, 'Invalid token');
    res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'טוקן לא תקף או פג תוקף',
      requiresLogin: true 
    });
  }
}

/**
 * Rate Limiter - 30 requests per minute per IP
 */
export const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { error: 'Too many requests', message: 'Please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn({ ip: req.ip, path: req.path }, 'Rate limit exceeded');
    res.status(429).json({ error: 'Too many requests', message: 'Please try again later' });
  },
});

/**
 * CORS Configuration
 */
export function getCorsMiddleware() {
  const origins = config.CORS_ORIGINS;
  
  if (origins === '*') {
    return cors({
      origin: true,
      credentials: true,
    });
  }
  
  const allowedOrigins = origins.split(',').map(o => o.trim());
  
  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) {
        return callback(null, true);
      }
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn({ origin }, 'CORS origin rejected');
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  });
}

/**
 * Require Write Access - blocks if READ_ONLY mode is enabled
 */
export function requireWriteAccess(req: Request, res: Response, next: NextFunction): void {
  if (config.READ_ONLY) {
    logger.warn({ path: req.path, ip: req.ip }, 'Write operation blocked (READ_ONLY mode)');
    res.status(403).json({
      error: 'Forbidden',
      message: 'Write operations are disabled (READ_ONLY mode)',
    });
    return;
  }
  
  next();
}

/**
 * Global Error Handler
 */
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  logger.error({
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  }, 'Request error');
  
  const isDev = process.env.NODE_ENV !== 'production';
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(isDev && { stack: err.stack }),
  });
}

