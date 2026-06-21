const { processPendingSteps } = require('./cadenceService');
const { checkSmsToVoiceEscalation } = require('./voiceService');

let schedulerInterval = null;
const TICK_INTERVAL_MS = 60 * 1000; // 60 seconds

/**
 * Start the cadence scheduler.
 * Runs processPendingSteps() every 60 seconds.
 */
function startCadenceScheduler() {
  if (schedulerInterval) {
    console.log('[Cadence Scheduler] Already running');
    return;
  }

  console.log('[Cadence Scheduler] Started — checking for due steps and voice escalation every 60 seconds');

  // Run immediately on startup
  processPendingSteps();
  checkSmsToVoiceEscalation();

  schedulerInterval = setInterval(() => {
    processPendingSteps();
    checkSmsToVoiceEscalation();
  }, TICK_INTERVAL_MS);
}

/**
 * Stop the cadence scheduler (for graceful shutdown).
 */
function stopCadenceScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[Cadence Scheduler] Stopped');
  }
}

module.exports = { startCadenceScheduler, stopCadenceScheduler };
