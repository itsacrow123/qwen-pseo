/**
 * Illinois-Only Build Script
 * Generates pages for ALL Illinois cities only
 */

import { execSync } from 'node:child_process';
import { configManager } from '../src/core/config-manager.js';
import { buildOrchestrator } from '../src/engines/build-orchestrator.js';
import { datasetEngine } from '../src/engines/dataset-engine.js';
import { knowledgeEngine } from '../src/engines/knowledge-engine.js';
import { contextEngine } from '../src/engines/context-engine.js';
import { writerEngine } from '../src/engines/writer-engine.js';
import { reviewerEngine } from '../src/engines/reviewer-engine.js';
import { seoEngine } from '../src/engines/seo-engine.js';
import { generatorEngine } from '../src/engines/generator-engine.js';
import { sitemapEngine } from '../src/engines/sitemap-engine.js';
import { schemaEngine } from '../src/engines/schema-engine.js';
import { internalLinkEngine } from '../src/engines/internal-link-engine.js';
import { nearbyEngine } from '../src/engines/nearby-engine.js';
import { weatherAdapter } from '../src/adapters/weather/weather-adapter.js';
import { mapsAdapter } from '../src/adapters/maps/maps-adapter.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function buildIllinois() {
  const startTime = Date.now();
  
  console.log('=== Starting Illinois-Only Build ===');
  console.log(`Start Time: ${new Date().toISOString()}`);
  
  try {
    // Step 1: Validate config and initialize datasets
    console.log('\n[1/8] Validating configuration...');
    configManager.validate();
    
    console.log('[2/8] Loading Illinois datasets...');
    await datasetEngine.initialize('data/locations/usa', 'data/services');
    
    // Filter to Illinois only
    const illinoisCities = datasetEngine.getAllCities().filter(city => city.state === 'IL');
    const services = datasetEngine.getAllServices();
    
    console.log(`      Found ${illinoisCities.length} Illinois cities`);
    console.log(`      Found ${services.length} services`);
    
    if (illinoisCities.length === 0) {
      throw new Error('No Illinois cities found in dataset');
    }
    
    // Step 3: Initialize Knowledge Graph
    console.log('[3/8] Building Knowledge Graph...');
    knowledgeEngine.clear();
    await knowledgeEngine.initialize();
    
    // Step 4: Generate all pages
    console.log('[4/8] Generating pages for all Illinois cities...');
    const generatedPages = [];
    const failedPages = [];
    let pageCount = 0;
    
    // Create output directory structure
    const ilDir = path.resolve('src/pages/il');
    await fs.mkdir(ilDir, { recursive: true });
    
    for (const city of illinoisCities) {
      for (const service of services) {
        try {
          const targetKey = `${city.state}:${city.slug}:${service.id}`;
          
          // Build context packet
          const context = await contextEngine.buildContextPacket(
            city.state, 
            city.slug, 
            service.id
          );
          
          // Generate content via Ollama
          const contentModel = await writerEngine.generatePageContent(context);
          
          // Review content quality
          const audit = reviewerEngine.reviewPageContent(contentModel, context);
          
          if (!audit.passed) {
            throw new Error(`Quality gate failed (Score: ${audit.score})`);
          }
          
          // Compile SEO model with schemas
          const seoModel = seoEngine.compileSeoModel(contentModel, context);
          
          // Generate page file
          const outputPath = await generatorEngine.generatePage(contentModel, seoModel, context);
          
          generatedPages.push({
            state: city.state,
            city: city.city,
            service: service.name,
            outputPath,
            score: audit.score
          });
          
          pageCount++;
          
          if (pageCount % 10 === 0) {
            console.log(`      Generated ${pageCount} pages...`);
          }
          
        } catch (err) {
          failedPages.push({
            city: city.city,
            service: service.name,
            error: err.message
          });
          console.error(`      FAILED: ${city.city} - ${service.name}: ${err.message}`);
        }
      }
    }
    
    // Step 5: Generate robots.txt
    console.log('[5/8] Generating robots.txt...');
    await generatorEngine.generateRobots();
    
    // Step 6: Generate sitemap
    console.log('[6/8] Generating sitemap...');
    const sitemapPages = generatedPages.map(p => ({
      path: p.outputPath,
      lastmod: new Date().toISOString(),
      type: 'location',
      priority: 0.7,
      changefreq: 'monthly'
    }));
    
    const sitemapResult = await sitemapEngine.generate(sitemapPages);
    console.log(`      Sitemap generated: ${sitemapResult.urlCount} URLs`);
    
    // Step 7: Run Eleventy build
    console.log('[7/8] Running Eleventy static site build...');
    execSync('npx @11ty/eleventy', { 
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..')
    });
    
    // Step 8: Generate report
    console.log('[8/8] Generating build report...');
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const outputDir = path.resolve('output');
    
    const report = {
      summary: {
        illinoisCityCount: illinoisCities.length,
        serviceCount: services.length,
        totalTargets: illinoisCities.length * services.length,
        generatedPageCount: generatedPages.length,
        failedPageCount: failedPages.length,
        generationDuration: `${duration}s`,
        outputDirectory: outputDir,
        timestamp: new Date().toISOString()
      },
      generatedPages: generatedPages,
      failedPages: failedPages
    };
    
    // Save detailed report
    const reportPath = path.resolve('generated/reports/illinois-build-report.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    
    // Print summary
    console.log('\n');
    console.log('='.repeat(60));
    console.log('ILLINOIS BUILD COMPLETE');
    console.log('='.repeat(60));
    console.log(`Illinois City Count:     ${illinoisCities.length}`);
    console.log(`Service Count:           ${services.length}`);
    console.log(`Total Targets:           ${illinoisCities.length * services.length}`);
    console.log(`Generated Page Count:    ${generatedPages.length}`);
    console.log(`Failed Page Count:       ${failedPages.length}`);
    console.log(`Generation Duration:     ${duration}s`);
    console.log(`Output Directory:        ${outputDir}`);
    console.log(`Sitemap URLs:            ${sitemapResult.urlCount}`);
    console.log('='.repeat(60));
    console.log(`Build Report:            ${reportPath}`);
    console.log('='.repeat(60));
    console.log(`End Time:                ${new Date().toISOString()}`);
    console.log('='.repeat(60));
    
    if (failedPages.length > 0) {
      console.log('\n⚠️  Build completed with failures. See report for details.');
      process.exit(1);
    }
    
    console.log('\n✓ Build completed successfully!');
    process.exit(0);
    
  } catch (err) {
    console.error('\n❌ Build failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
