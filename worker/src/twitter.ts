import { chromium } from 'playwright-extra';
import { devices } from 'playwright';
import type { Page, BrowserContext, Browser } from 'playwright';
import stealth from 'puppeteer-extra-plugin-stealth';
import { FingerprintGenerator } from 'fingerprint-generator';
import { FingerprintInjector } from 'fingerprint-injector';
import { PrismaClient } from '@prisma/client';
import { io } from 'socket.io-client';
import { sessionManager, SessionData } from './utils/session-manager';

const prisma = new PrismaClient();
const socket = io(process.env.BACKEND_SOCKET_URL || 'http://saas-backend:4000');

chromium.use(stealth());

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const randomRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);
const randomFloat = (min: number, max: number) => Math.random() * (max - min) + min;

/** List of realistic mobile UA - iPhone 14 / 15 & Pixel */
const MOBILE_USER_AGENTS = [
    // iPhone 15 Pro / Safari
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    // iPhone 14 Pro / Safari
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    // Pixel 8 / Chrome Mobile
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.119 Mobile Safari/537.36",
    // Samsung Galaxy S24
    "Mozilla/5.0 (Linux; Android 14; SM-S926B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.64 Mobile Safari/537.36",
    // iPhone 13 / Safari
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6.1 Mobile/15E148 Safari/604.1",
];

/** Realistic Twitter user-like timezones */
const TIMEZONES = [
    'America/New_York', 'America/Los_Angeles', 'Europe/London',
    'Europe/Paris', 'Asia/Tokyo', 'Australia/Sydney'
];

/** Mobile viewport sizes that match actual phones */
const MOBILE_VIEWPORTS = [
    { width: 390, height: 844, dpr: 3 },   // iPhone 14 Pro
    { width: 393, height: 852, dpr: 3 },   // iPhone 15 Pro
    { width: 412, height: 915, dpr: 2.6 }, // Pixel 7
    { width: 360, height: 800, dpr: 3 },   // Samsung Galaxy S23
    { width: 375, height: 812, dpr: 3 },   // iPhone 12 mini
];

// ─── Human Simulation ─────────────────────────────────────────────────────────

async function humanWander(page: Page) {
    if (Math.random() > 0.45) return;
    const width = page.viewportSize()?.width || 390;
    const height = page.viewportSize()?.height || 844;
    const movements = randomRange(1, 3);
    for (let i = 0; i < movements; i++) {
        const x = randomRange(30, width - 30);
        const y = randomRange(80, height - 80);
        await page.mouse.move(x, y, { steps: randomRange(8, 18) }).catch(() => {});
        await sleep(randomRange(200, 600));
    }
}

async function humanPause(page: Page) {
    if (Math.random() > 0.3) return;
    await sleep(randomRange(2000, 9000));
}

async function humanScroll(page: Page, scrolls?: number) {
    const count = scrolls ?? randomRange(2, 5);
    for (let i = 0; i < count; i++) {
        const direction = Math.random() > 0.12 ? 1 : -1;
        const amount = randomRange(250, 750);
        const chunks = randomRange(2, 5);
        for (let j = 0; j < chunks; j++) {
            await page.mouse.wheel(0, (direction * amount) / chunks);
            await sleep(randomRange(40, 180));
        }
        await humanWander(page);
        if (Math.random() > 0.65) await humanPause(page);
        await sleep(randomRange(1000, 3500));
    }
}

async function humanClick(page: Page, elementOrSelector: any) {
    try {
        const loc = typeof elementOrSelector === 'string'
            ? page.locator(elementOrSelector).first()
            : elementOrSelector;

        if (typeof loc.scrollIntoViewIfNeeded === 'function') {
            await loc.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        }
        const box = await loc.boundingBox();
        if (box && box.width > 0 && box.height > 0) {
            const tx = box.x + box.width / 2 + randomFloat(-Math.min(box.width / 3, 15), Math.min(box.width / 3, 15));
            const ty = box.y + box.height / 2 + randomFloat(-Math.min(box.height / 3, 15), Math.min(box.height / 3, 15));
            // Bezier-like curve move: intermediate point
            const mx = tx + randomRange(-120, 120);
            const my = ty + randomRange(-80, 80);
            await page.mouse.move(mx, my, { steps: randomRange(8, 16) }).catch(() => {});
            await sleep(randomRange(40, 140));
            await page.mouse.move(tx, ty, { steps: randomRange(10, 20) }).catch(() => {});
            await sleep(randomRange(120, 500));
        }
        await loc.click({ delay: randomRange(60, 200) });
    } catch {
        if (typeof elementOrSelector === 'string') {
            await page.locator(elementOrSelector).first().click({ delay: randomRange(50, 130) }).catch(() => {});
        } else if (elementOrSelector?.click) {
            await elementOrSelector.click({ delay: randomRange(50, 130) }).catch(() => {});
        }
    }
}

async function humanType(page: Page, selector: string, text: string) {
    const loc = page.locator(selector).first();
    await humanClick(page, loc);
    await sleep(randomRange(300, 900));
    let lastWasMistake = false;
    for (const char of text) {
        // ~3% typo rate, but never consecutive
        if (!lastWasMistake && Math.random() < 0.03 && /[a-z]/i.test(char)) {
            const typoBank = 'azertyuiopqsdfghjklmwxcvbn';
            const typo = typoBank[Math.floor(Math.random() * typoBank.length)];
            await loc.pressSequentially(typo, { delay: randomRange(50, 140) });
            await sleep(randomRange(180, 480));
            await page.keyboard.press('Backspace', { delay: randomRange(50, 130) });
            await sleep(randomRange(100, 300));
            lastWasMistake = true;
        } else {
            lastWasMistake = false;
        }
        await loc.pressSequentially(char, { delay: randomRange(55, 240) });
        if (Math.random() < 0.04) {
            await sleep(randomRange(250, 800));
            await humanWander(page);
        }
    }
}

// ─── Stealth Setup ────────────────────────────────────────────────────────────

/** Injects advanced anti-detection scripts into the page context */
async function applyStealthScripts(context: BrowserContext, deviceInfo: { userAgent: string; platform: string }) {
    await context.addInitScript((device) => {
        // ── Remove webdriver traces ──
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
        try { delete (navigator as any).__proto__.webdriver; } catch {}

        // ── Fake chrome object ──
        (window as any).chrome = {
            app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } },
            runtime: {
                PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
                PlatformArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
                RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
                OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' }
            },
            webstore: { onInstallStageChanged: {}, onDownloadProgress: {} },
            csi: () => {},
            loadTimes: () => {},
        };

        // ── Disable WebRTC IP leak ──
        try { (window as any).RTCPeerConnection = undefined; } catch {}
        try { (window as any).webkitRTCPeerConnection = undefined; } catch {}
        try {
            if ((navigator as any).mediaDevices) {
                (navigator as any).mediaDevices.getUserMedia = () => Promise.reject(new Error('Permission denied'));
            }
        } catch {}

        // ── Hardware & memory ──
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 6, configurable: true });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 4, configurable: true });

        // ── Plugins (realistic for mobile Safari) ──
        Object.defineProperty(navigator, 'plugins', { get: () => [], configurable: true });

        // ── Canvas noise (anti-fingerprint) ──
        const origGetContext = HTMLCanvasElement.prototype.getContext as any;
        (HTMLCanvasElement.prototype as any).getContext = function (type: any, opts?: any) {
            const ctx = origGetContext.call(this, type, opts);
            if (type === '2d' && ctx && 'fillText' in ctx) {
                const ctx2d = ctx as CanvasRenderingContext2D;
                const origFillText = ctx2d.fillText.bind(ctx2d);
                ctx2d.fillText = function (text: string, x: number, y: number, maxWidth?: number) {
                    ctx2d.save();
                    ctx2d.fillStyle = `rgba(0,0,0,${Math.random() * 0.005})`;
                    ctx2d.fillRect(x, y, 1, 1);
                    ctx2d.restore();
                    return maxWidth !== undefined ? origFillText(text, x, y, maxWidth) : origFillText(text, x, y);
                };
            }
            return ctx;
        };

        // ── Audio fingerprint noise ──
        const origCreateAnalyser = AudioContext.prototype.createAnalyser;
        AudioContext.prototype.createAnalyser = function () {
            const analyser = origCreateAnalyser.call(this);
            const origGetFloatFrequency = analyser.getFloatFrequencyData.bind(analyser);
            (analyser as any).getFloatFrequencyData = function (array: Float32Array) {
                origGetFloatFrequency(array as any);
                for (let i = 0; i < array.length; i++) {
                    array[i] += Math.random() * 0.0001;
                }
            };
            return analyser;
        };

        // ── Permissions mock ──
        const origQuery = navigator.permissions?.query.bind(navigator.permissions);
        if (origQuery) {
            navigator.permissions.query = (params: any) =>
                params.name === 'notifications'
                    ? Promise.resolve({ state: 'prompt', onchange: null } as any)
                    : origQuery(params);
        }

        // ── Realistic battery API ──
        if ((navigator as any).getBattery) {
            (navigator as any).getBattery = () => Promise.resolve({
                charging: Math.random() > 0.5,
                chargingTime: randomInt(600, 3600),
                dischargingTime: randomInt(3600, 14400),
                level: randomFloat(0.2, 1.0),
                addEventListener: () => {},
                removeEventListener: () => {},
                dispatchEvent: () => true,
            });
        }

        function randomInt(a: number, b: number) { return Math.floor(Math.random() * (b - a) + a); }
        function randomFloat(a: number, b: number) { return Math.random() * (b - a) + a; }

    }, deviceInfo);
}

// ─── Browser Factory ──────────────────────────────────────────────────────────

interface BrowserSession {
    browser: Browser;
    context: BrowserContext;
    page: Page;
    deviceInfo: {
        userAgent: string;
        viewport: { width: number; height: number };
        deviceScaleFactor: number;
        platform: string;
    };
    fingerprint: any;
}

async function createStealthSession(
    proxyConfig: any,
    existingDeviceInfo?: any,
    existingFingerprint?: any
): Promise<BrowserSession> {
    const fpGen = new FingerprintGenerator();
    const fpInj = new FingerprintInjector();

    // Pick random (or re-use) device profile
    const vp = MOBILE_VIEWPORTS[randomRange(0, MOBILE_VIEWPORTS.length - 1)];
    const ua = existingDeviceInfo?.userAgent || MOBILE_USER_AGENTS[randomRange(0, MOBILE_USER_AGENTS.length - 1)];
    const tz = TIMEZONES[randomRange(0, TIMEZONES.length - 1)];
    const isIOS = ua.includes('iPhone') || ua.includes('iPad');

    // Generate a unique fingerprint
    const fpResult = fpGen.getFingerprint({
        devices: ['mobile'],
        operatingSystems: [isIOS ? 'ios' : 'android'],
        browsers: [isIOS ? 'safari' : 'chrome'],
    });
    
    console.log('Fingerprint result:', JSON.stringify(fpResult, null, 2).substring(0, 200));
    
    // Use existing fingerprint if provided, otherwise use newly generated one
    const fingerprint = existingFingerprint || fpResult.fingerprint;

    const deviceInfo = existingDeviceInfo || {
        userAgent: ua,
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.dpr,
        platform: isIOS ? 'iPhone' : 'Linux armv8l',
    };

    // Launch browser with stealth args
    const browser = await chromium.launch({
        headless: true, // Doit être true puisque tu utilises Docker sans serveur X11 (et tu utilises les cookies maintenant !)
        proxy: proxyConfig,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-notifications',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--ignore-certificate-errors',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--font-render-hinting=none',
            '--no-first-run',
            '--no-service-autorun',
            '--password-store=basic',
            '--disable-extensions',
            `--window-size=${vp.width},${vp.height}`,
        ],
        ignoreDefaultArgs: ['--enable-automation'],
        timeout: 60000,
    });

    const context = await browser.newContext({
        userAgent: deviceInfo.userAgent,
        viewport: deviceInfo.viewport,
        deviceScaleFactor: deviceInfo.deviceScaleFactor,
        isMobile: true,
        hasTouch: true,
        colorScheme: Math.random() > 0.5 ? 'dark' : 'light',
        locale: 'en-US',
        timezoneId: tz,
        extraHTTPHeaders: {
            'Accept-Language': 'en-US,en;q=0.9',
            'sec-ch-ua-mobile': '?1',
            'sec-ch-ua-platform': isIOS ? '"iOS"' : '"Android"',
        },
    });

    // Inject fingerprint + stealth scripts
    await fpInj.attachFingerprintToPlaywright(context, fpResult);
    await applyStealthScripts(context, deviceInfo);

    const page = await context.newPage();

    return { browser, context, page, deviceInfo, fingerprint };
}

// ─── Login Flow ───────────────────────────────────────────────────────────────

/**
 * Opens a visible Chrome window and waits for the user to log in manually.
 * Once logged in, saves cookies for reuse.
 */
async function doManualLogin(
    page: Page,
    context: BrowserContext,
    account: any,
    emitLog: (msg: string) => void
): Promise<boolean> {
    emitLog("🚀 Ouverture du navigateur pour connexion à X (Twitter)...");
    emitLog("─────────────────────────────────────────────────────");
    emitLog("🤖 Connexion automatique en cours...");
    emitLog("💡 Ne fermez pas la fenêtre pendant l'opération.");
    emitLog("─────────────────────────────────────────────────────");

    page.setDefaultTimeout(0);

    try {
        // Navigate directly to login page
        emitLog("🌐 Navigation vers la page de connexion X...");
        
        // First, visit Twitter homepage to establish legitimacy
        await page.goto('https://x.com', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        
        await sleep(randomRange(2000, 4000));
        await humanWander(page);
        
        // Then navigate to login
        await page.goto('https://x.com/i/flow/login', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        
        emitLog("📋 Page de connexion chargée.");
    } catch (err: any) {
        emitLog(`⚠️ Erreur de navigation: ${err.message}`);
        // Fallback
        try {
            await page.goto('https://x.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch {}
    }

    await sleep(randomRange(2000, 4000));
    await humanWander(page);

    // Auto-fill login credentials
    try {
        emitLog("🔑 Saisie automatique des identifiants...");
        
        // Wait for page to fully load JavaScript
        await sleep(randomRange(2000, 4000));
        await humanWander(page);
        
        // Try to find username/email field - use stable autocomplete attributes
        const usernameSelectors = [
            'input[autocomplete="username"]',
            'input[name="text"]',
            'input[data-testid="textInput"]',
            'input[type="text"]',
        ];

        let usernameField = null;
        let usernameSelector = '';
        for (const selector of usernameSelectors) {
            usernameField = page.locator(selector).first();
            if (await usernameField.count() > 0) {
                usernameSelector = selector;
                emitLog(`✅ Champ username trouvé: ${selector}`);
                break;
            }
        }

        if (!usernameField || await usernameField.count() === 0) {
            emitLog("❌ Champ username non trouvé");
            return false;
        }

        // Click and type username with human-like behavior
        await humanWander(page);
        await sleep(randomRange(800, 2000));
        await humanClick(page, usernameField);
        await sleep(randomRange(500, 1200));
        
        // Determine what to type (email, phone, or username)
        const loginText = account.email || account.username;
        emitLog(`✍️ Saisie de l'identifiant: ${loginText}`);
        await humanType(page, usernameSelector, loginText);
        
        // Wait for JavaScript validation
        await sleep(randomRange(1500, 3000));
        await humanWander(page);

        // Click "Next" button
        emitLog("➡️ Clic sur 'Next'...");
        const nextButtonSelectors = [
            'button[data-testid="LoginForm_Login_Button"]',
            'button[type="submit"]',
            'div[role="button"]:has-text("Next")',
            'div[role="button"]:has-text("Suivant")',
            'span:has-text("Next")',
        ];

        let nextClicked = false;
        for (const selector of nextButtonSelectors) {
            const btn = page.locator(selector).first();
            if (await btn.count() > 0) {
                emitLog(`✅ Bouton Next trouvé: ${selector}`);
                await humanClick(page, btn);
                nextClicked = true;
                break;
            }
        }

        if (!nextClicked) {
            emitLog("⚠️ Bouton Next non trouvé, tentative avec Enter...");
            await page.keyboard.press('Enter');
        }

        // Wait LONGER for password field to appear (Twitter can be slow)
        emitLog("⏳ Attente de l'affichage du champ mot de passe...");
        await sleep(randomRange(4000, 7000));
        await humanWander(page);
        
        // Try to wait specifically for password field
        try {
            emitLog("🔍 Détection du champ mot de passe...");
            await page.waitForSelector('input[type="password"], input[name="password"]', { 
                timeout: 10000 
            }).catch(() => {
                emitLog("⚠️ Champ password pas encore visible, attente supplémentaire...");
            });
        } catch {}
        
        await sleep(randomRange(2000, 4000));
        await humanWander(page);

        // CHECK FOR VERIFICATION STEP (Email/Phone confirmation)
        emitLog("🔍 Vérification d'éventuelles étapes de sécurité...");
        
        // Check if X is asking for email/phone verification
        const verificationSelectors = [
            'input[autocomplete="email"]',
            'input[name="verification_code"]',
            'input[placeholder*="code"]',
            'input[placeholder*="Code"]',
        ];

        for (const selector of verificationSelectors) {
            const verificationField = page.locator(selector).first();
            if (await verificationField.count() > 0) {
                emitLog("🛡️ Vérification de sécurité détectée!");
                
                // If account has email, enter it
                if (account.email) {
                    emitLog(`📧 Saisie de l'email de vérification: ${account.email}`);
                    await humanClick(page, verificationField);
                    await sleep(randomRange(500, 1200));
                    await humanType(page, selector, account.email);
                    await sleep(randomRange(1500, 3000));
                    await humanWander(page);
                    
                    // Click Next again
                    for (const btnSelector of nextButtonSelectors) {
                        const btn = page.locator(btnSelector).first();
                        if (await btn.count() > 0) {
                            await humanClick(page, btn);
                            emitLog("➡️ Clic sur 'Next' après vérification email");
                            break;
                        }
                    }
                    
                    await sleep(randomRange(3000, 5000));
                    await humanWander(page);
                    break;
                } else {
                    emitLog("⚠️ Email manquant pour la vérification. Connexion manuelle requise.");
                    emitLog("💡 Ajoutez l'email au compte dans la base de données.");
                }
            }
        }

        // Now look for password field
        emitLog("🔒 Recherche du champ mot de passe...");
        const passwordSelectors = [
            'input[name="password"]',
            'input[autocomplete="current-password"]',
            'input[type="password"]',
        ];

        let passwordField = null;
        let passwordSelector = '';
        for (const selector of passwordSelectors) {
            passwordField = page.locator(selector).first();
            if (await passwordField.count() > 0) {
                passwordSelector = selector;
                emitLog(`✅ Champ mot de passe trouvé: ${selector}`);
                break;
            }
        }

        if (passwordField && await passwordField.count() > 0 && account.password) {
            await humanWander(page);
            await sleep(randomRange(800, 1800));
            await humanClick(page, passwordField);
            await sleep(randomRange(600, 1500));
            
            emitLog("✍️ Saisie du mot de passe...");
            await humanType(page, passwordSelector, account.password);
            
            // Wait before submitting
            await sleep(randomRange(1500, 3000));
            await humanWander(page);

            // Click "Log in" button
            emitLog("🔓 Connexion en cours...");
            const loginButtonSelectors = [
                'button[data-testid="LoginForm_Login_Submit"]',
                'button[type="submit"]',
                'div[role="button"]:has-text("Log in")',
                'div[role="button"]:has-text("Se connecter")',
                'span:has-text("Log in")',
            ];

            let loginClicked = false;
            for (const selector of loginButtonSelectors) {
                const btn = page.locator(selector).first();
                if (await btn.count() > 0) {
                    emitLog(`✅ Bouton Login trouvé: ${selector}`);
                    await humanClick(page, btn);
                    loginClicked = true;
                    break;
                }
            }

            if (!loginClicked) {
                emitLog("⚠️ Bouton Login non trouvé, tentative avec Enter...");
                await page.keyboard.press('Enter');
            }

            emitLog("⏳ Attente de la validation...");
        } else {
            emitLog("⚠️ Champ mot de passe non trouvé ou mot de passe manquant");
        }

    } catch (err: any) {
        emitLog(`⚠️ Erreur lors de la saisie: ${err.message}`);
        emitLog(`📝 Stack: ${err.stack}`);
    }

    // Wait for successful login (up to 15 minutes)
    try {
        emitLog("⏳ En attente de la connexion...");
        await Promise.race([
            page.waitForURL('**x.com/home**', { timeout: 15 * 60 * 1000 }),
            page.waitForURL('**twitter.com/home**', { timeout: 15 * 60 * 1000 }),
            page.waitForSelector('[data-testid="SideNav_AccountSwitcher_Button"]', { timeout: 15 * 60 * 1000 }),
            page.waitForSelector('nav[aria-label="Primary"]', { timeout: 15 * 60 * 1000 }),
        ]);
        page.setDefaultTimeout(30000);
        emitLog("✅ Connexion réussie ! Sauvegarde de la session en cours...");
        return true;
    } catch {
        emitLog("❌ Délai de connexion expiré (15 min). Relancez le job pour réessayer.");
        return false;
    }
}

// ─── Session Validation ───────────────────────────────────────────────────────

async function validateSession(page: Page, emitLog: (msg: string) => void): Promise<boolean> {
    try {
        emitLog("🔄 Vérification de la session existante...");
        await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 20000 });

        // Check if we landed on home and have the primary nav
        await page.waitForSelector(
            '[data-testid="SideNav_AccountSwitcher_Button"], nav[aria-label="Primary"]',
            { timeout: 15000 }
        );

        emitLog("✅ Session valide - Accès direct accordé !");
        return true;
    } catch {
        emitLog("⚠️ Session expirée ou invalide - Reconnexion requise.");
        return false;
    }
}

// ─── Warm Up ──────────────────────────────────────────────────────────────────

async function doWarmUp(page: Page, emitLog: (msg: string) => void) {
    emitLog("🔥 Warm Up : Navigation naturelle sur X...");

    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    await sleep(randomRange(4000, 7000));
    await humanScroll(page, randomRange(3, 6));

    // Randomly read a few posts
    for (let i = 0; i < randomRange(2, 5); i++) {
        await humanPause(page);
        await humanWander(page);
        await humanScroll(page, 1);
    }

    // Sometimes like a post
    if (Math.random() > 0.5) {
        const likeBtns = await page.$$('[data-testid="like"]');
        if (likeBtns.length > 0) {
            const idx = randomRange(0, Math.min(likeBtns.length - 1, 4));
            await sleep(randomRange(1500, 3500));
            await humanClick(page, likeBtns[idx]);
            emitLog(`❤️ Liked a post during warm up`);
        }
    }

    emitLog("✅ Warm Up terminé.");
}

// ─── Auto Like ────────────────────────────────────────────────────────────────

async function doAutoLike(page: Page, emitLog: (msg: string) => void, config: any) {
    const count = config?.count || randomRange(3, 8);
    emitLog(`❤️ Auto-Like : Ciblage de ${count} posts...`);

    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    await sleep(randomRange(3000, 6000));

    let liked = 0;
    let scrollAttempts = 0;

    while (liked < count && scrollAttempts < 15) {
        await humanScroll(page, 2);
        const likeBtns = await page.$$('[data-testid="like"]');

        for (const btn of likeBtns) {
            if (liked >= count) break;
            const ariaPressed = await btn.getAttribute('data-testid').catch(() => null);
            // Only click unliked posts (aria-label contains "Like" not "Unlike")
            const ariaLabel = await btn.evaluate((el: any) => el.closest('[aria-label]')?.getAttribute('aria-label') || '').catch(() => '');
            if (ariaLabel.toLowerCase().includes('unlike')) continue;

            await sleep(randomRange(2000, 5000));
            await humanClick(page, btn);
            liked++;
            emitLog(`❤️ Liked post #${liked}/${count}`);
            await sleep(randomRange(1500, 4000));
        }
        scrollAttempts++;
    }

    emitLog(`✅ Auto-Like terminé : ${liked} posts likés.`);
}

// ─── Auto Follow ──────────────────────────────────────────────────────────────

async function doAutoFollow(page: Page, emitLog: (msg: string) => void, config: any) {
    const keyword = config?.keyword || 'crypto web3';
    const count = config?.count || randomRange(3, 7);
    emitLog(`👥 Auto-Follow : Recherche de "${keyword}" pour suivre ${count} comptes...`);

    // Go to search
    await page.goto(`https://x.com/search?q=${encodeURIComponent(keyword)}&f=user`, { waitUntil: 'domcontentloaded' });
    await sleep(randomRange(4000, 7000));

    let followed = 0;
    let scrollAttempts = 0;

    while (followed < count && scrollAttempts < 10) {
        await humanScroll(page, 2);
        const followBtns = await page.$$('[data-testid*="follow"]');

        for (const btn of followBtns) {
            if (followed >= count) break;
            const text = await btn.textContent().catch(() => '');
            if (!text?.toLowerCase().includes('follow') || text.toLowerCase().includes('following')) continue;

            await sleep(randomRange(3000, 7000));
            await humanClick(page, btn);
            followed++;
            emitLog(`👤 Followed account #${followed}/${count}`);
            await sleep(randomRange(2000, 5000));
        }
        scrollAttempts++;
    }

    emitLog(`✅ Auto-Follow terminé : ${followed} comptes suivis.`);
}

// ─── Auto Retweet ─────────────────────────────────────────────────────────────

async function doAutoRetweet(page: Page, emitLog: (msg: string) => void, config: any) {
    const count = config?.count || randomRange(2, 5);
    emitLog(`🔁 Auto-Retweet : Ciblage de ${count} posts...`);

    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    await sleep(randomRange(3000, 6000));

    let retweeted = 0;
    let scrollAttempts = 0;

    while (retweeted < count && scrollAttempts < 12) {
        await humanScroll(page, 2);
        const rtBtns = await page.$$('[data-testid="retweet"]');

        for (const btn of rtBtns) {
            if (retweeted >= count) break;
            await sleep(randomRange(3000, 8000));
            await humanClick(page, btn);
            await sleep(randomRange(1000, 2000));

            // Confirm the retweet dialog
            const confirmBtn = page.locator('[data-testid="retweetConfirm"]').first();
            if (await confirmBtn.count() > 0) {
                await humanClick(page, confirmBtn);
                retweeted++;
                emitLog(`🔁 Retweeté #${retweeted}/${count}`);
            }
            await sleep(randomRange(2000, 5000));
        }
        scrollAttempts++;
    }

    emitLog(`✅ Auto-Retweet terminé : ${retweeted} posts retweetés.`);
}

// ─── Auto Comment ─────────────────────────────────────────────────────────────

const AUTO_COMMENTS = [
    "This is exactly what I needed to see today 🔥",
    "Fully agree! The space is evolving so fast 🚀",
    "Been saying this for months, finally someone gets it!",
    "Great insight, thanks for sharing 👏",
    "LFG! This is the way 📈",
    "Absolutely huge. Bullish on this 💯",
    "This aged like fine wine 🍷",
    "Facts only here. Real talk 🎯",
    "The alpha is in the details 🧠",
    "Needed this reminder today, thanks 🙏",
];

async function doAutoComment(page: Page, emitLog: (msg: string) => void, config: any) {
    const count = config?.count || randomRange(2, 4);
    const customComments = config?.comments || AUTO_COMMENTS;
    emitLog(`💬 Auto-Comment : Publication de ${count} commentaires...`);

    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    await sleep(randomRange(4000, 7000));
    await humanScroll(page, 3);

    let commented = 0;
    let scrollAttempts = 0;

    while (commented < count && scrollAttempts < 10) {
        const replyBtns = await page.$$('[data-testid="reply"]');

        for (const btn of replyBtns) {
            if (commented >= count) break;
            await sleep(randomRange(4000, 10000));
            await humanClick(page, btn);
            await sleep(randomRange(1500, 3000));

            const textArea = '[data-testid="tweetTextarea_0"]';
            const ta = page.locator(textArea).first();
            if (await ta.count() === 0) continue;

            const comment = customComments[randomRange(0, customComments.length - 1)];
            emitLog(`✍️ Réponse : "${comment}"`);
            await humanType(page, textArea, comment);
            await sleep(randomRange(1500, 3000));

            const replyBtn = page.locator('[data-testid="tweetButton"]').first();
            if (await replyBtn.count() > 0) {
                await humanClick(page, replyBtn);
                commented++;
                emitLog(`✅ Commentaire #${commented}/${count} publié.`);
            }
            await sleep(randomRange(3000, 8000));
        }

        await humanScroll(page, 2);
        scrollAttempts++;
    }

    emitLog(`✅ Auto-Comment terminé : ${commented} commentaires publiés.`);
}

// ─── Auto Post ────────────────────────────────────────────────────────────────

const AUTO_TWEETS = [
    "Just diving deeper into some amazing Web3 projects today. The space is evolving so fast! 🚀 #Crypto #Web3",
    "GM everyone! ☀️ Remember that consistency is key in this market. Stay focused!",
    "The intersection of AI and Blockchain is going to create opportunities we haven't even imagined yet 🧠💻",
    "Don't ignore the fundamentals. The noise will fade, but the tech stays 🛠️",
    "What's your favorite ecosystem right now and why? Looking to expand my horizons 👇",
    "Every bear market is just the universe preparing you for the next bull run. Stay humble, stay building.",
    "The builders who show up every day will be the winners. Simple as that.",
    "Not financial advice, but I'm long on the future of decentralized everything. 🌐",
];

async function doAutoPost(page: Page, emitLog: (msg: string) => void, config: any) {
    const tweetContent = config?.content || AUTO_TWEETS[randomRange(0, AUTO_TWEETS.length - 1)];
    emitLog("📝 Auto-Post : Publication d'un tweet...");

    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    await sleep(randomRange(4000, 7000));
    await humanScroll(page, randomRange(2, 4));
    await sleep(randomRange(2000, 4000));

    try {
        // Click compose button
        const composeBtns = [
            'a[data-testid="SideNav_NewTweet_Button"]',
            'a[href="/compose/tweet"]',
            '[data-testid="tweetButtonInline"]',
        ];

        let composed = false;
        for (const sel of composeBtns) {
            const el = page.locator(sel).first();
            if (await el.count() > 0) {
                await humanClick(page, el);
                composed = true;
                break;
            }
        }

        if (!composed) {
            emitLog("⚠️ Bouton de composition introuvable.");
            return;
        }

        await sleep(randomRange(1200, 2500));

        const textArea = '[data-testid="tweetTextarea_0"]';
        await page.waitForSelector(textArea, { state: 'visible', timeout: 10000 });

        emitLog(`✍️ Saisie: "${tweetContent.substring(0, 40)}..."`);
        await humanType(page, textArea, tweetContent);
        await sleep(randomRange(1500, 3500));

        const tweetBtn = page.locator('[data-testid="tweetButton"]').first();
        if (await tweetBtn.count() > 0) {
            await humanClick(page, tweetBtn);
            emitLog("✅ Tweet publié avec succès !");
        } else {
            emitLog("⚠️ Bouton de publication introuvable.");
        }
    } catch (e: any) {
        emitLog(`❌ Erreur lors de la publication: ${e.message}`);
    }
    await sleep(3000);
}

// ─── Scheduled Post ───────────────────────────────────────────────────────────

async function doScheduledPost(page: Page, emitLog: (msg: string) => void, postId: string) {
    emitLog("📅 Publication planifiée...");
    
    try {
        // Fetch post from database
        const post = await prisma.twitterPost.findUnique({
            where: { id: postId },
            include: { account: true }
        });

        if (!post) {
            emitLog("❌ Post introuvable en base de données");
            return;
        }

        if (!post.content) {
            emitLog("❌ Post sans contenu");
            return;
        }

        emitLog(`📝 Contenu: "${post.content.substring(0, 50)}..."`);

        // Navigate to home
        await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
        await sleep(randomRange(4000, 7000));
        await humanScroll(page, randomRange(2, 4));
        await sleep(randomRange(2000, 4000));

        // Click compose button
        const composeBtns = [
            'a[data-testid="SideNav_NewTweet_Button"]',
            'a[href="/compose/tweet"]',
        ];

        let composed = false;
        for (const sel of composeBtns) {
            const el = page.locator(sel).first();
            if (await el.count() > 0) {
                await humanClick(page, el);
                composed = true;
                break;
            }
        }

        if (!composed) {
            emitLog("⚠️ Bouton de composition introuvable.");
            await prisma.twitterPost.update({
                where: { id: postId },
                data: { status: 'FAILED' }
            });
            return;
        }

        await sleep(randomRange(1000, 2000));
        
        // Type content
        await humanType(page, 'div[data-testid="tweetTextarea_0"]', post.content);
        await sleep(randomRange(1000, 2000));

        // Click Tweet button
        const tweetBtn = page.locator('[data-testid="tweetButton"]').first();
        if (await tweetBtn.count() > 0) {
            await humanClick(page, tweetBtn);
            emitLog("✅ Tweet planifié publié avec succès!");
            
            // Update post status
            await prisma.twitterPost.update({
                where: { id: postId },
                data: {
                    status: 'PUBLISHED',
                    publishedAt: new Date()
                }
            });

            // Update daily stats
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            await prisma.twitterStats.upsert({
                where: {
                    accountId_date: {
                        accountId: post.accountId,
                        date: today
                    }
                },
                update: {
                    tweetsPosted: { increment: 1 }
                },
                create: {
                    accountId: post.accountId,
                    date: today,
                    tweetsPosted: 1
                }
            });

            // Notify backend
            socket.emit('worker_log', {
                username: post.account.username,
                message: `📝 Tweet publié: "${post.content.substring(0, 50)}..."`
            });

            await sleep(randomRange(3000, 5000));
        } else {
            emitLog("❌ Bouton Tweet introuvable");
            await prisma.twitterPost.update({
                where: { id: postId },
                data: { status: 'FAILED' }
            });
        }
    } catch (err) {
        emitLog(`❌ Erreur lors de la publication planifiée: ${err}`);
        try {
            await prisma.twitterPost.update({
                where: { id: postId },
                data: { status: 'FAILED' }
            });
        } catch {}
    }
}

// ─── Setup Profile ────────────────────────────────────────────────────────────

const AUTO_BIOS = [
    "Exploring the Web3 frontier 🚀 | Tech enthusiast | Building the future.",
    "Crypto, Tech, and AI. Always learning. 💡",
    "Digital citizen. Decentralizing the world one block at a time.",
    "NFTs, DeFi, and the Metaverse. GM! ☀️",
    "On a journey through the blockchain. Passionate about innovation.",
];

async function doSetupProfile(page: Page, emitLog: (msg: string) => void, config?: any) {
    emitLog("⚙️ Mise à jour du profil...");
    await page.goto('https://x.com/settings/profile', { waitUntil: 'domcontentloaded' });
    await sleep(randomRange(4000, 7000));
    await humanScroll(page);

    const bioInput = 'textarea[data-testid="ProfileDescription_Input"]';
    try {
        await page.waitForSelector(bioInput, { state: 'visible', timeout: 15000 });
        const bio = config?.bio || AUTO_BIOS[randomRange(0, AUTO_BIOS.length - 1)];
        emitLog(`✍️ Bio: "${bio}"`);

        await page.locator(bioInput).fill('');
        await sleep(500);
        await humanType(page, bioInput, bio);

        await sleep(1000);
        const saveBtn = page.locator('[data-testid="Profile_Save_Button"]').first();
        if (await saveBtn.count() > 0) {
            await humanClick(page, saveBtn);
            emitLog("✅ Profil mis à jour !");
        }
    } catch {
        emitLog("❌ Erreur lors de la mise à jour du profil.");
    }
    await sleep(3000);
}

// ─── Join Community ───────────────────────────────────────────────────────────

async function doJoinCommunity(page: Page, emitLog: (msg: string) => void, config?: any) {
    const keyword = config?.keyword || 'Web3 Crypto';
    emitLog(`👥 Join Community : Recherche de "${keyword}"...`);

    await page.goto('https://x.com/explore', { waitUntil: 'domcontentloaded' });
    await sleep(randomRange(3000, 5000));

    const searchInput = 'input[data-testid="SearchBox_Search_Input"]';
    try {
        await page.waitForSelector(searchInput, { state: 'visible', timeout: 10000 });
        await humanType(page, searchInput, keyword);
        await sleep(randomRange(1000, 2000));
        await page.keyboard.press('Enter');

        emitLog(`🔍 Navigation vers l'onglet "Latest"...`);
        await sleep(randomRange(4000, 6000));

        const tabs = await page.$$('a[role="tab"]');
        if (tabs.length > 1) await humanClick(page, tabs[1]);
        await sleep(randomRange(3000, 5000));

        const likeCount = randomRange(3, 6);
        let liked = 0;
        for (let i = 0; i < likeCount; i++) {
            await humanScroll(page);
            const likeBtns = await page.$$('[data-testid="like"]');
            if (likeBtns.length > i) {
                await sleep(randomRange(1500, 3500));
                await humanClick(page, likeBtns[i]);
                liked++;
                emitLog(`❤️ Liked post #${liked}`);
            }
        }
        emitLog(`✅ Join Community terminé : ${liked} interactions.`);
    } catch {
        emitLog("❌ Erreur lors de l'interaction avec Explore.");
    }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export const twitterWorkerHandler = async (job: any) => {
    const { accountId, action, config } = job.data;

    const account = await prisma.twitterAccount.findUnique({
        where: { id: accountId },
        include: { proxy: true },
    });

    if (!account) throw new Error('Twitter Account not found');

    const username = account.username;
    const emitLog = (msg: string) => {
        console.log(`[${username}] ${msg}`);
        socket.emit('worker_log', { username, message: msg });
    };

    socket.emit('worker_state', { username, state: 'RUNNING' });
    await prisma.twitterAccount.update({ where: { id: accountId }, data: { status: 'ACTIVE' } });

    const proxyConfig = account.proxy ? {
        server: `http://${account.proxy.host}:${account.proxy.port}`,
        username: account.proxy.username || undefined,
        password: account.proxy.password || undefined,
    } : undefined;

    emitLog("🚀 Initialisation de la session furtive...");

    // Load existing session to reuse device fingerprint
    const existingSession = await sessionManager.loadSession(username);
    const existingDeviceInfo = existingSession?.deviceInfo;
    const existingFingerprint = existingSession?.fingerprint;

    emitLog("🔍 Création du profil de périphérique mobile indétectable...");
    const session = await createStealthSession(proxyConfig, existingDeviceInfo, existingFingerprint);
    const { browser, context, page, deviceInfo, fingerprint } = session;
    emitLog("✅ Session furtive créée.");

    // Screenshot interval for dashboard
    const screenshotInterval = setInterval(async () => {
        try {
            const screenshot = await page.screenshot({ type: 'jpeg', quality: 30 });
            socket.emit('worker_screenshot', { username, image: screenshot.toString('base64') });
        } catch {}
    }, 4000);

    try {
        let isAuthenticated = false;

        // ── Try to restore session from cookies ──
        if (existingSession && sessionManager.isSessionValid(existingSession) && existingSession.cookies.length > 0) {
            emitLog("🍪 Chargement des cookies de session...");
            await context.addCookies(existingSession.cookies);
            isAuthenticated = await validateSession(page, emitLog);

            if (!isAuthenticated) {
                emitLog("🗑️ Cookies invalides, suppression de l'ancienne session...");
                await sessionManager.deleteSession(username);
                await context.clearCookies();
            }
        } else if (account.sessionCookies && Array.isArray(account.sessionCookies) && account.sessionCookies.length > 0) {
            emitLog("🍪 Chargement des cookies DB...");
            await context.addCookies(account.sessionCookies as any);
            isAuthenticated = await validateSession(page, emitLog);
            if (!isAuthenticated) {
                await context.clearCookies();
            }
        }

        // ── Manual login if session is not valid ──
        if (!isAuthenticated) {
            const success = await doManualLogin(page, context, account, emitLog);
            if (!success) {
                await prisma.twitterAccount.update({ where: { id: accountId }, data: { status: 'CHECKPOINT' } });
                throw new Error("Authentification Impossible - délai expiré");
            }

            // Save new session
            const cookies = await context.cookies();
            const newSession: SessionData = {
                cookies,
                localStorage: {},
                sessionStorage: {},
                fingerprint,
                deviceInfo,
                createdAt: new Date().toISOString(),
                lastUsed: new Date().toISOString(),
            };
            await sessionManager.saveSession(username, newSession);
            emitLog("💾 Session sauvegardée pour les prochaines actions automatiques.");
        }

        // ── Execute action ──
        emitLog(`⚡ Exécution de l'action : ${action}`);
        switch (action) {
            case 'warmUp':
                await doWarmUp(page, emitLog);
                break;
            case 'setupProfile':
                await doSetupProfile(page, emitLog, config);
                break;
            case 'joinCommunity':
                await doJoinCommunity(page, emitLog, config);
                break;
            case 'autoLike':
                await doAutoLike(page, emitLog, config);
                break;
            case 'autoFollow':
                await doAutoFollow(page, emitLog, config);
                break;
            case 'autoRetweet':
                await doAutoRetweet(page, emitLog, config);
                break;
            case 'autoComment':
                await doAutoComment(page, emitLog, config);
                break;
            case 'autoPost':
                await doAutoPost(page, emitLog, config);
                break;
            case 'post':
                // Scheduled post from queue
                if (config?.postId) {
                    await doScheduledPost(page, emitLog, config.postId);
                } else {
                    await doAutoPost(page, emitLog, config);
                }
                break;
            case 'spamComments':
                await doAutoComment(page, emitLog, { count: config?.count || 5 });
                break;
            case 'postCommunity':
                await doAutoPost(page, emitLog, config);
                break;
            default:
                emitLog(`⚠️ Action inconnue : ${action}`);
        }

        // Refresh cookies after actions
        const updatedCookies = await context.cookies();
        const updatedSession: SessionData = {
            cookies: updatedCookies,
            localStorage: {},
            sessionStorage: {},
            fingerprint,
            deviceInfo,
            createdAt: existingSession?.createdAt || new Date().toISOString(),
            lastUsed: new Date().toISOString(),
        };
        await sessionManager.saveSession(username, updatedSession);

        return { success: true };
    } catch (error: any) {
        socket.emit('worker_error', { username, message: error.message });
        throw error;
    } finally {
        clearInterval(screenshotInterval);
        await browser.close().catch(() => {});
        socket.emit('worker_state', { username, state: 'IDLE' });
        await prisma.twitterAccount.update({ where: { id: accountId }, data: { status: 'ACTIVE' } });
    }
};
