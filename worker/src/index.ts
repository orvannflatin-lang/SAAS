import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { twitterWorkerHandler } from './twitter';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import prisma from './utils/prisma';
import { io } from 'socket.io-client';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { twitterScheduler } from './utils/scheduler';

dotenv.config();

console.log("🚀 WORKER PROCESS STARTED - ATTEMPTING TO INITIALIZE...");

process.on('uncaughtException', (err) => {
    console.error('🔥 CRITICAL ERROR (Uncaught Exception):', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 CRITICAL ERROR (Unhandled Rejection):', reason);
});

// Graceful shutdown behavior
const gracefulShutdown = async (signal: string) => {
    console.log(`\n🔴 Received ${signal}, starting graceful shutdown...`);
    try {
        if (typeof twitterWorker !== 'undefined') {
            await twitterWorker.close();
        }
        process.exit(0);
    } catch (e) {
        console.error('Error during shutdown:', e);
        process.exit(1);
    }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

const logFile = path.join(process.cwd(), 'worker_debug.log');
const debugLog = (msg: string) => {
    try {
        const entry = `[${new Date().toISOString()}] ${msg}\n`;
        fs.appendFileSync(logFile, entry);
    } catch (e: any) {
        console.error(`Failed to write to ${logFile}: ${e.message}`);
    }
    console.log(msg);
};

const HEADLESS = process.env.HEADLESS !== 'false'; // Default to true unless explicitly false
// const prisma = new PrismaClient(); // Handled by singleton import
const socket = io(process.env.BACKEND_SOCKET_URL || 'http://saas-backend:4000', {
    transports: ['websocket'],
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
});

debugLog("👷 Worker starting up...");

// Log socket connection status
socket.on('connect', () => {
    debugLog(`✅ Socket connected to backend: ${socket.id}`);
});

socket.on('disconnect', () => {
    debugLog(`❌ Socket disconnected from backend`);
});

socket.on('connect_error', (error) => {
    debugLog(`❌ Socket connection error: ${error.message}`);
});

chromium.use(stealth());

const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null,
});

/**
 * Human Simulation Helpers
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const randomRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
];

async function humanMove(page: any) {
    if (Math.random() > 0.4) return;
    const width = page.viewportSize()?.width || 1280;
    const height = page.viewportSize()?.height || 720;
    
    const midX = width / 2 + randomRange(-450, 450);
    const midY = height / 2 + randomRange(-350, 350);
    await page.mouse.move(midX, midY, { steps: randomRange(10, 25) }).catch(()=>{});
}

async function humanScroll(page: any) {
    const amount = randomRange(300, 700);
    const chunks = randomRange(2, 4);
    for(let j=0; j<chunks; j++) {
        await page.mouse.wheel(0, amount / chunks);
        await sleep(randomRange(50, 200));
    }
    await sleep(randomRange(1500, 3500));
}

/**
 * Main Worker Logic
 */
const worker = new Worker(
    'instagram-actions',
    async (job) => {
        const { accountId, action } = job.data;
        const account = await prisma.iGAccount.findUnique({
            where: { id: accountId },
            include: { proxy: true }
        });

        if (!account) throw new Error('Account not found');
        const username = account.username;
        socket.emit('worker_state', { username, state: 'STARTING' });
        await prisma.iGAccount.update({ where: { id: accountId }, data: { status: 'ACTIVE' } });

        const proxyConfig = account.proxy ? {
            server: `http://${account.proxy.host}:${account.proxy.port}`,
            username: account.proxy.username || undefined,
            password: account.proxy.password || undefined,
        } : undefined;

        const browser = await chromium.launch({
            headless: HEADLESS,
            // channel: 'chrome',
            proxy: proxyConfig,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-notifications'
            ],
            ignoreDefaultArgs: ['--enable-automation'],
            timeout: 60000
        });

        const userAgent = USER_AGENTS[randomRange(0, USER_AGENTS.length - 1)];
        const context = await browser.newContext({ 
            userAgent,
            viewport: { width: 1280, height: 720 },
            locale: 'en-US,en;q=0.9',
            timezoneId: 'America/New_York',
            extraHTTPHeaders: {
                'Accept-Language': 'en-US,en;q=0.9',
            }
        });

        // Mask automation
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            // @ts-ignore
            window.chrome = { runtime: {} };
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        });
        if (account.sessionCookies) await context.addCookies(account.sessionCookies as any);

        const page = await context.newPage();

        // Fast Screenshot Interval for Dashboard
        const screenshotIntervalMs = process.env.SCREENSHOT_INTERVAL_MS
            ? Math.max(2000, parseInt(process.env.SCREENSHOT_INTERVAL_MS, 10))
            : 15000;
        const enableScreenshots = process.env.ENABLE_SCREENSHOTS === 'true';
        const screenshotInterval = enableScreenshots ? setInterval(async () => {
            try {
                const screenshot = await page.screenshot({ type: 'jpeg', quality: 25 });
                socket.emit('worker_screenshot', { username, image: screenshot.toString('base64') });
            } catch (e: any) {
                // If it's a "Target closed" error, just stop the interval
                if (e.message.includes('closed')) {
                    if (screenshotInterval) clearInterval(screenshotInterval);
                } else {
                    debugLog(`⚠️ Screenshot fail for ${username}: ${e.message}`);
                }
            }
        }, screenshotIntervalMs) : null;

        try {
            await page.goto('https://www.instagram.com', { waitUntil: 'networkidle' });

            // Safety: Random initial pause
            await sleep(randomRange(2000, 5000));

            if (action === 'follow') {
                // Human-like follow logic here
                socket.emit('worker_log', { username, message: 'Action : Follow Target...' });
                // Simulation...
            }

            const cookies = await context.cookies();
            await prisma.iGAccount.update({
                where: { id: accountId },
                data: { sessionCookies: cookies as any, status: 'ACTIVE' }
            });

            return { success: true };
        } catch (error: any) {
            socket.emit('worker_error', { username, message: error.message });
            throw error;
        } finally {
            if (screenshotInterval) clearInterval(screenshotInterval);
            await browser.close();
            socket.emit('worker_state', { username, state: 'IDLE' });
            await prisma.iGAccount.update({ where: { id: accountId }, data: { status: 'ACTIVE' } });
        }
    },
    { connection: redisConnection }
);

/**
 * Twitter Worker Logic
 */
const twitterWorker = new Worker(
    'twitter-actions',
    twitterWorkerHandler,
    { 
        connection: redisConnection,
        concurrency: process.env.WORKER_CONCURRENCY ? parseInt(process.env.WORKER_CONCURRENCY) : 3
    }
);

twitterWorker.on('ready', () => {
    debugLog('✅ Twitter Worker is successfully connected to Redis and ready for jobs!');
    
    // Start the automatic scheduler for Twitter actions
    twitterScheduler.start().catch(err => {
        debugLog(`❌ Failed to start scheduler: ${err.message}`);
    });
});

twitterWorker.on('active', (job) => {
    debugLog(`🚀 Job ${job.id} started. Action: ${job.data.action}`);
});

twitterWorker.on('completed', async (job) => {
    debugLog(`🏁 Job ${job.id} finished successfully.`);
    
    // Emit notification to backend
    try {
        socket.emit('job_completed', {
            jobId: job.id,
            action: job.data.action,
            username: job.data.username || 'Unknown',
            accountId: job.data.accountId,
            status: 'SUCCESS',
            groupId: job.data.groupId,
            groupName: job.data.groupName,
            postUrl: job.data.postUrl
        });
    } catch (error: any) {
        debugLog(`❌ Error emitting job_completed: ${error.message}`);
    }
});

twitterWorker.on('failed', async (job, err) => {
    debugLog(`❌ Job ${job?.id} failed with error: ${err.message}`);
    
    // Emit notification to backend
    try {
        socket.emit('job_failed', {
            jobId: job?.id,
            action: job?.data.action || 'Unknown',
            username: job?.data.username || 'Unknown',
            accountId: job?.data.accountId,
            error: err.message,
            status: 'FAILED',
            groupId: job?.data.groupId,
            groupName: job?.data.groupName
        });
    } catch (error: any) {
        debugLog(`❌ Error emitting job_failed: ${error.message}`);
    }
});

console.log('Worker Booted! Waiting for jobs...');
