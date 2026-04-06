import { chromium } from 'playwright-extra';
import type { Page } from 'playwright';
import stealth from 'puppeteer-extra-plugin-stealth';
import { PrismaClient } from '@prisma/client';
import { io } from 'socket.io-client';

const prisma = new PrismaClient();
const socket = io(process.env.BACKEND_SOCKET_URL || 'http://saas-backend:4000');

chromium.use(stealth());

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const randomRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

async function fastType(page: Page, selector: string, text: string) {
    // Only target visible inputs to avoid grabbing hidden honeypots
    const loc = page.locator(selector).first();
    await loc.click({ delay: randomRange(50, 150) });
    
    // Use pressSequentially with built-in realistic delay
    await loc.pressSequentially(text, { delay: randomRange(80, 200) });
}

async function doTwitterLogin(page: Page, account: any, emitLog: (msg: string) => void) {
    emitLog("🔒 Étape 1 : Passage par Google pour tromper l'algo...");
    await page.goto('https://www.google.com/', { waitUntil: 'domcontentloaded' });
    await sleep(randomRange(1000, 2000));
    
    emitLog("🔒 Étape 2 : Pré-chargement de la racine X avec referer...");
    await page.goto('https://x.com/', { referer: 'https://www.google.com/', waitUntil: 'domcontentloaded' });
    await sleep(randomRange(2000, 4000));

    emitLog('🔒 Navigation vers la page de login...');
    await page.goto('https://x.com/i/flow/login', { waitUntil: 'networkidle' });
    await sleep(randomRange(3000, 5000));

    emitLog("⚠️ ACTION REQUISE SUR LE NAVIGATEUR !");
    emitLog("Veuillez saisir vos identifiants à la main sur la fenêtre Chromium visible.");
    emitLog("Le robot est en pause. Vous avez 10 minutes. Il reprendra dès que vous serez connecté !");
    
    try {
        await page.waitForSelector('nav[aria-label="Primary"]', { timeout: 10 * 60 * 1000 });
        emitLog('✅ Connexion manuelle détectée ! Vos cookies secrets sont sauvegardés pour toujours.');
        return true;
    } catch(e) {
        emitLog("❌ Temps écoulé ou fenêtre fermée avant la réussite.");
        return false;
    }
}

async function doWarmUp(page: Page, emitLog: (msg: string) => void) {
    emitLog('🐦 Warm Up : Navigation de la page principale...');
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    await sleep(randomRange(3000, 5000));
    
    emitLog('📜 Scroll vertical progressif...');
    for (let i = 0; i < randomRange(3, 6); i++) {
        await page.mouse.wheel(0, randomRange(300, 700));
        await sleep(randomRange(1500, 3000));
    }
    
    emitLog('✨ Fin du Warm Up classique.');
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

    emitLog("🌐 Génération d'une empreinte digitale (Fingerprint) unique...");
    
    let FingerprintGenerator, FingerprintInjector;
    try {
        const genModule = await import('fingerprint-generator');
        const injModule = await import('fingerprint-injector');
        FingerprintGenerator = genModule.FingerprintGenerator;
        FingerprintInjector = injModule.FingerprintInjector;
    } catch(e: any) {
        throw new Error(`Modules fingerprint manquants ou erreur import ESM: ${e.message}`);
    }

    const fingerprintGenerator = new FingerprintGenerator();
    const fingerprintInjector = new FingerprintInjector();

    const fingerprintResult = fingerprintGenerator.getFingerprint({
        devices: ['desktop', 'mobile'],
        operatingSystems: ['windows', 'macos'],
        browsers: ['chrome', 'edge']
    });
    const fp = fingerprintResult.fingerprint;

    emitLog('🚀 Démarrage du navigateur Chromium autonome en mode Stealth...');
    const browser = await chromium.launch({
        headless: false,
        proxy: proxyConfig,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-notifications',
            '--disable-blink-features=AutomationControlled',
            `--window-size=${fp.screen.width},${fp.screen.height}`
        ],
        ignoreDefaultArgs: ['--enable-automation']
    });

    const context = await browser.newContext({
        userAgent: fp.navigator.userAgent,
        viewport: { width: fp.screen.width, height: fp.screen.height },
        locale: fp.navigator.language,
        colorScheme: 'dark',
    });

    // Inject low-level fingerprinting overrides
    await fingerprintInjector.attachFingerprintToPlaywright(context, fingerprintResult);
    
    // Check if we are already logged in through sessionCookies
    let isAuthenticated = false;
    if (account.sessionCookies && Array.isArray(account.sessionCookies) && account.sessionCookies.length > 0) {
        await context.addCookies(account.sessionCookies as any);
        isAuthenticated = true; // Attempting to use cookies
    }

    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    // Deep Stealth injection
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        // @ts-ignore
        window.navigator.chrome = { runtime: {} };
    });

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
            await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
            try {
                await page.waitForSelector('nav[aria-label="Primary"]', { timeout: 15000 });
                emitLog('✅ Session confirmée, accès direct accordé !');
            } catch(e) {
                emitLog('⚠️ Session non détectée par Twitter ou expirée, connexion requise.');
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
            await doSetupProfile(page, emitLog);
        } else if (action === 'joinCommunity') {
            await doJoinCommunity(page, emitLog);
        } else if (action === 'spamComments') {
            await doSpamComments(page, emitLog);
        } else if (action === 'postCommunity') {
            await doPostCommunity(page, emitLog);
        } else {
            emitLog(`⚠️ Unknown action: ${action}`);
        }

        return { success: true };
    } catch (error: any) {
        socket.emit('worker_error', { username, message: error.message });
        throw error;
    } finally {
        clearInterval(screenshotInterval);
        if (browser) {
             await browser.close().catch(() => {});
        }

        socket.emit('worker_state', { username, state: 'IDLE' });
    }
};

const BIOS = [
    "Exploring the Web3 frontier 🚀 | Tech enthusiast | Building the future.",
    "Crypto, Tech, and AI. Always learning. 💡",
    "Digital citizen. Decentralizing the world one block at a time.",
    "NFTs, DeFi, and the Metaverse. GM! ☀️",
    "On a journey through the blockchain. Passionate about innovation."
];

const TWEETS = [
    "Just diving deeper into some amazing Web3 projects today. The space is evolving so fast! 🚀 #Crypto #Web3",
    "GM everyone! ☀️ Remember that consistency is key in this market. Stay focused!",
    "The intersection of AI and Blockchain is going to create opportunities we haven't even imagined yet. 🧠💻",
    "Don't ignore the fundamentals. The noise will fade, but the tech stays. 🛠️",
    "What's your favorite ecosystem right now and why? Looking to expand my horizons. 👇"
];

const COMMENTS = [
    "This is absolutely huge 🔥",
    "Fully agree with this take! 🎯",
    "Been saying this for months. Let's gooo! 🚀",
    "Great insight as always.",
    "LFG! 📈"
];

async function doSetupProfile(page: Page, emitLog: (msg: string) => void) {
    emitLog('⚙️ Mise à jour du profil (Génération de Bio)...');
    await page.goto('https://x.com/settings/profile', { waitUntil: 'domcontentloaded' });
    await sleep(randomRange(3000, 5000));
    
    const bioInput = 'textarea[data-testid="ProfileDescription_Input"]';
    try {
        await page.waitForSelector(bioInput, { state: 'visible', timeout: 15000 });
        const randomBio = BIOS[randomRange(0, BIOS.length - 1)];
        emitLog(`✍️ Rédaction de la Bio: "${randomBio}"`);
        
        await page.locator(bioInput).fill('');
        await sleep(500);
        await fastType(page, bioInput, randomBio);
        
        await sleep(1000);
        const saveBtn = await page.$('button[data-testid="Profile_Save_Button"]');
        if (saveBtn) {
            await saveBtn.click();
            emitLog('✅ Profil mis à jour et sauvegardé !');
        } else {
            emitLog('⚠️ Bouton de sauvegarde introuvable.');
        }
    } catch(e) {
        emitLog('❌ Erreur lors de la mise à jour du profil (Page inaccessible).');
    }
    await sleep(3000);
}

async function doJoinCommunity(page: Page, emitLog: (msg: string) => void) {
    emitLog('👥 Recherche de mots-clés et Auto-Likes (Création d\'historique)...');
    await page.goto('https://x.com/explore', { waitUntil: 'domcontentloaded' });
    await sleep(randomRange(3000, 5000));
    
    const searchInput = 'input[data-testid="SearchBox_Search_Input"]';
    try {
        await page.waitForSelector(searchInput, { state: 'visible', timeout: 10000 });
        await fastType(page, searchInput, 'Web3 Crypto');
        await page.keyboard.press('Enter');
        
        emitLog('🔍 Navigation vers l\'onglet "Latest"...');
        await sleep(randomRange(3000, 5000));
        
        const latestTab = await page.$$('a[role="tab"]');
        if (latestTab.length > 1) await latestTab[1].click();
        
        await sleep(randomRange(2000, 4000));
        
        for(let i=0; i < 3; i++) {
            await page.mouse.wheel(0, randomRange(500, 1500));
            await sleep(randomRange(1000, 3000));
            const likeBtns = await page.$$('[data-testid="like"]');
            if (likeBtns.length > i) {
                await likeBtns[i].click().catch(()=>{});
                emitLog(`❤️ Liked tweet #${i+1}`);
            }
        }
        emitLog('✅ Interactions terminées.');
    } catch(e) {
        emitLog('❌ Erreur lors de l\'interaction avec l\'onglet Explore.');
    }
}

async function doPostCommunity(page: Page, emitLog: (msg: string) => void) {
    emitLog('📝 Publication d\'un Tweet aléatoire...');
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    await sleep(randomRange(3000, 5000));
    
    try {
        const composeBtn = 'a[data-testid="SideNav_NewTweet_Button"]';
        await page.waitForSelector(composeBtn, { state: 'visible', timeout: 10000 });
        await page.click(composeBtn);
        await sleep(randomRange(1000, 2000));
        
        const textArea = '[data-testid="tweetTextarea_0"]';
        await page.waitForSelector(textArea, { state: 'visible', timeout: 10000 });
        
        const randomTweet = TWEETS[randomRange(0, TWEETS.length - 1)];
        emitLog(`✍️ Saisie du tweet: "${randomTweet.substring(0, 30)}..."`);
        await fastType(page, textArea, randomTweet);
        await sleep(randomRange(1000, 2000));
        
        const tweetBtn = await page.$('button[data-testid="tweetButton"]');
        if(tweetBtn) await tweetBtn.click();
        emitLog('✅ Tweet publié avec succès !');
    } catch(e) {
        emitLog('❌ Impossible de trouver le champ de création de Tweet.');
    }
    await sleep(3000);
}

async function doSpamComments(page: Page, emitLog: (msg: string) => void) {
    emitLog('💬 Mode Spam Commentaires : Ciblage de post viral...');
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    await sleep(randomRange(3000, 5000));
    
    try {
        await page.mouse.wheel(0, randomRange(1000, 3000));
        await sleep(randomRange(2000, 4000));
        
        const replyBtns = await page.$$('[data-testid="reply"]');
        if (replyBtns.length > 0) {
            const targetBtn = replyBtns[randomRange(0, Math.min(replyBtns.length - 1, 3))];
            await targetBtn.click({ delay: 100 }).catch(()=>{});
            
            await sleep(randomRange(1500, 2500));
            const textArea = '[data-testid="tweetTextarea_0"]';
            await page.waitForSelector(textArea, { state: 'visible', timeout: 10000 });
            
            const randomReply = COMMENTS[randomRange(0, COMMENTS.length - 1)];
            emitLog(`✍️ Réponse ciblée: "${randomReply}"`);
            await fastType(page, textArea, randomReply);
            
            await sleep(randomRange(1000, 2000));
            const replySubmitBtn = await page.$('button[data-testid="tweetButton"]');
            if(replySubmitBtn) await replySubmitBtn.click();
            emitLog('✅ Commentaire SPAM publié !');
        } else {
            emitLog('⚠️ Aucun tweet à commenter trouvé sur la timeline.');
        }
    } catch(e) {
        emitLog('❌ Erreur lors de l\'injection du spam reply.');
    }
    await sleep(3000);
}
