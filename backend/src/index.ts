import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PrismaClient, AccountStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

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

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req: any, file: any, cb: any) => {
        const uploadDir = path.join(__dirname, '..', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req: any, file: any, cb: any) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `profile-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const fileFilter = (req: any, file: any, cb: any) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Seuls les fichiers image sont autorisés (JPEG, PNG, GIF, WEBP)'));
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: fileFilter
});

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Helper function to map action to stats field
function getActivityField(action: string): string | null {
    const actionMap: Record<string, string> = {
        'warmUp': 'tweetsPosted', // Count warmups as activity
        'autoPost': 'tweetsPosted',
        'autoLike': 'likesGiven',
        'autoComment': 'repliesGiven',
        'autoFollow': 'followsGiven',
        'autoRetweet': 'retweetsGiven',
        'like': 'likesGiven',
        'comment': 'repliesGiven',
        'follow': 'followsGiven',
        'retweet': 'retweetsGiven',
        'post': 'tweetsPosted'
    };
    return actionMap[action] || null;
}

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
    const { username, cookies, ct0, type, proxy, groupId } = req.body;

    // Validate required fields
    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
        return res.status(400).json({ error: 'Cookies array is required' });
    }

    // Validate that auth_token cookie exists
    const hasAuthToken = cookies.some((cookie: any) => 
        cookie.name === 'auth_token' && cookie.value
    );

    if (!hasAuthToken) {
        return res.status(400).json({ error: 'auth_token cookie is required' });
    }

    // Validate groupId - now required
    if (!groupId) {
        return res.status(400).json({ 
            error: 'groupId is required. Every account must belong to a group.' 
        });
    }

    // Verify group exists
    try {
        const group = await prisma.accountGroup.findUnique({
            where: { id: groupId }
        });
        
        if (!group) {
            return res.status(400).json({ error: 'Group not found' });
        }
    } catch (error) {
        return res.status(400).json({ error: 'Invalid group ID' });
    }

    // Extract ct0 from cookies if not provided separately
    const ct0Cookie = cookies.find((cookie: any) => cookie.name === 'ct0');
    const finalCt0 = ct0 || (ct0Cookie ? ct0Cookie.value : null);

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
                password: username, // Temporary, cookies are used for auth
                email: null,
                emailPassword: null,
                type: type || 'MAIN',
                status: 'ACTIVE', // Active since we have valid cookies
                sessionCookies: cookies,
                groupId, // Required - account must belong to a group
                // TODO: Add ct0 field after Prisma client regeneration
                userId: 'temp-user-id',
                proxy: proxy ? {
                    create: {
                        host: proxy.host,
                        port: parseInt(proxy.port),
                        username: proxy.username,
                        password: proxy.password
                    }
                } : undefined
            },
            include: {
                group: true
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

// --- ACCOUNT GROUPS API ---

/**
 * Get all account groups
 */
app.get('/api/groups', async (req, res) => {
    try {
        const groups = await prisma.accountGroup.findMany({
            include: { accounts: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(groups);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Create a new account group
 */
app.post('/api/groups', async (req, res) => {
    const { name, description, taskType, schedule, accountIds } = req.body;

    try {
        const group = await prisma.accountGroup.create({
            data: {
                name,
                description,
                taskType,
                schedule,
                userId: 'temp-user-id',
                ...(accountIds && {
                    accounts: {
                        connect: accountIds.map((id: string) => ({ id }))
                    }
                })
            },
            include: { accounts: true }
        });
        res.status(201).json(group);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * Update group
 */
app.patch('/api/groups/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description, taskType, schedule, isActive, accountIds } = req.body;

    try {
        const group = await prisma.accountGroup.update({
            where: { id },
            data: {
                ...(name && { name }),
                ...(description !== undefined && { description }),
                ...(taskType && { taskType }),
                ...(schedule !== undefined && { schedule }),
                ...(isActive !== undefined && { isActive }),
                ...(accountIds && {
                    accounts: {
                        set: accountIds.map((id: string) => ({ id }))
                    }
                })
            },
            include: { accounts: true }
        });
        res.json(group);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * Update account group assignment
 */
app.patch('/api/twitter-accounts/:id/group', async (req, res) => {
    const { id } = req.params;
    const { groupId } = req.body;

    if (!groupId) {
        return res.status(400).json({ error: 'groupId is required' });
    }

    try {
        // Verify group exists
        const group = await prisma.accountGroup.findUnique({
            where: { id: groupId }
        });

        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        // Update account's group
        const account = await prisma.twitterAccount.update({
            where: { id },
            data: { groupId },
            include: {
                group: true
            }
        });

        res.json({
            success: true,
            message: 'Account group updated successfully',
            account
        });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * Delete group
 */
app.delete('/api/groups/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await prisma.accountGroup.delete({ where: { id } });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// --- CONTENT TEMPLATES API ---

/**
 * Get all content templates
 */
app.get('/api/templates', async (req, res) => {
    try {
        const templates = await prisma.contentTemplate.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(templates);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Create content template
 */
app.post('/api/templates', async (req, res) => {
    const { name, content, type, mediaUrls, spinTax, hashtags } = req.body;

    try {
        const template = await prisma.contentTemplate.create({
            data: {
                name,
                content,
                type,
                mediaUrls: mediaUrls || [],
                spinTax,
                hashtags: hashtags || [],
                userId: 'temp-user-id'
            }
        });
        res.status(201).json(template);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * Delete template
 */
app.delete('/api/templates/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await prisma.contentTemplate.delete({ where: { id } });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// --- ACTIVITY HISTORY API ---

/**
 * Get activity history
 */
app.get('/api/activities', async (req, res) => {
    const { accountId, action, status, limit = 100 } = req.query;

    try {
        const activities = await prisma.activityLog.findMany({
            where: {
                ...(accountId && { accountId: accountId as string }),
                ...(action && { action: action as string }),
                ...(status && { status: status as string })
            },
            orderBy: { timestamp: 'desc' },
            take: Number(limit)
        });
        res.json(activities);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Log activity
 */
app.post('/api/activities', async (req, res) => {
    const { accountId, action, message, details, status } = req.body;

    try {
        const activity = await prisma.activityLog.create({
            data: {
                accountId,
                action,
                message,
                details,
                status: status || 'SUCCESS'
            }
        });

        // Update daily stats if activity was successful
        if (status === 'SUCCESS' || !status) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const actionField = getActivityField(action);
            if (actionField) {
                await prisma.twitterStats.upsert({
                    where: {
                        accountId_date: {
                            accountId,
                            date: today
                        }
                    },
                    update: {
                        [actionField]: { increment: 1 }
                    },
                    create: {
                        accountId,
                        date: today,
                        [actionField]: 1
                    }
                });
            }
        }

        res.status(201).json(activity);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// --- COMMENT DISTRIBUTION API ---

/**
 * Create comment request
 */
app.post('/api/comment-requests', async (req, res) => {
    const { postId, postUrl, totalComments, assignedAccounts } = req.body;

    try {
        const request = await prisma.commentRequest.create({
            data: {
                postId,
                postUrl,
                totalComments,
                assignedAccounts,
                userId: 'temp-user-id'
            }
        });
        res.status(201).json(request);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * Get comment requests
 */
app.get('/api/comment-requests', async (req, res) => {
    try {
        const requests = await prisma.commentRequest.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(requests);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Update comment request progress
 */
app.patch('/api/comment-requests/:id', async (req, res) => {
    const { id } = req.params;
    const { commentsDone, status } = req.body;

    try {
        const request = await prisma.commentRequest.update({
            where: { id },
            data: {
                ...(commentsDone !== undefined && { commentsDone }),
                ...(status && { status })
            }
        });
        res.json(request);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// --- PROFILE UPDATE API ---

/**
 * Update Twitter account profile
 */
app.patch('/api/twitter-accounts/:id/profile', async (req, res) => {
    const { id } = req.params;
    const { profileImage, bio, bannerImage, niche } = req.body;

    try {
        const account = await prisma.twitterAccount.update({
            where: { id },
            data: {
                ...(profileImage !== undefined && { profileImage }),
                ...(bio !== undefined && { bio }),
                ...(bannerImage !== undefined && { bannerImage }),
                ...(niche !== undefined && { niche })
            }
        });
        res.json(account);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * Upload image endpoint
 */
app.post('/api/upload', upload.single('image'), async (req: any, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Aucun fichier uploadé' });
        }

        // Generate URL for the uploaded file
        const fileUrl = `http://localhost:${port}/uploads/${req.file.filename}`;

        res.json({
            success: true,
            url: fileUrl,
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype
        });
    } catch (error: any) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Erreur lors de l\'upload: ' + error.message });
    }
});

// --- BAN DETECTION & NOTIFICATIONS API ---

/**
 * Get ban alerts
 */
app.get('/api/ban-alerts', async (req, res) => {
    const { accountId } = req.query;

    try {
        const alerts = await prisma.banAlert.findMany({
            where: {
                ...(accountId && { accountId: accountId as string })
            },
            include: { account: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(alerts);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Create ban alert
 */
app.post('/api/ban-alerts', async (req, res) => {
    const { accountId, alertType, message } = req.body;

    try {
        const alert = await prisma.banAlert.create({
            data: {
                accountId,
                alertType,
                message
            },
            include: { account: true }
        });

        // Also create a notification
        await prisma.notification.create({
            data: {
                userId: 'temp-user-id',
                type: 'BAN',
                title: `Compte banni: ${alert.account.username}`,
                message: message
            }
        });

        res.status(201).json(alert);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * Get notifications
 */
app.get('/api/notifications', async (req, res) => {
    try {
        const notifications = await prisma.notification.findMany({
            where: { userId: 'temp-user-id' },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        res.json(notifications);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Mark notification as read
 */
app.patch('/api/notifications/:id/read', async (req, res) => {
    const { id } = req.params;

    try {
        const notification = await prisma.notification.update({
            where: { id },
            data: { read: true }
        });
        res.json(notification);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});


// --- SOCKET.IO LOGIC ---
io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);
    
    // Forward worker events to UI
    socket.on('worker_log', (data) => io.emit('ui_log', data));
    socket.on('worker_screenshot', (data) => io.emit('ui_screenshot', data));
    socket.on('worker_state', (data) => io.emit('ui_state', data));
    
    // Handle notification events
    socket.on('job_completed', async (data) => {
        try {
            // Find the account by username
            const account = await prisma.twitterAccount.findFirst({
                where: { username: data.username }
            });

            // Create activity log entry
            if (account) {
                await prisma.activityLog.create({
                    data: {
                        accountId: account.id,
                        action: data.action || 'unknown',
                        message: data.message || `Action ${data.action} completed`,
                        status: 'SUCCESS',
                        details: data.details || {}
                    }
                });

                // Update daily stats for this account
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const actionField = getActivityField(data.action);
                if (actionField) {
                    await prisma.twitterStats.upsert({
                        where: {
                            accountId_date: {
                                accountId: account.id,
                                date: today
                            }
                        },
                        update: {
                            [actionField]: { increment: 1 }
                        },
                        create: {
                            accountId: account.id,
                            date: today,
                            [actionField]: 1
                        }
                    });
                }
            }

            // Create notification in database
            await prisma.notification.create({
                data: {
                    userId: 'temp-user-id',
                    type: 'JOB_COMPLETED',
                    title: `Tâche terminée: ${data.action}`,
                    message: `Compte: ${data.username} - Statut: ${data.status}`,
                    read: false
                }
            });
            
            // Broadcast to all clients
            io.emit('notification', {
                type: 'JOB_COMPLETED',
                title: `Tâche terminée`,
                message: `${data.action} - ${data.username}`,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error creating notification:', error);
        }
    });
    
    socket.on('job_failed', async (data) => {
        try {
            // Find the account by username
            const account = await prisma.twitterAccount.findFirst({
                where: { username: data.username }
            });

            // Create activity log entry with FAILED status
            if (account) {
                await prisma.activityLog.create({
                    data: {
                        accountId: account.id,
                        action: data.action || 'unknown',
                        message: data.error || data.message || `Action ${data.action} failed`,
                        status: 'FAILED',
                        details: { error: data.error, ...data.details }
                    }
                });
            }

            await prisma.notification.create({
                data: {
                    userId: 'temp-user-id',
                    type: 'JOB_FAILED',
                    title: `Échec de la tâche: ${data.action}`,
                    message: `Compte: ${data.username} - Erreur: ${data.error}`,
                    read: false
                }
            });
            
            io.emit('notification', {
                type: 'JOB_FAILED',
                title: `Tâche échouée`,
                message: `${data.action} - ${data.username}`,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error creating notification:', error);
        }
    });
    
    socket.on('ban_detected', async (data) => {
        try {
            // Create ban alert
            await prisma.banAlert.create({
                data: {
                    accountId: data.accountId,
                    alertType: data.alertType || 'BAN',
                    message: data.message,
                    notified: true,
                    resolved: false
                }
            });
            
            // Create notification
            await prisma.notification.create({
                data: {
                    userId: 'temp-user-id',
                    type: 'BAN',
                    title: `⚠️ Compte banni: ${data.username}`,
                    message: data.message,
                    read: false
                }
            });
            
            // Broadcast urgent notification
            io.emit('notification', {
                type: 'BAN',
                title: `⚠️ ALERTE: Compte banni!`,
                message: `${data.username} - ${data.message}`,
                timestamp: new Date().toISOString(),
                urgent: true
            });
        } catch (error) {
            console.error('Error creating ban notification:', error);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
    });
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
