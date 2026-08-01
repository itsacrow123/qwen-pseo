import { execSync } from 'node:child_process';
import { configManager } from '../src/core/config-manager.js';
import { buildOrchestrator } from '../src/engines/build-orchestrator.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from .env file
dotenv.config();

/**
 * Parse command-line arguments for build filters
 * @returns {Object} Filter options
 */
function parseBuildFilters() {
  const args = process.argv.slice(2);
  const filters = {
    state: null,
    county: null,
    city: null,
  };

  for (const arg of args) {
    if (arg.startsWith('--state=')) {
      filters.state = arg.split('=')[1];
    } else if (arg.startsWith('--county=')) {
      filters.county = arg.split('=')[1];
    } else if (arg.startsWith('--city=')) {
      filters.city = arg.split('=')[1];
    }
  }

  return filters;
}

async function main() {
  console.log('=== Starting PSEO Build Pipeline ===');
  
  try {
    // Parse build filters from command line
    const filters = parseBuildFilters();
    
    if (filters.state) {
      console.log(`Filter: State = ${filters.state}`);
    }
    if (filters.county) {
      console.log(`Filter: County = ${filters.county}`);
    }
    if (filters.city) {
      console.log(`Filter: City = ${filters.city}`);
    }

    // Step 1: Execute generator pipeline with filters
    console.log('Step 1: Running content generation pipeline...');
    const summary = await buildOrchestrator.run('full', 'data/locations/usa', 'data/services', { filters });
    
    if (summary.failedCount > 0) {
      console.error(`Generation completed with ${summary.failedCount} failed pages.`);
      process.exit(1);
    }
    
    console.log(`Generation complete: ${summary.successCount} pages generated successfully.`);
    
    // Step 2: Execute Eleventy build
    console.log('Step 2: Running Eleventy static site build...');
    execSync('npx @11ty/eleventy', { 
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..')
    });
    
    console.log('=== PSEO Build Pipeline Complete ===');
    process.exit(0);
  } catch (err) {
    console.error('Build pipeline failed:', err.message);
    process.exit(1);
  }
}

main();
