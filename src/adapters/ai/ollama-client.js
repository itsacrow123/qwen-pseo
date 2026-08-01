/**
 * Ollama AI Client - Single reusable client for all AI operations.
 * 
 * This module handles all communication with the local Ollama API.
 * Every engine must use ONLY this client.
 */

import { logger } from '../../core/logger.js';
import { PseoError, ERROR_CODES } from '../../core/errors.js';

/**
 * OllamaClient - Singleton client for all Ollama API interactions.
 * Handles model configuration, retry with exponential backoff.
 */
class OllamaClient {
  constructor() {
    this._baseUrl = null;
    this._model = null;
    this._retryCount = 0;
    this._maxRetries = 3;
    this._baseDelayMs = 1000;
  }

  /**
   * Get Ollama base URL from environment.
   * @returns {string} Base URL
   * @throws {PseoError} If base URL is missing
   */
  _getBaseUrl() {
    const baseUrl = process.env.OLLAMA_BASE_URL;
    if (!baseUrl || !baseUrl.trim()) {
      throw new PseoError(
        ERROR_CODES.CONFIG_INVALID,
        'Missing required Ollama environment variables.',
        'ollama-client',
        'FATAL',
        'Set OLLAMA_BASE_URL environment variable.'
      );
    }
    return baseUrl.trim();
  }

  /**
   * Get Ollama model name from environment.
   * @returns {string} Model name
   * @throws {PseoError} If model name is missing
   */
  _getModel() {
    const model = process.env.OLLAMA_MODEL;
    if (!model || !model.trim()) {
      throw new PseoError(
        ERROR_CODES.CONFIG_INVALID,
        'Missing required Ollama environment variables.',
        'ollama-client',
        'FATAL',
        'Set OLLAMA_MODEL environment variable.'
      );
    }
    return model.trim();
  }

  /**
   * Initialize client with environment configuration.
   * @private
   */
  _initialize() {
    if (!this._baseUrl) {
      this._baseUrl = this._getBaseUrl();
    }
    if (!this._model) {
      this._model = this._getModel();
    }
    logger.info('ollama-client', `Initialized with model: ${this._model}, base URL: ${this._baseUrl}`);
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
   * Generate content using Ollama API with automatic retry.
   * @param {string} systemPrompt - System-level instructions
   * @param {string} userPrompt - User-level instructions
   * @param {Record<string, any>} [options] - Additional options
   * @returns {Promise<Record<string, any>>} Response with text, usage, and metrics
   * @throws {PseoError} If all retries exhaust
   */
  async generate(systemPrompt, userPrompt, options = {}) {
    if (!this._baseUrl || !this._model) {
      this._initialize();
    }

    const startTime = Date.now();
    let lastError = null;

    for (let attempt = 0; attempt < this._maxRetries; attempt++) {
      try {
        logger.debug('ollama-client', `Attempt ${attempt + 1}/${this._maxRetries} with model: ${this._model}`);

        const response = await fetch(`${this._baseUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: this._model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            stream: false,
            format: 'json',
            ...options
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          const error = new PseoError(
            ERROR_CODES.AI_FAIL,
            `Ollama API returned error status ${response.status}`,
            'ollama-client',
            'ERROR',
            'Verify Ollama is running and model is available.',
            { status: response.status, rawResponse: errorText }
          );
          error.details = { status: response.status };
          throw error;
        }

        const responseData = await response.json();
        const text = responseData?.message?.content;
        const inputTokens = responseData?.prompt_eval_count || 0;
        const outputTokens = responseData?.eval_count || 0;

        if (!text) {
          throw new PseoError(
            ERROR_CODES.AI_FAIL,
            'Empty response payload from Ollama API.',
            'ollama-client',
            'ERROR',
            'Check request content parameters or verify model status.'
          );
        }

        const durationMs = Date.now() - startTime;

        logger.info('ollama-client', `Successfully generated content. Tokens: ${inputTokens + outputTokens}, Duration: ${durationMs}ms`);

        return {
          text,
          usage: {
            inputTokens,
            outputTokens,
            estimatedCost: 0, // Local model, no cost
            model: this._model
          },
          durationMs
        };

      } catch (err) {
        lastError = err;
        logger.warn('ollama-client', `Attempt ${attempt + 1} failed: ${err.message}`);

        // Apply exponential backoff before retry
        if (attempt < this._maxRetries - 1) {
          const delay = this._calculateBackoff(attempt);
          logger.debug('ollama-client', `Waiting ${Math.round(delay)}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new PseoError(
      ERROR_CODES.AI_FAIL,
      `Ollama generation failed after ${this._maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}`,
      'ollama-client',
      'ERROR',
      'Check Ollama is running, model is available, and network connectivity.',
      { lastError }
    );
  }

  /**
   * Clear client cache (for testing or forced refresh).
   */
  clearCache() {
    this._baseUrl = null;
    this._model = null;
    this._retryCount = 0;
    logger.info('ollama-client', 'Client cache cleared.');
  }
}

export const ollamaClient = new OllamaClient();
