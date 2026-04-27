import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export const PrintableReceipt = React.forwardRef<HTMLDivElement, { receiptData: any; showFiscalBadge?: boolean }>(
  ({ receiptData, showFiscalBadge = true }, ref) => {
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');

    useEffect(() => {
      if (receiptData?.ofdTicketUrl) {
        QRCode.toDataURL(receiptData.ofdTicketUrl, { width: 140, margin: 0 })
          .then(url => setQrCodeDataUrl(url))
          .catch(err => console.error(err));
      }
    }, [receiptData?.ofdTicketUrl]);

    if (!receiptData) return null;

    const isFiscal = !!receiptData.ofdTicketUrl;

    const row = (labelRu: string, labelKk: string, value: string) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px', lineHeight: '1.2' }}>
        <span>{labelRu} / {labelKk}</span>
        <span>{value}</span>
      </div>
    );

    const simpleRow = (label: string, value: string) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '13px', lineHeight: '1.2' }}>
        <span>{label}</span>
        <span>{value}</span>
      </div>
    );

    const divider = <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }} />;

    return (
      <div
        ref={ref}
        id="printable-receipt"
        className="print-only"
        style={{
          width: '80mm',
          padding: '2mm',
          margin: '0',
          fontFamily: '"Courier New", Courier, monospace',
          color: '#000',
          background: '#fff',
          fontWeight: 'bold',
          boxSizing: 'border-box',
        }}
      >
        <style type="text/css" media="print">
          {`
            @page {
              margin: 0;
            }
            html, body {
              width: 80mm;
            }
            * {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          `}
        </style>

        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '14px', marginBottom: '4px' }}>Кассовый чек / Кассалық чек</div>
          <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
            {receiptData.type === 'return' ? 'Возврат прихода / Кірісті қайтару' :
              receiptData.type === 'moneyIn' ? 'Внесение наличных / Ақшаны енгізу' :
                receiptData.type === 'moneyOut' ? 'Изъятие наличных / Ақшаны алу' :
                  'Приход / Кіріс'}
          </div>
        </div>

        {divider}

        <div style={{ marginBottom: '8px', fontSize: '14px' }}>
          <div>{receiptData.companyName || 'Мой Магазин'}</div>
          <div>БИН/БСН: {receiptData.companyBin || '000000000000'}</div>
          {receiptData.companyAddress && <div>{receiptData.companyAddress}</div>}
        </div>

        <div style={{ marginBottom: '8px' }}>
          {simpleRow(receiptData.date || new Date().toLocaleString('ru-RU').replace(',', ''), `ЧЕК # ${String(receiptData.receiptNumber || '1').padStart(5, '0')}`)}
          {simpleRow(`КАССИР: ${receiptData.cashierName || 'Администратор'}`, `СМЕНА # ${String(receiptData.shiftNumber || '1').padStart(5, '0')}`)}
        </div>

        {divider}

        {(receiptData.type === 'moneyIn' || receiptData.type === 'moneyOut') ? (
          <div style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '15px', fontWeight: 'bold' }}>
              <span>СУММА / СОМАСЫ</span>
              <span>{Number(receiptData.totalAmount || 0).toFixed(2)}</span>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: '8px' }}>
            {receiptData.items?.map((item: any, idx: number) => {
              const rate = parseFloat(item.vat_rate || '0');
              const itemVat = rate > 0 ? (item.total * (rate / (100 + rate))) : 0;
              return (
                <div key={idx} style={{ marginBottom: '8px' }}>
                  <div style={{ textTransform: 'uppercase', fontSize: '14px', marginBottom: '2px' }}>
                    {item.name}
                  </div>
                  {item.name_kk && (
                    <div style={{ textTransform: 'uppercase', fontStyle: 'italic', fontSize: '14px', marginBottom: '2px' }}>
                      {item.name_kk}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '20px', fontSize: '13px' }}>
                    <span>{Number(item.quantity).toFixed(2)} x {Number(item.price).toFixed(2)}</span>
                    <span>= {Number(item.total).toFixed(2)}</span>
                  </div>
                  {rate > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '20px', fontSize: '13px' }}>
                      <span>НДС/ҚҚС {rate}%</span>
                      <span>= {itemVat.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {divider}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '20px', fontWeight: '900' }}>
          <span>ИТОГ / ЖИЫНЫ</span>
          <span>{Number(receiptData.totalAmount || 0).toFixed(2)}</span>
        </div>

        <div style={{ marginBottom: '8px' }}>
          {row('Наличными', 'Қолма-қол', `= ${Number(receiptData.cashAmount || 0).toFixed(2)}`)}
          {row('Безналичными', 'Қолма-қолсыз', `= ${Number(receiptData.cardAmount || 0).toFixed(2)}`)}
          {row('Сдача', 'Қайтарым', `= ${Math.max(0, (Number(receiptData.cashAmount || 0) + Number(receiptData.cardAmount || 0)) - Number(receiptData.totalAmount || 0)).toFixed(2)}`)}
        </div>

        {divider}

        {!(receiptData.type === 'moneyIn' || receiptData.type === 'moneyOut') && (
          <div style={{ marginBottom: '8px' }}>
            {row('Налогообложение', 'Салық салу', receiptData.taxRegime || 'СНР')}
            {receiptData.vatAmount > 0 && row('Сумма НДС', 'ҚҚС сомасы', `= ${Number(receiptData.vatAmount || 0).toFixed(2)}`)}
          </div>
        )}

        {divider}

        {isFiscal && qrCodeDataUrl ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
              <img src={qrCodeDataUrl} alt="QR Code" style={{ width: '140px', height: '140px' }} />
            </div>
            {showFiscalBadge && (
              <div style={{ textAlign: 'center', fontSize: '13px', margin: '8px 0' }}>
                ФИСКАЛЬНЫЙ ЧЕК / ФИСКАЛДЫҚ ЧЕК
              </div>
            )}
            <div style={{ marginTop: '8px', fontSize: '12px', textAlign: 'center', wordBreak: 'break-all' }}>
              <div>КГД МФ РК - kgd.gov.kz</div>
              <div>ОФД: ТОО "WebKassa" - webkassa.kz</div>
              <div style={{ marginTop: '4px', fontStyle: 'italic' }}>Проверить чек / Чекті тексеру:</div>
              <div style={{ fontSize: '10px' }}>{receiptData.ofdTicketUrl}</div>
            </div>
          </>
        ) : (
          showFiscalBadge && (
            <div style={{ textAlign: 'center', margin: '8px 0', fontSize: '13px' }}>
              НЕФИСКАЛЬНЫЙ ЧЕК / ФИСКАЛДЫҚ ЕМЕС ЧЕК
            </div>
          )
        )}

        <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '14px' }}>
          {!(receiptData.type === 'moneyIn' || receiptData.type === 'moneyOut') && (
            <>
              <div style={{ marginBottom: '4px' }}>Тип оплаты / Төлем түрі:</div>
              <div style={{ marginBottom: '16px' }}>
                {receiptData.paymentType === 'card' ? 'БЕЗНАЛИЧНЫМИ / ҚОЛМА-ҚОЛСЫЗ' :
                  receiptData.paymentType === 'cash' ? 'НАЛИЧНЫМИ / ҚОЛМА-ҚОЛ' :
                    receiptData.paymentType === 'mixed' ? 'СМЕШАННАЯ / АРАЛАС' : 'QR-ТӨЛЕМ'}
              </div>
              <div style={{ marginBottom: '4px' }}>*** СПАСИБО ЗА ПОКУПКУ ***</div>
              <div>САТЫП АЛҒАНЫҢЫЗҒА РАҚМЕТ</div>
            </>
          )}
        </div>

        <div style={{ height: '50px' }}></div>
      </div>
    );
  }
);

PrintableReceipt.displayName = 'PrintableReceipt';

