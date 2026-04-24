import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Input } from './ui/input';
import { KeyboardIcon } from './KeyboardIcon';

interface WarehouseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  companyId: string;
}

export function WarehouseModal({ isOpen, onClose, onSuccess, companyId }: WarehouseModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Введите название склада');

    setIsSubmitting(true);
    try {
      const res = await window.electronAPI.warehouses.create({
        companyId,
        name: name.trim(),
        address: address.trim() || undefined
      });

      if (res.success) {
        toast.success('Склад успешно создан');
        setName('');
        setAddress('');
        onSuccess();
        onClose();
      } else {
        toast.error(res.error || 'Ошибка создания склада');
      }
    } catch (err) {
      toast.error('Ошибка сервера');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center animate-in fade-in p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            Новый склад
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold p-2 transition-colors">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex-1 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Название склада <span className="text-red-500">*</span></label>
            <div className="relative">
              <Input
                required
                value={name}
                onChange={e => setName(e.target.value.substring(0, 50))}
                type="text"
                className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
                placeholder="Склад №2"
                maxLength={50}
              />
              <KeyboardIcon />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Адрес (необязательно)</label>
            <div className="relative">
              <Input
                value={address}
                onChange={e => setAddress(e.target.value.substring(0, 100))}
                type="text"
                className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
                placeholder="ул. Абая 10"
                maxLength={100}
              />
              <KeyboardIcon />
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl font-medium shadow-sm transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Сохранение...' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
