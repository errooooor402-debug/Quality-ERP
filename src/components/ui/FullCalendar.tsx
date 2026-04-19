import React from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Base';

interface FullCalendarProps {
  selectedDate: string;
  onDateSelect: (date: string) => void;
}

export default function FullCalendar({ selectedDate, onDateSelect }: FullCalendarProps) {
  const date = new Date(selectedDate);
  const [viewDate, setViewDate] = React.useState(date);

  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const handlePrevMonth = () => setViewDate(subMonths(viewDate, 1));
  const handleNextMonth = () => setViewDate(addMonths(viewDate, 1));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
            {format(viewDate, 'MMMM yyyy')}
          </h3>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-8 w-8 rounded-lg">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-8 w-8 rounded-lg">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => {
            const today = new Date();
            setViewDate(today);
            onDateSelect(format(today, 'yyyy-MM-dd'));
          }}
          className="text-[10px] font-black uppercase tracking-widest h-8 px-4"
        >
          Today
        </Button>
      </div>
      
      <div className="grid grid-cols-7 border-b border-slate-100">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="py-2 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {calendarDays.map((day, i) => {
          const isSelected = isSameDay(day, date);
          const isCurrentMonth = isSameDay(startOfMonth(day), monthStart);
          const isTodayDate = isToday(day);
          
          return (
            <button
              key={i}
              onClick={() => onDateSelect(format(day, 'yyyy-MM-dd'))}
              className={cn(
                "h-12 flex flex-col items-center justify-center relative transition-all group",
                !isCurrentMonth && "opacity-20",
                isSelected ? "bg-slate-900 text-white" : "hover:bg-slate-50"
              )}
            >
              <span className={cn(
                "text-sm font-bold",
                isTodayDate && !isSelected && "text-brand-600"
              )}>
                {format(day, 'd')}
              </span>
              {isTodayDate && !isSelected && (
                <div className="absolute bottom-1.5 w-1 h-1 rounded-full bg-brand-600" />
              )}
              {isSelected && (
                <div className="absolute bottom-1.5 w-1 h-1 rounded-full bg-white/40" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
