/**
 * 工作记忆（Working Memory）
 *
 * 管理当前面试的即时上下文，包括对话历史、工具调用记录和系统事件。
 * 支持上下文窗口管理——自动保留最近 N 条记录，防止 token 溢出。
 */

import type { WorkingMemoryEntry, AgentConfig } from '@/types/agent';
import type { LLMTextMessage } from '@/types';

export interface WorkingMemory {
  entries: WorkingMemoryEntry[];
  add(role: WorkingMemoryEntry['role'], content: string, metadata?: Record<string, unknown>): void;
  getRecent(n: number): WorkingMemoryEntry[];
  buildMessages(): LLMTextMessage[];
  getLastUserMessage(): string;
  hasUserInputSinceLastAgentResponse(): boolean;
  reset(): void;
}

export function createWorkingMemory(config: AgentConfig): WorkingMemory {
  const entries: WorkingMemoryEntry[] = [];

  function add(
    role: WorkingMemoryEntry['role'],
    content: string,
    metadata?: Record<string, unknown>,
  ): void {
    entries.push({
      role,
      content,
      metadata,
      timestamp: Date.now(),
    });
  }

  function getRecent(n: number): WorkingMemoryEntry[] {
    return entries.slice(-n);
  }

  /**
   * 构建发送给 LLM 的消息列表
   *
   * 过滤规则：
   * 1. 只保留 tool / agent / user / system 角色
   * 2. 角色映射为 OpenAI 兼容格式
   */
  function buildMessages(): LLMTextMessage[] {
    return entries
      .filter((e) => e.role !== 'tool')
      .map((e) => {
        const role =
          e.role === 'agent' ? 'assistant' :
          e.role === 'user' ? 'user' :
          'system';
        return {
          role: role as 'system' | 'user' | 'assistant',
          content: e.content,
        };
      });
  }

  function getLastUserMessage(): string {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].role === 'user') return entries[i].content;
    }
    return '';
  }

  function hasUserInputSinceLastAgentResponse(): boolean {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].role === 'agent') return false;
      if (entries[i].role === 'user') return true;
    }
    return true;
  }

  function reset(): void {
    entries.length = 0;
  }

  return { entries, add, getRecent, buildMessages, getLastUserMessage, hasUserInputSinceLastAgentResponse, reset };
}
