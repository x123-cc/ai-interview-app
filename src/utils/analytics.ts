/** 趋势方向 */
export type TrendDirection = 'rising' | 'stable' | 'falling';

/** 趋势分析结果 */
export interface TrendResult {
  direction: TrendDirection;
  changeRate: number;
  label: string;
}

/**
 * 计算分数趋势
 */
export function calculateTrend(scores: number[]): TrendResult {
  if (scores.length < 2) return { direction: 'stable', changeRate: 0, label: '数据不足' };

  const first = scores[0];
  const last = scores[scores.length - 1];
  const changeRate = first > 0 ? ((last - first) / first) * 100 : 0;

  if (changeRate > 5) return { direction: 'rising', changeRate, label: `上升 ${Math.round(changeRate)}%` };
  if (changeRate < -5) return { direction: 'falling', changeRate, label: `下降 ${Math.round(Math.abs(changeRate))}%` };
  return { direction: 'stable', changeRate, label: '保持稳定' };
}

/** 维度统计 */
interface DimStats { name: string; avg: number }

/**
 * 找出平均分最低的维度（薄弱环节）
 */
export function findWeakestDimension(dimensionRecords: Record<string, number[]>): DimStats | null {
  let weakest: DimStats | null = null;
  for (const [name, scores] of Object.entries(dimensionRecords)) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (!weakest || avg < weakest.avg) weakest = { name, avg };
  }
  return weakest;
}

/**
 * 找出平均分最高的维度（优势领域）
 */
export function findStrongestDimension(dimensionRecords: Record<string, number[]>): DimStats | null {
  let strongest: DimStats | null = null;
  for (const [name, scores] of Object.entries(dimensionRecords)) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (!strongest || avg > strongest.avg) strongest = { name, avg };
  }
  return strongest;
}

/**
 * 基于薄弱维度生成改进建议
 */
export function generateSuggestions(
  weakest: DimStats | null,
  averageScore: number,
): string[] {
  const suggestions: string[] = [];
  if (weakest && weakest.avg < 6) {
    suggestions.push(`「${weakest.name}」得分偏低（均分 ${weakest.avg.toFixed(1)}/10），建议重点提升`);
  }
  if (averageScore < 5) {
    suggestions.push('整体得分偏低，建议增加练习频率，每次面试后复盘薄弱环节');
  } else if (averageScore < 7) {
    suggestions.push('表现良好，建议针对薄弱维度进行专项练习');
  }
  return suggestions;
}
