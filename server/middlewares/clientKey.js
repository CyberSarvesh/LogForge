import { isIP } from "node:net";
import { ipKeyGenerator } from "express-rate-limit";
import { ON_RENDER } from "../config/env.js";

/**
 * Who to count a request against. On Render every socket belongs to its proxy, and X-Forwarded-For
 * can be prefixed by the caller, so use the header that Render's Cloudflare edge sets itself.
 * Anywhere else that header could be forged, so only the socket address counts.
 */
export const clientKey = (req) => {
  const edgeIp = ON_RENDER ? req.headers["cf-connecting-ip"] : undefined;
  const ip = edgeIp && isIP(edgeIp) ? edgeIp : req.socket.remoteAddress ?? "";
  return ipKeyGenerator(ip); // groups IPv6 callers by subnet
};
