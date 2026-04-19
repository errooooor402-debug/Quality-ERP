import React from 'react';
import { cn } from '../lib/utils';
import { 
  ClipboardList, 
  Eye, 
  BarChart3, 
  LogOut, 
  ChevronLeft, 
  ChevronRight,
  LayoutDashboard,
  Settings as SettingsIcon,
  User as UserIcon,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile } from '../types';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  user: any;
  onLogout: () => void;
  userProfile?: UserProfile | null;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  setActiveTab, 
  isCollapsed, 
  setIsCollapsed,
  user,
  onLogout,
  userProfile
}) => {
  const menuItems = [];
  
  if (userProfile?.role !== 'viewer') {
    menuItems.push({ id: 'entry', label: 'Data Entry', icon: ClipboardList });
  }
  
  menuItems.push(
    { id: 'view', label: 'Data View', icon: Eye },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 }
  );

    if (userProfile?.role === 'admin' || user?.email === 'errooooor402@gmail.com') {
    menuItems.push({ id: 'admin', label: 'Admin Panel', icon: ShieldCheck });
  }

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 80 : 280 }}
      className={cn(
        "hidden md:flex flex-col bg-white border-r border-slate-200 h-screen sticky top-0 z-40 transition-all duration-300 ease-in-out shadow-sm",
        isCollapsed ? "items-center" : "items-stretch"
      )}
    >
      {/* Logo Section */}
      <div className={cn(
        "p-6 flex items-center gap-3 border-b border-slate-50",
        isCollapsed ? "justify-center" : "justify-between"
      )}>
        {!isCollapsed && (
          <div className="flex items-center gap-3">
            <div className="bg-brand-600 p-2 rounded-xl shadow-lg shadow-brand-100">
              <LayoutDashboard className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 leading-none tracking-tight">
                Quality<span className="text-brand-600">ERP</span>
              </h1>
              <p className="text-[10px] text-slate-400 uppercase font-black tracking-[0.2em] mt-1">Garments Div.</p>
            </div>
          </div>
        )}
        {isCollapsed && (
          <div className="bg-brand-600 p-2 rounded-xl shadow-lg shadow-brand-100">
            <LayoutDashboard className="h-6 w-6 text-white" />
          </div>
        )}
        
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors absolute -right-3 top-8 bg-white border border-slate-200 shadow-sm z-50"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Navigation Section */}
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group relative",
              activeTab === item.id 
                ? "bg-brand-50 text-brand-600 shadow-sm" 
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            )}
          >
            <item.icon className={cn(
              "h-5 w-5 transition-transform duration-200",
              activeTab === item.id ? "scale-110" : "group-hover:scale-110"
            )} />
            {!isCollapsed && (
              <span className="font-bold text-sm tracking-tight">{item.label}</span>
            )}
            {activeTab === item.id && (
              <motion.div 
                layoutId="active-pill"
                className="absolute left-0 w-1 h-6 bg-brand-600 rounded-r-full"
              />
            )}
          </button>
        ))}
      </nav>

      {/* User Section */}
      <div className={cn(
        "p-4 border-t border-slate-100 bg-slate-50/50",
        isCollapsed ? "flex flex-col items-center gap-4" : "space-y-4"
      )}>
        {!isCollapsed ? (
          <div className="flex items-center gap-3 p-2 bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold border-2 border-white shadow-sm overflow-hidden">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || "User"} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{user.displayName || "Quality Member"}</p>
              <div className="flex items-center gap-1">
                <p className="text-[10px] text-slate-400 truncate w-full flex-1">{user.email}</p>
                {userProfile && (
                    <span className={cn(
                    "text-[8px] px-1.5 py-0.5 rounded uppercase font-black tracking-widest",
                    (userProfile?.role === 'admin' || user?.email === 'errooooor402@gmail.com') ? "bg-amber-100 text-amber-700" :
                    userProfile?.role === 'entry' ? "bg-emerald-100 text-emerald-700" :
                    "bg-slate-200 text-slate-600"
                  )}>
                    {(userProfile?.role === 'admin' || user?.email === 'errooooor402@gmail.com') ? 'admin' : userProfile?.role}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold border-2 border-white shadow-sm overflow-hidden">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || "User"} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'
            )}
          </div>
        )}

        <button
          onClick={onLogout}
          className={cn(
            "w-full flex items-center gap-3 p-3 rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all duration-200 group",
            isCollapsed ? "justify-center" : ""
          )}
        >
          <LogOut className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
          {!isCollapsed && <span className="font-bold text-sm tracking-tight">Logout</span>}
        </button>
      </div>
    </motion.aside>
  );
};

export default Sidebar;
