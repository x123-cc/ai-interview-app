/** 回答质量评估结果 */
export interface AnswerQuality {
  /** 是否过于简短（< 20 字） */
  isShort: boolean;
  /** 期望要点覆盖率（0-1） */
  coverageRate: number;
  /** 是否需要追问 */
  needsFollowUp: boolean;
  /** 匹配到的要点 */
  matchedPoints: string[];
  /** 未匹配的要点 */
  missedPoints: string[];
}

/**
 * 评估用户回答质量（基于关键词匹配）
 *
 * 初期采用规则引擎方式，后续可升级为 LLM 评估。
 *
 * @param answer - 用户回答文本
 * @param expectedPoints - 期望回答要点列表
 * @returns 质量评估结果
 */
export function evaluateAnswerQuality(
  answer: string,
  expectedPoints: string[],
): AnswerQuality {
  const trimmed = answer.trim();
  const isShort = trimmed.length < 20;

  const matchedPoints: string[] = [];
  const missedPoints: string[] = [];

  for (const point of expectedPoints) {
    // 提取关键词（2 字及以上）
    const keywords = point
      .replace(/[（(].*?[)）]/g, '')
      .split(/[，,、\s]+/)
      .filter((k) => k.length >= 2);

    const matched = keywords.some((kw) => trimmed.includes(kw));
    if (matched) {
      matchedPoints.push(point);
    } else {
      missedPoints.push(point);
    }
  }

  const coverageRate =
    expectedPoints.length > 0
      ? matchedPoints.length / expectedPoints.length
      : 1;

  // coverage < 0.5 或过于简短时触发追问
  const needsFollowUp = coverageRate < 0.5 || isShort;

  return { isShort, coverageRate, needsFollowUp, matchedPoints, missedPoints };
}

/** 评分维度 */
export interface ScoreDimension {
  name: string;
  score: number; // 1-10
  comment: string;
}

/** 面试评分结果 */
export interface InterviewScores {
  dimensions: ScoreDimension[];
  totalScore: number;
  summary: string;
}

/** 维度权重 */
const DIMENSION_WEIGHTS: Record<string, number> = {
  '沟通表达': 0.25,
  '专业知识': 0.30,
  '逻辑思维': 0.25,
  '应变能力': 0.20,
};

/**
 * 计算加权总分
 */
export function calculateTotalScore(dimensions: ScoreDimension[]): number {
  const total = dimensions.reduce((sum, d) => {
    const weight = DIMENSION_WEIGHTS[d.name] ?? 0.25;
    return sum + d.score * weight;
  }, 0);
  return Math.round(total * 10) / 10;
}
