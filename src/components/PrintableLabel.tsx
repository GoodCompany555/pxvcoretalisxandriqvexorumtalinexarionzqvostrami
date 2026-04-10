import React from 'react';
import Barcode from 'react-barcode';

export interface LabelData {
  companyName: string;
  productName: string;
  productNameKz?: string;
  unit: string;
  price: number;
  barcode: string;
}

export const PrintableLabel = React.forwardRef<HTMLDivElement, { labelData: LabelData | null }>(
  ({ labelData }, ref) => {
    // ВАЖНО: ref ВСЕГДА привязан к DOM-элементу, даже если данных нет.
    // Иначе react-to-print не может найти элемент для печати.
    return (
      <div ref={ref} id="printable-label">
        {labelData && (
          <div
            style={{
              width: '58mm',
              minHeight: '40mm',
              padding: '2mm',
              margin: '0',
              fontFamily: 'Arial, Helvetica, sans-serif',
              color: '#000',
              background: '#fff',
              boxSizing: 'border-box',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
            }}
          >
            <style type="text/css">
              {`
                @media print {
                  @page {
                    size: 58mm 40mm;
                    margin: 0 !important;
                  }
                  html, body {
                    width: 58mm !important;
                    height: 40mm !important;
                    margin: 0 !important;
                    padding: 0 !important;
                  }
                  #printable-label {
                    width: 58mm !important;
                    min-height: 40mm !important;
                    margin: 0 !important;
                    padding: 0 !important;
                  }
                  * {
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                  }
                }
              `}
            </style>

            {/* Header - Shop Name */}
            <div style={{
              fontSize: '10px',
              fontWeight: 'bold',
              borderBottom: '1px solid #000',
              width: '100%',
              textAlign: 'center',
              paddingBottom: '2px',
              marginBottom: '2px',
              textTransform: 'uppercase'
            }}>
              {labelData.companyName || 'МАГАЗИН'}
            </div>

            {/* Product Name RU */}
            <div style={{
              fontSize: '12px',
              fontWeight: 'bold',
              textAlign: 'center',
              lineHeight: '1.2',
              marginTop: '2px',
              maxHeight: '28px',
              overflow: 'hidden',
              wordBreak: 'break-word'
            }}>
              {labelData.productName}
            </div>

            {/* Product Name KZ */}
            {labelData.productNameKz && (
              <div style={{
                fontSize: '11px',
                fontStyle: 'italic',
                textAlign: 'center',
                lineHeight: '1.1'
              }}>
                {labelData.productNameKz}
              </div>
            )}

            {/* Unit */}
            <div style={{
              fontSize: '10px',
              textAlign: 'center',
              marginTop: '2px'
            }}>
              1 {labelData.unit || 'шт'}
            </div>

            {/* Price */}
            <div style={{
              fontSize: '22px',
              fontWeight: '900',
              textAlign: 'center',
              marginTop: '3px',
              lineHeight: '1',
              letterSpacing: '-0.5px'
            }}>
              {labelData.price.toLocaleString('ru-RU')} ₸
            </div>

            {/* Barcode */}
            <div style={{
              marginTop: 'auto',
              display: 'flex',
              justifyContent: 'center',
              width: '100%',
              overflow: 'hidden',
              paddingTop: '2px'
            }}>
              <Barcode
                value={labelData.barcode || '0000000000000'}
                width={1.4}
                height={26}
                fontSize={10}
                margin={0}
                displayValue={true}
                background="#fff"
              />
            </div>
          </div>
        )}
      </div>
    );
  }
);

PrintableLabel.displayName = 'PrintableLabel';
