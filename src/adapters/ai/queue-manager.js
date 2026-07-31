import { configManager } from '../../core/config-manager.js';

/**
 * Queue Manager managing active API call counts and enforcing rate limit delays.
 */
class QueueManager {
  constructor() {
    this.activeCalls = 0;
    this.queue = [];
  }

  /**
   * Enqueues an asynchronous API call task.
   * @param {() => Promise<any>} taskFn - The target API call wrapper.
   * @returns {Promise<any>}
   */
  async enqueue(taskFn) {
    const maxConcurrency = configManager.get('provider.ai.maxConcurrency', 1);
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
}

export const queueManager = new QueueManager();
