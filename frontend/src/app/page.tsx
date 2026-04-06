'use client';
import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import {
    LayoutDashboard,
    Users,
    Activity,
    Instagram,
    Twitter,
    Terminal,
    Monitor,
    Plus,
    Play,
    X,
    Server,
    WifiOff,
    Camera,
    RefreshCw,
    Shield,
    Briefcase,
    Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- Types ---
interface Account {
    id: string;
    username: string;
    status: string;
    progress?: number;
    isOnline?: boolean;
    type?: string;
    email?: string;
    proxy?: { host: string; port: number; username?: string; password?: string };
}

export default function Dashboard() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [logs, setLogs] = useState<{ username: string, message: string, timestamp?: Date }[]>([]);
    const [screenshots, setScreenshots] = useState<Record<string, string>>({});
    const [activeAccount, setActiveAccount] = useState('');
    const [viewMode, setViewMode] = useState<'SINGLE' | 'GRID' | 'PROXIES' | 'ACCOUNTS'>('SINGLE');
    const [platform, setPlatform] = useState<'INSTAGRAM' | 'TWITTER'>('INSTAGRAM');
    const [showAddModal, setShowAddModal] = useState(false);

    // New Account Form State
    const [newAcc, setNewAcc] = useState({ 
        username: '', password: '', email: '', 
        proxyHost: '', proxyPort: '', proxyUsername: '', proxyPassword: '', 
        type: 'MAIN', authToken: '' 
    });

    useEffect(() => {
        const savedPlatform = localStorage.getItem('nexus_platform') as 'INSTAGRAM' | 'TWITTER';
        if (savedPlatform && (savedPlatform === 'INSTAGRAM' || savedPlatform === 'TWITTER')) {
            setPlatform(savedPlatform);
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('nexus_platform', platform);
        fetchAccounts(platform);
    }, [platform]);

    useEffect(() => {
        const socket = io('http://localhost:4000');
        socket.on('ui_log', (data) => setLogs((prev) => [
            {...data, timestamp: new Date()}, 
            ...prev
        ].slice(0, 100)));
        socket.on('ui_screenshot', (data) => setScreenshots((prev) => ({ ...prev, [data.username]: `data:image/jpeg;base64,${data.image}` })));
        return () => { socket.disconnect(); };
    }, []);

    const fetchAccounts = async (p: string) => {
        try {
            const url = p === 'TWITTER' ? 'http://localhost:4000/api/twitter-accounts' : 'http://localhost:4000/api/accounts';
            const res = await fetch(url);
            const data = await res.json();
            setAccounts(data);
            if (data.length > 0) {
                if(!activeAccount || !data.find((a:any) => a.username === activeAccount)) setActiveAccount(data[0].username);
            } else {
                setActiveAccount('');
            }
        } catch (e) {
            console.error("Failed to fetch accounts", e);
        }
    };

    const handleAddAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        const url = platform === 'TWITTER' ? 'http://localhost:4000/api/twitter-accounts' : 'http://localhost:4000/api/accounts';
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: newAcc.username,
                    password: newAcc.password,
                    email: newAcc.email,
                    type: newAcc.type,
                    authToken: newAcc.authToken || undefined,
                    proxy: newAcc.proxyHost ? { 
                        host: newAcc.proxyHost, 
                        port: parseInt(newAcc.proxyPort),
                        username: newAcc.proxyUsername,
                        password: newAcc.proxyPassword
                    } : undefined
                })
            });
            
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Failed to deploy instance');
            }
            
            setShowAddModal(false);
            setNewAcc({ username: '', password: '', email: '', proxyHost: '', proxyPort: '', proxyUsername: '', proxyPassword: '', type: 'MAIN', authToken: '' });
            fetchAccounts(platform);
        } catch (error: any) {
            alert(`Erreur: ${error.message}`);
        }
    };

    const launchAction = async (id: string, action: string) => {
        const url = platform === 'TWITTER' ? `http://localhost:4000/api/twitter-accounts/${id}/action` : `http://localhost:4000/api/accounts/${id}/action`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        });
    };

    const handleDeleteAccount = async (id: string) => {
        if (!confirm("Voulez-vous vraiment détruire ce nœud de la base de données ?")) return;
        const url = platform === 'TWITTER' ? `http://localhost:4000/api/twitter-accounts/${id}` : `http://localhost:4000/api/accounts/${id}`;
        await fetch(url, { method: 'DELETE' });
        
        // Refresh UI
        if (activeAccount && accounts.find(a => a.id === id)?.username === activeAccount) setActiveAccount('');
        fetchAccounts(platform);
    };

    const activeAccObj = accounts.find(a => a.username === activeAccount);

    return (
        <div className="flex h-screen bg-[#030303] text-white font-sans selection:bg-violet-500/30 overflow-hidden font-light">
            {/* Ambient Background Glows */}
            <div className={`absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-[120px] pointer-events-none transition-colors duration-1000 ${platform === 'TWITTER' ? 'bg-blue-600/10' : 'bg-fuchsia-600/10'}`} />
            <div className={`absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full blur-[150px] pointer-events-none transition-colors duration-1000 ${platform === 'TWITTER' ? 'bg-cyan-900/10' : 'bg-indigo-900/10'}`} />

            {/* Sidebar */}
            <aside className="w-20 lg:w-24 border-r border-white/5 flex flex-col items-center py-8 gap-8 bg-black/40 backdrop-blur-xl z-50">
                <div className="flex flex-col gap-4">
                    <motion.div 
                        title="Switch to Instagram"
                        onClick={() => setPlatform('INSTAGRAM')}
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        whileTap={{ scale: 0.95 }}
                        className={`p-3 rounded-2xl cursor-pointer ${platform === 'INSTAGRAM' ? 'bg-gradient-to-tr from-[#f09433] via-[#e6683c] to-[#bc1888] shadow-[0_0_30px_rgba(225,48,108,0.4)] text-white' : 'bg-white/5 text-white/40 hover:text-white'}`}
                    >
                        <Instagram size={28} strokeWidth={2.5} />
                    </motion.div>

                    <motion.div 
                        title="Switch to Twitter / X"
                        onClick={() => setPlatform('TWITTER')}
                        whileHover={{ scale: 1.1, rotate: -5 }}
                        whileTap={{ scale: 0.95 }}
                        className={`p-3 rounded-2xl cursor-pointer ${platform === 'TWITTER' ? 'bg-gradient-to-br from-blue-500 to-cyan-500 shadow-[0_0_30px_rgba(59,130,246,0.3)] text-white' : 'bg-white/5 text-white/40 hover:text-white'}`}
                    >
                        <Twitter size={28} strokeWidth={2.5} />
                    </motion.div>
                </div>

                <div className="w-8 h-[1px] bg-white/10 my-2" />

                <nav className="flex flex-col gap-6 items-center w-full relative">
                    <SidebarIcon icon={<LayoutDashboard size={22} />} active={viewMode === 'SINGLE'} onClick={() => setViewMode('SINGLE')} title="Single Node View" />
                    <SidebarIcon icon={<Monitor size={22} />} active={viewMode === 'GRID'} onClick={() => setViewMode('GRID')} title="Grid Matrix View" />
                    <SidebarIcon icon={<Server size={22} />} active={viewMode === 'PROXIES'} onClick={() => setViewMode('PROXIES')} title="Proxy Matrix" />
                    <SidebarIcon icon={<Users size={22} />} active={viewMode === 'ACCOUNTS'} onClick={() => setViewMode('ACCOUNTS')} title="Global Accounts" />
                    
                    <div className="w-8 h-[1px] bg-white/10 my-2" />

                    <motion.button 
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors group mt-2" 
                        onClick={() => setShowAddModal(true)}
                        title="Add Account"
                    >
                        <Plus size={24} className="text-white/50 group-hover:text-white transition-colors" />
                    </motion.button>
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden relative z-10">
                
                {/* Header */}
                <header className="h-24 border-b border-white/5 flex items-center justify-between px-10 bg-black/20 backdrop-blur-md z-20 transition-all duration-500">
                    <div>
                        <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
                            {platform === 'TWITTER' ? (
                                <span key="twitter-title" className="flex items-center gap-3"><Twitter className="text-blue-400" /> Duupflow <span className="font-light text-blue-400">X-Automation</span></span>
                            ) : (
                                <span key="insta-title" className="flex items-center gap-3"><Instagram className="text-pink-500" /> Duupflow <span className="font-light text-pink-500">Insta-Bot</span></span>
                            )}
                        </h2>
                        <p className="text-xs text-white/40 mt-1 flex items-center gap-2 uppercase tracking-widest">
                            <Activity size={10} className="text-emerald-400" /> System Online • {accounts.length} Node(s)
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-sm font-medium text-white/70 hover:text-white">
                            <RefreshCw size={16} /> Sync
                        </button>
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setShowAddModal(true)}
                            className={`px-6 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all ${
                                platform === 'TWITTER' 
                                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:shadow-[0_0_20px_rgba(59,130,246,0.4)]' 
                                : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:shadow-[0_0_20px_rgba(139,92,246,0.4)]'
                            }`}
                        >
                            <Plus size={18} /> New {platform === 'TWITTER' ? 'X Account' : 'Instance'}
                        </motion.button>
                    </div>
                </header>

                {/* Dashboard Area */}
                <div className="flex-1 overflow-y-auto p-8 lg:p-10 relative" style={{ scrollbarWidth: 'none' }}>
                    
                    {viewMode === 'SINGLE' && (
                        <div className="max-w-[1600px] mx-auto space-y-8">
                            
                            {/* Stats Overview */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
                                <StatCard title="Active Instances" value={accounts.filter(a => a.status === 'RUNNING' || a.status === 'CONNECTED').length.toString()} icon={<Server size={18} />} color="text-violet-400" />
                                <StatCard title="Total Accounts" value={accounts.length.toString()} icon={<Users size={18} />} color="text-fuchsia-400" />
                                <StatCard title="Actions Performed" value="1,204" icon={<Activity size={18} />} color="text-emerald-400" />
                                <StatCard title="System Health" value="98%" icon={<Shield size={18} />} color="text-blue-400" />
                            </div>

                            <div className="flex items-center justify-between mb-4 mt-8">
                                <h3 className="text-lg font-medium text-white/90">Managed Nodes</h3>
                            </div>

                            {/* Account Grid List */}
                            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                                <AnimatePresence>
                                    {accounts.map((acc, i) => (
                                        <AccountCard
                                            key={acc.id}
                                            account={acc}
                                            active={activeAccount === acc.username}
                                            onClick={() => setActiveAccount(acc.username)}
                                            onLaunch={(action) => launchAction(acc.id, action)}
                                            index={i}
                                            platform={platform}
                                        />
                                    ))}
                                </AnimatePresence>
                            </section>

                            <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent my-10" />

                            {/* Dual Pane: Monitor & Console */}
                            <section className="grid grid-cols-1 xl:grid-cols-3 gap-8 pb-10">
                                
                                {/* Video Feed */}
                                <div className="xl:col-span-2 flex flex-col gap-4">
                                    <h3 className="text-sm font-medium text-white/70 flex items-center gap-2 uppercase tracking-widest ml-2">
                                        <Camera size={16} /> Live Screencast
                                        {activeAccObj && <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 text-[10px] ml-2 font-bold">{activeAccount}</span>}
                                    </h3>
                                    
                                    <div className="bg-[#050505] border border-white/10 rounded-2xl overflow-hidden aspect-video relative group shadow-2xl">
                                        {/* Status overlay */}
                                        <div className="absolute top-4 left-4 z-10 flex gap-2">
                                            {activeAccObj?.status === 'RUNNING' && (
                                                <div className="px-3 py-1 bg-emerald-500/20 backdrop-blur-md text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-medium flex items-center gap-1.5 shadow-lg">
                                                    <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
                                                    Recording
                                                </div>
                                            )}
                                        </div>

                                        {screenshots[activeAccount] ? (
                                            <motion.img 
                                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                                src={screenshots[activeAccount]} 
                                                className="w-full h-full object-cover transition-transform duration-700" 
                                            />
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center gap-6 opacity-30 select-none bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
                                                <div className="relative">
                                                    <Monitor size={64} className="text-white/20" />
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <Activity size={24} className="text-white/40 animate-pulse" />
                                                    </div>
                                                </div>
                                                <span className="text-sm font-mono tracking-widest uppercase">No feed available</span>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl pointer-events-none" />
                                    </div>
                                </div>

                                {/* Live Terminal Console */}
                                <div className="flex flex-col gap-4 h-full xl:max-h-[600px]">
                                    <h3 className="text-sm font-medium text-white/70 flex items-center gap-2 uppercase tracking-widest ml-2">
                                        <Terminal size={16} /> Action Logs
                                    </h3>
                                    
                                    <div className="bg-[#0A0A0B] border border-white/10 rounded-2xl overflow-hidden flex flex-col flex-1 shadow-2xl relative">
                                        {/* Fake macOS style window buttons */}
                                        <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02] flex items-center gap-2">
                                            <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                                            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                                            <span className="ml-4 text-[10px] font-mono text-white/30 truncate">root@nexus-node-01</span>
                                        </div>
                                        
                                        <div className="flex-1 overflow-y-auto p-5 font-mono text-xs space-y-2.5" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
                                            {logs.filter(l => l.username === activeAccount).length === 0 ? (
                                                <div className="text-white/20 italic">Waiting for events...</div>
                                            ) : (
                                                logs.filter(l => l.username === activeAccount).map((l, i) => (
                                                    <motion.div 
                                                        initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }}
                                                        key={i} 
                                                        className="text-white/60 tracking-tight leading-relaxed break-words"
                                                    >
                                                        <span className="text-white/30 mr-2">[{l.timestamp?.toLocaleTimeString([], {hour12: false}) || '00:00:00'}]</span>
                                                        <span className={getMessageColor(l.message)}>{l.message}</span>
                                                    </motion.div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}
                    
                    {viewMode === 'GRID' && (
                        /* Multi-Spy Grid */
                        <div className="max-w-[1800px] mx-auto space-y-6">
                            <div className="flex items-center gap-3 mb-8">
                                <LayoutDashboard className="text-violet-400" />
                                <h3 className="text-xl font-medium text-white">Global Monitoring Matrix</h3>
                            </div>
                            
                            <motion.div 
                                initial="hidden" animate="show"
                                variants={{ show: { transition: { staggerChildren: 0.1 } } }}
                                className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6"
                            >
                                {accounts.map(acc => (
                                    <motion.div 
                                        variants={{
                                            hidden: { opacity: 0, y: 20 },
                                            show: { opacity: 1, y: 0 }
                                        }}
                                        key={acc.id} 
                                        className="bg-[#0A0A0B] border border-white/5 hover:border-white/20 transition-all rounded-2xl overflow-hidden shadow-xl group cursor-pointer"
                                        onClick={() => { setActiveAccount(acc.username); setViewMode('SINGLE'); }}
                                    >
                                        <div className="px-4 py-3 flex justify-between items-center bg-white/[0.02]">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${getStatusColor(acc.status).dot}`} />
                                                <span className="text-xs font-semibold text-white/80">@{acc.username}</span>
                                            </div>
                                            <span className="text-[10px] font-mono text-white/40 uppercase bg-white/5 px-2 py-0.5 rounded-full">
                                                {acc.status || 'OFFLINE'}
                                            </span>
                                        </div>
                                        <div className="aspect-video bg-[#030303] flex items-center justify-center relative overflow-hidden">
                                            {screenshots[acc.username] ? (
                                                <img src={screenshots[acc.username]} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                                            ) : (
                                                <div className="flex flex-col items-center gap-3">
                                                    <WifiOff size={24} className="text-white/10" />
                                                    <span className="text-xs text-white/20 font-mono">No signal</span>
                                                </div>
                                            )}
                                            {/* Hover indicator */}
                                            <div className="absolute inset-0 bg-violet-600/0 group-hover:bg-violet-600/10 transition-colors flex items-center justify-center">
                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-xs font-medium flex items-center gap-2">
                                                    <Monitor size={14}/> Enter Console
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </motion.div>
                        </div>
                    )}

                    {viewMode === 'PROXIES' && (
                        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="max-w-[1600px] mx-auto space-y-6">
                            <div className="flex items-center gap-3 mb-8">
                                <Server className="text-violet-400" />
                                <h3 className="text-xl font-medium text-white">Proxy Pool <span className="text-white/30 text-sm ml-2">({accounts.filter(a => a.proxy).length} Assigned)</span></h3>
                            </div>
                            
                            <div className="bg-[#0A0A0B] border border-white/5 rounded-2xl overflow-hidden shadow-xl text-sm">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left whitespace-nowrap">
                                        <thead className="text-[10px] uppercase font-semibold text-white/30 tracking-widest border-b border-white/5 bg-white/[0.02]">
                                            <tr>
                                                <th className="px-6 py-4">Status</th>
                                                <th className="px-6 py-4">IP Address</th>
                                                <th className="px-6 py-4">Port</th>
                                                <th className="px-6 py-4">Auth</th>
                                                <th className="px-6 py-4 text-right">Linked Node</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {accounts.filter(acc => acc.proxy).length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-12 text-center text-white/30 italic">No proxies assigned yet on this platform.</td>
                                                </tr>
                                            ) : (
                                                accounts.filter(acc => acc.proxy).map((acc) => (
                                                    <tr key={acc.id} className="hover:bg-white/[0.02] transition-colors">
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
                                                                <span className="text-white/60 text-xs">Healthy</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 font-mono text-white/90">{acc.proxy?.host}</td>
                                                        <td className="px-6 py-4 font-mono text-white/50">{acc.proxy?.port}</td>
                                                        <td className="px-6 py-4">
                                                            {acc.proxy?.username ? (
                                                                <span className="px-3 py-1 rounded-md bg-white/5 border border-white/10 text-xs text-white/70">Required</span>
                                                            ) : (
                                                                <span className="text-white/30 text-xs italic">Open</span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/5">
                                                                {platform === 'TWITTER' ? <Twitter size={12} className="text-blue-400" /> : <Instagram size={12} className="text-violet-400" />}
                                                                <span className="text-xs font-medium">@{acc.username}</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {viewMode === 'ACCOUNTS' && (
                        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="max-w-[1600px] mx-auto space-y-6">
                            <div className="flex items-center gap-3 mb-8">
                                <Users className="text-violet-400" />
                                <h3 className="text-xl font-medium text-white">Accounts Registry <span className="text-white/30 text-sm ml-2">({accounts.length} Total)</span></h3>
                            </div>
                            
                            <div className="bg-[#0A0A0B] border border-white/5 rounded-2xl overflow-hidden shadow-xl text-sm">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left whitespace-nowrap">
                                        <thead className="text-[10px] uppercase font-semibold text-white/30 tracking-widest border-b border-white/5 bg-white/[0.02]">
                                            <tr>
                                                <th className="px-6 py-4">Account Overview</th>
                                                {platform === 'TWITTER' && <th className="px-6 py-4">Role</th>}
                                                <th className="px-6 py-4">Current Status</th>
                                                <th className="px-6 py-4 text-right">Network Route</th>
                                                <th className="px-6 py-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {accounts.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-12 text-center text-white/30 italic">No accounts populated. Deploy an instance first.</td>
                                                </tr>
                                            ) : (
                                                accounts.map((acc) => {
                                                    const th = getStatusColor(acc.status);
                                                    return (
                                                        <tr key={acc.id} className="hover:bg-white/[0.02] transition-colors">
                                                            <td className="px-6 py-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`w-10 h-10 rounded-xl ${platform === 'TWITTER' ? 'bg-blue-500/10 text-blue-400' : 'bg-fuchsia-500/10 text-fuchsia-400'} flex items-center justify-center shrink-0`}>
                                                                        {platform === 'TWITTER' ? <Twitter size={18} /> : <Instagram size={18} />}
                                                                    </div>
                                                                    <div>
                                                                        <div className="font-semibold text-white/90">@{acc.username}</div>
                                                                        {acc.email && <div className="text-[10px] text-white/40">{acc.email}</div>}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            {platform === 'TWITTER' && (
                                                                <td className="px-6 py-4">
                                                                    <span className={`px-2.5 py-1 flex w-max items-center gap-1.5 text-[10px] uppercase font-bold rounded-md border ${acc.type === 'MAIN' ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/5 text-white/40'}`}>
                                                                        <Briefcase size={12} /> {acc.type || 'MAIN'}
                                                                    </span>
                                                                </td>
                                                            )}
                                                            <td className="px-6 py-4">
                                                                <span className={`px-3 py-1.5 rounded-full text-[10px] font-mono uppercase bg-black border ${th.border} ${th.dot.replace('bg-', 'text-')} font-bold tracking-wider`}>
                                                                    {acc.status || 'UNAVAILABLE'}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 text-right">
                                                                {acc.proxy ? (
                                                                    <div className="flex items-center justify-end gap-2 text-white/80">
                                                                        <Server size={14} className="text-white/30" />
                                                                        <span className="font-mono text-xs">{acc.proxy.host}:{acc.proxy.port}</span>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-center justify-end gap-2 text-white/20 text-xs italic">
                                                                        <WifiOff size={14} /> Local Network
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-4 text-right">
                                                                <button 
                                                                    onClick={() => handleDeleteAccount(acc.id)}
                                                                    className="p-2 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white rounded-lg transition-colors border border-rose-500/20 shadow-sm"
                                                                    title="Destroy Node"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </div>
            </main>

            {/* Add Account Modal */}
            <AnimatePresence>
                {showAddModal && (
                    <motion.div 
                        key="modal-wrapper"
                        className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0"
                            onClick={() => setShowAddModal(false)}
                        />
                        <motion.form
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            onSubmit={handleAddAccount}
                            className="w-full max-w-lg bg-[#0f0f11] border border-white/10 rounded-3xl p-8 relative shadow-[0_0_50px_rgba(0,0,0,0.5)] z-10"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 rounded-3xl pointer-events-none" />
                            
                            <button type="button" onClick={() => setShowAddModal(false)} className="absolute top-6 right-6 p-2 bg-white/5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors">
                                <X size={16} />
                            </button>
                            
                            <h3 className="text-2xl font-semibold mb-2">Deploy Instance</h3>
                            <p className="text-sm text-white/40 mb-8">Link a new Instagram account to the orchestration network.</p>
                            
                            <div className="space-y-5">
                                <div className="grid grid-cols-2 gap-4">
                                    <Input label="Username" icon={<Users size={16}/>} value={newAcc.username} onChange={(v: string) => setNewAcc({ ...newAcc, username: v })} />
                                    <Input label="Password" type="password" value={newAcc.password} onChange={(v: string) => setNewAcc({ ...newAcc, password: v })} />
                                </div>

                                {platform === 'TWITTER' && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <Input label="Email Outlook" type="email" value={newAcc.email} onChange={(v: string) => setNewAcc({ ...newAcc, email: v })} />
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] uppercase font-semibold tracking-widest text-white/40 ml-1">Account Role</label>
                                                <div className="relative">
                                                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"><Briefcase size={16} /></div>
                                                    <select 
                                                        value={newAcc.type} 
                                                        onChange={(e) => setNewAcc({...newAcc, type: e.target.value})}
                                                        className="w-full bg-black/40 border border-white/10 focus:border-violet-500/50 outline-none pl-10 pr-4 py-3 rounded-xl text-sm transition-all text-white/90 focus:bg-white/[0.02] appearance-none"
                                                    >
                                                        <option value="MAIN">MAIN (Model)</option>
                                                        <option value="SUPPORT">SUPPORT (Spammer)</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="p-4 bg-violet-500/10 border border-violet-500/20 rounded-2xl mb-4">
                                            <Input label="Auth Token (Cookie) - OVERRIDES LOGIN" value={newAcc.authToken} onChange={(v: string) => setNewAcc({ ...newAcc, authToken: v })} placeholder="e.g. 1a2b3c4d5e... (Optional but recommended)" />
                                        </div>
                                    </>
                                )}
                                
                                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-4">
                                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/50">
                                        <Server size={14} /> Network Configuration (Proxy)
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="col-span-2">
                                            <Input label="Proxy Host" value={newAcc.proxyHost} onChange={(v: string) => setNewAcc({ ...newAcc, proxyHost: v })} placeholder="192.168.1.1" />
                                        </div>
                                        <Input label="Port" value={newAcc.proxyPort} onChange={(v: string) => setNewAcc({ ...newAcc, proxyPort: v })} placeholder="8080" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <Input label="Proxy Username (Optional)" value={newAcc.proxyUsername} onChange={(v: string) => setNewAcc({ ...newAcc, proxyUsername: v })} placeholder="user123" />
                                        <Input label="Proxy Password (Optional)" type="password" value={newAcc.proxyPassword} onChange={(v: string) => setNewAcc({ ...newAcc, proxyPassword: v })} placeholder="pass123" />
                                    </div>
                                </div>

                                <motion.button 
                                    whileHover={{ scale: 1.01 }}
                                    whileTap={{ scale: 0.98 }}
                                    type="submit" 
                                    className="w-full bg-white text-black py-4 rounded-xl font-semibold mt-4 hover:bg-white/90 transition-colors shadow-lg flex items-center justify-center gap-2"
                                >
                                    <Play size={18} fill="currentColor" /> Initialize Node
                                </motion.button>
                            </div>
                        </motion.form>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
}

// --- Helper Components & Functions ---

// Parses message for colorizing logs
function getMessageColor(msg: string) {
    const lower = msg.toLowerCase();
    if (lower.includes('error') || lower.includes('fail')) return 'text-rose-400';
    if (lower.includes('success') || lower.includes('connected') || lower.includes('done')) return 'text-emerald-400';
    if (lower.includes('warning') || lower.includes('warn')) return 'text-amber-400';
    return 'text-white/70';
}

function getStatusColor(status: string) {
    const lower = status?.toLowerCase() || '';
    if (['running', 'online', 'active', 'connected', 'success'].includes(lower)) return { border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', dot: 'bg-emerald-400' };
    if (['error', 'banned', 'offline', 'failed'].includes(lower)) return { border: 'border-rose-500/30', bg: 'bg-rose-500/10', dot: 'bg-rose-400' };
    if (['warming', 'warm up', 'pending', 'starting'].includes(lower)) return { border: 'border-amber-500/30', bg: 'bg-amber-500/10', dot: 'bg-amber-400' };
    return { border: 'border-white/10', bg: 'bg-white/5', dot: 'bg-white/30' }; // default
}

function StatCard({ title, value, icon, color }: { title: string, value: string, icon: any, color: string }) {
    return (
        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 flex items-center gap-4 hover:bg-white/[0.04] transition-colors">
            <div className={`p-3 rounded-xl bg-white/[0.03] ${color}`}>
                {icon}
            </div>
            <div>
                <p className="text-xs uppercase tracking-widest text-white/40 font-semibold mb-1">{title}</p>
                <p className="text-2xl font-bold text-white/90">{value}</p>
            </div>
        </div>
    );
}

function SidebarIcon({ icon, active, onClick, title }: { icon: any, active?: boolean, onClick?: () => void, title?: string }) {
    return (
        <div className="relative group w-full flex justify-center" title={title}>
            <div 
                onClick={onClick} 
                className={`p-3 rounded-xl cursor-pointer transition-all duration-300 relative z-10 w-12 flex justify-center 
                ${active ? 'text-white bg-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
            >
                {icon}
            </div>
            {active && (
                <motion.div layoutId="sidebar-active" className="absolute left-1/2 -translate-x-1/2 w-12 top-0 bottom-0 bg-white/5 rounded-xl -z-10" />
            )}
        </div>
    );
}

function AccountCard({ account, active, onClick, onLaunch, index, platform }: { account: Account, active: boolean, onClick: () => void, onLaunch: (action: string) => void, index: number, platform: string }) {
    const statusTheme = getStatusColor(account.status);
    
    // Actions mapping depending on platform
    const platformActions = platform === 'TWITTER' ? [
        { id: 'warmUp', label: 'Day 1: Warm Up'},
        { id: 'setupProfile', label: 'Day 2: Setup Profile'},
        { id: 'joinCommunity', label: 'Day 3: Join Communities'},
        { id: 'postCommunity', label: 'Day 3: Post Captions'},
        { id: 'spamComments', label: 'Day 4: Spam Comments (Support)'}
    ] : [
        { id: 'warmUp', label: 'Warm Up Account'},
        { id: 'follow', label: 'Follow Target'}
    ];

    const [showActions, setShowActions] = useState(false);

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={onClick} 
            className={`p-5 rounded-2xl border transition-all duration-300 cursor-pointer relative overflow-visible group flex flex-col justify-between
            ${active ? 'bg-white/[0.04] border-violet-500/50 shadow-[0_4px_30px_rgba(139,92,246,0.1)]' : 'bg-[#0A0A0B] hover:bg-white/[0.02] border-white/5'}`}
        >
            {/* Active glow inside card */}
            {active && <div className="absolute -top-10 -right-10 w-32 h-32 bg-violet-500/20 rounded-full blur-[40px] pointer-events-none overflow-hidden" />}

            <div className="flex items-center justify-between gap-4 mb-5 relative z-10">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${platform === 'TWITTER' ? 'from-blue-600/20 to-cyan-600/20' : 'from-violet-600/20 to-fuchsia-600/20'} flex items-center justify-center border border-white/5 group-hover:scale-105 transition-transform shrink-0`}>
                    {platform === 'TWITTER' ? <Twitter size={20} className="text-blue-400" /> : <Instagram size={20} className="text-violet-300" />}
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-white/90 text-[15px] truncate max-w-full">@{account.username}</h4>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${statusTheme.dot}`} />
                        <span className={`text-[10px] uppercase font-mono tracking-wider ${statusTheme.dot.replace('bg-', 'text-')}`}>{account.status || 'IDLE'}</span>
                    </div>
                </div>
                
                <div className="relative">
                    <button 
                        onClick={(e) => { e.stopPropagation(); setShowActions(!showActions); }} 
                        className="p-2.5 bg-white/5 text-white/60 rounded-xl hover:bg-white hover:text-black transition-all shadow-sm shrink-0 flex items-center gap-1"
                        title="Run Action"
                    >
                        <Play size={16} fill="currentColor" />
                    </button>
                    <AnimatePresence>
                        {showActions && (
                            <motion.div 
                                key="actions-dropdown"
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                className="absolute right-0 top-full mt-2 w-56 bg-[#121215] border border-white/10 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-50 overflow-hidden"
                            >
                                <div className="p-2 flex flex-col gap-1">
                                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-white/40 font-semibold">Select Action</div>
                                    {platformActions.map(action => (
                                        <button 
                                            key={action.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onLaunch(action.id);
                                                setShowActions(false);
                                            }}
                                            className="px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 hover:text-white rounded-lg transition-colors truncate"
                                        >
                                            {action.label}
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="space-y-2 relative z-10">
                <div className="flex justify-between text-[10px] font-semibold tracking-widest text-white/30 uppercase">
                    <span>Task Progress</span>
                    <span>{account.progress || 0}%</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${account.progress || 0}%` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className={`h-full rounded-full ${statusTheme.dot === 'bg-white/30' ? 'bg-violet-500' : statusTheme.dot}`} 
                    />
                </div>
            </div>
        </motion.div>
    );
}

function Input({ label, value, onChange, type = "text", icon, placeholder }: { label: string, value: string, onChange: (v: string) => void, type?: string, icon?: any, placeholder?: string }) {
    return (
        <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-semibold tracking-widest text-white/40 ml-1">
                {label}
            </label>
            <div className="relative">
                {icon && <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30">{icon}</div>}
                <input
                    type={type} 
                    value={value} 
                    onChange={(e) => onChange(e.target.value)}
                    className={`w-full bg-black/40 border border-white/10 focus:border-violet-500/50 outline-none ${icon ? 'pl-10' : 'pl-4'} pr-4 py-3 rounded-xl text-sm transition-all text-white/90 focus:bg-white/[0.02] placeholder:text-white/20`}
                    placeholder={placeholder || `Enter ${label.toLowerCase()}...`}
                />
            </div>
        </div>
    );
}
