export const LEVELS = ["info", "warn", "error"];
export const MAX_BATCH = 1000;
const MAX_ID = 2n ** 63n - 1n; // logs.id is BIGSERIAL. A BigInt, because Number would round it.

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.status = 400;
  }
}

// Postgres cannot store or compare U+0000 in text or jsonb.
const NUL = String.fromCharCode(0);

export const rejectNul = (text, field) => {
  if (text.includes(NUL)) throw new ValidationError(`${field} must not contain NUL characters`);
};

// Checks keys and values at every depth. A loop, because recursion would overflow on deeply nested input.
const rejectNulInJson = (root, field) => {
  const pending = [root];
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === "string") {
      rejectNul(value, field);
    } else if (Array.isArray(value)) {
      for (const item of value) pending.push(item);
    } else if (typeof value === "object" && value !== null) {
      for (const key in value) {
        rejectNul(key, field);
        pending.push(value[key]);
      }
    }
  }
};

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
  rejectNul(data.service, "service");
  rejectNul(data.message, "message");
  if (data.metadata) rejectNulInJson(data.metadata, "metadata");
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
  for (const field of ["service", "search"]) {
    if (!query[field]) continue;
    out[field] = String(query[field]);
    rejectNul(out[field], field);
  }
  if (query.level) {
    if (!LEVELS.includes(query.level)) {
      throw new ValidationError(`Invalid level. Use one of: ${LEVELS.join(", ")}`);
    }
    out.level = query.level;
  }
  if (query.before !== undefined) {
    const before = String(query.before);
    if (!/^\d+$/.test(before) || BigInt(before) > MAX_ID) throw new ValidationError("before must be a log id");
    out.before = before;
  }
  const limit = query.limit === undefined ? 100 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new ValidationError("limit must be an integer between 1 and 500");
  }
  out.limit = limit;
  return out;
};
