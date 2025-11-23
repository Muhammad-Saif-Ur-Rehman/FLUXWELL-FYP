import React, { useState, useEffect } from 'react';
import { WorkoutDay } from '../../types/workout';
import arrowLeftIcon from '../../assets/images/arrow-left.svg';
import arrowRightIcon from '../../assets/images/arrow-right.svg';

// Type for calendar day items
interface CalendarDay {
  date: string;
  day: number;
  isCurrentMonth: boolean;
  isWorkoutDay: boolean;
  workoutDay?: WorkoutDay;
  isToday: boolean;
  isSelected: boolean;
}

interface WorkoutCalendarProps {
  workoutDays: WorkoutDay[];
  onDaySelect: (day: WorkoutDay) => void;
  selectedDay: WorkoutDay | null;
}

const WorkoutCalendar: React.FC<WorkoutCalendarProps> = ({
  workoutDays,
  onDaySelect,
  selectedDay
}) => {
  const [viewType, setViewType] = useState<'weekly' | 'monthly'>('weekly');
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    // Initialize with the start of the current week (Monday)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday = 1, Sunday = 0
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    return monday;
  });
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  
  // Ensure workoutDays is always an array
  const safeWorkoutDays = workoutDays || [];
  
  // Helper: local YYYY-MM-DD without timezone shifts
  const toLocalDateString = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  
  // Get the start of the week for any given date (Monday = 0, Sunday = 6)
  const getWeekStart = (date: Date): Date => {
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday = 1, Sunday = 0
    const monday = new Date(date);
    monday.setDate(date.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  const handlePreviousWeek = () => {
    setCurrentWeekStart(prev => {
      const newWeekStart = new Date(prev);
      newWeekStart.setDate(prev.getDate() - 7);
      return newWeekStart;
    });
  };

  const handleNextWeek = () => {
    setCurrentWeekStart(prev => {
      const newWeekStart = new Date(prev);
      newWeekStart.setDate(prev.getDate() + 7);
      return newWeekStart;
    });
  };

  const handlePreviousMonth = () => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev);
      newMonth.setMonth(prev.getMonth() - 1);
      return newMonth;
    });
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev);
      newMonth.setMonth(prev.getMonth() + 1);
      return newMonth;
    });
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentWeekStart(getWeekStart(today));
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const getDayClasses = (calendarDay: CalendarDay) => {
    let baseClasses = 'w-20 h-20 rounded-lg flex flex-col items-start justify-start p-2 transition-all duration-300 cursor-pointer shadow-md hover:shadow-xl transform hover:scale-105 hover:-translate-y-1';
    
    if (calendarDay.isSelected) {
      baseClasses += ' ring-2 ring-[#EF4444] ring-offset-2 ring-offset-[#1E1E1E]';
    } else if (calendarDay.isToday) {
      baseClasses += ' ring-1 ring-[#EF4444] ring-offset-1 ring-offset-[#1E1E1E]';
    }

    return baseClasses;
  };

  const getBackgroundClasses = (calendarDay: CalendarDay) => {
    // Only show workout background if there's actual workout data from database
    if (!calendarDay.isWorkoutDay || !calendarDay.workoutDay?.exercises || calendarDay.workoutDay.exercises.length === 0) {
      return 'bg-gradient-to-br from-[#374151] to-[#1E1E1E] hover:from-[#4B5563] hover:to-[#374151]';
    }
    
    // If we have workout data, show appropriate background
    return 'bg-gradient-to-br from-[#EF4444] via-[#DC2626] to-[#B91C1C] hover:from-[#F87171] hover:via-[#EF4444] hover:to-[#DC2626]';
  };

  // Generate calendar days for current week
  const generateWeeklyDays = (): CalendarDay[] => {
    const days: CalendarDay[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    console.log('Weekly Calendar Debug:');
    console.log('Today:', today.toDateString(), 'Day of week:', today.getDay());
    console.log('Week start:', currentWeekStart.toDateString());
    
    // Generate 7 days starting from Monday
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(currentWeekStart);
      dayDate.setDate(currentWeekStart.getDate() + i);
      // Use local date string to avoid UTC shifts
      const dateStr = toLocalDateString(dayDate);
      const workoutDay = safeWorkoutDays.find(wd => wd.date === dateStr);
      
      // Check if this day is actually today by comparing the full date
      const isToday = today.getTime() === dayDate.getTime();
      
      const isSelected = selectedDay?.date === dateStr;
      
      if (isToday) {
        console.log(`Today found: ${dayDate.toDateString()} (${dateStr}) at index ${i}`);
      }
      
      days.push({ 
        date: dateStr,
        day: dayDate.getDate(), 
        isCurrentMonth: true, 
        isWorkoutDay: !!workoutDay && workoutDay.exercises && workoutDay.exercises.length > 0,
        workoutDay,
        isToday,
        isSelected
      });
    }
    
    return days;
  };

  // Generate calendar days for current month
  const generateMonthlyDays = (): CalendarDay[] => {
    const days: CalendarDay[] = [];
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const firstDayOfWeek = firstDay.getDay(); // 0 = Sunday
    
    // Previous month days (to fill first week)
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const day = prevMonthLastDay - i;
      const d = new Date(year, month - 1, day);
      d.setHours(0,0,0,0);
      const dateStr = toLocalDateString(d);
      days.push({ 
        date: dateStr,
        day, 
        isCurrentMonth: false, 
        isWorkoutDay: false,
        isToday: false,
        isSelected: false
      });
    }
    
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      d.setHours(0,0,0,0);
      const dateStr = toLocalDateString(d);
      const workoutDay = safeWorkoutDays.find(wd => wd.date === dateStr);
      
      // Check if this day is actually today by comparing the full date
      const dayDate = new Date(year, month, i);
      dayDate.setHours(0, 0, 0, 0);
      const isToday = today.getTime() === dayDate.getTime();
      
      const isSelected = selectedDay?.date === dateStr;
      
      days.push({ 
        date: dateStr,
        day: i, 
        isCurrentMonth: true, 
        isWorkoutDay: !!workoutDay && workoutDay.exercises && workoutDay.exercises.length > 0,
        workoutDay,
        isToday,
        isSelected
      });
    }
    
    // Next month days (to fill last week)
    const remainingDays = 42 - days.length; // 6 rows * 7 days = 42
    for (let i = 1; i <= remainingDays; i++) {
      const d = new Date(year, month + 1, i);
      d.setHours(0,0,0,0);
      const dateStr = toLocalDateString(d);
      days.push({ 
        date: dateStr,
        day: i, 
        isCurrentMonth: false, 
        isWorkoutDay: false,
        isToday: false,
        isSelected: false
      });
    }
    
    return days;
  };

  const calendarDays = viewType === 'weekly' ? generateWeeklyDays() : generateMonthlyDays();

  // Handle day click
  const handleDayClick = (calendarDay: CalendarDay) => {
    if (calendarDay.isWorkoutDay && calendarDay.workoutDay) {
      onDaySelect(calendarDay.workoutDay);
    }
  };

  // Get month name for display
  const getMonthName = (date: Date) => {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    return monthNames[date.getMonth()];
  };

  // If no workout days, show a message
  if (safeWorkoutDays.length === 0) {
    return (
      <div className="bg-[#1E1E1E] rounded-2xl p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">Workout Calendar</h3>
        </div>
        <div className="text-center py-8">
          <p className="text-gray-400">No workout plan found.</p>
          <p className="text-gray-400 text-sm mt-2">Create a workout plan to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#1E1E1E] rounded-2xl p-6 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.1),0_10px_15px_-3px_rgba(0,0,0,0.1)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          {viewType === 'weekly' ? (
            <>
              <button
                onClick={handlePreviousWeek}
                className="w-9 h-9 rounded-md flex items-center justify-center hover:bg-[#374151] transition-colors"
              >
                <img src={arrowLeftIcon} alt="Previous week" className="w-5 h-5" />
              </button>
              <h3 className="text-xl font-bold text-white">
                Week of {getMonthName(currentWeekStart)} {currentWeekStart.getFullYear()}
              </h3>
              <button
                onClick={handleNextWeek}
                className="w-9 h-9 rounded-md flex items-center justify-center hover:bg-[#374151] transition-colors"
              >
                <img src={arrowRightIcon} alt="Next week" className="w-5 h-5" />
              </button>
            </>
          ) : (
            <>
          <button
            onClick={handlePreviousMonth}
            className="w-9 h-9 rounded-md flex items-center justify-center hover:bg-[#374151] transition-colors"
          >
            <img src={arrowLeftIcon} alt="Previous month" className="w-5 h-5" />
          </button>
              <h3 className="text-xl font-bold text-white">{getMonthName(currentMonth)} {currentMonth.getFullYear()}</h3>
          <button
            onClick={handleNextMonth}
            className="w-9 h-9 rounded-md flex items-center justify-center hover:bg-[#374151] transition-colors"
          >
            <img src={arrowRightIcon} alt="Next month" className="w-5 h-5" />
              </button>
            </>
          )}
          <button
            onClick={handleToday}
            className="px-3 py-1 text-sm bg-[#EF4444] text-white rounded-md hover:bg-[#DC2626] transition-colors"
          >
            Today
          </button>
        </div>
        
        <div className="bg-[#374151] rounded-lg p-1 flex">
          <button
            onClick={() => setViewType('weekly')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              viewType === 'weekly' 
                ? 'bg-[#374151] text-white' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Weekly
          </button>
          <button
            onClick={() => setViewType('monthly')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              viewType === 'monthly' 
                ? 'bg-[#374151] text-white' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Monthly
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 mb-3">
        {viewType === 'weekly' ? (
          // Weekly view: Monday to Sunday
          ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day) => (
            <div key={day} className="text-center text-xs font-bold text-gray-400 uppercase">
              {day}
            </div>
          ))
        ) : (
          // Monthly view: Sunday to Saturday (standard calendar format)
          ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day) => (
          <div key={day} className="text-center text-xs font-bold text-gray-400 uppercase">
            {day}
          </div>
          ))
        )}
      </div>

             <div className="grid grid-cols-7 gap-2">
        {calendarDays.map((calendarDay, index) => (
             <div
                key={index}
            className={`${getDayClasses(calendarDay)} ${getBackgroundClasses(calendarDay)} ${
              calendarDay.isWorkoutDay ? 'cursor-pointer' : 'cursor-default'
            }`}
            onClick={() => handleDayClick(calendarDay)}
              >
                {/* Content */}
                <div className="w-full h-full flex flex-col">
              <span className={`text-sm font-medium ${
                calendarDay.isCurrentMonth ? 'text-white' : 'text-gray-500'
              }`}>
                {calendarDay.day}
              </span>
              
              {/* Only show workout content if there's actual data from database */}
              {calendarDay.isWorkoutDay && calendarDay.workoutDay && calendarDay.workoutDay.exercises && calendarDay.workoutDay.exercises.length > 0 && (
                    <div className="mt-auto w-full">
                  {calendarDay.workoutDay.isCompleted ? (
                        <div className="text-xs text-center text-white font-bold">
                      {calendarDay.workoutDay.exercises[0]?.name || 'Workout'} ✅
                        </div>
                      ) : (
                        <div className="w-full">
                      <div className="text-xs text-center text-white mb-1 font-bold truncate">
                        {calendarDay.workoutDay.exercises[0]?.name || 'Workout'}
                          </div>
                      <button className="w-full px-2 py-1 bg-white bg-opacity-20 backdrop-blur-sm text-white text-xs rounded hover:bg-white hover:bg-opacity-30 transition-all duration-200 font-medium">
                            Start
                          </button>
                        </div>
                      )}
                    </div>
                  )}
              
              {/* Show "Today" indicator only if it's actually today */}
              {!calendarDay.isWorkoutDay && calendarDay.isToday && (
                <div className="mt-auto w-full text-center">
                  <span className="text-xs text-[#EF4444] font-bold">Today</span>
                    </div>
                  )}
                </div>
              </div>
        ))}
      </div>
      
      {/* Calendar Info */}
      <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#EF4444] rounded-full"></div>
            <span>Today</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#374151] rounded-full"></div>
            <span>No Workout</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gradient-to-r from-[#EF4444] to-[#B91C1C] rounded-full"></div>
            <span>Workout Day</span>
          </div>
       </div>
      
        <div className="text-right">
          <p>Total Workout Days: {safeWorkoutDays.filter(day => day.exercises && day.exercises.length > 0).length}</p>
        </div>
      </div>
    </div>
  );
};

export default WorkoutCalendar;
