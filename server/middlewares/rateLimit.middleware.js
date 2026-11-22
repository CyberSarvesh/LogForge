import rateLimit from "express-rate-limit";
import { RATE_LIMIT_MAX } from "../config/env.js";

const rateLimitMiddleware = rateLimit({
  windowMs: 60 * 1000,
  limit: RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests from this IP, please try again later." },
});

export default rateLimitMiddleware;
