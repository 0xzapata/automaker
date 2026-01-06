/**
 * Provider Profile Types
 *
 * Defines the schema for configurable API provider profiles that support
 * Anthropic-compatible and OpenAI-compatible proxy endpoints.
 *
 * Provider profiles allow users to connect to custom API endpoints (proxies,
 * enterprise gateways, local LLMs) with model mapping and fallback support.
 */

/**
 * Provider profile type - indicates API compatibility
 *
 * - 'anthropic-compatible': Uses Claude API spec (messages API format)
 * - 'openai-compatible': Uses OpenAI API spec (chat completions format)
 */
export type ProviderProfileType = 'anthropic-compatible' | 'openai-compatible';

/**
 * Connection test result for validating provider configuration
 */
export interface ConnectionTestResult {
  /** Whether the connection test passed */
  success: boolean;
  /** Response time in milliseconds */
  responseTimeMs?: number;
  /** Error message if test failed */
  error?: string;
  /** Available models returned by the provider (if supported) */
  availableModels?: string[];
  /** Timestamp of last test */
  testedAt: string;
}

/**
 * Model mapping entry - maps local model alias to remote model name
 */
export interface ModelMappingEntry {
  /** Local model name used in Automaker (e.g., "claude-3-opus") */
  localModel: string;
  /** Remote model name on the provider (e.g., "proxy-claude-opus-v1") */
  remoteModel: string;
}

/**
 * Provider profile configuration
 *
 * Represents a configured API endpoint with authentication and model mapping.
 * Multiple profiles can be configured and prioritized for fallback scenarios.
 */
export interface ProviderProfile {
  /** Unique identifier (UUID) */
  id: string;

  /** Display name for the profile */
  name: string;

  /** Provider type (API compatibility) */
  type: ProviderProfileType;

  /** Custom API endpoint base URL */
  baseUrl: string;

  /**
   * API key for authentication
   * Note: Stored encrypted at rest, only decrypted during API calls
   */
  apiKey: string;

  /**
   * Model mapping configuration
   * Maps local model names to remote model names for this provider
   */
  modelMapping: ModelMappingEntry[];

  /** Whether this profile is active and available for use */
  isActive: boolean;

  /**
   * Priority for fallback ordering (higher = checked first)
   * When multiple profiles are active for the same model family,
   * the one with highest priority is used first.
   */
  priority: number;

  /**
   * Request timeout in milliseconds (default: 30000)
   */
  timeout?: number;

  /**
   * Optional description for the profile
   */
  description?: string;

  /**
   * Custom CA certificate for enterprise proxy (PEM format)
   * Used for SSL/TLS validation when connecting to enterprise proxies
   */
  customCaCert?: string;

  /**
   * Allow connections to localhost/internal IPs (requires explicit opt-in)
   * WARNING: Enabling this bypasses SSRF protection
   */
  allowInternalUrls?: boolean;

  /**
   * Rate limit configuration (requests per minute)
   * Set to 0 for unlimited
   */
  rateLimitRpm?: number;

  /**
   * Last connection test result (for UI display)
   */
  lastConnectionTest?: ConnectionTestResult;

  /** ISO timestamp of profile creation */
  createdAt: string;

  /** ISO timestamp of last modification */
  updatedAt: string;
}

/**
 * Input for creating a new provider profile (without computed fields)
 */
export interface CreateProviderProfileInput {
  name: string;
  type: ProviderProfileType;
  baseUrl: string;
  apiKey: string;
  modelMapping?: ModelMappingEntry[];
  isActive?: boolean;
  priority?: number;
  timeout?: number;
  description?: string;
  customCaCert?: string;
  allowInternalUrls?: boolean;
  rateLimitRpm?: number;
}

/**
 * Input for updating an existing provider profile
 */
export interface UpdateProviderProfileInput {
  id: string;
  name?: string;
  type?: ProviderProfileType;
  baseUrl?: string;
  apiKey?: string;
  modelMapping?: ModelMappingEntry[];
  isActive?: boolean;
  priority?: number;
  timeout?: number;
  description?: string;
  customCaCert?: string;
  allowInternalUrls?: boolean;
  rateLimitRpm?: number;
}

/**
 * Provider profile list with metadata
 */
export interface ProviderProfileList {
  profiles: ProviderProfile[];
  /** Active profile count by type */
  activeCount: {
    'anthropic-compatible': number;
    'openai-compatible': number;
  };
}

/**
 * SSRF validation result for base URL checking
 */
export interface SsrfValidationResult {
  /** Whether the URL is safe */
  safe: boolean;
  /** Reason if not safe */
  reason?: string;
  /** Whether user has explicitly allowed internal URLs */
  bypassedByUser?: boolean;
}

/**
 * Default timeout for provider profile requests (30 seconds)
 */
export const DEFAULT_PROVIDER_TIMEOUT = 30000;

/**
 * Default rate limit (0 = unlimited)
 */
export const DEFAULT_RATE_LIMIT_RPM = 0;

/**
 * Validate a base URL for SSRF vulnerabilities
 *
 * Returns unsafe for:
 * - localhost, 127.0.0.1, ::1
 * - Private IP ranges (10.x, 172.16-31.x, 192.168.x)
 * - Link-local addresses (169.254.x)
 * - Non-HTTP/HTTPS protocols
 *
 * @param url - The URL to validate
 * @param allowInternalUrls - Whether to bypass SSRF checks
 * @returns Validation result
 */
export function validateBaseUrlSsrf(url: string, allowInternalUrls = false): SsrfValidationResult {
  try {
    const parsed = new URL(url);

    // Protocol check
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { safe: false, reason: 'Only HTTP and HTTPS protocols are allowed' };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Internal URL patterns
    const internalPatterns = [
      /^localhost$/i,
      /^127\.\d+\.\d+\.\d+$/, // 127.x.x.x
      /^\[?::1\]?$/, // IPv6 localhost
      /^10\.\d+\.\d+\.\d+$/, // 10.x.x.x (private)
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/, // 172.16-31.x.x (private)
      /^192\.168\.\d+\.\d+$/, // 192.168.x.x (private)
      /^169\.254\.\d+\.\d+$/, // Link-local
      /^0\.0\.0\.0$/, // Any interface
      /^\[?fe80:/i, // IPv6 link-local
      /^\[?fc00:/i, // IPv6 private
      /^\[?fd00:/i, // IPv6 private
    ];

    for (const pattern of internalPatterns) {
      if (pattern.test(hostname)) {
        if (allowInternalUrls) {
          return { safe: true, bypassedByUser: true };
        }
        return {
          safe: false,
          reason: `Internal/private addresses are not allowed: ${hostname}. Enable "Allow Internal URLs" to bypass this check.`,
        };
      }
    }

    return { safe: true };
  } catch (error) {
    return {
      safe: false,
      reason: `Invalid URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Get the remote model name for a local model using the profile's mapping
 *
 * @param localModel - Local model name (e.g., "claude-3-opus")
 * @param profile - Provider profile with model mapping
 * @returns Remote model name, or original if no mapping exists
 */
export function mapModelToRemote(localModel: string, profile: ProviderProfile): string {
  const mapping = profile.modelMapping.find(
    (m) => m.localModel.toLowerCase() === localModel.toLowerCase()
  );
  return mapping?.remoteModel ?? localModel;
}

/**
 * Get the local model name from a remote model using the profile's mapping
 *
 * @param remoteModel - Remote model name from provider response
 * @param profile - Provider profile with model mapping
 * @returns Local model name, or original if no mapping exists
 */
export function mapModelFromRemote(remoteModel: string, profile: ProviderProfile): string {
  const mapping = profile.modelMapping.find(
    (m) => m.remoteModel.toLowerCase() === remoteModel.toLowerCase()
  );
  return mapping?.localModel ?? remoteModel;
}
