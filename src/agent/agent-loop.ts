/**
 * Agent 主循环（Agent Loop）
 *
 * 实现 Plan → Act → Observe → Reflect 的 Agent 决策循环。
 * 每次用户输入触发一次循环，最多执行 maxIterations 次内部迭代。
 *
 * 循环流程：
 * 1. Observe: 接收用户输入，更新工作记忆和视觉分析
 * 2. Plan-Act Loop:
 *    a. 调用 LLM（带 tools 定义），LLM 返回 tool_calls 或文本
 *    b. 如果有 tool_calls → 依次执行工具 → 将结果反馈给 LLM → 回到 a
 *    c. 如果返回文本 → 这是给用户的回复 → 退出循环
 * 3. Reflect: 检查是否有未完成的任务，决定面试是否继续
 */

import type {
  AgentConfig,
  AgentContext,
  AgentResponse,
  AgentObservation,
  InterviewReport,
  LLMMessageWithTools,
} from '@/types/agent';
import type { LLMTextMessage, ChatMessage } from '@/types';
import { createToolRegistry } from '@/agent/tools';
import { createWorkingMemory } from '@/agent/memory/working-memory';
import { createCandidateProfile } from '@/agent/memory/candidate-profile';
import { createEpisodicMemory } from '@/agent/memory/episodic-memory';
import type { AgentLLMClient } from '@/types/agent';
import { ToolRegistry } from './tool-registry';

// ── System Prompt Builder ──

function buildAgentSystemPrompt(context: AgentContext): string {
  const { config, candidateProfile } = context;

  const basePrompt = `你是一位专业、友善的 AI 面试官 Agent。你可以通过调用工具来执行面试流程。

## 你的能力
你拥有一组工具（tools），可以自主决定何时调用它们：
- **evaluate_answer**：评估候选人的回答质量
- **generate_followup**：针对薄弱点生成追问
- **control_flow**：决定面试流程（继续/追问/跳过/结束）
- **ask_question**：向候选人提问（调用后问题会显示并播报）
- **analyze_vision**：分析摄像头画面（作弊检测/情绪感知）
- **update_profile**：更新候选人动态画像
- **generate_report**：生成最终面试报告

## 你的工作流程
每次收到候选人回答后，你应该：
1. 调用 evaluate_answer 评估回答质量
2. 根据评估结果，调用 control_flow 决定下一步
3. 如果决定追问 → 调用 generate_followup 生成追问 → 调用 ask_question
4. 如果决定进入下一题 → 直接调用 ask_question 提出新问题
5. 如果决定结束 → 调用 generate_report → 调用 ask_question(type="closing") 说结束语

## 面试上下文
- 模式：${config.mode === 'review' ? '复盘面试（按预设问题）' : '模拟面试（动态出题）'}
- 总时长限制：${config.maxDuration > 0 ? `${Math.floor(config.maxDuration / 60)} 分钟` : '不限时'}
- 追问深度：${['不追问', '浅层追问', '深层追问'][config.followUpDepth]}
${config.questions && config.questions.length > 0 ? `- 预设问题（review 模式）：\n${config.questions.map((q, i) => `  ${i + 1}. ${q}`).join('\n')}` : ''}

## 候选人简历
${config.resume.slice(0, 3000) || '未提供'}

${config.jd ? `## 目标岗位 JD\n${config.jd.slice(0, 3000)}` : ''}
${config.context ? `## 复盘上下文\n${config.context.slice(0, 2000)}` : ''}

## 当前候选人画像（动态更新）
${candidateProfile.getSummary() || '面试刚开始，尚无足够数据'}

## 对话规则
1. 每次只问一个问题或追问一个点
2. 回复简洁专业，每次 60-100 字
3. 根据评估结果灵活决定追问还是推进
4. 不要暴露你的分析过程（如"评分为7分"），而是自然地提问
5. 中文面试
6. 回答中不要使用 markdown 或 JSON 格式

## 视觉监控
${config.visionEnabled ? '如果提供了摄像头画面，请定期调用 analyze_vision 检测作弊行为和情绪状态。发现异常时自然提醒，不要直接说"我发现你在作弊"。' : '视觉监控未启用。'}`;

  return basePrompt;
}

// ── Agent Loop Class ──

export class AgentLoop {
  private config: AgentConfig;
  private llmClient: AgentLLMClient;
  private registry: ToolRegistry;
  private context: AgentContext;
  private isRunning = false;
  private questionCount = 0;
  private transcript: ChatMessage[] = [];

  constructor(llmClient: AgentLLMClient, config: AgentConfig) {
    this.config = config;
    this.llmClient = llmClient;
    this.registry = createToolRegistry();

    // 构建 Agent 上下文
    const workingMemory = createWorkingMemory(config);
    const candidateProfile = createCandidateProfile();
    const episodicMemory = createEpisodicMemory();

    this.context = {
      llmClient,
      workingMemory,
      candidateProfile,
      episodicMemory,
      config,
    };
  }

  /** 获取当前对话记录 */
  getTranscript(): ChatMessage[] {
    return [...this.transcript];
  }

  /** 获取候选人画像 */
  getCandidateProfile() {
    return this.context.candidateProfile;
  }

  /**
   * 开始面试 — 返回开场白
   */
  async startInterview(): Promise<string> {
    const { config, context } = this;

    // 记录面试开始
    context.episodicMemory.record('interview_milestone', '面试开始', {
      mode: config.mode,
      hasResume: !!config.resume,
      hasJD: !!config.jd,
    });

    // 构建开场 Prompt
    const openingPrompt = `面试即将开始。请生成开场白。

你是面试官，模式为：${config.mode === 'review' ? '复盘面试' : '模拟面试'}。
候选人简历：${config.resume.slice(0, 1000) || '未提供'}
${config.jd ? `目标岗位：${config.jd.slice(0, 500)}` : ''}
${config.questions ? `预设问题：${config.questions.slice(0, 3).join('、')}${config.questions.length > 3 ? '...' : ''}` : ''}

开场白要求：
- 简短友好（40-60字）
- 让候选人放松
- 引导候选人做自我介绍
- 纯文本，不要 markdown`;

    try {
      const result = await this.llmClient.chat([
        { role: 'user', content: openingPrompt },
      ]);

      const welcome = result.content.trim() || `你好！欢迎参加${config.mode === 'review' ? '复盘' : '模拟'}面试，准备好后请开始做自我介绍。`;

      context.workingMemory.add('agent', welcome, { type: 'greeting' });
      this.transcript.push({ role: 'interviewer', text: welcome, timestamp: Date.now() });

      return welcome;
    } catch {
      const fallback = `你好！欢迎参加${config.mode === 'review' ? '复盘' : '模拟'}面试，我已阅读了你的简历，准备好后请开始做自我介绍吧。`;
      context.workingMemory.add('agent', fallback, { type: 'greeting' });
      this.transcript.push({ role: 'interviewer', text: fallback, timestamp: Date.now() });
      return fallback;
    }
  }

  /**
   * 从已有历史恢复面试
   */
  resumeFrom(transcript: ChatMessage[]): string {
    this.transcript = [...transcript];
    for (const msg of transcript) {
      const role = msg.role === 'interviewer' ? 'agent' :
                   msg.role === 'user' ? 'user' : 'system';
      this.context.workingMemory.add(role, msg.text);
    }

    const questionCount = transcript.filter(
      (m) => m.role === 'interviewer' && (m.text.includes('?') || m.text.includes('？')),
    ).length;
    this.questionCount = Math.max(1, questionCount);

    const resumeMsg = `面试继续。我们进行到第 ${this.questionCount} 个问题附近。请根据对话历史，先做简短回顾，然后继续面试。`;
    this.transcript.push({ role: 'interviewer', text: resumeMsg, timestamp: Date.now() });
    return resumeMsg;
  }

  /**
   * 处理用户输入 — Agent 核心循环
   *
   * @param userText - 用户文本输入
   * @param imageBase64 - 可选的摄像头画面 base64
   * @returns Agent 响应
   */
  async processUserInput(
    userText: string,
    imageBase64?: string,
  ): Promise<AgentResponse> {
    const { context, config } = this;
    const steps: AgentResponse['steps'] = [];

    // ── Step 0: Observe — 记录用户输入 ──
    context.workingMemory.add('user', userText);
    this.transcript.push({ role: 'user', text: userText, timestamp: Date.now() });

    // 视觉分析（如果有画面且启用）
    if (imageBase64 && config.visionEnabled) {
      const visionResult = await this.registry.execute(
        'analyze_vision',
        { image_base64: imageBase64 },
        context,
      );
      if (visionResult.success && visionResult.data) {
        steps.push({
          toolName: 'analyze_vision',
          reasoning: '分析摄像头画面，检测候选人状态',
          result: visionResult,
        });

        const vd = visionResult.data as Record<string, unknown>;
        if (vd.suspiciousBehavior) {
          this.transcript.push({
            role: 'system',
            text: `⚠ ${vd.suspicionDetail || '异常行为检测'}`,
            timestamp: Date.now(),
            systemType: 'alert',
          });
        }
      }
    }

    // ── 构建 System Prompt + 工具定义 ──
    const systemPrompt = buildAgentSystemPrompt(context);
    const tools = this.registry.toFunctionDefs();

    // ── 维护 LLM 原生对话数组（正确处理 tool_calls 协议） ──
    const conversation: LLMMessageWithTools[] = [
      { role: 'system', content: systemPrompt },
    ];

    // 加入最近的对话历史（仅 user 和 agent 角色）
    const recent = context.workingMemory.getRecent(20);
    for (const entry of recent) {
      if (entry.role === 'user') {
        conversation.push({ role: 'user', content: entry.content });
      } else if (entry.role === 'agent') {
        conversation.push({ role: 'assistant', content: entry.content });
      }
    }

    // ── 当服务商不支持工具调用时：使用直接对话模式 ──
    if (!config.supportsTools) {
      const directPrompt = `${systemPrompt}

## 重要：当前 LLM 不支持工具调用，请直接以面试官身份回复候选人。
不要输出 JSON 或元数据，直接输出你要对候选人说的话。
根据对话历史和候选人画像，决定是追问、进入下一题还是结束面试。
如果面试结束，在回复末尾加上 "[面试结束]"。

回复要求：60-120字，中文，自然流畅。`;

      try {
        const directMessages: LLMMessageWithTools[] = [
          { role: 'system', content: directPrompt },
          ...conversation.filter(m => m.role === 'user' || m.role === 'assistant'),
        ];

        const result = await this.llmClient.chat(
          directMessages.map(m => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content || '' })),
        );

        let finalText = result.content.trim();
        let isComplete = finalText.includes('[面试结束]');
        finalText = finalText.replace('[面试结束]', '').trim();

        context.workingMemory.add('agent', finalText);
        this.transcript.push({ role: 'interviewer', text: finalText, timestamp: Date.now() });

        if (isComplete) {
          const convSummary = this.buildConversationSummary();
          await this.registry.execute('generate_report', { conversation_summary: convSummary }, context);
        }

        return {
          text: finalText,
          steps: [{ toolName: 'direct_chat', reasoning: '服务商不支持工具调用，使用直接对话模式', result: { success: true, data: { mode: 'fallback' } } }],
          isComplete,
        };
      } catch (err) {
        console.error('Direct chat fallback error:', err);
        const fallback = '好的，我理解了。请继续你的回答。';
        context.workingMemory.add('agent', fallback);
        this.transcript.push({ role: 'interviewer', text: fallback, timestamp: Date.now() });
        return {
          text: fallback,
          steps: [],
          isComplete: false,
        };
      }
    }

    // ── Step 1-N: Plan-Act Loop（工具调用模式） ──
    let finalText = '';
    let isComplete = false;

    for (let iter = 0; iter < config.maxIterations; iter++) {
      try {
        const result = await this.llmClient.chatWithTools(
          conversation,
          tools,
        );

        // ── 情况 A：LLM 返回工具调用 ──
        if (result.toolCalls && result.toolCalls.length > 0) {
          // 添加 assistant 消息（含 tool_calls）
          conversation.push({
            role: 'assistant',
            content: result.content || null,
            tool_calls: result.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: tc.function,
            })),
          });

          for (const tc of result.toolCalls) {
            const toolName = tc.function.name;
            const params = tc.function.arguments;

            // 执行工具
            const toolResult = await this.registry.execute(toolName, params, context);

            // 记录步骤（调试用）
            steps.push({
              toolName,
              reasoning: `Agent 决定调用 ${toolName}`,
              result: toolResult,
            });

            // 添加 tool 结果消息到 LLM 对话
            const resultContent = JSON.stringify(toolResult.data ?? toolResult.error ?? '');
            conversation.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: resultContent,
            });

            // ── 处理工具的副作用 ──

            // control_flow: 检测面试结束
            if (toolName === 'control_flow' && toolResult.success) {
              const data = toolResult.data as Record<string, unknown> | undefined;
              if (data?.isComplete) {
                isComplete = true;
              }
            }

            // ask_question: 提取给用户的回复文本
            if (toolName === 'ask_question' && toolResult.success) {
              const data = toolResult.data as Record<string, unknown> | undefined;
              if (data?.question) {
                finalText = data.question as string;
                this.transcript.push({ role: 'interviewer', text: finalText, timestamp: Date.now() });
                context.workingMemory.add('agent', finalText, { type: data.type });
                if (data.type === 'closing') isComplete = true;
              }
            }
          }

          // 如果面试标记为结束，生成报告
          if (isComplete && !finalText) {
            const convSummary = this.buildConversationSummary();
            const reportResult = await this.registry.execute(
              'generate_report',
              { conversation_summary: convSummary },
              context,
            );
            if (reportResult.success) {
              steps.push({
                toolName: 'generate_report',
                reasoning: '面试结束，生成最终报告',
                result: reportResult,
              });
            }
          }

          // 如果已有最终回复文本，退出循环
          if (finalText) break;

          // 否则继续循环 — LLM 查看工具结果后可能继续调用工具
          continue;
        }

        // ── 情况 B：LLM 返回纯文本（直接回复用户） ──
        if (result.content) {
          finalText = result.content.trim();
          context.workingMemory.add('agent', finalText);
          this.transcript.push({ role: 'interviewer', text: finalText, timestamp: Date.now() });

          if (finalText.includes('面试结束')) isComplete = true;
          break;
        }

        // 既无工具调用也无文本，退出
        break;
      } catch (err) {
        console.error(`Agent loop iteration ${iter} error:`, err);
        finalText = '好的，我理解了。请继续你的回答。';
        context.workingMemory.add('agent', finalText);
        this.transcript.push({ role: 'interviewer', text: finalText, timestamp: Date.now() });
        break;
      }
    }

    // 如果循环耗尽但没有生成回复
    if (!finalText) {
      finalText = '好的，我们继续下一个问题。';
      context.workingMemory.add('agent', finalText);
      this.transcript.push({ role: 'interviewer', text: finalText, timestamp: Date.now() });
    }

    // ── 构建最终响应 ──
    let finalReport: InterviewReport | undefined;
    if (isComplete) {
      finalReport = this.buildFinalReport();
    }

    return {
      text: finalText,
      steps,
      isComplete,
      finalReport,
    };
  }

  /**
   * 构建对话摘要（用于评分和报告）
   */
  private buildConversationSummary(): string {
    const userMessages = this.transcript.filter((m) => m.role === 'user');
    const interviewerMessages = this.transcript.filter((m) => m.role === 'interviewer');

    return this.transcript
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role === 'interviewer' ? '面试官' : '候选人'}：${m.text}`)
      .join('\n');
  }

  /**
   * 构建最终面试报告
   */
  private buildFinalReport(): InterviewReport {
    const profile = this.context.candidateProfile;
    const dimScores = profile.dimensionScores;

    return {
      totalScore: Object.values(dimScores).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(dimScores).filter((v) => v > 0).length) || 5,
      dimensions: [
        { name: '沟通表达', score: dimScores['沟通表达'] || 5, comment: '' },
        { name: '专业知识', score: dimScores['专业知识'] || 5, comment: '' },
        { name: '逻辑思维', score: dimScores['逻辑思维'] || 5, comment: '' },
        { name: '应变能力', score: dimScores['应变能力'] || 5, comment: '' },
      ],
      summary: '',
      strengths: [...profile.strengths],
      weaknesses: [...profile.weaknesses],
      transcript: [...this.transcript],
    };
  }

  /**
   * 重置 Agent 状态
   */
  reset(): void {
    this.isRunning = false;
    this.questionCount = 0;
    this.transcript = [];
    // 重建记忆系统
    this.context.workingMemory = createWorkingMemory(this.config);
    this.context.candidateProfile = createCandidateProfile();
    this.context.episodicMemory = createEpisodicMemory();
  }
}
