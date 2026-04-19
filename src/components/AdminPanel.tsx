import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, getDocs, doc, updateDoc } from 'firebase/firestore';
import { UserProfile, UserRole } from '../types';
import { Card, CardHeader, CardTitle, CardContent, Badge, Select, Button } from './ui/Base';
import { ShieldCheck, UserCog, User, Activity, ToggleLeft, ToggleRight, Loader2, Save, Trash2, ShieldAlert } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { LINES } from '../constants';

export default function AdminPanel() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'users'));
      const querySnapshot = await getDocs(q);
      const fetchedUsers: UserProfile[] = [];
      querySnapshot.forEach((doc) => {
        fetchedUsers.push(doc.data() as UserProfile);
      });
      setUsers(fetchedUsers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateUserField = async (uid: string, field: keyof UserProfile, value: any) => {
    setUpdating(uid);
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { [field]: value });
      
      setUsers(users.map(u => u.uid === uid ? { ...u, [field]: value } : u));
    } catch (error) {
      console.error("Error updating user:", error);
      alert("Failed to update user. Please try again.");
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 text-brand-500 animate-spin" />
          <p className="text-slate-500 font-bold tracking-widest uppercase text-xs">Loading Users...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <Card className="shadow-sm border-slate-200 rounded-3xl overflow-hidden bg-white">
        <CardHeader className="bg-slate-50 border-b border-slate-100 p-6 sm:p-8 flex flex-row items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-amber-100 p-3 rounded-2xl">
              <ShieldCheck className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-slate-900">User Management</CardTitle>
              <p className="text-xs font-medium text-slate-400 mt-1">Control access roles and line assignments.</p>
            </div>
          </div>
          <Badge variant="secondary" className="px-4 py-2 font-black text-sm bg-white shadow-sm border border-slate-200">
            {users.length} Users
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Email</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Role</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Line Access</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {users.map((u) => (
                    <motion.tr 
                      key={u.uid} 
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs uppercase",
                            u.role === 'admin' ? "bg-amber-100 text-amber-700" :
                            u.role === 'entry' ? "bg-emerald-100 text-emerald-700" :
                            "bg-slate-100 text-slate-600"
                          )}>
                            {u.email.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm">{u.email}</p>
                            <p className="text-[10px] text-slate-400 font-medium">UID: {u.uid.slice(0, 8)}...</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Select
                          value={u.role}
                          onChange={(e) => updateUserField(u.uid, 'role', e.target.value)}
                          disabled={updating === u.uid}
                          className={cn(
                            "h-9 text-xs font-bold rounded-lg border-slate-200 py-0",
                            u.role === 'admin' ? "bg-amber-50 text-amber-700" :
                            u.role === 'entry' ? "bg-emerald-50 text-emerald-700" :
                            "bg-slate-50 text-slate-600"
                          )}
                        >
                          <option value="viewer">Viewer (Read Only)</option>
                          <option value="entry">Entry (Data Entry)</option>
                          <option value="admin">Admin (Full Access)</option>
                        </Select>
                      </td>
                      <td className="px-6 py-4">
                        {u.role === 'entry' ? (
                          <Select
                            value={u.assignedLine || ''}
                            onChange={(e) => updateUserField(u.uid, 'assignedLine', e.target.value)}
                            disabled={updating === u.uid}
                            className="h-9 text-xs font-bold rounded-lg border-slate-200 py-0 bg-white"
                          >
                            <option value="">-- No Line Assigned --</option>
                            {LINES.map(line => (
                              <option key={line} value={line}>{line}</option>
                            ))}
                          </Select>
                        ) : (
                          <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg">
                            {u.role === 'admin' ? 'All Lines (Admin)' : 'N/A (Viewer)'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Badge 
                          variant="secondary" 
                          className={cn(
                            "px-3 py-1 text-xs font-bold uppercase tracking-widest",
                            u.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                          )}
                        >
                          {u.isActive ? "Active" : "Deactivated"}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateUserField(u.uid, 'isActive', !u.isActive)}
                          disabled={updating === u.uid}
                          className={cn(
                            "font-bold text-xs gap-2 transition-colors",
                            u.isActive ? "text-red-600 hover:text-red-700 hover:bg-red-50" : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          )}
                        >
                          {updating === u.uid ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : u.isActive ? (
                            <>Deactivate</>
                          ) : (
                            <>Activate</>
                          )}
                        </Button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
        <div className="flex gap-4">
          <ShieldAlert className="h-6 w-6 text-amber-600 shrink-0" />
          <div>
            <h3 className="font-bold text-amber-900 leading-tight">Admin Guidelines</h3>
            <p className="text-sm text-amber-700 mt-2">
              <strong>Deactivating a user</strong> removes their ability to log in and use the application. However, any data or quality reports they previously submitted will remain fully intact and visible in the analytics views. Their identity is securely preserved in historical records.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
