import type { ScreenerEntry } from './types';

export interface InstitutionalDecision {
  state: 'TRENDING' | 'RANGING' | 'TRANSITION';
  decision: 'NO TRADE' | 'WAIT' | 'LOW CONFIDENCE SETUP' | 'VALID TRADE';
  score: number;
  message: string;
  checklist: {
    liquiditySweep: boolean;
    bosConfirmed: boolean;
    volumeExpansion: boolean;
    zoneAlignment: boolean;
    momentumFlow: boolean;
  };
}

export function evaluateInstitutionalProtocol(entry: ScreenerEntry): InstitutionalDecision {
  let score = 0;
  const checklist = {
    liquiditySweep: false,
    bosConfirmed: false,
    volumeExpansion: false,
    zoneAlignment: false,
    momentumFlow: false,
  };

  // STEP 1: Market State Classification
  const state: InstitutionalDecision['state'] = entry.regime?.regime === 'trending' ? 'TRENDING' : entry.regime?.regime === 'ranging' ? 'RANGING' : 'TRANSITION';
  if (state === 'RANGING') score -= 2;

  // STEP 2: Zone Detection
  const zoneAligned = (entry.bbPosition && (entry.bbPosition <= 0.1 || entry.bbPosition >= 0.9)) || 
                      (entry.vwapDiff && Math.abs(entry.vwapDiff) > 1);
  if (zoneAligned) { 
    score += 1; 
    checklist.zoneAlignment = true; 
  }

  // STEP 3: Liquidity Analysis (MANDATORY)
  const sweep = (entry as any).structure?.sweep || (entry.smc as any)?.sweep || entry.liquidity?.sweep || 'none';
  if (sweep !== 'none') {
    score += 2;
    checklist.liquiditySweep = true;
  }

  // STEP 4: Momentum & Flow Validation
  if (entry.volumeSpike) {
    score += 2;
    checklist.volumeExpansion = true;
  } else {
    score -= 2; // No volume
  }

  const isMomentumWeak = Math.abs(entry.momentum || 0) < 0.5 || entry.obvTrend === 'none';
  if (isMomentumWeak) {
    score -= 2;
  } else {
    checklist.momentumFlow = true;
  }

  // STEP 5: Confirmation (Critical)
  const bosConfirmed = (entry as any).structure?.bos || (entry.smc as any)?.bos || (entry.emaCross !== 'none' && entry.volumeSpike && !isMomentumWeak);
  if (bosConfirmed) {
    score += 2;
    checklist.bosConfirmed = true;
  }

  // STEP 6: Indicator Context (Secondary)
  let indScore = 0;
  if (entry.macdHistogram && Math.abs(entry.macdHistogram) > 0) indScore++;
  if (entry.vwapDiff && Math.abs(entry.vwapDiff) > 0) indScore++;
  if (entry.smartMoneyScore && Math.abs(entry.smartMoneyScore) > 30) indScore++;
  if (indScore >= 2) {
    score += 1;
  }

  // Strict Institutional Filters
  if (!checklist.liquiditySweep) score -= 10;
  if (isMomentumWeak) score -= 10;
  if (!checklist.volumeExpansion) score -= 10;
  if (state === 'RANGING') score -= 10;

  // STEP 8 & 9 & 10: Decision Logic & Output Format
  let decision: InstitutionalDecision['decision'] = 'NO TRADE';
  let message = 'Market invalid';

  if (score >= 6 && checklist.liquiditySweep && checklist.volumeExpansion && checklist.momentumFlow) {
    decision = 'VALID TRADE';
    message = 'VALID TRADE - All institutional conditions met';
  } else if (score >= 3) {
    decision = 'LOW CONFIDENCE SETUP';
    if (!checklist.bosConfirmed) message = 'WAIT - No confirmation';
    else message = 'LOW CONFIDENCE SETUP - Not recommended due to low score';
  } else {
    if (!checklist.liquiditySweep) message = 'WAIT - Awaiting sweep';
    else message = 'NO TRADE - Setup scored too low';
  }

  return { 
    state, 
    decision, 
    score: Math.max(0, score), 
    message, 
    checklist 
  };
}
