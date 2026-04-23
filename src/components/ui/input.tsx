import * as React from 'react';
import { Keyboard } from 'lucide-react';
import { useKeyboardStore } from '../OnScreenKeyboard';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> { }

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', type, value, onChange, id, name, ...props }, forwardedRef) => {
    const internalRef = React.useRef<HTMLInputElement | null>(null);
    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        internalRef.current = node;
        if (typeof forwardedRef === 'function') {
          forwardedRef(node);
        } else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
        }
      },
      [forwardedRef]
    );

    const { openKeyboard, closeKeyboard, isOpen, activeInput } = useKeyboardStore();
    // Use an effect to force update if activeInput matches, but actually React might not re-render 
    // just because internalRef matches unless activeInput changes and triggers re-render via zustand
    const isActive = isOpen && activeInput === internalRef.current && internalRef.current !== null;

    const handleKeyboardClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const el = internalRef.current;
      if (!el) return;

      if (isActive) {
        closeKeyboard();
      } else {
        openKeyboard(el);
      }
    };

    return (
      <div className="relative">
        <input
          ref={setRefs}
          id={id}
          name={name}
          type={type}
          value={value ?? ''}
          onChange={onChange}
          inputMode="none"
          className={`flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 pr-9 text-sm ring-offset-white placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ${isActive ? 'ring-2 ring-blue-500 border-blue-500' : ''
            } ${className}`}
          {...props}
        />
        <button
          type="button"
          onMouseDown={handleKeyboardClick}
          tabIndex={-1}
          style={{ pointerEvents: 'auto' }}
          className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-colors z-10 ${isActive ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-gray-500 hover:bg-gray-100'
            }`}
        >
          <Keyboard size={14} />
        </button>
      </div>
    );
  }
);

Input.displayName = 'Input';
export { Input };