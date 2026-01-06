/**
 * Anthropic Proxy Provider
 *
 * Executes queries against Anthropic-compatible API endpoints.
 * Supports custom base URLs, model mapping, and proxy authentication.
 *
 * This provider uses the Claude Agent SDK but routes through a configured
 * proxy endpoint instead of the default Anthropic API.
 */

import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { BaseProvider } from './base-provider.js';
import { classifyError, getUserFriendlyErrorMessage, createLogger } from '@automaker/utils';
import {
  getThinkingTokenBudget,
  mapModelToRemote,
  mapModelFromRemote,
  type ProviderProfile,
} from '@automaker/types';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
  ProviderConfig,
} from './types.js';

const logger = createLogger('AnthropicProxyProvider');

// Explicit allowlist of environment variables to pass to the SDK.
const ALLOWED_ENV_VARS = ['PATH', 'HOME', 'SHELL', 'TERM', 'USER', 'LANG', 'LC_ALL'];

/**
 * Extended provider config with profile support
 */
export interface AnthropicProxyProviderConfig extends ProviderConfig {
  profile: ProviderProfile;
}

/**
 * AnthropicProxyProvider - Routes requests through an Anthropic-compatible proxy
 *
 * Supports:
 * - Custom base URLs (proxy endpoints, enterprise gateways)
 * - Model name mapping (local -> remote)
 * - Custom CA certificates for enterprise proxies
 * - Rate limiting per profile
 */
export class AnthropicProxyProvider extends BaseProvider {
  private profile: ProviderProfile;

  constructor(config: AnthropicProxyProviderConfig) {
    super(config);
    this.profile = config.profile;
  }

  getName(): string {
    return `anthropic-proxy:${this.profile.name}`;
  }

  /**
   * Get the profile this provider is configured with
   */
  getProfile(): ProviderProfile {
    return this.profile;
  }

  private buildEnv(): Record<string, string | undefined> {
    const env: Record<string, string | undefined> = {};
    for (const key of ALLOWED_ENV_VARS) {
      if (process.env[key]) {
        env[key] = process.env[key];
      }
    }

    // Use profile's base URL and API key
    env['ANTHROPIC_BASE_URL'] = this.profile.baseUrl;
    env['ANTHROPIC_API_KEY'] = this.profile.apiKey;

    return env;
  }

  /**
   * Execute a query using Claude Agent SDK through the proxy
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const {
      prompt,
      model,
      cwd,
      systemPrompt,
      maxTurns = 20,
      allowedTools,
      abortController,
      conversationHistory,
      sdkSessionId,
      thinkingLevel,
    } = options;

    // Apply model mapping: convert local model name to remote model name
    const remoteModel = mapModelToRemote(model, this.profile);
    logger.debug(`Model mapping: ${model} -> ${remoteModel} (profile: ${this.profile.name})`);

    // Convert thinking level to token budget
    const maxThinkingTokens = getThinkingTokenBudget(thinkingLevel);

    // Build Claude SDK options
    const hasMcpServers = options.mcpServers && Object.keys(options.mcpServers).length > 0;
    const defaultTools = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch'];

    // AUTONOMOUS MODE: Always bypass permissions and allow unrestricted tools
    const shouldRestrictTools = !hasMcpServers;

    const sdkOptions: Options = {
      model: remoteModel, // Use mapped model name
      systemPrompt,
      maxTurns,
      cwd,
      // Pass only explicitly allowed environment variables to SDK
      env: this.buildEnv(),
      // Only restrict tools if explicitly set OR (no MCP / unrestricted disabled)
      ...(allowedTools && shouldRestrictTools && { allowedTools }),
      ...(!allowedTools && shouldRestrictTools && { allowedTools: defaultTools }),
      // AUTONOMOUS MODE: Always bypass permissions and allow dangerous operations
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      abortController,
      // Resume existing SDK session if we have a session ID
      ...(sdkSessionId && conversationHistory && conversationHistory.length > 0
        ? { resume: sdkSessionId }
        : {}),
      // Forward settingSources for CLAUDE.md file loading
      ...(options.settingSources && { settingSources: options.settingSources }),
      // Forward sandbox configuration
      ...(options.sandbox && { sandbox: options.sandbox }),
      // Forward MCP servers configuration
      ...(options.mcpServers && { mcpServers: options.mcpServers }),
      // Extended thinking configuration
      ...(maxThinkingTokens && { maxThinkingTokens }),
      // Capture stderr for debugging subprocess failures
      stderr: (data: string) => {
        logger.error('[SDK stderr]', data.trim());
      },
    };

    // Build prompt payload
    let promptPayload: string | AsyncIterable<any>;

    if (Array.isArray(prompt)) {
      // Multi-part prompt (with images)
      promptPayload = (async function* () {
        const multiPartPrompt = {
          type: 'user' as const,
          session_id: '',
          message: {
            role: 'user' as const,
            content: prompt,
          },
          parent_tool_use_id: null,
        };
        yield multiPartPrompt;
      })();
    } else {
      // Simple text prompt
      promptPayload = prompt;
    }

    // Execute via Claude Agent SDK
    try {
      logger.info(`Executing query via proxy: ${this.profile.name} (${this.profile.baseUrl})`);

      const stream = query({ prompt: promptPayload, options: sdkOptions });

      // Stream messages directly - they're already in the correct format
      for await (const msg of stream) {
        // Apply reverse model mapping to response if needed
        const providerMsg = msg as ProviderMessage;

        // Log model name translation in responses (if model appears in response)
        yield providerMsg;
      }
    } catch (error) {
      // Enhance error with user-friendly message and classification
      const errorInfo = classifyError(error);
      const userMessage = getUserFriendlyErrorMessage(error);

      logger.error('executeQuery() error during execution:', {
        profile: this.profile.name,
        baseUrl: this.profile.baseUrl,
        type: errorInfo.type,
        message: errorInfo.message,
        isRateLimit: errorInfo.isRateLimit,
        retryAfter: errorInfo.retryAfter,
        stack: (error as Error).stack,
      });

      // Build enhanced error message
      const message = errorInfo.isRateLimit
        ? `${userMessage}\n\nTip: Profile "${this.profile.name}" hit rate limit. Consider adjusting rate limits or using a different profile.`
        : `${userMessage} (Profile: ${this.profile.name})`;

      const enhancedError = new Error(message);
      (enhancedError as any).originalError = error;
      (enhancedError as any).type = errorInfo.type;
      (enhancedError as any).profileId = this.profile.id;
      (enhancedError as any).profileName = this.profile.name;

      if (errorInfo.isRateLimit) {
        (enhancedError as any).retryAfter = errorInfo.retryAfter;
      }

      throw enhancedError;
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
   * Returns models from profile's model mapping, or default Claude models
   */
  getAvailableModels(): ModelDefinition[] {
    // If profile has model mappings, use those as available models
    if (this.profile.modelMapping.length > 0) {
      return this.profile.modelMapping.map((mapping) => ({
        id: mapping.localModel,
        name: mapping.localModel,
        modelString: mapping.remoteModel,
        provider: `anthropic-proxy:${this.profile.name}`,
        description: `Mapped to ${mapping.remoteModel} on ${this.profile.name}`,
        supportsVision: true,
        supportsTools: true,
      }));
    }

    // Default Claude models (proxy should support these)
    return [
      {
        id: 'claude-opus-4-5-20251101',
        name: 'Claude Opus 4.5',
        modelString: 'claude-opus-4-5-20251101',
        provider: `anthropic-proxy:${this.profile.name}`,
        description: `Via ${this.profile.name}`,
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
        tier: 'premium' as const,
      },
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        modelString: 'claude-sonnet-4-20250514',
        provider: `anthropic-proxy:${this.profile.name}`,
        description: `Via ${this.profile.name}`,
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard' as const,
      },
      {
        id: 'claude-haiku-4-5-20251001',
        name: 'Claude Haiku 4.5',
        modelString: 'claude-haiku-4-5-20251001',
        provider: `anthropic-proxy:${this.profile.name}`,
        description: `Via ${this.profile.name}`,
        contextWindow: 200000,
        maxOutputTokens: 8000,
        supportsVision: true,
        supportsTools: true,
        tier: 'basic' as const,
      },
    ];
  }

  /**
   * Check if the provider supports a specific feature
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = ['tools', 'text', 'vision', 'thinking'];
    return supportedFeatures.includes(feature);
  }
}
