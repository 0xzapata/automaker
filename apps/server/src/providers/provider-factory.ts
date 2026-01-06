/**
 * Provider Factory - Routes model IDs to the appropriate provider
 *
 * Uses a registry pattern for dynamic provider registration.
 * Providers register themselves on import, making it easy to add new providers.
 *
 * Extended to support configurable proxy profiles for Anthropic-compatible
 * and OpenAI-compatible endpoints with fallback support.
 */

import { BaseProvider } from './base-provider.js';
import type { InstallationStatus, ModelDefinition } from './types.js';
import {
  isCursorModel,
  type ModelProvider,
  type ProviderProfile,
  type ProviderProfileType,
} from '@automaker/types';
import { AnthropicProxyProvider } from './anthropic-proxy-provider.js';
import { OpenAIProxyProvider } from './openai-proxy-provider.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('ProviderFactory');

/**
 * Provider registration entry
 */
interface ProviderRegistration {
  /** Factory function to create provider instance */
  factory: () => BaseProvider;
  /** Aliases for this provider (e.g., 'anthropic' for 'claude') */
  aliases?: string[];
  /** Function to check if this provider can handle a model ID */
  canHandleModel?: (modelId: string) => boolean;
  /** Priority for model matching (higher = checked first) */
  priority?: number;
}

/**
 * Provider registry - stores registered providers
 */
const providerRegistry = new Map<string, ProviderRegistration>();

/**
 * Register a provider with the factory
 *
 * @param name Provider name (e.g., 'claude', 'cursor')
 * @param registration Provider registration config
 */
export function registerProvider(name: string, registration: ProviderRegistration): void {
  providerRegistry.set(name.toLowerCase(), registration);
}

export class ProviderFactory {
  /**
   * Determine which provider to use for a given model
   *
   * @param model Model identifier
   * @returns Provider name (ModelProvider type)
   */
  static getProviderNameForModel(model: string): ModelProvider {
    const lowerModel = model.toLowerCase();

    // Get all registered providers sorted by priority (descending)
    const registrations = Array.from(providerRegistry.entries()).sort(
      ([, a], [, b]) => (b.priority ?? 0) - (a.priority ?? 0)
    );

    // Check each provider's canHandleModel function
    for (const [name, reg] of registrations) {
      if (reg.canHandleModel?.(lowerModel)) {
        return name as ModelProvider;
      }
    }

    // Fallback: Check for explicit prefixes
    for (const [name] of registrations) {
      if (lowerModel.startsWith(`${name}-`)) {
        return name as ModelProvider;
      }
    }

    // Default to claude (first registered provider or claude)
    return 'claude';
  }

  /**
   * Get the appropriate provider for a given model ID
   *
   * @param modelId Model identifier (e.g., "claude-opus-4-5-20251101", "cursor-gpt-4o", "cursor-auto")
   * @returns Provider instance for the model
   */
  static getProviderForModel(modelId: string): BaseProvider {
    const providerName = this.getProviderNameForModel(modelId);
    const provider = this.getProviderByName(providerName);

    if (!provider) {
      // Fallback to claude if provider not found
      const claudeReg = providerRegistry.get('claude');
      if (claudeReg) {
        return claudeReg.factory();
      }
      throw new Error(`No provider found for model: ${modelId}`);
    }

    return provider;
  }

  /**
   * Get all available providers
   */
  static getAllProviders(): BaseProvider[] {
    return Array.from(providerRegistry.values()).map((reg) => reg.factory());
  }

  /**
   * Check installation status for all providers
   *
   * @returns Map of provider name to installation status
   */
  static async checkAllProviders(): Promise<Record<string, InstallationStatus>> {
    const statuses: Record<string, InstallationStatus> = {};

    for (const [name, reg] of providerRegistry.entries()) {
      const provider = reg.factory();
      const status = await provider.detectInstallation();
      statuses[name] = status;
    }

    return statuses;
  }

  /**
   * Get provider by name (for direct access if needed)
   *
   * @param name Provider name (e.g., "claude", "cursor") or alias (e.g., "anthropic")
   * @returns Provider instance or null if not found
   */
  static getProviderByName(name: string): BaseProvider | null {
    const lowerName = name.toLowerCase();

    // Direct lookup
    const directReg = providerRegistry.get(lowerName);
    if (directReg) {
      return directReg.factory();
    }

    // Check aliases
    for (const [, reg] of providerRegistry.entries()) {
      if (reg.aliases?.includes(lowerName)) {
        return reg.factory();
      }
    }

    return null;
  }

  /**
   * Get all available models from all providers
   */
  static getAllAvailableModels(): ModelDefinition[] {
    const providers = this.getAllProviders();
    return providers.flatMap((p) => p.getAvailableModels());
  }

  /**
   * Get list of registered provider names
   */
  static getRegisteredProviderNames(): string[] {
    return Array.from(providerRegistry.keys());
  }

  // ===========================================================================
  // Profile-Based Provider Methods
  // ===========================================================================

  /**
   * Create a provider from a profile configuration
   *
   * @param profile Provider profile with type and configuration
   * @returns Provider instance configured with the profile
   */
  static createProviderFromProfile(profile: ProviderProfile): BaseProvider {
    if (profile.type === 'anthropic-compatible') {
      return new AnthropicProxyProvider({ profile });
    } else if (profile.type === 'openai-compatible') {
      return new OpenAIProxyProvider({ profile });
    }

    throw new Error(`Unknown provider profile type: ${profile.type}`);
  }

  /**
   * Get a provider for a model, preferring active proxy profiles
   *
   * This method checks for active proxy profiles first, then falls back
   * to the standard provider registry.
   *
   * @param modelId Model identifier
   * @param profiles Active provider profiles (sorted by priority)
   * @param preferredProfileType Optional: prefer a specific profile type
   * @returns Provider instance
   */
  static getProviderForModelWithProfiles(
    modelId: string,
    profiles: ProviderProfile[],
    preferredProfileType?: ProviderProfileType
  ): BaseProvider {
    // Check if model explicitly requests a profile-based provider
    // Format: "profile:<profile-id>/<model>" or "anthropic-proxy:<model>" or "openai-proxy:<model>"
    if (modelId.startsWith('profile:')) {
      const [profileId, ...modelParts] = modelId.slice(8).split('/');
      const profile = profiles.find((p) => p.id === profileId);
      if (profile) {
        logger.debug(`Using profile ${profile.name} for model ${modelParts.join('/')}`);
        return this.createProviderFromProfile(profile);
      }
    }

    // If a preferred profile type is specified, use the first matching active profile
    if (preferredProfileType) {
      const matchingProfiles = profiles.filter(
        (p) => p.type === preferredProfileType && p.isActive
      );
      if (matchingProfiles.length > 0) {
        const profile = matchingProfiles[0]; // Highest priority first
        logger.debug(`Using ${profile.type} profile: ${profile.name}`);
        return this.createProviderFromProfile(profile);
      }
    }

    // Check if the model is a Claude model and we have an Anthropic-compatible profile
    const lowerModel = modelId.toLowerCase();
    const isClaudeModel =
      lowerModel.startsWith('claude-') ||
      ['opus', 'sonnet', 'haiku'].some((n) => lowerModel.includes(n));

    if (isClaudeModel) {
      const anthropicProfiles = profiles.filter(
        (p) => p.type === 'anthropic-compatible' && p.isActive
      );
      if (anthropicProfiles.length > 0) {
        const profile = anthropicProfiles[0];
        logger.debug(`Routing Claude model ${modelId} to profile: ${profile.name}`);
        return this.createProviderFromProfile(profile);
      }
    }

    // Check if the model looks like an OpenAI model and we have an OpenAI-compatible profile
    const isOpenAIModel =
      lowerModel.startsWith('gpt-') || lowerModel.startsWith('o1') || lowerModel.startsWith('o3');

    if (isOpenAIModel) {
      const openaiProfiles = profiles.filter((p) => p.type === 'openai-compatible' && p.isActive);
      if (openaiProfiles.length > 0) {
        const profile = openaiProfiles[0];
        logger.debug(`Routing OpenAI model ${modelId} to profile: ${profile.name}`);
        return this.createProviderFromProfile(profile);
      }
    }

    // Fall back to standard provider routing
    return this.getProviderForModel(modelId);
  }

  /**
   * Get fallback providers for a model
   *
   * Returns a list of providers to try in order when the primary fails.
   * Useful for retry logic with priority-ordered profiles.
   *
   * @param modelId Model identifier
   * @param profiles Active provider profiles (sorted by priority)
   * @returns Array of provider instances to try in order
   */
  static getFallbackProviders(modelId: string, profiles: ProviderProfile[]): BaseProvider[] {
    const providers: BaseProvider[] = [];
    const lowerModel = modelId.toLowerCase();

    // Determine which type of profiles to use based on the model
    let profileType: ProviderProfileType | null = null;

    if (
      lowerModel.startsWith('claude-') ||
      ['opus', 'sonnet', 'haiku'].some((n) => lowerModel.includes(n))
    ) {
      profileType = 'anthropic-compatible';
    } else if (
      lowerModel.startsWith('gpt-') ||
      lowerModel.startsWith('o1') ||
      lowerModel.startsWith('o3')
    ) {
      profileType = 'openai-compatible';
    }

    if (profileType) {
      // Add all active profiles of the matching type (already sorted by priority)
      const matchingProfiles = profiles.filter((p) => p.type === profileType && p.isActive);

      for (const profile of matchingProfiles) {
        providers.push(this.createProviderFromProfile(profile));
      }
    }

    // Add standard provider as final fallback
    const standardProvider = this.getProviderForModel(modelId);
    providers.push(standardProvider);

    return providers;
  }

  /**
   * Execute with fallback support
   *
   * Tries each provider in sequence until one succeeds.
   *
   * @param modelId Model identifier
   * @param profiles Active provider profiles
   * @param executor Function that executes the query with a provider
   * @returns Result from the first successful provider
   */
  static async executeWithFallback<T>(
    modelId: string,
    profiles: ProviderProfile[],
    executor: (provider: BaseProvider) => Promise<T>
  ): Promise<T> {
    const providers = this.getFallbackProviders(modelId, profiles);
    let lastError: Error | null = null;

    for (let i = 0; i < providers.length; i++) {
      const provider = providers[i];
      try {
        logger.debug(`Attempting provider ${i + 1}/${providers.length}: ${provider.getName()}`);
        return await executor(provider);
      } catch (error) {
        lastError = error as Error;
        logger.warn(
          `Provider ${provider.getName()} failed: ${lastError.message}. ` +
            (i < providers.length - 1 ? 'Trying next provider...' : 'No more fallbacks.')
        );
      }
    }

    throw lastError || new Error(`All providers failed for model: ${modelId}`);
  }
}

// =============================================================================
// Provider Registrations
// =============================================================================

// Import providers for registration side-effects
import { ClaudeProvider } from './claude-provider.js';
import { CursorProvider } from './cursor-provider.js';

// Register Claude provider
registerProvider('claude', {
  factory: () => new ClaudeProvider(),
  aliases: ['anthropic'],
  canHandleModel: (model: string) => {
    return (
      model.startsWith('claude-') || ['opus', 'sonnet', 'haiku'].some((n) => model.includes(n))
    );
  },
  priority: 0, // Default priority
});

// Register Cursor provider
registerProvider('cursor', {
  factory: () => new CursorProvider(),
  canHandleModel: (model: string) => isCursorModel(model),
  priority: 10, // Higher priority - check Cursor models first
});
