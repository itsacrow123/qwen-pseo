// Enterprise Provider Registry
import { configManager } from '../../core/config-manager.js';
import { logger } from '../../core/logger.js';
import { PseoError, ERROR_CODES } from '../../core/errors.js';

/**
 * Provider Registry for managing registered AI adapter classes.
 * Implements automatic fallback chain: OpenAI → Anthropic → Gemini
 */
class ProviderRegistry {
  constructor() {
    this.providers = new Map();
    this.defaultName = 'gemini';
    // Fallback priority order: OpenAI first, then Anthropic, then Gemini
    this.fallbackOrder = ['openai', 'claude', 'gemini'];
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
   * Retrieves the active AI provider configured in site configurations.
   * @returns {Record<string, any>} Active provider instance.
   */
  getActiveProvider() {
    const configName = configManager.get('provider.ai.name', this.defaultName).toLowerCase();
    const provider = this.providers.get(configName);

    if (!provider) {
      throw new PseoError(
        ERROR_CODES.AI_FAIL,
        `AI Provider "${configName}" is not registered in the system registry.`,
        'provider-registry',
        'FATAL',
        `Register provider or check spelling in provider.config.js (Active options: ${Array.from(this.providers.keys()).join(', ')}).`
      );
    }

    return provider;
  }
  
  /**
   * Gets all available providers in fallback priority order.
   * Only returns providers that are actually registered.
   * @returns {Array<{name: string, provider: Record<string, any}>}
   */
  getFallbackChain() {
    const chain = [];
    for (const name of this.fallbackOrder) {
      const provider = this.providers.get(name);
      if (provider) {
        chain.push({ name, provider });
      }
    }
    // If no providers in fallback order, use whatever is registered
    if (chain.length === 0) {
      for (const [name, provider] of this.providers.entries()) {
        chain.push({ name, provider });
      }
    }
    return chain;
  }
  
  /**
   * Checks if an error indicates rate limiting or quota exhaustion.
   * @param {Error} err - The error to check.
   * @returns {boolean}
   */
  isRateLimitError(err) {
    if (!err) return false;
    
    const errorMessage = (err.message || '').toLowerCase();
    const errorStack = (err.stack || '').toLowerCase();
    const combined = errorMessage + ' ' + errorStack;
    
    // Check for rate limit indicators
    const rateLimitIndicators = [
      '429',
      'resource_exhausted',
      'rate_limit',
      'quota_exceeded',
      'too many requests',
      'rate limited',
      'quota exceeded',
      'daily quota',
      'minute quota',
      'concurrent request limit'
    ];
    
    return rateLimitIndicators.some(indicator => combined.includes(indicator));
  }
}

export const providerRegistry = new ProviderRegistry();
