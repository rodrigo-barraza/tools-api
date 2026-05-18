const TRAJECTORY_BUFFER_SIZE = 100;

const cache = {
  position: null as any,
  astronauts: null as any,
  trajectory: [] as any[],
  lastPositionFetch: null as any,
  lastAstrosFetch: null as any,
  positionError: null as any,
  astrosError: null as any,
};

/**
 * Update ISS position and append to trajectory ring buffer.
 */
export function updateIssPosition(position: any) {
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

export function setIssPositionError(error: any) {
  cache.positionError = { message: error.message, time: new Date().toISOString() };
}

/**
 * Update astronaut roster.
 */
export function updateAstronauts(data: any) {
  cache.astronauts = data;
  cache.lastAstrosFetch = new Date();
  cache.astrosError = null;
}

export function setAstronautsError(error: any) {
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
