// Enterprise Provider Registry
import { configManager } from '../../core/config-manager.js';
import { logger } from '../../core/logger.js';
import { PseoError, ERROR_CODES } from '../../core/errors.js';

/**
 * Default models for each provider (used when no explicit model is configured).
 */
const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  claude: 'claude-3-5-sonnet-20240620',
  gemini: 'gemini-2.5-flash',
};

/**
 * Provider configuration with API key environment variable names.
 */
const PROVIDER_CONFIG = {
  openai: { apiKeyEnv: 'OPENAI_API_KEY' },
  claude: { apiKeyEnv: 'ANTHROPIC_API_KEY' },
  gemini: { apiKeyEnv: 'GEMINI_API_KEY' },
};

/**
 * Provider Registry for managing registered AI adapter classes.
 */
class ProviderRegistry {
  constructor() {
    this.providers = new Map();
    this.currentIndex = 0;
    this._initialized = false;
  }

  /**
   * Gets the provider order dynamically from registered providers.
   * @returns {string[]} Array of provider names in registration order.
   */
  get providerOrder() {
    return Array.from(this.providers.keys());
  }

  /**
   * Initializes the registry by logging detected providers.
   * Providers self-register on import only if their API key exists.
   * Must be called before using any providers.
   */
  initialize() {
    if (this._initialized) {
      return;
    }

    const availableProviders = [];
    const skippedProviders = [];

    // Check which providers registered themselves and which were skipped
    for (const [providerName, config] of Object.entries(PROVIDER_CONFIG)) {
      const envVar = config.apiKeyEnv;
      const hasApiKey = envVar && process.env[envVar]?.trim();
      const isRegistered = this.providers.has(providerName);

      if (isRegistered) {
        availableProviders.push({ name: providerName, modelName: DEFAULT_MODELS[providerName] });
      } else if (hasApiKey) {
        logger.warn('provider-registry', `Provider "${providerName}" has API key but is not registered.`);
      } else {
        skippedProviders.push({ name: providerName, reason: `missing ${envVar}` });
      }
    }

    // Log detected providers
    logger.info('provider-registry', '=========================');
    logger.info('provider-registry', 'Detected Providers');
    logger.info('provider-registry', '=========================');

    for (const provider of availableProviders) {
      const displayName = provider.name.charAt(0).toUpperCase() + provider.name.slice(1);
      logger.info('provider-registry', `✓ ${displayName}`);
    }

    if (skippedProviders.length > 0) {
      logger.info('provider-registry', '');
      logger.info('provider-registry', 'Skipped:');
      for (const skipped of skippedProviders) {
        const displayName = skipped.name.charAt(0).toUpperCase() + skipped.name.slice(1);
        logger.info('provider-registry', `✗ ${displayName}`);
      }
    }

    if (availableProviders.length === 0) {
      throw new PseoError(
        ERROR_CODES.AI_FAIL,
        'No valid AI providers configured.',
        'provider-registry',
        'FATAL',
        'Configure at least one API key: OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY.'
      );
    }

    logger.info('provider-registry', '=========================');

    this._initialized = true;
  }

  /**
   * Registers a provider instance.
   * @param {string} name - Registered name identifier (e.g. 'gemini').
   * @param {Record<string, any>} providerInstance - Provider subclass instance.
   */
  register(name, providerInstance) {
    this.providers.set(name.toLowerCase(), providerInstance);
    logger.info('provider-registry', `Registered AI provider: "${name}"`);
  }

  /**
   * Checks if an error indicates rate limiting or quota exhaustion.
   * @param {Error} error - The error to check.
   * @returns {boolean} True if error indicates rate limit/quota issue.
   */
  isRateLimitError(error) {
    const message = (error.message || '').toUpperCase();
    const statusCode = error.details?.status;
    
    // Check for HTTP 429 status code
    if (statusCode === 429) {
      return true;
    }
    
    // Check for rate limit keywords in error message
    const rateLimitKeywords = [
      '429',
      'RESOURCE_EXHAUSTED',
      'RATE_LIMIT',
      'QUOTA_EXCEEDED',
      'RATELIMIT',
      'RATE LIMITED'
    ];
    
    return rateLimitKeywords.some(keyword => message.includes(keyword));
  }

  /**
   * Retrieves the next available provider in priority order.
   * Automatically skips providers that have been marked as unavailable.
   * @param {string[]} [preferredOrder] - Optional custom provider order.
   * @returns {{ provider: Record<string, any>, name: string, modelName: string }} Provider instance, name, and default model.
   */
  getNextAvailableProvider(preferredOrder = null) {
    // Ensure initialization has happened
    this.initialize();
    
    const order = preferredOrder || this.providerOrder;
    
    // Check if no providers are available
    if (order.length === 0) {
      throw new PseoError(
        ERROR_CODES.AI_FAIL,
        'No valid AI providers configured.',
        'provider-registry',
        'FATAL',
        'Configure at least one API key: OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY.'
      );
    }
    
    // Find the first available provider in order
    for (const providerName of order) {
      const provider = this.providers.get(providerName);
      if (provider) {
        return { 
          provider, 
          name: providerName,
          modelName: DEFAULT_MODELS[providerName]
        };
      }
    }
    
    throw new PseoError(
      ERROR_CODES.AI_FAIL,
      'No AI providers are registered and available.',
      'provider-registry',
      'FATAL',
      `Register at least one provider. Available: ${Array.from(this.providers.keys()).join(', ')}.`
    );
  }

  /**
   * Gets the provider at a specific index in the priority order.
   * @param {number} index - Index in provider order.
   * @returns {{ provider: Record<string, any>, name: string, modelName: string } | null} Provider instance, name, and default model, or null if out of bounds.
   */
  getProviderByIndex(index) {
    // Ensure initialization has happened
    this.initialize();
    
    if (index < 0 || index >= this.providerOrder.length) {
      return null;
    }
    
    const providerName = this.providerOrder[index];
    const provider = this.providers.get(providerName);
    
    if (!provider) {
      return null;
    }
    
    return { 
      provider, 
      name: providerName,
      modelName: DEFAULT_MODELS[providerName]
    };
  }

  /**
   * Returns the ordered list of provider names.
   * @returns {string[]} Array of provider names in priority order.
   */
  getProviderOrder() {
    // Ensure initialization has happened
    this.initialize();
    return [...this.providerOrder];
  }
}

export const providerRegistry = new ProviderRegistry();
