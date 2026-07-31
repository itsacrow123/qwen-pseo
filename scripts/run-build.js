import { execSync } from 'node:child_process';
import { configManager } from '../src/core/config-manager.js';
import { buildOrchestrator } from '../src/engines/build-orchestrator.js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  console.log('=== Starting PSEO Build Pipeline ===');
  
  try {
    // Step 1: Execute generator pipeline
    console.log('Step 1: Running content generation pipeline...');
    const summary = await buildOrchestrator.run('full');
    
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
