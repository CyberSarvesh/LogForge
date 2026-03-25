import { pool } from "../../db/client.js";

export const insertLog = async (log) => {
  const query = `
    INSERT INTO logs (service, level, message, metadata)
    VALUES ($1, $2, $3, $4)
    RETURNING *;
  `;

  const values = [
    log.service,
    log.level,
    log.message,
    log.metadata || {},
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
};

export const fetchLogs = async (queryParams) => {
  let query = `SELECT * FROM logs WHERE 1=1`;
  const values = [];

  if (queryParams.service) {
    values.push(queryParams.service);
    query += ` AND service = $${values.length}`;
  }

  if (queryParams.level) {
    values.push(queryParams.level);
    query += ` AND level = $${values.length}`;
  }

  if (queryParams.search) {
    values.push(`%${queryParams.search}%`);
    query += ` AND message ILIKE $${values.length}`;
  }

  query += ` ORDER BY timestamp DESC LIMIT 100`;

  const result = await pool.query(query, values);
  return result.rows;
};