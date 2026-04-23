import React, { useRef, useEffect, useCallback } from 'react';
import { Delete, CornerDownLeft } from 'lucide-react';

interface NumPadProps {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  maxValue?: number;
}

export default function NumPad({ value, onChange, onEnter, maxValue }: NumPadProps) {
  const valueRef = useRef(value);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Синхронизируем актуальное значение для setInterval
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const handleKeyAction = useCallback((key: string) => {
    const currentValue = valueRef.current;
    if (key === 'backspace') {
      onChange(currentValue.slice(0, -1));
    } else if (key === 'clear') {
      onChange('');
    } else if (key === 'enter') {
      onEnter?.();
    } else if (key === '.') {
      if (!currentValue.includes('.')) {
        onChange(currentValue + '.');
      }
    } else {
      const newVal = (currentValue === '0' && key !== '.') ? key : currentValue + key;
      if (maxValue !== undefined && parseFloat(newVal) > maxValue) return;
      onChange(newVal);
    }
  }, [onChange, onEnter, maxValue]);

  const handlePointerDown = (e: React.PointerEvent, key: string) => {
    // Предотвращаем потерю фокуса и лишний скролл на тач-устройствах
    e.preventDefault();
    
    // Срабатывает мгновенно при касании (работает быстрее чем onClick)
    handleKeyAction(key);

    // Запускаем "залипание" только для цифр и бэкспейса
    if (key !== 'enter' && key !== 'clear') {
      timeoutRef.current = setTimeout(() => {
        intervalRef.current = setInterval(() => {
          handleKeyAction(key);
        }, 75); // Скорость стирания/печати при удержании
      }, 400); // Задержка перед тем как начнется автоповтор (как на Windows)
    }
  };

  const stopPress = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  // Очищаем таймеры, если компонент удален с экрана
  useEffect(() => {
    return () => stopPress();
  }, []);

  const keys = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    ['clear', '0', '.'],
  ];

  return (
    <div className="grid grid-cols-4 gap-2 mt-3 select-none touch-none">
      {keys.map((row, ri) =>
        row.map((key) => (
          <button
            key={`${ri}-${key}`}
            type="button"
            onPointerDown={(e) => handlePointerDown(e, key)}
            onPointerUp={stopPress}
            onPointerLeave={stopPress}
            onPointerCancel={stopPress}
            onContextMenu={(e) => e.preventDefault()} // Отключаем меню по долгому тапу
            className={`py-3 rounded-xl font-bold text-lg transition-all active:scale-95 select-none ${key === 'clear'
              ? 'bg-red-100 text-red-600 hover:bg-red-200'
              : key === '.'
                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
              }`}
          >
            {key === 'clear' ? 'C' : key}
          </button>
        ))
      )}
      {/* Правая колонка: Backspace + Enter */}
      <div className="row-start-1 row-end-3 col-start-4 flex flex-col gap-2">
        <button
          type="button"
          onPointerDown={(e) => handlePointerDown(e, 'backspace')}
          onPointerUp={stopPress}
          onPointerLeave={stopPress}
          onPointerCancel={stopPress}
          onContextMenu={(e) => e.preventDefault()}
          className="flex-1 flex items-center justify-center bg-orange-100 text-orange-600 hover:bg-orange-200 rounded-xl transition-all active:scale-95 select-none"
        >
          <Delete className="w-6 h-6 pointer-events-none" />
        </button>
      </div>
      <div className="row-start-3 row-end-5 col-start-4 flex flex-col gap-2">
        <button
          type="button"
          onPointerDown={(e) => handlePointerDown(e, 'enter')}
          onPointerUp={stopPress}
          onPointerLeave={stopPress}
          onPointerCancel={stopPress}
          onContextMenu={(e) => e.preventDefault()}
          className="flex-1 flex items-center justify-center bg-primary text-white hover:bg-primary/90 rounded-xl font-bold text-lg transition-all active:scale-95 select-none"
        >
          <CornerDownLeft className="w-6 h-6 pointer-events-none" />
        </button>
      </div>
    </div>
  );
}
