/**
 * 候选人画像（Candidate Profile）
 *
 * 动态维护候选人的能力模型——在面试过程中持续更新：
 * - 各维度评分趋势
 * - 强项/弱项标签
 * - 情绪变化历史
 * - 作弊标记
 */

import type { CandidateProfile } from '@/types/agent';

export function createCandidateProfile(): CandidateProfile & {
  addStrength(s: string): void;
  addWeakness(w: string): void;
  updateScore(dimension: string, score: number): void;
  recordEmotion(emotion: string): void;
  recordAnswer(q: string, a: string, coverage: number, score: number): void;
  flagCheating(): void;
  getSummary(): string;
  toJSON(): CandidateProfile;
} {
  const profile = {
    strengths: [] as string[],
    weaknesses: [] as string[],
    dimensionScores: {
      '沟通表达': 0,
      '专业知识': 0,
      '逻辑思维': 0,
      '应变能力': 0,
    } as Record<string, number>,
    emotionTrend: [] as Array<{ emotion: string; timestamp: number }>,
    cheatingFlags: 0,
    answerHistory: [] as Array<{
      question: string;
      answer: string;
      coverageRate: number;
      score: number;
      timestamp: number;
    }>,
  };

  function addStrength(s: string): void {
    if (!profile.strengths.includes(s)) {
      profile.strengths.push(s);
    }
  }

  function addWeakness(w: string): void {
    if (!profile.weaknesses.includes(w)) {
      profile.weaknesses.push(w);
    }
  }

  function updateScore(dimension: string, score: number): void {
    const clamped = Math.max(1, Math.min(10, Math.round(score)));
    if (profile.dimensionScores[dimension] !== undefined) {
      // 指数移动平均
      const prev = profile.dimensionScores[dimension];
      profile.dimensionScores[dimension] = prev === 0
        ? clamped
        : Math.round((prev * 0.6 + clamped * 0.4) * 10) / 10;
    }
  }

  function recordEmotion(emotion: string): void {
    profile.emotionTrend.push({ emotion, timestamp: Date.now() });
    // 只保留最近 20 条
    if (profile.emotionTrend.length > 20) {
      profile.emotionTrend.shift();
    }
  }

  function recordAnswer(q: string, a: string, coverage: number, score: number): void {
    profile.answerHistory.push({
      question: q,
      answer: a.slice(0, 200),
      coverageRate: coverage,
      score,
      timestamp: Date.now(),
    });
  }

  function flagCheating(): void {
    profile.cheatingFlags++;
  }

  /**
   * 生成候选人画像文本摘要（注入 Agent System Prompt）
   */
  function getSummary(): string {
    const parts: string[] = [];
    if (profile.strengths.length > 0) {
      parts.push(`强项：${profile.strengths.join('、')}`);
    }
    if (profile.weaknesses.length > 0) {
      parts.push(`待提升：${profile.weaknesses.join('、')}`);
    }
    const scores = Object.entries(profile.dimensionScores)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k} ${v}/10`)
      .join('，');
    if (scores) parts.push(`当前评分：${scores}`);

    const emotions = profile.emotionTrend.slice(-3).map((e) => e.emotion);
    if (emotions.length > 0) parts.push(`近期情绪：${emotions.join(' → ')}`);

    if (profile.cheatingFlags > 0) parts.push(`⚠ 作弊标记 ${profile.cheatingFlags} 次`);

    return parts.join('\n');
  }

  function toJSON(): CandidateProfile {
    return {
      strengths: [...profile.strengths],
      weaknesses: [...profile.weaknesses],
      dimensionScores: { ...profile.dimensionScores },
      emotionTrend: [...profile.emotionTrend],
      cheatingFlags: profile.cheatingFlags,
      answerHistory: [...profile.answerHistory],
    };
  }

  return {
    ...profile,
    addStrength,
    addWeakness,
    updateScore,
    recordEmotion,
    recordAnswer,
    flagCheating,
    getSummary,
    toJSON,
  };
}
