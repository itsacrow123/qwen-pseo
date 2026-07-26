/**
 * Location Data Generator
 * Generates comprehensive location data for all US states, counties, and cities
 */

const fs = require('fs');
const path = require('path');

// Complete US States Data
const statesData = [
  {
    "name": "Alabama",
    "abbreviation": "AL",
    "capital": "Montgomery",
    "population": 5024279,
    "area_sq_miles": 52420,
    "timezone": "America/Chicago",
    "climate_zone": "Humid Subtropical",
    "avg_temp_summer": 82,
    "avg_temp_winter": 48,
    "humidity_avg": 70,
    "rainfall_annual_inches": 56,
    "common_pests": ["fire-ants", "termites", "mosquitoes", "cockroaches", "spiders"],
    "pest_seasonality": {
      "spring": ["termites", "carpenter-ants", "mosquitoes"],
      "summer": ["fire-ants", "mosquitoes", "wasps", "ticks"],
      "fall": ["rodents", "spiders", "cockroaches"],
      "winter": ["mice", "cockroaches", "termites"]
    },
    "regional_factors": {
      "forests": "Extensive pine and hardwood forests",
      "water_bodies": "Gulf Coast, Tennessee River, Alabama River",
      "agriculture": "Cotton, peanuts, poultry",
      "urban_centers": "Birmingham, Montgomery, Mobile, Huntsville"
    }
  },
  {
    "name": "Alaska",
    "abbreviation": "AK",
    "capital": "Juneau",
    "population": 733391,
    "area_sq_miles": 665384,
    "timezone": "America/Anchorage",
    "climate_zone": "Subarctic/Arctic",
    "avg_temp_summer": 60,
    "avg_temp_winter": 10,
    "humidity_avg": 65,
    "rainfall_annual_inches": 22,
    "common_pests": ["mosquitoes", "rodents", "spiders", "carpenter-ants"],
    "pest_seasonality": {
      "spring": ["carpenter-ants", "spiders"],
      "summer": ["mosquitoes", "rodents"],
      "fall": ["rodents", "spiders"],
      "winter": ["mice", "spiders"]
    },
    "regional_factors": {
      "forests": "Boreal forest, temperate rainforest",
      "water_bodies": "Pacific Ocean, Bering Sea, countless lakes",
      "agriculture": "Limited, fishing industry dominant",
      "urban_centers": "Anchorage, Fairbanks, Juneau"
    }
  },
  {
    "name": "Arizona",
    "abbreviation": "AZ",
    "capital": "Phoenix",
    "population": 7151502,
    "area_sq_miles": 113990,
    "timezone": "America/Phoenix",
    "climate_zone": "Desert/Semi-arid",
    "avg_temp_summer": 95,
    "avg_temp_winter": 55,
    "humidity_avg": 30,
    "rainfall_annual_inches": 13,
    "common_pests": ["scorpions", "termites", "ants", "spiders", "rodents"],
    "pest_seasonality": {
      "spring": ["scorpions", "ants", "termites"],
      "summer": ["scorpions", "spiders", "ants"],
      "fall": ["rodents", "spiders", "scorpions"],
      "winter": ["rodents", "termites", "spiders"]
    },
    "regional_factors": {
      "forests": "Ponderosa pine forests in north",
      "water_bodies": "Colorado River, Salt River",
      "agriculture": "Cotton, lettuce, cattle",
      "urban_centers": "Phoenix, Tucson, Mesa, Chandler"
    }
  },
  {
    "name": "Arkansas",
    "abbreviation": "AR",
    "capital": "Little Rock",
    "population": 3011524,
    "area_sq_miles": 53179,
    "timezone": "America/Chicago",
    "climate_zone": "Humid Subtropical",
    "avg_temp_summer": 80,
    "avg_temp_winter": 45,
    "humidity_avg": 68,
    "rainfall_annual_inches": 50,
    "common_pests": ["termites", "fire-ants", "mosquitoes", "spiders", "rodents"],
    "pest_seasonality": {
      "spring": ["termites", "fire-ants", "mosquitoes"],
      "summer": ["mosquitoes", "fire-ants", "spiders"],
      "fall": ["rodents", "spiders", "cockroaches"],
      "winter": ["mice", "cockroaches", "termites"]
    },
    "regional_factors": {
      "forests": "Ozark National Forest, Ouachita National Forest",
      "water_bodies": "Mississippi River, Arkansas River",
      "agriculture": "Rice, soybeans, cotton, poultry",
      "urban_centers": "Little Rock, Fayetteville, Fort Smith"
    }
  },
  {
    "name": "California",
    "abbreviation": "CA",
    "capital": "Sacramento",
    "population": 39538223,
    "area_sq_miles": 163695,
    "timezone": "America/Los_Angeles",
    "climate_zone": "Mediterranean/Desert",
    "avg_temp_summer": 75,
    "avg_temp_winter": 50,
    "humidity_avg": 55,
    "rainfall_annual_inches": 23,
    "common_pests": ["termites", "ants", "rodents", "spiders", "bed-bugs"],
    "pest_seasonality": {
      "spring": ["termites", "ants", "spiders"],
      "summer": ["ants", "spiders", "rodents"],
      "fall": ["rodents", "spiders", "ants"],
      "winter": ["rodents", "termites", "spiders"]
    },
    "regional_factors": {
      "forests": "Redwood forests, Sierra Nevada forests",
      "water_bodies": "Pacific Ocean, Sacramento River, Colorado River",
      "agriculture": "Almonds, grapes, lettuce, dairy",
      "urban_centers": "Los Angeles, San Francisco, San Diego, San Jose"
    }
  }
];

// Sample cities for each state (in production, this would be a complete dataset)
const sampleCities = {
  AL: [
    { name: "Birmingham", slug: "birmingham", county: "Jefferson", lat: 33.5207, lng: -86.8025, population: 200733 },
    { name: "Montgomery", slug: "montgomery", county: "Montgomery", lat: 32.3668, lng: -86.3000, population: 200603 },
    { name: "Mobile", slug: "mobile", county: "Mobile", lat: 30.6954, lng: -88.0399, population: 187041 },
    { name: "Huntsville", slug: "huntsville", county: "Madison", lat: 34.7304, lng: -86.5861, population: 215006 }
  ],
  AK: [
    { name: "Anchorage", slug: "anchorage", county: "Anchorage", lat: 61.2181, lng: -149.9003, population: 291247 },
    { name: "Fairbanks", slug: "fairbanks", county: "Fairbanks North Star", lat: 64.8378, lng: -147.7164, population: 32515 },
    { name: "Juneau", slug: "juneau", county: "Juneau", lat: 58.3019, lng: -134.4197, population: 32255 }
  ],
  AZ: [
    { name: "Phoenix", slug: "phoenix", county: "Maricopa", lat: 33.4484, lng: -112.0740, population: 1608139 },
    { name: "Tucson", slug: "tucson", county: "Pima", lat: 32.2226, lng: -110.9747, population: 548073 },
    { name: "Mesa", slug: "mesa", county: "Maricopa", lat: 33.4152, lng: -111.8315, population: 504258 },
    { name: "Scottsdale", slug: "scottsdale", county: "Maricopa", lat: 33.4942, lng: -111.9261, population: 258069 }
  ],
  AR: [
    { name: "Little Rock", slug: "little-rock", county: "Pulaski", lat: 34.7465, lng: -92.2896, population: 198541 },
    { name: "Fayetteville", slug: "fayetteville", county: "Washington", lat: 36.0626, lng: -94.1574, population: 93268 },
    { name: "Fort Smith", slug: "fort-smith", county: "Sebastian", lat: 35.3859, lng: -94.3985, population: 88037 }
  ],
  CA: [
    { name: "Los Angeles", slug: "los-angeles", county: "Los Angeles", lat: 34.0522, lng: -118.2437, population: 3898747 },
    { name: "San Francisco", slug: "san-francisco", county: "San Francisco", lat: 37.7749, lng: -122.4194, population: 873965 },
    { name: "San Diego", slug: "san-diego", county: "San Diego", lat: 32.7157, lng: -117.1611, population: 1386932 },
    { name: "San Jose", slug: "san-jose", county: "Santa Clara", lat: 37.3382, lng: -121.8863, population: 1013240 }
  ]
};

// Pest descriptions database
const pestDescriptions = {
  "fire-ants": "Fire ants are aggressive stinging ants common in southern states. Their painful stings can cause allergic reactions in some people.",
  "termites": "Termites cause billions in property damage annually. They feed on wood and can compromise structural integrity if left untreated.",
  "mosquitoes": "Mosquitoes thrive in humid climates and standing water. They're not just annoying—they can transmit diseases like West Nile virus.",
  "cockroaches": "Cockroaches are resilient pests that contaminate food and trigger allergies. They thrive in warm, moist environments.",
  "spiders": "While most spiders are harmless, some species like black widows and brown recluses pose health risks.",
  "scorpions": "Scorpions are arachnids found in desert regions. Their venomous sting requires medical attention in severe cases.",
  "ants": "Common household ants invade homes seeking food and water. Different species require different treatment approaches.",
  "rodents": "Mice and rats carry diseases and cause property damage by gnawing on wires and structures.",
  "bed-bugs": "Bed bugs are hitchhiking pests that feed on human blood. They're notoriously difficult to eliminate without professional help.",
  "wasps": "Wasps build nests around homes and can sting repeatedly. Their nests pose dangers especially to those with allergies.",
  "ticks": "Ticks attach to humans and pets, potentially transmitting Lyme disease and other illnesses.",
  "fleas": "Fleas infest pets and homes, causing itchy bites and potential disease transmission.",
  "mice": "Mice enter homes through tiny openings, contaminating food and spreading diseases through droppings.",
  "carpenter-ants": "Carpenter ants tunnel through wood to create nests, potentially causing structural damage over time."
};

// Seasonal descriptions
function getSeasonalDescription(season, pests, state) {
  const descriptions = {
    spring: `Spring brings increased pest activity as temperatures rise in ${state.name}. ${pests.join(', ')} become active as they emerge from winter hiding spots.`,
    summer: `Summer is peak pest season in ${state.name}. Warm temperatures and humidity create ideal conditions for ${pests.join(', ')} to thrive and reproduce.`,
    fall: `As fall arrives in ${state.name}, pests like ${pests.join(', ')} seek shelter indoors to escape cooling temperatures.`,
    winter: `During winter in ${state.name}, many pests remain active indoors. ${pests.join(', ')} continue to seek food and warmth inside structures.`
  };
  return descriptions[season] || '';
}

// Generate full states data file
function generateStatesData() {
  const outputPath = path.join(__dirname, '../_data/states-full.json');
  
  // Add helper methods data
  const enrichedStates = statesData.map(state => ({
    ...state,
    _helpers: {
      getPestDescription: pestDescriptions,
      getSeasonalDescription: getSeasonalDescription
    }
  }));
  
  fs.writeFileSync(outputPath, JSON.stringify(enrichedStates, null, 2));
  console.log(`Generated ${outputPath}`);
}

// Generate cities data
function generateCitiesData() {
  const outputPath = path.join(__dirname, '../_data/cities.json');
  
  // Flatten cities into single array with state reference
  const allCities = [];
  Object.entries(sampleCities).forEach(([stateAbbr, cities]) => {
    cities.forEach(city => {
      allCities.push({
        ...city,
        state: stateAbbr
      });
    });
  });
  
  fs.writeFileSync(outputPath, JSON.stringify(allCities, null, 2));
  console.log(`Generated ${outputPath}`);
}

// Generate counties data
function generateCountiesData() {
  const outputPath = path.join(__dirname, '../_data/counties.json');
  
  // Extract unique counties from cities
  const counties = {};
  Object.entries(sampleCities).forEach(([stateAbbr, cities]) => {
    cities.forEach(city => {
      const key = `${stateAbbr}-${city.county}`;
      if (!counties[key]) {
        counties[key] = {
          name: city.county,
          state: stateAbbr,
          cities: []
        };
      }
      counties[key].cities.push(city.name);
    });
  });
  
  fs.writeFileSync(outputPath, JSON.stringify(Object.values(counties), null, 2));
  console.log(`Generated ${outputPath}`);
}

// Run all generators
console.log('Generating location data...');
generateStatesData();
generateCitiesData();
generateCountiesData();
console.log('Location data generation complete!');
