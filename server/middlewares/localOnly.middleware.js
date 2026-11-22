// For endpoints that only the developer at this machine may use. Each check closes a different door.
const LOOPBACK_ADDRESS = /^(::1|(::ffff:)?127\.\d+\.\d+\.\d+)$/;
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

const isLocalSameOrigin = (req) => {
  // Other devices on the network. The socket address can't be forged with a header.
  if (!LOOPBACK_ADDRESS.test(req.socket.remoteAddress ?? "")) return false;
  // A proxy or tunnel on this machine makes remote callers look local.
  if (req.headers.forwarded || req.headers["x-forwarded-for"]) return false;

  // DNS rebinding: a foreign domain that resolves to 127.0.0.1 still sends its own Host.
  const host = req.headers.host ?? "";
  if (!LOOPBACK_HOST.test(host)) return false;

  // Other websites open in the developer's browser. POSTs carry Origin. GETs from <img> or
  // <script> don't, but browsers label them with Sec-Fetch-Site. curl sends neither.
  const { origin } = req.headers;
  if (origin && origin.toLowerCase() !== `${req.protocol}://${host}`.toLowerCase()) return false;
  const site = req.headers["sec-fetch-site"];
  return !site || site === "same-origin" || site === "none";
};

const localOnlyMiddleware = (req, res, next) => {
  if (isLocalSameOrigin(req)) return next();
  res.status(403).json({ error: "Demo controls only work when LogForge is opened through localhost on the machine running it" });
};

export default localOnlyMiddleware;
