import { AiProvider } from './ai-provider.js';
import { providerRegistry } from './provider-registry.js';
import { logger } from '../../core/logger.js';
import { PseoError, ERROR_CODES } from '../../core/errors.js';

/**
 * Adapter for OpenAI Chat Completion API.
 */
class OpenaiAdapter extends AiProvider {
  /**
   * Executes prompt generation using GPT models.
   * @param {string} systemPrompt - System instruction.
   * @param {string} userPrompt - User instruction.
   * @param {string} modelName - Model name (e.g. 'gpt-4o' or 'gpt-4o-mini').
   * @param {Record<string, any>} [options] - Additional configs.
   * @returns {Promise<Record<string, any>>}
   */
  async generate(systemPrompt, userPrompt, modelName, options = {}) {
    const key = options.apiKey || process.env.OPENAI_API_KEY;
    const startTime = Date.now();

    if (!key) {
      logger.info('openai-adapter', `No API key detected. Using development mock for model "${modelName}".`);
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

    const endpoint = 'https://api.openai.com/v1/chat/completions';
    const requestPayload = {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' }
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new PseoError(
          ERROR_CODES.AI_FAIL,
          `OpenAI API returned error status ${response.status}`,
          'openai-adapter',
          'ERROR',
          'Verify API key validity, billing status, and network connectivity.',
          { status: response.status, rawResponse: errorText }
        );
      }

      const responseData = await response.json();
      const text = responseData?.choices?.[0]?.message?.content;
      const inputTokens = responseData?.usage?.prompt_tokens || 0;
      const outputTokens = responseData?.usage?.completion_tokens || 0;

      if (!text) {
        throw new PseoError(
          ERROR_CODES.AI_FAIL,
          'Empty response payload from OpenAI API.',
          'openai-adapter',
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
        `Network request to OpenAI failed: ${err.message}`,
        'openai-adapter',
        'ERROR',
        'Check local DNS settings or network connection.',
        { error: err }
      );
    }
  }
}

export const openaiAdapter = new OpenaiAdapter();
providerRegistry.register('openai', openaiAdapter);
