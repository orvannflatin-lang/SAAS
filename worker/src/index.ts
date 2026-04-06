import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { twitterWorkerHandler } from './twitter';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { PrismaClient } from '@prisma/client';
import { io } from 'socket.io-client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const socket = io(process.env.BACKEND_SOCKET_URL || 'http://saas-backend:4000');
chromium.use(stealth());

const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://redis:6379', {
    maxRetriesPerRequest: null,
});

/**
 * Human Simulation Helpers
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const randomRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

async function humanMove(page: any) {
    const x = randomRange(0, 1000);
    const y = randomRange(0, 800);
    await page.mouse.move(x, y, { steps: 10 });
}

async function humanScroll(page: any) {
    const amount = randomRange(300, 700);
    await page.mouse.wheel(0, amount);
    await sleep(randomRange(1000, 3000));
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

        const proxyConfig = account.proxy ? {
            server: `http://${account.proxy.host}:${account.proxy.port}`,
            username: account.proxy.username || undefined,
            password: account.proxy.password || undefined,
        } : undefined;

        const browser = await chromium.launch({
            headless: true, // Required for Docker without X11
            proxy: proxyConfig,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
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
    { connection: redisConnection }
);
