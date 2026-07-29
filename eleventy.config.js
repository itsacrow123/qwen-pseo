export default function (eleventyConfig) {
  eleventyConfig.setTemplateFormats(['njk', 'html']);
  eleventyConfig.addPassthroughCopy('assets');
  eleventyConfig.addWatchTarget('./src/assets');

  // HTML, Inline CSS and JS Minification Transform
  eleventyConfig.addTransform("htmlMinifier", function (content) {
    if (this.page.outputPath && this.page.outputPath.endsWith(".html")) {
      let minified = content
        .replace(/<!--[\s\S]*?-->/g, "") // Remove HTML comments
        .replace(/>\s+</g, "><")         // Collapse whitespaces between tags
        .replace(/\s{2,}/g, " ");        // Collapse multiple spaces
      return minified;
    }
    return content;
  });

  // Sitemap generation on build complete
  eleventyConfig.on('afterBuild', async () => {
    try {
      const { sitemapEngine } = await import('./src/engines/sitemap-engine.js');
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      
      // Collect all generated pages from output directory
      const outputDir = path.default.resolve('output');
      const pages = [];
      
      async function collectPages(dir, baseRelPath = '') {
        const entries = await fs.default.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.default.join(dir, entry.name);
          const relPath = path.default.join(baseRelPath, entry.name);
          
          if (entry.isDirectory()) {
            await collectPages(fullPath, relPath);
          } else if (entry.isFile() && entry.name.endsWith('.html')) {
            // Skip admin/dashboard pages from sitemap
            if (!relPath.includes('generated/') && !relPath.startsWith('_')) {
              pages.push({
                path: relPath,
                lastmod: new Date().toISOString(),
                type: relPath === 'index.html' ? 'home' : 'location',
                priority: relPath === 'index.html' ? 1.0 : 0.7,
                changefreq: relPath === 'index.html' ? 'daily' : 'monthly'
              });
            }
          }
        }
      }
      
      await collectPages(outputDir);
      
      if (pages.length > 0) {
        const result = await sitemapEngine.generate(pages);
        console.log(`[11ty] Sitemap generated: ${result.urlCount} URLs`);
      }
    } catch (err) {
      console.error('[11ty] Sitemap generation failed:', err.message);
    }
  });

  return {
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk', // Force Nunjucks for HTML files
    dir: {
      input: 'src',
      output: 'output',
      includes: '_includes',
      layouts: '_layouts',
      data: '_data',
    },
  };
}
