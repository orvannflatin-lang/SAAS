// Clear all queued jobs
const IORedis = require('ioredis');

async function clearQueues() {
    const redis = new IORedis('redis://127.0.0.1:6379', { maxRetriesPerRequest: null });
    
    console.log('🧹 Clearing all queues...');
    
    // Get all keys
    const keys = await redis.keys('bull:*');
    console.log(`Found ${keys.length} queue keys`);
    
    // Delete all bullmq keys
    for (const key of keys) {
        await redis.del(key);
    }
    
    console.log('✅ All queues cleared!');
    await redis.quit();
}

clearQueues();
