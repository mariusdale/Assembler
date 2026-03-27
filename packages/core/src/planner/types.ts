import type { AppSpec, RunPlan, Task } from '@devassemble/types';

export interface PlannerAssumption {
  code: string;
  message: string;
}

export interface AppSpecParseResult {
  appSpec: AppSpec;
  assumptions: PlannerAssumption[];
}

export interface AppSpecParser {
  parse(prompt: string): Promise<AppSpecParseResult>;
}

export interface PlannerResult extends AppSpecParseResult {
  runPlan: RunPlan;
}

export interface PlanPromptOptions {
  parser: AppSpecParser;
  now?: Date;
  idGenerator?: () => string;
}

export interface CreateRunPlanOptions {
  now?: Date;
  idGenerator?: () => string;
}

export interface PlannerTaskSeed {
  id: string;
  name: string;
  provider: string;
  action: string;
  params?: Record<string, unknown>;
  dependsOn?: string[];
  outputs?: Record<string, unknown>;
  risk?: Task['risk'];
  requiresApproval?: boolean;
  retryPolicy?: Task['retryPolicy'];
  timeoutMs?: number;
}

export interface ToolUseContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface TextContentBlock {
  type: 'text';
  text: string;
}

export interface UnknownContentBlock {
  type: string;
  [key: string]: unknown;
}

export type PlannerContentBlock = ToolUseContentBlock | TextContentBlock | UnknownContentBlock;

export interface AnthropicMessagesClient {
  messages: {
    create(request: {
      model: string;
      max_tokens: number;
      system: string;
      tools: Array<{
        name: string;
        description: string;
        input_schema: {
          type: 'object';
          [key: string]: unknown;
        };
      }>;
      tool_choice: {
        type: 'tool';
        name: string;
      };
      messages: Array<{
        role: 'user';
        content: string;
      }>;
    }): Promise<{
      stop_reason: string | null;
      content: PlannerContentBlock[];
    }>;
  };
}

export interface AnthropicAppSpecParserOptions {
  client: AnthropicMessagesClient;
  model: string;
  maxTokens?: number;
}
