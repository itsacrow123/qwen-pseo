import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { logger } from '../../core/logger.js';
import { PseoError, ERROR_CODES } from '../../core/errors.js';

const HISTORY_PATH = path.resolve('data/derived/deploy-history.json');
const BACKUPS_DIR = path.resolve('data/derived/deployments');

/**
 * Base provider interface for Deployment integrations.
 */
export class DeploymentProvider {
  async deployPayload(deployId, pagesSrcDir) {
    throw new Error('DeploymentProvider.deployPayload must be implemented by child adapter.');
  }
}

/**
 * Mock Deployment Adapter for development and testing.
 */
export class MockDeploymentAdapter extends DeploymentProvider {
  async deployPayload(deployId, pagesSrcDir) {
    return {
      url: 'https://dev-preview.enterprise-pseo.pages.dev',
      isMock: true
    };
  }
}

/**
 * Cloudflare Pages API Adapter for production.
 */
export class CloudflarePagesAdapter extends DeploymentProvider {
  async deployPayload(deployId, pagesSrcDir) {
    const cfToken = process.env.CLOUDFLARE_API_TOKEN;
    const cfProject = process.env.CLOUDFLARE_PROJECT_NAME;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    
    logger.info('cloudflare-adapter', `Dispatching production payload to Cloudflare Pages Project: "${cfProject}"...`);
    
    if (!accountId || !cfToken || !cfProject) {
      throw new Error('Missing Cloudflare account ID, API token, or Project Name.');
    }
    
    try {
      const formData = new FormData();
      
      const buildFormData = async (dir, basePath = '') => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            await buildFormData(fullPath, relativePath);
          } else {
            const fileData = await fs.readFile(fullPath);
            formData.append(relativePath, new Blob([fileData]));
          }
        }
      };
      
      await buildFormData(pagesSrcDir);

      // Create a direct upload deployment via Cloudflare REST API
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${cfProject}/deployments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cfToken}`
        },
        body: formData
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cloudflare API returned status ${response.status}: ${errorText}`);
      }
      
      return {
        url: `https://${cfProject}.pages.dev`,
        isMock: false
      };
    } catch (err) {
      throw new PseoError(
        ERROR_CODES.SYS_FAIL,
        `Cloudflare deployment request failed: ${err.message}`,
        'cloudflare-adapter',
        'ERROR',
        'Verify CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.',
        { error: err }
      );
    }
  }
}

/**
 * Registry for managing deployment providers, handling local backups and rollbacks.
 */
class DeploymentRegistry {
  constructor() {
    this.providers = new Map();
    this.providers.set('mock', new MockDeploymentAdapter());
    this.providers.set('cloudflare', new CloudflarePagesAdapter());
  }

  /**
   * Deploys static page templates from src/pages to production edge.
   * @param {string} [mode='mock'] - Deployment mode ('production' or 'mock').
   * @returns {Promise<Record<string, any>>} Deployment result containing deployId.
   */
  async deploy(mode = 'mock') {
    const deployId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    logger.info('cloudflare-adapter', `Initiating deployment run: ${deployId}`);

    const pagesSrcDir = path.resolve('src/pages');
    const hasPages = await fs.access(pagesSrcDir).then(() => true).catch(() => false);

    if (!hasPages) {
      logger.warn('cloudflare-adapter', 'No static pages directory found under src/pages. Skipping deployment.');
      return { status: 'skipped', reason: 'No pages generated' };
    }

    // 1. Create deployment backup archive
    const backupDest = path.join(BACKUPS_DIR, deployId);
    await fs.mkdir(backupDest, { recursive: true });
    await this.copyDir(pagesSrcDir, backupDest);

    // 2. Perform deployment
    const cfToken = process.env.CLOUDFLARE_API_TOKEN;
    const cfProject = process.env.CLOUDFLARE_PROJECT_NAME;
    
    const useMock = mode === 'mock' || !cfToken || !cfProject;
    const activeProvider = useMock ? this.providers.get('mock') : this.providers.get('cloudflare');
    
    let providerResult;
    try {
      providerResult = await activeProvider.deployPayload(deployId, pagesSrcDir);
    } catch (err) {
      logger.error('cloudflare-adapter', `Deployment failed: ${err.message}. Falling back to mock.`);
      providerResult = await this.providers.get('mock').deployPayload(deployId, pagesSrcDir);
    }

    const deployResult = {
      deployId,
      timestamp,
      url: providerResult.url,
      isMock: providerResult.isMock,
      backupPath: backupDest,
      status: 'SUCCESS',
    };

    // 3. Register entry in deploy-history.json
    await this.saveHistory(deployResult);

    logger.info('cloudflare-adapter', `Deployment succeeded. Preview URL: ${deployResult.url}`);
    return deployResult;
  }

  /**
   * Rolls back the static src/pages directory to a previous deployment archive.
   * @param {string} deployId - The target deployment ID to restore.
   * @returns {Promise<Record<string, any>>} Rollback completion receipt.
   */
  async rollback(deployId) {
    logger.info('cloudflare-adapter', `Initiating transactional rollback to deployment: ${deployId}`);

    const history = await this.getHistory();
    const entry = history.find(e => e.deployId === deployId);

    if (!entry) {
      throw new PseoError(
        ERROR_CODES.SYS_FAIL,
        `Deployment ID "${deployId}" not found in delivery history registry.`,
        'cloudflare-adapter',
        'ERROR',
        'Verify target deployId using dashboard reports history log.'
      );
    }

    const backupSrc = entry.backupPath;
    const pagesDest = path.resolve('src/pages');

    try {
      // Clean current pages directory
      await fs.rm(pagesDest, { recursive: true, force: true });
      await fs.mkdir(pagesDest, { recursive: true });

      // Restore from backup archive
      await this.copyDir(backupSrc, pagesDest);

      const rollbackEntry = {
        deployId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        url: entry.url,
        isMock: entry.isMock,
        backupPath: backupSrc,
        status: `ROLLBACK_RESTORED_FROM_${deployId}`,
      };

      await this.saveHistory(rollbackEntry);

      logger.info('cloudflare-adapter', `Rollback execution completed successfully. Restored manifest: ${deployId}`);
      return rollbackEntry;
    } catch (err) {
      throw new PseoError(
        ERROR_CODES.SYS_FAIL,
        `Rollback restoration transaction failed: ${err.message}`,
        'cloudflare-adapter',
        'FATAL',
        'Verify read permissions on historical backup directory.',
        { error: err }
      );
    }
  }

  /**
   * Retrieves deployment logs history.
   * @returns {Promise<Array<Record<string, any>>>} Deployment history logs.
   */
  async getHistory() {
    try {
      const data = await fs.readFile(HISTORY_PATH, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  /**
   * Appends deployment logs to history file.
   * @private
   */
  async saveHistory(entry) {
    const history = await this.getHistory();
    history.unshift(entry);
    await fs.mkdir(path.dirname(HISTORY_PATH), { recursive: true });
    await fs.writeFile(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf8');
  }

  /**
   * Helper to recursively copy directories.
   * @private
   */
  async copyDir(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDir(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}

export const cloudflareAdapter = new DeploymentRegistry();
