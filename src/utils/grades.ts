// ... existing imports
import { ComponentConfig, Student, SubComponent, TransmutationFormula } from '../types';

// Helper to apply incentive points
const applyIncentive = (
  scores: Record<string, number>,
  incentive: number,
  targetComponents: SubComponent[],
  source: 'ww' | 'pt',
  sources: Record<string, 'ww' | 'pt' | 'mixed'>
): number => {
  let remaining = incentive;
  
  for (const sub of targetComponents) {
    if (remaining <= 0) break;
    
    const currentScore = scores[sub.id] || 0;
    const maxScore = sub.totalScore;
    
    if (currentScore < maxScore) {
      const space = maxScore - currentScore;
      const toAdd = Math.min(space, remaining);
      
      scores[sub.id] = currentScore + toAdd;
      remaining -= toAdd;

      // Track source
      if (sources[sub.id] && sources[sub.id] !== source) {
        sources[sub.id] = 'mixed';
      } else if (!sources[sub.id]) {
        sources[sub.id] = source;
      }
    }
  }
  
  return remaining;
};

export const round4 = (num: number): number => {
  return Number(Math.round(Number(num + 'e4')) + 'e-4');
};

export const calculateAdjustedScores = (
  student: Student,
  components: ComponentConfig[],
  incentiveMode: 'both' | 'ww_only' = 'both'
): {
  scores: Record<string, number>;
  sources: Record<string, 'ww' | 'pt' | 'mixed'>;
  extraPoints: number;
} => {
  // Deep copy scores to avoid mutating original
  const adjustedScores = { ...student.scores };
  const sources: Record<string, 'ww' | 'pt' | 'mixed'> = {};
  
  // Get all subcomponents by type
  const wwComponents = components.find(c => c.id === 'written-work')?.subComponents || [];
  const ptComponents = components.find(c => c.id === 'performance-task')?.subComponents || [];
  const etComponents = components.find(c => c.id === 'end-term')?.subComponents || [];
  
  // Apply WW Incentive: WW -> ETA -> PT
  // Overflow is discarded
  let wwIncentive = student.wwIncentive || 0;
  if (wwIncentive > 0) {
    wwIncentive = applyIncentive(adjustedScores, wwIncentive, wwComponents, 'ww', sources);
    if (wwIncentive > 0) {
      wwIncentive = applyIncentive(adjustedScores, wwIncentive, etComponents, 'ww', sources);
      if (wwIncentive > 0) {
        applyIncentive(adjustedScores, wwIncentive, ptComponents, 'ww', sources);
      }
    }
  }
  
  // Apply PT Incentive: PT -> ETA -> WW
  // Overflow becomes extraPoints
  let ptIncentive = incentiveMode === 'both' ? (student.ptIncentive || 0) : 0;
  let extraPoints = 0;
  if (ptIncentive > 0) {
    ptIncentive = applyIncentive(adjustedScores, ptIncentive, ptComponents, 'pt', sources);
    if (ptIncentive > 0) {
      ptIncentive = applyIncentive(adjustedScores, ptIncentive, etComponents, 'pt', sources);
      if (ptIncentive > 0) {
        ptIncentive = applyIncentive(adjustedScores, ptIncentive, wwComponents, 'pt', sources);
      }
    }
    extraPoints = ptIncentive;
  }
  
  return { scores: adjustedScores, sources, extraPoints };
};

export const calculateComponentStats = (
  component: ComponentConfig,
  student: Student,
  formula: TransmutationFormula = 'default'
) => {
  let totalScore = 0;
  let maxScore = 0;

  component.subComponents.forEach((sub) => {
    maxScore += sub.totalScore;
    totalScore += student.scores[sub.id] || 0;
  });

  // Raw percentage (0-100), full precision
  const rawPercentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
  
  // Transmute the percentage using the provided formula, rounded to 4 decimal places
  const transmutedPercentage = round4(transmuteGrade(rawPercentage, formula));
  
  // Weighted score based on the transmuted percentage, rounded to 4 decimal places
  const rawWeighted = (transmutedPercentage * component.weight) / 100;
  const weightedScore = round4(rawWeighted);
  
  // For reference, also calculate the raw weighted score
  const rawWeightedScore = round4((rawPercentage * component.weight) / 100);

  return {
    totalScore,
    maxScore,
    percentage: rawPercentage,
    transmutedPercentage,
    weightedScore,
    rawWeightedScore,
  };
};

export const calculateInitialGrade = (
  components: ComponentConfig[],
  student: Student,
  formula: TransmutationFormula = 'default'
) => {
  let rawInitialGrade = 0;
  components.forEach((comp) => {
    const stats = calculateComponentStats(comp, student, formula);
    rawInitialGrade += stats.rawWeightedScore;
  });
  return Math.min(100, round4(rawInitialGrade));
};

export const calculateFinalGrade = (
  components: ComponentConfig[],
  student: Student,
  formula: TransmutationFormula = 'default'
) => {
  let finalGrade = 0;
  components.forEach((comp) => {
    const stats = calculateComponentStats(comp, student, formula);
    finalGrade += stats.weightedScore;
  });
  return Math.min(100, round4(finalGrade));
};

export const transmuteGrade = (initialGrade: number, formula: TransmutationFormula = 'default') => {
  const total = initialGrade;
  const percentage = total / 100;
  
  switch (formula) {
    case 'base-50':
      return 50 + (50 * percentage);
    case 'base-60':
      return 60 + (40 * percentage);
    case 'base-0':
      return total;
    case 'deped':
      // DepEd standard transmutation table approximation or exact table if needed.
      // For simplicity, using the standard DepEd table logic:
      if (total >= 100) return 100;
      if (total >= 98.40) return 99;
      if (total >= 96.80) return 98;
      if (total >= 95.20) return 97;
      if (total >= 93.60) return 96;
      if (total >= 92.00) return 95;
      if (total >= 90.40) return 94;
      if (total >= 88.80) return 93;
      if (total >= 87.20) return 92;
      if (total >= 85.60) return 91;
      if (total >= 84.00) return 90;
      if (total >= 82.40) return 89;
      if (total >= 80.80) return 88;
      if (total >= 79.20) return 87;
      if (total >= 77.60) return 86;
      if (total >= 76.00) return 85;
      if (total >= 74.40) return 84;
      if (total >= 72.80) return 83;
      if (total >= 71.20) return 82;
      if (total >= 69.60) return 81;
      if (total >= 68.00) return 80;
      if (total >= 66.40) return 79;
      if (total >= 64.80) return 78;
      if (total >= 63.20) return 77;
      if (total >= 61.60) return 76;
      if (total >= 60.00) return 75;
      if (total >= 56.00) return 74;
      if (total >= 52.00) return 73;
      if (total >= 48.00) return 72;
      if (total >= 44.00) return 71;
      if (total >= 40.00) return 70;
      if (total >= 36.00) return 69;
      if (total >= 32.00) return 68;
      if (total >= 28.00) return 67;
      if (total >= 24.00) return 66;
      if (total >= 20.00) return 65;
      if (total >= 16.00) return 64;
      if (total >= 12.00) return 63;
      if (total >= 8.00) return 62;
      if (total >= 4.00) return 61;
      return 60;
    case 'default':
    default:
      // Formula provided: =IF(TOTAL/100>=0.6, 37.5+(25/(100*2/5)*TOTAL), 65+(10/(100*3/5)*TOTAL))
      if (percentage >= 0.6) {
        return 37.5 + (25 / (100 * 2 / 5) * total);
      } else {
        return 65 + (10 / (100 * 3 / 5) * total);
      }
  }
};

export const formatAssessmentName = (name: string) => {
  // Replace WWX with Written Work X and PTX with Performance Task X
  // Using a more flexible regex to catch WW1, WW 1, etc.
  return name
    .replace(/\bWW\s*(\d+)\b/gi, 'Written Work $1')
    .replace(/\bPT\s*(\d+)\b/gi, 'Performance Task $1');
};
