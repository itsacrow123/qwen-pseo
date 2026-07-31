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
 * Provider Registry for managing registered AI adapter classes.
 */
class ProviderRegistry {
  constructor() {
    this.providers = new Map();
    // Provider priority order: OpenAI → Claude → Gemini
    this.providerOrder = ['openai', 'claude', 'gemini'];
    this.currentIndex = 0;
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
    const order = preferredOrder || this.providerOrder;
    
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
    return [...this.providerOrder];
  }
}

export const providerRegistry = new ProviderRegistry();
