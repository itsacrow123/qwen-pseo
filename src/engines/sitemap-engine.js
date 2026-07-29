/**
 * Module: Sitemap Engine
 * Purpose: Generate XML sitemap for search engine discovery
 * Responsibilities:
 *   - Collect all generated page URLs
 *   - Build sitemap.xml with proper structure
 *   - Include lastmod, changefreq, and priority
 *   - Support sitemap index for large sites
 * Dependencies:
 *   - Config Manager
 *   - Knowledge Engine
 *   - Generator Engine
 */

import { configManager } from '../core/config-manager.js';
import { logger } from '../core/logger.js';
import { PseoError, ERROR_CODES } from '../core/errors.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export class SitemapEngine {
  /**
   * Create sitemap engine instance
   */
  constructor() {
    this.baseUrl = configManager.get('seo.canonicalDomain', 'https://example.com');
    this.outputDir = configManager.get('app.outputDir', './output');
    this.sitemapPath = path.join(this.outputDir, 'sitemap.xml');
  }

  /**
   * Generate complete sitemap from built pages
   * @param {Array} pages - Array of page metadata objects
   * @returns {Promise<{success: boolean, urlCount: number, path: string}>}
   */
  async generate(pages) {
    const module = 'SitemapEngine';
    
    try {
      logger.info(module, 'Starting sitemap generation', { 
        pageCount: pages.length,
        baseUrl: this.baseUrl 
      });

      if (!pages || pages.length === 0) {
        logger.warning(module, 'No pages provided for sitemap');
        return {
          success: false,
          urlCount: 0,
          path: this.sitemapPath,
          error: 'No pages provided'
        };
      }

      // Build sitemap XML
      const xmlParts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ''
      ];

      let urlCount = 0;
      const processedUrls = new Set();

      for (const page of pages) {
        try {
          const urlEntry = this.buildUrlEntry(page);
          if (urlEntry && !processedUrls.has(urlEntry.loc)) {
            xmlParts.push(urlEntry);
            processedUrls.add(urlEntry.loc);
            urlCount++;
          }
        } catch (pageError) {
          logger.error(module, `Failed to process page ${page.path}: ${pageError.message}`);
        }
      }

      xmlParts.push('</urlset>');
      xmlParts.push('');

      const sitemapXml = xmlParts.join('\n');

      // Ensure output directory exists
      await fs.mkdir(this.outputDir, { recursive: true });

      // Write sitemap file
      await fs.writeFile(this.sitemapPath, sitemapXml, 'utf-8');

      logger.info(module, 'Sitemap generated successfully', {
        urlCount,
        path: this.sitemapPath,
        fileSizeBytes: sitemapXml.length
      });

      return {
        success: true,
        urlCount,
        path: this.sitemapPath,
        fileSizeBytes: sitemapXml.length
      };
    } catch (error) {
      logger.error(module, `Sitemap generation failed: ${error.message}`, {
        stack: error.stack
      });
      throw new PseoError(
        ERROR_CODES.SYS_FAIL,
        `Sitemap generation failed: ${error.message}`,
        { module: 'SitemapEngine', originalError: error }
      );
    }
  }

  /**
   * Build XML URL entry for a page
   * @param {Object} page - Page metadata
   * @returns {string|null} XML string or null if invalid
   */
  buildUrlEntry(page) {
    if (!page || !page.path) {
      return null;
    }

    // Extract relative path and convert to URL
    let relativePath = page.path;
    
    // Remove leading slashes and output directory references
    relativePath = relativePath.replace(/^\/+/, '');
    relativePath = relativePath.replace(/^output\//, '');
    relativePath = relativePath.replace(/^\.?\//, '');
    
    // Remove src/pages prefix if present (for Eleventy builds)
    relativePath = relativePath.replace(/^src\/pages\//, '');
    
    // Ensure index.html paths become directory URLs
    if (relativePath.endsWith('/index.html')) {
      relativePath = relativePath.slice(0, -'index.html'.length);
    } else if (relativePath.endsWith('.html')) {
      // Convert .html files to directory structure
      // e.g., "ak/anchorage-termite-control.html" -> "ak/anchorage-termite-control/"
      relativePath = relativePath.replace(/\.html$/, '/');
    }

    // Build full URL
    const baseUrl = this.baseUrl.replace(/\/$/, '');
    const loc = `${baseUrl}/${relativePath}`.replace(/\/+/g, '/');

    // Skip if URL is invalid
    try {
      new URL(loc);
    } catch {
      return null;
    }

    // Build XML entry
    const parts = ['  <url>', `    <loc>${this.escapeXml(loc)}</loc>`];

    // Add lastmod if available
    if (page.lastmod) {
      const lastmod = this.formatDate(page.lastmod);
      if (lastmod) {
        parts.push(`    <lastmod>${lastmod}</lastmod>`);
      }
    } else if (page.modifiedAt) {
      const lastmod = this.formatDate(page.modifiedAt);
      if (lastmod) {
        parts.push(`    <lastmod>${lastmod}</lastmod>`);
      }
    } else {
      // Use current date as fallback
      const today = new Date().toISOString().split('T')[0];
      parts.push(`    <lastmod>${today}</lastmod>`);
    }

    // Add changefreq based on page type
    const changefreq = page.changefreq || this.inferChangeFrequency(page);
    parts.push(`    <changefreq>${changefreq}</changefreq>`);

    // Add priority based on page type
    const priority = page.priority || this.inferPriority(page);
    parts.push(`    <priority>${priority.toFixed(1)}</priority>`);

    parts.push('  </url>');

    return parts.join('\n');
  }

  /**
   * Infer change frequency from page type
   * @param {Object} page - Page metadata
   * @returns {string} Change frequency value
   */
  inferChangeFrequency(page) {
    const pageType = page.type || 'location';
    
    const frequencyMap = {
      'home': 'daily',
      'homepage': 'daily',
      'location': 'monthly',
      'service': 'weekly',
      'blog': 'weekly',
      'faq': 'monthly',
      'about': 'yearly',
      'contact': 'yearly'
    };

    return frequencyMap[pageType] || 'monthly';
  }

  /**
   * Infer priority from page type
   * @param {Object} page - Page metadata
   * @returns {number} Priority value (0.0-1.0)
   */
  inferPriority(page) {
    const pageType = page.type || 'location';
    const isHomepage = page.isHomepage || page.path === 'index.html' || page.path === '/';
    
    if (isHomepage) {
      return 1.0;
    }

    const priorityMap = {
      'home': 1.0,
      'homepage': 1.0,
      'service': 0.8,
      'location': 0.7,
      'blog': 0.6,
      'faq': 0.5,
      'about': 0.4,
      'contact': 0.3
    };

    return priorityMap[pageType] || 0.5;
  }

  /**
   * Format date for sitemap
   * @param {string|Date} date - Date to format
   * @returns {string|null} ISO date string or null
   */
  formatDate(date) {
    if (!date) {
      return null;
    }

    try {
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) {
        return null;
      }
      return d.toISOString().split('T')[0];
    } catch {
      return null;
    }
  }

  /**
   * Escape special XML characters
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeXml(str) {
    if (!str) {
      return '';
    }
    
    const replacements = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;'
    };

    return str.replace(/[&<>"']/g, char => replacements[char]);
  }

  /**
   * Generate sitemap index for multiple sitemaps
   * @param {Array} sitemapUrls - Array of sitemap URLs
   * @returns {Promise<{success: boolean, path: string}>}
   */
  async generateIndex(sitemapUrls) {
    const module = 'SitemapEngine';
    
    try {
      logger.info(module, 'Generating sitemap index', { 
        sitemapCount: sitemapUrls.length 
      });

      if (!sitemapUrls || sitemapUrls.length === 0) {
        throw new PseoError(
          ERROR_CODES.VALIDATION_FAIL,
          'No sitemap URLs provided for index',
          { module: 'SitemapEngine' }
        );
      }

      const xmlParts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ''
      ];

      const today = new Date().toISOString().split('T')[0];

      for (const url of sitemapUrls) {
        xmlParts.push('  <sitemap>');
        xmlParts.push(`    <loc>${this.escapeXml(url)}</loc>`);
        xmlParts.push(`    <lastmod>${today}</lastmod>`);
        xmlParts.push('  </sitemap>');
      }

      xmlParts.push('</sitemapindex>');
      xmlParts.push('');

      const indexPath = path.join(this.outputDir, 'sitemap-index.xml');
      await fs.writeFile(indexPath, xmlParts.join('\n'), 'utf-8');

      logger.info(module, 'Sitemap index generated', {
        path: indexPath,
        sitemapCount: sitemapUrls.length
      });

      return {
        success: true,
        path: indexPath,
        sitemapCount: sitemapUrls.length
      };
    } catch (error) {
      logger.error(module, `Sitemap index generation failed: ${error.message}`);
      throw new PseoError(
        ERROR_CODES.SYS_FAIL,
        `Sitemap index generation failed: ${error.message}`,
        { module: 'SitemapEngine', originalError: error }
      );
    }
  }
}

// Singleton export
export const sitemapEngine = new SitemapEngine();
