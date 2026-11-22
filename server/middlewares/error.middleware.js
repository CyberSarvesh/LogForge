export const notFound = (req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
};

const errorMiddleware = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const status = err.status || (err.type === "entity.parse.failed" ? 400 : 500);
  if (status >= 500) console.error(err);

  res.status(status).json({
    error: status >= 500 ? "Internal Server Error" : err.message,
  });
};

export default errorMiddleware;
