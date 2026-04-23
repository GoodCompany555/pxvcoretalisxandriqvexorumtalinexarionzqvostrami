import React, { useRef } from 'react';
import { Keyboard } from 'lucide-react';
import { useKeyboardStore } from './OnScreenKeyboard';

interface KeyboardIconProps {
  /** Ref to the input element this icon controls. If not provided, searches for nearest sibling input. */
  inputRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement>;
  className?: string;
}

/**
 * Маленькая иконка клавиатуры ⌨ — ставится рядом с <input>.
 * По клику открывает встроенную экранную клавиатуру для этого поля.
 *
 * Использование:
 * ```tsx
 * <div className="relative">
 *   <input ref={myRef} ... />
 *   <KeyboardIcon inputRef={myRef} />
 * </div>
 * ```
 *
 * Или без ref (ищет ближайший input в parent):
 * ```tsx
 * <div className="relative">
 *   <input ... />
 *   <KeyboardIcon />
 * </div>
 * ```
 */
export function KeyboardIcon({ inputRef, className = '' }: KeyboardIconProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const { openKeyboard, closeKeyboard, isOpen, activeInput } = useKeyboardStore();

  const getInput = (): HTMLInputElement | HTMLTextAreaElement | null => {
    if (inputRef?.current) return inputRef.current;
    // Ищем ближайший input/textarea в родительском контейнере
    const parent = btnRef.current?.parentElement;
    if (!parent) return null;
    return parent.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null;
  };

  const input = getInput();
  const isThisActive = isOpen && activeInput === input && input !== null;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = getInput();
    if (!el) return;

    if (isThisActive) {
      closeKeyboard();
    } else {
      openKeyboard(el);
    }
  };

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={handleClick}
      tabIndex={-1}
      className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-colors z-10
        ${isThisActive
          ? 'text-blue-600 bg-blue-50'
          : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
        }
        ${className}
      `}
      title="Открыть клавиатуру"
    >
      <Keyboard size={16} />
    </button>
  );
}
