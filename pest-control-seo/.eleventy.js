const { DateTime } = require("luxon");

module.exports = function(eleventyConfig) {
  // Pass through assets
  eleventyConfig.addPassthroughCopy("src/assets/css");
  eleventyConfig.addPassthroughCopy("src/assets/js");
  eleventyConfig.addPassthroughCopy("src/assets/images");
  
  // Watch JSON data files
  eleventyConfig.addWatchTarget("src/_data/");
  
  // Custom filters
  eleventyConfig.addFilter("dateFormat", (dateObj, format = "yyyy-MM-dd") => {
    return DateTime.fromJSDate(dateObj).toFormat(format);
  });
  
  eleventyConfig.addFilter("slugify", (str) => {
    if (!str) return "";
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  });
  
  eleventyConfig.addFilter("titleCase", (str) => {
    if (!str) return "";
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  });
  
  eleventyConfig.addFilter("jsonify", (obj) => {
    return JSON.stringify(obj);
  });
  
  // Generate nearby cities with distances
  eleventyConfig.addFilter("nearbyCities", (cities, currentCity, maxCount = 10) => {
    if (!cities || !currentCity) return [];
    
    const getDistance = (lat1, lon1, lat2, lon2) => {
      const R = 3959; // Earth radius in miles
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };
    
    return cities
      .filter(c => c.slug !== currentCity.slug)
      .map(c => ({
        ...c,
        distance: Math.round(getDistance(currentCity.lat, currentCity.lng, c.lat, c.lng))
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxCount);
  });
  
  // Get current season
  eleventyConfig.addFilter("getCurrentSeason", () => {
    const month = DateTime.now().month;
    if (month >= 3 && month <= 5) return "spring";
    if (month >= 6 && month <= 8) return "summer";
    if (month >= 9 && month <= 11) return "fall";
    return "winter";
  });
  
  // Format phone number
  eleventyConfig.addFilter("formatPhone", (phone) => {
    return phone.replace(/1-800-PEST-GO/, "1-800-737-846");
  });
  
  // Create collections
  eleventyConfig.addCollection("states", (collectionApi) => {
    return collectionApi.getFilteredByGlob("src/_data/states.json");
  });
  
  // Markdown processing
  eleventyConfig.setLibrary("md", {
    render: (str) => str
  });
  
  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    templateFormats: ["njk", "md", "html"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    pathPrefix: "/"
  };
};
