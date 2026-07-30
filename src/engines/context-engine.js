import { knowledgeEngine } from './knowledge-engine.js';
import { datasetEngine } from './dataset-engine.js';
import { nearbyEngine } from './nearby-engine.js';
import { configManager } from '../core/config-manager.js';
import { PseoError, ERROR_CODES } from '../core/errors.js';
import { slugify } from '../core/utils.js';
import { weatherAdapter } from '../adapters/weather/weather-adapter.js';
import { mapsAdapter } from '../adapters/maps/maps-adapter.js';

/**
 * Context Engine compiling targets into compressed page Context Packets.
 */
class ContextEngine {
  /**
   * Compiles page variables for a specific target.
   * @param {string} stateAbbrev - Upper case state abbreviation (e.g. 'TX').
   * @param {string} citySlug - Kebab case city slug (e.g. 'austin').
   * @param {string} serviceId - Unique ID of the service (e.g. 'termite-control').
   * @returns {Promise<Record<string, any>>} Validated Context Packet.
   */
  async buildContextPacket(stateAbbrev, citySlug, serviceId) {
    const stateNode = await knowledgeEngine.getState(stateAbbrev);
    if (!stateNode) {
      throw new PseoError(
        ERROR_CODES.CONTEXT_INVALID,
        `State "${stateAbbrev}" not found in Knowledge Graph.`,
        'context-engine',
        'ERROR',
        'Verify geographic states dataset contains abbreviation.'
      );
    }

    const cityNode = await knowledgeEngine.getCity(citySlug);
    if (!cityNode) {
      throw new PseoError(
        ERROR_CODES.CONTEXT_INVALID,
        `City "${citySlug}" not found in Knowledge Graph.`,
        'context-engine',
        'ERROR',
        'Verify city is registered in the states dataset.'
      );
    }

    // Ensure state abbreviation match
    if (cityNode.state !== stateNode.abbreviation) {
      throw new PseoError(
        ERROR_CODES.CONTEXT_INVALID,
        `City "${citySlug}" belongs to state "${cityNode.state}", but state "${stateNode.abbreviation}" was requested.`,
        'context-engine',
        'ERROR',
        'Check targeting combinations for state/city mismatches.'
      );
    }

    const serviceData = datasetEngine.getService(serviceId);
    if (!serviceData) {
      throw new PseoError(
        ERROR_CODES.CONTEXT_INVALID,
        `Service "${serviceId}" is not registered.`,
        'context-engine',
        'ERROR',
        'Verify services JSON contains the requested service ID.'
      );
    }

    // Load business context
    const businessContext = configManager.get('site.business');

    // Resolve nearby cities nodes
    const nearbyLimit = configManager.get('seo.linking.maxLinksPerPage', 5);
    const nearbyCities = await nearbyEngine.getNearbyCities(citySlug, nearbyLimit);

    // Formulate keywords and canonical URLs
    const cityName = cityNode.city;
    const serviceName = serviceData.name;
    const primaryKeyword = `${serviceName} in ${cityName}, ${stateAbbrev}`;
    const secondaryKeywords = [
      `${serviceName} service near me`,
      `local ${serviceName} company in ${cityName}`,
      `best ${serviceName.toLowerCase()} professionals`,
    ];

    const routingPattern = configManager.get('seo.routingPattern', '/{state}/{city}-{service}');
    const canonicalPath = routingPattern
      .replace('{state}', stateAbbrev.toLowerCase())
      .replace('{city}', slugify(cityName))
      .replace('{service}', slugify(serviceName));
    const canonicalUrl = `${configManager.get('seo.canonicalDomain')}${canonicalPath}`;

    // Resolve weather and maps widgets from adapters asynchronously
    const weatherWidget = await weatherAdapter.getWeatherData(cityNode);
    const mapsWidget = await mapsAdapter.getMapsData(cityNode, businessContext.coordinates);

    // Construct Context Packet with ALL location data for comprehensive templates
    const packet = {
      projectId: configManager.get('projectId', 'enterprise-pseo'),
      timestamp: new Date().toISOString(),
      business: businessContext,
      location: {
        city: cityName,
        state: stateAbbrev,
        county: cityNode.county,
        population: cityNode.population,
        zipCodes: cityNode.zip_codes || [],
        landmarks: cityNode.landmarks || [],
        nearbyCities: nearbyCities,
        climateZone: cityNode.climate_zone || 'humid-subtropical',
        terrain: cityNode.terrain || 'urban',
        economyType: cityNode.economy_type || 'diversified',
        housingProfile: cityNode.housing_profile || 'mixed',
        growthPattern: cityNode.growth_pattern || 'steady',
        serviceEnvironment: cityNode.service_environment || 'metro',
        propertyMix: cityNode.property_mix || 'residential-commercial',
        lat: cityNode.lat || cityNode.coordinates?.lat || 0,
        lng: cityNode.lng || cityNode.coordinates?.lng || 0,
      },
      service: serviceData,
      nearby: nearbyCities,
      widgets: {
        weather: weatherWidget,
        maps: mapsWidget,
      },
      seo: {
        primaryKeyword,
        secondaryKeywords,
        canonicalUrl,
      },
    };

    // Freeze packet to guarantee immutability at runtime
    return Object.freeze(packet);
  }
}

export const contextEngine = new ContextEngine();
