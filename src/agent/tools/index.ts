/**
 * Agent 工具注册入口
 *
 * 集中注册所有 Agent 可用工具，导出注册表实例。
 */

import { ToolRegistry } from '@/agent/tool-registry';
import { askQuestionTool } from './ask-question';
import { evaluateAnswerTool } from './evaluate-answer';
import { generateFollowupTool } from './generate-followup';
import { analyzeVisionTool } from './analyze-vision';
import { updateProfileTool } from './update-profile';
import { controlFlowTool } from './control-flow';
import { generateReportTool } from './generate-report';

/**
 * 创建并初始化工具注册表，注册所有面试 Agent 工具
 */
export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerAll([
    askQuestionTool,
    evaluateAnswerTool,
    generateFollowupTool,
    analyzeVisionTool,
    updateProfileTool,
    controlFlowTool,
    generateReportTool,
  ]);
  return registry;
}

export { askQuestionTool, evaluateAnswerTool, generateFollowupTool, analyzeVisionTool, updateProfileTool, controlFlowTool, generateReportTool };
