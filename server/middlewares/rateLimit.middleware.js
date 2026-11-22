import rateLimit from "express-rate-limit";
import { RATE_LIMIT_MAX } from "../config/env.js";
import { clientKey } from "./clientKey.js";

const rateLimitMiddleware = rateLimit({
  windowMs: 60 * 1000,
  limit: RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: clientKey,
  validate: { xForwardedForHeader: false }, // deliberately ignored, see clientKey.js
  message: { error: "Too many requests from this IP, please try again later." },
});

export default rateLimitMiddleware;
