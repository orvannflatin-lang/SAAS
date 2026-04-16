'use client';
import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
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
    Trash2,
    HelpCircle,
    Cookie,
    ExternalLink,
    BarChart3,
    Calendar,
    Send,
    TrendingUp,
    Heart,
    MessageCircle,
    Repeat,
    Eye,
    UserPlus,
    Clock,
    FolderTree,
    FileText,
    Bell,
    AlertTriangle,
    UserCircle,
    Target,
    Share2,
    Settings,
    Edit,
    Ghost,
    LogOut,
    Crown,
    Lock,
    Megaphone,
    Zap,
    Layers,
    Sparkles,
    Type,
    Pause,
    Save,
    MessageSquare,
    Link as LinkIcon,
    Image as ImageIcon,
    Loader2,
    Wrench
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import NewFeatures from '../components/NewFeatures';
import { API_URL, SOCKET_URL, API_BASE_URL } from '../utils/apiConfig';

// --- Types ---
interface Account {
    id: string;
    username: string;
    status: string;
    progress?: number;
    isOnline?: boolean;
    type?: string;
    email?: string;
    proxy?: { host: string; port: number; username?: string; password?: string; protocol?: string; rotateIpUrl?: string | null };
    profileImage?: string;
    bio?: string;
    bannerImage?: string;
    niche?: string;
    groupId?: string;
    autoMode?: boolean;
    sessionCookies?: any;
}

interface Group {
    id: string;
    name: string;
    description?: string;
    taskType: string;
    schedule?: any;
    isActive: boolean;
    accounts?: Account[];
}

/** Si l'utilisateur colle "host:port" dans le champ host */
function parseProxyHostPortInput(hostField: string): { host: string; port: string } | null {
    const t = hostField.trim();
    const m = /^([^:/\s]+):(\d{2,5})$/.exec(t);
    if (m) return { host: m[1], port: m[2] };
    return null;
}

interface Template {
    id: string;
    name: string;
    content: string;
    type: string;
    mediaUrls: string[];
    hashtags: string[];
}

interface Activity {
    id: string;
    accountId?: string;
    action: string;
    message: string;
    details?: any;
    status: string;
    timestamp: string;
}

interface CommentRequest {
    id: string;
    postId: string;
    postUrl: string;
    totalComments: number;
    commentsDone: number;
    status: string;
}

interface BanAlert {
    id: string;
    accountId: string;
    account?: Account;
    alertType: string;
    message: string;
    notified: boolean;
    resolved: boolean;
}

interface Notification {
    id: string;
    type: string;
    title: string;
    message: string;
    read: boolean;
    createdAt: string;
}

export default function Dashboard() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [logs, setLogs] = useState<{ username: string, message: string, timestamp?: Date }[]>([]);
    const [screenshots, setScreenshots] = useState<Record<string, string>>({});
    const [activeAccount, setActiveAccount] = useState('');
    const [viewMode, setViewMode] = useState<'SINGLE' | 'GRID' | 'PROXIES' | 'ACCOUNTS' | 'POSTS' | 'STATS' | 'ORCHESTRATION' | 'CAMPAIGNS' | 'SETTINGS' | 'GROUPS'>('SINGLE');
    const API_BASE = API_URL;
    const [globalSettings, setGlobalSettings] = useState({
        postIntervalValue: 30,
        postIntervalUnit: 'MINUTES' as 'MINUTES' | 'HOURS',
        commentsPerPostLimit: 10,
        autoSyncMetadata: true
    });
    const [platform, setPlatform] = useState<'INSTAGRAM' | 'TWITTER'>(() => {
        // Lazy initialization to avoid hydration mismatch
        if (typeof window !== 'undefined') {
            const savedPlatform = localStorage.getItem('nexus_platform') as 'INSTAGRAM' | 'TWITTER';
            if (savedPlatform && (savedPlatform === 'INSTAGRAM' || savedPlatform === 'TWITTER')) {
                return savedPlatform;
            }
        }
        return 'TWITTER';
    });
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingAccount, setEditingAccount] = useState<any>(null);
    const [showTokenGuide, setShowTokenGuide] = useState(false);
    const [showNewFeatures, setShowNewFeatures] = useState(false);
    const router = useRouter();

    // Posts & Stats State
    const [posts, setPosts] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [showPostModal, setShowPostModal] = useState(false);
    const [newPost, setNewPost] = useState({ content: '', scheduleDate: '', scheduleTime: '' });

    const [autoSequenceStatus, setAutoSequenceStatus] = useState<Record<string, {
        running: boolean;
        currentStep: number;
        totalSteps: number;
        currentAction: string;
    }>>({});

    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);
    const [newCampaignName, setNewCampaignName] = useState('');
    const [newCampaignDesc, setNewCampaignDesc] = useState('');
    const [newCampaignCommunities, setNewCampaignCommunities] = useState('');
    const [newCampaignPostsPerAcc, setNewCampaignPostsPerAcc] = useState(3);
    const [newCampaignCommentsPerPost, setNewCampaignCommentsPerPost] = useState(5);
    const [newCampaignGroupId, setNewCampaignGroupId] = useState('');
    const [newCampaignType, setNewCampaignType] = useState<'POST'>('POST');
    const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
    const [showEditCampaignModal, setShowEditCampaignModal] = useState(false);
    const [editCampaignForm, setEditCampaignForm] = useState({
        id: '',
        name: '',
        description: '',
        type: 'POST' as 'POST',
        groupId: '',
        targetCommunities: '',
        postsPerAccount: 3,
        commentsPerPost: 5
    });
    const [newGroupName, setNewGroupName] = useState('');
    const [caption, setCaption] = useState('');
    const [linkUrl, setLinkUrl] = useState('');
    const [targetCommunity, setTargetCommunity] = useState('');
    const [mediaFiles, setMediaFiles] = useState<FileList | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isMasterAutoOn, setIsMasterAutoOn] = useState(false);

    const [isBlocked, setIsBlocked] = useState(false);
    const [blockedMessage, setBlockedMessage] = useState('');

    const [newAcc, setNewAcc] = useState({ 
        username: '', password: '', email: '', 
        proxyHost: '', proxyPort: '', proxyUsername: '', proxyPassword: '', 
        proxyProtocol: 'http' as 'http' | 'socks5',
        proxyRotateIpUrl: '',
        type: 'MAIN', authToken: '', groupId: ''
    });
    const [twitterCookies, setTwitterCookies] = useState('');
    const [twitterCt0, setTwitterCt0] = useState('');

    const [activeTab, setActiveTab] = useState<'dashboard' | 'groups' | 'templates' | 'activities' | 'comments' | 'notifications'>('dashboard');
    const [groups, setGroups] = useState<Group[]>([]);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [commentRequests, setCommentRequests] = useState<CommentRequest[]>([]);
    const [banAlerts, setBanAlerts] = useState<BanAlert[]>([]);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [showCommentModal, setShowCommentModal] = useState(false);
    const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
    const [newGroup, setNewGroup] = useState({ name: '', description: '', taskType: 'engagement' });
    const [newTemplate, setNewTemplate] = useState({ name: '', content: '', type: 'post', hashtags: '' });
    const [newCommentRequest, setNewCommentRequest] = useState({ postUrl: '', totalComments: 0 });
    const [profileForm, setProfileForm] = useState({ profileImage: '', bio: '', bannerImage: '', niche: '' });
    const [unreadNotifications, setUnreadNotifications] = useState(0);
    const [user, setUser] = useState<any>(null);
    const [token, setToken] = useState<string | null>(null);

    // Launch Modal State
    const [showLaunchModal, setShowLaunchModal] = useState(false);
    const [selectedLaunchCampaign, setSelectedLaunchCampaign] = useState<string | null>(null);
    const [launchInterval, setLaunchInterval] = useState({ value: 30, unit: 'MINUTES' });

    useEffect(() => {
        const storedToken = localStorage.getItem('ghost_token');
        const storedUser = localStorage.getItem('ghost_user');
        
        if (!storedToken || !storedUser) {
            router.push('/login');
        } else {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
            fetchGlobalSettings(storedToken);
            fetchGroups();
        }
    }, []);

    const fetchGlobalSettings = async (t: string) => {
        try {
            const res = await axios.get(`${API_BASE}/settings`, {
                headers: { 'Authorization': `Bearer ${t}` }
            });
            setGlobalSettings(res.data);
        } catch (err) {
            console.error('Failed to fetch settings', err);
        }
    };

    const fetchGroups = async () => {
        const storedToken = localStorage.getItem('ghost_token');
        if (!storedToken) return;
        try {
            const res = await axios.get(`${API_BASE}/groups`, {
                headers: { 'Authorization': `Bearer ${storedToken}` }
            });
            setGroups(res.data);
        } catch (err) {
            console.error('Failed to fetch groups', err);
        }
    };

    useEffect(() => {
        if (viewMode === 'CAMPAIGNS') fetchCampaigns();
    }, [viewMode]);

    const fetchCampaigns = async () => {
        const storedToken = localStorage.getItem('ghost_token');
        if (!storedToken) return;
        try {
            const res = await axios.get(`${API_BASE}/campaigns`, {
                headers: { 'Authorization': `Bearer ${storedToken}` }
            });
            setCampaigns(res.data);
        } catch (err) {
            console.error('Failed to fetch campaigns', err);
        }
    };

    const createCampaign = async () => {
        if (!newCampaignName) {
            alert("Veuillez entrer un nom de campagne.");
            return;
        }
        try {
            console.log("🚀 Creating campaign with:", {
                name: newCampaignName,
                groupId: newCampaignGroupId
            });
            
            await axios.post(`${API_BASE}/campaigns`, {
                name: newCampaignName,
                description: newCampaignDesc,
                type: newCampaignType,
                groupId: (newCampaignGroupId || null),
                targetCommunities: newCampaignCommunities.split('\n').filter(l => l.trim()),
                postsPerAccount: newCampaignPostsPerAcc.toString(),
                commentsPerPost: newCampaignCommentsPerPost.toString()
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            alert("✅ Campagne créée avec succès !");
            setNewCampaignName('');
            setNewCampaignDesc('');
            setNewCampaignCommunities('');
            setNewCampaignPostsPerAcc(3);
            setNewCampaignCommentsPerPost(5);
            setNewCampaignType('POST');
            setNewCampaignGroupId('');
            setIsCreatingCampaign(false);
            fetchCampaigns();
        } catch (err: any) {
            console.error('Create error', err);
            alert(`❌ Erreur lors de la création: ${err.response?.data?.error || err.message}`);
        }
    };

    const openCampaignEditor = (c: any) => {
        setEditCampaignForm({
            id: c.id,
            name: c.name || '',
            description: c.description || '',
            type: 'POST',
            groupId: c.groupId || '',
            targetCommunities: Array.isArray(c.targetCommunities) ? c.targetCommunities.join('\n') : '',
            postsPerAccount: c.postsPerAccount ?? 3,
            commentsPerPost: c.commentsPerPost ?? 5
        });
        setShowEditCampaignModal(true);
    };

    const saveEditedCampaign = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editCampaignForm.name.trim()) {
            alert('Nom de campagne requis');
            return;
        }
        try {
            const { data: updated } = await axios.put(
                `${API_BASE}/update-campaign/${editCampaignForm.id}`,
                {
                    name: editCampaignForm.name,
                    description: editCampaignForm.description,
                    type: editCampaignForm.type,
                    groupId: (editCampaignForm.groupId || null),
                    targetCommunities: editCampaignForm.targetCommunities.split('\n').map((l) => l.trim()).filter(Boolean),
                    postsPerAccount: editCampaignForm.postsPerAccount,
                    commentsPerPost: editCampaignForm.commentsPerPost
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setShowEditCampaignModal(false);
            fetchCampaigns();
            if (selectedCampaign?.id === editCampaignForm.id) {
                setSelectedCampaign((prev: any) => (prev ? { ...prev, ...updated, contents: prev.contents } : prev));
            }
            alert('Campagne mise à jour');
        } catch (err: any) {
            console.error(err);
            alert(err.response?.data?.error || 'Erreur mise à jour campagne');
        }
    };

    const deleteCampaign = async (c: any) => {
        if (!confirm(`Supprimer la campagne « ${c.name} » et tout son contenu ?`)) return;
        try {
            await axios.post(
                `${API_BASE}/delete-campaign/${c.id}`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (selectedCampaign?.id === c.id) setSelectedCampaign(null);
            fetchCampaigns();
        } catch (err: any) {
            console.error(err);
            alert(err.response?.data?.error || 'Erreur suppression');
        }
    };

    const addContent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCampaign) return;
        
        setIsUploading(true);
        const formData = new FormData();
        formData.append('caption', caption);
        formData.append('linkUrl', linkUrl);
        if (targetCommunity) formData.append('targetCommunity', targetCommunity);
        if (mediaFiles) {
            for (let i = 0; i < mediaFiles.length; i++) {
                formData.append('mediaFiles', mediaFiles[i]);
            }
        }

        try {
            await axios.post(`${API_BASE}/campaigns/${selectedCampaign.id}/content`, formData, {
                headers: { 
                    'Content-Type': 'multipart/form-data',
                    'Authorization': `Bearer ${token}`
                }
            });
            setCaption('');
            setLinkUrl('');
            setTargetCommunity('');
            setMediaFiles(null);
            fetchCampaigns();
        } catch (err) {
            console.error('Upload error', err);
        } finally {
            setIsUploading(false);
        }
    };

    useEffect(() => {
        localStorage.setItem('nexus_platform', platform);
        fetchAccounts(platform);
    }, [platform]);

    useEffect(() => {
        const socket = io(SOCKET_URL, {
            transports: ['websocket'],
            reconnectionAttempts: 5,
            timeout: 10000
        });
        
        socket.on('ui_log', (data) => setLogs((prev) => [
            {...data, timestamp: new Date()}, 
            ...prev
        ].slice(0, 100)));
        
        socket.on('ui_screenshot', (data) => setScreenshots((prev) => ({ 
            ...prev, 
            [data.username]: data.image ? `data:image/jpeg;base64,${data.image}` : '' 
        })));

        socket.on('ui_state', (data) => {
            setAccounts((prev) => prev.map(acc => 
                acc.username === data.username ? { ...acc, status: data.state } : acc
            ));
        });

        const interval = setInterval(() => {
            fetchAccounts(platform);
        }, 5000);

        return () => { 
            socket.disconnect(); 
            clearInterval(interval);
        };
    }, [platform, showAddModal]);

    const fetchPosts = async (accountId: string) => {
        if (!token) return;
        try {
            const res = await axios.get(`${API_BASE}/twitter-posts/${accountId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setPosts(res.data);
        } catch (err) {
            console.error('Failed to fetch posts:', err);
        }
    };

    const fetchStats = async (accountId: string, days: number = 30) => {
        if (!token) return;
        try {
            let actualAccountId = accountId;
            if (!accountId.includes('-')) {
                const account = accounts.find(a => a.username === accountId);
                if (account) {
                    actualAccountId = account.id;
                } else {
                    return;
                }
            }
            
            const res = await axios.get(`${API_BASE}/twitter-stats/${actualAccountId}?days=${days}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setStats(res.data);
        } catch (err) {
            console.error('Failed to fetch stats:', err);
        }
    };

    const handleCreatePost = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeAccount || !newPost.content || !token) return;

        const account = accounts.find(a => a.username === activeAccount);
        if (!account) return;

        const scheduleDate = newPost.scheduleDate && newPost.scheduleTime
            ? `${newPost.scheduleDate}T${newPost.scheduleTime}:00Z`
            : undefined;

        try {
            await axios.post(`${API_BASE}/twitter-posts`, {
                accountId: account.id,
                content: newPost.content,
                scheduleDate
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            setNewPost({ content: '', scheduleDate: '', scheduleTime: '' });
            setShowPostModal(false);
            fetchPosts(account.id);
            alert('✅ Post créé avec succès!');
        } catch (err) {
            alert('❌ Erreur lors de la création du post');
        }
    };

    const fetchAccounts = async (p: string) => {
        const storedToken = localStorage.getItem('ghost_token');
        if (!storedToken) return;
        
        try {
            const url = p === 'TWITTER' ? `${API_BASE}/twitter-accounts` : `${API_BASE}/accounts`;
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${storedToken}` }
            });

            if (res.status === 403) {
                const data = await res.json();
                if (data.isInactive) {
                    setIsBlocked(true);
                    setBlockedMessage(data.error);
                    return;
                }
                localStorage.removeItem('ghost_token');
                window.location.href = '/login';
                return;
            }

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }
            
            setIsBlocked(false);
            const data = await res.json();
            setAccounts(data);
            if (data.length > 0) {
                setActiveAccount((prev) => {
                    if (!prev || !data.find((a: any) => a.username === prev)) {
                        return data[0].username;
                    }
                    return prev;
                });
            } else {
                setActiveAccount('');
            }
        } catch (e) {
            console.error("Failed to fetch accounts", e);
        }
    };

    const handleAddAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        const url = platform === 'TWITTER' ? `${API_BASE}/twitter-accounts` : `${API_BASE}/accounts`;
        try {
            let cookiesArray = undefined;
            if (platform === 'TWITTER') {
                const cookieInput = twitterCookies.trim();
                if (!cookieInput) {
                    alert('Erreur: Les cookies sont requis');
                    return;
                }
                
                if (cookieInput.startsWith('[') && cookieInput.endsWith(']')) {
                    try {
                        cookiesArray = JSON.parse(cookieInput);
                    } catch (e) {
                        alert('Erreur: Le format JSON fourni n\'est pas valide');
                        return;
                    }
                } else {
                    cookiesArray = [
                        {
                            name: 'auth_token',
                            value: cookieInput,
                            domain: '.x.com',
                            path: '/',
                            secure: true,
                            httpOnly: true,
                            sameSite: 'Lax'
                        }
                    ];

                    if (twitterCt0.trim()) {
                        cookiesArray.push({
                            name: 'ct0',
                            value: twitterCt0.trim(),
                            domain: '.x.com',
                            path: '/',
                            secure: true,
                            httpOnly: false,
                            sameSite: 'Lax'
                        });
                    }
                }
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    username: newAcc.username,
                    password: newAcc.password,
                    email: newAcc.email,
                    type: newAcc.type,
                    groupId: newAcc.groupId || null,
                    cookies: cookiesArray,
                    authToken: newAcc.authToken || undefined,
                    proxy: newAcc.proxyHost ? { 
                        host: newAcc.proxyHost, 
                        port: parseInt(newAcc.proxyPort),
                        protocol: newAcc.proxyProtocol,
                        username: newAcc.proxyUsername,
                        password: newAcc.proxyPassword,
                        rotateIpUrl: newAcc.proxyRotateIpUrl?.trim() || null
                    } : undefined
                })
            });
            
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Failed to deploy instance');
            }
            
            setShowAddModal(false);
            setNewAcc({ username: '', password: '', email: '', proxyHost: '', proxyPort: '', proxyUsername: '', proxyPassword: '', proxyProtocol: 'http', proxyRotateIpUrl: '', type: 'MAIN', authToken: '', groupId: '' });
            setTwitterCookies('');
            setTwitterCt0('');
            fetchAccounts(platform);
        } catch (error: any) {
            alert(`Erreur: ${error.message}`);
        }
    };

    const handleEditAccount = (acc: any) => {
        setEditingAccount(acc);
        setNewAcc({
            username: acc.username,
            password: acc.password || '',
            email: acc.email || '',
            proxyHost: acc.proxy?.host || '',
            proxyPort: acc.proxy?.port?.toString() || '',
            proxyUsername: acc.proxy?.username || '',
            proxyPassword: acc.proxy?.password || '',
            proxyProtocol: acc.proxy?.protocol === 'socks5' ? 'socks5' : 'http',
            proxyRotateIpUrl: acc.proxy?.rotateIpUrl || '',
            type: acc.type || 'MAIN',
            authToken: '',
            groupId: acc.groupId || ''
        });
        setTwitterCookies('');
        setTwitterCt0('');
        setShowEditModal(true);
    };

    const handleUpdateAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingAccount || !token) return;

        const url = platform === 'TWITTER' 
            ? `${API_BASE}/twitter-accounts/${editingAccount.id}` 
            : `${API_BASE}/accounts/${editingAccount.id}`;
            
        try {
            let cookiesArray = undefined;
            if (platform === 'TWITTER' && (twitterCookies.trim() || twitterCt0.trim())) {
                const cookieInput = twitterCookies.trim();
                if (cookieInput.startsWith('[') && cookieInput.endsWith(']')) {
                    cookiesArray = JSON.parse(cookieInput);
                } else if (cookieInput || twitterCt0.trim()) {
                    cookiesArray = [];
                    if (cookieInput) {
                        cookiesArray.push({
                            name: 'auth_token',
                            value: cookieInput,
                            domain: '.x.com',
                            path: '/',
                            secure: true,
                            httpOnly: true,
                            sameSite: 'Lax'
                        });
                    }

                    if (twitterCt0.trim()) {
                        cookiesArray.push({
                            name: 'ct0',
                            value: twitterCt0.trim(),
                            domain: '.x.com',
                            path: '/',
                            secure: true,
                            httpOnly: false,
                            sameSite: 'Lax'
                        });
                    }
                }
            }

            const response = await fetch(url, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    username: newAcc.username,
                    password: newAcc.password,
                    email: newAcc.email,
                    type: newAcc.type,
                    groupId: newAcc.groupId || null,
                    sessionCookies: cookiesArray,
                    proxy: newAcc.proxyHost ? { 
                        host: newAcc.proxyHost, 
                        port: parseInt(newAcc.proxyPort),
                        protocol: newAcc.proxyProtocol,
                        username: newAcc.proxyUsername,
                        password: newAcc.proxyPassword,
                        rotateIpUrl: newAcc.proxyRotateIpUrl?.trim() || null
                    } : undefined
                })
            });
            
            if (!response.ok) throw new Error('Update failed');
            
            setShowEditModal(false);
            setEditingAccount(null);
            fetchAccounts(platform);
        } catch (e) {
            console.error("Failed to update account", e);
            alert("Erreur lors de la mise à jour");
        }
    };

    const launchAction = async (id: string, action: string, autoSequence: boolean = false) => {
        const url = platform === 'TWITTER' ? `${API_BASE}/twitter-accounts/${id}/action` : `${API_BASE}/accounts/${id}/action`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ action })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: 'Unknown error' }));
            alert(`Action failed: ${err.error || 'Unknown error'}`);
            return;
        }

        if (platform === 'TWITTER') {
            setTimeout(() => {
                fetchPosts(id);
                fetchStats(id);
            }, 2000);
        }

        if (autoSequence && platform === 'TWITTER' && action === 'setupProfile') {
            const sequence = ['joinCommunity', 'postCommunity', 'spamComments'];
            const delays = [60000, 120000, 180000];
            
            setAutoSequenceStatus(prev => ({
                ...prev,
                [id]: {
                    running: true,
                    currentStep: 0,
                    totalSteps: sequence.length,
                    currentAction: 'setupProfile'
                }
            }));
            
            for (let i = 0; i < sequence.length; i++) {
                setTimeout(async () => {
                    const currentAction = sequence[i];
                    
                    setAutoSequenceStatus(prev => ({
                        ...prev,
                        [id]: {
                            running: true,
                            currentStep: i + 1,
                            totalSteps: sequence.length,
                            currentAction: currentAction
                        }
                    }));
                    
                    const seqResponse = await fetch(url, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ action: currentAction })
                    });
                    
                    if (seqResponse.ok) {
                        setTimeout(() => {
                            fetchPosts(id);
                            fetchStats(id);
                        }, 2000);
                    }
                    
                    if (i === sequence.length - 1) {
                        setTimeout(() => {
                            setAutoSequenceStatus(prev => ({
                                ...prev,
                                [id]: {
                                    running: false,
                                    currentStep: sequence.length,
                                    totalSteps: sequence.length,
                                    currentAction: 'Complete'
                                }
                            }));
                        }, 5000);
                    }
                }, delays[i]);
            }
        }
    };

    const syncMetadata = async (id: string) => {
        try {
            await axios.post(`${API_BASE}/twitter-accounts/${id}/sync`, {}, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            alert("Sync job queued. Profiling and media will be updated shortly.");
        } catch (err) {
            console.error('Sync error', err);
            alert("Failed to queue sync job");
        }
    };

    const handleDeleteAccount = async (id: string) => {
        if (!confirm("Voulez-vous vraiment détruire ce nœud de la base de données ?")) return;
        const url = platform === 'TWITTER' ? `${API_BASE}/twitter-accounts/${id}` : `${API_BASE}/accounts/${id}`;
        const response = await fetch(url, { 
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: 'Unknown error' }));
            alert(`Delete failed: ${err.error || 'Unknown error'}`);
            return;
        }
        
        if (activeAccount && accounts.find(a => a.id === id)?.username === activeAccount) setActiveAccount('');
        fetchAccounts(platform);
    };

    const toggleAutoMode = async (accountId: string, currentStatus: boolean) => {
        try {
            const res = await axios.patch(`${API_BASE}/twitter-accounts/${accountId}/auto-mode`, 
                { autoMode: !currentStatus },
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, autoMode: res.data.autoMode } : a));
        } catch (err) {
            console.error('Failed to toggle auto-mode', err);
        }
    };

    useEffect(() => {
        (window as any).toggleAutoMode = toggleAutoMode;
    }, [accounts]);

    const handleLogout = () => {
        localStorage.clear();
        router.push('/login');
    };

    const activeAccObj = accounts.find(a => a.username === activeAccount);

    if (showNewFeatures) {
        return (
            <div className="relative">
                <button
                    onClick={() => setShowNewFeatures(false)}
                    className="fixed top-4 left-4 z-50 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 border border-slate-700"
                >
                    <LayoutDashboard className="w-4 h-4" />
                    Retour au Dashboard
                </button>
                            <NewFeatures 
                                accounts={accounts}
                                selectedAccount={selectedAccount}
                                profileForm={profileForm}
                                onProfileFormChange={setProfileForm}
                                token={token}
                                onClose={() => setShowNewFeatures(false)}
                            />
            </div>
        );
    }

    if (isBlocked) {
        return (
            <div className="min-h-screen bg-[#030303] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-violet-600/10 rounded-full blur-[120px] pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-indigo-900/10 rounded-full blur-[150px] pointer-events-none" />
                
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-md w-full bg-[#0A0A0B] border border-white/10 rounded-[40px] p-10 text-center relative z-10 shadow-2xl"
                >
                    <div className="w-20 h-20 bg-rose-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 animate-pulse">
                        <Lock size={40} className="text-rose-500" />
                    </div>
                    
                    <h2 className="text-3xl font-bold mb-4 bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
                        Abonnement Requis
                    </h2>
                    
                    <p className="text-white/40 mb-8 leading-relaxed">
                        {blockedMessage || "Votre compte est en attente d'activation. Veuillez contacter l'administrateur pour finaliser votre abonnement et accéder au bot."}
                    </p>
                    
                    <div className="space-y-4">
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/10 text-xs text-left">
                            <p className="text-white/60 font-medium mb-1 uppercase tracking-widest">Instructions :</p>
                            <p className="text-white/30 italic">Envoyez votre paiement à l'administrateur. Une fois reçu, votre accès sera activé immédiatement pour la durée choisie.</p>
                        </div>
                        
                        <button 
                            onClick={handleLogout}
                            className="w-full py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-semibold transition-all border border-white/10 flex items-center justify-center gap-2"
                        >
                            <LogOut size={18} />
                            Se déconnecter
                        </button>
                    </div>
                </motion.div>
                
                <p className="mt-12 text-white/20 text-sm flex items-center gap-2">
                    <Shield size={14} /> GhostContent • Sécurisé par Antigravity
                </p>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-[#030303] text-white font-sans selection:bg-violet-500/30 overflow-hidden font-light">
            <div className={`absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-[120px] pointer-events-none transition-colors duration-1000 ${platform === 'TWITTER' ? 'bg-blue-600/10' : 'bg-fuchsia-600/10'}`} suppressHydrationWarning />
            <div className={`absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full blur-[150px] pointer-events-none transition-colors duration-1000 ${platform === 'TWITTER' ? 'bg-cyan-900/10' : 'bg-indigo-900/10'}`} suppressHydrationWarning />

            <aside className="w-20 lg:w-24 h-screen sticky top-0 border-r border-white/5 flex flex-col items-center py-8 gap-8 bg-black/40 backdrop-blur-xl z-50 overflow-y-auto">
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

                <nav className="flex flex-col gap-6 items-center w-full relative flex-1 min-h-0">
                    <SidebarIcon icon={<LayoutDashboard size={22} />} active={viewMode === 'SINGLE'} onClick={() => setViewMode('SINGLE')} title="Single Node View" />
                    <SidebarIcon icon={<Users size={22} />} active={viewMode === 'ORCHESTRATION'} onClick={() => setViewMode('ORCHESTRATION')} title="Social Mastermind" />
                    <SidebarIcon icon={<Megaphone size={22} />} active={viewMode === 'CAMPAIGNS'} onClick={() => setViewMode('CAMPAIGNS')} title="Campagnes Globales" />
                    <div className="w-8 h-[1px] bg-white/5 my-2" />
                    <SidebarIcon icon={<Monitor size={22} />} active={viewMode === 'GRID'} onClick={() => setViewMode('GRID')} title="Grid Matrix View" />
                    <SidebarIcon icon={<Server size={22} />} active={viewMode === 'PROXIES'} onClick={() => setViewMode('PROXIES')} title="Proxy Matrix" />
                    <SidebarIcon icon={<Users size={22} />} active={viewMode === 'ACCOUNTS'} onClick={() => setViewMode('ACCOUNTS')} title="Global Accounts" />
                    <SidebarIcon icon={<FolderTree size={22} />} active={viewMode === 'GROUPS'} onClick={() => setViewMode('GROUPS')} title="Manage Groups" />
                    
                    {platform === 'TWITTER' && (
                        <>
                            <div className="w-8 h-[1px] bg-white/10 my-2" />
                            <SidebarIcon icon={<BarChart3 size={22} />} active={viewMode === 'STATS'} onClick={() => { setViewMode('STATS'); if (activeAccount) fetchStats(activeAccount); }} title="Statistics" />
                        </>
                    )}
                    
                    <div className="w-8 h-[1px] bg-white/10 my-2" />

                    <SidebarIcon icon={<Wrench size={22} />} active={showNewFeatures} onClick={() => setShowNewFeatures(true)} title="🛠️ Outils Avancés" />

                    <div className="w-8 h-1 bg-gradient-to-r from-violet-500 to-purple-500 my-2 rounded-full" />

                    <motion.button 
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors group mt-2" 
                        onClick={() => setShowAddModal(true)}
                        title="Add Account"
                    >
                        <Plus size={24} className="text-white/50 group-hover:text-white transition-colors" />
                    </motion.button>

                    <SidebarIcon icon={<Settings size={22} />} active={viewMode === 'SETTINGS'} onClick={() => setViewMode('SETTINGS')} title="Global Settings & Quotas" />

                    <div className="flex-1" />

                    <div className="w-8 h-[1px] bg-white/10 my-2" />

                    {user?.role === 'ADMIN' && (
                        <SidebarIcon icon={<Shield size={22} className="text-amber-400" />} active={false} onClick={() => router.push('/admin')} title="Administration Console" />
                    )}

                    <SidebarIcon icon={<LogOut size={22} className="text-rose-500" />} active={false} onClick={handleLogout} title="Logout" />
                </nav>
            </aside>

            <main className="flex-1 flex flex-col overflow-hidden relative z-10">
                
                <header className="h-24 border-b border-white/5 flex items-center justify-between px-10 bg-black/20 backdrop-blur-md z-20 transition-all duration-500">
                    <div>
                        <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
                            <Ghost className="text-violet-400 w-8 h-8" />
                            Ghost<span className="font-light text-violet-400">Content</span>
                        </h2>
                        <p className="text-xs text-white/40 mt-1 flex items-center gap-2 uppercase tracking-widest">
                            <Activity size={10} className="text-emerald-400" /> System Online • {accounts.length} Node(s)
                            {user?.subscriptionExpiresAt && (
                                <span className="ml-4 flex items-center gap-1.5 text-violet-400/80 normal-case bg-violet-400/10 px-2 py-0.5 rounded-full text-[10px] font-medium border border-violet-400/20">
                                    <Crown size={10} /> Expire le {new Date(user.subscriptionExpiresAt).toLocaleDateString()}
                                </span>
                            )}
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

                <div className="flex-1 overflow-y-auto p-8 lg:p-10 relative" style={{ scrollbarWidth: 'none' }}>
                    
                    {viewMode === 'SINGLE' && (
                        <div className="max-w-[1600px] mx-auto space-y-8">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
                                <StatCard title="Active Instances" value={accounts.filter(a => a.status === 'RUNNING' || a.status === 'CONNECTED' || a.status === 'ACTIVE').length.toString()} icon={<Server size={18} />} color="text-violet-400" />
                                <StatCard title="Total Accounts" value={accounts.length.toString()} icon={<Users size={18} />} color="text-fuchsia-400" />
                                <StatCard title="Actions Performed" value="1,204" icon={<Activity size={18} />} color="text-emerald-400" />
                                <StatCard title="System Health" value="98%" icon={<Shield size={18} />} color="text-blue-400" />
                            </div>

                            <div className="flex items-center justify-between mb-4 mt-8">
                                <h3 className="text-lg font-medium text-white/90">Managed Nodes</h3>
                                <button
                                    onClick={() => setShowNewFeatures(true)}
                                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow-lg shadow-blue-600/20"
                                >
                                    <Wrench size={16} />
                                    Outils Avancés
                                </button>
                            </div>

                            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                                <AnimatePresence>
                                    {accounts.map((acc, idx) => (
                                        <AccountCard 
                                            key={acc.id} 
                                            account={acc} 
                                            active={activeAccount === acc.username}
                                            onClick={() => { setActiveAccount(acc.username); setViewMode('SINGLE'); }}
                                            onLaunch={(action) => launchAction(acc.id, action)}
                                            onEditProfile={() => {
                                                setSelectedAccount(acc);
                                                setProfileForm({
                                                    profileImage: acc.profileImage || '',
                                                    bio: acc.bio || '',
                                                    bannerImage: acc.bannerImage || '',
                                                    niche: acc.niche || ''
                                                });
                                                setShowNewFeatures(true);
                                            }}
                                            index={idx}
                                            platform={platform}
                                            autoSequenceStatus={autoSequenceStatus}
                                            toggleAutoMode={toggleAutoMode}
                                            syncMetadata={syncMetadata}
                                        />
                                    ))}
                                </AnimatePresence>
                            </section>

                            <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent my-10" />

                            <section className="grid grid-cols-1 xl:grid-cols-3 gap-8 pb-10">
                                <div className="xl:col-span-2 flex flex-col gap-4">
                                    <h3 className="text-sm font-medium text-white/70 flex items-center gap-2 uppercase tracking-widest ml-2">
                                        <Camera size={16} /> Live Screencast
                                        {activeAccObj && <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 text-[10px] ml-2 font-bold">{activeAccount}</span>}
                                    </h3>
                                    
                                    <div className="bg-[#050505] border border-white/10 rounded-2xl overflow-hidden aspect-video relative group shadow-2xl">
                                        <div className="absolute top-4 left-4 z-10 flex gap-2">
                                            {activeAccObj?.status === 'RUNNING' && (
                                                <div className="px-3 py-1 bg-emerald-500/20 backdrop-blur-md text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-medium flex items-center gap-1.5 shadow-lg">
                                                    <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
                                                    Recording
                                                </div>
                                            )}
                                        </div>

                                        {screenshots[activeAccount] ? (
                                            <div className="w-full h-full flex items-center justify-center bg-black/20">
                                                <img 
                                                    src={screenshots[activeAccount]} 
                                                    alt={`Live screenshot of @${activeAccount}`}
                                                    className="w-full h-full object-contain" 
                                                    onError={(e) => {
                                                        const target = e.target as HTMLImageElement;
                                                        target.style.display = 'none';
                                                    }}
                                                />
                                            </div>
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-gray-900 to-black">
                                                <div className="relative">
                                                    <Monitor size={56} className="text-white/20" />
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <Activity size={20} className="text-violet-400/60 animate-pulse" />
                                                    </div>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-sm font-medium text-white/40">No live feed</p>
                                                    <p className="text-xs text-white/20 mt-1">Select an account and start an action</p>
                                                </div>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl pointer-events-none" />
                                    </div>
                                </div>

                                <div className="flex flex-col gap-4 h-full xl:max-h-[600px]">
                                    <h3 className="text-sm font-medium text-white/70 flex items-center gap-2 uppercase tracking-widest ml-2">
                                        <Terminal size={16} /> Action Logs
                                    </h3>
                                    
                                    <div className="bg-[#0A0A0B] border border-white/10 rounded-2xl overflow-hidden flex flex-col flex-1 shadow-2xl relative">
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
                                                        key={`${l.username}-${l.timestamp?.getTime()}-${i}`}
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
                                                <div className="w-full h-full">
                                                    <img 
                                                        src={screenshots[acc.username]} 
                                                        alt={`Screenshot of @${acc.username}`}
                                                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-700" 
                                                        onError={(e) => {
                                                            const target = e.target as HTMLImageElement;
                                                            target.style.display = 'none';
                                                        }}
                                                    />
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center gap-2">
                                                    <WifiOff size={20} className="text-white/15" />
                                                    <span className="text-[10px] text-white/25 font-mono">No signal</span>
                                                </div>
                                            )}
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
                                                                        {acc.groupId && <div className="text-[10px] bg-white/10 text-white/70 w-max px-2 py-0.5 mt-1 rounded-sm border border-white/5">Group: {acc.groupId}</div>}
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
                                                                    onClick={() => handleEditAccount(acc)}
                                                                    className="p-2 bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-white rounded-lg transition-colors border border-blue-500/20 shadow-sm mr-2"
                                                                    title="Edit Settings"
                                                                >
                                                                    <Edit size={16} />
                                                                </button>
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

                    {viewMode === 'ORCHESTRATION' && (
                        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="max-w-7xl mx-auto space-y-8">
                            <div className="flex justify-between items-center mb-8">
                                <div>
                                    <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-fuchsia-500 bg-clip-text text-transparent flex items-center gap-3">
                                        <Users className="text-blue-400" size={32} /> Social Mastermind
                                    </h1>
                                    <p className="text-white/50 mt-1 text-sm font-medium">Visualisation de l'architecture d'essaimage (Swarm) par groupes.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
                                {groups.map(group => {
                                    const groupAccounts = accounts.filter(a => a.groupId === group.id);
                                    const mainAccounts = groupAccounts.filter(a => a.type === 'MAIN');
                                    const supportAccounts = groupAccounts.filter(a => a.type === 'SUPPORT');

                                    return (
                                        <div key={group.id} className="bg-[#0f0f11] border border-white/10 rounded-[32px] p-6 relative overflow-hidden shadow-2xl hover:border-white/20 transition-all flex flex-col group/card">
                                            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-50" />
                                            
                                            <div className="relative z-10 flex justify-between items-start mb-6">
                                                <div>
                                                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                                        <FolderTree size={20} className="text-blue-400" /> {group.name}
                                                    </h3>
                                                    <div className="text-xs text-white/40 font-mono mt-1">ID: {group.id}</div>
                                                </div>
                                                <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] uppercase font-bold tracking-wider text-white/60">
                                                    {groupAccounts.length} Nodes
                                                </div>
                                            </div>

                                            <div className="relative z-10 flex-1 flex flex-col gap-6">
                                                {/* MAIN Nodes */}
                                                <div className="bg-black/40 rounded-2xl p-4 border border-blue-500/20">
                                                    <div className="text-[10px] uppercase tracking-widest font-bold text-blue-400 mb-3 flex items-center gap-2">
                                                        <Briefcase size={12} /> Cerveaux (Main)
                                                    </div>
                                                    <div className="flex flex-col gap-2">
                                                        {mainAccounts.length === 0 ? (
                                                            <div className="text-xs text-white/30 italic">Aucun compte Main assigné</div>
                                                        ) : (
                                                            mainAccounts.map(main => (
                                                                <div key={main.id} className="flex items-center gap-3 p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                                                                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                                                                        <Briefcase size={14} />
                                                                    </div>
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="font-bold text-sm text-white truncate">@{main.username}</div>
                                                                        <div className="text-[10px] text-blue-300/70 truncate flex items-center gap-1">
                                                                            <Activity size={10} /> {main.status}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>

                                                {/* SUPPORT Nodes */}
                                                <div className="bg-black/40 rounded-2xl p-4 border border-fuchsia-500/20 flex-1">
                                                    <div className="text-[10px] uppercase tracking-widest font-bold text-fuchsia-400 mb-3 flex items-center gap-2">
                                                        <Users size={12} /> Essaim (Support)
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {supportAccounts.length === 0 ? (
                                                            <div className="text-xs text-white/30 italic">Aucun bot Support assigné</div>
                                                        ) : (
                                                            supportAccounts.map(support => (
                                                                <div key={support.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/20 text-xs">
                                                                    <span className="text-fuchsia-400 font-medium">@{support.username}</span>
                                                                    <div className={`w-1.5 h-1.5 rounded-full ${support.status === 'RUNNING' ? 'bg-emerald-400 animate-pulse' : 'bg-fuchsia-500/50'}`} title={support.status} />
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Action Bar */}
                                            <div className="mt-6 pt-4 border-t border-white/10 relative z-10 flex justify-between items-center">
                                                <span className="text-xs text-white/40">Ratio: 1 Main / {supportAccounts.length} Supports</span>
                                            </div>
                                        </div>
                                    );
                                })}

                                {groups.length === 0 && (
                                    <div className="col-span-full py-20 text-center border border-dashed border-white/10 rounded-[40px] bg-white/[0.01]">
                                        <Users size={64} className="mx-auto text-white/10 mb-6" />
                                        <h3 className="text-xl font-bold text-white/70 mb-2">Aucun Groupe Mastermind</h3>
                                        <p className="text-white/40">Créez des groupes dans l'onglet Manage Groups pour commencer l'essaimage.</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {viewMode === 'GROUPS' && (
                        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto space-y-8">
                            <div className="flex justify-between items-center mb-8">
                                <div>
                                    <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent flex items-center gap-3">
                                        <FolderTree className="text-blue-500" /> Group Management
                                    </h1>
                                    <p className="text-white/40 mt-1">Organize MAIN and SUPPORT accounts into dedicated groups or niches.</p>
                                </div>
                            </div>

                            <div className="bg-[#0f0f11] border border-white/10 rounded-3xl p-8 mb-8 relative overflow-hidden shadow-lg shadow-black/50">
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 pointer-events-none" />
                                <h2 className="text-lg font-semibold text-white mb-6">Create New Group</h2>
                                <div className="flex gap-4">
                                    <input 
                                        type="text"
                                        placeholder="Enter group name (e.g., Fitness Niche)"
                                        value={newGroupName}
                                        onChange={e => setNewGroupName(e.target.value)}
                                        className="flex-1 bg-black/40 border border-white/10 focus:border-blue-500/50 outline-none px-4 py-3 rounded-xl text-sm transition-all text-white/90"
                                    />
                                    <button 
                                        onClick={async () => {
                                            if (!newGroupName) return;
                                            try {
                                                const res = await axios.post(`${API_BASE}/groups`, 
                                                    { name: newGroupName, taskType: 'DEFAULT' },
                                                    { headers: { 'Authorization': `Bearer ${token}` } }
                                                );
                                                setNewGroupName('');
                                                fetchGroups();
                                            } catch (err: any) {
                                                console.error(err);
                                                alert(`Erreur: ${err.response?.data?.error || 'Impossible de créer le groupe'}`);
                                            }
                                        }}
                                        className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-semibold transition-colors flex items-center gap-2 shadow-blue-500/20 shadow-lg"
                                    >
                                        <Plus size={18} /> Create Group
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {groups.map(g => (
                                    <div key={g.id} className="bg-[#0f0f11] border border-white/5 rounded-3xl p-6 relative group hover:border-white/20 transition-all hover:bg-white/[0.02]">
                                        <div className="absolute top-6 right-6">
                                            <button 
                                                onClick={async () => {
                                                    if(confirm('Delete group ?')) {
                                                        await axios.delete(`${API_BASE}/groups/${g.id}`, {
                                                            headers: { 'Authorization': `Bearer ${token}` }
                                                        });
                                                        fetchGroups();
                                                    }
                                                }}
                                                className="p-2 bg-rose-500/10 text-rose-500 rounded-lg hover:bg-rose-500 hover:text-white transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 text-blue-500 flex items-center justify-center border border-blue-500/20">
                                                <FolderTree size={20} />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-lg text-white">{g.name}</h3>
                                                <p className="text-xs text-white/40 font-mono">ID: {g.id}</p>
                                            </div>
                                        </div>
                                        <div className="pt-4 border-t border-white/5 flex justify-between items-center text-sm">
                                            <span className="text-white/40">Status</span>
                                            <span className="font-mono text-[10px] bg-green-500/10 text-green-400 px-2.5 py-1 rounded-md border border-green-500/20 font-bold tracking-wider">
                                                ACTIVE
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                {groups.length === 0 && (
                                    <div className="col-span-full py-12 text-center border overflow-hidden rounded-3xl border-dashed border-white/10 bg-white/[0.01]">
                                        <FolderTree size={48} className="mx-auto text-white/10 mb-4" />
                                        <p className="text-white/40">No groups configured yet. Create one to organize your accounts.</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {viewMode === 'CAMPAIGNS' && (
                        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="max-w-[1400px] mx-auto space-y-8">
                            <div className="flex justify-between items-center mb-12">
                                <div>
                                    <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent flex items-center gap-3">
                                        <Megaphone className="text-blue-500" /> Ghost Campaigns
                                    </h1>
                                    <p className="text-gray-400 mt-2">Manage your global content pool for the Mastermind Loop.</p>
                                </div>
                                <button 
                                    onClick={() => setIsCreatingCampaign(true)}
                                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-blue-500/20 active:scale-95 text-white"
                                >
                                    <Plus size={20} /> Nouvelle Campagne
                                </button>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                <div className="lg:col-span-4 space-y-4">
                                    <h2 className="text-xl font-semibold flex items-center gap-2 mb-6 text-white/70">
                                        <Layers className="text-gray-500" /> Vos Campagnes
                                    </h2>
                                    {campaigns.map(c => (
                                        <div 
                                            key={c.id}
                                            className={`p-6 rounded-2xl border transition-all ${
                                                selectedCampaign?.id === c.id 
                                                ? 'bg-blue-600/10 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.15)] text-white' 
                                                : 'bg-white/5 border-white/10 hover:border-white/20 text-white/60'
                                            }`}
                                        >
                                            <div className="flex justify-between items-start cursor-pointer" onClick={() => setSelectedCampaign(c)}>
                                                <div>
                                                    <h3 className="font-bold text-lg">{c.name}</h3>
                                                    <p className="text-sm text-gray-500 mt-1">{c.contents?.length || 0} items de contenu</p>
                                                    <p className="text-[10px] text-violet-400 mt-1 uppercase font-semibold">Type: {c.type || 'POST'}</p>
                                                    {c.groupId && <p className="text-[10px] text-blue-400 mt-1 uppercase font-semibold">Group: {c.groupId}</p>}
                                                </div>
                                                <div className="flex flex-col items-end gap-2">
                                                    {c.isActive && <span className="px-2 py-1 bg-green-500/10 text-green-500 text-[10px] rounded-full border border-green-500/20">ACTIVE</span>}
                                                </div>
                                            </div>
                                            <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
                                                <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        type="button"
                                                        onClick={() => openCampaignEditor(c)}
                                                        className="px-3 py-2 bg-white/5 text-white/80 border border-white/15 hover:bg-white/10 rounded-lg text-xs font-bold flex items-center gap-1.5"
                                                    >
                                                        <Edit size={14} /> Modifier
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => deleteCampaign(c)}
                                                        className="px-3 py-2 bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20 rounded-lg text-xs font-bold flex items-center gap-1.5"
                                                    >
                                                        <Trash2 size={14} /> Supprimer
                                                    </button>
                                                </div>
                                                {c.isActive ? (
                                                    <button 
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            try {
                                                                await axios.post(`${API_BASE}/campaigns/${c.id}/toggle`, { isActive: false }, { headers: { 'Authorization': `Bearer ${token}` }});
                                                                fetchCampaigns();
                                                                fetchAccounts(platform);
                                                            } catch (err) { console.error(err); }
                                                        }}
                                                        className="px-4 py-2 bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500/20 rounded-lg text-sm font-bold flex items-center gap-2"
                                                    >
                                                        <Pause size={14} fill="currentColor" /> Mettre en pause
                                                    </button>
                                                ) : (
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedLaunchCampaign(c.id);
                                                            setShowLaunchModal(true);
                                                        }}
                                                        className="px-4 py-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20 rounded-lg text-sm font-bold flex items-center gap-2"
                                                    >
                                                        <Play size={14} fill="currentColor" /> Lancer les Bots
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="lg:col-span-8">
                                    {selectedCampaign ? (
                                        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl">
                                            <div className="flex justify-between items-start mb-8">
                                                <div>
                                                    <h2 className="text-2xl font-bold flex items-center gap-3 text-white">
                                                        <Sparkles className="text-yellow-400" /> Ajouter du Contenu à {selectedCampaign.name}
                                                    </h2>
                                                    {selectedCampaign.targetCommunities?.length > 0 && (
                                                        <div className="flex flex-wrap gap-2 mt-3">
                                                            {selectedCampaign.targetCommunities.map((c: string, i: number) => (
                                                                <span key={i} className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20 flex items-center gap-1">
                                                                    <LinkIcon size={8} /> {c.split('/').pop() || c}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <form onSubmit={addContent} className="space-y-6">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                                                        <Type size={16} /> Caption
                                                    </label>
                                                    <textarea 
                                                        value={caption}
                                                        onChange={(e) => setCaption(e.target.value)}
                                                        className="w-full bg-[#121217] border border-white/10 rounded-2xl p-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-gray-600 mini-scrollbar h-32 text-white"
                                                        placeholder="Qu'est-ce que le bot doit dire ?"
                                                        required
                                                    />
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                                                            <LinkIcon size={16} /> Lien du compte / Post (Optionnel)
                                                        </label>
                                                        <input 
                                                            type="url"
                                                            value={linkUrl}
                                                            onChange={(e) => setLinkUrl(e.target.value)}
                                                            className="w-full bg-[#121217] border border-white/10 rounded-xl p-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-white"
                                                            placeholder="https://x.com/username/status/..."
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                                                            <Users size={16} /> Communauté Cible (Optionnel)
                                                        </label>
                                                        {selectedCampaign.targetCommunities?.length > 0 ? (
                                                            <select 
                                                                value={targetCommunity}
                                                                onChange={(e) => setTargetCommunity(e.target.value)}
                                                                className="w-full bg-[#121217] border border-white/10 rounded-xl p-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-white appearance-none"
                                                            >
                                                                <option value="">Sélectionner une communauté...</option>
                                                                {selectedCampaign.targetCommunities.map((c: string, i: number) => (
                                                                    <option key={i} value={c}>{c.split('/').pop() || c}</option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            <input 
                                                                type="text"
                                                                value={targetCommunity}
                                                                onChange={(e) => setTargetCommunity(e.target.value)}
                                                                className="w-full bg-[#121217] border border-white/10 rounded-xl p-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-white"
                                                                placeholder="Lien de la communauté"
                                                            />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                                                            <ImageIcon size={16} /> Médias (Images/Videos)
                                                        </label>
                                                        <input 
                                                            type="file"
                                                            multiple
                                                            onChange={(e) => setMediaFiles(e.target.files)}
                                                            className="w-full text-sm text-gray-400 file:mr-4 file:py-3 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20 transition-all cursor-pointer"
                                                        />
                                                    </div>
                                                </div>

                                                <button 
                                                    disabled={isUploading}
                                                    className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed group text-white"
                                                >
                                                    {isUploading ? (
                                                        <Loader2 className="animate-spin" />
                                                    ) : (
                                                        <>
                                                            <Send size={20} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" /> 
                                                            Ajouter au Pool
                                                       </>
                                                    )}
                                                </button>
                                            </form>

                                            <div className="mt-12">
                                                <h3 className="text-lg font-semibold mb-6 text-white">Contenu de la Campagne</h3>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {selectedCampaign.contents?.map((item: any) => (
                                                        <div key={item.id} className="bg-[#121217] p-5 rounded-2xl border border-white/5 group relative">
                                                            <p className="text-sm text-gray-300 line-clamp-3">{item.caption}</p>
                                                            {item.linkUrl && <p className="text-xs text-blue-400 mt-2 truncate">Link: {item.linkUrl}</p>}
                                                            {item.targetCommunity && (
                                                                <p className="text-[10px] text-fuchsia-400 mt-1 flex items-center gap-1">
                                                                    <Users size={10} /> Community: {item.targetCommunity.split('/').pop()}
                                                                </p>
                                                            )}
                                                            {item.mediaUrls?.length > 0 && (
                                                                <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                                                                    {item.mediaUrls.map((m: string, idx: number) => (
                                                                        <img key={idx} src={m} className="w-16 h-16 rounded-lg object-cover border border-white/10" />
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <div className="mt-4 flex justify-between items-center">
                                                                <span className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">Utilisé {item.usedCount} fois</span>
                                                                <button 
                                                                    className="text-red-500/50 hover:text-red-500 p-2 rounded-lg hover:bg-red-500/10 transition-all"
                                                                    onClick={async () => {
                                                                        if (!confirm('Supprimer ce contenu ?')) return;
                                                                        try {
                                                                            await axios.delete(`${API_BASE}/campaigns/content/${item.id}`, {
                                                                                headers: { 'Authorization': `Bearer ${token}` }
                                                                            });
                                                                            fetchCampaigns();
                                                                        } catch (err: any) {
                                                                            alert('Erreur suppression: ' + (err.response?.data?.error || err.message));
                                                                        }
                                                                    }}
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-[600px] flex flex-col items-center justify-center bg-white/5 border border-dashed border-white/10 rounded-3xl text-gray-500">
                                            <Megaphone size={64} className="mb-6 opacity-20" />
                                            <p className="text-xl font-medium">Sélectionnez une campagne pour voir son contenu</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {viewMode === 'SETTINGS' && (
                        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
                            <div className="flex items-center justify-between mb-2">
                                <div>
                                    <h2 className="text-3xl font-bold text-white tracking-tight">Global Settings</h2>
                                    <p className="text-white/40 mt-1">Configure quotas and automation behavior for all accounts.</p>
                                </div>
                                <button 
                                    onClick={async () => {
                                        try {
                                            await axios.post(`${API_BASE}/settings`, globalSettings, {
                                                headers: { 'Authorization': `Bearer ${token}` }
                                            });
                                            alert("Settings saved successfully!");
                                        } catch (err) {
                                            alert("Failed to save settings");
                                        }
                                    }}
                                    className="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-violet-600/20 flex items-center gap-2"
                                >
                                    <Save size={18} /> Save All Changes
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <section className="p-8 bg-[#0A0A0B] border border-white/5 rounded-3xl space-y-6">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                                            <Megaphone size={20} />
                                        </div>
                                        <h3 className="text-lg font-semibold text-white">Posting Limits (MAIN)</h3>
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-xs uppercase tracking-widest text-white/40 font-bold mb-2 block">Fréquence de Publication</label>
                                            <div className="flex gap-4">
                                                <input 
                                                    type="number"
                                                    value={isNaN(globalSettings.postIntervalValue) ? '' : globalSettings.postIntervalValue}
                                                    onChange={(e) => {
                                                        const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                                        setGlobalSettings({...globalSettings, postIntervalValue: val});
                                                    }}
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-violet-500/50 outline-none transition-all"
                                                />
                                                <select 
                                                    value={globalSettings.postIntervalUnit}
                                                    onChange={(e) => setGlobalSettings({...globalSettings, postIntervalUnit: e.target.value as 'MINUTES' | 'HOURS'})}
                                                    className="bg-[#050505] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-violet-500/50 outline-none transition-all cursor-pointer"
                                                >
                                                    <option value="MINUTES">Minutes</option>
                                                    <option value="HOURS">Heures</option>
                                                </select>
                                            </div>
                                            <p className="text-[10px] text-white/20 mt-2 italic">Définit le délai d'attente entre chaque publication pour un compte MAIN.</p>
                                        </div>
                                    </div>
                                </section>

                                <section className="p-8 bg-[#0A0A0B] border border-white/5 rounded-3xl space-y-6">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-pink-500/10 rounded-lg text-pink-400">
                                            <MessageSquare size={20} />
                                        </div>
                                        <h3 className="text-lg font-semibold text-white">Comment Swarm Quotas</h3>
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-xs uppercase tracking-widest text-white/40 font-bold mb-2 block">Max Comments Per Main Post</label>
                                            <input 
                                                type="number"
                                                value={isNaN(globalSettings.commentsPerPostLimit) ? '' : globalSettings.commentsPerPostLimit}
                                                onChange={(e) => {
                                                    const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                                    setGlobalSettings({...globalSettings, commentsPerPostLimit: val});
                                                }}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-violet-500/50 outline-none transition-all"
                                            />
                                            <p className="text-[10px] text-white/20 mt-2 italic">Defines how many support accounts will reply to a new main post.</p>
                                        </div>
                                    </div>
                                </section>

                                <section className="p-8 bg-[#0A0A0B] border border-white/5 rounded-3xl space-y-6">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                                            <Shield size={20} />
                                        </div>
                                        <h3 className="text-lg font-semibold text-white">Account Safety</h3>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                                            <div>
                                                <div className="text-sm font-semibold text-white">Auto Sync Metadata</div>
                                                <div className="text-[10px] text-white/40">Automatically update bio/photo from X periodically.</div>
                                            </div>
                                            <button 
                                                onClick={() => setGlobalSettings({...globalSettings, autoSyncMetadata: !globalSettings.autoSyncMetadata})}
                                                className={`w-12 h-6 rounded-full relative transition-all ${globalSettings.autoSyncMetadata ? 'bg-emerald-500' : 'bg-white/10'}`}
                                            >
                                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${globalSettings.autoSyncMetadata ? 'right-1' : 'left-1'}`} />
                                            </button>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </div>
                    )}

                    {viewMode === 'STATS' && (
                        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="max-w-[1400px] mx-auto space-y-6">
                            <div className="flex items-center gap-3 mb-8">
                                <BarChart3 className="text-violet-400" />
                                <h3 className="text-xl font-medium text-white">Statistics Dashboard</h3>
                            </div>

                            {!activeAccount ? (
                                <div className="bg-[#0A0A0B] border border-white/5 rounded-2xl p-12 text-center">
                                    <p className="text-white/40">Select an account to view statistics</p>
                                </div>
                            ) : !stats ? (
                                <div className="bg-[#0A0A0B] border border-white/5 rounded-2xl p-12 text-center">
                                    <BarChart3 size={48} className="mx-auto text-white/20 mb-4" />
                                    <p className="text-white/40">Loading statistics...</p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <StatCard icon={<Send size={20} />} title="Tweets Posted" value={stats.totals.tweetsPosted.toString()} color="text-violet-400" />
                                        <StatCard icon={<Heart size={20} />} title="Likes Received" value={stats.totals.likesReceived.toString()} color="text-pink-400" />
                                        <StatCard icon={<Repeat size={20} />} title="Retweets" value={stats.totals.retweetsReceived.toString()} color="text-green-400" />
                                        <StatCard icon={<MessageCircle size={20} />} title="Replies" value={stats.totals.repliesReceived.toString()} color="text-blue-400" />
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <StatCard icon={<Eye size={20} />} title="Profile Views" value={stats.totals.profileViews.toString()} color="text-purple-400" />
                                        <StatCard icon={<UserPlus size={20} />} title="Followers" value={stats.totals.followersCount.toString()} color="text-cyan-400" />
                                        <StatCard icon={<TrendingUp size={20} />} title="Following" value={stats.totals.followingCount.toString()} color="text-orange-400" />
                                        <StatCard icon={<Activity size={20} />} title="Engagement Rate" value={stats.totals.likesReceived > 0 ? ((stats.totals.likesReceived + stats.totals.retweetsReceived + stats.totals.repliesReceived) / (stats.totals.tweetsPosted || 1) * 100).toFixed(1) + '%' : '0%'} color="text-emerald-400" />
                                    </div>

                                    <div className="bg-[#0A0A0B] border border-white/5 rounded-2xl overflow-hidden">
                                        <div className="px-6 py-4 border-b border-white/5">
                                            <h4 className="text-sm font-medium text-white/70">Daily Breakdown (Last {stats.stats.length} days)</h4>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead className="text-xs uppercase text-white/30 bg-white/[0.02]">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left">Date</th>
                                                        <th className="px-4 py-3 text-center">Posted</th>
                                                        <th className="px-4 py-3 text-center">Likes ↑</th>
                                                        <th className="px-4 py-3 text-center">Likes ↓</th>
                                                        <th className="px-4 py-3 text-center">RTs ↑</th>
                                                        <th className="px-4 py-3 text-center">RTs ↓</th>
                                                        <th className="px-4 py-3 text-center">Follows</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/5">
                                                    {stats.stats.slice(-10).reverse().map((stat: any, idx: number) => (
                                                        <tr key={idx} className="hover:bg-white/[0.02]">
                                                            <td className="px-4 py-3 text-white/60">{new Date(stat.date).toLocaleDateString()}</td>
                                                            <td className="px-4 py-3 text-center text-white/80">{stat.tweetsPosted}</td>
                                                            <td className="px-4 py-3 text-center text-pink-400">{stat.likesGiven}</td>
                                                            <td className="px-4 py-3 text-center text-violet-400">{stat.likesReceived}</td>
                                                            <td className="px-4 py-3 text-center text-green-400">{stat.retweetsGiven}</td>
                                                            <td className="px-4 py-3 text-center text-emerald-400">{stat.retweetsReceived}</td>
                                                            <td className="px-4 py-3 text-center text-cyan-400">{stat.followsGiven}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    )}
                </div>
            </main>

            <AnimatePresence>
                {showAddModal && (
                    <motion.div 
                        key="modal-wrapper"
                        className="fixed inset-0 z-[100] flex items-start justify-center p-6 bg-black/60 backdrop-blur-md overflow-y-auto"
                    >
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0"
                            onClick={() => setShowAddModal(false)}
                        />
                        <motion.form
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            onSubmit={handleAddAccount}
                            className="w-full max-w-2xl bg-[#0f0f11] border border-white/20 rounded-[40px] p-10 relative shadow-[0_0_80px_rgba(0,0,0,0.8)] z-10 my-auto overflow-y-auto max-h-[95vh]"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 rounded-3xl pointer-events-none" />
                            
                            <button type="button" onClick={() => setShowAddModal(false)} className="absolute top-6 right-6 p-2 bg-white/5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors">
                                <X size={16} />
                            </button>
                            
                            <h3 className="text-2xl font-semibold mb-2">
                                {platform === 'TWITTER' ? 'Add Twitter Account' : 'Deploy Instance'}
                            </h3>
                            <p className="text-sm text-white/40 mb-8">
                                {platform === 'TWITTER' 
                                    ? 'Connectez un compte Twitter avec les cookies d\'authentification.' 
                                    : 'Link a new Instagram account to the orchestration network.'}
                            </p>
                            
                            <div className="space-y-5">
                                <div className="grid grid-cols-2 gap-4">
                                    <Input label="Username" icon={<Users size={16}/>} value={newAcc.username} onChange={(v: string) => setNewAcc({ ...newAcc, username: v })} />
                                    <Input label="Password" type="password" value={newAcc.password} onChange={(v: string) => setNewAcc({ ...newAcc, password: v })} />
                                </div>

                                {platform === 'TWITTER' && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
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

                                            <div className="space-y-1.5">
                                                <label className="text-[10px] uppercase font-semibold tracking-widest text-white/40 ml-1">Assign to Group</label>
                                                <div className="relative">
                                                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"><FolderTree size={16} /></div>
                                                    <select 
                                                        value={newAcc.groupId || ''} 
                                                        onChange={(e) => setNewAcc({...newAcc, groupId: e.target.value})}
                                                        className="w-full bg-black/40 border border-white/10 focus:border-violet-500/50 outline-none pl-10 pr-4 py-3 rounded-xl text-sm transition-all text-white/90 focus:bg-white/[0.02] appearance-none"
                                                    >
                                                        <option value="">No Group (Global)</option>
                                                        {groups.map(g => (
                                                            <option key={g.id} value={g.id}>{g.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>


                                        <div className="p-4 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 rounded-2xl space-y-4">
                                            <div className="flex items-start justify-between mb-2">
                                                <h4 className="text-sm font-semibold text-blue-400">🍪 Cookie Authentication</h4>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowTokenGuide(true)}
                                                    className="p-2 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg transition-colors shrink-0"
                                                    title="Comment extraire les cookies?"
                                                >
                                                    <HelpCircle size={18} className="text-blue-400" />
                                                </button>
                                            </div>
                                            <div className="space-y-3">
                                                <div className="flex gap-2 p-1 bg-white/5 rounded-lg mb-2">
                                                    <button 
                                                        type="button"
                                                        onClick={() => setTwitterCookies('')}
                                                        className={`flex-1 py-1.5 text-[10px] uppercase font-bold rounded-md transition-all ${!twitterCookies.startsWith('[') ? 'bg-blue-600 text-white' : 'text-white/40 hover:text-white/60'}`}
                                                    >
                                                        Mode Simplifié
                                                    </button>
                                                    <button 
                                                        type="button"
                                                        onClick={() => { if(!twitterCookies.startsWith('[')) setTwitterCookies('[]'); }}
                                                        className={`flex-1 py-1.5 text-[10px] uppercase font-bold rounded-md transition-all ${twitterCookies.startsWith('[') ? 'bg-blue-600 text-white' : 'text-white/40 hover:text-white/60'}`}
                                                    >
                                                        Mode Expert (JSON Array)
                                                    </button>
                                                </div>

                                                {!twitterCookies.startsWith('[') ? (
                                                    <div className="space-y-4">
                                                        <div>
                                                            <label className="text-[11px] font-medium text-blue-300 mb-1 block">
                                                                auth_token <span className="text-red-400">*</span>
                                                            </label>
                                                            <input 
                                                                type="text"
                                                                value={twitterCookies}
                                                                onChange={(e) => setTwitterCookies(e.target.value)}
                                                                placeholder="8bbfbb5f4b0fe3ab..."
                                                                className="w-full bg-black/40 border border-white/10 focus:border-blue-500/50 outline-none px-4 py-3 rounded-xl text-sm text-white/90 focus:bg-white/[0.02] transition-all"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[11px] font-medium text-blue-300 mb-1 block">
                                                                ct0 (Requis pour poster) <span className="text-red-400">*</span>
                                                            </label>
                                                            <input 
                                                                type="text"
                                                                value={twitterCt0}
                                                                onChange={(e) => setTwitterCt0(e.target.value)}
                                                                placeholder="c54f5c857297f53e..."
                                                                className="w-full bg-black/40 border border-white/10 focus:border-blue-500/50 outline-none px-4 py-3 rounded-xl text-sm text-white/90 focus:bg-white/[0.02] transition-all"
                                                            />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <label className="text-[11px] font-medium text-blue-300 mb-1 block">
                                                            JSON Array <span className="text-red-400">*</span>
                                                        </label>
                                                        <textarea
                                                            value={twitterCookies}
                                                            onChange={(e) => setTwitterCookies(e.target.value)}
                                                            placeholder='[{"name": "auth_token", "value": "..."}, ...]'
                                                            className="w-full bg-black/40 border border-white/10 focus:border-blue-500/50 outline-none px-4 py-3 rounded-xl text-sm text-white/90 focus:bg-white/[0.02] transition-all min-h-[120px]"
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            <div className="p-3 bg-blue-900/20 border border-blue-500/20 rounded-lg">
                                                <p className="text-[10px] text-blue-300">
                                                    💡 <strong>Requis :</strong> auth_token et ct0 pour swarmer.
                                                </p>
                                            </div>
                                        </div>
                                    </>
                                )}
                                
                                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-4">
                                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/50">
                                        <Server size={14} /> Network Configuration (Proxy)
                                    </div>
                                    <p className="text-[11px] text-white/35 leading-relaxed">
                                        HTTP (ex. port 8011) ou SOCKS5 (ex. port 5011). Tu peux coller <span className="font-mono text-white/50">host:port</span> dans le champ Host — il sera séparé automatiquement.
                                    </p>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] uppercase font-semibold tracking-widest text-white/40 ml-1">Type de proxy</label>
                                        <select
                                            value={newAcc.proxyProtocol}
                                            onChange={(e) => setNewAcc({ ...newAcc, proxyProtocol: e.target.value as 'http' | 'socks5' })}
                                            className="w-full bg-black/40 border border-white/10 focus:border-violet-500/50 outline-none px-4 py-3 rounded-xl text-sm text-white/90 appearance-none"
                                        >
                                            <option value="http">HTTP / HTTPS (Playwright: http://)</option>
                                            <option value="socks5">SOCKS5 (Playwright: socks5://)</option>
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="col-span-2">
                                            <Input
                                                label="Proxy Host"
                                                value={newAcc.proxyHost}
                                                onChange={(v: string) => setNewAcc({ ...newAcc, proxyHost: v })}
                                                onBlur={() => {
                                                    setNewAcc((prev) => {
                                                        const p = parseProxyHostPortInput(prev.proxyHost);
                                                        return p ? { ...prev, proxyHost: p.host, proxyPort: p.port } : prev;
                                                    });
                                                }}
                                                placeholder="chiproxy4.proxydns.tech ou host:port"
                                            />
                                        </div>
                                        <Input label="Port" value={newAcc.proxyPort} onChange={(v: string) => setNewAcc({ ...newAcc, proxyPort: v })} placeholder="8011" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <Input label="Proxy Username (Optional)" value={newAcc.proxyUsername} onChange={(v: string) => setNewAcc({ ...newAcc, proxyUsername: v })} placeholder="user123" />
                                        <Input label="Proxy Password (Optional)" type="password" value={newAcc.proxyPassword} onChange={(v: string) => setNewAcc({ ...newAcc, proxyPassword: v })} placeholder="pass123" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] uppercase font-semibold tracking-widest text-white/40 ml-1">Rotation IP (GET, optionnel)</label>
                                        <input
                                            type="text"
                                            value={newAcc.proxyRotateIpUrl}
                                            onChange={(e) => setNewAcc({ ...newAcc, proxyRotateIpUrl: e.target.value })}
                                            placeholder="https://rotateip.../change-ip?license=..."
                                            className="w-full bg-black/40 border border-white/10 focus:border-violet-500/50 outline-none px-4 py-3 rounded-xl text-xs text-white/90 placeholder:text-white/25"
                                        />
                                        <p className="text-[10px] text-white/30">Appelée avant chaque session si un proxy est défini. Sinon, variable worker <span className="font-mono">PROXY_ROTATE_URL</span>.</p>
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

            <AnimatePresence>
                {showEditModal && editingAccount && (
                    <motion.div 
                        key="edit-modal-wrapper"
                        className="fixed inset-0 z-[100] flex items-start justify-center p-6 bg-black/60 backdrop-blur-md overflow-y-auto"
                    >
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0"
                            onClick={() => setShowEditModal(false)}
                        />
                        <motion.form
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            onSubmit={handleUpdateAccount}
                            className="w-full max-w-2xl bg-[#0f0f11] border border-white/20 rounded-[40px] p-10 relative shadow-[0_0_80px_rgba(0,0,0,0.8)] z-10 my-auto overflow-y-auto max-h-[95vh]"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-violet-500/5 rounded-3xl pointer-events-none" />
                            
                            <button type="button" onClick={() => setShowEditModal(false)} className="absolute top-6 right-6 p-2 bg-white/5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors">
                                <X size={16} />
                            </button>
                            
                            <h3 className="text-2xl font-semibold mb-2">
                                Edit {editingAccount.username}
                            </h3>
                            <p className="text-sm text-white/40 mb-8">
                                Mettre à jour les paramètres de connexion ou le proxy.
                            </p>
                            
                            <div className="space-y-5">
                                <div className="grid grid-cols-2 gap-4">
                                    <Input label="Username" icon={<Users size={16}/>} value={newAcc.username} onChange={(v: string) => setNewAcc({ ...newAcc, username: v })} />
                                    <Input label="Password" type="password" value={newAcc.password} onChange={(v: string) => setNewAcc({ ...newAcc, password: v })} />
                                </div>

                                {platform === 'TWITTER' && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
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

                                            <div className="space-y-1.5">
                                                <label className="text-[10px] uppercase font-semibold tracking-widest text-white/40 ml-1">Assign to Group</label>
                                                <div className="relative">
                                                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"><FolderTree size={16} /></div>
                                                    <select 
                                                        value={newAcc.groupId || ''} 
                                                        onChange={(e) => setNewAcc({...newAcc, groupId: e.target.value})}
                                                        className="w-full bg-black/40 border border-white/10 focus:border-violet-500/50 outline-none pl-10 pr-4 py-3 rounded-xl text-sm transition-all text-white/90 focus:bg-white/[0.02] appearance-none"
                                                    >
                                                        <option value="">No Group (Global)</option>
                                                        {groups.map(g => (
                                                            <option key={g.id} value={g.id}>{g.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>


                                        <div className="p-4 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 rounded-2xl space-y-4">
                                            <div className="flex items-start justify-between mb-2">
                                                <h4 className="text-sm font-semibold text-blue-400">🍪 Update cookies</h4>
                                                <p className="text-[10px] text-blue-400/60">Laissez vide si inchangé</p>
                                            </div>
                                            
                                            <div className="space-y-3">
                                                <div className="flex gap-2 p-1 bg-white/5 rounded-lg mb-2">
                                                    <button 
                                                        type="button"
                                                        onClick={() => setTwitterCookies('')}
                                                        className={`flex-1 py-1.5 text-[10px] uppercase font-bold rounded-md transition-all ${!twitterCookies.startsWith('[') ? 'bg-blue-600 text-white' : 'text-white/40 hover:text-white/60'}`}
                                                    >
                                                        Mode Simplifié
                                                    </button>
                                                    <button 
                                                        type="button"
                                                        onClick={() => { if(!twitterCookies.startsWith('[')) setTwitterCookies('[]'); }}
                                                        className={`flex-1 py-1.5 text-[10px] uppercase font-bold rounded-md transition-all ${twitterCookies.startsWith('[') ? 'bg-blue-600 text-white' : 'text-white/40 hover:text-white/60'}`}
                                                    >
                                                        Mode Expert (JSON Array)
                                                    </button>
                                                </div>

                                                {!twitterCookies.startsWith('[') ? (
                                                    <div className="space-y-4">
                                                        <div>
                                                            <label className="text-[11px] font-medium text-blue-300 mb-1 block">
                                                                auth_token <span className="text-red-400">*</span>
                                                            </label>
                                                            <input 
                                                                type="text"
                                                                value={twitterCookies}
                                                                onChange={(e) => setTwitterCookies(e.target.value)}
                                                                placeholder="8bbfbb5f4b0fe3ab..."
                                                                className="w-full bg-black/40 border border-white/10 focus:border-blue-500/50 outline-none px-4 py-3 rounded-xl text-sm text-white/90 focus:bg-white/[0.02] transition-all"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[11px] font-medium text-blue-300 mb-1 block">
                                                                ct0 (Requis pour poster) <span className="text-red-400">*</span>
                                                            </label>
                                                            <input 
                                                                type="text"
                                                                value={twitterCt0}
                                                                onChange={(e) => setTwitterCt0(e.target.value)}
                                                                placeholder="c54f5c857297f53e..."
                                                                className="w-full bg-black/40 border border-white/10 focus:border-blue-500/50 outline-none px-4 py-3 rounded-xl text-sm text-white/90 focus:bg-white/[0.02] transition-all"
                                                            />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <label className="text-[11px] font-medium text-blue-300 mb-1 block">
                                                            JSON Array <span className="text-red-400">*</span>
                                                        </label>
                                                        <textarea
                                                            value={twitterCookies}
                                                            onChange={(e) => setTwitterCookies(e.target.value)}
                                                            placeholder='[{"name": "auth_token", "value": "..."}, ...]'
                                                            className="w-full bg-black/40 border border-white/10 focus:border-blue-500/50 outline-none px-4 py-3 rounded-xl text-sm text-white/90 focus:bg-white/[0.02] transition-all min-h-[120px]"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                                
                                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-4">
                                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/50">
                                        <Server size={14} /> Network Configuration (Proxy)
                                    </div>
                                    <p className="text-[11px] text-white/35 leading-relaxed">
                                        HTTP ou SOCKS5. Colle <span className="font-mono text-white/50">host:port</span> dans Host pour séparer auto.
                                    </p>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] uppercase font-semibold tracking-widest text-white/40 ml-1">Type de proxy</label>
                                        <select
                                            value={newAcc.proxyProtocol}
                                            onChange={(e) => setNewAcc({ ...newAcc, proxyProtocol: e.target.value as 'http' | 'socks5' })}
                                            className="w-full bg-black/40 border border-white/10 focus:border-violet-500/50 outline-none px-4 py-3 rounded-xl text-sm text-white/90 appearance-none"
                                        >
                                            <option value="http">HTTP / HTTPS</option>
                                            <option value="socks5">SOCKS5</option>
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="col-span-2">
                                            <Input
                                                label="Proxy Host"
                                                value={newAcc.proxyHost}
                                                onChange={(v: string) => setNewAcc({ ...newAcc, proxyHost: v })}
                                                onBlur={() => {
                                                    setNewAcc((prev) => {
                                                        const p = parseProxyHostPortInput(prev.proxyHost);
                                                        return p ? { ...prev, proxyHost: p.host, proxyPort: p.port } : prev;
                                                    });
                                                }}
                                                placeholder="chiproxy4.proxydns.tech ou host:port"
                                            />
                                        </div>
                                        <Input label="Port" value={newAcc.proxyPort} onChange={(v: string) => setNewAcc({ ...newAcc, proxyPort: v })} placeholder="8011" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <Input label="Proxy Username" value={newAcc.proxyUsername} onChange={(v: string) => setNewAcc({ ...newAcc, proxyUsername: v })} placeholder="user123" />
                                        <Input label="Proxy Password" type="password" value={newAcc.proxyPassword} onChange={(v: string) => setNewAcc({ ...newAcc, proxyPassword: v })} placeholder="pass123" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] uppercase font-semibold tracking-widest text-white/40 ml-1">Rotation IP (GET, optionnel)</label>
                                        <input
                                            type="text"
                                            value={newAcc.proxyRotateIpUrl}
                                            onChange={(e) => setNewAcc({ ...newAcc, proxyRotateIpUrl: e.target.value })}
                                            placeholder="https://rotateip.../change-ip?license=..."
                                            className="w-full bg-black/40 border border-white/10 focus:border-violet-500/50 outline-none px-4 py-3 rounded-xl text-xs text-white/90 placeholder:text-white/25"
                                        />
                                    </div>
                                </div>

                                <motion.button 
                                    whileHover={{ scale: 1.01 }}
                                    whileTap={{ scale: 0.98 }}
                                    type="submit" 
                                    className="w-full bg-blue-500 text-white py-4 rounded-xl font-semibold mt-4 hover:bg-blue-600 transition-colors shadow-lg flex items-center justify-center gap-2"
                                >
                                    Sauvegarder les modifications
                                </motion.button>
                            </div>
                        </motion.form>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Launch Campaign Modal */}
            <AnimatePresence>
                {showLaunchModal && selectedLaunchCampaign && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                        onClick={() => setShowLaunchModal(false)}
                    >
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="relative bg-[#0f0f11] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                                <Play className="text-emerald-400" /> Paramètres de Lancement
                            </h2>
                            <p className="text-sm text-white/50 mb-6">
                                Choisissez la fréquence à laquelle vos bots vont publier les posts de cette campagne.
                            </p>

                            <div className="space-y-6">
                                <div>
                                    <label className="block text-xs uppercase tracking-wider font-semibold text-white/40 mb-2">Fréquence de publication</label>
                                    <div className="flex gap-4">
                                        <input 
                                            type="number" 
                                            min="1"
                                            value={launchInterval.value}
                                            onChange={e => setLaunchInterval(prev => ({...prev, value: parseInt(e.target.value)}))}
                                            className="w-1/3 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500"
                                        />
                                        <select 
                                            value={launchInterval.unit}
                                            onChange={e => setLaunchInterval(prev => ({...prev, unit: e.target.value}))}
                                            className="w-2/3 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500 appearance-none"
                                        >
                                            <option value="MINUTES">Minutes</option>
                                            <option value="HOURS">Heures</option>
                                        </select>
                                    </div>
                                </div>
                                
                                <div className="flex gap-4 pt-4 border-t border-white/10">
                                    <button
                                        onClick={() => setShowLaunchModal(false)}
                                        className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-medium transition-colors"
                                    >
                                        Annuler
                                    </button>
                                    <button
                                        onClick={async () => {
                                            try {
                                                const payload = {
                                                    isActive: true,
                                                    intervalValue: launchInterval.value,
                                                    intervalUnit: launchInterval.unit
                                                };
                                                await axios.post(`${API_BASE}/campaigns/${selectedLaunchCampaign}/toggle`, payload, { headers: { 'Authorization': `Bearer ${token}` }});
                                                setShowLaunchModal(false);
                                                fetchCampaigns();
                                                fetchAccounts(platform);
                                                alert("✅ Campagne lancée avec succès ! Les bots s'activent.");
                                            } catch (err) {
                                                console.error(err);
                                                alert('❌ Erreur lors du lancement');
                                            }
                                        }}
                                        className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold transition-colors"
                                    >
                                        Confirmer & Lancer
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isCreatingCampaign && (
                    <motion.div 
                        key="campaign-modal-wrapper"
                        className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0"
                            onClick={() => setIsCreatingCampaign(false)}
                        />
                        <motion.form
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            onSubmit={(e) => { e.preventDefault(); createCampaign(); }}
                            className="w-full max-w-xl bg-[#0f0f11] border border-white/20 rounded-[40px] p-10 relative shadow-[0_0_80px_rgba(0,0,0,0.8)] z-10"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-3xl pointer-events-none" />
                            
                            <button type="button" onClick={() => setIsCreatingCampaign(false)} className="absolute top-6 right-6 p-2 bg-white/5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors">
                                <X size={16} />
                            </button>
                            
                            <h3 className="text-2xl font-semibold mb-2">
                                Nouvelle Campagne
                            </h3>
                            <p className="text-sm text-white/40 mb-8">
                                Créer une nouvelle campagne et lui assigner un groupe.
                            </p>
                            
                            <div className="space-y-5">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] uppercase font-semibold tracking-widest text-white/40 ml-1">Type de campagne</label>
                                    <input type="hidden" value="POST" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] uppercase font-semibold tracking-widest text-white/40 ml-1">Nom de la campagne</label>
                                    <div className="relative">
                                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"><Megaphone size={16} /></div>
                                        <input 
                                            value={newCampaignName} 
                                            onChange={(e) => setNewCampaignName(e.target.value)}
                                            placeholder="Ex: Lancement Roberta"
                                            className="w-full bg-black/40 border border-white/10 focus:border-violet-500/50 outline-none pl-10 pr-4 py-3 rounded-xl text-sm transition-all text-white/90 focus:bg-white/[0.02]"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] uppercase font-semibold tracking-widest text-white/40 ml-1">Assign to Group</label>
                                    <div className="relative">
                                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"><FolderTree size={16} /></div>
                                        <select 
                                            value={newCampaignGroupId} 
                                            onChange={(e) => setNewCampaignGroupId(e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 focus:border-violet-500/50 outline-none pl-10 pr-4 py-3 rounded-xl text-sm transition-all text-white/90 focus:bg-white/[0.02] appearance-none"
                                        >
                                            <option value="">No Group (Global)</option>
                                            {groups.map(g => (
                                                <option key={g.id} value={g.id}>{g.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] uppercase font-semibold tracking-widest text-white/40 ml-1">Liens des Communautés (Un par ligne)</label>
                                    <textarea 
                                        placeholder="https://x.com/i/communities/..."
                                        value={newCampaignCommunities}
                                        onChange={(e) => setNewCampaignCommunities(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 focus:border-violet-500/50 outline-none p-4 rounded-xl text-sm transition-all text-white/90 focus:bg-white/[0.02] h-24"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] uppercase font-semibold tracking-widest text-white/40 ml-1">Posts / Compte</label>
                                        <input 
                                            type="number"
                                            value={newCampaignPostsPerAcc}
                                            onChange={(e) => setNewCampaignPostsPerAcc(parseInt(e.target.value) || 0)}
                                            className="w-full bg-black/40 border border-white/10 focus:border-violet-500/50 outline-none px-4 py-3 rounded-xl text-sm transition-all text-white/90 focus:bg-white/[0.02]"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] uppercase font-semibold tracking-widest text-white/40 ml-1">Comments / Post</label>
                                        <input 
                                            type="number"
                                            value={newCampaignCommentsPerPost}
                                            onChange={(e) => setNewCampaignCommentsPerPost(parseInt(e.target.value) || 0)}
                                            className="w-full bg-black/40 border border-white/10 focus:border-violet-500/50 outline-none px-4 py-3 rounded-xl text-sm transition-all text-white/90 focus:bg-white/[0.02]"
                                        />
                                    </div>
                                </div>
                                
                                <motion.button 
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    type="submit" 
                                    className="w-full bg-blue-600 text-white py-4 rounded-xl font-semibold mt-4 hover:bg-blue-500 transition-colors shadow-lg flex items-center justify-center gap-2"
                                >
                                    <Plus size={18} /> Créer la campagne
                                </motion.button>
                            </div>
                        </motion.form>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showEditCampaignModal && (
                    <motion.div
                        className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0"
                            onClick={() => setShowEditCampaignModal(false)}
                        />
                        <motion.form
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            onSubmit={saveEditedCampaign}
                            className="w-full max-w-xl bg-[#0f0f11] border border-white/20 rounded-[40px] p-10 relative shadow-[0_0_80px_rgba(0,0,0,0.8)] z-10 max-h-[90vh] overflow-y-auto"
                        >
                            <button
                                type="button"
                                onClick={() => setShowEditCampaignModal(false)}
                                className="absolute top-6 right-6 p-2 bg-white/5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors"
                            >
                                <X size={16} />
                            </button>
                            <h3 className="text-2xl font-semibold mb-2">Modifier la campagne</h3>
                            <p className="text-sm text-white/40 mb-8">Nom, groupe, communautés et limites.</p>
                            <div className="space-y-5">
                                <input type="hidden" value="POST" />
                                <div className="space-y-1.5">
                                    <label className="text-[10px] uppercase font-semibold tracking-widest text-white/40 ml-1">Nom</label>
                                    <input
                                        value={editCampaignForm.name}
                                        onChange={(e) => setEditCampaignForm({ ...editCampaignForm, name: e.target.value })}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] uppercase font-semibold tracking-widest text-white/40 ml-1">Description</label>
                                    <textarea
                                        value={editCampaignForm.description}
                                        onChange={(e) => setEditCampaignForm({ ...editCampaignForm, description: e.target.value })}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-white min-h-[72px]"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] uppercase font-semibold tracking-widest text-white/40 ml-1">Groupe</label>
                                    <select
                                        value={editCampaignForm.groupId}
                                        onChange={(e) => setEditCampaignForm({ ...editCampaignForm, groupId: e.target.value })}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white appearance-none"
                                    >
                                        <option value="">Global (aucun)</option>
                                        {groups.map((g) => (
                                            <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] uppercase font-semibold tracking-widest text-white/40 ml-1">Communautés (une URL ou ID par ligne)</label>
                                    <textarea
                                        placeholder="https://x.com/i/communities/1868017631049265441"
                                        value={editCampaignForm.targetCommunities}
                                        onChange={(e) => setEditCampaignForm({ ...editCampaignForm, targetCommunities: e.target.value })}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-white h-28"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] uppercase font-semibold tracking-widest text-white/40 ml-1">Posts / compte</label>
                                        <input
                                            type="number"
                                            min={1}
                                            value={editCampaignForm.postsPerAccount}
                                            onChange={(e) => setEditCampaignForm({ ...editCampaignForm, postsPerAccount: parseInt(e.target.value, 10) || 1 })}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] uppercase font-semibold tracking-widest text-white/40 ml-1">Commentaires / post</label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={editCampaignForm.commentsPerPost}
                                            onChange={(e) => setEditCampaignForm({ ...editCampaignForm, commentsPerPost: parseInt(e.target.value, 10) || 0 })}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white"
                                        />
                                    </div>
                                </div>
                                <button
                                    type="submit"
                                    className="w-full bg-amber-600 hover:bg-amber-500 text-white py-4 rounded-xl font-semibold mt-2 flex items-center justify-center gap-2"
                                >
                                    <Save size={18} /> Enregistrer
                                </button>
                            </div>
                        </motion.form>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showPostModal && (
                    <motion.div 
                        key="post-modal-wrapper"
                        className="fixed inset-0 z-[105] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0"
                            onClick={() => setShowPostModal(false)}
                        />
                        <motion.form
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            onSubmit={handleCreatePost}
                            className="w-full max-w-lg bg-[#0f0f11] border border-white/10 rounded-3xl p-8 relative shadow-[0_0_50px_rgba(0,0,0,0.5)] z-10"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 rounded-3xl pointer-events-none" />
                            
                            <button type="button" onClick={() => setShowPostModal(false)} className="absolute top-6 right-6 p-2 bg-white/5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors">
                                <X size={16} />
                            </button>

                            <div className="relative">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-3 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl shadow-lg">
                                        <Send size={24} className="text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-semibold text-white">Create New Post</h3>
                                        <p className="text-xs text-white/40">Schedule a tweet for later or post now</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-medium text-white/60 mb-2">Content *</label>
                                        <textarea
                                            value={newPost.content}
                                            onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
                                            rows={4}
                                            placeholder="What's happening?"
                                            required
                                        />
                                        <p className="text-[10px] text-white/30 mt-1">{newPost.content.length}/280 characters</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium text-white/60 mb-2">Date (Optional)</label>
                                            <input
                                                type="date"
                                                value={newPost.scheduleDate}
                                                onChange={(e) => setNewPost({ ...newPost, scheduleDate: e.target.value })}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-white/60 mb-2">Time (Optional)</label>
                                            <input
                                                type="time"
                                                value={newPost.scheduleTime}
                                                onChange={(e) => setNewPost({ ...newPost, scheduleTime: e.target.value })}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                                            />
                                        </div>
                                    </div>

                                    <motion.button 
                                        whileHover={{ scale: 1.01 }}
                                        whileTap={{ scale: 0.98 }}
                                        type="submit" 
                                        className="w-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white py-4 rounded-xl font-semibold mt-4 hover:from-violet-600 hover:to-fuchsia-600 transition-all shadow-lg flex items-center justify-center gap-2"
                                    >
                                        <Send size={18} />
                                        {newPost.scheduleDate && newPost.scheduleTime ? 'Schedule Post' : 'Post Now'}
                                    </motion.button>
                                </div>
                            </div>
                        </motion.form>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showTokenGuide && (
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[110] p-4"
                        onClick={() => setShowTokenGuide(false)}
                    >
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }} 
                            animate={{ scale: 1, opacity: 1 }} 
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-gradient-to-b from-[#141414] to-[#0a0a0a] border border-white/10 rounded-3xl shadow-2xl"
                        >
                            <div className="sticky top-0 bg-[#141414]/95 backdrop-blur-xl border-b border-white/10 p-6 z-10">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-3 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl shadow-lg">
                                            <Cookie size={24} className="text-white" />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-bold text-white">Récupérer votre Auth Token Twitter</h2>
                                            <p className="text-sm text-white/50">Guide étape par étape en 2 minutes</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setShowTokenGuide(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                                        <X size={24} className="text-white/70" />
                                    </button>
                                </div>
                            </div>

                            <div className="p-6 space-y-6">
                                <div className="p-5 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-2xl">
                                    <div className="flex items-start gap-4">
                                        <div className="shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">1</div>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-blue-400 mb-3 flex items-center gap-2">
                                                <ExternalLink size={16} />
                                                Connectez-vous sur X.com
                                            </h3>
                                            <ol className="space-y-2 text-sm text-white/80">
                                                <li className="flex items-start gap-2">
                                                    <span className="text-blue-400 mt-0.5">•</span>
                                                    <span>Ouvrez un <strong>nouvel onglet</strong> dans votre navigateur</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-blue-400 mt-0.5">•</span>
                                                    <span>Allez sur <a href="https://x.com" target="_blank" className="text-blue-400 hover:underline">https://x.com</a></span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-blue-400 mt-0.5">•</span>
                                                    <span><strong>Connectez-vous</strong> avec votre email et mot de passe</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-blue-400 mt-0.5">•</span>
                                                    <span>Vérifiez que vous voyez votre <strong>timeline</strong> (vos tweets)</span>
                                                </li>
                                            </ol>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-5 bg-gradient-to-br from-violet-500/10 to-violet-600/5 border border-violet-500/20 rounded-2xl">
                                    <div className="flex items-start gap-4">
                                        <div className="shrink-0 w-8 h-8 bg-violet-500 rounded-full flex items-center justify-center text-white font-bold">2</div>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-violet-400 mb-3">Ouvrez les Outils de Développement</h3>
                                            <div className="grid grid-cols-2 gap-3 mb-4">
                                                <div className="p-3 bg-violet-500/10 rounded-xl">
                                                    <p className="text-xs text-violet-300 mb-1">Windows / Linux</p>
                                                    <p className="text-lg font-mono font-bold text-violet-400">F12</p>
                                                </div>
                                                <div className="p-3 bg-violet-500/10 rounded-xl">
                                                    <p className="text-xs text-violet-300 mb-1">Mac</p>
                                                    <p className="text-lg font-mono font-bold text-violet-400">⌘ + ⌥ + I</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-5 bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 rounded-2xl">
                                    <div className="flex items-start gap-4">
                                        <div className="shrink-0 w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold">3</div>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-purple-400 mb-3">Méthode A: Via Console (Recommandé)</h3>
                                            <ol className="space-y-2 text-sm text-white/80 mb-4">
                                                <li className="flex items-start gap-2">
                                                    <span className="text-purple-400 mt-0.5">•</span>
                                                    <span>Dans les outils de développement, cliquez sur l'onglet <strong>"Console"</strong></span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-purple-400 mt-0.5">•</span>
                                                    <span>Copiez-collez le code ci-dessous:</span>
                                                </li>
                                            </ol>
                                            <div className="relative">
                                                <pre className="p-4 bg-black/50 rounded-xl text-xs text-green-400 font-mono overflow-x-auto border border-purple-500/20">
{`document.cookie.split(';').forEach((c, i) => {
  const parts = c.trim().split('=');
  console.log(i + '. ' + parts[0] + ' = ' + parts[1]);
});

const token = document.cookie
  .split(';')
  .find(c => c.trim().startsWith('auth_token='))
  ?.split('=')[1];

console.log("✅ AUTH TOKEN:", token);`}
                                                </pre>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const code = [
                                                            "document.cookie.split(';').forEach((c, i) => {",
                                                            "  const parts = c.trim().split('=');",
                                                            "  console.log(i + '. ' + parts[0] + ' = ' + parts[1]);",
                                                            "});",
                                                            "",
                                                            "const token = document.cookie",
                                                            "  .split(';')",
                                                            "  .find(c => c.trim().startsWith('auth_token='))",
                                                            "  ?.split('=')[1];",
                                                            "",
                                                            'console.log("✅ AUTH TOKEN:", token);'
                                                        ].join('\n');
                                                        navigator.clipboard.writeText(code);
                                                    }}
                                                    className="absolute top-2 right-2 px-3 py-1 bg-purple-500 hover:bg-purple-600 rounded-lg text-xs text-white transition-colors"
                                                >
                                                    Copier
                                                </button>
                                            </div>
                                            <p className="text-xs text-white/60 mt-2">
                                                💡 Appuyez sur <strong>Entrée</strong>, puis copiez la valeur affichée après "AUTH TOKEN:"
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-5 bg-gradient-to-br from-pink-500/10 to-pink-600/5 border border-pink-500/20 rounded-2xl">
                                    <div className="flex items-start gap-4">
                                        <div className="shrink-0 w-8 h-8 bg-pink-500 rounded-full flex items-center justify-center text-white font-bold">4</div>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-pink-400 mb-3">Méthode B: Via Application (Visuel)</h3>
                                            <ol className="space-y-2 text-sm text-white/80">
                                                <li className="flex items-start gap-2">
                                                    <span className="text-pink-400 mt-0.5">•</span>
                                                    <span>Dans les outils de développement, cliquez sur l'onglet <strong>"Application"</strong></span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-pink-400 mt-0.5">•</span>
                                                    <span>À gauche, développez <strong>"Cookies"</strong></span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-pink-400 mt-0.5">•</span>
                                                    <span>Cliquez sur <strong>https://x.com</strong></span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-pink-400 mt-0.5">•</span>
                                                    <span>Cherchez la ligne avec <code className="px-2 py-0.5 bg-pink-500/20 rounded text-pink-400">auth_token</code> dans la colonne "Name"</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-pink-400 mt-0.5">•</span>
                                                    <span><strong>Copiez la valeur</strong> dans la colonne "Value"</span>
                                                </li>
                                            </ol>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-5 bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 rounded-2xl">
                                    <div className="flex items-start gap-4">
                                        <div className="shrink-0 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white font-bold">5</div>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-green-400 mb-3">Ajoutez au Bot</h3>
                                            <ol className="space-y-2 text-sm text-white/80">
                                                <li className="flex items-start gap-2">
                                                    <span className="text-green-400 mt-0.5">•</span>
                                                    <span>Retournez sur ce dashboard</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-green-400 mt-0.5">•</span>
                                                    <span>Collez le token dans le champ <strong>"Auth Token"</strong></span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-green-400 mt-0.5">•</span>
                                                    <span>Cliquez <strong>"Initialize Node"</strong></span>
                                                </li>
                                            </ol>
                                            <div className="mt-3 p-3 bg-green-500/10 rounded-xl">
                                                <p className="text-sm text-green-400">
                                                    ✅ <strong>C'est fini!</strong> Le bot utilisera directement votre session!
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                                    <p className="text-xs text-amber-300 mb-2">
                                        ⚠️ <strong>Important:</strong>
                                    </p>
                                    <ul className="space-y-1 text-xs text-amber-300/80">
                                        <li>• Le auth_token dure <strong>plusieurs mois</strong></li>
                                        <li>• Le bot le <strong>rafraîchit automatiquement</strong> après chaque action</li>
                                        <li>• Gardez-le <strong>secret</strong> - il donne accès à votre compte</li>
                                        <li>• Si les actions échouent plus tard, récupérez un nouveau token</li>
                                    </ul>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
}

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
    return { border: 'border-white/10', bg: 'bg-white/5', dot: 'bg-white/30' };
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
                className={`p-3.5 rounded-2xl cursor-pointer transition-all duration-300 relative z-10 w-14 flex justify-center 
                ${active ? 'text-white bg-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]' : 'text-white/60 hover:text-white hover:bg-white/10 hover:scale-110'}`}
            >
                {icon}
            </div>
            {active && (
                <motion.div layoutId="sidebar-active" className="absolute left-1/2 -translate-x-1/2 w-14 top-0 bottom-0 bg-white/10 rounded-2xl -z-10 shadow-[0_0_20px_rgba(255,255,255,0.05)]" />
            )}
        </div>
    );
}

function AccountCard({ account, active, onClick, onLaunch, onEditProfile, index, platform, autoSequenceStatus, toggleAutoMode, syncMetadata }: { 
    account: Account, 
    active: boolean, 
    onClick: () => void, 
    onLaunch: (action: string, autoSequence?: boolean) => void,
    onEditProfile: () => void,
    index: number,
    platform: 'TWITTER' | 'INSTAGRAM',
    autoSequenceStatus: {[key: string]: any},
    toggleAutoMode: (id: string, current: boolean) => void,
    syncMetadata: (id: string) => void
}) {
    const statusTheme = getStatusColor(account.status || 'IDLE');
    const actionLabels: Record<string, string> = {
        follow: 'Follow Target',
        postCommunity: 'Post Captions',
        spamComments: 'Spam Comments',
        updateProfile: 'Update Profile'
    };

    const platformActions = platform === 'TWITTER' ? [
        ...(account.type === 'MAIN' ? [
            { id: 'setupProfile', label: 'Day 1: Setup Profile'},
            { id: 'follow', label: 'Day 2: Follow Targets'},
            { id: 'postCommunity', label: 'Day 3: Post Captions'},
        ] : []),
        { id: 'spamComments', label: account.type === 'SUPPORT' ? 'Day 4: Spam Comments (Support)' : 'Spam Comments'},
        { id: 'updateProfile', label: '🪪 Mettre à jour le Profil'}
    ] : [
        { id: 'follow', label: 'Follow Target'}
    ];

    const [showActions, setShowActions] = useState(false);

    // Dynamic Session Health Check
    const sessionHealth = useMemo(() => {
        if (!account.sessionCookies || !Array.isArray(account.sessionCookies)) return { status: 'MISSING', label: 'No Cookies', color: 'text-rose-400' };
        const cookies = account.sessionCookies as any[];
        const hasAuthToken = cookies.some(c => c.name === 'auth_token');
        const hasCt0 = cookies.some(c => c.name === 'ct0');
        
        if (!hasAuthToken) return { status: 'DEAD', label: 'Auth Token Missing', color: 'text-rose-500 font-bold' };
        if (!hasCt0) return { status: 'FRAGILE', label: 'ct0 Missing (Fragile)', color: 'text-amber-400' };
        if (cookies.length < 5) return { status: 'WEAK', label: 'Cookies Incomplets', color: 'text-amber-500' };
        
        return { status: 'HEALTHY', label: 'Session OK', color: 'text-emerald-400' };
    }, [account.sessionCookies]);

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={onClick} 
            className={`p-5 rounded-2xl border transition-all duration-300 cursor-pointer relative overflow-visible group flex flex-col justify-between
            ${active ? 'bg-white/[0.04] border-violet-500/50 shadow-[0_4px_30px_rgba(139,92,246,0.1)]' : 'bg-[#0A0A0B] hover:bg-white/[0.02] border-white/5'}`}
        >
            {active && <div className="absolute -top-10 -right-10 w-32 h-32 bg-violet-500/20 rounded-full blur-[40px] pointer-events-none overflow-hidden" />}

            <div className="flex items-center justify-between gap-4 mb-5 relative z-10">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${platform === 'TWITTER' ? 'from-blue-600/20 to-cyan-600/20' : 'from-violet-600/20 to-fuchsia-600/20'} flex items-center justify-center border border-white/5 group-hover:scale-105 transition-transform shrink-0 relative`}>
                    {platform === 'TWITTER' ? <Twitter size={20} className="text-blue-400" /> : <Instagram size={20} className="text-violet-300" />}
                    {account.autoMode && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center shadow-lg border-2 border-[#0A0A0B]">
                            <Zap size={8} className="text-white fill-white" />
                        </div>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-white/90 text-[15px] truncate max-w-full">@{account.username}</h4>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${statusTheme.dot}`} />
                        <span className={`text-[10px] uppercase font-mono tracking-wider ${statusTheme.dot.replace('bg-', 'text-')}`}>{account.status || 'IDLE'}</span>
                        <span className="text-white/20">•</span>
                        <span className={`text-[10px] font-medium ${sessionHealth.color}`}>{sessionHealth.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                        <button 
                            onClick={(e) => { e.stopPropagation(); toggleAutoMode(account.id, !!account.autoMode); }}
                            className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border transition-all ${
                                account.autoMode 
                                ? 'bg-blue-600 text-white border-blue-400' 
                                : 'bg-white/5 text-gray-500 border-white/10 hover:border-white/20'
                            }`}
                        >
                            {account.autoMode ? 'Auto ON' : 'Auto OFF'}
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); syncMetadata(account.id); }}
                            className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border bg-white/5 text-white/40 border-white/10 hover:bg-violet-500/20 hover:text-violet-300 hover:border-violet-500/30 transition-all flex items-center gap-1"
                            title="Synchronize Metadata"
                        >
                            <RefreshCw size={8} /> Sync
                        </button>
                    </div>
                </div>
                
                <div className="flex gap-2">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onEditProfile(); }} 
                        className="p-2.5 bg-white/5 text-white/60 rounded-xl hover:bg-blue-500/20 hover:text-blue-400 transition-all shadow-sm shrink-0 flex items-center gap-1"
                        title="Edit Profile"
                    >
                        <Edit size={16} />
                    </button>
                    
                    <div className="relative">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setShowActions(!showActions); }} 
                            className="p-2.5 bg-white/5 text-white/60 rounded-xl hover:bg-white hover:text-black transition-all shadow-sm shrink-0 flex items-center gap-1"
                            title="Run Action"
                        >
                            <Play size={16} fill="currentColor" />
                        </button>
                        
                        <AnimatePresence mode="wait">
                            {showActions && (
                                <motion.div 
                                    key={`actions-dropdown-${account.id}`}
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute right-0 top-full mt-2 w-64 bg-[#121215] border border-white/10 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-50 overflow-hidden"
                                >
                                    <div className="p-2 flex flex-col gap-1">
                                        <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-white/40 font-semibold">Select Action</div>
                                                                    
                                        {platform === 'TWITTER' && (
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onLaunch('setupProfile', true);
                                                    setShowActions(false);
                                                }}
                                                className="px-3 py-2.5 text-left text-sm font-semibold bg-gradient-to-r from-violet-600/20 to-purple-600/20 hover:from-violet-600/30 hover:to-purple-600/30 text-violet-300 border border-violet-500/30 rounded-lg transition-all flex items-center gap-2"
                                            >
                                                <span className="text-base">⚡</span>
                                                <div>
                                                    <div>Run Full Sequence</div>
                                                    <div className="text-[10px] text-violet-400/70 font-normal">All steps automatically</div>
                                                </div>
                                            </button>
                                        )}
                                                                    
                                        {platform === 'TWITTER' && (
                                            <div className="border-t border-white/5 my-1"></div>
                                        )}
                                                                    
                                        {platformActions.map(action => (
                                            <button 
                                                key={action.id}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onLaunch(action.id, false);
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
                
                {autoSequenceStatus[account.id]?.running && (
                    <div className="mt-3 p-2 bg-gradient-to-r from-violet-600/10 to-purple-600/10 border border-violet-500/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs">⚡</span>
                            <span className="text-[10px] uppercase tracking-wider text-violet-300 font-semibold">Auto Sequence</span>
                        </div>
                        <div className="text-[11px] text-white/80 mb-2">
                            Step {autoSequenceStatus[account.id].currentStep + 1}/{autoSequenceStatus[account.id].totalSteps + 1}: 
                            <span className="text-violet-300 ml-1">{actionLabels[autoSequenceStatus[account.id].currentAction] || autoSequenceStatus[account.id].currentAction}</span>
                        </div>
                        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                            <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${((autoSequenceStatus[account.id].currentStep + 1) / (autoSequenceStatus[account.id].totalSteps + 1)) * 100}%` }}
                                className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full"
                            />
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

function Input({ label, value, onChange, type = "text", icon, placeholder, onBlur }: { label: string, value: string, onChange: (v: string) => void, type?: string, icon?: any, placeholder?: string, onBlur?: () => void }) {
    return (
        <div className="space-y-1.5">
            <label className="text-xs uppercase font-bold tracking-[0.15em] text-white/60 ml-1">
                {label}
            </label>
            <div className="relative">
                {icon && <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30">{icon}</div>}
                <input
                    type={type} 
                    value={value} 
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={onBlur}
                    className={`w-full bg-black/40 border border-white/10 focus:border-violet-500/50 outline-none ${icon ? 'pl-10' : 'pl-4'} pr-4 py-3 rounded-xl text-sm transition-all text-white/90 focus:bg-white/[0.02] placeholder:text-white/20`}
                    placeholder={placeholder || `name@exemple.com`}
                />
            </div>
        </div>
    );
}
