/**
 * API & Service Providers Configuration
 */
export default {
  // AI Inference & Review configuration
  // Note: Model selection is now centralized in provider-registry.js
  // Each provider uses its own default model (gpt-4o-mini for OpenAI, 
  // claude-3-5-sonnet-20240620 for Claude, gemini-2.5-flash for Gemini)
  ai: {
    primaryModel: 'gemini-2.5-flash',  // Default fallback (Gemini provider)
    secondaryModel: 'gemini-2.5-flash',
    apiKey: process.env.GEMINI_API_KEY || null,
    timeoutMs: 15000,
    maxRetries: 3,
  },

  // Third-Party data integration settings
  weather: {
    provider: 'mock', // Options: 'mock', 'open-weather'
    apiKey: process.env.WEATHER_API_KEY || null,
    enabled: true,
  },

  maps: {
    provider: 'mock', // Options: 'mock', 'google-maps'
    apiKey: process.env.MAPS_API_KEY || null,
    enabled: true,
  },

  // Target deployment configuration
  deployment: {
    platform: 'cloudflare-pages',
    projectName: 'apex-pest-pseo',
    apiToken: process.env.CLOUDFLARE_API_TOKEN || null,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || null,
  },
};
