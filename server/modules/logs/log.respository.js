const logs = [];

export const insertLog = async (log) => {
  const newLog = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    ...log,
  };

  logs.push(newLog);
  return newLog;
};

export const fetchLogs = async (query) => {
  let result = logs;

  if (query.service) {
    result = result.filter((l) => l.service === query.service);
  }

  if (query.level) {
    result = result.filter((l) => l.level === query.level);
  }

  if (query.search) {
    result = result.filter((l) =>
      l.message.toLowerCase().includes(query.search.toLowerCase())
    );
  }

  return result;
};