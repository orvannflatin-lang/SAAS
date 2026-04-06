import { chromium, Page } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { PrismaClient } from '@prisma/client';
import { io } from 'socket.io-client';

const prisma = new PrismaClient();
const socket = io(process.env.BACKEND_SOCKET_URL || 'http://saas-backend:4000');

chromium.use(stealth());

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const randomRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

async function typeLikeHuman(page: Page, selector: string, text: string) {
    await page.click(selector, { delay: randomRange(50, 150) });
    for (const char of text) {
        await page.keyboard.type(char, { delay: randomRange(50, 200) });
    }
}

async function doTwitterLogin(page: Page, account: any, emitLog: (msg: string) => void) {
    emitLog('🔒 Navigation vers la page de login...');
    await page.goto('https://x.com/i/flow/login', { waitUntil: 'networkidle' });
    await sleep(randomRange(3000, 5000));

    // Username
    emitLog('✍️ Saisie du nom d\'utilisateur...');
    const userInput = 'input[autocomplete="username"]';
    await page.waitForSelector(userInput, { timeout: 15000 });
    await typeLikeHuman(page, userInput, account.username);
    await sleep(500);
    await page.keyboard.press('Enter');
    await sleep(randomRange(2000, 4000));

    // Unusual activity verification (Email prompt)
    const unusualPrompt = await page.$('input[data-testid="ocfEnterTextTextInput"]');
    if (unusualPrompt && account.email) {
        emitLog('🛡️ Vérification de sécurité détectée, saisie de l\'email...');
        await typeLikeHuman(page, 'input[data-testid="ocfEnterTextTextInput"]', account.email);
        await sleep(500);
        await page.keyboard.press('Enter');
        await sleep(randomRange(2000, 4000));
    }

    // Password
    emitLog('🔑 Saisie du mot de passe...');
    const passInput = 'input[type="password"]';
    await page.waitForSelector(passInput, { timeout: 15000 });
    await typeLikeHuman(page, passInput, account.password);
    await sleep(500);
    await page.keyboard.press('Enter');
    
    // Wait for the timeline to load to confirm login
    emitLog('⏳ Vérification du succès de la connexion...');
    try {
        await page.waitForSelector('nav[aria-label="Primary"]', { timeout: 15000 });
        emitLog('✅ Connexion réussie !');
        return true;
    } catch (e) {
        emitLog('❌ Échec de la connexion (Vérifiez les identifiants ou compte suspect/banni).');
        return false;
    }
}

async function doWarmUp(page: Page, emitLog: (msg: string) => void) {
    emitLog('🐦 Warm Up : Navigation de la page principale...');
    await page.goto('https://x.com/home', { waitUntil: 'networkidle' });
    await sleep(randomRange(2000, 5000));
    
    // Smooth scrolling simulation
    const scrollCycles = randomRange(4, 7);
    for (let i = 0; i < scrollCycles; i++) {
        // Scroll down
        await page.mouse.wheel(0, randomRange(300, 800));
        await sleep(randomRange(1500, 4000)); // Reading time

        if (Math.random() > 0.7) {
            emitLog('👀 Arrêt prolongé pour lire un long thread...');
            await sleep(randomRange(3000, 8000));
        }

        // Like a tweet sometimes
        if (Math.random() > 0.8) {
            emitLog('❤️ Liker un tweet au hasard...');
            try {
                // Find all unliked buttons visible
                const likeButtons = await page.$$('button[data-testid="like"]');
                if (likeButtons.length > 0) {
                    const btn = likeButtons[randomRange(0, likeButtons.length - 1)];
                    await btn.scrollIntoViewIfNeeded();
                    await sleep(randomRange(500, 1000));
                    await btn.click({ delay: randomRange(50, 100) });
                    emitLog('✅ Action : Nouveau j\'aime.');
                }
            } catch (err) {
                // If it fails, keep acting normal
            }
        }
    }
    emitLog('✅ Phase d\'échauffement terminée avec succès.');
}

export const twitterWorkerHandler = async (job: any) => {
    const { accountId, action } = job.data;
    const account = await prisma.twitterAccount.findUnique({
        where: { id: accountId },
        include: { proxy: true }
    });

    if (!account) throw new Error('Twitter Account not found');
    const username = account.username;
    const emitLog = (msg: string) => socket.emit('worker_log', { username, message: msg });

    socket.emit('worker_state', { username, state: 'STARTING_TWITTER' });

    const proxyConfig = account.proxy ? {
        server: `http://${account.proxy.host}:${account.proxy.port}`,
        username: account.proxy.username || undefined,
        password: account.proxy.password || undefined,
    } : undefined;

    const browser = await chromium.launch({
        headless: true, // Required for Docker without X11
        proxy: proxyConfig,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-notifications']
    });

    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36' });
    
    // Check if we are already logged in through sessionCookies
    let isAuthenticated = false;
    if (account.sessionCookies && Array.isArray(account.sessionCookies) && account.sessionCookies.length > 0) {
        await context.addCookies(account.sessionCookies as any);
        isAuthenticated = true; // Attempting to use cookies
    }

    const page = await context.newPage();

    // Fast Screenshot Interval for Dashboard
    const screenshotInterval = setInterval(async () => {
        try {
            const screenshot = await page.screenshot({ type: 'jpeg', quality: 30 });
            socket.emit('worker_screenshot', { username, image: screenshot.toString('base64') });
        } catch (e) { }
    }, 4000);

    try {
        // Validation phase
        if (isAuthenticated) {
            emitLog('🔄 Validation de la session existante...');
            await page.goto('https://x.com/home', { waitUntil: 'networkidle' });
            await sleep(3000);
            const isHome = await page.$('nav[aria-label="Primary"]');
            if (!isHome) {
                emitLog('⚠️ Session expirée, nouvelle connexion requise.');
                isAuthenticated = false;
            }
        }

        // Login phase if needed
        if (!isAuthenticated) {
            const success = await doTwitterLogin(page, account, emitLog);
            if (!success) {
                await prisma.twitterAccount.update({ where: { id: accountId }, data: { status: 'CHECKPOINT' } });
                throw new Error("Authentification Impossible");
            }
            
            // Save valid cookies
            const cookies = await context.cookies();
            await prisma.twitterAccount.update({
                where: { id: accountId },
                data: { sessionCookies: cookies as any, status: 'ACTIVE' }
            });
        }

        // Execution phase
        if (action === 'warmUp') {
            await doWarmUp(page, emitLog);
        } else if (action === 'setupProfile') {
            emitLog('⚙️ Profil (Bouton non encore programmé pour X)');
            await sleep(2000);
        } else if (action === 'joinCommunity') {
            emitLog('👥 Communautés (Bouton expérimental)');
            await sleep(2000);
        } else if (action === 'spamComments') {
            emitLog('💬 Spammer (Action Support : à venir)');
            await sleep(2000);
        } else {
            emitLog(`⚠️ Unknown action: ${action}`);
        }

        return { success: true };
    } catch (error: any) {
        socket.emit('worker_error', { username, message: error.message });
        throw error;
    } finally {
        clearInterval(screenshotInterval);
        await browser.close();
        socket.emit('worker_state', { username, state: 'IDLE' });
    }
};
