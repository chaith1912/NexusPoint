// src/routes/auth.routes.ts
import { Router } from 'express';
import {
  registerHandler,
  loginHandler,
  getMeHandler,
  registerValidation,
  loginValidation,
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.post('/register', registerValidation, registerHandler);
router.post('/login', loginValidation, loginHandler);

// Protected route
router.get('/me', authenticate, getMeHandler);

export default router;