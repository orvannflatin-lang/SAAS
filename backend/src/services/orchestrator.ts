import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const prisma = new PrismaClient();
const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null,
});
const twitterQueue = new Queue('twitter-actions', { connection: redisConnection });

/**
 * The Ghost Mastermind Orchestrator
 * Manages autonomous behavior for all accounts in Global Pools.
 */
let isOrchestratorRunning = false;

export const executeGlobalCycle = async () => {
    console.log('🤖 Orchestrator: Starting global autonomous cycle...');
    try {
        const accounts = await prisma.twitterAccount.findMany({
            where: { autoMode: true, status: 'ACTIVE' }
        });

        console.log(`🤖 Orchestrator: Found ${accounts.length} accounts in Auto-Mode.`);

        for (const account of accounts) {
            if (account.type === 'MAIN') {
                await handleMainAutomation(account);
            } else if (account.type === 'SUPPORT') {
                await handleSupportAutomation(account);
            }
        }
    } catch (error) {
        console.error('❌ Orchestrator Error:', error);
    }
};

export const startOrchestrator = () => {
    if (isOrchestratorRunning) {
        // If it's already running, just trigger an immediate cycle manually instead of duplicate crons
        executeGlobalCycle();
        return;
    }
    
    isOrchestratorRunning = true;
    
    // Execute cycle immediately when initialized
    executeGlobalCycle();

    // Then schedule to run every 15 minutes
    cron.schedule('*/15 * * * *', executeGlobalCycle);

    console.log('✅ Global Orchestrator initialized and listening.');
};

/**
 * Logic for MAIN accounts: Posting & Warm-up
 */
async function handleMainAutomation(account: any) {
    const roll = Math.random();

    // 15% chance to post if there is content available
    if (roll < 0.15) {
        await triggerCampaignPost(account);
    } 
    // 25% chance to warm up
    else if (roll < 0.40) {
        console.log(`🛡️ Orchestrator: Scheduling Warm-Up for MAIN account ${account.username}`);
        await twitterQueue.add(`auto-warmup-${account.username}-${Date.now()}`, {
            accountId: account.id,
            action: 'warmUp',
            username: account.username
        });
    }
}

/**
 * Logic for SUPPORT accounts: Passive warm-up (Engaging with niche)
 * Active boosting is handled via job_completed events in index.ts
 */
async function handleSupportAutomation(account: any) {
    // 20% chance to do a random warm-up to keep the account healthy
    if (Math.random() < 0.20) {
        console.log(`🛡️ Orchestrator: Scheduling Warm-Up for SUPPORT account ${account.username}`);
        await twitterQueue.add(`auto-warmup-support-${account.username}-${Date.now()}`, {
            accountId: account.id,
            action: 'warmUp',
            username: account.username
        });
    }
}

/**
 * Randomly pick content from any active user campaign and post it
 */
async function triggerCampaignPost(account: any) {
    try {
        const campaigns = await prisma.campaign.findMany({
            where: { 
                userId: account.userId, 
                isActive: true,
                groupId: account.groupId // Match group
            },
            include: { contents: true }
        });

        if (campaigns.length === 0) {
            console.log(`⚠️ Orchestrator: No active campaigns for user ${account.userId}`);
            return;
        }

        const allContents = campaigns.flatMap(c => c.contents);
        if (allContents.length === 0) {
            console.log(`⚠️ Orchestrator: Campaigns found but no content available.`);
            return;
        }

        // Pick random content
        const content = allContents[Math.floor(Math.random() * allContents.length)];

        console.log(`🚀 Orchestrator: Triggering Campaign Post for ${account.username}`);
        
        await twitterQueue.add(`auto-post-${account.username}-${Date.now()}`, {
            accountId: account.id,
            action: 'autoPost',
            username: account.username,
            config: {
                content: content.caption,
                mediaUrls: content.mediaUrls,
                linkUrl: content.linkUrl
            }
        });

        // Track usage
        await prisma.campaignContent.update({
            where: { id: content.id },
            data: { usedCount: { increment: 1 } }
        });

    } catch (error) {
        console.error(`❌ Error in triggerCampaignPost for ${account.username}:`, error);
    }
}
