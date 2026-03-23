let warnings = [];
let lastFetch = null;
let lastError = null;

export function updateWarnings(data) {
  warnings = data;
  lastFetch = new Date().toISOString();
  lastError = null;
}

export function setWarningError(error) {
  lastError = { message: error.message, time: new Date().toISOString() };
}

export function getWarnings() {
  return {
    count: warnings.length,
    warnings,
    lastFetch,
  };
}

export function getWarningCount() {
  return {
    total: warnings.length,
    byType: {
      warning: warnings.filter((w) => w.type === "warning").length,
      watch: warnings.filter((w) => w.type === "watch").length,
      advisory: warnings.filter((w) => w.type === "advisory").length,
      statement: warnings.filter((w) => w.type === "statement").length,
    },
    lastFetch,
  };
}

export function getWarningHealth() {
  return {
    lastFetch,
    error: lastError,
    count: warnings.length,
  };
}
