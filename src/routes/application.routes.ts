// src/routes/application.routes.ts
import { Router } from 'express';
import {
  createHandler,
  getAllHandler,
  getByIdHandler,
  updateHandler,
  deleteHandler,
  createValidation,
  updateValidation,
} from '../controllers/application.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All application routes require authentication
router.get('/', authenticate, getAllHandler);
router.post('/', authenticate, createValidation, createHandler);
router.get('/:id', authenticate, getByIdHandler);
router.patch('/:id', authenticate, updateValidation, updateHandler);
router.delete('/:id', authenticate, deleteHandler);

export default router;
