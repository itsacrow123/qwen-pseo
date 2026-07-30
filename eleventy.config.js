export default function (eleventyConfig) {
  eleventyConfig.setTemplateFormats(['njk', 'html']);
  eleventyConfig.addPassthroughCopy('assets');
  eleventyConfig.addWatchTarget('./src/assets');

  // Custom filter to find state by abbreviation
  eleventyConfig.addNunjucksFilter('findState', (states, stateAbbrev) => {
    if (!states || !Array.isArray(states)) return null;
    return states.find(s => s.abbreviation === stateAbbrev);
  });
  
  // Custom filter to find city by name within a state's cities array
  eleventyConfig.addNunjucksFilter('findCity', (cities, cityName) => {
    if (!cities || !Array.isArray(cities)) return null;
    return cities.find(c => c.city === cityName);
  });
  
  // Number formatting filter
  eleventyConfig.addNunjucksFilter('numberFormat', (num) => {
    if (typeof num !== 'number') return num;
    return num.toLocaleString();
  });

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
      
      async function collectPages(dir, relPathFromOutput = '') {
        const entries = await fs.default.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.default.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            // Build relative path: skip 'pages' prefix for location pages
            const newRelPath = relPathFromOutput 
              ? path.default.join(relPathFromOutput, entry.name)
              : entry.name;
            await collectPages(fullPath, newRelPath);
          } else if (entry.isFile() && entry.name.endsWith('.html')) {
            // Skip admin/dashboard pages from sitemap
            if (!relPathFromOutput.includes('generated/') && !entry.name.startsWith('_')) {
              pages.push({
                path: relPathFromOutput,
                lastmod: new Date().toISOString(),
                type: relPathFromOutput === 'index.html' ? 'home' : 'location',
                priority: relPathFromOutput === 'index.html' ? 1.0 : 0.7,
                changefreq: relPathFromOutput === 'index.html' ? 'daily' : 'monthly'
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
