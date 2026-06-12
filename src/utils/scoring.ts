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
  沟通表达: 0.25,
  专业知识: 0.3,
  逻辑思维: 0.25,
  应变能力: 0.2,
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

/** 评分 Prompt 模板 */
const SCORING_PROMPT = `你是一位资深面试评估专家。请根据以下面试对话，对候选人进行多维度评分。

## 对话记录
{conversation}

## 评分维度（每项 1-10 分）
1. 沟通表达：表达清晰度、逻辑组织、语言流畅度
2. 专业知识：技术/业务知识深度、行业理解
3. 逻辑思维：分析问题的结构化程度、推理严谨性
4. 应变能力：面对追问的反应、新场景的适应

## 输出格式（严格 JSON）
{
  "dimensions": [
    {"name": "沟通表达", "score": 7, "comment": "表达清晰但偶有犹豫"},
    {"name": "专业知识", "score": 8, "comment": "基础扎实，对前沿了解稍弱"},
    {"name": "逻辑思维", "score": 6, "comment": "能分析问题但框架不够系统"},
    {"name": "应变能力", "score": 7, "comment": "追问时表现稳定"}
  ],
  "summary": "整体表现良好，建议在逻辑思维和系统化分析方面加强训练。"
}`;

/**
 * 构建 LLM 评分请求（需要外部 LLM 客户端调用）
 *
 * @param conversationSummary - 对话摘要文本
 * @returns 评分 Prompt 文本，可直接发送给 LLM
 */
export function buildScoringPrompt(conversationSummary: string): string {
  return SCORING_PROMPT.replace('{conversation}', conversationSummary);
}

/**
 * 解析 LLM 返回的评分 JSON
 */
export function parseScoresFromJSON(jsonText: string): InterviewScores | null {
  try {
    // 提取 JSON（处理 markdown 代码块包裹的情况）
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const data = JSON.parse(jsonMatch[0]);
    const dimensions: ScoreDimension[] =
      data.dimensions?.map((d: Record<string, unknown>) => ({
        name: String(d.name ?? ''),
        score: Math.max(1, Math.min(10, Number(d.score) || 5)),
        comment: String(d.comment ?? ''),
      })) ?? [];

    if (dimensions.length === 0) return null;

    return {
      dimensions,
      totalScore: calculateTotalScore(dimensions),
      summary: String(data.summary ?? ''),
    };
  } catch {
    return null;
  }
}

/**
 * 降级评分方案（当 LLM 调用失败时使用规则引擎）
 */
export function generateFallbackScores(
  answerLengths: number[],
  coverageRates: number[],
): InterviewScores {
  const avgLength =
    answerLengths.reduce((a, b) => a + b, 0) /
    Math.max(1, answerLengths.length);
  const avgCoverage =
    coverageRates.reduce((a, b) => a + b, 0) /
    Math.max(1, coverageRates.length);

  const commScore = Math.min(
    10,
    Math.round(avgLength > 50 ? 7 : avgLength > 20 ? 5 : 3),
  );
  const knowledgeScore = Math.min(10, Math.round(avgCoverage * 10));
  const logicScore = Math.min(10, Math.round(avgCoverage * 8 + 2));
  const adaptScore = Math.min(10, Math.round((commScore + knowledgeScore) / 2));

  return {
    dimensions: [
      { name: '沟通表达', score: commScore, comment: '基于回答长度评估' },
      {
        name: '专业知识',
        score: knowledgeScore,
        comment: '基于要点覆盖率评估',
      },
      {
        name: '逻辑思维',
        score: logicScore,
        comment: '基于回答结构化程度评估',
      },
      { name: '应变能力', score: adaptScore, comment: '基于追问表现评估' },
    ],
    totalScore: calculateTotalScore([
      { name: '沟通表达', score: commScore, comment: '' },
      { name: '专业知识', score: knowledgeScore, comment: '' },
      { name: '逻辑思维', score: logicScore, comment: '' },
      { name: '应变能力', score: adaptScore, comment: '' },
    ]),
    summary: '此为离线评分（LLM 不可用时的降级方案），仅供参考。',
  };
}
