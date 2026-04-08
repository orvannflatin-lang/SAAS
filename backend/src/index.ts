import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PrismaClient, AccountStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 4000;

// Redis Connection for Queue
const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null,
});

// BullMQ Queues
const instagramQueue = new Queue('instagram-actions', { connection: redisConnection });
const twitterQueue = new Queue('twitter-actions', { connection: redisConnection });

// HTTP & Socket.io Server
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());

// --- API ENDPOINTS ---

/**
 * Health Check
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'backend' });
});

/**
 * Get all accounts
 */
app.get('/api/accounts', async (req, res) => {
    const accounts = await prisma.iGAccount.findMany({
        include: { proxy: true }
    });
    res.json(accounts);
});

/**
 * Add a new account + proxy
 */
app.post('/api/accounts', async (req, res) => {
    const { username, password, proxy } = req.body;

    try {
        // Ensure temp user exists before creating Instagram account
        await prisma.user.upsert({
            where: { id: 'temp-user-id' },
            update: {},
            create: { id: 'temp-user-id', email: 'admin@duupflow.com', password: 'password' }
        });

        const newAccount = await prisma.iGAccount.create({
            data: {
                username,
                password,
                userId: 'temp-user-id',
                proxy: proxy ? {
                    create: {
                        host: proxy.host,
                        port: parseInt(proxy.port),
                        username: proxy.username,
                        password: proxy.password
                    }
                } : undefined
            }
        });
        res.status(201).json(newAccount);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * Delete an account
 */
app.delete('/api/accounts/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // First delete the proxy if it exists
        const proxy = await prisma.proxy.findUnique({ where: { accountId: id } });
        if (proxy) {
            await prisma.proxy.delete({ where: { accountId: id } });
        }
        
        // Then delete the account
        await prisma.iGAccount.delete({ where: { id } });
        res.json({ success: true, message: "Compte Instagram supprimé." });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Trigger an automation action
 */
app.post('/api/accounts/:id/action', async (req, res) => {
    const { id } = req.params;
    const { action } = req.body; // e.g., 'warmUp', 'follow'

    console.log(`[Backend] Received action request for Instagram account ${id}: ${action}`);

    try {
        const job = await instagramQueue.add(action, { accountId: id, action });
        console.log(`[Backend] Job added to Instagram queue: ${job.id}`);
        res.json({ jobId: job.id, message: `Action ${action} queued successfully.` });
    } catch (error: any) {
        console.error(`[Backend] Failed to add job to Instagram queue: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// --- TWITTER API ENDPOINTS ---

/**
 * Get all Twitter accounts
 */
app.get('/api/twitter-accounts', async (req, res) => {
    const accounts = await prisma.twitterAccount.findMany({
        include: { proxy: true }
    });
    res.json(accounts);
});

/**
 * Add a new Twitter account + proxy WITH authToken support
 */
app.post('/api/twitter-accounts', async (req, res) => {
    const { username, password, email, emailPassword, type, proxy, authToken } = req.body;

    let sessionCookies = undefined;
    let initialStatus = 'WARM_UP';

    if (authToken && authToken.trim() !== '') {
        sessionCookies = [
            {
                name: 'auth_token',
                value: authToken.trim(),
                domain: '.x.com',
                path: '/',
                secure: true,
                httpOnly: true,
                sameSite: 'Lax'
            }
        ];
        initialStatus = 'ACTIVE';
    }

    try {
        // Ensure temp user exists before creating Twitter account
        await prisma.user.upsert({
            where: { id: 'temp-user-id' },
            update: {},
            create: { id: 'temp-user-id', email: 'admin@duupflow.com', password: 'password' }
        });

        const newAccount = await prisma.twitterAccount.create({
            data: {
                username,
                password,
                email,
                emailPassword,
                type: type || 'MAIN',
                status: initialStatus as AccountStatus,
                sessionCookies: sessionCookies ?? undefined,
                userId: 'temp-user-id',
                proxy: proxy ? {
                    create: {
                        host: proxy.host,
                        port: parseInt(proxy.port),
                        username: proxy.username,
                        password: proxy.password
                    }
                } : undefined
            }
        });
        res.status(201).json(newAccount);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * Delete a Twitter account
 */
app.delete('/api/twitter-accounts/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // First delete the proxy if it exists
        const proxy = await prisma.twitterProxy.findUnique({ where: { accountId: id } });
        if (proxy) {
            await prisma.twitterProxy.delete({ where: { accountId: id } });
        }
        
        // Then delete the account
        await prisma.twitterAccount.delete({ where: { id } });
        res.json({ success: true, message: "Compte Twitter supprimé." });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Trigger an automation action for Twitter
 */
app.post('/api/twitter-accounts/:id/action', async (req, res) => {
    const { id } = req.params;
    const { action } = req.body; // e.g., 'setupProfile', 'joinCommunities', 'post', 'comment'

    console.log(`[Backend] Received action request for Twitter account ${id}: ${action}`);

    try {
        const job = await twitterQueue.add(action, { accountId: id, action });
        console.log(`[Backend] Job added to Twitter queue: ${job.id}`);
        res.json({ jobId: job.id, message: `Action ${action} queued successfully on Twitter worker.` });
    } catch (error: any) {
        console.error(`[Backend] Failed to add job to Twitter queue: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// --- TWITTER POSTS & STATS API ---

/**
 * Create a scheduled tweet
 */
app.post('/api/twitter-posts', async (req, res) => {
    const { accountId, content, mediaUrls, scheduleDate, isComment, parentPostUrl } = req.body;

    try {
        const post = await prisma.twitterPost.create({
            data: {
                accountId,
                content,
                mediaUrls: mediaUrls || [],
                scheduleDate: scheduleDate ? new Date(scheduleDate) : new Date(),
                isComment: isComment || false,
                parentPostUrl: parentPostUrl || null,
                status: 'PENDING'
            }
        });

        // If schedule is now, queue immediately
        if (!scheduleDate || new Date(scheduleDate) <= new Date()) {
            await twitterQueue.add('post', { accountId, postId: post.id });
        } else {
            // Schedule for later
            const delay = new Date(scheduleDate).getTime() - Date.now();
            await twitterQueue.add('post', { accountId, postId: post.id }, { delay });
        }

        res.status(201).json(post);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * Get posts for an account
 */
app.get('/api/twitter-posts/:accountId', async (req, res) => {
    const { accountId } = req.params;
    const posts = await prisma.twitterPost.findMany({
        where: { accountId },
        orderBy: { createdAt: 'desc' },
        take: 50
    });
    res.json(posts);
});

/**
 * Get statistics for an account
 */
app.get('/api/twitter-stats/:accountId', async (req, res) => {
    const { accountId } = req.params;
    const { days = 30 } = req.query;

    try {
        const stats = await prisma.twitterStats.findMany({
            where: {
                accountId,
                date: {
                    gte: new Date(Date.now() - parseInt(days as string) * 24 * 60 * 60 * 1000)
                }
            },
            orderBy: { date: 'asc' }
        });

        // Calculate totals
        const totals = stats.reduce((acc, stat) => ({
            tweetsPosted: acc.tweetsPosted + stat.tweetsPosted,
            likesGiven: acc.likesGiven + stat.likesGiven,
            likesReceived: acc.likesReceived + stat.likesReceived,
            retweetsGiven: acc.retweetsGiven + stat.retweetsGiven,
            retweetsReceived: acc.retweetsReceived + stat.retweetsReceived,
            repliesGiven: acc.repliesGiven + stat.repliesGiven,
            repliesReceived: acc.repliesReceived + stat.repliesReceived,
            followsGiven: acc.followsGiven + stat.followsGiven,
            unfollows: acc.unfollows + stat.unfollows,
            profileViews: acc.profileViews + stat.profileViews,
            followersCount: stat.followersCount, // Use latest
            followingCount: stat.followingCount  // Use latest
        }), {
            tweetsPosted: 0, likesGiven: 0, likesReceived: 0,
            retweetsGiven: 0, retweetsReceived: 0, repliesGiven: 0,
            repliesReceived: 0, followsGiven: 0, unfollows: 0,
            profileViews: 0, followersCount: 0, followingCount: 0
        });

        res.json({ stats, totals });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Update post stats (called by worker after posting)
 */
app.patch('/api/twitter-posts/:postId/stats', async (req, res) => {
    const { postId } = req.params;
    const { likes, retweets, replies, impressions, status } = req.body;

    try {
        const post = await prisma.twitterPost.update({
            where: { id: postId },
            data: {
                ...(likes !== undefined && { likes }),
                ...(retweets !== undefined && { retweets }),
                ...(replies !== undefined && { replies }),
                ...(impressions !== undefined && { impressions }),
                ...(status && { status }),
                ...(status === 'PUBLISHED' && { publishedAt: new Date() })
            }
        });
        res.json(post);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// --- SOCKET.IO LOGIC ---
io.on('connection', (socket) => {
    socket.on('worker_log', (data) => io.emit('ui_log', data));
    socket.on('worker_screenshot', (data) => io.emit('ui_screenshot', data));
    socket.on('worker_state', (data) => io.emit('ui_state', data));
});

async function init() {
    await prisma.user.upsert({
        where: { id: 'temp-user-id' },
        update: {},
        create: {
            id: 'temp-user-id',
            email: 'admin@duupflow.com',
            password: 'password'
        }
    });
    
    httpServer.listen(port, () => {
        console.log(`Backend API & Queue running on http://localhost:${port}`);
    });
}

init().catch(console.error);

// Trigger reload for .env
