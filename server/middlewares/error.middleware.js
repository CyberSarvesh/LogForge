export const notFound = (req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
};

const errorMiddleware = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  // 57014: Postgres cancelled the query at statement_timeout. That's overload, not a bug.
  if (err.code === "57014") {
    res.set("Retry-After", "2");
    return res.status(503).json({ error: "The database is too busy to finish that, retry shortly." });
  }

  const status = err.status || (err.type === "entity.parse.failed" ? 400 : 500);
  if (status >= 500) console.error(err);

  res.status(status).json({
    error: status >= 500 ? "Internal Server Error" : err.message,
  });
};

export default errorMiddleware;
