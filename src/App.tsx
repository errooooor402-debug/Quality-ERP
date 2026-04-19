import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, query, collection, getDocs, limit, serverTimestamp } from 'firebase/firestore';
import { Layout, LogIn, LogOut, ClipboardList, Eye, BarChart3, User as UserIcon, Settings, Menu, X, LayoutDashboard, Mail, Lock, ShieldAlert } from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardContent, Input } from './components/ui/Base';
import DataEntry from './components/DataEntry';
import DataView from './components/DataView';
import Analytics from './components/Analytics';
import Sidebar from './components/Sidebar';
import AdminPanel from './components/AdminPanel';
import { UserSettings, UserProfile, UserRole } from './types';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('entry');
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [deactivatedError, setDeactivatedError] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      try {
        setUser(u);
        setDeactivatedError(false);
        
        if (u) {
          // Handle User Profile Logic
          const userRef = doc(db, 'users', u.uid);
          const userSnap = await getDoc(userRef);
          
          let currentProfile: UserProfile;

          if (userSnap.exists()) {
            currentProfile = userSnap.data() as UserProfile;
            
            // Safety: If this is the owner email, ensure they have the admin role even if the DB says otherwise
            if (u.email === 'errooooor402@gmail.com' && currentProfile.role !== 'admin') {
              currentProfile.role = 'admin';
              await setDoc(userRef, { role: 'admin' }, { merge: true });
            }
          } else {
            // Check if ANY users exist to see if this is the first admin
            const usersQuery = query(collection(db, 'users'), limit(1));
            const usersSnap = await getDocs(usersQuery);
            const isFirstUser = usersSnap.empty || u.email === 'errooooor402@gmail.com';

            const newProfile: UserProfile = {
              uid: u.uid,
              email: u.email || '',
              role: (isFirstUser ? 'admin' : 'viewer') as UserRole,
              assignedLine: null,
              isActive: true,
              createdAt: serverTimestamp()
            };
            await setDoc(userRef, newProfile);
            
            // Re-fetch to get the proper structure (including potential server defaults)
            const newSnap = await getDoc(userRef);
            currentProfile = newSnap.data() as UserProfile;
          }

          if (!currentProfile.isActive) {
            setDeactivatedError(true);
            await signOut(auth);
            setUser(null);
            setUserProfile(null);
            setLoading(false);
            return;
          }

          setUserProfile(currentProfile);

          // Adjust default tab based on roles
          if (currentProfile.role === 'admin' || u.email === 'errooooor402@gmail.com') {
            setActiveTab('admin');
          } else if (currentProfile.role === 'viewer') {
            setActiveTab('view');
          } else if (currentProfile.role === 'entry') {
            setActiveTab('entry');
          }

          // Handle User Settings Logic
          const settingsRef = doc(db, 'userSettings', u.uid);
          const settingsSnap = await getDoc(settingsRef);
          if (settingsSnap.exists()) {
            setUserSettings(settingsSnap.data() as UserSettings);
          } else {
            const initialSettings: UserSettings = {
              operations: ['Side Seam', 'Shoulder Join', 'Neck Rib', 'Sleeve Hem', 'Bottom Hem'],
              operators: []
            };
            await setDoc(settingsRef, initialSettings);
            setUserSettings(initialSettings);
          }
        } else {
          setUserProfile(null);
        }
      } catch (error) {
        console.error("Auth initialization error:", error);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    setAuthError('');
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login failed:", error);
      setAuthError(error.message);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      console.error("Authentication failed:", error);
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="text-slate-600 font-medium">Loading Garments Quality ERP...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md shadow-xl border-none">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto bg-brand-100 p-4 rounded-full w-fit">
              <ClipboardList className="h-12 w-12 text-brand-600" />
            </div>
            <CardTitle className="text-3xl font-bold text-slate-900">Quality ERP</CardTitle>
            <p className="text-slate-500">Garments Quality Department Management System</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {deactivatedError ? (
              <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl flex flex-col items-center text-center gap-3">
                <ShieldAlert className="h-8 w-8" />
                <div>
                  <h3 className="font-bold">Account Deactivated</h3>
                  <p className="text-sm mt-1">Your access has been revoked by an administrator. Please contact IT support if you believe this is an error.</p>
                </div>
                <Button variant="outline" className="w-full mt-2" onClick={() => setDeactivatedError(false)}>
                  Close
                </Button>
              </div>
            ) : (
              <form onSubmit={handleEmailAuth} className="space-y-4">
                {authError && (
                  <div className="p-3 bg-red-50 text-red-600 text-sm font-medium rounded-lg text-center border border-red-100">
                    {authError}
                  </div>
                )}
              
              <div className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input 
                    type="email" 
                    placeholder="Email Address" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-10 h-12 bg-slate-50 border-slate-200"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input 
                    type="password" 
                    placeholder="Password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pl-10 h-12 bg-slate-50 border-slate-200"
                  />
                </div>
              </div>
              
              <Button type="submit" disabled={authLoading} className="w-full h-12 text-lg font-bold" variant="primary">
                {authLoading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  isSignUp ? 'Sign Up' : 'Sign In'
                )}
              </Button>
            </form>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-slate-500 font-bold tracking-widest">Or continue with</span>
              </div>
            </div>

            <Button onClick={handleLogin} type="button" className="w-full h-12 text-lg gap-2" variant="outline">
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
                <path d="M1 1h22v22H1z" fill="none" />
              </svg>
              Google
            </Button>
            
            <p className="text-sm text-center text-slate-500">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <button 
                type="button" 
                onClick={() => { setIsSignUp(!isSignUp); setAuthError(''); }}
                className="text-brand-600 font-bold hover:underline"
              >
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row overflow-hidden">
      {/* Sidebar for Desktop */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isCollapsed={isSidebarCollapsed} 
        setIsCollapsed={setIsSidebarCollapsed}
        user={user}
        onLogout={handleLogout}
        userProfile={userProfile}
      />

      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-brand-600 p-1.5 rounded-lg shadow-md shadow-brand-100">
            <LayoutDashboard className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-lg font-extrabold text-slate-900 leading-none tracking-tight">
            Quality<span className="text-brand-600">ERP</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold border-2 border-white shadow-sm overflow-hidden">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || "User"} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="rounded-full hover:bg-red-50 hover:text-red-500 transition-colors">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Page Header (Desktop) */}
        <header className="hidden md:flex items-center justify-between px-8 py-6 bg-white border-b border-slate-100 shadow-sm">
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              {activeTab === 'entry' ? 'Data Entry' : activeTab === 'view' ? 'Data View' : activeTab === 'analytics' ? 'Strategic Analytics' : activeTab === 'admin' ? 'Admin Panel' : 'Audit Logs'}
            </h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
              {activeTab === 'entry' ? 'Register quality data' : activeTab === 'view' ? 'Review performance' : activeTab === 'analytics' ? 'Deep statistical insights' : activeTab === 'admin' ? 'Manage Users' : 'Historical records'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-xs font-black text-slate-400 uppercase tracking-tighter">Current Date</span>
              <span className="text-sm font-bold text-slate-900">{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="max-w-7xl mx-auto w-full"
            >
              {activeTab === 'entry' && userProfile?.role !== 'viewer' && (
                <DataEntry user={user} settings={userSettings} onSettingsUpdate={setUserSettings} userProfile={userProfile} />
              )}
              {activeTab === 'view' && (
                <DataView user={user} userProfile={userProfile} />
              )}
              {activeTab === 'analytics' && (
                <Analytics user={user} userProfile={userProfile} />
              )}
              {activeTab === 'admin' && (userProfile?.role === 'admin' || user?.email === 'errooooor402@gmail.com') && (
                <AdminPanel />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-lg border-t border-slate-200 px-6 py-3 flex justify-around items-center shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        {userProfile?.role !== 'viewer' && (
          <button 
            onClick={() => setActiveTab('entry')} 
            className={cn(
              "flex flex-col items-center gap-1 p-2 transition-all duration-300", 
              activeTab === 'entry' ? "text-brand-600 scale-110" : "text-slate-400"
            )}
          >
            <div className={cn("p-2 rounded-xl transition-colors", activeTab === 'entry' ? "bg-brand-100" : "")}>
              <ClipboardList className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-tighter">Entry</span>
          </button>
        )}
        <button 
          onClick={() => setActiveTab('view')} 
          className={cn(
            "flex flex-col items-center gap-1 p-2 transition-all duration-300", 
            activeTab === 'view' ? "text-brand-600 scale-110" : "text-slate-400"
          )}
        >
          <div className={cn("p-2 rounded-xl transition-colors", activeTab === 'view' ? "bg-brand-100" : "")}>
            <Eye className="h-5 w-5" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-tighter">View</span>
        </button>
        <button 
          onClick={() => setActiveTab('analytics')} 
          className={cn(
            "flex flex-col items-center gap-1 p-2 transition-all duration-300", 
            activeTab === 'analytics' ? "text-brand-600 scale-110" : "text-slate-400"
          )}
        >
          <div className={cn("p-2 rounded-xl transition-colors", activeTab === 'analytics' ? "bg-brand-100" : "")}>
            <BarChart3 className="h-5 w-5" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-tighter">Stats</span>
        </button>
        {(userProfile?.role === 'admin' || user?.email === 'errooooor402@gmail.com') && (
          <button 
            onClick={() => setActiveTab('admin')} 
            className={cn(
              "flex flex-col items-center gap-1 p-2 transition-all duration-300", 
              activeTab === 'admin' ? "text-brand-600 scale-110" : "text-slate-400"
            )}
          >
            <div className={cn("p-2 rounded-xl transition-colors", activeTab === 'admin' ? "bg-brand-100" : "")}>
              <Settings className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-tighter">Admin</span>
          </button>
        )}
      </nav>
    </div>
  );
}
