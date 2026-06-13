/**
 * 情景记忆（Episodic Memory）
 *
 * 记录面试过程中的关键事件快照：
 * - 突出表现（显著优于/弱于平均的回答）
 * - 作弊告警
 * - 情绪转折
 * - 面试里程碑（开始/结束/超时）
 *
 * 这些记录用于：
 * 1. Agent 决策时参考历史事件
 * 2. 最终报告生成时引用具体事例
 */

import type { EpisodicSnapshot } from '@/types/agent';

export function createEpisodicMemory(): {
  snapshots: EpisodicSnapshot[];
  record(
    type: EpisodicSnapshot['type'],
    description: string,
    data: Record<string, unknown>,
  ): void;
  getByType(type: EpisodicSnapshot['type']): EpisodicSnapshot[];
  getRecentEvents(n: number): EpisodicSnapshot[];
  getSummaryForReport(): string;
  reset(): void;
} {
  const snapshots: EpisodicSnapshot[] = [];

  function record(
    type: EpisodicSnapshot['type'],
    description: string,
    data: Record<string, unknown>,
  ): void {
    snapshots.push({
      type,
      description,
      data,
      timestamp: Date.now(),
    });
    // 最多保留 50 条
    if (snapshots.length > 50) {
      snapshots.shift();
    }
  }

  function getByType(type: EpisodicSnapshot['type']): EpisodicSnapshot[] {
    return snapshots.filter((s) => s.type === type);
  }

  function getRecentEvents(n: number): EpisodicSnapshot[] {
    return snapshots.slice(-n);
  }

  /**
   * 生成报告用的事件摘要
   */
  function getSummaryForReport(): string {
    if (snapshots.length === 0) return '';

    const lines: string[] = ['## 面试关键时刻'];

    const significant = getByType('significant_answer');
    if (significant.length > 0) {
      lines.push('### 突出表现');
      significant.forEach((s) => {
        lines.push(`- ${s.description}`);
      });
    }

    const cheating = getByType('cheating_alert');
    if (cheating.length > 0) {
      lines.push('### 异常行为');
      cheating.forEach((s) => {
        lines.push(`- ⚠ ${s.description}`);
      });
    }

    const emotional = getByType('emotional_shift');
    if (emotional.length > 0) {
      lines.push('### 情绪变化');
      emotional.forEach((s) => {
        lines.push(`- ${s.description}`);
      });
    }

    return lines.join('\n');
  }

  function reset(): void {
    snapshots.length = 0;
  }

  return { snapshots, record, getByType, getRecentEvents, getSummaryForReport, reset };
}
