import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import { datasetEngine } from '../../src/engines/dataset-engine.js';
import { knowledgeEngine } from '../../src/engines/knowledge-engine.js';
import { contextEngine } from '../../src/engines/context-engine.js';
import { writerEngine } from '../../src/engines/writer-engine.js';
import { seoEngine } from '../../src/engines/seo-engine.js';
import { generatorEngine } from '../../src/engines/generator-engine.js';
import { buildOrchestrator } from '../../src/engines/build-orchestrator.js';

describe('Generator & Build Orchestrator Tests', () => {
  let contextPacket;
  let contentModel;
  let seoModel;

  before(async () => {
    await datasetEngine.initialize('tests/fixtures/locations/usa', 'data/services');
    knowledgeEngine.clear();
    await knowledgeEngine.initialize();
    contextPacket = await contextEngine.buildContextPacket('TX', 'austin', 'termite-control');
    contentModel = await writerEngine.generatePageContent(contextPacket);
    seoModel = seoEngine.compileSeoModel(contentModel, contextPacket);
  });

  after(async () => {
    // Cleanup generated files
    await fs.unlink(path.resolve('src/pages/tx/austin-termite-control.html')).catch(() => {});
    await fs.rmdir(path.resolve('src/pages/tx')).catch(() => {});
    await fs.rmdir(path.resolve('src/pages')).catch(() => {});
    await fs.unlink(path.resolve('src/robots.txt')).catch(() => {});
  });

  describe('GeneratorEngine', () => {
    it('should generate page templates with Front Matter and HTML containers', async () => {
      await generatorEngine.generatePage(contentModel, seoModel, contextPacket);

      const filePath = path.resolve('src/pages/tx/austin-termite-control.html');
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      assert.strictEqual(fileExists, true);

      const content = await fs.readFile(filePath, 'utf8');
      assert.ok(content.includes('layout: main.njk'));
      assert.ok(content.includes('Austin'));
      assert.ok(content.includes('Termite Control'));
    });

    it('should generate robots.txt', async () => {
      await generatorEngine.generateRobots();

      const filePath = path.resolve('src/robots.txt');
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      assert.strictEqual(fileExists, true);

      const content = await fs.readFile(filePath, 'utf8');
      assert.ok(content.includes('User-agent: *'));
      assert.ok(content.includes('Sitemap:'));
    });
  });

  describe('BuildOrchestrator', () => {
    it('should run preview build successfully', async () => {
      // Set mock API key for testing to bypass environment validation
      process.env.GEMINI_API_KEY = 'test-api-key-for-testing';
      
      const summary = await buildOrchestrator.run(
        'preview', 
        'tests/fixtures/locations/usa', 
        'data/services'
      );

      assert.strictEqual(summary.totalTargets, 1);
      assert.strictEqual(summary.successCount, 1);
      assert.strictEqual(summary.failedCount, 0);
    });
  });
});
