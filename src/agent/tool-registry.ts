/**
 * 工具注册表（Tool Registry）
 *
 * 管理 Agent 所有可用工具的注册、查找和 LLM function calling 格式转换。
 * 每个工具需实现 AgentTool 接口，通过 register() 注册到注册表。
 */

import type { AgentTool, FunctionToolDef, AgentContext, ToolResult } from '@/types/agent';

export class ToolRegistry {
  private tools = new Map<string, AgentTool>();

  /** 注册一个工具 */
  register(tool: AgentTool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`工具 "${tool.name}" 已注册，将被覆盖`);
    }
    this.tools.set(tool.name, tool);
  }

  /** 批量注册 */
  registerAll(tools: AgentTool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /** 获取工具 */
  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  /** 获取所有工具名称 */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /** 是否有工具 */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 导出为 OpenAI 兼容的 function calling 工具定义
   */
  toFunctionDefs(): FunctionToolDef[] {
    return Array.from(this.tools.values()).map((tool) => {
      const properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
      }> = {};
      const required: string[] = [];

      for (const param of tool.parameters) {
        properties[param.name] = {
          type: param.type === 'object' ? 'string' :
                param.type === 'array' ? 'string' :
                param.type,
          description: param.description,
        };
        if (param.enum) {
          properties[param.name].enum = param.enum;
        }
        if (param.required) {
          required.push(param.name);
        }
      }

      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: 'object',
            properties,
            required,
          },
        },
      };
    });
  }

  /**
   * 执行工具调用
   *
   * @param name - 工具名称
   * @param params - 工具参数（JSON 字符串或对象）
   * @param context - Agent 上下文
   */
  async execute(
    name: string,
    params: string | Record<string, unknown>,
    context: AgentContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `未找到工具 "${name}"` };
    }

    let parsedParams: Record<string, unknown>;
    if (typeof params === 'string') {
      try {
        parsedParams = JSON.parse(params);
      } catch {
        return { success: false, error: `工具 "${name}" 参数 JSON 解析失败` };
      }
    } else {
      parsedParams = params;
    }

    try {
      return await tool.execute(parsedParams, context);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `工具 "${name}" 执行错误：${msg}` };
    }
  }
}
