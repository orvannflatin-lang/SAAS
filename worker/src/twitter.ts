import { chromium } from 'playwright-extra';
import { devices } from 'playwright';
import type { Page, BrowserContext, Browser } from 'playwright';
import stealth from 'puppeteer-extra-plugin-stealth';
import { FingerprintGenerator } from 'fingerprint-generator';
import { FingerprintInjector } from 'fingerprint-injector';
import { PrismaClient } from '@prisma/client';
import { io } from 'socket.io-client';
import { sessionManager, SessionData } from './utils/session-manager';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

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

const prisma = new PrismaClient();
const socket = io(process.env.BACKEND_SOCKET_URL || 'http://saas-backend:4000', {
    transports: ['websocket'],
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
});

socket.on('connect', () => {
    debugLog(`✅ [Twitter Handler] Socket connected to backend: ${socket.id}`);
});

socket.on('connect_error', (error) => {
    debugLog(`❌ [Twitter Handler] Socket connection error: ${error.message}`);
});

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
    emitLog: (msg: string) => void,
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
    // Generate a unique fingerprint
    const fpResult = fpGen.getFingerprint({
        devices: ['mobile'],
        operatingSystems: [isIOS ? 'ios' : 'android'],
        browsers: [isIOS ? 'safari' : 'chrome'],
    });
    
    // Use existing fingerprint if provided, otherwise use newly generated one
    const fingerprint = existingFingerprint || fpResult.fingerprint;

    const deviceInfo = existingDeviceInfo || {
        userAgent: ua,
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.dpr,
        platform: isIOS ? 'iPhone' : 'Linux armv8l',
    };

    // Launch browser with stealth args
    emitLog("🚀 Initialisation de la session furtive...");
    const isHeadless = true; 
    emitLog(`DEBUG: isHeadless forced to ${isHeadless} (Env HEADLESS was: ${process.env.HEADLESS})`);
    
    const browser = await chromium.launch({
        headless: isHeadless,
        proxy: proxyConfig,
        args: [
            '--headless=new', // Explicit headless flag
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-notifications',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--ignore-certificate-errors',
            '--disable-web-security',
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
    emitLog("✅ Navigateur démarré. Configuration du contexte...");

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
        
        // Check if we have credentials to use
        const loginText = account.email || account.username;
        const hasPassword = account.password && account.password !== account.username;
        
        if (!hasPassword) {
            emitLog("⚠️ MOT DE PASSE MANQUANT - Connexion automatique impossible!");
            emitLog("💡 Vous devez soit:");
            emitLog("   1. Ajouter le mot de passe au compte dans la base de données");
            emitLog("   2. Ou fournir des cookies valides (auth_token + ct0)");
            emitLog("⏳ En attente de connexion manuelle (15 minutes)...");
            emitLog("💡 Connectez-vous manuellement dans la fenêtre du navigateur");
        }
        
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

        if (passwordField && await passwordField.count() > 0) {
            if (!hasPassword) {
                emitLog("⚠️ Mot de passe non configuré - Connexion manuelle requise");
                emitLog("💡 Veuillez saisir le mot de passe manuellement dans le navigateur");
                // Don't return false yet, wait for manual login
            } else {
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
            }
        } else {
            emitLog("⚠️ Champ mot de passe non trouvé");
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

/**
 * Dismiss any interstitial popups that may appear (Unlock more on X, etc.)
 */
async function dismissPopups(page: Page, emitLog: (msg: string) => void): Promise<void> {
    try {
        // "Unlock more on X" / "Got it" button
        const gotItBtn = page.locator('button:has-text("Got it"), span:has-text("Got it"), div[role="button"]:has-text("Got it"), [data-testid="gotItButton"]').first();
        if (await gotItBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            emitLog("💡 Popup 'Unlock more on X' détectée — fermeture...");
            await humanClick(page, gotItBtn);
            await sleep(1000);
        }

        // "Not now" links
        const notNowBtn = page.locator('a:has-text("Not now"), span:has-text("Not now")').first();
        if (await notNowBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
            emitLog("💡 Popup 'Not now' détectée — fermeture...");
            await humanClick(page, notNowBtn);
            await sleep(800);
        }

        // "Close" dialogs with X button (aria-label="Close")
        const closeBtn = page.locator('[aria-label="Close"], [data-testid="app-bar-close"]').first();
        if (await closeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
            await humanClick(page, closeBtn);
            await sleep(800);
        }
    } catch (_) {
        // Popups optional — never block execution
    }
}

async function validateSession(page: Page, emitLog: (msg: string) => void): Promise<boolean> {
    emitLog("🔄 Vérification de la session existante...");
    
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        attempts++;
        try {
            // Use domcontentloaded + shorter timeout for faster validation
            if (attempts > 1) emitLog(`🔄 Tentative ${attempts}/${maxAttempts} d'accès à la page d'accueil...`);
            await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 20000 });
            await sleep(3000);

            // If still on login or redirected to login, cookies are dead
            if (page.url().includes('/login') || page.url().includes('/i/flow/login')) {
                emitLog("❌ Session invalide (Redirection vers login).");
                return false;
            }

            // Quick check for authenticated layout without waiting for full network idle
            const authenticated = await page.evaluate(() => {
                return !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]') || 
                       !!document.querySelector('nav[aria-label="Primary"]') ||
                       !!document.querySelector('[data-testid="SideNav_NewTweet_Button"]');
            });

            if (authenticated) {
                emitLog("✅ Session valide!");
                return true;
            }

            emitLog(`⚠️ Layout non détecté à la tentative ${attempts}.`);
            if (attempts < maxAttempts) {
                await sleep(3000); // Wait before retrying
                continue; // Loop again
            }

        } catch (error: any) {
            emitLog(`⚠️ Erreur réseau à la tentative ${attempts}: ${error.message}`);
            if (attempts >= maxAttempts) {
                return false;
            }
            await sleep(4000); // Wait before retrying
        }
    }
    
    return false;
}

/**
 * Executes a function with automatic retry and healing
 */
async function retryAction(page: Page, emitLog: (msg: string) => void, actionFn: () => Promise<void>, maxRetries = 2) {
    let lastError: any;
    for (let i = 0; i < maxRetries; i++) {
        try {
            await actionFn();
            return; // Success!
        } catch (error: any) {
            lastError = error;
            emitLog(`⚠️ Échec (tentative ${i + 1}/${maxRetries}): ${error.message}`);
            
            if (i < maxRetries - 1) {
                emitLog("🔄 Tentative de guérison de la session...");
                await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
                await sleep(5000);
                
                // Re-validate session
                const isStillOk = await validateSession(page, emitLog);
                if (!isStillOk) {
                    emitLog("❌ Session perdue pendant l'action. Arrêt.");
                    throw new Error("Session lost during action");
                }
            }
        }
    }
    throw lastError;
}

// ─── Warm Up ──────────────────────────────────────────────────────────────────

async function doWarmUp(page: Page, emitLog: (msg: string) => void) {
    emitLog("🔥 Warm Up : Navigation naturelle sur X (cible: OnlyFans/Adult content)...");

    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    await sleep(randomRange(4000, 7000));
    await humanScroll(page, randomRange(3, 6));

    // Randomly read a few posts
    for (let i = 0; i < randomRange(2, 5); i++) {
        await humanPause(page);
        await humanWander(page);
        await humanScroll(page, 1);
    }

    // Sometimes like a post - focus on model/adult content
    if (Math.random() > 0.4) {
        const likeBtns = await page.$$('[data-testid="like"]');
        if (likeBtns.length > 0) {
            const idx = randomRange(0, Math.min(likeBtns.length - 1, 4));
            await sleep(randomRange(1500, 3500));
            await humanClick(page, likeBtns[idx]);
            emitLog(`❤️ Liked a post during warm up (OnlyFans niche)`);
        }
    }

    emitLog("✅ Warm Up terminé.");
}

// ─── Auto Like ────────────────────────────────────────────────────────────────

async function doAutoLike(page: Page, emitLog: (msg: string) => void, config: any) {
    const count = config?.count || randomRange(4, 6);
    emitLog(`❤️ Natural liking (${count} posts)...`);

    // IF specific URL provided (Social Orchestration)
    if (config?.url) {
        emitLog(`🎯 Directed Like on: ${config.url}`);
        await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(randomRange(3000, 5000));
        await dismissPopups(page, emitLog);
        
        const likeBtn = page.locator('[data-testid="like"]').first();
        if (await likeBtn.isVisible({ timeout: 5000 })) {
            const label = await likeBtn.getAttribute('aria-label');
            if (label && label.toLowerCase().includes('like') && !label.toLowerCase().includes('liked')) {
                await humanClick(page, likeBtn);
                emitLog(`✅ Orchestration like successful.`);
            } else {
                emitLog(`ℹ️ Already liked or button state unclear.`);
            }
            return;
        }
    }

    // ONLY search for OnlyFans content
    const onlyfansKeywords = [
        'onlyfans',
        'onlyfans creator',
        'onlyfans model',
        'onlyfans content',
        'onlyfans girl',
        'onlyfans babe',
        'onlyfans post',
        'link in bio onlyfans',
        'check my onlyfans',
        'onlyfans link'
    ];
    const keyword = onlyfansKeywords[randomRange(0, onlyfansKeywords.length - 1)];
    
    emitLog(`🔍 Recherche: "${keyword}" (contenu adulte)`);
    await page.goto(`https://x.com/search?q=${encodeURIComponent(keyword)}&f=user`, { waitUntil: 'domcontentloaded' });
    await sleep(randomRange(4000, 7000));
    
    // Navigate to a creator's profile and like their posts
    await humanScroll(page, 3);
    await sleep(randomRange(2000, 4000));

    let liked = 0;
    let scrollAttempts = 0;

    while (liked < count && scrollAttempts < 20) {
        await humanScroll(page, 2);
        const likeBtns = await page.$$('[data-testid="like"]');

        for (const btn of likeBtns) {
            if (liked >= count) break;
            // Only click unliked posts
            const ariaLabel = await btn.evaluate((el: any) => el.closest('[aria-label]')?.getAttribute('aria-label') || '').catch(() => '');
            if (ariaLabel.toLowerCase().includes('unlike')) continue;

            await sleep(randomRange(2000, 5000));
            await humanClick(page, btn);
            liked++;
            emitLog(`❤️ Liked OnlyFans post #${liked}/${count}`);
            await sleep(randomRange(1500, 4000));
        }
        scrollAttempts++;
    }

    emitLog(`✅ Auto-Like completed: ${liked} OnlyFans posts liked.`);
}

// ─── Auto Follow ──────────────────────────────────────────────────────────────

async function doAutoFollow(page: Page, emitLog: (msg: string) => void, config: any) {
    // ONLY target OnlyFans creators
    const onlyfansKeywords = [
        'onlyfans creator',
        'onlyfans model',
        'onlyfans girl',
        'onlyfans babe',
        'onlyfans content creator',
        'onlyfans influencer'
    ];
    const keyword = config?.keyword || onlyfansKeywords[randomRange(0, onlyfansKeywords.length - 1)];
    const count = config?.count || randomRange(3, 7);
    emitLog(`👥 Auto-Follow : Following ${count} OnlyFans creators...`);

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
            emitLog(`👤 Followed OnlyFans creator #${followed}/${count}`);
            await sleep(randomRange(2000, 5000));
        }
        scrollAttempts++;
    }

    emitLog(`✅ Auto-Follow completed: ${followed} OnlyFans creators followed.`);
}

// ─── Auto Retweet ─────────────────────────────────────────────────────────────

async function doAutoRetweet(page: Page, emitLog: (msg: string) => void, config: any) {
    const count = config?.count || randomRange(2, 5);
    emitLog(`🔁 Auto-Retweet : Ciblage de ${count} posts de contenu adulte...`);

    // IF specific URL provided (Social Orchestration)
    if (config?.url) {
        emitLog(`🎯 Directed Retweet on: ${config.url}`);
        await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(randomRange(3000, 5000));
        await dismissPopups(page, emitLog);
        
        const rtBtn = page.locator('[data-testid="retweet"]').first();
        if (await rtBtn.isVisible({ timeout: 5000 })) {
            const label = await rtBtn.getAttribute('aria-label');
            if (label && label.toLowerCase().includes('retweet') && !label.toLowerCase().includes('retweeted')) {
                await humanClick(page, rtBtn);
                await sleep(2000);
                const confirmBtn = page.locator('[data-testid="retweetConfirm"]').first();
                if (await confirmBtn.isVisible({ timeout: 5000 })) {
                    await humanClick(page, confirmBtn);
                    emitLog(`✅ Orchestration retweet successful.`);
                }
            } else {
                emitLog(`ℹ️ Already retweeted or button state unclear.`);
            }
            return;
        }
    }

    // Search for adult content to retweet
    const adultKeywords = ['onlyfans', 'nsfw', 'adult content', '18+', 'model'];
    const keyword = adultKeywords[randomRange(0, adultKeywords.length - 1)];
    
    emitLog(`🔍 Recherche: "${keyword}" (contenu adulte)`);
    await page.goto(`https://x.com/search?q=${encodeURIComponent(keyword)}`, { waitUntil: 'domcontentloaded' });
    await sleep(randomRange(4000, 7000));
    await dismissPopups(page, emitLog);

    let retweeted = 0;
    let scrollAttempts = 0;

    while (retweeted < count && scrollAttempts < 15) {
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
                emitLog(`🔁 Retweeté contenu adulte #${retweeted}/${count}`);
            }
            await sleep(randomRange(2000, 5000));
        }
        scrollAttempts++;
    }

    emitLog(`✅ Auto-Retweet terminé : ${retweeted} posts de contenu adulte retweetés.`);
}

// ─── Auto Comment ─────────────────────────────────────────────────────────────

const AUTO_COMMENTS = [
    // Subtils et naturels - Style conversationnel
    "Love this! 🔥",
    "Amazing content as always ✨",
    "You're killing it! 💯",
    "This is gorgeous 😍",
    "Stunning! Keep it up 👏",
    "Wow, this is beautiful!",
    "Incredible work! 🙌",
    "So talented! 😊",
    "This made my day! 💕",
    "Absolutely love this vibe ✨",
    "You always deliver! 🔥",
    "This is so good! 👌",
    "Can't stop looking at this 😍",
    "Perfection! 💯",
    "You're on fire today! 🔥",
    "This is next level! 🚀",
    "Absolutely incredible! ✨",
    "Love the energy here! 💪",
    "This is why I follow you! 😊",
    "Keep creating amazing content! 🙌",
    "You're so underrated! 💎",
    "This deserves more attention! 👀",
    "Obsessed with this! 😍",
    "You never disappoint! 💯",
    "Always bringing the best content! 🔥",
    "This is art! ✨",
    "Queen! 👑",
    "Living for this content! 💕",
    "You're goals! 🙌",
    "This is everything! 😍",
];

async function doAutoComment(page: Page, emitLog: (msg: string) => void, config: any) {
    const count = config?.count || randomRange(2, 4);
    const customComments = config?.comments || AUTO_COMMENTS;
    emitLog(`💬 Leaving ${count} natural comments...`);
    
    // IF specific URL provided (Social Orchestration)
    if (config?.url) {
        emitLog(`🎯 Directed engagement on: ${config.url} with ${count} comments`);
        await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(randomRange(3000, 5000));
        
        for (let i = 0; i < count; i++) {
            await dismissPopups(page, emitLog);
            const replyBtn = page.locator('[data-testid="reply"]').first();
            if (await replyBtn.isVisible({ timeout: 5000 })) {
                await humanClick(page, replyBtn);
                await sleep(2000);
                
                const textArea = '[data-testid="tweetTextarea_0"]';
                const comment = customComments[randomRange(0, customComments.length - 1)];
                await humanType(page, textArea, comment);
                await sleep(2000);
                
                await humanClick(page, page.locator('[data-testid="tweetButton"]').first());
                emitLog(`✅ Orchestration comment ${i+1}/${count} posted: "${comment}"`);
                
                // If there are more comments to post, wait a bit before the next one
                if (i < count - 1) {
                    await sleep(randomRange(5000, 10000));
                }
            } else {
                emitLog(`⚠️ Could not find reply button for comment ${i+1}.`);
                break;
            }
        }
        return;
    }

    // Search ONLY for OnlyFans content creators
    const onlyfansKeywords = [
        'onlyfans',
        'onlyfans creator',
        'onlyfans model',
        'onlyfans girl',
        'onlyfans babe',
        'onlyfans content',
        'onlyfans post',
        'link in bio onlyfans',
        'subscribe my onlyfans',
        'onlyfans link'
    ];
    const keyword = onlyfansKeywords[randomRange(0, onlyfansKeywords.length - 1)];
    
    emitLog(`🔍 Recherche de contenu: "${keyword}"`);
    await page.goto(`https://x.com/search?q=${encodeURIComponent(keyword)}`, { waitUntil: 'domcontentloaded' });
    await sleep(randomRange(4000, 7000));
    await humanScroll(page, 3);

    let commented = 0;
    let scrollAttempts = 0;

    while (commented < count && scrollAttempts < 15) {
        const replyBtns = await page.$$('[data-testid="reply"]');
        emitLog(`👀 Detected ${replyBtns.length} reply buttons on page (Attempt ${scrollAttempts + 1}/15)`);

        for (const btn of replyBtns) {
            if (commented >= count) break;
            await sleep(randomRange(4000, 10000));
            await humanClick(page, btn);
            await sleep(randomRange(1500, 3000));

            const textArea = '[data-testid="tweetTextarea_0"]';
            const ta = page.locator(textArea).first();
            if (await ta.count() === 0) continue;

            const comment = customComments[randomRange(0, customComments.length - 1)];
            emitLog(`✍️ Commenting: "${comment}"`);
            await humanType(page, textArea, comment);
            await sleep(randomRange(1500, 3000));

            const replyBtn = page.locator('[data-testid="tweetButton"]').first();
            if (await replyBtn.count() > 0) {
                await humanClick(page, replyBtn);
                commented++;
                emitLog(`✅ Comment #${commented}/${count} posted successfully.`);
            }
            await sleep(randomRange(3000, 8000));
        }

        await humanScroll(page, 2);
        scrollAttempts++;
    }

    emitLog(`✅ Auto-Comment completed: ${commented} comments posted naturally.`);
}

// ─── Update Profile ────────────────────────────────────────────────────────────

async function doUpdateProfile(page: Page, emitLog: (msg: string) => void, config: any) {
    emitLog("🪪 Début de la mise à jour (Photos + Bio)...");

    // Helper: download an image URL to a temp file
    const downloadImage = async (url: string, filename: string): Promise<string | null> => {
        try {
            // Fix localhost URL if worker is in docker and backend is saas-backend
            let finalUrl = url;
            if (url.includes('localhost') && process.env.BACKEND_INTERNAL_URL) {
                finalUrl = url.replace('http://localhost:4000', process.env.BACKEND_INTERNAL_URL);
            }

            const tmpPath = path.join('/tmp', `twitter_${filename}_${Date.now()}.jpg`);
            const protocol = finalUrl.startsWith('https') ? https : http;

            emitLog(`📡 Téléchargement ${filename} depuis ${finalUrl}...`);

            return new Promise<string | null>((resolve) => {
                const timeout = setTimeout(() => {
                    emitLog(`⚠️ Timeout (15s) de téléchargement pour ${filename}`);
                    resolve(null);
                }, 15000);

                const file = fs.createWriteStream(tmpPath);
                protocol.get(finalUrl, (response: any) => {
                    if (response.statusCode === 301 || response.statusCode === 302) {
                        const newUrl = response.headers.location;
                        if (!newUrl) { resolve(null); return; }
                        (newUrl.startsWith('https') ? https : http).get(newUrl, (res2: any) => {
                            res2.pipe(file);
                            file.on('finish', () => { clearTimeout(timeout); file.close(); resolve(tmpPath); });
                        }).on('error', () => { clearTimeout(timeout); resolve(null); });
                        return;
                    }

                    if (response.statusCode !== 200) {
                        emitLog(`⚠️ Erreur HTTP ${response.statusCode} pour ${filename}`);
                        clearTimeout(timeout);
                        resolve(null);
                        return;
                    }

                    response.pipe(file);
                    file.on('finish', () => { 
                        clearTimeout(timeout); 
                        file.close(); 
                        resolve(tmpPath); 
                    });
                }).on('error', (err: any) => { 
                    clearTimeout(timeout); 
                    emitLog(`⚠️ Erreur réseau download ${filename}: ${err.message}`);
                    resolve(null); 
                });
            }).catch((err) => {
                emitLog(`⚠️ Exception Promise download: ${err.message}`);
                return null;
            });
        } catch (e: any) {
            emitLog(`⚠️ Erreur fatale téléchargement image: ${e.message}`);
            return null;
        }
    };

    // Navigate to the profile
    const username = config.username;
    emitLog(`🌐 Navigation vers le profil de @${username}...`);
    await page.goto(`https://x.com/${username}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => {
        emitLog(`⚠️ Navigation domcontentloaded timeout: ${e.message}`);
    });
    await sleep(randomRange(3000, 5000));
    
    // Dismiss any popups
    await dismissPopups(page, emitLog);

    // Click "Edit profile" button on profile page
    emitLog("🔍 Recherche du bouton 'Edit profile'...");
    const editProfileBtn = page.locator('a[href="/settings/profile"], [data-testid="editProfileButton"]').first();
    if (await editProfileBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        emitLog("🖱️ Clic sur 'Edit profile'...");
        await humanClick(page, editProfileBtn);
        await sleep(3000);
    } else {
        emitLog("⚠️ Bouton non trouvé, navigation directe vers /settings/profile...");
        await page.goto('https://x.com/settings/profile', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await sleep(3000);
    }

    try {
        // --- Upload Banner Image ---
        if (config?.bannerImage && config.bannerImage.startsWith('http')) {
            emitLog("🖼️ Traitement de la bannière...");
            const bannerPath = await downloadImage(config.bannerImage, 'banner');
            if (bannerPath) {
                emitLog("📤 Injection du fichier bannière...");
                const bannerInput = page.locator('input[type="file"]').first();
                await bannerInput.setInputFiles(bannerPath).catch(() => {});
                
                await sleep(5000); 
                
                const applyBtn = page.locator('[data-testid="applyButton"], button:has-text("Apply"), button:has-text("Appliquer")').first();
                emitLog("🔍 Attente du bouton de validation (Apply)...");
                // Correct way to wait for visibility with timeout
                await applyBtn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

                if (await applyBtn.isVisible().catch(() => false)) {
                    emitLog("✅ Validation du recadrage bannière...");
                    await humanClick(page, applyBtn);
                    // Wait for the crop modal to disappear
                    await applyBtn.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
                    await sleep(5000); // Wait for the main modal to be interactable again
                } else {
                    emitLog("⚠️ Bouton 'Apply' non visible pour la bannière. Skip recadrage.");
                }
                if (fs.existsSync(bannerPath)) fs.unlinkSync(bannerPath);
            }
        }

        // --- Upload Profile Photo ---
        if (config?.profileImage && config.profileImage.startsWith('http')) {
            emitLog("📷 Traitement de la photo de profil...");
            const photoPath = await downloadImage(config.profileImage, 'profile');
            if (photoPath) {
                // Ensure no other modal is open
                await page.locator('[data-testid="applyButton"]').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
                
                emitLog("📤 Injection du fichier photo de profil...");
                // The profile photo input is often the one inside the profilePhotoUpload container
                const photoInput = page.locator('[data-testid="profilePhotoUpload"] input[type="file"]').last();
                if (await photoInput.count() === 0) {
                    emitLog("🔍 Sélecteur spécifique échoué, tentative via second input...");
                    const allInputs = await page.locator('input[type="file"]').all();
                    if (allInputs.length > 1) await allInputs[1].setInputFiles(photoPath).catch(() => {});
                    else if (allInputs.length > 0) await allInputs[0].setInputFiles(photoPath).catch(() => {});
                } else {
                    await photoInput.setInputFiles(photoPath).catch(() => {});
                }

                await sleep(5000);
                
                const applyBtn = page.locator('[data-testid="applyButton"], button:has-text("Apply"), button:has-text("Appliquer")').first();
                emitLog("🔍 Attente du bouton de validation (Apply)...");
                await applyBtn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

                if (await applyBtn.isVisible().catch(() => false)) {
                    emitLog("✅ Validation du recadrage photo...");
                    await humanClick(page, applyBtn);
                    await applyBtn.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
                    await sleep(5000);
                } else {
                    emitLog("⚠️ Bouton 'Apply' non visible pour la photo. Skip recadrage.");
                }
                if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
            }
        }

        // --- Update Bio ---
        if (config?.bio) {
            emitLog(`✍️ Saisie de la bio...`);
            const bioField = page.locator('textarea[name="description"]').first();
            await bioField.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
            
            if (await bioField.isVisible().catch(() => false)) {
                await bioField.click();
                await page.keyboard.press('Control+a');
                await sleep(800);
                await page.keyboard.press('Backspace');
                await bioField.fill(''); // Safety
                await humanType(page, 'textarea[name="description"]', config.bio);
                await sleep(2000);
            } else {
                emitLog("⚠️ Champ bio non trouvé ou encore masqué par une modale.");
            }
        }

        // --- Update Name ---
        if (config?.displayName) {
            emitLog(`📝 Saisie du nom: ${config.displayName}`);
            const nameField = page.locator('input[name="displayName"]').first();
            if (await nameField.isVisible().catch(() => false)) {
                await nameField.click();
                await page.keyboard.press('Control+KeyA');
                await page.keyboard.press('Backspace');
                await nameField.fill(config.displayName);
            }
        }

        await sleep(2000);

        // --- Save All ---
        emitLog("💾 Enregistrement final des modifications...");
        const saveBtn = page.locator('[data-testid="Profile_Save_Button"]').first();
        if (await saveBtn.isVisible().catch(() => false)) {
            await humanClick(page, saveBtn);
            emitLog("⏳ Attente de confirmation de Twitter...");
            await sleep(6000);
            emitLog("✅ Profil mis à jour avec succès !");
        } else {
            emitLog("⚠️ Bouton 'Save' non trouvé. Tentative de sortie...");
        }

        // --- Update in DB ---
        if (config?.niche || config?.bio) {
            await prisma.twitterAccount.update({
                where: { username: config.username },
                data: {
                    ...(config.bio && { bio: config.bio }),
                    ...(config.niche && { niche: config.niche }),
                }
            }).catch((e: any) => emitLog(`⚠️ Erreur synchro DB: ${e.message}`));
        }

    } catch (e: any) {
        emitLog(`❌ Erreur fatale update: ${e.message}`);
    }
}

// ─── Auto Post ────────────────────────────────────────────────────────────────

// Auto-post messages - OnlyFans friendly content (not too explicit)
const AUTO_TWEETS = [
    "New content just dropped! Check the link in bio 🔥✨",
    "Exclusive photos available now! Don't miss out 💋📸",
    "Thank you for all the support! More coming soon ❤️🌟",
    "Behind the scenes content you'll love 😍💕",
    "Special offer for my subscribers! Link below 👇🔥",
    "Just posted something amazing! Go see it 😘✨",
    "Your favorite content creator is live! Join now 💖",
    "New photoset available! You know where to find it 📷💋",
    "Feeling creative today! Check out my latest work 🎨🔥",
    "Appreciate all the love! Exclusive content for you ❤️🌹",
    "Weekend vibes! New content just for you 😍📸",
    "Something special waiting for you... Link in bio 🔥💕",
    "Thank you for 10K followers! Celebration content coming 🎉❤️",
    "Can't wait to show you what I've been working on! 😘✨",
    "Premium content now available! Don't miss out 💎🔥",
];
async function downloadImage(url: string, prefix: string): Promise<string | null> {
    return new Promise((resolve) => {
        const tempPath = path.join('/tmp', `${prefix}-${Date.now()}.jpg`);
        const file = fs.createWriteStream(tempPath);
        
        const protocol = url.startsWith('https') ? https : http;
        
        protocol.get(url, { timeout: 15000 }, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(tempPath);
                });
            } else {
                resolve(null);
            }
        }).on('error', (err) => {
            console.error('Download error:', err);
            resolve(null);
        });
    });
}

async function doAutoPost(page: Page, emitLog: (msg: string) => void, config: any, username: string) {
    emitLog("📝 Auto-Post : Publication d'un tweet...");

    // Navigate to home with retry logic
    let homeLoaded = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            if (attempt > 1) emitLog(`🔄 Tentative ${attempt}/3 de chargement de la page d'accueil...`);
            await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 25000 });
            homeLoaded = true;
            break;
        } catch (navErr: any) {
            emitLog(`⚠️ Navigation échouée (tentative ${attempt}/3): ${navErr.message.split('\n')[0]}`);
            if (attempt < 3) await sleep(5000);
        }
    }

    if (!homeLoaded) {
        emitLog("❌ Impossible de charger la page d'accueil après 3 tentatives. Abandon.");
        throw new Error("Failed to navigate to x.com/home after 3 attempts");
    }

    await sleep(randomRange(2000, 4000));
    await dismissPopups(page, emitLog);
    
    try {
        // Wait for page to fully load
        await page.waitForSelector('main', { state: 'visible', timeout: 15000 });
        await sleep(randomRange(2000, 3000));
        
        // Try multiple strategies to find compose button
        let composed = false;
        
        // Strategy 1: Look for Post button in sidebar
        const postButtonSelectors = [
            'a[data-testid="SideNav_NewTweet_Button"]',
            '[data-testid="SideNav_NewTweet_Button"]',
            'a[aria-label*="Post"]',
            'a[href="/compose/post"]',
        ];
        
        for (const selector of postButtonSelectors) {
            try {
                const btn = page.locator(selector).first();
                if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
                    emitLog("🔘 Clicking Post button (sidebar)...");
                    await btn.click();
                    composed = true;
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        
        // Strategy 2: Try keyboard shortcut (Ctrl+Enter or Cmd+Enter doesn't work, but N does on desktop)
        if (!composed) {
            try {
                emitLog("⌨️ Trying keyboard shortcut...");
                await page.keyboard.press('n');
                await sleep(2000);
                
                // Check if compose dialog appeared
                const textArea = page.locator('[data-testid="tweetTextarea_0"]').first();
                if (await textArea.isVisible({ timeout: 3000 }).catch(() => false)) {
                    composed = true;
                    emitLog("✅ Compose dialog opened with keyboard");
                }
            } catch (e) {
                emitLog("⚠️ Keyboard shortcut failed");
            }
        }
        
        // Strategy 3: Navigate directly to compose page (or community compose) — with retry
        if (!composed) {
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const composeUrl = config?.communityUrl 
                        ? `${config.communityUrl.replace(/\/$/, '')}/compose` 
                        : 'https://x.com/compose/post';
                    
                    if (attempt === 1) emitLog(`🌐 Navigation vers la page de composition...`);
                    else emitLog(`🔄 Tentative ${attempt}/3 pour la page compose...`);
                    await page.goto(composeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await sleep(3000);
                    
                    const textArea = page.locator('[data-testid="tweetTextarea_0"]').first();
                    if (await textArea.isVisible({ timeout: 7000 }).catch(() => false)) {
                        composed = true;
                        emitLog("✅ Page compose chargée !");
                        break;
                    } else {
                        emitLog(`⚠️ Page composée chargée mais zone de texte absente (tentative ${attempt}/3).`);
                    }
                } catch (e: any) {
                    emitLog(`⚠️ Navigation compose échouée (tentative ${attempt}/3): ${e.message.split('\n')[0]}`);
                    if (attempt < 3) await sleep(5000);
                }
            }
        }
        
        if (!composed) {
            emitLog("❌ Impossible d'ouvrir la fenêtre de composition après toutes les tentatives.");
            throw new Error("Could not open compose dialog — BullMQ will retry this job");
        }
        
        await sleep(randomRange(1000, 2000));
        
        // Prepare tweet content
        let tweetContent = config?.content || AUTO_TWEETS[randomRange(0, AUTO_TWEETS.length - 1)];
        
        // ── Anti-duplicate spin ──────────────────────────────────────────────
        // X rejects identical content posted twice. We add a tiny invisible
        // Unicode variation + a random thematic flair so each post is unique.
        const SPIN_EMOJIS = ['✨', '🔥', '💫', '🌙', '💎', '🌸', '⚡', '🎯', '💖', '🚀', '👑', '🌟'];
        const spinEmoji = SPIN_EMOJIS[Math.floor(Math.random() * SPIN_EMOJIS.length)];
        // Append a zero-width variation selector (invisible) + emoji
        tweetContent = tweetContent.trimEnd() + ' ' + spinEmoji;
        // ──────────────────────────────────────────────────────────────────────
        
        // Add OnlyFans link if configured
        if (config?.onlyfansUrl) {
            tweetContent += `\n\n${config.onlyfansUrl}`;
            emitLog(`🔗 Adding OnlyFans link`);
        } else if (config?.link) {
            tweetContent += `\n\n${config.link}`;
            emitLog(`🔗 Adding link`);
        }
        
        // Add hashtags if configured
        if (config?.hashtags && config.hashtags.length > 0) {
            const randomHashtags = config.hashtags
                .sort(() => 0.5 - Math.random())
                .slice(0, randomRange(2, 4));
            tweetContent += `\n${randomHashtags.join(' ')}`;
        }
        
        // Type the content
        const textAreaSelector = '[data-testid="tweetTextarea_0"]';
        await page.waitForSelector(textAreaSelector, { state: 'visible', timeout: 10000 });
        
        emitLog(`✍️ Typing: "${tweetContent.substring(0, 50)}..."`);
        await humanType(page, textAreaSelector, tweetContent);
        await sleep(randomRange(1500, 2500));
        
        // Add media if URLs provided
        if (config?.mediaUrls && config.mediaUrls.length > 0) {
            emitLog(`📸 Traitement de ${config.mediaUrls.length} fichier(s) média...`);
            const downloadedPaths: string[] = [];
            
            try {
                for (const url of config.mediaUrls.slice(0, 4)) { // Twitter limit: 4 images
                    const filePath = await downloadImage(url, 'post');
                    if (filePath) downloadedPaths.push(filePath);
                }

                if (downloadedPaths.length > 0) {
                    emitLog(`📤 Injection de ${downloadedPaths.length} média...`);
                    const fileInput = page.locator('input[data-testid="fileInput"]').first();
                    await fileInput.setInputFiles(downloadedPaths).catch(e => emitLog(`⚠️ Erreur média: ${e.message}`));
                    await sleep(3000);
                }
            } catch (err: any) {
                emitLog(`⚠️ Erreur lors du traitement média: ${err.message}`);
            } finally {
                // We'll delete them after the final post click or in a cleanup
                // For now, let's keep track locally to delete after post
            }
        }
        
        // Click Tweet button
        const tweetBtn = page.locator('[data-testid="tweetButton"]').first();
        if (await tweetBtn.count() > 0 && await tweetBtn.isEnabled().catch(() => false)) {
            emitLog("🚀 Posting tweet...");
            await humanClick(page, tweetBtn);
            await sleep(randomRange(3000, 5000));
            emitLog("✅ Tweet published successfully!");
        
            // ── URL Capture: Profile → Click first tweet → read address bar ─────
            let postUrl: string | null = null;
            emitLog("🔍 Navigation vers le profil pour trouver le post...");
            
            try {
                await page.goto(`https://x.com/${username}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await sleep(3000);
                
                // Find the first tweet article that has a timestamp link (most recent post)
                const firstTweetTimestamp = page.locator('article[data-testid="tweet"] time').first();
                const firstTweetLink = page.locator('article[data-testid="tweet"] a[href*="/status/"]').first();
                
                if (await firstTweetLink.isVisible({ timeout: 8000 }).catch(() => false)) {
                    emitLog("🖱️ Clic sur le premier tweet pour obtenir son lien permanent...");
                    
                    // Click the timestamp/link, which navigates to the tweet permalink
                    await firstTweetTimestamp.click().catch(async () => {
                        await firstTweetLink.click();
                    });
                    
                    // Wait for navigation to the individual tweet page
                    await page.waitForURL('**x.com/**/status/**', { timeout: 15000 }).catch(() => {});
                    await sleep(1500);
                    
                    // Read the URL directly from the browser address bar
                    const currentUrl = page.url();
                    if (currentUrl.includes('/status/')) {
                        postUrl = currentUrl;
                        emitLog(`✅ URL récupérée depuis la barre d'adresse: ${postUrl}`);
                    }
                }
            } catch (urlErr: any) {
                emitLog(`⚠️ Impossible de récupérer l'URL du post: ${urlErr.message.split('\n')[0]}`);
            }
            // ──────────────────────────────────────────────────────────────────────
            
            if (postUrl) {
                try {
                    const account = await prisma.twitterAccount.findUnique({ where: { username } });
                    if (account) {
                        await prisma.twitterPost.create({
                            data: {
                                accountId: account.id,
                                content: tweetContent,
                                postUrl: postUrl,
                                status: 'PUBLISHED',
                                publishedAt: new Date(),
                                scheduleDate: new Date(),
                            },
                        });
                        emitLog("✅ Post URL enregistrée — les bots Spammers vont réagir !");
                    }
                } catch (dbErr: any) {
                    emitLog(`⚠️ Erreur enregistrement post: ${dbErr.message}`);
                }
                return { success: true, postUrl };
            } else {
                emitLog("⚠️ URL non récupérée — le post a quand même été publié.");
                return { success: true, postUrl: null };
            }

        } else {
            emitLog("⚠️ Tweet button not found or disabled");
            // Try posting with Enter key
            await page.keyboard.press('Control+Enter');
            await sleep(5000);
            emitLog("✅ Posted with keyboard shortcut");
            
            // ── URL Capture: Profile → Click first tweet → read address bar ─────
            let postUrl2: string | null = null;
            emitLog("🔍 Navigation vers le profil pour trouver le post (shortcut)...");
            try {
                await page.goto(`https://x.com/${username}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await sleep(3000);
                const firstTweetTimestamp = page.locator('article[data-testid="tweet"] time').first();
                const firstTweetLink = page.locator('article[data-testid="tweet"] a[href*="/status/"]').first();
                if (await firstTweetLink.isVisible({ timeout: 8000 }).catch(() => false)) {
                    emitLog("🖱️ Clic sur le premier tweet pour obtenir son lien permanent...");
                    await firstTweetTimestamp.click().catch(async () => { await firstTweetLink.click(); });
                    await page.waitForURL('**x.com/**/status/**', { timeout: 15000 }).catch(() => {});
                    await sleep(1500);
                    const currentUrl = page.url();
                    if (currentUrl.includes('/status/')) {
                        postUrl2 = currentUrl;
                        emitLog(`✅ URL récupérée depuis la barre d'adresse: ${postUrl2}`);
                    }
                }
            } catch (urlErr: any) {
                emitLog(`⚠️ Erreur capture URL (shortcut): ${urlErr.message.split('\n')[0]}`);
            }

            if (postUrl2) {
                try {
                    const account2 = await prisma.twitterAccount.findUnique({ where: { username } });
                    if (account2) {
                        await prisma.twitterPost.create({
                            data: {
                                accountId: account2.id,
                                content: tweetContent,
                                postUrl: postUrl2,
                                status: 'PUBLISHED',
                                publishedAt: new Date(),
                                scheduleDate: new Date(),
                            },
                        });
                        emitLog("✅ Post URL enregistrée — les bots Spammers vont réagir !");
                    }
                } catch (dbErr: any) {
                    emitLog(`⚠️ Erreur enregistrement post (shortcut): ${dbErr.message}`);
                }
                return { success: true, postUrl: postUrl2 };
            }
        }
        
    } catch (e: any) {
        emitLog(`❌ Error during posting: ${e.message}`);
        console.error('Post error:', e);
    }
    
    await sleep(3000);
}

// ─── Scheduled Post ───────────────────────────────────────────────────────────

async function doScheduledPost(page: Page, emitLog: (msg: string) => void, postId: string, username: string) {
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

            emitLog("✅ Tweet published successfully!");
            
            // Try to get the post URL by visiting the profile
            await sleep(2000);
            await page.goto(`https://x.com/${username}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await sleep(3000);
            
            const firstTweetLink = page.locator('article[data-testid="tweet"] a[href*="/status/"]').first();
            if (await firstTweetLink.isVisible({ timeout: 5000 }).catch(() => false)) {
                const href = await firstTweetLink.getAttribute('href');
                if (href) {
                    const postUrl = `https://x.com${href}`;
                    emitLog(`🔗 Post URL found: ${postUrl}`);
                    
                    // Update the existing scheduled post record
                    await prisma.twitterPost.update({
                        where: { id: postId },
                        data: { postUrl: postUrl }
                    }).catch(() => {});

                    return { success: true, postUrl };
                }
            }

            return { success: true };
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
    "OnlyFans Creator 🔥 | Exclusive content | Link below 👇",
    "Content Creator 💕 | Daily posts | Subscribe for more ✨",
    "Your favorite creator 😍 | New content every day | Link in bio",
    "Premium content 🔞 | Exclusive access | DM for collabs 💌",
    "Lifestyle & Content Creator 🌟 | Check my links below",
    "Digital Creator 📸 | Exclusive content on my page 💋",
    "Creating content you'll love ❤️ | Subscribe now 👇",
    "Exclusive content creator 🔥 | Daily updates | Link below",
    "Your daily dose of premium content 😍 | Subscribe ✨",
    "Content Creator 💕 | Exclusive access | Don't miss out 🔥",
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
    if (config?.url) {
        emitLog(`👥 Join Community : Direct join via URL: ${config.url}`);
        await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(randomRange(3000, 5000));
        
        // Look for Join button
        const joinBtn = page.locator('button:has-text("Join"), button:has-text("Rejoindre")').first();
        if (await joinBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await humanClick(page, joinBtn);
            emitLog("✅ Community join button clicked.");
            await sleep(2000);
        } else {
            emitLog("ℹ️ Join button not visible. Already a member?");
        }
        return;
    }

    // Fallback to keyword search
    const onlyfansKeywords = [
        'onlyfans',
        'onlyfans creator',
        'onlyfans model',
        'onlyfans content',
        'onlyfans girl',
        'link in bio onlyfans',
        'subscribe my onlyfans',
        'onlyfans link',
        'onlyfans creator community',
        'onlyfans models'
    ];
    const keyword = config?.keyword || onlyfansKeywords[randomRange(0, onlyfansKeywords.length - 1)];
    emitLog(`👥 Join Community : Searching OnlyFans communities for "${keyword}"...`);

    try {
        await page.goto('https://x.com/explore', { waitUntil: 'domcontentloaded' });
        await sleep(randomRange(3000, 5000));

        const searchInput = 'input[data-testid="SearchBox_Search_Input"]';
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
            }
        }
        emitLog(`✅ Search & Interaction Warm-up complete (${liked} likes).`);
    } catch (err: any) {
        emitLog(`⚠️ Search error: ${err.message}`);
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
        debugLog(`[${username}] ${msg}`);
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
    const session = await createStealthSession(proxyConfig, emitLog, existingDeviceInfo, existingFingerprint);
    const { browser, context, page, deviceInfo, fingerprint } = session;
    emitLog("✅ Session furtive créée.");

    // Screenshot interval for dashboard
    const screenshotInterval = setInterval(async () => {
        try {
            if (page.isClosed()) return;
            const screenshot = await page.screenshot({ type: 'jpeg', quality: 25 });
            socket.emit('worker_screenshot', { username, image: screenshot.toString('base64') });
        } catch (e) {}
    }, 2000);

    try {
        let isAuthenticated = false;

        // ── PRIORITY 1: Try to restore session from cookies ──
        if (account.sessionCookies && Array.isArray(account.sessionCookies) && account.sessionCookies.length > 0) {
            emitLog("🍪 Connexion par cookies uniquement...");
            emitLog(`📋 ${account.sessionCookies.length} cookies chargés`);
            
            // Check if we have both auth_token and ct0
            const hasAuthToken = account.sessionCookies.some((c: any) => c.name === 'auth_token');
            const hasCt0 = account.sessionCookies.some((c: any) => c.name === 'ct0');
            
            if (!hasAuthToken) {
                emitLog("❌ CRITICAL: Cookie 'auth_token' manquant. La session ne peut pas être authentifiée.");
            } else if (!hasCt0) {
                emitLog("⚠️ WARNING: Cookie 'ct0' manquant. La requête risque d'être rejetée par X (403 Forbidden).");
            }
            
            await context.addCookies(account.sessionCookies as any);
            isAuthenticated = await validateSession(page, emitLog);
            
            if (!isAuthenticated) {
                emitLog("❌ Cookies invalides ou expirés");
                emitLog("💡 Veuillez mettre à jour les cookies depuis votre navigateur");
                await context.clearCookies();
            } else {
                emitLog("✅ Connexion réussie avec les cookies!");
                
                // Save refreshed cookies to database
                try {
                    const refreshedCookies = await context.cookies();
                    emitLog(`💾 Sauvegarde des cookies rafraîchis (${refreshedCookies.length} cookies)...`);
                    await prisma.twitterAccount.update({
                        where: { id: accountId },
                        data: { sessionCookies: refreshedCookies as any }
                    });
                    emitLog("✅ Cookies mis à jour en base de données");
                } catch (error) {
                    emitLog(`⚠️ Erreur sauvegarde cookies: ${error}`);
                }
            }
        } else if (existingSession && sessionManager.isSessionValid(existingSession) && existingSession.cookies.length > 0) {
            emitLog("🍪 Chargement des cookies de session locale...");
            await context.addCookies(existingSession.cookies);
            isAuthenticated = await validateSession(page, emitLog);

            if (!isAuthenticated) {
                emitLog("🗑️ Cookies invalides, suppression de l'ancienne session...");
                await sessionManager.deleteSession(username);
                await context.clearCookies();
            } else {
                emitLog("✅ Session locale valide!");
                
                // Save refreshed cookies to database
                try {
                    const refreshedCookies = await context.cookies();
                    emitLog(`💾 Rafraîchissement des cookies (${refreshedCookies.length} cookies)...`);
                    
                    // Update database
                    await prisma.twitterAccount.update({
                        where: { id: accountId },
                        data: { sessionCookies: refreshedCookies as any }
                    });
                    emitLog("✅ Cookies mis à jour en base de données");
                } catch (error) {
                    emitLog(`⚠️ Erreur sauvegarde cookies: ${error}`);
                }
            }
        }

        // ── If cookies fail, NO manual login - just fail ──
        if (!isAuthenticated) {
            emitLog("❌ AUTHENTIFICATION IMPOSSIBLE - Cookies invalides ou manquants");
            emitLog("💡 Solution:");
            emitLog("   1. Connectez-vous à x.com dans votre navigateur");
            emitLog("   2. F12 → Application → Cookies → x.com");
            emitLog("   3. Copiez TOUS les cookies");
            emitLog("   4. Utilisez update_cookies.js pour les ajouter");
            
            await prisma.twitterAccount.update({ where: { id: accountId }, data: { status: 'CHECKPOINT' } });
            throw new Error("Cookies invalides ou manquants - Mise à jour requise");
        }

        // Dismiss any initial popups (Got it, etc.)
        await dismissPopups(page, emitLog);
        
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
                const autoPostResult = await doAutoPost(page, emitLog, config, username);
                if (autoPostResult?.postUrl) job.data.postUrl = autoPostResult.postUrl;
                break;
            case 'post':
                // Scheduled post from queue
                if (config?.postId) {
                    const schedPostResult = await doScheduledPost(page, emitLog, config.postId, username);
                    // @ts-ignore
                    if (schedPostResult?.postUrl) job.data.postUrl = schedPostResult.postUrl;
                } else {
                    const autoPostResult2 = await doAutoPost(page, emitLog, config, username);
                    if (autoPostResult2?.postUrl) job.data.postUrl = autoPostResult2.postUrl;
                }
                break;
            case 'spamComments':
                await doAutoComment(page, emitLog, { ...config, count: config?.count || 5 });
                break;
            case 'postCommunity':
                const communityPostResult = await doAutoPost(page, emitLog, config, username);
                if (communityPostResult?.postUrl) job.data.postUrl = communityPostResult.postUrl;
                break;
            case 'updateProfile':
                await doUpdateProfile(page, emitLog, {
                    ...config,
                    username,
                    bio: config?.bio || account.bio,
                    niche: config?.niche || account.niche,
                    profileImage: config?.profileImage || account.profileImage,
                    bannerImage: config?.bannerImage || account.bannerImage,
                });
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
        
        // REFRESH DB State one last time
        const finalAcc = await prisma.twitterAccount.findUnique({ where: { id: accountId } });
        const autoMode = finalAcc?.autoMode || false;

        if (autoMode) {
            emitLog("🔄 Auto-Mode actif : Maintien de la session ouverte...");
            // We don't close the browser. This allows the user to see the screencast
            socket.emit('worker_state', { username, state: 'ACTIVE' });
        } else {
            emitLog("⏹️ Fin de session : Fermeture du navigateur.");
            socket.emit('worker_screenshot', { username, image: null }); 
            await browser?.close();
            socket.emit('worker_state', { username, state: 'IDLE' });
            await prisma.twitterAccount.update({ where: { id: accountId }, data: { status: 'ACTIVE' } });
        }
    }
};
