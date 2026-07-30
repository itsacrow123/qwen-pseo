/**
 * Full Site Build Script
 * Generates pages for ALL 50 states, ALL cities, and ALL pest control services
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { datasetEngine } from '../src/engines/dataset-engine.js';
import { knowledgeEngine } from '../src/engines/knowledge-engine.js';
import { contextEngine } from '../src/engines/context-engine.js';
import { promptBuilder } from '../src/engines/prompt-builder.js';
import { writerEngine } from '../src/engines/writer-engine.js';
import { reviewerEngine } from '../src/engines/reviewer-engine.js';
import { seoEngine } from '../src/engines/seo-engine.js';
import { schemaEngine } from '../src/engines/schema-engine.js';
import { generatorEngine } from '../src/engines/generator-engine.js';
import { sitemapEngine } from '../src/engines/sitemap-engine.js';
import { logger } from '../src/core/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function buildFullSite() {
  const startTime = Date.now();
  
  console.log('🚀 Starting Full Site Build...\n');
  
  try {
    // Step 1: Load all datasets
    console.log('📊 Loading datasets...');
    await datasetEngine.initialize();
    console.log('   ✓ Datasets loaded\n');
    
    // Step 2: Build knowledge graph
    console.log('🧠 Building knowledge graph...');
    await knowledgeEngine.initialize();
    console.log('   ✓ Knowledge graph constructed\n');
    
    // Step 3: Get all state abbreviations from the cities directory
    const citiesDir = path.join(__dirname, '../data/locations/usa/cities');
    const cityFiles = await fs.readdir(citiesDir);
    const stateCodes = cityFiles
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', '').toUpperCase());
    
    const servicesData = await fs.readFile(
      path.join(__dirname, '../data/services/pest-control.json'),
      'utf-8'
    );
    const services = JSON.parse(servicesData);
    
    let totalPages = 0;
    let failedPages = 0;
    const sitemapUrls = [];
    
    // Step 4: Generate pages for each state/city/service combination
    for (const stateCode of stateCodes) {
      // Load cities for this state
      const citiesPath = path.join(__dirname, `../data/locations/usa/cities/${stateCode.toLowerCase()}.json`);
      let cities = [];
      
      try {
        const citiesData = await fs.readFile(citiesPath, 'utf-8');
        cities = JSON.parse(citiesData);
      } catch (err) {
        console.warn(`⚠️  No cities data for ${stateCode}`);
        continue;
      }
      
      if (totalPages === 0) {
        console.log(`\n📍 Processing ${stateCode} (${cities.length} cities)...`);
      }
      
      for (const city of cities) {
        for (const service of services) {
          try {
            // Build context packet
            const contextPacket = await contextEngine.compile({
              stateAbbrev: stateCode,
              cityName: city.city,
              serviceId: service.id
            });
            
            // Build prompt
            const prompt = await promptBuilder.build(contextPacket);
            
            // Generate content (use mock for speed in full build)
            const aiContent = await writerEngine.generate(prompt, { useMock: true });
            
            // Review content
            const reviewResult = await reviewerEngine.evaluate(aiContent, contextPacket);
            
            // Generate SEO metadata
            const seoData = await seoEngine.generateMetadata(contextPacket, aiContent);
            
            // Generate schema.org structured data
            const schemaData = await schemaEngine.generate(contextPacket, seoData);
            
            // Generate HTML page
            const pagePath = await generatorEngine.writePage({
              context: contextPacket,
              content: aiContent,
              seo: seoData,
              schema: schemaData,
              template: 'main'
            });
            
            totalPages++;
            sitemapUrls.push({
              path: pagePath.replace('output/', ''),
              lastmod: new Date().toISOString(),
              type: 'location',
              priority: 0.7,
              changefreq: 'monthly'
            });
            
            if (totalPages % 1000 === 0) {
              console.log(`   → Generated ${totalPages} pages...`);
            }
          } catch (err) {
            failedPages++;
            if (failedPages <= 5) {
              logger.error('build-full', `Failed to generate ${city.city}, ${stateCode} - ${service.name}: ${err.message}`);
            }
          }
        }
      }
    }
    
    // Step 5: Generate homepage
    console.log('\n🏠 Generating homepage...');
    const homepagePath = path.join(__dirname, '../src/index.njk');
    const homepageContent = await fs.readFile(homepagePath, 'utf-8');
    const homepageOutput = path.join(__dirname, '../output/index.html');
    await fs.mkdir(path.dirname(homepageOutput), { recursive: true });
    await fs.writeFile(homepageOutput, homepageContent);
    sitemapUrls.unshift({
      path: 'index.html',
      lastmod: new Date().toISOString(),
      type: 'home',
      priority: 1.0,
      changefreq: 'daily'
    });
    console.log('   ✓ Homepage created');
    
    // Step 6: Generate sitemap
    console.log('\n🗺️  Generating sitemap...');
    await sitemapEngine.generate(sitemapUrls);
    console.log('   ✓ Sitemap created');
    
    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n' + '='.repeat(60));
    console.log('✅ BUILD COMPLETE!');
    console.log('='.repeat(60));
    console.log(`📊 Total pages generated: ${totalPages}`);
    console.log(`❌ Failed pages: ${failedPages}`);
    console.log(`⏱️  Build time: ${duration}s`);
    console.log(`📁 Output directory: output/`);
    console.log('='.repeat(60));
    
    if (failedPages > 0) {
      console.log('\n⚠️  Some pages failed to generate. Check logs for details.');
    }
    
  } catch (error) {
    logger.error('build-full', `Build failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the build
buildFullSite();
