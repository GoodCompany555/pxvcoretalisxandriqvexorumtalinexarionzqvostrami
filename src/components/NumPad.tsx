import React from 'react';
import { Delete, CornerDownLeft } from 'lucide-react';

interface NumPadProps {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  maxValue?: number;
}

export default function NumPad({ value, onChange, onEnter, maxValue }: NumPadProps) {
  const handleKey = (key: string) => {
    if (key === 'backspace') {
      onChange(value.slice(0, -1));
    } else if (key === 'clear') {
      onChange('');
    } else if (key === 'enter') {
      onEnter?.();
    } else if (key === '.') {
      if (!value.includes('.')) {
        onChange(value + '.');
      }
    } else {
      const newVal = (value === '0' && key !== '.') ? key : value + key;
      if (maxValue !== undefined && parseFloat(newVal) > maxValue) return;
      onChange(newVal);
    }
  };

  const keys = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    ['clear', '0', '.'],
  ];

  return (
    <div className="grid grid-cols-4 gap-2 mt-3">
      {keys.map((row, ri) =>
        row.map((key) => (
          <button
            key={`${ri}-${key}`}
            type="button"
            onClick={() => handleKey(key)}
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
          onClick={() => handleKey('backspace')}
          className="flex-1 flex items-center justify-center bg-orange-100 text-orange-600 hover:bg-orange-200 rounded-xl transition-all active:scale-95"
        >
          <Delete className="w-6 h-6" />
        </button>
      </div>
      <div className="row-start-3 row-end-5 col-start-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => handleKey('enter')}
          className="flex-1 flex items-center justify-center bg-primary text-white hover:bg-primary/90 rounded-xl font-bold text-lg transition-all active:scale-95"
        >
          <CornerDownLeft className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
