import appConfig from '../../config/app.config.js';
import siteConfig from '../../config/site.config.js';
import seoConfig from '../../config/seo.config.js';
import providerConfig from '../../config/provider.config.js';
import { PseoError, ERROR_CODES } from './errors.js';
import { logger } from './logger.js';

/**
 * Consolidated configuration manager.
 * Provides immutable validation and single accessor patterns.
 */
class ConfigManager {
  constructor() {
    this.app = { ...appConfig };
    this.site = { ...siteConfig };
    this.seo = { ...seoConfig };
    this.provider = { ...providerConfig };
    this._validated = false;
  }

  /**
   * Safe getter to fetch nested configuration keys.
   * Supports dot-notation paths (e.g. 'site.business.name').
   * @param {string} keyPath
   * @param {any} [defaultValue]
   * @returns {any}
   */
  get(keyPath, defaultValue = undefined) {
    const parts = keyPath.split('.');
    let current = this;

    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return defaultValue;
      }
      current = current[part];
    }

    return current === undefined ? defaultValue : current;
  }

  /**
   * Validates environment variables and configuration contents.
   * Ensures required variables are set and API keys are present if providers enabled.
   * @throws {PseoError} If configuration fails basic assertions.
   */
  validate() {
    // Check primary business fields
    if (!this.site.business || !this.site.business.name || !this.site.business.phone) {
      throw new PseoError(
        ERROR_CODES.CONFIG_INVALID,
        'Business name and phone are required in site.config.js',
        'config',
        'FATAL',
        'Update config/site.config.js with valid business metadata.'
      );
    }

    // Check SEO domain
    if (!this.seo.canonicalDomain || !this.seo.canonicalDomain.startsWith('http')) {
      throw new PseoError(
        ERROR_CODES.CONFIG_INVALID,
        'Canonical domain is invalid in seo.config.js',
        'config',
        'FATAL',
        'Update config/seo.config.js with a valid absolute URL domain.'
      );
    }

    // Check AI Model
    if (!this.provider.ai || !this.provider.ai.primaryModel) {
      throw new PseoError(
        ERROR_CODES.CONFIG_INVALID,
        'Primary AI model is not configured in provider.config.js',
        'config',
        'FATAL',
        'Specify a primary model name in config/provider.config.js.'
      );
    }

    // Validate environment variables
    this._validateEnvironmentVariables();

    this._validated = true;
    logger.info('config', 'Configuration validated successfully');
    return true;
  }

  /**
   * Validates required environment variables based on enabled providers.
   * Warns if optional API keys are missing (will use mock data).
   * @private
   */
  _validateEnvironmentVariables() {
    const missingRequired = [];
    const missingOptional = [];

    // Check AI provider keys (at least one required)
    const aiEnabled = this.get('provider.ai.enabled', true);
    if (aiEnabled) {
      const geminiKey = process.env.GEMINI_API_KEY;
      const openaiKey = process.env.OPENAI_API_KEY;
      const anthropicKey = process.env.ANTHROPIC_API_KEY;

      if (!geminiKey && !openaiKey && !anthropicKey) {
        missingRequired.push('At least one AI API key (GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY)');
      } else {
        if (geminiKey) logger.info('config', 'Gemini API key found');
        if (openaiKey) logger.info('config', 'OpenAI API key found');
        if (anthropicKey) logger.info('config', 'Anthropic API key found');
      }
    }

    // Check optional service keys
    if (this.get('provider.weather.enabled', false)) {
      if (!process.env.WEATHER_API_KEY) {
        missingOptional.push('WEATHER_API_KEY (weather features will use mock data)');
      } else {
        logger.info('config', 'Weather API key found');
      }
    }

    if (this.get('provider.maps.enabled', false)) {
      if (!process.env.MAPS_API_KEY) {
        missingOptional.push('MAPS_API_KEY (maps features will use mock data)');
      } else {
        logger.info('config', 'Maps API key found');
      }
    }

    // Check deployment keys if deployment is attempted
    if (this.get('provider.deployment.enabled', false)) {
      if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
        missingRequired.push('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (required for deployment)');
      } else {
        logger.info('config', 'Cloudflare credentials found');
      }
    }

    // Throw error if required variables missing
    if (missingRequired.length > 0) {
      throw new PseoError(
        ERROR_CODES.CONFIG_INVALID,
        `Missing required environment variables: ${missingRequired.join(', ')}. See .env.example`,
        'config',
        'FATAL',
        'Copy .env.example to .env and fill in required values.'
      );
    }

    // Warn about optional missing keys
    if (missingOptional.length > 0) {
      logger.warn('config', `Optional environment variables missing: ${missingOptional.join(', ')}`);
    }
  }

  /**
   * Checks if configuration has been validated.
   * @returns {boolean}
   */
  isValidated() {
    return this._validated;
  }
}

export const configManager = new ConfigManager();
