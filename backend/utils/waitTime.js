const MIN_REAL_SAMPLES = 2; // need at least this many real durations before trusting them

/**
 * Returns { minutesPerPatient, source } where source is 'real-data' once
 * enough consultations have actually completed today, otherwise
 * 'manual-estimate' (the receptionist's starting figure).
 */
function getEffectiveAverage(config) {
  const samples = config.lastDurationsMinutes || [];
  if (samples.length >= MIN_REAL_SAMPLES) {
    const avg = samples.reduce((sum, m) => sum + m, 0) / samples.length;
    return { minutesPerPatient: Math.round(avg * 10) / 10, source: 'real-data', sampleSize: samples.length };
  }
  return { minutesPerPatient: config.avgConsultMinutes, source: 'manual-estimate', sampleSize: samples.length };
}

function estimateWaitMinutes(tokensAhead, config) {
  const { minutesPerPatient } = getEffectiveAverage(config);
  return Math.round(tokensAhead * minutesPerPatient);
}

module.exports = { getEffectiveAverage, estimateWaitMinutes, MIN_REAL_SAMPLES };
