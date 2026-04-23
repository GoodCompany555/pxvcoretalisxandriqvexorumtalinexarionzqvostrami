import React, { useState, useEffect, useCallback } from 'react';
import { X, Delete, Globe, CornerDownLeft } from 'lucide-react';
import { create } from 'zustand';

// ───── Zustand Store ─────
// Позволяет открывать/закрывать клавиатуру из любого компонента
interface KeyboardState {
  isOpen: boolean;
  activeInput: HTMLInputElement | HTMLTextAreaElement | null;
  isNumeric: boolean;
  openKeyboard: (input: HTMLInputElement | HTMLTextAreaElement) => void;
  closeKeyboard: () => void;
}

export const useKeyboardStore = create<KeyboardState>((set) => ({
  isOpen: false,
  activeInput: null,
  isNumeric: false,
  openKeyboard: (input) => {
    set({
      isOpen: true,
      activeInput: input,
      isNumeric: input.type === 'number',
    });
    input.focus();
  },
  closeKeyboard: () => {
    set({ isOpen: false, activeInput: null, isNumeric: false });
  },
}));

// ───── Layouts ─────
const LAYOUTS = {
  ru: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х'],
    ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'],
    ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', '.'],
  ],
  kk: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х'],
    ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'],
    ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', '.'],
    ['ә', 'і', 'ң', 'ғ', 'ү', 'ұ', 'қ', 'ө', 'һ'],
  ],
  en: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', ','],
  ],
  symbols: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['@', '#', '%', '&', '*', '-', '+', '=', '(', ')'],
    ['!', '?', ':', ';', ',', '.', '_', '/', '"', "'"],
    ['₸', '$', '€', '₽', '~', '`', '{', '}', '[', ']']
  ],
};

const NUMERIC_LAYOUT = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['.', '0', 'C'],
];

const LANG_LABELS: Record<string, string> = { ru: 'РУС', kk: 'ҚАЗ', en: 'ENG' };
const LANG_ORDER: Array<'ru' | 'kk' | 'en'> = ['ru', 'kk', 'en'];

export default function OnScreenKeyboard() {
  const { isOpen, activeInput, isNumeric, closeKeyboard } = useKeyboardStore();
  const [lang, setLang] = useState<'ru' | 'kk' | 'en'>('ru');
  const [shift, setShift] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [isSymbolsMode, setIsSymbolsMode] = useState(false);

  // MutationObserver: если активный input удален из DOM — закрываем клавиатуру
  useEffect(() => {
    if (!activeInput) return;
    const observer = new MutationObserver(() => {
      if (activeInput && !document.body.contains(activeInput)) {
        closeKeyboard();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [activeInput, closeKeyboard]);

  // БАГ 2 FIX: Когда клавиатура уже открыта и пользователь кликает на другое поле —
  // автоматически перепривязываем клавиатуру к новому полю.
  // НЕ открываем клавиатуру при простом клике (это делает только иконка ⌨).
  useEffect(() => {
    if (!isOpen) return;
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
        target !== activeInput
      ) {
        useKeyboardStore.getState().openKeyboard(target);
      }
    };
    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, [isOpen, activeInput]);

  const sendKey = useCallback((key: string) => {
    if (!activeInput) return;

    if (!document.body.contains(activeInput)) {
      closeKeyboard();
      return;
    }

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set || Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set;

    if (!nativeInputValueSetter) return;

    const triggerReactChange = (prevVal: string) => {
      const tracker = (activeInput as any)._valueTracker;
      if (tracker) {
        tracker.setValue(prevVal);
      }
      activeInput.dispatchEvent(new Event('input', { bubbles: true }));
      activeInput.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const start = activeInput.selectionStart ?? activeInput.value.length;
    const end = activeInput.selectionEnd ?? activeInput.value.length;
    const currentVal = activeInput.value;

    if (key === 'BACKSPACE') {
      if (activeInput.type === 'number') {
        const newVal = currentVal.slice(0, -1);
        nativeInputValueSetter.call(activeInput, newVal);
        triggerReactChange(currentVal);
      } else if (start === end && start > 0) {
        const newVal = currentVal.slice(0, start - 1) + currentVal.slice(end);
        nativeInputValueSetter.call(activeInput, newVal);
        triggerReactChange(currentVal);
        activeInput.setSelectionRange(start - 1, start - 1);
      } else if (start !== end) {
        const newVal = currentVal.slice(0, start) + currentVal.slice(end);
        nativeInputValueSetter.call(activeInput, newVal);
        triggerReactChange(currentVal);
        activeInput.setSelectionRange(start, start);
      }
    } else if (key === 'ENTER') {
      setTimeout(() => {
        const form = activeInput.closest('form');
        if (form) {
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      }, 50);
    } else if (key === 'SPACE') {
      const newVal = currentVal.slice(0, start) + ' ' + currentVal.slice(end);
      nativeInputValueSetter.call(activeInput, newVal);
      triggerReactChange(currentVal);
      activeInput.setSelectionRange(start + 1, start + 1);
    } else if (key === 'CLEAR') {
      nativeInputValueSetter.call(activeInput, '');
      triggerReactChange(currentVal);
    } else {
      const isUpper = shift || capsLock;
      const char = isUpper ? key.toUpperCase() : key;
      if (activeInput.type === 'number') {
        const newVal = currentVal === '0' && key !== '.' ? char : currentVal + char;
        nativeInputValueSetter.call(activeInput, newVal);
        triggerReactChange(currentVal);
      } else {
        const newVal = currentVal.slice(0, start) + char + currentVal.slice(end);
        nativeInputValueSetter.call(activeInput, newVal);
        triggerReactChange(currentVal);
        activeInput.setSelectionRange(start + 1, start + 1);
      }
      if (shift) setShift(false);
    }
  }, [activeInput, shift, capsLock, closeKeyboard]);

  const cycleLang = () => {
    const idx = LANG_ORDER.indexOf(lang);
    setLang(LANG_ORDER[(idx + 1) % LANG_ORDER.length]);
  };

  if (!isOpen) return null;

  // ====== ЦИФРОВАЯ КЛАВИАТУРА для числовых полей ======
  if (isNumeric) {
    return (
      <div
        id="onscreen-keyboard"
        className="on-screen-keyboard fixed bottom-0 left-0 right-0 z-[9999] bg-gray-100 border-t-2 border-gray-300 shadow-2xl px-4 py-3 select-none"
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="max-w-sm mx-auto flex gap-2">
          {/* Левая часть: Цифры 3x4 */}
          <div className="flex-1 flex flex-col gap-2">
            {NUMERIC_LAYOUT.map((row, ri) => (
              <div key={ri} className="flex gap-2">
                {row.map((key) => (
                  <button
                    key={`${ri}-${key}`}
                    onClick={() => key === 'C' ? sendKey('CLEAR') : sendKey(key)}
                    className={`flex-1 h-14 rounded-xl text-xl font-bold transition-all active:scale-95 shadow-sm ${key === 'C'
                      ? 'bg-red-100 text-red-600 border-2 border-red-300 hover:bg-red-200'
                      : 'bg-white border-2 border-gray-300 text-gray-900 hover:bg-gray-50 active:bg-gray-200'
                      }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Правая часть: Действия (Стереть, Закрыть, Ввод) */}
          <div className="w-20 flex flex-col gap-2">
            <button
              onClick={() => sendKey('BACKSPACE')}
              className="h-14 bg-orange-100 text-orange-700 border-2 border-orange-300 rounded-xl flex items-center justify-center hover:bg-orange-200 active:scale-95 transition-all shadow-sm"
            >
              <Delete className="w-7 h-7" />
            </button>
            <button
              onClick={closeKeyboard}
              className="h-14 bg-gray-200 text-gray-700 border-2 border-gray-300 rounded-xl flex items-center justify-center hover:bg-gray-300 active:scale-95 transition-all shadow-sm"
            >
              <X className="w-7 h-7" />
            </button>
            <button
              onClick={() => sendKey('ENTER')}
              className="flex-1 bg-primary text-white border-2 border-primary rounded-xl flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all shadow-sm"
            >
              <CornerDownLeft className="w-7 h-7" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ====== ПОЛНАЯ QWERTY КЛАВИАТУРА ======
  const layout = isSymbolsMode ? LAYOUTS.symbols : LAYOUTS[lang];

  return (
    <div
      id="onscreen-keyboard"
      className="on-screen-keyboard fixed bottom-0 left-0 right-0 z-[9999] bg-gray-100 border-t-2 border-gray-300 shadow-2xl px-4 py-3 select-none"
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Верхняя панель */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSymbolsMode(!isSymbolsMode)}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-gray-200 text-gray-800 rounded-xl text-sm font-bold hover:bg-gray-300 transition-colors border border-gray-300"
          >
            {isSymbolsMode ? 'АБВ' : '123'}
          </button>
          {!isSymbolsMode && (
            <button
              onClick={cycleLang}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-bold hover:bg-blue-600 transition-colors"
            >
              <Globe className="w-4 h-4" />
              {LANG_LABELS[lang]}
            </button>
          )}
          {!isSymbolsMode && (
            <button
              onClick={() => setCapsLock(!capsLock)}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-colors ${capsLock ? 'bg-primary text-white shadow-inner' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
            >
              ⇪ CapsLock
            </button>
          )}
          {!isSymbolsMode && (
            <button
              onClick={() => setShift(!shift)}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-colors ${shift && !capsLock ? 'bg-primary text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
            >
              ⇧ Shift
            </button>
          )}
        </div>
        <button
          onClick={closeKeyboard}
          className="p-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Ряды клавиш */}
      {layout.map((row, ri) => (
        <div key={ri} className="flex justify-center gap-1.5 mb-1.5">
          {row.map((key) => (
            <button
              key={`${ri}-${key}`}
              onClick={() => sendKey(key)}
              className="flex-1 h-14 bg-white border-2 border-gray-300 rounded-xl text-lg font-bold text-gray-900 hover:bg-gray-50 active:bg-gray-200 active:scale-95 transition-all shadow-sm"
            >
              {(shift || capsLock) && !isSymbolsMode ? key.toUpperCase() : key}
            </button>
          ))}
        </div>
      ))}

      {/* Нижний ряд */}
      <div className="flex justify-center gap-1.5 mt-1">
        <button
          onClick={() => sendKey('SPACE')}
          className="h-14 flex-1 bg-white border-2 border-gray-300 rounded-xl text-base text-gray-500 font-medium hover:bg-gray-50 active:bg-gray-200 active:scale-[0.99] transition-all shadow-sm"
        >
          ─── пробел ───
        </button>
        <button
          onClick={() => sendKey('BACKSPACE')}
          className="h-14 px-6 bg-orange-100 text-orange-700 border-2 border-orange-300 rounded-xl font-bold text-lg hover:bg-orange-200 active:scale-95 transition-all flex items-center gap-2"
        >
          <Delete className="w-5 h-5" /> ←
        </button>
        <button
          onClick={() => sendKey('ENTER')}
          className="h-14 px-6 bg-primary text-white rounded-xl font-bold text-lg hover:bg-primary/90 active:scale-95 transition-all flex items-center gap-2"
        >
          <CornerDownLeft className="w-5 h-5" /> Ввод
        </button>
      </div>
    </div>
  );
}
