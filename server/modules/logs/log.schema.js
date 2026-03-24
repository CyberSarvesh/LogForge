export const validateLog = (data) => {
  if (!data.service || !data.message || !data.level) {
    throw new Error("Missing required fields");
  }

  const validLevels = ["info", "warn", "error"];
  if (!validLevels.includes(data.level)) {
    throw new Error("Invalid log level");
  }
};