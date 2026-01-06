/**
 * OpenAI Proxy Provider
 *
 * Executes queries against OpenAI-compatible API endpoints.
 * Supports custom base URLs, model mapping, and proxy authentication.
 *
 * This provider converts Automaker's message format to OpenAI's chat completions API
 * and streams responses back in the standard ProviderMessage format.
 */

import { BaseProvider } from './base-provider.js';
import { classifyError, getUserFriendlyErrorMessage, createLogger } from '@automaker/utils';
import { mapModelToRemote, type ProviderProfile } from '@automaker/types';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
  ProviderConfig,
  ContentBlock,
} from './types.js';

const logger = createLogger('OpenAIProxyProvider');

/**
 * Extended provider config with profile support
 */
export interface OpenAIProxyProviderConfig extends ProviderConfig {
  profile: ProviderProfile;
}

/**
 * OpenAI chat completion message format
 */
interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

/**
 * OpenAI tool call format
 */
interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * OpenAI streaming chunk format
 */
interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
}

/**
 * OpenAIProxyProvider - Routes requests through an OpenAI-compatible proxy
 *
 * Supports:
 * - Custom base URLs (proxy endpoints, enterprise gateways, local LLMs)
 * - Model name mapping (local -> remote)
 * - Streaming chat completions
 * - Tool/function calling (basic support)
 */
export class OpenAIProxyProvider extends BaseProvider {
  private profile: ProviderProfile;

  constructor(config: OpenAIProxyProviderConfig) {
    super(config);
    this.profile = config.profile;
  }

  getName(): string {
    return `openai-proxy:${this.profile.name}`;
  }

  /**
   * Get the profile this provider is configured with
   */
  getProfile(): ProviderProfile {
    return this.profile;
  }

  /**
   * Execute a query using OpenAI-compatible chat completions API
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const { prompt, model, cwd, systemPrompt, maxTurns = 20, abortController } = options;

    // Apply model mapping: convert local model name to remote model name
    const remoteModel = mapModelToRemote(model, this.profile);
    logger.debug(`Model mapping: ${model} -> ${remoteModel} (profile: ${this.profile.name})`);

    // Build messages array for OpenAI format
    const messages: OpenAIChatMessage[] = [];

    // Add system prompt if provided
    if (systemPrompt && typeof systemPrompt === 'string') {
      messages.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    // Add user prompt
    const userContent = Array.isArray(prompt) ? prompt.map((p) => p.text || '').join('\n') : prompt;

    messages.push({
      role: 'user',
      content: userContent,
    });

    // Build request body
    const requestBody = {
      model: remoteModel,
      messages,
      stream: true,
      max_tokens: 4096,
    };

    // Build request URL
    const baseUrl = this.profile.baseUrl.replace(/\/+$/, '');
    const requestUrl = `${baseUrl}/v1/chat/completions`;

    // Set up timeout
    const timeout = this.profile.timeout ?? 30000;
    const controller = abortController ?? new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      logger.info(
        `Executing query via OpenAI proxy: ${this.profile.name} (${this.profile.baseUrl})`
      );

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.profile.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(
          `OpenAI API error: ${response.status} ${response.statusText}${
            errorText ? ` - ${errorText}` : ''
          }`
        );
      }

      if (!response.body) {
        throw new Error('No response body received from OpenAI proxy');
      }

      // Parse SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let sessionId = `openai-${Date.now()}`;
      let accumulatedContent = '';
      let accumulatedToolCalls: Map<number, { id: string; name: string; arguments: string }> =
        new Map();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              // Stream complete
              continue;
            }

            try {
              const chunk: OpenAIStreamChunk = JSON.parse(data);
              const choice = chunk.choices[0];

              if (!choice) continue;

              // Handle content delta
              if (choice.delta.content) {
                accumulatedContent += choice.delta.content;

                const contentBlock: ContentBlock = {
                  type: 'text',
                  text: choice.delta.content,
                };

                yield {
                  type: 'assistant',
                  session_id: sessionId,
                  message: {
                    role: 'assistant',
                    content: [contentBlock],
                  },
                };
              }

              // Handle tool call deltas
              if (choice.delta.tool_calls) {
                for (const toolDelta of choice.delta.tool_calls) {
                  const existing = accumulatedToolCalls.get(toolDelta.index) || {
                    id: '',
                    name: '',
                    arguments: '',
                  };

                  if (toolDelta.id) existing.id = toolDelta.id;
                  if (toolDelta.function?.name) existing.name = toolDelta.function.name;
                  if (toolDelta.function?.arguments) {
                    existing.arguments += toolDelta.function.arguments;
                  }

                  accumulatedToolCalls.set(toolDelta.index, existing);
                }
              }

              // Emit tool calls when stream is complete
              if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
                for (const [, toolCall] of accumulatedToolCalls) {
                  if (toolCall.id && toolCall.name) {
                    let input: unknown;
                    try {
                      input = JSON.parse(toolCall.arguments);
                    } catch {
                      input = { raw: toolCall.arguments };
                    }

                    const toolBlock: ContentBlock = {
                      type: 'tool_use',
                      name: toolCall.name,
                      tool_use_id: toolCall.id,
                      input,
                    };

                    yield {
                      type: 'assistant',
                      session_id: sessionId,
                      message: {
                        role: 'assistant',
                        content: [toolBlock],
                      },
                    };
                  }
                }
              }
            } catch (parseError) {
              logger.warn(`Failed to parse SSE chunk: ${data}`, parseError);
            }
          }
        }
      }

      // Emit final result
      yield {
        type: 'result',
        subtype: 'success',
        session_id: sessionId,
        result: accumulatedContent,
      };
    } catch (error) {
      // Enhance error with user-friendly message
      const errorInfo = classifyError(error);
      const userMessage = getUserFriendlyErrorMessage(error);

      logger.error('executeQuery() error during execution:', {
        profile: this.profile.name,
        baseUrl: this.profile.baseUrl,
        type: errorInfo.type,
        message: errorInfo.message,
        stack: (error as Error).stack,
      });

      const message = `${userMessage} (Profile: ${this.profile.name})`;

      const enhancedError = new Error(message);
      (enhancedError as any).originalError = error;
      (enhancedError as any).type = errorInfo.type;
      (enhancedError as any).profileId = this.profile.id;
      (enhancedError as any).profileName = this.profile.name;

      throw enhancedError;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Detect installation status (proxy is always "installed" if profile is configured)
   */
  async detectInstallation(): Promise<InstallationStatus> {
    const hasApiKey = !!this.profile.apiKey;
    const lastTest = this.profile.lastConnectionTest;

    return {
      installed: true,
      method: 'sdk',
      hasApiKey,
      authenticated: lastTest?.success ?? hasApiKey,
      path: this.profile.baseUrl,
    };
  }

  /**
   * Get available models for this proxy provider
   *
   * Returns models from profile's model mapping, or common OpenAI models
   */
  getAvailableModels(): ModelDefinition[] {
    // If profile has model mappings, use those as available models
    if (this.profile.modelMapping.length > 0) {
      return this.profile.modelMapping.map((mapping) => ({
        id: mapping.localModel,
        name: mapping.localModel,
        modelString: mapping.remoteModel,
        provider: `openai-proxy:${this.profile.name}`,
        description: `Mapped to ${mapping.remoteModel} on ${this.profile.name}`,
        supportsVision: false, // Assume false unless specified
        supportsTools: true,
      }));
    }

    // Default OpenAI models (proxy should support these)
    return [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        modelString: 'gpt-4o',
        provider: `openai-proxy:${this.profile.name}`,
        description: `Via ${this.profile.name}`,
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsVision: true,
        supportsTools: true,
        tier: 'premium' as const,
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        modelString: 'gpt-4o-mini',
        provider: `openai-proxy:${this.profile.name}`,
        description: `Via ${this.profile.name}`,
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard' as const,
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        modelString: 'gpt-3.5-turbo',
        provider: `openai-proxy:${this.profile.name}`,
        description: `Via ${this.profile.name}`,
        contextWindow: 16385,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsTools: true,
        tier: 'basic' as const,
      },
    ];
  }

  /**
   * Check if the provider supports a specific feature
   */
  supportsFeature(feature: string): boolean {
    // OpenAI providers have varying support - be conservative
    const supportedFeatures = ['tools', 'text'];
    return supportedFeatures.includes(feature);
  }
}
