import type { LaunchHealthScore } from '@forge/shared';

/**
 * Launch Health Score generation.
 *
 * For simulated tokens we generate a plausible score. For real tokens the
 * indexer estimates the inputs from onchain holder data and calls
 * scoreFromInputs. Both paths produce the same shape so the UI is identical.
 */

/** Bucket a numeric score into its label. */
export function labelForScore(score: number): LaunchHealthScore['label'] {
  if (score >= 70) return 'Healthy';
  if (score >= 40) return 'Moderate';
  return 'Risky';
}

/**
 * Build a health score from raw inputs. The score penalizes sniper activity,
 * bot presence, and top holder concentration. Weights are chosen so a launch
 * with no snipers, no bots, and even distribution lands near 100.
 */
export function scoreFromInputs(input: {
  sniperCount: number;
  botCount: number;
  topHolderConcentration: number;
}): LaunchHealthScore {
  const sniperPenalty = Math.min(40, input.sniperCount * 4);
  const botPenalty = Math.min(30, input.botCount * 3);
  const concentrationPenalty = Math.min(30, Math.max(0, input.topHolderConcentration - 20) * 0.6);

  const score = Math.round(Math.max(0, 100 - sniperPenalty - botPenalty - concentrationPenalty));

  return {
    score,
    sniperCount: input.sniperCount,
    botCount: input.botCount,
    topHolderConcentration: Math.round(input.topHolderConcentration * 10) / 10,
    label: labelForScore(score),
  };
}

/** Generate a plausible health score for a simulated token. */
export function generateHealthScore(): LaunchHealthScore {
  const sniperCount = Math.floor(Math.random() * 8);
  const botCount = Math.floor(Math.random() * 6);
  const topHolderConcentration = 15 + Math.random() * 45;
  return scoreFromInputs({ sniperCount, botCount, topHolderConcentration });
}
