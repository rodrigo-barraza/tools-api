const TRAJECTORY_BUFFER_SIZE = 100;

const cache = {
  position: null,
  astronauts: null,
  trajectory: [],
  lastPositionFetch: null,
  lastAstrosFetch: null,
  positionError: null,
  astrosError: null,
};

/**
 * Update ISS position and append to trajectory ring buffer.
 */
export function updateIssPosition(position) {
  cache.position = position;
  cache.lastPositionFetch = new Date();
  cache.positionError = null;

  // Ring buffer — keep last N positions for trajectory
  cache.trajectory.push({
    ...position,
    recordedAt: new Date(),
  });
  if (cache.trajectory.length > TRAJECTORY_BUFFER_SIZE) {
    cache.trajectory.shift();
  }
}

export function setIssPositionError(error) {
  cache.positionError = { message: error.message, time: new Date().toISOString() };
}

/**
 * Update astronaut roster.
 */
export function updateAstronauts(data) {
  cache.astronauts = data;
  cache.lastAstrosFetch = new Date();
  cache.astrosError = null;
}

export function setAstronautsError(error) {
  cache.astrosError = { message: error.message, time: new Date().toISOString() };
}

/**
 * Get current ISS position + astronauts.
 */
export function getIssData() {
  return {
    position: cache.position,
    astronauts: cache.astronauts,
    lastPositionFetch: cache.lastPositionFetch,
    lastAstrosFetch: cache.lastAstrosFetch,
  };
}

/**
 * Get trajectory (last 100 positions).
 */
export function getIssTrajectory() {
  return [...cache.trajectory];
}

export function getIssHealth() {
  return {
    lastPositionFetch: cache.lastPositionFetch,
    lastAstrosFetch: cache.lastAstrosFetch,
    positionError: cache.positionError,
    astrosError: cache.astrosError,
    trajectoryPoints: cache.trajectory.length,
  };
}
