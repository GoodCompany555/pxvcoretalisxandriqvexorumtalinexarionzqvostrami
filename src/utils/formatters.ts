/**
 * Форматирует строку под маску +7 777 777 77 77
 */
export const formatPhone = (value: string): string => {
  // Оставляем только цифры
  const numbers = value.replace(/\D/g, '');

  // Если начинается с 7 или 8 (для РФ/РК), нормализуем на 7
  let cleaned = numbers;
  if (cleaned.startsWith('8')) {
    cleaned = '7' + cleaned.substring(1);
  }

  // Ограничиваем 11 цифрами
  if (cleaned.length > 11) {
    cleaned = cleaned.substring(0, 11);
  }

  if (!cleaned) return '';
  if (cleaned.length <= 1) return `+${cleaned}`;

  let formatted = `+${cleaned.substring(0, 1)}`;

  if (cleaned.length > 1) {
    formatted += ` ${cleaned.substring(1, 4)}`;
  }
  if (cleaned.length > 4) {
    formatted += ` ${cleaned.substring(4, 7)}`;
  }
  if (cleaned.length > 7) {
    formatted += ` ${cleaned.substring(7, 9)}`;
  }
  if (cleaned.length > 9) {
    formatted += ` ${cleaned.substring(9, 11)}`;
  }

  return formatted;
};

/**
 * Ограничивает цену максимальным значением
 */
export const limitPrice = (value: string | number, max: number = 1000000): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '';
  if (num > max) return max.toString();
  return num.toString();
};

/**
 * Переводит русские символы в английские (для сканеров штрихкодов)
 */
export const fixCyrillicBarcode = (input: string): string => {
  if (!input) return '';
  const ru = 'йцукенгшщзхъфывапролджэячсмитьбюЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ';
  const en = "qwertyuiop[]asdfghjkl;'zxcvbnm,.QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>";
  return input.split('').map(char => {
    const index = ru.indexOf(char);
    return index !== -1 ? en[index] : char;
  }).join('');
};
