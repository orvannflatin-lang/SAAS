import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PrismaClient, AccountStatus, UserRole } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import multer from 'multer';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticateToken, isAdmin, AuthRequest } from './middleware/auth';
import { upload } from './middleware/upload';
import { startOrchestrator } from './services/orchestrator';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'ghost-content-secret-key-2024';

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 4000;
const backendPublicUrl = (process.env.BACKEND_PUBLIC_URL || '').replace(/\/$/, '');

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
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ['websocket']
});

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

app.use(cors({
  origin: [frontendUrl, 'http://localhost:3000', 'https://ghostcontent.vercel.app'].filter(
    (o, i, a) => o && a.indexOf(o) === i
  ),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 204,
}));
app.use(express.json());

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Helper function to map action to stats field
function getActivityField(action: string): string | null {
    const actionMap: Record<string, string> = {
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

// --- AUTH ENDPOINTS ---

/**
 * Register a new user
 */
app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Check if this is the first user to make them admin automatically
        const userCount = await prisma.user.count();
        const isFirstUser = userCount === 0;

        const user = await prisma.user.create({
            data: { 
                email, 
                password: hashedPassword,
                isActive: isFirstUser, // Auto-activate first user
                role: isFirstUser ? UserRole.ADMIN : UserRole.USER
            }
        });
        res.status(201).json({ 
            message: isFirstUser 
                ? 'Administrateur créé et activé avec succès' 
                : 'Utilisateur créé avec succès' 
        });
    } catch (error: any) {
        res.status(400).json({ error: 'Email déjà utilisé ou données invalides' });
    }
});

/**
 * Login
 */
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(401).json({ error: 'Identifiants invalides' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: 'Identifiants invalides' });

        const now = new Date();
        const isExpired = user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) < now;

        if (!user.isActive || isExpired) {
            return res.status(403).json({ 
                error: isExpired 
                    ? 'Votre abonnement a expiré, contactez l\'administrateur pour le renouveler.'
                    : 'Votre compte est en attente d\'activation par l\'administrateur. Veuillez procéder au paiement pour activer votre accès.' 
            });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ 
            token, 
            user: { 
                id: user.id, 
                email: user.email, 
                role: user.role,
                subscriptionExpiresAt: user.subscriptionExpiresAt 
            } 
        });
    } catch (error) {
        res.status(500).json({ error: 'Erreur lors de la connexion' });
    }
});

// --- SETTINGS ENDPOINTS ---

/**
 * Get global settings
 */
app.get('/api/settings', authenticateToken, async (req: AuthRequest, res) => {
    const userId = req.user?.id || 'temp-user-id';
    try {
        let settings = await prisma.globalSettings.findUnique({
            where: { userId }
        });

        if (!settings) {
            settings = await prisma.globalSettings.create({
                data: {
                    userId,
                    postIntervalValue: 30,
                    postIntervalUnit: 'MINUTES',
                    commentsPerPostLimit: 5
                }
            });
        }
        res.json(settings);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Update global settings
 */
app.post('/api/settings', authenticateToken, async (req: AuthRequest, res) => {
    const userId = req.user?.id || 'temp-user-id';
    const { postIntervalValue, postIntervalUnit, commentsPerPostLimit, followPerDayLimit, autoSyncMetadata } = req.body;

    try {
        const settings = await prisma.globalSettings.upsert({
            where: { userId },
            update: {
                ...(postIntervalValue !== undefined && { postIntervalValue }),
                ...(postIntervalUnit !== undefined && { postIntervalUnit }),
                ...(commentsPerPostLimit !== undefined && { commentsPerPostLimit }),
                ...(followPerDayLimit !== undefined && { followPerDayLimit }),
                ...(autoSyncMetadata !== undefined && { autoSyncMetadata })
            },
            create: {
                userId,
                postIntervalValue: postIntervalValue || 30,
                postIntervalUnit: postIntervalUnit || 'MINUTES',
                commentsPerPostLimit: commentsPerPostLimit || 5,
                followPerDayLimit: followPerDayLimit || 20,
                autoSyncMetadata: autoSyncMetadata !== undefined ? autoSyncMetadata : true
            }
        });
        res.json(settings);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// --- ADMIN ENDPOINTS ---

/**
 * Get all users (Admin)
 */
app.get('/api/admin/users', authenticateToken, isAdmin, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                role: true,
                isActive: true,
                subscriptionExpiresAt: true,
                subscription: true,
                createdAt: true
            }
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs' });
    }
});

/**
 * Update user status (Admin)
 */
app.patch('/api/admin/users/:id/status', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { isActive, expiresAt } = req.body;
    try {
        await prisma.user.update({
            where: { id },
            data: { 
                isActive,
                ...(isActive && expiresAt && { subscriptionExpiresAt: new Date(expiresAt) })
            }
        });
        res.json({ success: true, message: `Utilisateur ${isActive ? 'activé' : 'désactivé'}` });
    } catch (error) {
        res.status(400).json({ error: 'Impossible de mettre à jour l\'utilisateur' });
    }
});

/**
 * Update user subscription (Admin)
 */
app.patch('/api/admin/users/:id/subscription', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { expiresAt, subscription } = req.body;
    try {
        await prisma.user.update({
            where: { id },
            data: { 
                ...(expiresAt && { subscriptionExpiresAt: new Date(expiresAt) }),
                ...(subscription && { subscription })
            }
        });
        res.json({ success: true, message: 'Abonnement mis à jour' });
    } catch (error) {
        res.status(400).json({ error: 'Impossible de mettre à jour l\'abonnement' });
    }
});

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
app.get('/api/accounts', authenticateToken, async (req: AuthRequest, res) => {
    const accounts = await prisma.iGAccount.findMany({
        include: { proxy: true }
    });
    res.json(accounts);
});

/**
 * Add a new account + proxy
 */
app.post('/api/accounts', authenticateToken, async (req: AuthRequest, res) => {
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
app.delete('/api/accounts/:id', authenticateToken, async (req: AuthRequest, res) => {
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
app.post('/api/accounts/:id/action', authenticateToken, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { action } = req.body; // e.g., 'follow'

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
app.get('/api/twitter-accounts', authenticateToken, async (req: AuthRequest, res) => {
    const userId = req.user?.id || 'temp-user-id';
    const accounts = await prisma.twitterAccount.findMany({
        where: { userId },
        include: { proxy: true }
    });
    res.json(accounts);
});

/**
 * Add a new Twitter account + proxy WITH authToken support
 */
app.post('/api/twitter-accounts', authenticateToken, async (req: AuthRequest, res) => {
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

    // Extract ct0 from cookies if not provided separately
    const ct0Cookie = cookies.find((cookie: any) => cookie.name === 'ct0');
    const finalCt0 = ct0 || (ct0Cookie ? ct0Cookie.value : null);

    try {
        // Check if username already exists
        const existingTwitterAccount = await prisma.twitterAccount.findUnique({
            where: { username }
        });

        if (existingTwitterAccount) {
            return res.status(400).json({ 
                error: `Le compte @${username} est déjà enregistré. Veuillez le modifier ou le supprimer s'il s'agit d'une erreur.` 
            });
        }

        const userId = (req as AuthRequest).user?.id || 'temp-user-id';

        const newAccount = await prisma.twitterAccount.create({
            data: {
                username,
                password: username, // Temporary, cookies are used for auth
                email: null,
                emailPassword: null,
                type: type || 'MAIN',
                status: 'ACTIVE', // Active since we have valid cookies
                sessionCookies: cookies,
                userId,
                proxy: proxy ? {
                    create: {
                        host: proxy.host,
                        port: parseInt(proxy.port),
                        protocol: proxy.protocol === 'socks5' ? 'socks5' : 'http',
                        username: proxy.username,
                        password: proxy.password,
                        rotateIpUrl: proxy.rotateIpUrl || null
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
 * Update a Twitter account
 */
app.put('/api/twitter-accounts/:id', authenticateToken, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { username, password, email, sessionCookies, type, groupId, proxy } = req.body;

    try {
        // Validate if account exists
        const existingAccount = await prisma.twitterAccount.findUnique({ where: { id } });
        if (!existingAccount) {
            return res.status(404).json({ error: 'Compte non trouvé' });
        }

        // Update technical fields if provided
        const updateData: any = {};
        if (username) {
            if (username !== existingAccount.username) {
                const usernameExists = await prisma.twitterAccount.findUnique({
                    where: { username }
                });
                if (usernameExists) {
                    return res.status(400).json({ error: `Le nom d'utilisateur @${username} est déjà utilisé par un autre compte.` });
                }
            }
            updateData.username = username;
        }
        if (password) updateData.password = password;
        if (email !== undefined) updateData.email = email;
        if (sessionCookies) updateData.sessionCookies = sessionCookies;
        if (type) updateData.type = type;
        if (groupId) updateData.groupId = groupId;

        // Handle proxy update
        if (proxy) {
            // First check if a proxy already exists
            const existingProxy = await prisma.twitterProxy.findUnique({ where: { accountId: id } });
            if (existingProxy) {
                await prisma.twitterProxy.update({
                    where: { accountId: id },
                    data: {
                        host: proxy.host,
                        port: parseInt(proxy.port),
                        protocol: proxy.protocol === 'socks5' ? 'socks5' : 'http',
                        username: proxy.username,
                        password: proxy.password,
                        ...(proxy.rotateIpUrl !== undefined ? { rotateIpUrl: proxy.rotateIpUrl || null } : {})
                    }
                });
            } else {
                await prisma.twitterProxy.create({
                    data: {
                        accountId: id,
                        host: proxy.host,
                        port: parseInt(proxy.port),
                        protocol: proxy.protocol === 'socks5' ? 'socks5' : 'http',
                        username: proxy.username,
                        password: proxy.password,
                        rotateIpUrl: proxy.rotateIpUrl || null
                    }
                });
            }
        }

        const updatedAccount = await prisma.twitterAccount.update({
            where: { id },
            data: updateData,
            include: {
                group: true,
                proxy: true
            }
        });

        res.json(updatedAccount);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * Update Twitter account profile (bio, images, niche)
 */
app.patch('/api/twitter-accounts/:id/profile', authenticateToken, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { bio, niche, profileImage, bannerImage } = req.body;

    try {
        const account = await prisma.twitterAccount.findUnique({ where: { id } });
        if (!account) return res.status(404).json({ error: 'Compte non trouvé' });

        const updated = await prisma.twitterAccount.update({
            where: { id },
            data: {
                ...(bio !== undefined && { bio }),
                ...(niche !== undefined && { niche }),
                ...(profileImage !== undefined && { profileImage }),
                ...(bannerImage !== undefined && { bannerImage }),
            }
        });

        res.json(updated);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * Delete a Twitter account
 */
app.delete('/api/twitter-accounts/:id', authenticateToken, async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
        console.log(`🗑️ Backend: Attempting to delete Twitter account ${id}...`);
        
        await prisma.$transaction(async (tx) => {
            // Delete all related records first (Cascading manual cleanup)
            await tx.activityLog.deleteMany({ where: { accountId: id } });
            await tx.banAlert.deleteMany({ where: { accountId: id } });
            await tx.twitterPost.deleteMany({ where: { accountId: id } });
            await tx.twitterStats.deleteMany({ where: { accountId: id } });
            
            // Delete the proxy if it exists
            await tx.twitterProxy.deleteMany({ where: { accountId: id } });
            
            // Finally delete the account
            await tx.twitterAccount.delete({ where: { id } });
        });

        console.log(`✅ Backend: Account ${id} and all related data deleted.`);
        res.json({ success: true, message: "Compte Twitter supprimé avec succès." });
    } catch (error: any) {
        console.error(`❌ Backend: Delete Failed for ${id}:`, error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Trigger an automation action for Twitter
 */
app.post('/api/twitter-accounts/:id/action', authenticateToken, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { action } = req.body; // e.g., 'setupProfile', 'joinCommunities', 'post', 'comment'

    console.log(`[Backend] Received action request for Twitter account ${id}: ${action}`);

    try {
        const account = await prisma.twitterAccount.findUnique({ where: { id } });
        if (!account) return res.status(404).json({ error: 'Compte introuvable' });

        let config = req.body.config || {};
        if ((action === 'joinCommunity' || action === 'postCommunity') && !config.url && !config.communityUrl) {
            const activeCampaign = await prisma.campaign.findFirst({
                where: {
                    userId: account.userId,
                    isActive: true,
                    OR: [
                        ...(account.groupId ? [{ groupId: account.groupId }] : []),
                        { groupId: null }
                    ]
                },
                include: { contents: true },
                orderBy: { updatedAt: 'desc' }
            });

            const campaignCommunity = activeCampaign?.targetCommunities?.[0];
            const contentCommunity = activeCampaign?.contents?.find((c) => !!c.targetCommunity)?.targetCommunity;
            const selectedCommunity = req.body.communityUrl || contentCommunity || campaignCommunity;
            if (selectedCommunity) {
                config = { ...config, url: selectedCommunity, communityUrl: selectedCommunity };
            }
        }

        const job = await twitterQueue.add(action, { accountId: id, action, config, username: account.username });
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
app.post('/api/twitter-posts', authenticateToken, async (req: AuthRequest, res) => {
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
app.get('/api/groups', authenticateToken, async (req: AuthRequest, res) => {
    const userId = req.user?.id || 'temp-user-id';
    try {
        const groups = await prisma.accountGroup.findMany({
            where: { userId },
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
app.post('/api/groups', authenticateToken, async (req: AuthRequest, res) => {
    const { name, description, taskType, schedule, accountIds } = req.body;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ error: 'Non authentifié' });

    try {
        const group = await prisma.accountGroup.create({
            data: {
                name,
                description,
                taskType,
                schedule,
                userId,
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
app.patch('/api/groups/:id', authenticateToken, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { name, description, taskType, schedule, isActive, accountIds } = req.body;
    const userId = req.user?.id;

    try {
        // Verify ownership
        const existingGroup = await prisma.accountGroup.findFirst({
            where: { id, userId }
        });
        if (!existingGroup) return res.status(404).json({ error: 'Group not found or unauthorized' });

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
app.patch('/api/twitter-accounts/:id/group', authenticateToken, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { groupId } = req.body;
    const userId = req.user?.id;

    if (!groupId) {
        return res.status(400).json({ error: 'groupId is required' });
    }

    try {
        // Verify group exists and belongs to user
        const group = await prisma.accountGroup.findFirst({
            where: { id: groupId, userId }
        });

        if (!group) {
            return res.status(404).json({ error: 'Group not found or unauthorized' });
        }

        // Verify account belongs to user
        const existingAccount = await prisma.twitterAccount.findFirst({
            where: { id, userId }
        });
        if (!existingAccount) return res.status(404).json({ error: 'Account not found or unauthorized' });

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
app.delete('/api/groups/:id', authenticateToken, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const userId = req.user?.id;

    try {
        // Verify ownership
        const existingGroup = await prisma.accountGroup.findFirst({
            where: { id, userId }
        });
        if (!existingGroup) return res.status(404).json({ error: 'Group not found or unauthorized' });

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
app.get('/api/templates', authenticateToken, async (req: AuthRequest, res) => {
    const userId = req.user?.id || 'temp-user-id';
    try {
        const templates = await prisma.contentTemplate.findMany({
            where: { userId },
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
app.post('/api/templates', authenticateToken, async (req: AuthRequest, res) => {
    const { name, content, type, mediaUrls, spinTax, hashtags } = req.body;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ error: 'Non authentifié' });

    try {
        const template = await prisma.contentTemplate.create({
            data: {
                name,
                content,
                type,
                mediaUrls: mediaUrls || [],
                spinTax,
                hashtags: hashtags || [],
                userId
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
app.delete('/api/templates/:id', authenticateToken, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const userId = req.user?.id;

    try {
        // Verify ownership
        const existingTemplate = await prisma.contentTemplate.findFirst({
            where: { id, userId }
        });
        if (!existingTemplate) return res.status(404).json({ error: 'Template not found or unauthorized' });

        await prisma.contentTemplate.delete({ where: { id } });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/activities', authenticateToken, async (req: AuthRequest, res) => {
    const userId = req.user?.id || 'temp-user-id';
    const { accountId, action, status, limit = 100 } = req.query;

    try {
        const activities = await prisma.activityLog.findMany({
            where: {
                ...(accountId && { accountId: accountId as string }),
                ...(action && { action: action as string }),
                ...(status && { status: status as string }),
                account: { userId } // Filter by user id
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
                userId: (req as AuthRequest).user?.id || 'temp-user-id'
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
app.get('/api/comment-requests', authenticateToken, async (req: AuthRequest, res) => {
    const userId = req.user?.id || 'temp-user-id';
    try {
        const requests = await prisma.commentRequest.findMany({
            where: { userId },
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

        // Generate URL for the uploaded file (public URL for social crawlers like Twitter)
        const fileUrl = backendPublicUrl
            ? `${backendPublicUrl}/uploads/${req.file.filename}`
            : `http://localhost:${port}/uploads/${req.file.filename}`;

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

// --- LINK CAST API ---
app.post('/api/link-cast', authenticateToken, async (req: AuthRequest, res) => {
    const { imageUrl, targetUrl } = req.body;
    if (!imageUrl || !targetUrl) return res.status(400).json({ error: 'imageUrl et targetUrl sont requis' });

    try {
        const slug = Math.random().toString(36).slice(2, 10);
        const userId = req.user?.id;
        await prisma.linkCast.create({
            data: {
                slug,
                imageUrl,
                targetUrl,
                ...(userId ? { userId } : {}),
            },
        });
        res.status(201).json({ slug, imageUrl, targetUrl });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/link-cast/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const row = await prisma.linkCast.findUnique({ where: { slug } });
        if (!row) return res.status(404).json({ error: 'Slug introuvable' });
        res.json({
            slug: row.slug,
            imageUrl: row.imageUrl,
            targetUrl: row.targetUrl,
            createdAt: row.createdAt.toISOString(),
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// --- BAN DETECTION & NOTIFICATIONS API ---

app.get('/api/ban-alerts', authenticateToken, async (req: AuthRequest, res) => {
    const userId = req.user?.id || 'temp-user-id';
    const { accountId } = req.query;

    try {
        const alerts = await prisma.banAlert.findMany({
            where: {
                ...(accountId && { accountId: accountId as string }),
                account: { userId }
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
                userId: (req as any).user?.id || 'temp-user-id',
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

// --- CAMPAIGNS API ---

/**
 * Get all campaigns
 */
app.get('/api/campaigns', authenticateToken, async (req: AuthRequest, res) => {
    const userId = req.user?.id || 'temp-user-id';
    try {
        const campaigns = await prisma.campaign.findMany({
            where: { userId },
            include: { contents: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(campaigns);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Create a new campaign
 */
app.post('/api/campaigns', authenticateToken, async (req: AuthRequest, res) => {
    const { name, description, type, postsPerAccount, commentsPerPost, totalCommentsQuota, targetCommunities } = req.body;
    const userId = req.user?.id || 'temp-user-id';
    try {
        const campaign = await prisma.campaign.create({
            data: {
                name,
                description,
                type: 'POST',
                userId,
                groupId: (req.body.groupId || null),
                postsPerAccount: postsPerAccount !== undefined ? parseInt(postsPerAccount) : 3,
                commentsPerPost: commentsPerPost !== undefined ? parseInt(commentsPerPost) : 5,
                totalCommentsQuota: totalCommentsQuota !== undefined ? parseInt(totalCommentsQuota) : 50,
                targetCommunities: targetCommunities || []
            }
        });
        res.status(201).json(campaign);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * Update campaign settings (PATCH et PUT — PUT évite les vieux caches CORS sans PATCH)
 */
const handleUpdateCampaign = async (req: AuthRequest, res: express.Response) => {
    const { id } = req.params;
    const userId = req.user?.id || 'temp-user-id';
    const { name, description, type, postsPerAccount, commentsPerPost, totalCommentsQuota, targetCommunities, isActive } = req.body;
    try {
        const existing = await prisma.campaign.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Campagne introuvable', code: 'NOT_FOUND' });
        }
        const isOwner = existing.userId === userId;
        const isAdminUser = req.user?.role === UserRole.ADMIN;
        if (!isOwner && !isAdminUser) {
            return res.status(403).json({
                error: 'Cette campagne n’appartient pas à votre compte.',
                code: 'FORBIDDEN',
            });
        }

        const campaign = await prisma.campaign.update({
            where: { id },
            data: {
                ...(name && { name }),
                ...(description !== undefined && { description }),
                ...(type !== undefined && { type }),
                ...(postsPerAccount !== undefined && { postsPerAccount: parseInt(postsPerAccount) }),
                ...(commentsPerPost !== undefined && { commentsPerPost: parseInt(commentsPerPost) }),
                ...(totalCommentsQuota !== undefined && { totalCommentsQuota: parseInt(totalCommentsQuota) }),
                ...(targetCommunities !== undefined && { targetCommunities }),
                ...(isActive !== undefined && { isActive }),
                ...(req.body.groupId !== undefined && { groupId: req.body.groupId })
            }
        });
        res.json(campaign);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
app.patch('/api/campaigns/:id', authenticateToken, handleUpdateCampaign);
app.put('/api/campaigns/:id', authenticateToken, handleUpdateCampaign);
/** Chemins alternatifs (moins ambigus pour certains reverse-proxy / vieux clients) */
app.put('/api/update-campaign/:id', authenticateToken, handleUpdateCampaign);
app.post('/api/update-campaign/:id', authenticateToken, handleUpdateCampaign);

/**
 * Delete a campaign and its content pool (DELETE + POST /delete pour CORS / proxies stricts)
 */
const handleDeleteCampaign = async (req: AuthRequest, res: express.Response) => {
    const { id } = req.params;
    const userId = req.user?.id || 'temp-user-id';
    try {
        const existing = await prisma.campaign.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Campagne introuvable', code: 'NOT_FOUND' });
        }
        const isOwner = existing.userId === userId;
        const isAdminUser = req.user?.role === UserRole.ADMIN;
        if (!isOwner && !isAdminUser) {
            return res.status(403).json({
                error: 'Cette campagne n’appartient pas à votre compte.',
                code: 'FORBIDDEN',
            });
        }

        await prisma.$transaction([
            prisma.campaignContent.deleteMany({ where: { campaignId: id } }),
            prisma.campaign.delete({ where: { id } })
        ]);
        res.json({ success: true });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
app.delete('/api/campaigns/:id', authenticateToken, handleDeleteCampaign);
app.post('/api/campaigns/:id/delete', authenticateToken, handleDeleteCampaign);
app.post('/api/delete-campaign/:id', authenticateToken, handleDeleteCampaign);

/**
 * Toggle Campaign and update interval settings
 */
app.post('/api/campaigns/:id/toggle', authenticateToken, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { isActive, intervalValue, intervalUnit } = req.body;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ error: 'Non authentifié' });

    try {
        const campaign = await prisma.campaign.findFirst({
            where: { id, userId }
        });
        if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

        // Update campaign settings
        const updatedCampaign = await prisma.campaign.update({
            where: { id },
            data: { 
                isActive,
                ...(intervalValue !== undefined && { postIntervalValue: parseInt(intervalValue, 10) }),
                ...(intervalUnit !== undefined && { postIntervalUnit: intervalUnit })
            }
        });

        // Toggle account auto mode based on campaign type/scope
        if (updatedCampaign.groupId) {
            await prisma.twitterAccount.updateMany({
                where: { groupId: updatedCampaign.groupId },
                data: { autoMode: isActive }
            });
        } else {
            await prisma.twitterAccount.updateMany({
                where: { userId, type: 'MAIN' },
                data: { autoMode: isActive }
            });
        }

        if (isActive) {
             startOrchestrator();
        }

        res.json(updatedCampaign);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * Master Play/Pause: Toggle Auto-Mode for all accounts
 */
app.post('/api/orchestrator/toggle-all', authenticateToken, async (req: AuthRequest, res) => {
    const { autoMode } = req.body;
    const userId = req.user?.id;
    
    if (!userId) {
         return res.status(401).json({ error: "Utilisateur non identifié" });
    }

    try {
        await prisma.twitterAccount.updateMany({
            where: { userId },
            data: { autoMode }
        });
        
        // Trigger orchestrator instantly if turning ON
        if (autoMode) {
            startOrchestrator();
        }

        res.json({ success: true, message: `Auto-Mode globally set to ${autoMode}` });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Sync Account Metadata from X
 */
app.post('/api/twitter-accounts/:id/sync', authenticateToken, async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
        const job = await twitterQueue.add('syncProfile', { accountId: id });
        res.json({ jobId: job.id, message: "Sync job queued" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Add content to a campaign
 */
app.post('/api/campaigns/:id/content', upload.array('mediaFiles'), async (req: any, res) => {
    const { id } = req.params;
    const { caption, linkUrl, targetCommunity } = req.body;
    
    try {
        const mediaUrls = req.files ? req.files.map((f: any) => `http://localhost:${port}/uploads/${f.filename}`) : [];
        
        const content = await prisma.campaignContent.create({
            data: {
                campaignId: id,
                caption,
                linkUrl,
                targetCommunity,
                mediaUrls
            }
        });
        res.status(201).json(content);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * Delete content from a campaign
 */
app.delete('/api/campaigns/content/:contentId', async (req: any, res) => {
    const { contentId } = req.params;
    try {
        const existing = await prisma.campaignContent.findUnique({ where: { id: contentId } });
        if (!existing) return res.status(404).json({ error: 'Content not found' });
        await prisma.campaignContent.delete({ where: { id: contentId } });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Toggle account Auto-Mode
 */
app.patch('/api/twitter-accounts/:id/auto-mode', async (req, res) => {
    const { id } = req.params;
    const { autoMode } = req.body;
    
    try {
        const account = await prisma.twitterAccount.update({
            where: { id },
            data: { autoMode }
        });
        res.json(account);
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
    socket.on('worker_log', (data) => {
        console.log(`[Worker Log Received]`, data);
        io.emit('ui_log', data);
    });
    socket.on('worker_screenshot', (data) => {
        // Log screenshots briefly to avoid terminal spam
        if (Math.random() > 0.9) console.log(`[Worker Screenshot] from ${data.username}`);
        io.emit('ui_screenshot', data);
    });
    socket.on('worker_state', (data) => {
        console.log(`[Worker State Update]`, data);
        io.emit('ui_state', data);
    });
    
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

            // --- SOCIAL ORCHESTRATION ---
            // If a post was published, trigger support accounts to engage
            const postActions = ['post', 'autoPost', 'postCommunity', 'scheduledPost'];
            if (postActions.includes(data.action) && data.postUrl && account && account.type === 'MAIN') {
                console.log(`📣 Orchestration: Post detected from ${account.username}. Triggering support engagement...`);
                
                // IMPORTANT: Check if there is an active campaign for this group
                const activeCampaign = await prisma.campaign.findFirst({
                    where: { groupId: account.groupId, isActive: true }
                });

                if (!activeCampaign) {
                    console.log(`ℹ️ Orchestration skipped: No active campaign for group ${account.groupId}`);
                    return;
                }

                // Find ALL support accounts for this user (Global Support Pool)
                const supportAccounts = await prisma.twitterAccount.findMany({
                    where: {
                        userId: account.userId,
                        type: 'SUPPORT',
                        groupId: account.groupId, // Restrict to same group
                        status: 'ACTIVE',
                        id: { not: account.id }
                    }
                });

                if (supportAccounts.length > 0) {
                    console.log(`🚀 Scheduling engagement for ${supportAccounts.length} support accounts...`);
                    
                    for (let i = 0; i < supportAccounts.length; i++) {
                        const support = supportAccounts[i];
                        // Stagger engagement: 1-3 minutes random delay per account
                        const delay = (1 + Math.random() * 2) * 60 * 1000;
                        
                        // Queue Auto-Like
                        await twitterQueue.add(
                            `orchestration-like-${support.username}-${Date.now()}`,
                            {
                                accountId: support.id,
                                action: 'autoLike',
                                config: { 
                                    url: data.postUrl,
                                    count: 1 
                                }
                            },
                            { delay: Math.floor(delay), attempts: 2 }
                        );

                        // Queue Auto-Comment (Guarantee 100% engagement)
                        if (true) {
                            await twitterQueue.add(
                                `orchestration-comment-${support.username}-${Date.now()}`,
                                {
                                    accountId: support.id,
                                    action: 'autoComment',
                                    config: {
                                        url: data.postUrl,
                                        comments: [ "Great content! Keep it up 🔥" ], 
                                        count: 1
                                    }
                                },
                                { delay: Math.floor(delay + (2 * 60 * 1000)), attempts: 2 } // 2 min after like
                            );
                        }
                    }
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
    try {
        await prisma.user.upsert({
            where: { id: 'temp-user-id' },
            update: {},
            create: {
                id: 'temp-user-id',
                email: 'admin@duupflow.com',
                password: 'password'
            }
        });
        
        httpServer.listen(Number(port), '0.0.0.0', () => {
            console.log(`🚀 Ghost Content Backend running on http://0.0.0.0:${port}`);
            // Start the Ghost Mastermind Orchestrator
            startOrchestrator();
        });

        // Global Error Handlers to prevent silent crashes
        process.on('uncaughtException', (error) => {
            console.error('🔥 FATAL: Uncaught Exception:', error);
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('🔥 FATAL: Unhandled Rejection at:', promise, 'reason:', reason);
        });
    } catch (e) {
        console.error("🔥 Server failed to start:", e);
    }
}

init().catch(console.error);
