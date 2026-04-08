import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class TwitterScheduler {
    private redisConnection: IORedis;
    private queue: Queue;
    private running: boolean = false;
    private checkInterval: NodeJS.Timeout | null = null;

    constructor(redisUrl: string = 'redis://127.0.0.1:6379') {
        this.redisConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
        this.queue = new Queue('twitter-actions', { connection: this.redisConnection });
    }

    async start() {
        if (this.running) return;
        this.running = true;
        console.log('🕐 Twitter Scheduler démarré');

        // Check every minute for scheduled actions
        this.checkInterval = setInterval(() => this.checkAndSchedule(), 60000);
        
        // Initial check
        await this.checkAndSchedule();
    }

    stop() {
        this.running = false;
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        console.log('🛑 Twitter Scheduler arrêté');
    }

    private async checkAndSchedule() {
        try {
            const now = new Date();
            
            // Get all active Twitter accounts
            const accounts = await prisma.twitterAccount.findMany({
                where: { status: 'ACTIVE' },
                include: { proxy: true }
            });

            for (const account of accounts) {
                await this.scheduleForAccount(account, now);
            }
        } catch (error) {
            console.error('Scheduler error:', error);
        }
    }

    private async scheduleForAccount(account: any, now: Date) {
        const username = account.username;
        
        // Check if there's already a pending job for this account
        const jobs = await this.queue.getJobs(['waiting', 'active']);
        const hasPendingJob = jobs.some(j => j.data.accountId === account.id);
        
        if (hasPendingJob) return;

        // Determine next action based on time and randomness
        const hour = now.getHours();
        const dayOfWeek = now.getDay();

        // Random delay between actions (30-120 minutes)
        const minInterval = 30 * 60 * 1000; // 30 minutes
        
        // Check if enough time passed since last action (using updatedAt as proxy)
        const lastActionTime = account.updatedAt ? new Date(account.updatedAt).getTime() : 0;
        const timeSinceLastAction = now.getTime() - lastActionTime;
        
        // If not enough time passed, skip
        if (timeSinceLastAction < minInterval) return;

        // Determine action type based on probability and time
        const action = this.selectAction(hour, dayOfWeek);
        if (!action) return;

        // Add job to queue with delay
        const delay = Math.random() * 5 * 60 * 1000; // 0-5 min random delay
        
        await this.queue.add(
            `twitter-${action}-${username}`,
            {
                accountId: account.id,
                action: action,
                config: this.getActionConfig(action)
            },
            {
                delay: Math.floor(delay),
                attempts: 2,
                backoff: { type: 'exponential', delay: 60000 }
            }
        );

        // Update last action time using updatedAt
        await prisma.twitterAccount.update({
            where: { id: account.id },
            data: { updatedAt: new Date() }
        });

        console.log(`📅 Action '${action}' planifiée pour ${username} dans ${Math.round(delay/1000/60)} min`);
    }

    private selectAction(hour: number, dayOfWeek: number): string | null {
        // Don't run actions during night hours (1am - 6am)
        if (hour >= 1 && hour <= 6) return null;

        const actions = [
            { name: 'warmUp', weight: 30 },
            { name: 'autoLike', weight: 25 },
            { name: 'autoComment', weight: 15 },
            { name: 'autoRetweet', weight: 15 },
            { name: 'autoFollow', weight: 10 },
            { name: 'autoPost', weight: 5 },
        ];

        // Adjust weights based on time
        if (hour >= 9 && hour <= 17) {
            // Business hours - more professional actions
            actions.find(a => a.name === 'autoFollow')!.weight += 10;
        } else {
            // Evening - more engagement actions
            actions.find(a => a.name === 'autoLike')!.weight += 10;
            actions.find(a => a.name === 'autoComment')!.weight += 5;
        }

        // Random selection based on weights
        const totalWeight = actions.reduce((sum, a) => sum + a.weight, 0);
        let random = Math.random() * totalWeight;
        
        for (const action of actions) {
            random -= action.weight;
            if (random <= 0) return action.name;
        }
        
        return 'warmUp';
    }

    private getActionConfig(action: string): any {
        switch (action) {
            case 'autoLike':
                return { count: Math.floor(Math.random() * 5) + 3 }; // 3-8 likes
            case 'autoFollow':
                return { 
                    keyword: ['crypto', 'web3', 'blockchain', 'defi', 'nft'][Math.floor(Math.random() * 5)],
                    count: Math.floor(Math.random() * 3) + 2 // 2-5 follows
                };
            case 'autoRetweet':
                return { count: Math.floor(Math.random() * 3) + 1 }; // 1-3 retweets
            case 'autoComment':
                return { count: Math.floor(Math.random() * 2) + 1 }; // 1-2 comments
            case 'autoPost':
                return {}; // Uses default tweets
            default:
                return {};
        }
    }

    // Manual action scheduling
    async scheduleAction(accountId: string, action: string, config: any, delayMs: number = 0) {
        const account = await prisma.twitterAccount.findUnique({ where: { id: accountId } });
        if (!account) throw new Error('Account not found');

        await this.queue.add(
            `twitter-manual-${action}-${account.username}`,
            { accountId, action, config },
            { delay: delayMs, attempts: 2, backoff: { type: 'exponential', delay: 60000 } }
        );

        return { scheduled: true, action, account: account.username };
    }

    // Get queue status
    async getStatus() {
        const waiting = await this.queue.getWaitingCount();
        const active = await this.queue.getActiveCount();
        const completed = await this.queue.getCompletedCount();
        const failed = await this.queue.getFailedCount();

        return { waiting, active, completed, failed };
    }
}

export const twitterScheduler = new TwitterScheduler(
    process.env.REDIS_URL || 'redis://127.0.0.1:6379'
);
