import { promptBuilder } from './prompt-builder.js';
import { ollamaClient } from '../adapters/ai/ollama-client.js';
import { logger } from '../core/logger.js';
import { PseoError, ERROR_CODES } from '../core/errors.js';

/**
 * Writer Engine managing content generation orchestration.
 */
class WriterEngine {
  /**
   * Generates localized content models for a page.
   * @param {Record<string, any>} context - Validated Context Packet.
   * @returns {Promise<Record<string, any>>} Page content model.
   */
  async generatePageContent(context) {
    const { systemPrompt, userPrompt } = promptBuilder.buildWritePrompt(context);

    logger.info('writer-engine', `Requesting content generation for target: "${context.seo.primaryKeyword}"...`);

    try {
      // Dispatch request through Ollama client with built-in retry
      const responsePayload = await ollamaClient.generate(systemPrompt, userPrompt);

      const rawText = responsePayload.text;

      try {
        const parsedContent = JSON.parse(rawText);

        // Essential structural validations
        if (!parsedContent.title || !parsedContent.content || !parsedContent.content.hero) {
          throw new Error('Missing essential page structure (title, content, or hero).');
        }

        logger.info('writer-engine', `Successfully generated content model for: "${context.location.city}".`, {
          tokens: responsePayload.usage,
          durationMs: responsePayload.durationMs,
        });

        // Attach token usage and cost for dashboard reporting layers
        parsedContent._metrics = {
          usage: responsePayload.usage,
          durationMs: responsePayload.durationMs,
        };

        return parsedContent;
      } catch (err) {
        logger.error('writer-engine', 'Failed to parse AI output into valid content JSON structure.', { rawText, error: err });
        throw new PseoError(
          ERROR_CODES.AI_FAIL,
          `AI generated output failed JSON parsing: ${err.message}`,
          'writer-engine',
          'ERROR',
          'Check prompt template syntax or verify model parameters.',
          { rawText, parseError: err }
        );
      }
    } catch (err) {
      // Re-throw Ollama client errors
      throw err;
    }
  }
}

export const writerEngine = new WriterEngine();
