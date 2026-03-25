import express from 'express';
import rateLimitMiddleware from '../../middlewares/rateLimit.middleware.js';


const router = express.Router();
router.post("/", rateLimitMiddleware, createLog);
router.get("/", rateLimitMiddleware, getLogs);