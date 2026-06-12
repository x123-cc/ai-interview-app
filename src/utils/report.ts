import type { InterviewScores, ScoreDimension } from './scoring';
import type { CostEntry } from './cost';

/** 面试报告 */
export interface InterviewReport {
  /** 报告标题 */
  title: string;
  /** 面试日期 */
  date: string;
  /** 面试类型 */
  interviewType: string;
  /** 总时长（秒） */
  duration: number;
  /** 评分结果 */
  scores: InterviewScores;
  /** 逐题回顾 */
  questionReviews: {
    question: string;
    answer: string;
    coverage: number;
  }[];
  /** 成本统计 */
  totalCost: number;
  /** 最强维度 */
  strongestDimension: string;
  /** 最弱维度 */
  weakestDimension: string;
  /** 改进建议 */
  suggestions: string[];
}

/**
 * 构建面试报告
 *
 * @param params - 报告所需数据
 * @returns 结构化的面试报告
 */
export function buildInterviewReport(params: {
  interviewType: string;
  duration: number;
  scores: InterviewScores;
  questionReviews: { question: string; answer: string; coverage: number }[];
  costEntries: CostEntry[];
}): InterviewReport {
  const { interviewType, duration, scores, questionReviews, costEntries } =
    params;

  // 找最强和最弱维度
  const sorted = [...scores.dimensions].sort((a, b) => b.score - a.score);
  const strongest = sorted[0]?.name ?? '—';
  const weakest = sorted[sorted.length - 1]?.name ?? '—';

  // 生成改进建议
  const suggestions: string[] = [];
  const weakestDim = scores.dimensions.find((d) => d.name === weakest);
  if (weakestDim && weakestDim.score < 6) {
    suggestions.push(
      `"${weakest}"得分偏低（${weakestDim.score}/10），建议重点提升`,
    );
  }
  if (questionReviews.some((r) => r.coverage < 0.4)) {
    suggestions.push('部分问题回答不够充分，建议使用 STAR 法则组织回答');
  }
  if (duration < 120) {
    suggestions.push('面试时长偏短，建议每个问题至少准备 2 分钟的回答时间');
  }

  // 计算总费用
  const totalCost =
    Math.round(
      costEntries.reduce((sum, e) => sum + e.estimatedCost, 0) * 10000,
    ) / 10000;

  return {
    title: `${interviewType}面试报告`,
    date: new Date().toISOString().split('T')[0],
    interviewType,
    duration,
    scores,
    questionReviews,
    totalCost,
    strongestDimension: strongest,
    weakestDimension: weakest,
    suggestions,
  };
}
