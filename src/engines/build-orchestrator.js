import fs from 'node:fs/promises';
import path from 'node:path';
import { datasetEngine } from './dataset-engine.js';
import { validationEngine } from './validation-engine.js';
import { knowledgeEngine } from './knowledge-engine.js';
import { contextEngine } from './context-engine.js';
import { writerEngine } from './writer-engine.js';
import { reviewerEngine } from './reviewer-engine.js';
import { seoEngine } from './seo-engine.js';
import { generatorEngine } from './generator-engine.js';
import { sitemapEngine } from './sitemap-engine.js';
import { dashboardEngine } from './dashboard-engine.js';
import { buildCache } from './build-cache.js';
import { cloudflareAdapter } from '../adapters/deployment/cloudflare-adapter.js';
import { logger } from '../core/logger.js';
import { PseoError, ERROR_CODES } from '../core/errors.js';
import { configManager } from '../core/config-manager.js';
import { slugify } from '../core/utils.js';

const STATE_FILE_PATH = path.resolve('data/derived/build-state.json');
const FAILED_JOBS_PATH = path.resolve('data/derived/failed-jobs.json');

/**
 * Build Orchestrator managing parallel concurrent builds, incremental caches,
 * retries, progress resume markers, and sitemaps.
 */
class BuildOrchestrator {
  /**
   * Runs the programmatic compilation build.
   * @param {string} mode - 'validation-only' | 'preview' | 'full'
   * @param {string} [sourceLocs] - Custom locations folder.
   * @param {string} [sourceServices] - Custom services folder.
   * @param {Record<string, any>} [options] - Build configurations including filters.
   */
  async run(
    mode = 'full', 
    sourceLocs = 'data/locations/usa', 
    sourceServices = 'data/services',
    options = {}
  ) {
    const concurrency = options.concurrency || configManager.get('build.concurrency', 5);
    const maxRetries = options.maxRetries || configManager.get('build.maxRetries', 3);
    const resume = options.resume !== false;
    const onlyFailed = options.onlyFailed === true;
    const filters = options.filters || {};

    logger.info('build-orchestrator', `Starting build: mode="${mode}", concurrency=${concurrency}, maxRetries=${maxRetries}`);
    
    if (filters.state) {
      logger.info('build-orchestrator', `Applying state filter: ${filters.state}`);
    }
    if (filters.county) {
      logger.info('build-orchestrator', `Applying county filter: ${filters.county}`);
    }
    if (filters.city) {
      logger.info('build-orchestrator', `Applying city filter: ${filters.city}`);
    }

    // 1. Validate Config & Ingestion Registry
    configManager.validate();
    await datasetEngine.initialize(sourceLocs, sourceServices);

    const valReport = validationEngine.validateAll();
    if (valReport.status === 'FAIL') {
      throw new PseoError(
        ERROR_CODES.DATA_INVALID,
        'Source dataset validation failed. Halting build.',
        'build-orchestrator',
        'FATAL',
        'Check validation error logs and correct raw datasets.',
        { valReport }
      );
    }

    if (mode === 'validation-only') {
      logger.info('build-orchestrator', 'Validation only mode complete. No pages generated.');
      return { status: 'success', report: valReport };
    }

    // 2. Initialize Knowledge Graph
    knowledgeEngine.clear();
    await knowledgeEngine.initialize();

    // 3. Compile Target Permutations
    let targets = [];
    if (onlyFailed) {
      // Re-run only failed jobs from failed-jobs.json
      try {
        const rawFailed = await fs.readFile(FAILED_JOBS_PATH, 'utf8');
        targets = JSON.parse(rawFailed);
        logger.info('build-orchestrator', `Recovered ${targets.length} failed targets from job registry.`);
      } catch (err) {
        logger.warn('build-orchestrator', 'No failed jobs registry found. Starting clean build instead.');
      }
    }

    if (targets.length === 0) {
      const states = datasetEngine.getAllStates();
      const services = datasetEngine.getAllServices();
      
      // Apply state filter if provided
      let statesToProcess = states;
      if (filters.state) {
        const filteredState = states.find(s => s.abbreviation.toUpperCase() === filters.state.toUpperCase());
        if (!filteredState) {
          throw new PseoError(
            ERROR_CODES.DATA_INVALID,
            `State "${filters.state}" not found in dataset.`,
            'build-orchestrator',
            'ERROR',
            'Verify the state abbreviation matches a valid US state.'
          );
        }
        statesToProcess = [filteredState];
      }
      
      for (const state of statesToProcess) {
        const stateNode = await knowledgeEngine.getState(state.abbreviation);
        const stateCities = stateNode ? stateNode.cities : [];
        
        for (const city of stateCities) {
          // Apply county filter if provided
          if (filters.county) {
            const cityData = datasetEngine.getCity(city.slug);
            // Support both "Cook" and "Cook County" formats
            const countyMatch = filters.county.toLowerCase().includes('county') 
              ? cityData && cityData.county === filters.county
              : cityData && cityData.county.toLowerCase().includes(filters.county.toLowerCase());
            if (!countyMatch) {
              continue;
            }
          }
          
          // Apply city filter if provided
          if (filters.city) {
            if (city.slug.toLowerCase() !== filters.city.toLowerCase()) {
              continue;
            }
          }
          
          for (const service of services) {
            targets.push({
              state: state.abbreviation,
              city: city.slug,
              service: service.id,
            });
          }
        }
      }
      
      if (mode === 'preview' && targets.length > 0) {
        // For preview mode, only take the first target
        targets = [targets[0]];
      }
    }

    // 4. Resume State Check
    let startIndex = 0;
    if (resume && !onlyFailed) {
      try {
        const rawState = await fs.readFile(STATE_FILE_PATH, 'utf8');
        const savedState = JSON.parse(rawState);
        if (savedState.mode === mode && savedState.totalCount === targets.length) {
          startIndex = savedState.currentIndex;
          logger.info('build-orchestrator', `Resuming build from index: ${startIndex}/${targets.length}`);
        }
      } catch (err) {
        // Safe to ignore if build state is missing
      }
    }

    const targetsToProcess = targets.slice(startIndex);
    const generatedPages = [];
    const failedPages = [];
    const targetsDetail = [];
    let currentIndex = startIndex;

    // Load incremental cache registry
    await buildCache.load();

    // 5. Parallel Batch Execution
    await this.runConcurrentPool(
      concurrency,
      targetsToProcess,
      async (target) => {
        const targetKey = `${target.state}:${target.city}:${target.service}`;
        const checksum = buildCache.getTargetChecksum(target.state, target.city, target.service);

        // A. Incremental Cache validation check
        const isCached = await buildCache.isValid(targetKey, checksum);
        if (isCached) {
          logger.debug('build-orchestrator', `Incremental hit: Target "${targetKey}" is cached. Skipping generation.`);
          generatedPages.push(target);
          targetsDetail.push({
            state: target.state,
            city: target.city,
            service: target.service,
            status: 'PASS',
            score: 100,
            outputPath: `src/pages/${target.state.toLowerCase()}/${target.city}-${target.service}.html`,
            cached: true,
          });
          currentIndex++;
          await this.saveProgressState(mode, targets.length, currentIndex);
          return;
        }

        // B. Target Generation with Retry Loop
        let attempts = 0;
        let success = false;
        let targetError = null;
        let lastAudit = null;

        while (attempts < maxRetries && !success) {
          attempts++;
          try {
            const context = await contextEngine.buildContextPacket(target.state, target.city, target.service);
            const contentModel = await writerEngine.generatePageContent(context);
            const audit = reviewerEngine.reviewPageContent(contentModel, context);
            lastAudit = audit;

            if (!audit.passed) {
              throw new PseoError(
                ERROR_CODES.SYS_FAIL,
                `Quality Gate Rejected (Score: ${audit.score}).`,
                'build-orchestrator'
              );
            }

            const seoModel = seoEngine.compileSeoModel(contentModel, context);
            const outputPath = await generatorEngine.generatePage(contentModel, seoModel, context);
            
            // Register in Incremental cache
            buildCache.set(targetKey, checksum, outputPath);
            
            generatedPages.push(target);
            targetsDetail.push({
              state: target.state,
              city: context.location.city,
              service: context.service.name,
              status: 'PASS',
              score: audit.score,
              outputPath,
              cached: false,
              metrics: contentModel._metrics,
            });

            success = true;
          } catch (err) {
            targetError = err;
            logger.warn('build-orchestrator', `Attempt ${attempts}/${maxRetries} failed for target "${targetKey}": ${err.message}`);
            if (attempts < maxRetries) {
              await new Promise(res => setTimeout(res, 500)); // Delay between retries
            }
          }
        }

        if (!success) {
          failedPages.push({ target, reason: targetError.message });
          targetsDetail.push({
            state: target.state,
            city: target.city,
            service: target.service,
            status: 'FAIL',
            score: lastAudit ? lastAudit.score : 0,
            reason: targetError.message,
            outputPath: null,
            cached: false,
          });
          logger.error('build-orchestrator', `Failed compiling target "${targetKey}" after ${maxRetries} attempts.`, targetError);
        }

        currentIndex++;
        await this.saveProgressState(mode, targets.length, currentIndex);
      }
    );

    // 6. Build completion updates
    if (generatedPages.length > 0) {
      await generatorEngine.generateRobots();
      
      // Generate sitemap from all successfully generated pages
      const sitemapPages = targetsDetail
        .filter(t => t.status === 'PASS')
        .map(t => ({
          path: t.outputPath,
          lastmod: new Date().toISOString(),
          type: 'location',
          priority: 0.7,
          changefreq: 'monthly'
        }));
      
      const sitemapResult = await sitemapEngine.generate(sitemapPages);
      logger.info('build-orchestrator', `Sitemap generated: ${sitemapResult.urlCount} URLs`);
    }

    const summary = {
      mode,
      totalTargets: targets.length,
      successCount: generatedPages.length,
      failedCount: failedPages.length,
      failedPages,
    };

    // Save build caches & clean progress markers
    await buildCache.save();
    await fs.unlink(STATE_FILE_PATH).catch(() => {});

    // Save failed jobs queue for later recovery
    if (failedPages.length > 0) {
      const failedRawList = failedPages.map(fp => fp.target);
      await fs.writeFile(FAILED_JOBS_PATH, JSON.stringify(failedRawList, null, 2), 'utf8');
      logger.warn('build-orchestrator', `Saved ${failedPages.length} failed jobs to registry: "${FAILED_JOBS_PATH}"`);
    } else {
      await fs.unlink(FAILED_JOBS_PATH).catch(() => {});
    }

    // 7. Compile Reports & Deploy
    await dashboardEngine.generateReports(summary, targetsDetail);

    if (configManager.get('provider.deployment.enabled') === true) {
      await cloudflareAdapter.deploy();
    }

    logger.info('build-orchestrator', 'Build process finished.', summary);
    return summary;
  }

  /**
   * Helper implementing parallel concurrency pool worker.
   * @private
   */
  async runConcurrentPool(limit, tasks, fn) {
    const executing = new Set();
    for (const task of tasks) {
      const p = Promise.resolve().then(() => fn(task));
      executing.add(p);
      const clean = () => executing.delete(p);
      p.then(clean, clean);
      if (executing.size >= limit) {
        await Promise.race(executing);
      }
    }
    await Promise.all(executing);
  }

  /**
   * Saves local state progress markers.
   * @private
   */
  async saveProgressState(mode, totalCount, currentIndex) {
    try {
      const payload = {
        mode,
        totalCount,
        currentIndex,
        timestamp: new Date().toISOString(),
      };
      await fs.mkdir(path.dirname(STATE_FILE_PATH), { recursive: true });
      await fs.writeFile(STATE_FILE_PATH, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err) {
      // Non-blocking progress error
    }
  }
}

export const buildOrchestrator = new BuildOrchestrator();
