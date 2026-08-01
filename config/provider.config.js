/**
 * API & Service Providers Configuration
 */
export default {
  // AI Inference & Review configuration
  // Note: Model selection is handled automatically by siliconflow-client.js
  // using an internal priority list. DO NOT set SILICONFLOW_MODEL.
  
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
