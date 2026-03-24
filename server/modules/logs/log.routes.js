import express from 'express';

const router = express.Router();
router.post("/", createLog);
router.get("/", getLogs);