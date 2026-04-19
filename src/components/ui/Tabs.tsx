import * as React from "react";
import { cn } from "@/src/lib/utils";

interface TabsContextType {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextType | undefined>(undefined);

const useTabs = () => {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error("Tabs components must be used within a Tabs provider");
  }
  return context;
};

export const Tabs = ({ 
  className, 
  children, 
  value, 
  onValueChange, 
  ...props 
}: { 
  className?: string; 
  children: React.ReactNode; 
  value: string; 
  onValueChange: (v: string) => void 
}) => (
  <TabsContext.Provider value={{ value, onValueChange }}>
    <div className={cn("w-full", className)} {...props}>
      {children}
    </div>
  </TabsContext.Provider>
);

export const TabsList = ({ 
  className, 
  children, 
  ...props 
}: { 
  className?: string; 
  children: React.ReactNode; 
}) => (
  <div 
    className={cn("inline-flex h-10 items-center justify-center rounded-md bg-slate-100 p-1 text-slate-500", className)} 
    {...props}
  >
    {children}
  </div>
);

export const TabsTrigger = ({ 
  className, 
  children, 
  value, 
  ...props 
}: { 
  className?: string; 
  children: React.ReactNode; 
  value: string; 
}) => {
  const { value: activeValue, onValueChange } = useTabs();
  const active = value === activeValue;

  return (
    <button
      type="button"
      onClick={() => onValueChange(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        active ? "bg-white text-slate-950 shadow-sm" : "hover:bg-slate-200",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

export const TabsContent = ({ 
  className, 
  children, 
  value, 
  ...props 
}: { 
  className?: string; 
  children: React.ReactNode; 
  value: string; 
}) => {
  const { value: activeValue } = useTabs();
  
  if (value !== activeValue) return null;
  
  return (
    <div 
      className={cn("mt-2 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2", className)} 
      {...props}
    >
      {children}
    </div>
  );
};
