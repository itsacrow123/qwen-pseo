import { AiProvider } from './ai-provider.js';
import { providerRegistry } from './provider-registry.js';
import { logger } from '../../core/logger.js';
import { PseoError, ERROR_CODES } from '../../core/errors.js';

/**
 * Adapter for Google Gemini API extending the base AiProvider interface.
 */
class GeminiAdapter extends AiProvider {
  /**
   * Executes a prompt request on the target model.
   * @param {string} systemPrompt - System context guidelines.
   * @param {string} userPrompt - Main target instructions.
   * @param {string} modelName - Model identifier.
   * @param {Record<string, any>} [options] - Additional configs.
   * @returns {Promise<Record<string, any>>} Unified AI output payload.
   */
  async generate(systemPrompt, userPrompt, modelName, options = {}) {
    const key = options.apiKey || process.env.GEMINI_API_KEY;
    const startTime = Date.now();

    if (!key) {
      logger.info('gemini-adapter', `No API key detected. Using development mock for model "${modelName}".`);
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

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`;

    const requestPayload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${systemPrompt}\n\nTask:\n${userPrompt}` }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
      }
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new PseoError(
          ERROR_CODES.AI_FAIL,
          `Gemini API returned error status ${response.status}`,
          'gemini-adapter',
          'ERROR',
          'Verify API key validity, billing status, and network connectivity.',
          { status: response.status, rawResponse: errorText }
        );
      }

      const responseData = await response.json();
      const text = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;
      const inputTokens = responseData?.usageMetadata?.promptTokenCount || 0;
      const outputTokens = responseData?.usageMetadata?.candidatesTokenCount || 0;

      if (!text) {
        throw new PseoError(
          ERROR_CODES.AI_FAIL,
          'Empty response payload from Gemini API.',
          'gemini-adapter',
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
        `Network request to Gemini failed: ${err.message}`,
        'gemini-adapter',
        'ERROR',
        'Check local DNS settings or network connection.',
        { error: err }
      );
    }
  }

  /**
   * Generates a mock JSON page content block matching the prompt's instructions.
   * @private
   */
  getMockResponse(userPrompt) {
    const serviceMatch = userPrompt.match(/Service: ([^\(]*)/);
    const cityMatch = userPrompt.match(/Target Location: ([^\(]*)/);
    const landmarksMatch = userPrompt.match(/Landmarks: (.*)/);
    const phoneMatch = userPrompt.match(/Contact Phone: (.*)/);

    const serviceName = serviceMatch ? serviceMatch[1].trim() : 'Pest Control';
    const cityAndState = cityMatch ? cityMatch[1].trim() : 'Austin, TX';
    const landmarks = landmarksMatch ? landmarksMatch[1].split(',').map(l => l.trim()) : [];
    const phone = phoneMatch ? phoneMatch[1].trim() : '1-800-555-0199';
    
    const [cityOnly] = cityAndState.split(',');

    const mockPayload = {
      title: `${serviceName} Services in ${cityAndState} | Apex Pest Control`,
      description: `Need professional ${serviceName.toLowerCase()} in ${cityOnly}? Apex Pest Control provides local inspections and rodent/pest treatment programs. Contact us at ${phone}.`,
      content: {
        hero: {
          title: `Reliable ${serviceName} in ${cityAndState}`,
          subtitle: `Protect your home and family with local, eco-friendly treatment plans in ${cityOnly}.`,
          ctaText: `Schedule ${serviceName} Now - Call ${phone}`
        },
        localIntro: `Apex Pest Control provides specialized ${serviceName.toLowerCase()} services tailored to ${cityOnly}'s humid environment and local climate conditions. Our experienced professionals deal with the specific regional threats that target the ${landmarks[0] || 'local neighborhood'} and surrounding communities.`,
        serviceDetails: [
          `Full localized inspection of crawlspaces and structural foundations in ${cityOnly}.`,
          `Eco-friendly chemical barriers targeting local pest species.`,
          `Comprehensive maintenance checkups and exclusion repairs.`
        ],
        nearbyExclusion: `Our service range extends beyond ${cityOnly} proper. We offer reliable, on-call service windows to homeowners located throughout the region.`,
        faqs: [
          {
            question: `Is ${serviceName.toLowerCase()} safe for family and pets?`,
            answer: `Yes, all treatments we employ in ${cityOnly} follow strict EPA safety rules and utilize organic barriers where applicable.`
          },
          {
            question: `How fast can Apex respond for a ${serviceName.toLowerCase()} emergency?`,
            answer: `We provide same-day inspections for urgent situations throughout the county service area.`
          },
          {
            question: `Do you offer warranties on your treatments?`,
            answer: `We provide a 100% satisfaction guarantee with free re-treatments if pests return within 90 days.`
          }
        ]
      }
    };

    return JSON.stringify(mockPayload);
  }
}

export const geminiAdapter = new GeminiAdapter();
// Conditional registration based on API key availability
if (process.env.GEMINI_API_KEY?.trim()) {
  providerRegistry.register('gemini', geminiAdapter);
} else {
  logger.info('gemini-adapter', 'Skipped Gemini (missing API key)');
}
