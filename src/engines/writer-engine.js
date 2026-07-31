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
 * Implements automatic provider fallback: OpenAI → Claude → Gemini
 */
class WriterEngine {
  /**
   * Generates localized content models for a page.
   * Uses fallback chain: OpenAI → Claude → Gemini
   * @param {Record<string, any>} context - Validated Context Packet.
   * @returns {Promise<Record<string, any>>} Page content model.
   */
  async generatePageContent(context) {
    const { systemPrompt, userPrompt } = promptBuilder.buildWritePrompt(context);
    const modelName = configManager.get('provider.ai.primaryModel', 'gpt-4o');
    
    // Get the fallback chain of providers (OpenAI → Claude → Gemini)
    const providerChain = providerRegistry.getFallbackChain();
    
    logger.info('writer-engine', `Requesting content generation for target: "${context.seo.primaryKeyword}"...`);
    logger.info('writer-engine', `Provider fallback chain: ${providerChain.map(p => p.name).join(' → ')}`);

    let lastError = null;
    let result = null;
    
    // Try each provider in the fallback chain
    for (const { name: providerName, provider } of providerChain) {
      try {
        logger.info('writer-engine', `Attempting generation with provider: "${providerName}"`);
        
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
          
          logger.info('writer-engine', `Successfully generated content using provider: "${providerName}" for "${context.location.city}".`, {
            tokens: responsePayload.usage,
            durationMs: responsePayload.durationMs,
          });
          
          // Attach token usage, cost, and provider info for dashboard reporting layers
          parsedContent._metrics = {
            usage: responsePayload.usage,
            durationMs: responsePayload.durationMs,
            provider: providerName,
          };
          
          result = parsedContent;
          break; // Success! Exit the fallback loop
          
        } catch (parseErr) {
          logger.error('writer-engine', `Failed to parse AI output from "${providerName}" into valid content JSON structure.`, { rawText, error: parseErr });
          throw new PseoError(
            ERROR_CODES.AI_FAIL,
            `AI generated output from "${providerName}" failed JSON parsing: ${parseErr.message}`,
            'writer-engine',
            'ERROR',
            'Check prompt template syntax or verify model parameters.',
            { rawText, parseError: parseErr, provider: providerName }
          );
        }
        
      } catch (err) {
        lastError = err;
        
        // Check if this is a rate limit error that should trigger fallback
        if (providerRegistry.isRateLimitError(err)) {
          logger.warn('writer-engine', `Provider "${providerName}" returned rate limit/quota error (429/RESOURCE_EXHAUSTED). Switching to next provider in chain.`);
          continue; // Try next provider
        }
        
        // For non-rate-limit errors, log and try next provider anyway
        logger.warn('writer-engine', `Provider "${providerName}" failed: ${err.message}. Trying next provider.`);
      }
    }
    
    // If we've exhausted all providers
    if (!result) {
      logger.error('writer-engine', `All AI providers failed for "${context.location.city}". Build will continue but this page will be marked as failed.`);
      throw new PseoError(
        ERROR_CODES.AI_FAIL,
        `All AI providers exhausted. Last error: ${lastError?.message || 'Unknown error'}`,
        'writer-engine',
        'ERROR',
        'Check API keys, quotas, and network connectivity for all configured providers.',
        { lastError, attemptedProviders: providerChain.map(p => p.name) }
      );
    }
    
    return result;
  }
}

export const writerEngine = new WriterEngine();
