import { create } from 'zustand'

export interface Product {
  id: string;
  barcode: string;
  name: string;
  price_retail: number;
  measure_unit: string;
  is_weighable: boolean;
  is_marked: boolean;
  is_alcohol?: boolean;
  alcohol_abv?: number;
  alcohol_volume?: number;
  vat_rate?: number;
  stock_quantity?: number;
}

export interface CartItem extends Product {
  cartItemId: string; // Уникальный ID позиции в корзине
  quantity: number;
  discount: number; // Скидка на позицию в тенге
  subtotal: number; // Цена * Кол-во - Скидка
  mark_code?: string; // Код маркировки для этого товара
}

export type PaymentType = 'cash' | 'card' | 'mixed' | 'qr';

interface POSState {
  cart: CartItem[];
  globalDiscount: number; // Общая скидка на чек в тенге
  total: number; // Итоговая сумма к оплате (с учетом скидок)
  totalVat: number; // Сумма НДС в чеке

  // Добавление товара
  addItem: (product: Product, quantity?: number) => void;
  // Обновление количества (ввод веса)
  updateItemQuantity: (cartItemId: string, quantity: number) => void;
  // Обновление скидки на позицию
  updateItemDiscount: (cartItemId: string, discount: number) => void;
  // Добавление кода маркировки
  setItemMarkCode: (cartItemId: string, markCode: string) => void;
  // Удаление позиции
  removeItem: (cartItemId: string) => void;
  // Очистка корзины
  clearCart: () => void;
  // Установка общей скидки
  setGlobalDiscount: (discount: number) => void;
}

const calculateTotal = (cart: CartItem[], globalDiscount: number): { total: number, totalVat: number } => {
  const sum = cart.reduce((acc, item) => acc + item.subtotal, 0);
  const total = Math.max(0, sum - globalDiscount);

  // Расчет НДС (в том числе)
  const totalVat = cart.reduce((acc, item) => {
    const rate = item.vat_rate || 0;
    if (rate === 0) return acc;
    // НДС = Сумма * Стейт / (100 + Стейт)
    const proportion = item.subtotal / (sum || 1);
    const itemDiscount = globalDiscount * proportion;
    const itemTotal = Math.max(0, item.subtotal - itemDiscount);
    return acc + (itemTotal * rate / (100 + rate));
  }, 0);

  return { total, totalVat };
};

export const usePosStore = create<POSState>()(
  (set) => ({
    cart: [],
    globalDiscount: 0,
    total: 0,
    totalVat: 0,

    addItem: (product, quantity = 1) => set((state) => {
      // Ищем, есть ли уже такой товар в корзине (если он не весовой и не маркированный)
      const existingItemIndex = state.cart.findIndex(
        (item) => item.id === product.id && !item.is_weighable && !item.is_marked
      );

      if (existingItemIndex >= 0) {
        // Увеличиваем количество
        const newCart = [...state.cart];
        const item = newCart[existingItemIndex];
        const newQuantity = item.quantity + quantity;
        item.quantity = newQuantity;
        item.subtotal = Math.max(0, (item.price_retail * newQuantity) - item.discount);

        return {
          cart: newCart,
          ...calculateTotal(newCart, state.globalDiscount)
        };
      }

      // Добавляем новую позицию
      const newItem: CartItem = {
        ...product,
        cartItemId: crypto.randomUUID(),
        quantity,
        discount: 0,
        subtotal: product.price_retail * quantity
      };

      const newCart = [...state.cart, newItem];
      return {
        cart: newCart,
        ...calculateTotal(newCart, state.globalDiscount)
      };
    }),

    updateItemQuantity: (cartItemId, quantity) => set((state) => {
      const newCart = state.cart.map(item => {
        if (item.cartItemId === cartItemId) {
          const newQty = quantity > 0 ? quantity : 0;
          return {
            ...item,
            quantity: newQty,
            subtotal: Math.max(0, (item.price_retail * newQty) - item.discount)
          };
        }
        return item;
      });
      return { cart: newCart, ...calculateTotal(newCart, state.globalDiscount) };
    }),

    updateItemDiscount: (cartItemId, discount) => set((state) => {
      const newCart = state.cart.map(item => {
        if (item.cartItemId === cartItemId) {
          return {
            ...item,
            discount,
            subtotal: Math.max(0, (item.price_retail * item.quantity) - discount)
          };
        }
        return item;
      });
      return { cart: newCart, ...calculateTotal(newCart, state.globalDiscount) };
    }),

    setItemMarkCode: (cartItemId, markCode) => set((state) => {
      const newCart = state.cart.map(item =>
        item.cartItemId === cartItemId ? { ...item, mark_code: markCode } : item
      );
      return { cart: newCart };
    }),

    removeItem: (cartItemId) => set((state) => {
      const newCart = state.cart.filter(item => item.cartItemId !== cartItemId);
      return { cart: newCart, ...calculateTotal(newCart, state.globalDiscount) };
    }),

    clearCart: () => set({ cart: [], total: 0, totalVat: 0, globalDiscount: 0 }),

    setGlobalDiscount: (globalDiscount) => set((state) => ({
      globalDiscount,
      ...calculateTotal(state.cart, globalDiscount)
    })),
  })
)
