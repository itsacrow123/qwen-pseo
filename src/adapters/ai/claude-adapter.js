import { AiProvider } from './ai-provider.js';
import { providerRegistry } from './provider-registry.js';
import { logger } from '../../core/logger.js';
import { PseoError, ERROR_CODES } from '../../core/errors.js';

/**
 * Adapter for Anthropic Claude Messaging API.
 */
class ClaudeAdapter extends AiProvider {
  /**
   * Executes prompt generation using Claude models.
   * @param {string} systemPrompt - System instruction.
   * @param {string} userPrompt - User instruction.
   * @param {string} modelName - Model name (e.g. 'claude-3-5-sonnet-20240620').
   * @param {Record<string, any>} [options] - Additional configs.
   * @returns {Promise<Record<string, any>>}
   */
  async generate(systemPrompt, userPrompt, modelName, options = {}) {
    const key = options.apiKey || process.env.ANTHROPIC_API_KEY;
    const startTime = Date.now();

    if (!key) {
      logger.info('claude-adapter', `No API key detected. Using development mock for model "${modelName}".`);
      const text = this.getMockResponse(userPrompt);
      const durationMs = Date.now() - startTime;
      const inputTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
      const outputTokens = Math.ceil(text.length / 4);
      const cost = this.calculateCost(modelName, inputTokens, outputTokens);

      return {
        text,
        usage: {
          inputTokens,
          outputTokens,
          estimatedCost: cost,
        },
        durationMs,
      };
    }

    const endpoint = 'https://api.anthropic.com/v1/messages';
    const requestPayload = {
      model: modelName,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new PseoError(
          ERROR_CODES.AI_FAIL,
          `Claude API returned error status ${response.status}`,
          'claude-adapter',
          'ERROR',
          'Verify API key validity, billing status, and network connectivity.',
          { status: response.status, rawResponse: errorText }
        );
      }

      const responseData = await response.json();
      const text = responseData?.content?.[0]?.text;
      const inputTokens = responseData?.usage?.input_tokens || 0;
      const outputTokens = responseData?.usage?.output_tokens || 0;

      if (!text) {
        throw new PseoError(
          ERROR_CODES.AI_FAIL,
          'Empty response payload from Claude API.',
          'claude-adapter',
          'ERROR',
          'Check request content parameters or verify model status.'
        );
      }

      const durationMs = Date.now() - startTime;
      const cost = this.calculateCost(modelName, inputTokens, outputTokens);

      return {
        text,
        usage: {
          inputTokens,
          outputTokens,
          estimatedCost: cost,
        },
        durationMs,
      };
    } catch (err) {
      if (err instanceof PseoError) throw err;
      throw new PseoError(
        ERROR_CODES.AI_FAIL,
        `Network request to Claude failed: ${err.message}`,
        'claude-adapter',
        'ERROR',
        'Check local DNS settings or network connection.',
        { error: err }
      );
    }
  }
}

export const claudeAdapter = new ClaudeAdapter();
providerRegistry.register('claude', claudeAdapter);
