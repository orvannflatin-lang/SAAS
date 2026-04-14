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
let isCycleRunning = false;

export const executeGlobalCycle = async () => {
    if (isCycleRunning) {
        console.log('⏭️ Orchestrator: Previous cycle still running, skipping.');
        return;
    }
    isCycleRunning = true;
    console.log('🤖 Orchestrator: Starting global autonomous cycle (v2.1 - STRICT_POSTING)...');
    try {
        const campaigns = await prisma.campaign.findMany({
            where: { isActive: true }
        });

        console.log(`🤖 Orchestrator: Processing ${campaigns.length} active campaigns.`);

        // Diagnostic: Check for groups that have autoMode accounts but no active campaign
        const groupsWithAutoAccounts = await prisma.twitterAccount.findMany({
            where: { autoMode: true },
            select: { groupId: true },
            distinct: ['groupId']
        });

        for (const { groupId } of groupsWithAutoAccounts) {
            if (groupId && !campaigns.some(c => c.groupId === groupId)) {
                console.warn(`⚠️ Orchestrator: Group ${groupId} has autoMode accounts but NO active campaign. They will stay idle.`);
            }
        }

        for (const campaign of campaigns) {
            // Warmup is disabled (resource heavy + not desired)
            if (campaign.type === 'WARMUP') {
                continue;
            }
            // Find MAIN accounts for this campaign scope
            const mainAccounts = await prisma.twitterAccount.findMany({
                where: { 
                    ...(campaign.groupId ? { groupId: campaign.groupId } : { userId: campaign.userId }),
                    type: 'MAIN',
                    autoMode: true
                }
            });

            for (const account of mainAccounts) {
                await handleMainAutomation(account, campaign);
            }

            // Passive support automation only for POST campaigns
            const supportAccounts = await prisma.twitterAccount.findMany({
                where: {
                    ...(campaign.groupId ? { groupId: campaign.groupId } : { userId: campaign.userId }),
                    type: 'SUPPORT',
                    autoMode: true
                }
            });
            for (const support of supportAccounts) {
                await handleSupportAutomation(support);
            }
        }
    } catch (error) {
        console.error('❌ Orchestrator Error:', error);
    } finally {
        isCycleRunning = false;
    }
};

export const startOrchestrator = () => {
    if (isOrchestratorRunning) {
        executeGlobalCycle();
        return;
    }
    isOrchestratorRunning = true;
    executeGlobalCycle();
    cron.schedule('* * * * *', executeGlobalCycle);
    console.log('✅ Global Orchestrator initialized and listening.');
};

async function handleMainAutomation(account: any, campaign: any) {
    try {
// We no longer rely on Global Settings for interval.
        // We use campaign.postIntervalValue directly.

        const lastPost = await prisma.twitterPost.findFirst({
            where: { accountId: account.id, status: 'PUBLISHED' },
            orderBy: { createdAt: 'desc' }
        });

        let canPost = true;
        if (lastPost) {
            const now = new Date();
            const lastPostTime = new Date(lastPost.createdAt);
            const diffMs = now.getTime() - lastPostTime.getTime();
            
            const intervalMs = campaign.postIntervalUnit === 'HOURS' 
                ? campaign.postIntervalValue * 60 * 60 * 1000 
                : campaign.postIntervalValue * 60 * 1000;

            if (diffMs < intervalMs) {
                canPost = false;
            }
        }

        // 100% chance to post if interval passed
        if (canPost) {
            await triggerCampaignPost(account, campaign);
        }
    } catch (error) {
        console.error(`❌ Error in handleMainAutomation for ${account.username}:`, error);
    }
}

async function handleSupportAutomation(account: any) {
    try {
        // Find the most recent post from any MAIN account in the same group
        const latestMainPost = await prisma.twitterPost.findFirst({
            where: {
                account: {
                    groupId: account.groupId,
                    type: 'MAIN'
                },
                status: 'PUBLISHED',
                postUrl: { not: null }
            },
            orderBy: { publishedAt: 'desc' }
        });

        const roll = Math.random();

        // 60% chance to react if a post exists
        if (latestMainPost && latestMainPost.postUrl && roll < 0.60) {
            const username = account.username;
            const commentCount = Math.floor(Math.random() * 3) + 2; // 2 to 4 comments
            console.log(`💬 Orchestrator: Support ${username} -> Commenting ${commentCount} times on ${latestMainPost.postUrl}`);
            await twitterQueue.add(`support-comment-${username}-${Date.now()}`, {
                accountId: account.id,
                action: 'autoComment',
                username,
                config: { 
                    url: latestMainPost.postUrl,
                    comments: [ "🔥", "🚀", "Totalement incroyable !", "Je valide !" ],
                    count: commentCount 
                }
            }, { attempts: 3, backoff: { type: 'exponential', delay: 15000 } });
        } 
        // No fallback for SUPPORT accounts to avoid background noise
    } catch (error) {
        console.error(`❌ Error in handleSupportAutomation for ${account.username}:`, error);
    }
}

async function triggerCampaignPost(account: any, campaign: any) {
    try {
        const campaignWithContent = await prisma.campaign.findUnique({
            where: { id: campaign.id },
            include: { contents: true }
        });

        if (!campaignWithContent || campaignWithContent.contents.length === 0) {
            console.warn(`⚠️ Orchestrator: Campaign "${campaign.name}" (${campaign.id}) has NO content. Skipping.`);
            return;
        }

        const content = campaignWithContent.contents[Math.floor(Math.random() * campaignWithContent.contents.length)];
        
        // Always prefer posting to community when one is available
        let targetCommunity = content.targetCommunity?.trim();
        if (!targetCommunity && campaign.targetCommunities && campaign.targetCommunities.length > 0) {
            const validCommunities = campaign.targetCommunities.filter((c: string) => c && c.trim().length > 0);
            if (validCommunities.length > 0) {
                targetCommunity = validCommunities[Math.floor(Math.random() * validCommunities.length)];
            }
        }

        console.log(`🚀 Orchestrator: Triggering Post for ${account.username} (Campaign: ${campaign.name}${targetCommunity ? ' in community ' + targetCommunity : ''})`);
        
        await twitterQueue.add(`auto-post-${account.username}-${Date.now()}`, {
            accountId: account.id,
            action: targetCommunity ? 'postCommunity' : 'autoPost',
            username: account.username,
            config: {
                content: content.caption,
                mediaUrls: content.mediaUrls,
                linkUrl: content.linkUrl,
                communityUrl: targetCommunity
            }
        }, { attempts: 3, backoff: { type: 'exponential', delay: 15000 } });

        await prisma.campaignContent.update({
            where: { id: content.id },
            data: { usedCount: { increment: 1 } }
        });

    } catch (error) {
        console.error(`❌ Error in triggerCampaignPost for ${account.username}:`, error);
    }
}
