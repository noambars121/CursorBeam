import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../env.js';
import { logger } from '../services/logger.js';

const router = Router();

const loginSchema = z.object({
  password: z.string(),
});

// Login endpoint
router.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const body = loginSchema.parse(req.body);
    
    // Check password
    if (body.password !== config.LOGIN_PASSWORD) {
      logger.warn({ ip: req.ip }, 'Failed login attempt');
      res.status(401).json({
        error: 'Invalid password',
        message: 'סיסמה שגויה',
      });
      return;
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { authenticated: true, timestamp: Date.now() },
      config.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    logger.info({ ip: req.ip }, 'Successful login');
    
    res.json({
      success: true,
      token,
      expiresIn: '24h',
      message: 'התחברת בהצלחה',
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    } else {
      logger.error({ error }, 'Login error');
      res.status(500).json({
        error: error.message || 'Login failed',
      });
    }
  }
});

// Verify token endpoint
router.get('/api/auth/verify', (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    res.status(401).json({ valid: false, message: 'No token provided' });
    return;
  }
  
  try {
    jwt.verify(token, config.JWT_SECRET);
    res.json({ valid: true });
  } catch (error) {
    res.status(401).json({ valid: false, message: 'Invalid or expired token' });
  }
});

// Logout endpoint (client-side token removal)
router.post('/api/auth/logout', (_req: Request, res: Response) => {
  res.json({ success: true, message: 'התנתקת בהצלחה' });
});

export default router;

