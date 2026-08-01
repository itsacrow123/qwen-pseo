/**
 * SiliconFlow AI Client - Single reusable client for all AI operations.
 * 
 * This module owns all model selection, caching, retry logic, and failover.
 * Every engine must use ONLY this client.
 */

import { logger } from '../../core/logger.js';
import { PseoError, ERROR_CODES } from '../../core/errors.js';

// Model priority list (never exposed to users)
const MODEL_PRIORITY = [
  'Qwen/Qwen3.6-35B-A3B',
  'deepseek-ai/DeepSeek-V4-Pro',
  'Qwen/Qwen3.5-35B-A3B',
  'deepseek-ai/DeepSeek-V3.2',
  'zai-org/GLM-5.2',
  'moonshotai/Kimi-K3',
  'google/gemma-4-31B-it',
  'Qwen/Qwen3.5-27B',
  'deepseek-ai/DeepSeek-V3'
];

// Error codes that trigger model failover
const FAILOVER_ERROR_CODES = [429, 503, 529];
const FAILOVER_ERROR_PATTERNS = [
  'timeout',
  'network failure',
  'temporary unavailable',
  'rate_limit',
  'RATE_LIMIT',
  'RATELIMIT'
];

/**
 * SiliconFlowClient - Singleton client for all SiliconFlow API interactions.
 * Handles model selection, caching, retry with exponential backoff, and automatic failover.
 */
class SiliconFlowClient {
  constructor() {
    this._activeModel = null;
    this._modelTested = false;
    this._retryCount = 0;
    this._maxRetries = 3;
    this._baseDelayMs = 1000;
  }

  /**
   * Get SiliconFlow API key from environment.
   * @returns {string} API key
   * @throws {PseoError} If API key is missing
   */
  _getApiKey() {
    const apiKey = process.env.SILICONFLOW_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      throw new PseoError(
        ERROR_CODES.CONFIG_INVALID,
        'Missing required SiliconFlow environment variables.',
        'siliconflow-client',
        'FATAL',
        'Set SILICONFLOW_API_KEY environment variable.'
      );
    }
    return apiKey.trim();
  }

  /**
   * Get SiliconFlow base URL from environment.
   * @returns {string} Base URL
   */
  _getBaseUrl() {
    return process.env.SILICONFLOW_BASE_URL?.trim() || 'https://api.siliconflow.com/v1';
  }

  /**
   * Check if error should trigger model failover.
   * @param {Error} error - The error to check
   * @returns {boolean} True if should failover to next model
   */
  _isFailoverError(error) {
    const statusCode = error.details?.status;
    const message = (error.message || '').toUpperCase();

    // Check HTTP status codes
    if (statusCode && FAILOVER_ERROR_CODES.includes(statusCode)) {
      return true;
    }

    // Check error message patterns
    return FAILOVER_ERROR_PATTERNS.some(pattern => 
      message.includes(pattern.toUpperCase())
    );
  }

  /**
   * Test models in priority order until one succeeds.
   * @returns {Promise<string>} Working model name
   * @throws {PseoError} If no models work
   */
  async _findWorkingModel() {
    logger.info('siliconflow-client', `Testing models in priority order...`);

    for (const model of MODEL_PRIORITY) {
      try {
        logger.debug('siliconflow-client', `Testing model: ${model}`);
        
        const response = await fetch(`${this._getBaseUrl()}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this._getApiKey()}`
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: 'You are a test assistant.' },
              { role: 'user', content: 'Reply "OK" if you can respond.' }
            ],
            max_tokens: 10
          })
        });

        if (response.ok) {
          logger.info('siliconflow-client', `Model ${model} is available.`);
          return model;
        }

        const status = response.status;
        if (FAILOVER_ERROR_CODES.includes(status)) {
          logger.warn('siliconflow-client', `Model ${model} returned ${status}, trying next...`);
          continue;
        }

        logger.warn('siliconflow-client', `Model ${model} returned ${status}, trying next...`);
      } catch (err) {
        logger.warn('siliconflow-client', `Model ${model} failed: ${err.message}, trying next...`);
        continue;
      }
    }

    throw new PseoError(
      ERROR_CODES.AI_FAIL,
      'No SiliconFlow models are available.',
      'siliconflow-client',
      'FATAL',
      'Check API key validity and network connectivity.'
    );
  }

  /**
   * Get active model, testing if needed and caching result.
   * @returns {Promise<string>} Active model name
   */
  async _getActiveModel() {
    if (this._activeModel && this._modelTested) {
      return this._activeModel;
    }

    this._activeModel = await this._findWorkingModel();
    this._modelTested = true;
    logger.info('siliconflow-client', `Using model: ${this._activeModel}`);
    return this._activeModel;
  }

  /**
   * Switch to next available model in priority list.
   * @returns {Promise<string>} New active model
   */
  async _switchModel() {
    logger.warn('siliconflow-client', `Switching from failed model: ${this._activeModel}`);
    
    const currentIndex = MODEL_PRIORITY.indexOf(this._activeModel);
    const remainingModels = MODEL_PRIORITY.slice(currentIndex + 1);

    for (const model of remainingModels) {
      try {
        logger.debug('siliconflow-client', `Testing fallback model: ${model}`);
        
        const response = await fetch(`${this._getBaseUrl()}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this._getApiKey()}`
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: 'You are a test assistant.' },
              { role: 'user', content: 'Reply "OK" if you can respond.' }
            ],
            max_tokens: 10
          })
        });

        if (response.ok) {
          this._activeModel = model;
          logger.info('siliconflow-client', `Switched to model: ${model}`);
          return model;
        }
      } catch (err) {
        logger.warn('siliconflow-client', `Fallback model ${model} failed: ${err.message}`);
        continue;
      }
    }

    throw new PseoError(
      ERROR_CODES.AI_FAIL,
      'No fallback SiliconFlow models available.',
      'siliconflow-client',
      'ERROR',
      'All remaining models in priority list are unavailable.'
    );
  }

  /**
   * Calculate exponential backoff delay.
   * @param {number} attempt - Current attempt number (0-indexed)
   * @returns {number} Delay in milliseconds
   */
  _calculateBackoff(attempt) {
    const exponentialDelay = this._baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay;
    return exponentialDelay + jitter;
  }

  /**
   * Generate content using SiliconFlow API with automatic retry and failover.
   * @param {string} systemPrompt - System-level instructions
   * @param {string} userPrompt - User-level instructions
   * @param {Record<string, any>} [options] - Additional options
   * @returns {Promise<Record<string, any>>} Response with text, usage, and metrics
   * @throws {PseoError} If all retries and failovers exhaust
   */
  async generate(systemPrompt, userPrompt, options = {}) {
    const startTime = Date.now();
    let lastError = null;
    let currentModel = await this._getActiveModel();

    for (let attempt = 0; attempt < this._maxRetries; attempt++) {
      try {
        logger.debug('siliconflow-client', `Attempt ${attempt + 1}/${this._maxRetries} with model: ${currentModel}`);

        const response = await fetch(`${this._getBaseUrl()}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this._getApiKey()}`
          },
          body: JSON.stringify({
            model: currentModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            response_format: { type: 'json_object' },
            ...options
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          const error = new PseoError(
            ERROR_CODES.AI_FAIL,
            `SiliconFlow API returned error status ${response.status}`,
            'siliconflow-client',
            'ERROR',
            'Verify API key validity and network connectivity.',
            { status: response.status, rawResponse: errorText }
          );
          error.details = { status: response.status };
          throw error;
        }

        const responseData = await response.json();
        const text = responseData?.choices?.[0]?.message?.content;
        const inputTokens = responseData?.usage?.prompt_tokens || 0;
        const outputTokens = responseData?.usage?.completion_tokens || 0;

        if (!text) {
          throw new PseoError(
            ERROR_CODES.AI_FAIL,
            'Empty response payload from SiliconFlow API.',
            'siliconflow-client',
            'ERROR',
            'Check request content parameters or verify model status.'
          );
        }

        const durationMs = Date.now() - startTime;
        const estimatedCost = this._calculateCost(inputTokens, outputTokens);

        logger.info('siliconflow-client', `Successfully generated content. Tokens: ${inputTokens + outputTokens}, Duration: ${durationMs}ms`);

        return {
          text,
          usage: {
            inputTokens,
            outputTokens,
            estimatedCost,
            model: currentModel
          },
          durationMs
        };

      } catch (err) {
        lastError = err;
        logger.warn('siliconflow-client', `Attempt ${attempt + 1} failed: ${err.message}`);

        // Check if we should failover to next model
        if (this._isFailoverError(err)) {
          logger.warn('siliconflow-client', 'Failover-triggering error detected, switching model...');
          try {
            currentModel = await this._switchModel();
            this._retryCount = 0; // Reset retry count for new model
            continue;
          } catch (switchErr) {
            logger.error('siliconflow-client', `Model switch failed: ${switchErr.message}`);
            lastError = switchErr;
          }
        }

        // Apply exponential backoff before retry
        if (attempt < this._maxRetries - 1) {
          const delay = this._calculateBackoff(attempt);
          logger.debug('siliconflow-client', `Waiting ${Math.round(delay)}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new PseoError(
      ERROR_CODES.AI_FAIL,
      `SiliconFlow generation failed after ${this._maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}`,
      'siliconflow-client',
      'ERROR',
      'Check API key validity, network connectivity, and model availability.',
      { lastError }
    );
  }

  /**
   * Calculate estimated cost based on token usage.
   * @param {number} inputTokens - Input token count
   * @param {number} outputTokens - Output token count
   * @returns {number} Estimated cost in USD
   */
  _calculateCost(inputTokens, outputTokens) {
    // Average cost estimate: $0.0001 per 1K tokens
    const inputPrice = 0.0001;
    const outputPrice = 0.0001;
    
    const inputCost = (inputTokens / 1000) * inputPrice;
    const outputCost = (outputTokens / 1000) * outputPrice;
    
    return parseFloat((inputCost + outputCost).toFixed(6));
  }

  /**
   * Clear model cache (for testing or forced refresh).
   */
  clearCache() {
    this._activeModel = null;
    this._modelTested = false;
    this._retryCount = 0;
    logger.info('siliconflow-client', 'Model cache cleared.');
  }
}

export const siliconFlowClient = new SiliconFlowClient();
