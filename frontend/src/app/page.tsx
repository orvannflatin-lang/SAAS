'use client';
import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import {
    LayoutDashboard,
    Users,
    Send,
    Settings,
    ShieldCheck,
    Activity,
    Instagram,
    Terminal,
    Eye,
    Monitor,
    Plus,
    Play,
    X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- Types ---
interface Account {
    id: string;
    username: string;
    status: string;
    progress?: number;
    isOnline?: boolean;
}

export default function Dashboard() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [logs, setLogs] = useState<{ username: string, message: string }[]>([]);
    const [screenshots, setScreenshots] = useState<Record<string, string>>({});
    const [activeAccount, setActiveAccount] = useState('');
    const [viewMode, setViewMode] = useState<'SINGLE' | 'GRID'>('SINGLE');
    const [showAddModal, setShowAddModal] = useState(false);

    // New Account Form State
    const [newAcc, setNewAcc] = useState({ username: '', password: '', proxyHost: '', proxyPort: '' });

    useEffect(() => {
        fetchAccounts();
        const socket = io('http://localhost:4000');
        socket.on('ui_log', (data) => setLogs((prev) => [data, ...prev].slice(0, 50)));
        socket.on('ui_screenshot', (data) => setScreenshots((prev) => ({ ...prev, [data.username]: `data:image/jpeg;base64,${data.image}` })));
        return () => { socket.disconnect(); };
    }, []);

    const fetchAccounts = async () => {
        try {
            const res = await fetch('http://localhost:4000/api/accounts');
            const data = await res.json();
            setAccounts(data);
            if (data.length > 0 && !activeAccount) setActiveAccount(data[0].username);
        } catch (e) { }
    };

    const handleAddAccount = async (e: any) => {
        e.preventDefault();
        await fetch('http://localhost:4000/api/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: newAcc.username,
                password: newAcc.password,
                proxy: { host: newAcc.proxyHost, port: newAcc.proxyPort }
            })
        });
        setShowAddModal(false);
        fetchAccounts();
    };

    const launchAction = async (id: string, action: string) => {
        await fetch(`http://localhost:4000/api/accounts/${id}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        });
    };

    return (
        <div className="flex h-screen bg-[#050505] text-white font-sans selection:bg-violet-500/30 overflow-hidden">
            {/* Sidebar */}
            <aside className="w-20 border-r border-white/5 flex flex-col items-center py-8 gap-10 bg-[#080808] z-50 text-white/20">
                <div className="p-3 bg-gradient-to-tr from-violet-600 to-fuchsia-600 rounded-xl text-white shadow-lg shadow-violet-600/20">
                    <Instagram size={24} />
                </div>
                <nav className="flex flex-col gap-8 items-center">
                    <SidebarIcon icon={<LayoutDashboard size={20} />} active={viewMode === 'SINGLE'} onClick={() => setViewMode('SINGLE')} />
                    <SidebarIcon icon={<Monitor size={20} />} active={viewMode === 'GRID'} onClick={() => setViewMode('GRID')} />
                    <SidebarIcon icon={<Users size={20} />} />
                    <Plus size={24} className="cursor-pointer hover:text-white transition-colors mt-4" onClick={() => setShowAddModal(true)} />
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden relative">
                <header className="h-20 border-b border-white/5 flex items-center justify-between px-10 relative z-10 bg-[#050505]/50 backdrop-blur-xl">
                    <h2 className="text-xl font-bold tracking-tight">Duupflow Dashboard</h2>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="bg-violet-600 hover:bg-violet-500 px-6 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-all"
                    >
                        <Plus size={16} /> Add Account
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-10 space-y-10 relative z-10">

                    {viewMode === 'SINGLE' ? (
                        <>
                            {/* Account Grid */}
                            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {accounts.map((acc) => (
                                    <AccountCard
                                        key={acc.id}
                                        account={acc}
                                        active={activeAccount === acc.username}
                                        onClick={() => setActiveAccount(acc.username)}
                                        onLaunch={() => launchAction(acc.id, 'warmUp')}
                                    />
                                ))}
                            </section>

                            {/* Monitor */}
                            <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                <div className="lg:col-span-2 bg-[#080808] border border-white/10 rounded-3xl overflow-hidden aspect-video bg-black relative">
                                    {screenshots[activeAccount] ? (
                                        <img src={screenshots[activeAccount]} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center opacity-20 gap-4">
                                            <Activity size={48} className="animate-pulse" />
                                            <span className="text-sm">Select an active account to see the live feed</span>
                                        </div>
                                    )}
                                </div>
                                <div className="bg-[#080808] border border-white/5 rounded-3xl overflow-hidden flex flex-col h-[400px]">
                                    <div className="p-4 border-b border-white/5 font-bold text-xs uppercase tracking-widest text-white/30">Live Console</div>
                                    <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] space-y-2">
                                        {logs.filter(l => l.username === activeAccount).map((l, i) => (
                                            <div key={i} className="text-white/70 tracking-tight leading-relaxed">
                                                <span className="text-violet-500 mr-2">»</span> {l.message}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        </>
                    ) : (
                        /* Multi-Spy Grid */
                        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-8">
                            {accounts.map(acc => (
                                <div key={acc.id} className="bg-[#080808] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                                    <div className="p-3 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                                        <span className="text-[10px] font-bold">@{acc.username}</span>
                                    </div>
                                    <div className="aspect-video bg-black flex items-center justify-center">
                                        {screenshots[acc.username] ? <img src={screenshots[acc.username]} className="w-full h-full object-cover" /> : <Monitor size={24} className="opacity-10" />}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Add Account Modal */}
            <AnimatePresence>
                {showAddModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
                        <motion.form
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            onSubmit={handleAddAccount}
                            className="w-full max-w-md bg-[#0c0c0c] border border-white/10 rounded-3xl p-8 relative shadow-2xl"
                        >
                            <button onClick={() => setShowAddModal(false)} className="absolute top-6 right-6 text-white/20 hover:text-white"><X size={20} /></button>
                            <h3 className="text-2xl font-bold mb-6">Link New Account</h3>
                            <div className="space-y-4">
                                <Input label="Username" value={newAcc.username} onChange={(v) => setNewAcc({ ...newAcc, username: v })} />
                                <Input label="Password" type="password" value={newAcc.password} onChange={(v) => setNewAcc({ ...newAcc, password: v })} />
                                <div className="grid grid-cols-2 gap-4">
                                    <Input label="Proxy Host" value={newAcc.proxyHost} onChange={(v) => setNewAcc({ ...newAcc, proxyHost: v })} />
                                    <Input label="Proxy Port" value={newAcc.proxyPort} onChange={(v) => setNewAcc({ ...newAcc, proxyPort: v })} />
                                </div>
                                <button type="submit" className="w-full bg-violet-600 py-4 rounded-2xl font-bold mt-6 hover:bg-violet-500 transition-colors shadow-lg shadow-violet-600/20">
                                    Connect Node
                                </button>
                            </div>
                        </motion.form>
                    </div>
                )}
            </AnimatePresence>

        </div>
    );
}

function SidebarIcon({ icon, active, onClick }: { icon: any, active?: boolean, onClick?: () => void }) {
    return (
        <div onClick={onClick} className={`p-4 rounded-xl cursor-pointer transition-all ${active ? 'text-violet-400 bg-violet-400/10' : 'hover:text-white hover:bg-white/5'}`}>{icon}</div>
    );
}

function AccountCard({ account, active, onClick, onLaunch }: { account: Account, active: boolean, onClick: () => void, onLaunch: () => void }) {
    return (
        <div onClick={onClick} className={`p-6 rounded-3xl border transition-all cursor-pointer ${active ? 'bg-violet-600/5 border-violet-500/50' : 'bg-[#080808] border-white/5'}`}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-violet-600/20 text-violet-400 flex items-center justify-center font-bold">@</div>
                    <h4 className="font-bold text-sm">@{account.username}</h4>
                </div>
                <button onClick={(e) => { e.stopPropagation(); onLaunch(); }} className="p-2 bg-green-500/10 text-green-500 rounded-lg hover:bg-green-500 hover:text-white transition-all"><Play size={14} /></button>
            </div>
            <div className="space-y-2">
                <div className="flex justify-between text-[10px] uppercase font-bold text-white/30"><span>Warm Up</span><span>{account.status}</span></div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden leading-none"><div className="h-full bg-violet-600 w-1/2"></div></div>
            </div>
        </div>
    );
}

function Input({ label, value, onChange, type = "text" }: any) {
    return (
        <div className="space-y-2">
            <label className="text-[10px] uppercase font-black tracking-widest text-white/30 ml-2">{label}</label>
            <input
                type={type} value={value} onChange={(e) => onChange(e.target.value)}
                className="w-full bg-white/5 border border-white/5 focus:border-violet-500/50 outline-none p-4 rounded-2xl text-sm transition-all"
                placeholder={`Enter ${label.toLowerCase()}...`}
            />
        </div>
    );
}
