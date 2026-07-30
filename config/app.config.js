/**
 * Application Engine Configuration
 */
export default {
  // Target environment: development, staging, production
  env: process.env.NODE_ENV || 'development',

  // Project unique identifier
  projectId: 'enterprise-pseo',

  // Directory mappings
  paths: {
    sourceData: 'data/source',
    derivedData: 'data/derived',
    outputDir: 'output',
    layoutsDir: 'src/_layouts',
    includesDir: 'src/_includes',
  },

  // Cache settings
  cache: {
    defaultTtlMs: 3600000, // 1 hour
    weatherTtlMs: 86400000, // 24 hours
    mapsTtlMs: 2592000000, // 30 days
  },

  // Concurrency controls for parallel generation batches
  build: {
    concurrencyLimit: 10,
    batchSize: 50,
  },
  
  // Feature flags
  features: {
    richTemplates: false,
    aiContentGeneration: true,
    automaticDeployment: false
  },
};
