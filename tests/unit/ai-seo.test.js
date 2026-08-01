import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { datasetEngine } from '../../src/engines/dataset-engine.js';
import { knowledgeEngine } from '../../src/engines/knowledge-engine.js';
import { contextEngine } from '../../src/engines/context-engine.js';
import { writerEngine } from '../../src/engines/writer-engine.js';
import { reviewerEngine } from '../../src/engines/reviewer-engine.js';
import { schemaEngine } from '../../src/engines/schema-engine.js';
import { internalLinkEngine } from '../../src/engines/internal-link-engine.js';
import { seoEngine } from '../../src/engines/seo-engine.js';

describe('AI Writer & SEO Layer Tests', () => {
  let contextPacket;

  before(async () => {
    // Load datasets
    await datasetEngine.initialize('tests/fixtures/locations/usa', 'data/services');
    knowledgeEngine.clear();
    await knowledgeEngine.initialize();
    
    // Assemble context packet
    contextPacket = await contextEngine.buildContextPacket('TX', 'austin', 'termite-control');
  });

  describe('SiliconFlowClient & WriterEngine', () => {
    it('should generate content using SiliconFlow client', async () => {
      const content = await writerEngine.generatePageContent(contextPacket);
      
      assert.ok(content);
      assert.ok(content.content.hero.title);
      assert.ok(content.description);
    });
  });

  describe('ReviewerEngine', () => {
    it('should pass audit for clean mock content', async () => {
      const content = await writerEngine.generatePageContent(contextPacket);
      const audit = reviewerEngine.reviewPageContent(content, contextPacket);

      assert.strictEqual(audit.passed, true);
      assert.strictEqual(audit.score, 100);
      assert.strictEqual(audit.errors.length, 0);
    });

    it('should fail audit when local relevance is absent', async () => {
      const content = await writerEngine.generatePageContent(contextPacket);
      
      // Corrupt content removing city relevance
      const corruptContent = {
        ...content,
        title: 'Cheap Pest Services', // Missing "Austin"
        content: {
          ...content.content,
          localIntro: 'We serve generic locations across the country.', // Missing "Austin"
        }
      };

      const audit = reviewerEngine.reviewPageContent(corruptContent, contextPacket);
      assert.strictEqual(audit.passed, false);
      assert.ok(audit.errors.some(e => e.message.includes('Local relevance check failed')));
    });

    it('should fail audit when unapproved zip codes are injected', async () => {
      const content = await writerEngine.generatePageContent(contextPacket);
      
      // Inject unapproved zip code
      const corruptContent = {
        ...content,
        content: {
          ...content.content,
          localIntro: 'We serve residents located in 90210 ZIP code area.', // 90210 is unapproved for Austin TX
        }
      };

      const audit = reviewerEngine.reviewPageContent(corruptContent, contextPacket);
      assert.strictEqual(audit.passed, false);
      assert.ok(audit.errors.some(e => e.message.includes('unapproved ZIP code "90210"')));
    });
  });

  describe('Schema & Linking Engine', () => {
    it('should generate valid JSON-LD schemas', () => {
      const schemas = schemaEngine.generateSchemas(contextPacket);
      
      assert.ok(Array.isArray(schemas));
      assert.strictEqual(schemas.length, 4); // LocalBusiness, Service, Breadcrumb, FAQPage

      const localBiz = schemas.find(s => s['@type'] === 'LocalBusiness');
      assert.ok(localBiz);
      assert.strictEqual(localBiz.name, 'Apex Pest Control');
      assert.strictEqual(localBiz.telephone, '1-800-555-0199');

      const serviceSchema = schemas.find(s => s['@type'] === 'Service');
      assert.ok(serviceSchema);
      assert.strictEqual(serviceSchema.name, 'Termite Control in Austin');
    });

    it('should generate valid nearby links', () => {
      const links = internalLinkEngine.generateNearbyLinks(contextPacket);
      
      assert.ok(Array.isArray(links));
      assert.strictEqual(links.length, 1);
      assert.strictEqual(links[0].text, 'Termite Control in Dallas');
      assert.ok(links[0].url.endsWith('/tx/dallas-termite-control'));
    });

    it('should compile the complete SEO model', async () => {
      const content = await writerEngine.generatePageContent(contextPacket);
      const seoModel = seoEngine.compileSeoModel(content, contextPacket);

      assert.ok(seoModel.meta);
      assert.ok(seoModel.schemas);
      assert.ok(seoModel.links);
      assert.strictEqual(seoModel.meta.title, content.title);
    });
  });
});
