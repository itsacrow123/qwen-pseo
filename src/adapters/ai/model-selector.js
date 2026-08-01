/**
 * Model Selector - Owns ALL model selection logic.
 * 
 * This module maintains an internal priority list and handles automatic
 * model failover. The active model is NEVER hardcoded.
 * 
 * DO NOT REQUIRE: SILICONFLOW_MODEL environment variable
 */

import { logger } from '../../core/logger.js';

// Internal priority list (NEVER exposed to users)
const MODEL_PRIORITY = [
  'Qwen/Qwen3.6-35B-A3B',
  'deepseek-ai/DeepSeek-V4-Pro',
  'Qwen/Qwen3.5-35B-A3B',
  'deepseek-ai/DeepSeek-V3.2',
  'zai-org/GLM-5.2',
  'moonshotai/Kimi-K3',
  'google/gemma-4-31B-it',
  'Qwen/Qwen3.5-27B',
  'deepseek-ai/DeepSeek-V3'
];

// Runtime cache
let _cachedModel = null;
let _modelIndex = 0;

/**
 * Get the current active model.
 * Returns cached model if available, otherwise returns first model in priority.
 * @returns {string} Current model name
 */
export function getCurrentModel() {
  if (_cachedModel) {
    return _cachedModel;
  }
  return MODEL_PRIORITY[0];
}

/**
 * Get the next model in priority order for failover.
 * @returns {string|null} Next model name or null if exhausted
 */
export function getNextModel() {
  _modelIndex++;
  if (_modelIndex >= MODEL_PRIORITY.length) {
    return null;
  }
  _cachedModel = MODEL_PRIORITY[_modelIndex];
  logger.info('model-selector', `Failover to model: ${_cachedModel}`);
  return _cachedModel;
}

/**
 * Reset model selection to start of priority list.
 * Use when build restarts or on manual reset.
 */
export function resetModel() {
  _cachedModel = null;
  _modelIndex = 0;
  logger.info('model-selector', 'Model selection reset to priority start.');
}

/**
 * Set the active model (used after successful connection test).
 * @param {string} model - Model name to cache
 */
export function setCachedModel(model) {
  _cachedModel = model;
  _modelIndex = MODEL_PRIORITY.indexOf(model);
  if (_modelIndex === -1) {
    _modelIndex = 0;
  }
  logger.info('model-selector', `Cached active model: ${model}`);
}

/**
 * Get all models in priority order (for testing/debugging only).
 * @returns {string[]} Array of model names
 */
export function getPriorityList() {
  return [...MODEL_PRIORITY];
}

/**
 * Check if a model is in the priority list.
 * @param {string} model - Model name to check
 * @returns {boolean} True if model is in priority list
 */
export function isValidModel(model) {
  return MODEL_PRIORITY.includes(model);
}
