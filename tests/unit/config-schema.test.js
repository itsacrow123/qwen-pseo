import { describe, it } from 'node:test';
import assert from 'node:assert';
import { configManager } from '../../src/core/config-manager.js';
import { SchemaValidator } from '../../src/core/schema-validator.js';
import { PseoError } from '../../src/core/errors.js';

describe('Configuration & Schema Validator Tests', () => {
  describe('ConfigManager', () => {
    it('should resolve configuration using dot notation', () => {
      const bizName = configManager.get('site.business.name');
      assert.strictEqual(bizName, 'Apex Pest Control');

      const primaryModel = configManager.get('provider.ai.primaryModel');
      assert.strictEqual(primaryModel, 'gemini-2.5-pro');

      const invalidVal = configManager.get('some.nonexistent.key', 'default-value');
      assert.strictEqual(invalidVal, 'default-value');
    });

    it('should validate current configuration successfully', () => {
      // Set mock API key for testing to bypass environment validation
      process.env.GEMINI_API_KEY = 'test-api-key-for-testing';
      
      const isValid = configManager.validate();
      assert.strictEqual(isValid, true);
    });

    it('should fail validation if required fields are missing', () => {
      // Temporarily overwrite configuration
      const originalName = configManager.site.business.name;
      configManager.site.business.name = '';

      assert.throws(
        () => configManager.validate(),
        (err) => err instanceof PseoError && err.code === 'ERR_CONFIG_INVALID'
      );

      // Restore
      configManager.site.business.name = originalName;
    });
  });

  describe('SchemaValidator', () => {
    it('should validate valid State structures and throw on invalid', () => {
      const validState = {
        name: 'Texas',
        abbreviation: 'TX',
        slug: 'texas',
        capital: 'Austin',
        population: 29145505,
      };

      assert.doesNotThrow(() => SchemaValidator.validateState(validState));

      const invalidState = {
        name: 'Texas',
        abbreviation: 'texas', // Too long
        slug: 'Texas_State', // Casing
        capital: 'Austin',
        population: 29145505,
      };

      assert.throws(
        () => SchemaValidator.validateState(invalidState),
        (err) => err instanceof PseoError && err.code === 'ERR_DATA_INVALID'
      );
    });

    it('should validate valid City structures and throw on invalid', () => {
      const validCity = {
        city: 'Austin',
        state: 'TX',
        county: 'Travis County',
        slug: 'austin',
        population: 961855,
        coordinates: {
          latitude: 30.2672,
          longitude: -97.7431,
        },
        zip_codes: ['78701', '78702'],
        nearby_cities: [
          { name: 'Round Rock', slug: 'round-rock', distance_miles: 15 },
        ],
      };

      assert.doesNotThrow(() => SchemaValidator.validateCity(validCity));

      const invalidCity = {
        city: 'Austin',
        state: 'TX',
        county: 'Travis County',
        slug: 'austin',
        population: 961855,
        coordinates: {
          latitude: '30.2672', // String not number
          longitude: -97.7431,
        },
        zip_codes: ['7870'], // Wrong ZIP format
      };

      assert.throws(
        () => SchemaValidator.validateCity(invalidCity),
        (err) => err instanceof PseoError && err.code === 'ERR_DATA_INVALID'
      );
    });

    it('should validate valid Service and FAQ structures', () => {
      const validService = {
        id: 'termite-control',
        name: 'Termite Control',
        slug: 'termite-control',
        description: 'Professional termite treatment services.',
      };

      const validFaq = {
        question: 'How often should I treat for pests?',
        answer: 'We recommend quarterly pest treatments for maximum protection.',
      };

      assert.doesNotThrow(() => SchemaValidator.validateService(validService));
      assert.doesNotThrow(() => SchemaValidator.validateFaq(validFaq));
    });
  });
});
