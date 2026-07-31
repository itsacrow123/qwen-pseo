import { configManager } from '../../core/config-manager.js';

/**
 * Queue Manager managing active API call counts and enforcing rate limit delays.
 * Implements exponential backoff for retries.
 */
class QueueManager {
  constructor() {
    this.activeCalls = 0;
    this.queue = [];
    // Reduced concurrency: default 1, maximum 2
    this.defaultConcurrency = 1;
    this.maxConcurrency = 2;
    // Exponential backoff delays in milliseconds
    this.backoffDelays = [5000, 15000, 30000, 60000]; // 5s, 15s, 30s, 60s
  }
  
  /**
   * Enqueues an asynchronous API call task.
   * @param {() => Promise<any>} taskFn - The target API call wrapper.
   * @returns {Promise<any>}
   */
  async enqueue(taskFn) {
    const configuredConcurrency = configManager.get('provider.ai.maxConcurrency', this.defaultConcurrency);
    // Enforce maximum concurrency of 2
    const maxConcurrency = Math.min(configuredConcurrency, this.maxConcurrency);
    const delayBetweenCalls = configManager.get('provider.ai.delayMs', 100);

    if (this.activeCalls >= maxConcurrency) {
      await new Promise(resolve => {
        this.queue.push(resolve);
      });
    }

    this.activeCalls++;
    try {
      const result = await taskFn();
      return result;
    } finally {
      this.activeCalls--;
      if (delayBetweenCalls > 0) {
        await new Promise(res => setTimeout(res, delayBetweenCalls));
      }
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next();
      }
    }
  }
  
  /**
   * Get the exponential backoff delay for a given retry attempt.
   * @param {number} attempt - The retry attempt number (0-indexed).
   * @returns {number} Delay in milliseconds.
   */
  getBackoffDelay(attempt) {
    const index = Math.min(attempt, this.backoffDelays.length - 1);
    return this.backoffDelays[index];
  }
}

export const queueManager = new QueueManager();
