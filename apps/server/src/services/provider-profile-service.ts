/**
 * Provider Profile Service
 *
 * Handles CRUD operations for provider profiles, connection testing,
 * and profile selection logic for API requests.
 */

import { randomUUID } from 'crypto';
import { createLogger } from '@automaker/utils';
import type {
  ProviderProfile,
  CreateProviderProfileInput,
  UpdateProviderProfileInput,
  ProviderProfileList,
  ConnectionTestResult,
  ProviderProfileType,
} from '@automaker/types';
import { validateBaseUrlSsrf, DEFAULT_PROVIDER_TIMEOUT } from '@automaker/types';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('ProviderProfileService');

/**
 * Provider Profile Service - Manages configurable API provider profiles
 */
export class ProviderProfileService {
  private settingsService: SettingsService;

  constructor(settingsService: SettingsService) {
    this.settingsService = settingsService;
  }

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  /**
   * List all provider profiles with metadata
   */
  async listProfiles(): Promise<ProviderProfileList> {
    const settings = await this.settingsService.getGlobalSettings();
    const profiles = settings.providerProfiles || [];

    const activeCount = {
      'anthropic-compatible': profiles.filter(
        (p) => p.type === 'anthropic-compatible' && p.isActive
      ).length,
      'openai-compatible': profiles.filter((p) => p.type === 'openai-compatible' && p.isActive)
        .length,
    };

    return { profiles, activeCount };
  }

  /**
   * Get a single profile by ID
   */
  async getProfile(id: string): Promise<ProviderProfile | null> {
    const settings = await this.settingsService.getGlobalSettings();
    return settings.providerProfiles?.find((p) => p.id === id) || null;
  }

  /**
   * Create a new provider profile
   */
  async createProfile(input: CreateProviderProfileInput): Promise<ProviderProfile> {
    // Validate base URL for SSRF
    const ssrfResult = validateBaseUrlSsrf(input.baseUrl, input.allowInternalUrls);
    if (!ssrfResult.safe) {
      throw new Error(`Invalid base URL: ${ssrfResult.reason}`);
    }

    const now = new Date().toISOString();
    const settings = await this.settingsService.getGlobalSettings();
    const profiles = settings.providerProfiles || [];

    // Calculate next priority (higher than any existing)
    const maxPriority = profiles.length > 0 ? Math.max(...profiles.map((p) => p.priority)) : 0;

    const profile: ProviderProfile = {
      id: randomUUID(),
      name: input.name,
      type: input.type,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      modelMapping: input.modelMapping || [],
      isActive: input.isActive ?? true,
      priority: input.priority ?? maxPriority + 1,
      timeout: input.timeout ?? DEFAULT_PROVIDER_TIMEOUT,
      description: input.description,
      customCaCert: input.customCaCert,
      allowInternalUrls: input.allowInternalUrls ?? false,
      rateLimitRpm: input.rateLimitRpm ?? 0,
      createdAt: now,
      updatedAt: now,
    };

    await this.settingsService.updateGlobalSettings({
      providerProfiles: [...profiles, profile],
    });

    logger.info(`Created provider profile: ${profile.name} (${profile.type})`);
    return profile;
  }

  /**
   * Update an existing provider profile
   */
  async updateProfile(input: UpdateProviderProfileInput): Promise<ProviderProfile> {
    const settings = await this.settingsService.getGlobalSettings();
    const profiles = settings.providerProfiles || [];
    const index = profiles.findIndex((p) => p.id === input.id);

    if (index === -1) {
      throw new Error(`Provider profile not found: ${input.id}`);
    }

    const existing = profiles[index];

    // Validate base URL if changing
    if (input.baseUrl && input.baseUrl !== existing.baseUrl) {
      const allowInternal = input.allowInternalUrls ?? existing.allowInternalUrls;
      const ssrfResult = validateBaseUrlSsrf(input.baseUrl, allowInternal);
      if (!ssrfResult.safe) {
        throw new Error(`Invalid base URL: ${ssrfResult.reason}`);
      }
    }

    const updated: ProviderProfile = {
      ...existing,
      name: input.name ?? existing.name,
      type: input.type ?? existing.type,
      baseUrl: input.baseUrl ?? existing.baseUrl,
      apiKey: input.apiKey ?? existing.apiKey,
      modelMapping: input.modelMapping ?? existing.modelMapping,
      isActive: input.isActive ?? existing.isActive,
      priority: input.priority ?? existing.priority,
      timeout: input.timeout ?? existing.timeout,
      description: input.description ?? existing.description,
      customCaCert: input.customCaCert ?? existing.customCaCert,
      allowInternalUrls: input.allowInternalUrls ?? existing.allowInternalUrls,
      rateLimitRpm: input.rateLimitRpm ?? existing.rateLimitRpm,
      updatedAt: new Date().toISOString(),
    };

    profiles[index] = updated;

    await this.settingsService.updateGlobalSettings({
      providerProfiles: profiles,
    });

    logger.info(`Updated provider profile: ${updated.name}`);
    return updated;
  }

  /**
   * Delete a provider profile
   */
  async deleteProfile(id: string): Promise<void> {
    const settings = await this.settingsService.getGlobalSettings();
    const profiles = settings.providerProfiles || [];
    const profile = profiles.find((p) => p.id === id);

    if (!profile) {
      throw new Error(`Provider profile not found: ${id}`);
    }

    await this.settingsService.updateGlobalSettings({
      providerProfiles: profiles.filter((p) => p.id !== id),
    });

    logger.info(`Deleted provider profile: ${profile.name}`);
  }

  /**
   * Duplicate a provider profile
   */
  async duplicateProfile(id: string): Promise<ProviderProfile> {
    const profile = await this.getProfile(id);
    if (!profile) {
      throw new Error(`Provider profile not found: ${id}`);
    }

    return this.createProfile({
      name: `${profile.name} (Copy)`,
      type: profile.type,
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
      modelMapping: [...profile.modelMapping],
      isActive: false, // Duplicates start inactive
      description: profile.description,
      customCaCert: profile.customCaCert,
      allowInternalUrls: profile.allowInternalUrls,
      rateLimitRpm: profile.rateLimitRpm,
      timeout: profile.timeout,
    });
  }

  /**
   * Reorder profiles by updating priority values
   */
  async reorderProfiles(orderedIds: string[]): Promise<ProviderProfile[]> {
    const settings = await this.settingsService.getGlobalSettings();
    const profiles = settings.providerProfiles || [];

    // Update priorities based on position (higher index = higher priority)
    const updatedProfiles = profiles.map((p) => {
      const newPriority = orderedIds.indexOf(p.id);
      if (newPriority === -1) {
        return p; // Profile not in ordering, keep existing priority
      }
      return {
        ...p,
        priority: orderedIds.length - newPriority, // Reverse: first in list = highest priority
        updatedAt: new Date().toISOString(),
      };
    });

    // Sort by priority descending
    updatedProfiles.sort((a, b) => b.priority - a.priority);

    await this.settingsService.updateGlobalSettings({
      providerProfiles: updatedProfiles,
    });

    logger.info(`Reordered ${orderedIds.length} provider profiles`);
    return updatedProfiles;
  }

  // ============================================================================
  // Connection Testing
  // ============================================================================

  /**
   * Test connection to a provider profile
   *
   * Validates:
   * - URL reachability
   * - API key authentication
   * - Model mapping validity (if models endpoint available)
   */
  async testConnection(profileId: string): Promise<ConnectionTestResult> {
    const profile = await this.getProfile(profileId);
    if (!profile) {
      return {
        success: false,
        error: `Profile not found: ${profileId}`,
        testedAt: new Date().toISOString(),
      };
    }

    return this.testProfileConnection(profile);
  }

  /**
   * Test connection using profile data (for testing before save)
   */
  async testProfileConnection(
    profile: Partial<ProviderProfile> & {
      baseUrl: string;
      apiKey: string;
      type: ProviderProfileType;
    }
  ): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    const timeout = profile.timeout ?? DEFAULT_PROVIDER_TIMEOUT;

    try {
      // Build the test endpoint based on provider type
      const baseUrl = profile.baseUrl.replace(/\/+$/, ''); // Remove trailing slashes

      let testUrl: string;
      let expectedStatus: number;

      if (profile.type === 'anthropic-compatible') {
        // Anthropic API uses POST /v1/messages - we'll do a minimal request
        testUrl = `${baseUrl}/v1/messages`;
        expectedStatus = 200;
      } else {
        // OpenAI API - test with /v1/models endpoint
        testUrl = `${baseUrl}/v1/models`;
        expectedStatus = 200;
      }

      // For Anthropic-compatible, we need to make a POST request
      // For OpenAI-compatible, GET /models works
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        let response: Response;
        let availableModels: string[] | undefined;

        if (profile.type === 'anthropic-compatible') {
          // Make a minimal messages request that will fail but validate auth
          response = await fetch(testUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': profile.apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-3-haiku-20240307',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'test' }],
            }),
            signal: controller.signal,
          });

          // 200 = success, 400 = bad request (but auth works), 401/403 = auth failed
          if (response.status === 401 || response.status === 403) {
            return {
              success: false,
              error: 'Authentication failed. Please check your API key.',
              responseTimeMs: Date.now() - startTime,
              testedAt: new Date().toISOString(),
            };
          }

          // Any other response means we could connect
          if (response.ok || response.status === 400 || response.status === 404) {
            return {
              success: true,
              responseTimeMs: Date.now() - startTime,
              testedAt: new Date().toISOString(),
            };
          }
        } else {
          // OpenAI-compatible: GET /models
          response = await fetch(testUrl, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${profile.apiKey}`,
            },
            signal: controller.signal,
          });

          if (response.status === 401 || response.status === 403) {
            return {
              success: false,
              error: 'Authentication failed. Please check your API key.',
              responseTimeMs: Date.now() - startTime,
              testedAt: new Date().toISOString(),
            };
          }

          if (response.ok) {
            // Try to parse models list
            try {
              const data = (await response.json()) as { data?: Array<{ id: string }> };
              if (data.data && Array.isArray(data.data)) {
                availableModels = data.data.map((m) => m.id);
              }
            } catch {
              // Models list parsing failed, but connection worked
            }

            return {
              success: true,
              responseTimeMs: Date.now() - startTime,
              availableModels,
              testedAt: new Date().toISOString(),
            };
          }
        }

        // Unexpected response
        const errorText = await response.text().catch(() => '');
        return {
          success: false,
          error: `Unexpected response: ${response.status} ${response.statusText}${errorText ? ` - ${errorText.slice(0, 200)}` : ''}`,
          responseTimeMs: Date.now() - startTime,
          testedAt: new Date().toISOString(),
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return {
            success: false,
            error: `Connection timeout after ${timeout}ms`,
            responseTimeMs,
            testedAt: new Date().toISOString(),
          };
        }

        return {
          success: false,
          error: error.message,
          responseTimeMs,
          testedAt: new Date().toISOString(),
        };
      }

      return {
        success: false,
        error: String(error),
        responseTimeMs,
        testedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Update profile with connection test result
   */
  async saveConnectionTestResult(profileId: string, result: ConnectionTestResult): Promise<void> {
    const settings = await this.settingsService.getGlobalSettings();
    const profiles = settings.providerProfiles || [];
    const index = profiles.findIndex((p) => p.id === profileId);

    if (index === -1) {
      return; // Profile not found, skip
    }

    profiles[index] = {
      ...profiles[index],
      lastConnectionTest: result,
      updatedAt: new Date().toISOString(),
    };

    await this.settingsService.updateGlobalSettings({
      providerProfiles: profiles,
    });
  }

  // ============================================================================
  // Profile Selection
  // ============================================================================

  /**
   * Get the active provider profile for a given profile type
   *
   * Returns the highest priority active profile for the type.
   * Used by proxy providers to determine which endpoint to use.
   */
  async getActiveProfile(type: ProviderProfileType): Promise<ProviderProfile | null> {
    const settings = await this.settingsService.getGlobalSettings();
    const profiles = settings.providerProfiles || [];

    const activeProfiles = profiles
      .filter((p) => p.type === type && p.isActive)
      .sort((a, b) => b.priority - a.priority); // Higher priority first

    return activeProfiles[0] || null;
  }

  /**
   * Get all active profiles for a type, sorted by priority (for fallback)
   */
  async getActiveProfilesByType(type: ProviderProfileType): Promise<ProviderProfile[]> {
    const settings = await this.settingsService.getGlobalSettings();
    const profiles = settings.providerProfiles || [];

    return profiles
      .filter((p) => p.type === type && p.isActive)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Check if any active profiles exist for a type
   */
  async hasActiveProfiles(type: ProviderProfileType): Promise<boolean> {
    const profile = await this.getActiveProfile(type);
    return profile !== null;
  }
}
