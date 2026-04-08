import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { twitterWorkerHandler } from './twitter';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { PrismaClient } from '@prisma/client';
import { io } from 'socket.io-client';
import dotenv from 'dotenv';
import { twitterScheduler } from './utils/scheduler';

dotenv.config();

const prisma = new PrismaClient();
const socket = io(process.env.BACKEND_SOCKET_URL || 'http://saas-backend:4000');
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
 * Warm Up Logic (Refined for Anti-Ban)
 */
async function warmUp(page: any, username: string) {
    socket.emit('worker_log', { username, message: '🛡️ Warm Up "Human-Like" en cours...' });

    // 1. Random Feed Interactions
    for (let i = 0; i < randomRange(4, 7); i++) {
        await humanMove(page);
        await humanScroll(page);
        if (Math.random() > 0.7) {
            socket.emit('worker_log', { username, message: 'Liking a post in feed...' });
            const hearts = await page.$$('svg[aria-label="Like"]');
            if (hearts.length > 0) await hearts[randomRange(0, Math.min(2, hearts.length - 1))].click();
            await sleep(randomRange(2000, 4000));
        }
    }

    // 2. Story Watching (Deep simulation)
    socket.emit('worker_log', { username, message: 'Simulation de visionnage de stories...' });
    try {
        await page.click('canvas', { timeout: 3000 }).catch(() => null);
        const watchTime = randomRange(30, 50);
        for (let s = 0; s < watchTime; s += 5) {
            await sleep(5000);
            socket.emit('worker_log', { username, message: `Watching stories... (${s}s/${watchTime}s)` });
            if (Math.random() > 0.8) await page.keyboard.press('ArrowRight'); // Next story
        }
    } catch (e) { }

    socket.emit('worker_log', { username, message: '✅ Cycle Human-Like terminé.' });
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
            headless: false, // On met à false pour voir la fenêtre si besoin
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
        const screenshotInterval = setInterval(async () => {
            try {
                const screenshot = await page.screenshot({ type: 'jpeg', quality: 30 });
                socket.emit('worker_screenshot', { username, image: screenshot.toString('base64') });
            } catch (e) { }
        }, 4000);

        try {
            await page.goto('https://www.instagram.com', { waitUntil: 'networkidle' });

            // Safety: Random initial pause
            await sleep(randomRange(2000, 5000));

            if (action === 'warmUp') {
                await warmUp(page, username);
            } else if (action === 'follow') {
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
            clearInterval(screenshotInterval);
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
        concurrency: 1
    }
);

twitterWorker.on('ready', () => {
    console.log('✅ Twitter Worker is successfully connected to Redis and ready for jobs!');
    
    // Start the automatic scheduler for Twitter actions
    twitterScheduler.start().catch(err => {
        console.error('Failed to start scheduler:', err);
    });
});

twitterWorker.on('active', (job) => {
    console.log(`🚀 Job ${job.id} started. Action: ${job.data.action}`);
});

twitterWorker.on('completed', (job) => {
    console.log(`🏁 Job ${job.id} finished successfully.`);
});

twitterWorker.on('failed', (job, err) => {
    console.error(`❌ Job ${job?.id} failed with error:`, err.message);
});

console.log('Worker Booted! Waiting for jobs...');
