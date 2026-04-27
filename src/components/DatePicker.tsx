import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';

interface DatePickerProps {
  value: string; // Формат YYYY-MM-DD
  onChange: (value: string) => void;
  className?: string;
}

type ViewMode = 'day' | 'month' | 'year';

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];
const MONTH_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

export function DatePicker({ value, onChange, className = '' }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const [viewDate, setViewDate] = useState(() => value ? new Date(value) : new Date());
  const [yearRangeStart, setYearRangeStart] = useState(() => {
    const y = value ? new Date(value).getFullYear() : new Date().getFullYear();
    return Math.floor(y / 12) * 12;
  });

  const [inputValue, setInputValue] = useState('');

  // Sync value -> inputValue (DD.MM.YYYY)
  useEffect(() => {
    if (value) {
      const parts = value.split('-');
      if (parts.length === 3) setInputValue(`${parts[2]}.${parts[1]}.${parts[0]}`);
    } else {
      setInputValue('');
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
        setViewMode('day');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^\d.]/g, '');
    if (val.length === 2 && inputValue.length < 2 && !val.includes('.')) val += '.';
    if (val.length === 5 && inputValue.length < 5 && val.split('.').length === 2) val += '.';
    if (val.length > 10) val = val.substring(0, 10);
    setInputValue(val);
    if (val.length === 10) {
      const parts = val.split('.');
      if (parts.length === 3) {
        const newDateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
        const isValid = !isNaN(new Date(newDateStr).getTime());
        if (isValid) {
          onChange(newDateStr);
          setViewDate(new Date(newDateStr));
        }
      }
    }
  };

  const handleDayClick = (day: number) => {
    const y = viewDate.getFullYear();
    const m = String(viewDate.getMonth() + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    onChange(`${y}-${m}-${d}`);
    setIsOpen(false);
    setViewMode('day');
  };

  const handleMonthClick = (monthIndex: number) => {
    setViewDate(new Date(viewDate.getFullYear(), monthIndex, 1));
    setViewMode('day');
  };

  const handleYearClick = (year: number) => {
    setViewDate(new Date(year, viewDate.getMonth(), 1));
    setYearRangeStart(Math.floor(year / 12) * 12);
    setViewMode('month');
  };

  const toggleOpen = () => {
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = 320;
      if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
        setCoords({ top: rect.top + window.scrollY - dropdownHeight - 8, left: rect.left + window.scrollX });
      } else {
        setCoords({ top: rect.bottom + window.scrollY + 8, left: rect.left + window.scrollX });
      }
    }
    setIsOpen(prev => {
      if (prev) setViewMode('day');
      return !prev;
    });
  };

  // ===== DAY VIEW =====
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const renderDays = () => {
    const days = [];
    for (let i = 0; i < startDay; i++) {
      days.push(<div key={`e-${i}`} className="h-8 w-8" />);
    }
    const selectedStr = value;
    for (let i = 1; i <= daysInMonth; i++) {
      const d = String(i).padStart(2, '0');
      const m = String(month + 1).padStart(2, '0');
      const cur = `${year}-${m}-${d}`;
      const isSelected = selectedStr === cur;
      const isToday = new Date().toISOString().split('T')[0] === cur;
      days.push(
        <button
          key={i}
          onClick={() => handleDayClick(i)}
          className={`h-8 w-8 rounded-full flex items-center justify-center text-sm transition-colors
            ${isSelected ? 'bg-primary text-white font-bold shadow-md' :
              isToday ? 'bg-blue-50 text-primary font-bold' : 'hover:bg-gray-100 text-gray-700'}`}
        >
          {i}
        </button>
      );
    }
    return days;
  };

  // ===== MONTH VIEW =====
  const renderMonths = () => (
    <div className="grid grid-cols-3 gap-2 py-2">
      {MONTH_SHORT.map((name, idx) => {
        const isSelected = value
          ? new Date(value).getFullYear() === year && new Date(value).getMonth() === idx
          : false;
        const isCurrentMonth = new Date().getFullYear() === year && new Date().getMonth() === idx;
        return (
          <button
            key={idx}
            onClick={() => handleMonthClick(idx)}
            className={`py-2 px-1 rounded-lg text-sm font-medium transition-colors
              ${isSelected ? 'bg-primary text-white shadow-sm' :
                isCurrentMonth ? 'bg-blue-50 text-primary' : 'hover:bg-gray-100 text-gray-700'}`}
          >
            {name}
          </button>
        );
      })}
    </div>
  );

  // ===== YEAR VIEW =====
  const renderYears = () => {
    const years = Array.from({ length: 12 }, (_, i) => yearRangeStart + i);
    return (
      <div className="grid grid-cols-3 gap-2 py-2">
        {years.map(y => {
          const isSelected = value ? new Date(value).getFullYear() === y : false;
          const isCurrentYear = new Date().getFullYear() === y;
          return (
            <button
              key={y}
              onClick={() => handleYearClick(y)}
              className={`py-2 px-1 rounded-lg text-sm font-medium transition-colors
                ${isSelected ? 'bg-primary text-white shadow-sm' :
                  isCurrentYear ? 'bg-blue-50 text-primary' : 'hover:bg-gray-100 text-gray-700'}`}
            >
              {y}
            </button>
          );
        })}
      </div>
    );
  };

  // Navigation for each mode
  const renderNavigation = () => {
    if (viewMode === 'day') {
      return (
        <div className="flex justify-between items-center mb-3">
          <button
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            className="p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('month')}
            className="flex items-center gap-1 font-bold text-gray-800 text-sm hover:bg-gray-100 px-2 py-1 rounded-lg transition-colors"
          >
            {MONTH_NAMES[month]} {year}
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>
          <button
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            className="p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      );
    }
    if (viewMode === 'month') {
      return (
        <div className="flex justify-between items-center mb-3">
          <button
            onClick={() => setViewDate(new Date(year - 1, month, 1))}
            className="p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('year')}
            className="flex items-center gap-1 font-bold text-gray-800 text-sm hover:bg-gray-100 px-2 py-1 rounded-lg transition-colors"
          >
            {year}
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>
          <button
            onClick={() => setViewDate(new Date(year + 1, month, 1))}
            className="p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      );
    }
    // year mode
    return (
      <div className="flex justify-between items-center mb-3">
        <button
          onClick={() => setYearRangeStart(s => s - 12)}
          className="p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-bold text-gray-800 text-sm">
          {yearRangeStart} — {yearRangeStart + 11}
        </span>
        <button
          onClick={() => setYearRangeStart(s => s + 12)}
          className="p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    );
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div className="relative flex items-center">
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={toggleOpen}
          placeholder="ДД.ММ.ГГГГ"
          className="w-36 pl-3 pr-10 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-sm"
        />
        <button
          onClick={toggleOpen}
          className="absolute right-2 p-1 text-gray-400 hover:text-primary rounded-md"
          type="button"
        >
          <CalendarIcon className="w-4 h-4" />
        </button>
      </div>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] bg-white rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.15)] border border-gray-100 p-4 w-[280px] animate-in fade-in zoom-in-95 duration-200"
          style={{ top: coords.top, left: coords.left }}
        >
          {renderNavigation()}

          {viewMode === 'day' && (
            <>
              <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
                  <div key={d} className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1 place-items-center">
                {renderDays()}
              </div>
            </>
          )}

          {viewMode === 'month' && renderMonths()}
          {viewMode === 'year' && renderYears()}

          <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
            <button
              onClick={() => {
                const today = new Date();
                const y = today.getFullYear();
                const m = String(today.getMonth() + 1).padStart(2, '0');
                const d = String(today.getDate()).padStart(2, '0');
                onChange(`${y}-${m}-${d}`);
                setViewDate(today);
                setIsOpen(false);
                setViewMode('day');
              }}
              className="text-xs text-primary font-medium hover:underline"
              type="button"
            >
              Сегодня
            </button>
            <button
              onClick={() => { setIsOpen(false); setViewMode('day'); }}
              className="text-xs text-gray-400 hover:text-gray-600 font-medium"
              type="button"
            >
              Закрыть
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
