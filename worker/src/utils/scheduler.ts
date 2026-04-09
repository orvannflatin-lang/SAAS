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
            
            // First: Check and schedule group-based actions
            await this.scheduleGroupActions(now);
            
            // Second: Check and schedule individual account actions
            const accounts = await prisma.twitterAccount.findMany({
                where: { status: 'ACTIVE', groupId: null }, // Only accounts without group
                include: { proxy: true }
            });

            for (const account of accounts) {
                await this.scheduleForAccount(account, now);
            }
        } catch (error) {
            console.error('Scheduler error:', error);
        }
    }

    private async scheduleGroupActions(now: Date) {
        try {
            // Get all active groups
            const groups = await prisma.accountGroup.findMany({
                where: { isActive: true },
                include: { 
                    accounts: {
                        where: { status: 'ACTIVE' }
                    }
                }
            });

            for (const group of groups) {
                // Check if group has a schedule and if it's time to run
                if (group.schedule && !this.shouldRunSchedule(group.schedule, now)) {
                    continue;
                }

                // Get accounts in this group
                const accounts = group.accounts;
                if (accounts.length === 0) continue;

                // Check if enough time passed since last group action
                const lastActionTime = group.updatedAt ? new Date(group.updatedAt).getTime() : 0;
                const timeSinceLastAction = now.getTime() - lastActionTime;
                const minInterval = 2 * 60 * 60 * 1000; // 2 hours (increased from 30 min)
                
                if (timeSinceLastAction < minInterval) continue;

                // Execute group task for all accounts
                const taskType = group.taskType;
                console.log(`📁 Scheduling group task "${group.name}" (${taskType}) for ${accounts.length} accounts`);

                for (const account of accounts) {
                    // Check if account already has pending job
                    const jobs = await this.queue.getJobs(['waiting', 'active']);
                    const hasPendingJob = jobs.some(j => j.data.accountId === account.id);
                    
                    if (hasPendingJob) continue;

                    // Add job to queue with LONGER random delay (5-15 min)
                    const delay = (5 + Math.random() * 10) * 60 * 1000; // 5-15 min random delay
                    
                    await this.queue.add(
                        `group-${group.id}-${taskType}-${account.username}`,
                        {
                            accountId: account.id,
                            action: this.mapTaskTypeToAction(taskType),
                            config: this.getActionConfig(this.mapTaskTypeToAction(taskType)),
                            groupId: group.id,
                            groupName: group.name
                        },
                        {
                            delay: Math.floor(delay),
                            attempts: 2,
                            backoff: { type: 'exponential', delay: 120000 } // 2 min backoff
                        }
                    );
                }

                // Update group's updatedAt
                await prisma.accountGroup.update({
                    where: { id: group.id },
                    data: { updatedAt: now }
                });
            }
        } catch (error) {
            console.error('Group scheduling error:', error);
        }
    }

    private shouldRunSchedule(schedule: any, now: Date): boolean {
        // If no schedule, always run
        if (!schedule) return true;

        const hour = now.getHours();
        const dayOfWeek = now.getDay();

        // Check days of week
        if (schedule.days && !schedule.days.includes(dayOfWeek)) {
            return false;
        }

        // Check time range
        if (schedule.startTime !== undefined && schedule.endTime !== undefined) {
            if (hour < schedule.startTime || hour >= schedule.endTime) {
                return false;
            }
        }

        return true;
    }

    private mapTaskTypeToAction(taskType: string): string {
        const mapping: Record<string, string> = {
            'warmup': 'warmUp',
            'posting': 'autoPost',
            'commenting': 'autoComment',
            'engagement': 'autoLike',
            'following': 'autoFollow',
            'retweeting': 'autoRetweet'
        };
        return mapping[taskType] || 'warmUp';
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

        // Random delay between actions (2-4 hours for safety)
        const minInterval = 2 * 60 * 60 * 1000; // 2 hours minimum
        
        // Check if enough time passed since last action (using updatedAt as proxy)
        const lastActionTime = account.updatedAt ? new Date(account.updatedAt).getTime() : 0;
        const timeSinceLastAction = now.getTime() - lastActionTime;
        
        // If not enough time passed, skip
        if (timeSinceLastAction < minInterval) return;

        // Determine action type based on probability and time
        const action = this.selectAction(hour, dayOfWeek);
        if (!action) return;

        // Add job to queue with LONGER delay (10-20 min)
        const delay = (10 + Math.random() * 10) * 60 * 1000; // 10-20 min random delay
        
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
                backoff: { type: 'exponential', delay: 120000 } // 2 min backoff
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
        // Don't run actions during night hours (2am - 7am)
        if (hour >= 2 && hour <= 7) return null;

        const actions = [
            { name: 'warmUp', weight: 25 },
            { name: 'autoLike', weight: 30 },
            { name: 'autoFollow', weight: 20 },
            { name: 'autoComment', weight: 15 },
            { name: 'autoRetweet', weight: 5 },
            { name: 'autoPost', weight: 5 },
        ];

        // Adjust weights based on time - OnlyFans/Adult content strategy
        if (hour >= 20 || hour <= 1) {
            // Evening/Night - Peak time for adult content engagement
            actions.find(a => a.name === 'autoLike')!.weight += 15;
            actions.find(a => a.name === 'autoFollow')!.weight += 10;
            actions.find(a => a.name === 'autoComment')!.weight += 5;
        } else if (hour >= 12 && hour <= 16) {
            // Afternoon - Good for engagement
            actions.find(a => a.name === 'autoComment')!.weight += 10;
            actions.find(a => a.name === 'autoPost')!.weight += 5;
        }

        // Weekend - More aggressive engagement
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            actions.find(a => a.name === 'autoLike')!.weight += 10;
            actions.find(a => a.name === 'autoFollow')!.weight += 10;
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
                return { count: Math.floor(Math.random() * 8) + 5 }; // 5-12 likes
            case 'autoFollow':
                return { 
                    keyword: ['onlyfans', 'model', 'babe', 'sexy', 'hot', 'nsfw', 'adult', '18+', 'content creator', 'influencer'][Math.floor(Math.random() * 10)],
                    count: Math.floor(Math.random() * 5) + 3 // 3-7 follows
                };
            case 'autoRetweet':
                return { count: Math.floor(Math.random() * 3) + 1 }; // 1-3 retweets
            case 'autoComment':
                return { count: Math.floor(Math.random() * 3) + 2 }; // 2-4 comments
            case 'autoPost':
            case 'postCommunity':
                // OnlyFans promotional posts with links
                const onlyfansLinks = [
                    'https://onlyfans.com/yourusername',
                    // Add more OnlyFans URLs here
                ];
                
                const hashtags = [
                    '#contentcreator', '#exclusive', '#subscription', '#premium',
                    '#photography', '#model', '#lifestyle', '#fitness',
                    '#fashion', '#beauty', '#art', '#creative'
                ];
                
                return {
                    // Random OnlyFans link (if any configured)
                    onlyfansUrl: onlyfansLinks.length > 0 
                        ? onlyfansLinks[Math.floor(Math.random() * onlyfansLinks.length)]
                        : undefined,
                    // Random hashtags
                    hashtags: hashtags
                        .sort(() => 0.5 - Math.random())
                        .slice(0, Math.floor(Math.random() * 3) + 2) // 2-4 hashtags
                };
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
