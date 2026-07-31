import { promptBuilder } from './prompt-builder.js';
import { providerRegistry } from '../adapters/ai/provider-registry.js';
import { queueManager } from '../adapters/ai/queue-manager.js';
import { logger } from '../core/logger.js';
import { PseoError, ERROR_CODES } from '../core/errors.js';
import { configManager } from '../core/config-manager.js';

// Import adapters to guarantee they register themselves on boot
import '../adapters/ai/gemini-adapter.js';
import '../adapters/ai/openai-adapter.js';
import '../adapters/ai/claude-adapter.js';

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

    // Get provider order and try each provider in sequence
    const providerOrder = providerRegistry.getProviderOrder();
    let lastError = null;

    for (let i = 0; i < providerOrder.length; i++) {
      const providerInfo = providerRegistry.getProviderByIndex(i);
      
      if (!providerInfo) {
        continue; // Skip unavailable providers
      }

      const { provider, name: providerName, modelName } = providerInfo;
      
      logger.info('writer-engine', `Provider = ${providerName}, Model = ${modelName}`);

      try {
        // Dispatch request through concurrency and rate limiting queue
        const responsePayload = await queueManager.enqueue(() =>
          provider.generate(systemPrompt, userPrompt, modelName)
        );

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
        lastError = err;
        
        // Check if this is a rate limit / quota error that should trigger failover
        if (providerRegistry.isRateLimitError(err)) {
          logger.warn('writer-engine', `${providerName} quota exceeded (HTTP ${err.details?.status || 'N/A'})`);
          
          // If there's another provider available, log the switch
          const nextProvider = providerRegistry.getProviderByIndex(i + 1);
          if (nextProvider) {
            logger.warn('writer-engine', `Switching to ${nextProvider.name}`);
          }
          
          // Continue to next provider
          continue;
        }
        
        // For non-rate-limit errors, throw immediately
        throw err;
      }
    }

    // All providers exhausted
    throw new PseoError(
      ERROR_CODES.AI_FAIL,
      `All AI providers failed. Last error: ${lastError?.message || 'Unknown error'}`,
      'writer-engine',
      'ERROR',
      'Check API key validity and service status for all configured providers.',
      { lastError }
    );
  }
}

export const writerEngine = new WriterEngine();
