/**
 * Abstract Base Class for hot-swappable AI Providers.
 * Ensures consistent inputs, outputs, error handling, and performance tracing.
 */
export class AiProvider {
  /**
   * Generates content based on structured prompts.
   * @param {string} systemPrompt - System-level prompt containing guidelines.
   * @param {string} userPrompt - User-level instructions.
   * @param {string} modelName - Model name.
   * @param {Record<string, any>} [options] - Generation configurations (MIME type, temperature, etc.).
   * @returns {Promise<Record<string, any>>} Standard response payload.
   */
  async generate(systemPrompt, userPrompt, modelName, options = {}) {
    throw new Error('AiProvider.generate must be implemented by child adapter.');
  }

  /**
   * Helper to estimate costs based on token count.
   * @protected
   */
  calculateCost(modelName, inputTokens, outputTokens) {
    const modelLower = modelName.toLowerCase();
    
    // Cost presets per 1K tokens
    let inputPrice = 0.00015; // default low cost
    let outputPrice = 0.0006;

    if (modelLower.includes('gemini-2.5-pro')) {
      inputPrice = 0.00125;
      outputPrice = 0.00375;
    } else if (modelLower.includes('gemini-2.5-flash')) {
      inputPrice = 0.000075;
      outputPrice = 0.0003;
    } else if (modelLower.includes('gpt-4o-mini')) {
      inputPrice = 0.00015;
      outputPrice = 0.0006;
    } else if (modelLower.includes('gpt-4o')) {
      inputPrice = 0.005;
      outputPrice = 0.015;
    } else if (modelLower.includes('claude-3-5-sonnet')) {
      inputPrice = 0.003;
      outputPrice = 0.015;
    }

    const inputCost = (inputTokens / 1000) * inputPrice;
    const outputCost = (outputTokens / 1000) * outputPrice;

    return parseFloat((inputCost + outputCost).toFixed(6));
  }

  /**
   * Generates a mock JSON page content block for development/testing.
   * Used when API keys are not configured.
   * @protected
   * @param {string} userPrompt - The user prompt to extract context from.
   * @returns {string} JSON string with mock page content.
   */
  getMockResponse(userPrompt) {
    const serviceMatch = userPrompt.match(/Service: ([^(]*)/);
    const cityMatch = userPrompt.match(/Target Location: ([^(]*)/);
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
