import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../core/logger.js';
import { PseoError, ERROR_CODES } from '../core/errors.js';
import { slugify } from '../core/utils.js';
import { configManager } from '../core/config-manager.js';

/**
 * Generator Engine compiling parsed page models into Nunjucks templates inside src/pages.
 */
class GeneratorEngine {
  /**
   * Generates a template file under src/pages/{state}/{city}-{service}.html.
   * @param {Record<string, any>} contentModel - Generated AI content.
   * @param {Record<string, any>} seoModel - Compiled SEO model details.
   * @param {Record<string, any>} context - Original Context Packet.
   */
  async generatePage(contentModel, seoModel, context) {
    const stateAbbrev = context.location.state.toLowerCase();
    const citySlug = slugify(context.location.city);
    const serviceSlug = slugify(context.service.name);

    const targetDir = path.resolve('src/pages', stateAbbrev);
    const targetPath = path.join(targetDir, `${citySlug}-${serviceSlug}.html`);

    logger.info('generator-engine', `Rendering page template: ${targetPath}`);

    const primaryColor = configManager.get('site.theme.primaryColor', '#0c4a6e');
    const secondaryColor = configManager.get('site.theme.secondaryColor', '#f59e0b');

    // Assemble dynamic widgets and layout parameters
    const tempWeather = {
      data: {
        climate: {
          temp: context.widgets?.weather?.data?.climate?.temp || 'N/A',
          pestRisk: context.widgets?.weather?.data?.climate?.pestRisk || 'N/A'
        }
      }
    };

    const tempMaps = {
      iframeHtml: context.widgets?.maps?.iframeHtml || ''
    };

    // Construct Front Matter using Block Literals (|) to ensure parsing safety
    const frontMatter = `---
layout: main.njk
title: |
  ${seoModel.meta.title.trim()}
description: |
  ${seoModel.meta.description.trim()}
canonicalUrl: |
  ${seoModel.meta.canonicalUrl.trim()}
theme:
  primaryColor: |
    ${primaryColor}
  secondaryColor: |
    ${secondaryColor}
business:
  name: |
    ${context.business.name}
  legalName: |
    ${context.business.legalName}
  phone: |
    ${context.business.phone}
  licenseNumber: |
    ${context.business.licenseNumber}
  address:
    streetAddress: |
      ${context.business.address.streetAddress}
    addressLocality: |
      ${context.business.address.addressLocality}
    addressRegion: |
      ${context.business.address.addressRegion}
    postalCode: |
      ${context.business.address.postalCode}
location:
  city: |
    ${context.location.city}
  state: |
    ${context.location.state}
hero:
  title: |
    ${contentModel.content.hero.title.trim()}
  subtitle: |
    ${contentModel.content.hero.subtitle.trim()}
  ctaText: |
    ${contentModel.content.hero.ctaText.trim()}
localIntro: |
  ${contentModel.content.localIntro.trim()}
serviceDetails:
${contentModel.content.serviceDetails.map(d => `  - |\n    ${d.trim()}`).join('\n')}
nearbyExclusion: |
  ${contentModel.content.nearbyExclusion.trim()}
faqs:
${contentModel.content.faqs.map(f => `  - question: |\n      ${f.question.trim()}\n    answer: |\n      ${f.answer.trim()}`).join('\n')}
widgets:
  weather:
    data:
      climate:
        temp: |
          ${tempWeather.data.climate.temp}
        pestRisk: |
          ${tempWeather.data.climate.pestRisk}
  maps:
    iframeHtml: |
      ${tempMaps.iframeHtml}
schemas: |
  ${JSON.stringify(seoModel.schemas, null, 2).replace(/\n/g, '\n  ')}
copyrightYear: ${new Date().getFullYear()}
---`;

    // Render modular layouts using Nunjucks includes OR use new unified template
    // Check if we should use the new rich location template
    const useRichTemplate = configManager.get('features.richTemplates', false);
    
    let htmlBody;
    
    if (useRichTemplate) {
      // Use the new comprehensive location-template.njk directly
      htmlBody = `\n{% include "location-template.njk" %}\n`;
    } else {
      // Legacy modular approach
      htmlBody = `\n{% include "hero.njk" %}\n{% include "localIntro.njk" %}\n{% include "serviceDetails.njk" %}\n{% include "nearbyExclusion.njk" %}\n{% include "faqs.njk" %}\n{% include "widgets.njk" %}\n`;
    }

    const fullFileContent = `${frontMatter}\n${htmlBody}`;

    try {
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(targetPath, fullFileContent, 'utf8');
      logger.info('generator-engine', `Page written successfully: ${targetPath}`);
      return targetPath;
    } catch (err) {
      throw new PseoError(
        ERROR_CODES.GEN_FAIL,
        `Failed to write static template file: ${err.message}`,
        'generator-engine',
        'ERROR',
        'Verify filesystem write permissions.',
        { error: err }
      );
    }
  }

  /**
   * Generates robots.txt rules under src/robots.txt.
   */
  async generateRobots() {
    const targetPath = path.resolve('src/robots.txt');
    const canonicalDomain = configManager.get('seo.canonicalDomain', 'https://dev-preview.enterprise-pseo.pages.dev');
    const content = `User-agent: *
Allow: /

Sitemap: ${canonicalDomain}/sitemap.xml
`;
    await fs.writeFile(targetPath, content, 'utf8');
    logger.info('generator-engine', 'robots.txt file generated.');
  }
}

export const generatorEngine = new GeneratorEngine();
