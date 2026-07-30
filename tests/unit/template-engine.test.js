import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generatorEngine } from '../../src/engines/generator-engine.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Enterprise Template Engine Tests', () => {
  it('should generate a template file utilizing Nunjucks partial inclusions', async () => {
    const contentModel = {
      content: {
        hero: {
          title: 'Premium Termite Control',
          subtitle: 'Best service',
          ctaText: 'Call Now'
        },
        localIntro: 'Serving regional suburbs.',
        serviceDetails: ['High quality treatment', 'Guaranteed barrier'],
        nearbyExclusion: 'Also servicing surrounding areas.',
        faqs: [
          { question: 'Safe?', answer: 'Yes' },
          { question: 'Warranty?', answer: 'Yes' }
        ]
      }
    };

    const seoModel = {
      meta: {
        title: 'Localized Pest Control | Dallas',
        description: 'Quality local pest control.',
        canonicalUrl: 'https://dev-preview.enterprise-pseo.pages.dev/tx/dallas'
      },
      schemas: [{ '@type': 'Service', 'name': 'Dallas Pest Control' }],
      links: []
    };

    const context = {
      business: {
        name: 'Apex Control',
        legalName: 'Apex Inc',
        phone: '1-800-555-0199',
        licenseNumber: 'TX-12',
        address: { streetAddress: '100 Main' }
      },
      location: {
        city: 'Dallas',
        state: 'TX'
      },
      service: {
        name: 'Pest Control'
      }
    };

    const filePath = await generatorEngine.generatePage(contentModel, seoModel, context);

    assert.ok(filePath);
    const content = await fs.readFile(filePath, 'utf8');
    
    // Validate yaml front-matter fields
    assert.ok(content.includes('layout: main.njk'));
    assert.ok(content.includes('Dallas'));

    // Validate Nunjucks component tags (now using comprehensive location-template.njk)
    assert.ok(content.includes('{% include "location-template.njk" %}'));
    assert.ok(content.includes('climate_zone') || content.includes('Common Pests'));

    // Clean up
    await fs.rm(filePath, { force: true });
  });
});
