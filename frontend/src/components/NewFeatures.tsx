'use client';
import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_URL, SOCKET_URL } from '../utils/apiConfig';
import {
    FolderTree,
    FileText,
    Bell,
    AlertTriangle,
    UserCircle,
    Target,
    Share2,
    Settings,
    Plus,
    Trash2,
    Edit,
    Play,
    CheckCircle,
    XCircle,
    Clock,
    Users,
    MessageCircle,
    Image as ImageIcon,
    Hash,
    TrendingUp,
    Eye,
    Heart,
    Repeat,
    UserPlus,
    Activity,
    BarChart3,
    Sparkles,
    Zap,
    Shield,
    AlertCircle,
    Info,
    Upload,
    X,
    Camera,
    Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell
} from 'recharts';

// Types
interface Account {
    id: string;
    username: string;
    status: string;
    profileImage?: string;
    bio?: string;
    niche?: string;
    groupId?: string;
    sessionCookies?: any;
}


interface Template {
    id: string;
    name: string;
    content: string;
    type: string;
    hashtags: string[];
    createdAt: string;
}

interface Activity {
    id: string;
    action: string;
    message: string;
    status: string;
    timestamp: string;
    account?: {
        username: string;
    };
}

interface CommentRequest {
    id: string;
    postUrl: string;
    totalComments: number;
    commentsDone: number;
    status: string;
    createdAt: string;
}

interface Notification {
    id: string;
    type: string;
    title: string;
    message: string;
    read: boolean;
    createdAt: string;
}

interface NewFeaturesProps {
    accounts: Account[];
    selectedAccount?: Account | null;
    profileForm?: {
        profileImage: string;
        bio: string;
        bannerImage: string;
        niche: string;
    };
    onProfileFormChange?: (form: any) => void;
    token?: string | null;
    onClose?: () => void;
}

export default function NewFeatures({ accounts: initialAccounts, selectedAccount: externalSelectedAccount, profileForm: externalProfileForm, onProfileFormChange, token, onClose }: NewFeaturesProps) {
    const [activeTab, setActiveTab] = useState<'templates' | 'activities' | 'comments' | 'notifications' | 'stats'>('templates');
    
    // Data states
    const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [commentRequests, setCommentRequests] = useState<CommentRequest[]>([]);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    
    // Modal states
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [showCommentModal, setShowCommentModal] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
    const [newTemplate, setNewTemplate] = useState({ name: '', content: '', type: 'post', hashtags: '' });
    const [newCommentRequest, setNewCommentRequest] = useState({ postUrl: '', totalComments: 10 });
    const [profileForm, setProfileForm] = useState({ bio: '', niche: '' });
    
    // Image upload states
    const [profileImagePreview, setProfileImagePreview] = useState<string>('');
    const [bannerImagePreview, setBannerImagePreview] = useState<string>('');
    const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
    const [bannerImageFile, setBannerImageFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    
    // Statistics states
    const [statsPeriod, setStatsPeriod] = useState<'7d' | '30d' | '90d'>('7d');
    const [statsLoading, setStatsLoading] = useState(false);
    const [activityData, setActivityData] = useState<any[]>([]);
    const [actionDistribution, setActionDistribution] = useState<any[]>([]);
    const [accountPerformance, setAccountPerformance] = useState<any[]>([]);
    const [totalStats, setTotalStats] = useState({
        totalActions: 0,
        totalLikes: 0,
        totalComments: 0,
        totalFollows: 0,
        totalPosts: 0,
        successRate: 0
    });

    // Load statistics
    const loadStatistics = async () => {
        setStatsLoading(true);
        try {
            // Fetch activities
            const activitiesRes = await fetch(`${API_URL}/activities?limit=1000`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const activities = await activitiesRes.json();

            // Process data for charts
            processActivityData(activities);
        } catch (error) {
            console.error('Error loading statistics:', error);
        } finally {
            setStatsLoading(false);
        }
    };

    const processActivityData = (activities: any[]) => {
        // Filter by period
        const now = new Date();
        const days = statsPeriod === '7d' ? 7 : statsPeriod === '30d' ? 30 : 90;
        const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

        const filteredActivities = activities.filter((a: any) => 
            new Date(a.timestamp) >= startDate
        );

        // Generate daily activity data
        const dailyData: any = {};
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
            dailyData[dateStr] = {
                date: dateStr,
                actions: 0,
                likes: 0,
                comments: 0,
                follows: 0,
                posts: 0,
                success: 0,
                failed: 0
            };
        }

        // Count actions per day
        filteredActivities.forEach((activity: any) => {
            const date = new Date(activity.timestamp);
            const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
            
            if (dailyData[dateStr]) {
                dailyData[dateStr].actions++;
                
                if (activity.action.includes('like')) dailyData[dateStr].likes++;
                else if (activity.action.includes('comment')) dailyData[dateStr].comments++;
                else if (activity.action.includes('follow')) dailyData[dateStr].follows++;
                else if (activity.action.includes('post')) dailyData[dateStr].posts++;
                
                if (activity.status === 'SUCCESS') dailyData[dateStr].success++;
                else if (activity.status === 'FAILED') dailyData[dateStr].failed++;
            }
        });

        const activityChartData = Object.values(dailyData);
        setActivityData(activityChartData);

        // Action distribution
        const actionCounts = {
            likes: filteredActivities.filter((a: any) => a.action.includes('like')).length,
            comments: filteredActivities.filter((a: any) => a.action.includes('comment')).length,
            follows: filteredActivities.filter((a: any) => a.action.includes('follow')).length,
            posts: filteredActivities.filter((a: any) => a.action.includes('post')).length,
            retweets: filteredActivities.filter((a: any) => a.action.includes('retweet')).length,
            warmup: filteredActivities.filter((a: any) => a.action.includes('warmup')).length
        };

        const distributionData = [
            { name: 'Likes', value: actionCounts.likes, color: '#ef4444' },
            { name: 'Commentaires', value: actionCounts.comments, color: '#3b82f6' },
            { name: 'Follows', value: actionCounts.follows, color: '#10b981' },
            { name: 'Posts', value: actionCounts.posts, color: '#f59e0b' },
            { name: 'Retweets', value: actionCounts.retweets, color: '#8b5cf6' },
            { name: 'Warm-up', value: actionCounts.warmup, color: '#6b7280' }
        ].filter(item => item.value > 0);

        setActionDistribution(distributionData);

        // Account performance (top accounts)
        const accountActions: any = {};
        filteredActivities.forEach((activity: any) => {
            const accountName = activity.account?.username || 'Unknown';
            if (!accountActions[accountName]) {
                accountActions[accountName] = { account: accountName, actions: 0, success: 0 };
            }
            accountActions[accountName].actions++;
            if (activity.status === 'SUCCESS') accountActions[accountName].success++;
        });

        const perfData = Object.values(accountActions)
            .sort((a: any, b: any) => b.actions - a.actions)
            .slice(0, 10);
        
        setAccountPerformance(perfData);

        // Total stats
        setTotalStats({
            totalActions: filteredActivities.length,
            totalLikes: actionCounts.likes,
            totalComments: actionCounts.comments,
            totalFollows: actionCounts.follows,
            totalPosts: actionCounts.posts,
            successRate: filteredActivities.length > 0 
                ? Math.round((filteredActivities.filter((a: any) => a.status === 'SUCCESS').length / filteredActivities.length) * 100)
                : 0
        });
    };

    // Fetch data
    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, [activeTab]);

    // Real-time notifications
    useEffect(() => {
        const socket = io(SOCKET_URL, {
            auth: { token }
        });
        
        socket.on('notification', (notification) => {
            console.log('🔔 Notification reçue:', notification);
            
            // Show browser notification if enabled
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(notification.title, {
                    body: notification.message,
                    icon: notification.urgent ? '/warning-icon.png' : '/notification-icon.png',
                    tag: notification.timestamp
                });
            }
            
            // Refresh notifications list
            fetchData();
            
            // Show toast/alert for urgent notifications
            if (notification.urgent) {
                alert(`⚠️ ${notification.title}\n${notification.message}`);
            }
        });
        
        return () => {
            socket.disconnect();
        };
    }, []);

    // Request notification permission on mount
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    // Open profile modal when external selectedAccount is provided
    useEffect(() => {
        if (externalSelectedAccount && externalProfileForm) {
            setSelectedAccount(externalSelectedAccount);
            setProfileForm(externalProfileForm);
            setShowProfileModal(true);
        }
    }, [externalSelectedAccount, externalProfileForm]);

    const fetchData = async () => {
        try {
            switch(activeTab) {
                case 'templates':
                    const templatesRes = await fetch(`${API_URL}/templates`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const templatesData = await templatesRes.json();
                    setTemplates(templatesData);
                    break;
                case 'activities':
                    const activitiesRes = await fetch(`${API_URL}/activities?limit=100`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const activitiesData = await activitiesRes.json();
                    setActivities(activitiesData);
                    break;
                case 'comments':
                    const commentsRes = await fetch(`${API_URL}/comment-requests`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const commentsData = await commentsRes.json();
                    setCommentRequests(commentsData);
                    break;
                case 'notifications':
                    const notifRes = await fetch(`${API_URL}/notifications`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const notifData = await notifRes.json();
                    setNotifications(notifData);
                    setUnreadCount(notifData.filter((n: Notification) => !n.read).length);
                    break;
                case 'stats':
                    loadStatistics();
                    break;
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    };

    // Template functions
    const createTemplate = async () => {
        const res = await fetch(`${API_URL}/templates`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                ...newTemplate,
                hashtags: newTemplate.hashtags.split(',').map(h => h.trim())
            })
        });
        if (res.ok) {
            setShowTemplateModal(false);
            setNewTemplate({ name: '', content: '', type: 'post', hashtags: '' });
            fetchData();
        }
    };

    const deleteTemplate = async (id: string) => {
        await fetch(`${API_URL}/templates/${id}`, { 
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        fetchData();
    };

    // Comment request functions
    const createCommentRequest = async () => {
        const res = await fetch(`${API_URL}/comment-requests`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                ...newCommentRequest,
                postId: 'auto',
                assignedAccounts: accounts.filter(a => a.status === 'ACTIVE').map(a => a.id)
            })
        });
        if (res.ok) {
            setShowCommentModal(false);
            setNewCommentRequest({ postUrl: '', totalComments: 10 });
            fetchData();
        }
    };

    // Profile update
    const updateProfile = async () => {
        if (!selectedAccount) return;
        
        setUploading(true);
        try {
            let profileImageUrl = profileImagePreview;
            let bannerImageUrl = bannerImagePreview;

            // Upload profile image if new file selected
            if (profileImageFile) {
                profileImageUrl = await uploadImage(profileImageFile, 'profile');
            }

            // Upload banner image if new file selected
            if (bannerImageFile) {
                bannerImageUrl = await uploadImage(bannerImageFile, 'banner');
            }

            // Update profile
            await fetch(`${API_URL}/twitter-accounts/${selectedAccount.id}/profile`, {
                method: 'PATCH',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    ...profileForm,
                    profileImage: profileImageUrl,
                    bannerImage: bannerImageUrl
                })
            });

            setShowProfileModal(false);
            setProfileImagePreview('');
            setBannerImagePreview('');
            setProfileImageFile(null);
            setBannerImageFile(null);
            alert('Profil mis à jour avec succès!');
        } catch (error) {
            console.error('Error updating profile:', error);
            alert('Erreur lors de la mise à jour du profil');
        } finally {
            setUploading(false);
        }
    };

    // Mark notification as read
    const markAsRead = async (id: string) => {
        await fetch(`${API_URL}/notifications/${id}/read`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        fetchData();
    };

    // Image upload handlers
    const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                alert('L\'image ne doit pas dépasser 5MB');
                return;
            }
            setProfileImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setProfileImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleBannerImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 10 * 1024 * 1024) { // 10MB limit
                alert('L\'image ne doit pas dépasser 10MB');
                return;
            }
            setBannerImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setBannerImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const removeProfileImage = () => {
        setProfileImageFile(null);
        setProfileImagePreview('');
    };

    const removeBannerImage = () => {
        setBannerImageFile(null);
        setBannerImagePreview('');
    };

    // Upload image to backend
    const uploadImage = async (file: File, type: 'profile' | 'banner'): Promise<string> => {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('type', type);

        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });

        if (!response.ok) {
            throw new Error('Upload failed');
        }

        const data = await response.json();
        return data.url;
    };

    const tabs = [
        { id: 'templates', label: 'Templates', icon: FileText },
        { id: 'stats', label: 'Statistiques', icon: BarChart3 },
        { id: 'activities', label: 'Activités', icon: Clock },
        { id: 'comments', label: 'Commentaires', icon: MessageCircle },
        { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadCount }
    ];

    return (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
            <div className="max-w-7xl mx-auto p-6">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
                        Fonctionnalités Avancées
                    </h1>
                    <p className="text-slate-400">Gérez vos groupes, templates et automatisations</p>
                </div>

                <button 
                    onClick={onClose}
                    className="fixed top-6 right-6 p-3 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-all z-[70] shadow-xl"
                    title="Fermer"
                >
                    <X className="w-6 h-6" />
                </button>

                {/* Tab Navigation */}
                <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap ${
                                activeTab === tab.id
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                            {tab.badge && tab.badge > 0 && (
                                <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                                    {tab.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <AnimatePresence mode="wait">
                    {/* TEMPLATES TAB */}
                    {activeTab === 'templates' && (
                        <motion.div
                            key="templates"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                        >
                            {/* Stats Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                <div className="bg-gradient-to-br from-purple-600/20 to-purple-800/20 border border-purple-500/30 rounded-xl p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-purple-300 text-sm font-medium">Total Templates</p>
                                            <p className="text-3xl font-bold text-white mt-1">{templates.length}</p>
                                        </div>
                                        <FileText className="w-10 h-10 text-purple-400" />
                                    </div>
                                </div>
                                <div className="bg-gradient-to-br from-blue-600/20 to-blue-800/20 border border-blue-500/30 rounded-xl p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-blue-300 text-sm font-medium">Posts</p>
                                            <p className="text-3xl font-bold text-white mt-1">{templates.filter(t => t.type === 'post').length}</p>
                                        </div>
                                        <TrendingUp className="w-10 h-10 text-blue-400" />
                                    </div>
                                </div>
                                <div className="bg-gradient-to-br from-green-600/20 to-green-800/20 border border-green-500/30 rounded-xl p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-green-300 text-sm font-medium">Commentaires</p>
                                            <p className="text-3xl font-bold text-white mt-1">{templates.filter(t => t.type === 'comment').length}</p>
                                        </div>
                                        <MessageCircle className="w-10 h-10 text-green-400" />
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className="text-2xl font-bold flex items-center gap-2">
                                        <FileText className="w-6 h-6 text-purple-400" />
                                        Templates de Contenu
                                    </h2>
                                    <p className="text-slate-400 text-sm mt-1">Personnalisez vos publications, commentaires et réponses</p>
                                </div>
                                <button
                                    onClick={() => setShowTemplateModal(true)}
                                    className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 px-6 py-3 rounded-xl flex items-center gap-2 font-medium shadow-lg shadow-purple-600/25 transition-all"
                                >
                                    <Plus className="w-5 h-5" />
                                    Nouveau Template
                                </button>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {templates.map(template => (
                                    <motion.div 
                                        key={template.id} 
                                        whileHover={{ y: -4, scale: 1.02 }}
                                        className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-xl p-5 border border-slate-700/50 hover:border-purple-500/50 shadow-lg hover:shadow-purple-500/10 transition-all"
                                    >
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <h3 className="text-lg font-semibold text-white">{template.name}</h3>
                                                </div>
                                                <span className={`inline-block text-xs px-3 py-1.5 rounded-lg font-medium border ${
                                                    template.type === 'post' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                                                    template.type === 'comment' ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                                                    template.type === 'reply' ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' :
                                                    'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                                }`}>
                                                    {template.type}
                                                </span>
                                            </div>
                                            <button 
                                                onClick={() => deleteTemplate(template.id)} 
                                                className="text-slate-500 hover:text-red-400 transition-colors p-1"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                        
                                        <div className="bg-slate-900/50 rounded-lg p-3 mb-3 border border-slate-700/30">
                                            <p className="text-sm text-slate-300 line-clamp-3 font-mono">{template.content}</p>
                                        </div>

                                        {template.hashtags && template.hashtags.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mb-3">
                                                {template.hashtags.slice(0, 5).map((tag, i) => (
                                                    <span key={i} className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded-md border border-purple-500/30">
                                                        #{tag}
                                                    </span>
                                                ))}
                                                {template.hashtags.length > 5 && (
                                                    <span className="text-xs text-slate-500">+{template.hashtags.length - 5}</span>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between pt-3 border-t border-slate-700/50 text-xs text-slate-500">
                                            <div className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                <span>{new Date(template.createdAt).toLocaleDateString('fr-FR')}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Hash className="w-3 h-3" />
                                                <span>{template.hashtags.length} hashtags</span>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            {templates.length === 0 && (
                                <motion.div 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="text-center py-16 bg-slate-800/30 rounded-2xl border border-slate-700/50"
                                >
                                    <FileText className="w-20 h-20 mx-auto mb-4 text-slate-600" />
                                    <p className="text-slate-400 text-lg mb-2">Aucun template créé</p>
                                    <p className="text-slate-500 text-sm">Créez des templates pour automatiser votre contenu</p>
                                </motion.div>
                            )}
                        </motion.div>
                    )}

                    {/* STATISTICS TAB */}
                    {activeTab === 'stats' && (
                        <motion.div
                            key="stats"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                        >
                            {/* Header */}
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className="text-2xl font-bold flex items-center gap-2">
                                        <BarChart3 className="w-6 h-6 text-blue-400" />
                                        Statistiques & Analytiques
                                    </h2>
                                    <p className="text-slate-400 text-sm mt-1">Visualisez les performances de vos comptes</p>
                                </div>
                                <div className="flex gap-2">
                                    {(['7d', '30d', '90d'] as const).map(period => (
                                        <button
                                            key={period}
                                            onClick={() => { setStatsPeriod(period); loadStatistics(); }}
                                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                                statsPeriod === period
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                            }`}
                                        >
                                            {period === '7d' ? '7 jours' : period === '30d' ? '30 jours' : '90 jours'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {statsLoading ? (
                                <div className="text-center py-20">
                                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                                    <p className="text-slate-400">Chargement des statistiques...</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {/* Summary Cards */}
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                        <div className="bg-gradient-to-br from-blue-600/20 to-blue-800/20 border border-blue-500/30 rounded-xl p-4">
                                            <p className="text-blue-300 text-xs font-medium">Total Actions</p>
                                            <p className="text-2xl font-bold text-white mt-1">{totalStats.totalActions}</p>
                                        </div>
                                        <div className="bg-gradient-to-br from-red-600/20 to-red-800/20 border border-red-500/30 rounded-xl p-4">
                                            <p className="text-red-300 text-xs font-medium">Likes</p>
                                            <p className="text-2xl font-bold text-white mt-1">{totalStats.totalLikes}</p>
                                        </div>
                                        <div className="bg-gradient-to-br from-green-600/20 to-green-800/20 border border-green-500/30 rounded-xl p-4">
                                            <p className="text-green-300 text-xs font-medium">Commentaires</p>
                                            <p className="text-2xl font-bold text-white mt-1">{totalStats.totalComments}</p>
                                        </div>
                                        <div className="bg-gradient-to-br from-purple-600/20 to-purple-800/20 border border-purple-500/30 rounded-xl p-4">
                                            <p className="text-purple-300 text-xs font-medium">Follows</p>
                                            <p className="text-2xl font-bold text-white mt-1">{totalStats.totalFollows}</p>
                                        </div>
                                        <div className="bg-gradient-to-br from-orange-600/20 to-orange-800/20 border border-orange-500/30 rounded-xl p-4">
                                            <p className="text-orange-300 text-xs font-medium">Posts</p>
                                            <p className="text-2xl font-bold text-white mt-1">{totalStats.totalPosts}</p>
                                        </div>
                                        <div className="bg-gradient-to-br from-emerald-600/20 to-emerald-800/20 border border-emerald-500/30 rounded-xl p-4">
                                            <p className="text-emerald-300 text-xs font-medium">Taux de Succès</p>
                                            <p className="text-2xl font-bold text-white mt-1">{totalStats.successRate}%</p>
                                        </div>
                                    </div>

                                    {/* Activity Trend Chart */}
                                    <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
                                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                            <TrendingUp className="w-5 h-5 text-blue-400" />
                                            Tendance d'Activité
                                        </h3>
                                        <ResponsiveContainer width="100%" height={300}>
                                            <AreaChart data={activityData}>
                                                <defs>
                                                    <linearGradient id="colorActions" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                                <XAxis dataKey="date" stroke="#94a3b8" />
                                                <YAxis stroke="#94a3b8" />
                                                <Tooltip 
                                                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                                                />
                                                <Area 
                                                    type="monotone" 
                                                    dataKey="actions" 
                                                    stroke="#3b82f6" 
                                                    strokeWidth={2}
                                                    fillOpacity={1} 
                                                    fill="url(#colorActions)" 
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>

                                    {/* Charts Grid */}
                                    <div className="grid md:grid-cols-2 gap-6">
                                        {/* Action Distribution */}
                                        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
                                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                                <Target className="w-5 h-5 text-purple-400" />
                                                Distribution des Actions
                                            </h3>
                                            <ResponsiveContainer width="100%" height={300}>
                                                <PieChart>
                                                    <Pie
                                                        data={actionDistribution}
                                                        cx="50%"
                                                        cy="50%"
                                                        labelLine={false}
                                                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                                        outerRadius={100}
                                                        fill="#8884d8"
                                                        dataKey="value"
                                                    >
                                                        {actionDistribution.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip 
                                                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                                                    />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>

                                        {/* Account Performance */}
                                        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
                                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                                <Users className="w-5 h-5 text-green-400" />
                                                Performance des Comptes
                                            </h3>
                                            <ResponsiveContainer width="100%" height={300}>
                                                <BarChart data={accountPerformance}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                                    <XAxis dataKey="account" stroke="#94a3b8" />
                                                    <YAxis stroke="#94a3b8" />
                                                    <Tooltip 
                                                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                                                    />
                                                    <Bar dataKey="actions" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* ACTIVITIES TAB */}
                    {activeTab === 'activities' && (
                        <motion.div
                            key="activities"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                        >
                            <h2 className="text-2xl font-bold mb-4">Historique des Activités</h2>
                            
                            <div className="bg-slate-800 rounded-lg border border-slate-700">
                                {activities.map((activity, i) => (
                                    <div key={activity.id} className={`p-4 ${i !== activities.length - 1 ? 'border-b border-slate-700' : ''}`}>
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-3">
                                                <div className={`w-2 h-2 rounded-full mt-2 ${
                                                    activity.status === 'SUCCESS' ? 'bg-green-500' : 
                                                    activity.status === 'FAILED' ? 'bg-red-500' : 'bg-yellow-500'
                                                }`} />
                                                <div>
                                                    <p className="font-medium">{activity.message}</p>
                                                    <p className="text-sm text-slate-400">
                                                        {activity.action} • {new Date(activity.timestamp).toLocaleString('fr-FR')}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className={`text-xs px-2 py-1 rounded ${
                                                activity.status === 'SUCCESS' ? 'bg-green-900 text-green-300' : 
                                                activity.status === 'FAILED' ? 'bg-red-900 text-red-300' : 'bg-yellow-900 text-yellow-300'
                                            }`}>
                                                {activity.status}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {activities.length === 0 && (
                                <div className="text-center py-12 text-slate-500">
                                    <Clock className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                    <p>Aucune activité enregistrée</p>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* COMMENTS TAB */}
                    {activeTab === 'comments' && (
                        <motion.div
                            key="comments"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                        >
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-2xl font-bold">Distribution de Commentaires</h2>
                                <button
                                    onClick={() => setShowCommentModal(true)}
                                    className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg flex items-center gap-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    Nouvelle Demande
                                </button>
                            </div>

                            <div className="grid gap-4">
                                {commentRequests.map(request => {
                                    const progress = (request.commentsDone / request.totalComments) * 100;
                                    return (
                                        <div key={request.id} className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <p className="text-sm text-blue-400 break-all">{request.postUrl}</p>
                                                    <p className="text-xs text-slate-500 mt-1">
                                                        {request.commentsDone}/{request.totalComments} commentaires
                                                    </p>
                                                </div>
                                                <span className={`text-xs px-2 py-1 rounded ${
                                                    request.status === 'COMPLETED' ? 'bg-green-900 text-green-300' :
                                                    request.status === 'IN_PROGRESS' ? 'bg-blue-900 text-blue-300' :
                                                    'bg-yellow-900 text-yellow-300'
                                                }`}>
                                                    {request.status}
                                                </span>
                                            </div>
                                            <div className="w-full bg-slate-700 rounded-full h-2">
                                                <div 
                                                    className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all"
                                                    style={{ width: `${progress}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {commentRequests.length === 0 && (
                                <div className="text-center py-12 text-slate-500">
                                    <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                    <p>Aucune demande de commentaire</p>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* NOTIFICATIONS TAB */}
                    {activeTab === 'notifications' && (
                        <motion.div
                            key="notifications"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                        >
                            <h2 className="text-2xl font-bold mb-4">Notifications</h2>
                            
                            <div className="bg-slate-800 rounded-lg border border-slate-700">
                                {notifications.map((notif, i) => (
                                    <div 
                                        key={notif.id} 
                                        className={`p-4 ${i !== notifications.length - 1 ? 'border-b border-slate-700' : ''} ${
                                            !notif.read ? 'bg-slate-750' : ''
                                        }`}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-3">
                                                {notif.type === 'BAN' && <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />}
                                                <div>
                                                    <p className="font-medium">{notif.title}</p>
                                                    <p className="text-sm text-slate-400 mt-1">{notif.message}</p>
                                                    <p className="text-xs text-slate-500 mt-2">
                                                        {new Date(notif.createdAt).toLocaleString('fr-FR')}
                                                    </p>
                                                </div>
                                            </div>
                                            {!notif.read && (
                                                <button 
                                                    onClick={() => markAsRead(notif.id)}
                                                    className="text-blue-400 hover:text-blue-300 text-sm"
                                                >
                                                    Marquer comme lu
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {notifications.length === 0 && (
                                <div className="text-center py-12 text-slate-500">
                                    <Bell className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                    <p>Aucune notification</p>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>


                {/* Template Modal */}
                {showTemplateModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md">
                            <h3 className="text-xl font-bold mb-4">Nouveau Template</h3>
                            <input
                                type="text"
                                placeholder="Nom du template"
                                value={newTemplate.name}
                                onChange={e => setNewTemplate({...newTemplate, name: e.target.value})}
                                className="w-full bg-slate-700 rounded-lg px-4 py-2 mb-3"
                            />
                            <textarea
                                placeholder="Contenu du template (utilisez {{variable}} pour les variables)"
                                value={newTemplate.content}
                                onChange={e => setNewTemplate({...newTemplate, content: e.target.value})}
                                className="w-full bg-slate-700 rounded-lg px-4 py-2 mb-3"
                                rows={4}
                            />
                            <select
                                value={newTemplate.type}
                                onChange={e => setNewTemplate({...newTemplate, type: e.target.value})}
                                className="w-full bg-slate-700 rounded-lg px-4 py-2 mb-3"
                            >
                                <option value="post">Post</option>
                                <option value="comment">Commentaire</option>
                                <option value="reply">Réponse</option>
                                <option value="bio">Bio</option>
                            </select>
                            <input
                                type="text"
                                placeholder="Hashtags (séparés par des virgules)"
                                value={newTemplate.hashtags}
                                onChange={e => setNewTemplate({...newTemplate, hashtags: e.target.value})}
                                className="w-full bg-slate-700 rounded-lg px-4 py-2 mb-4"
                            />
                            <div className="flex gap-2">
                                <button onClick={() => setShowTemplateModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg">
                                    Annuler
                                </button>
                                <button onClick={createTemplate} className="flex-1 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg">
                                    Créer
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Profile Modal */}
                {showProfileModal && selectedAccount && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-700/50 shadow-2xl"
                        >
                            {/* Header */}
                            <div className="sticky top-0 bg-gradient-to-r from-slate-800 to-slate-900 border-b border-slate-700/50 px-6 py-4 flex justify-between items-center rounded-t-2xl">
                                <div>
                                    <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                                        <UserCircle className="w-6 h-6 text-blue-400" />
                                        Modifier le Profil
                                    </h3>
                                    <p className="text-sm text-slate-400 mt-1">@{selectedAccount.username}</p>
                                </div>
                                <button 
                                    onClick={() => {
                                        setShowProfileModal(false);
                                        setProfileImagePreview('');
                                        setBannerImagePreview('');
                                        setProfileImageFile(null);
                                        setBannerImageFile(null);
                                    }}
                                    className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-slate-700/50 rounded-lg"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Banner Image Upload */}
                                <div>
                                    <label className="text-sm font-semibold text-slate-300 mb-2 block flex items-center gap-2">
                                        <ImageIcon className="w-4 h-4" />
                                        Image de Bannière
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleBannerImageChange}
                                            className="hidden"
                                            id="banner-upload"
                                        />
                                        <label
                                            htmlFor="banner-upload"
                                            className="block border-2 border-dashed border-slate-600 hover:border-blue-500 rounded-xl p-8 text-center cursor-pointer transition-all hover:bg-slate-800/50"
                                        >
                                            {bannerImagePreview ? (
                                                <div className="relative">
                                                    <img 
                                                        src={bannerImagePreview} 
                                                        alt="Banner" 
                                                        className="w-full h-48 object-cover rounded-lg"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            removeBannerImage();
                                                        }}
                                                        className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-2 rounded-full shadow-lg"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div>
                                                    <Upload className="w-12 h-12 mx-auto text-slate-500 mb-2" />
                                                    <p className="text-slate-400 text-sm">
                                                        <span className="text-blue-400 font-semibold">Cliquez pour uploader</span> ou glissez-déposez
                                                    </p>
                                                    <p className="text-slate-500 text-xs mt-1">PNG, JPG jusqu'à 10MB</p>
                                                </div>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                {/* Profile Image Upload */}
                                <div>
                                    <label className="text-sm font-semibold text-slate-300 mb-2 block flex items-center gap-2">
                                        <Camera className="w-4 h-4" />
                                        Photo de Profil
                                    </label>
                                    <div className="flex items-center gap-4">
                                        <div className="relative">
                                            <div className="w-24 h-24 rounded-full overflow-hidden bg-slate-700 border-2 border-slate-600">
                                                {profileImagePreview ? (
                                                    <img 
                                                        src={profileImagePreview} 
                                                        alt="Profile" 
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <UserCircle className="w-16 h-16 text-slate-500" />
                                                    </div>
                                                )}
                                            </div>
                                            {profileImagePreview && (
                                                <button
                                                    type="button"
                                                    onClick={removeProfileImage}
                                                    className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full shadow-lg"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleProfileImageChange}
                                                className="hidden"
                                                id="profile-upload"
                                            />
                                            <label
                                                htmlFor="profile-upload"
                                                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg cursor-pointer transition-all"
                                            >
                                                <Upload className="w-4 h-4" />
                                                Choisir une photo
                                            </label>
                                            <p className="text-slate-500 text-xs mt-2">PNG, JPG jusqu'à 5MB</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Bio */}
                                <div>
                                    <label className="text-sm font-semibold text-slate-300 mb-2 block">
                                        Bio
                                    </label>
                                    <textarea
                                        placeholder="Parlez de vous..."
                                        value={profileForm.bio}
                                        onChange={e => setProfileForm({...profileForm, bio: e.target.value})}
                                        className="w-full bg-slate-700/50 border border-slate-600 focus:border-blue-500 rounded-lg px-4 py-3 text-white placeholder-slate-500 resize-none"
                                        rows={3}
                                        maxLength={160}
                                    />
                                    <p className="text-xs text-slate-500 mt-1 text-right">{profileForm.bio.length}/160</p>
                                </div>

                                {/* Niche */}
                                <div>
                                    <label className="text-sm font-semibold text-slate-300 mb-2 block flex items-center gap-2">
                                        <Target className="w-4 h-4" />
                                        Niche / Thématique
                                    </label>
                                    <select
                                        value={profileForm.niche}
                                        onChange={e => setProfileForm({...profileForm, niche: e.target.value})}
                                        className="w-full bg-slate-700/50 border border-slate-600 focus:border-blue-500 rounded-lg px-4 py-3 text-white"
                                    >
                                        <option value="">Sélectionnez une niche</option>
                                        <option value="onlyfans">OnlyFans / Contenu Adulte</option>
                                        <option value="fitness">Fitness / Sport</option>
                                        <option value="tech">Technologie</option>
                                        <option value="business">Business / Marketing</option>
                                        <option value="lifestyle">Lifestyle</option>
                                        <option value="gaming">Gaming</option>
                                        <option value="music">Musique</option>
                                        <option value="art">Art / Design</option>
                                        <option value="other">Autre</option>
                                    </select>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-3 pt-4 border-t border-slate-700/50">
                                    <button 
                                        onClick={() => setShowProfileModal(false)} 
                                        className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-lg font-medium transition-all"
                                        disabled={uploading}
                                    >
                                        Annuler
                                    </button>
                                    <button 
                                        onClick={updateProfile} 
                                        className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-3 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        disabled={uploading}
                                    >
                                        {uploading ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                Upload...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle className="w-4 h-4" />
                                                Enregistrer
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Comment Request Modal */}
                {showCommentModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md">
                            <h3 className="text-xl font-bold mb-4">Nouvelle Demande de Commentaires</h3>
                            <input
                                type="url"
                                placeholder="URL du post"
                                value={newCommentRequest.postUrl}
                                onChange={e => setNewCommentRequest({...newCommentRequest, postUrl: e.target.value})}
                                className="w-full bg-slate-700 rounded-lg px-4 py-2 mb-3"
                            />
                            <input
                                type="number"
                                placeholder="Nombre de commentaires"
                                value={newCommentRequest.totalComments}
                                onChange={e => setNewCommentRequest({...newCommentRequest, totalComments: parseInt(e.target.value)})}
                                className="w-full bg-slate-700 rounded-lg px-4 py-2 mb-4"
                                min="1"
                            />
                            <div className="flex gap-2">
                                <button onClick={() => setShowCommentModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg">
                                    Annuler
                                </button>
                                <button onClick={createCommentRequest} className="flex-1 bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg">
                                    Créer
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
