import express from 'express';
import logsRoutes from '../modules/logs/log.routes.js';

const router = express.Router();

router.use("/logs", logsRoutes);

export default router;