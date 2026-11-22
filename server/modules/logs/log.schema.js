export const LEVELS = ["info", "warn", "error"];
export const MAX_BATCH = 1000;

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.status = 400;
  }
}

export const validateLog = (data) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ValidationError("Body must be a JSON object");
  }
  if (!data.service || !data.message || !data.level) {
    throw new ValidationError("Missing required fields: service, level, message");
  }
  if (typeof data.service !== "string" || data.service.length > 100) {
    throw new ValidationError("service must be a string of at most 100 characters");
  }
  if (typeof data.message !== "string" || data.message.length > 10000) {
    throw new ValidationError("message must be a string of at most 10000 characters");
  }
  if (!LEVELS.includes(data.level)) {
    throw new ValidationError(`Invalid log level. Use one of: ${LEVELS.join(", ")}`);
  }
  if (
    data.metadata !== undefined &&
    (data.metadata === null || typeof data.metadata !== "object" || Array.isArray(data.metadata))
  ) {
    throw new ValidationError("metadata must be a JSON object");
  }
};

export const validateBatch = (logs) => {
  if (!Array.isArray(logs) || logs.length === 0) {
    throw new ValidationError("Body must be a non-empty JSON array of logs");
  }
  if (logs.length > MAX_BATCH) {
    throw new ValidationError(`Batch too large (max ${MAX_BATCH} logs)`);
  }
  logs.forEach((log, i) => {
    try {
      validateLog(log);
    } catch (err) {
      throw new ValidationError(`logs[${i}]: ${err.message}`);
    }
  });
};

export const parseQuery = (query) => {
  const out = {};
  if (query.service) out.service = String(query.service);
  if (query.search) out.search = String(query.search);
  if (query.level) {
    if (!LEVELS.includes(query.level)) {
      throw new ValidationError(`Invalid level. Use one of: ${LEVELS.join(", ")}`);
    }
    out.level = query.level;
  }
  if (query.before !== undefined) {
    if (!/^\d+$/.test(String(query.before))) throw new ValidationError("before must be a log id");
    out.before = String(query.before);
  }
  const limit = query.limit === undefined ? 100 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new ValidationError("limit must be an integer between 1 and 500");
  }
  out.limit = limit;
  return out;
};
