'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** Renders the otpauth:// URI as a QR image in the browser. The secret never leaves this page. */
export function QrCode({ value, alt }: { value: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(value, { margin: 1, width: 220, errorCorrectionLevel: 'M' })
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [value]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt={alt} width={220} height={220} className="qr" /> : <div className="qr placeholder" aria-hidden="true" />;
}
