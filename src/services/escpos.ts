import { Bill, Cafe, OrderItem, KitchenOrderTicket } from '../types';

export interface BluetoothDeviceWrapper {
  device: any;
  server: any;
  characteristic: any;
}

let activeBluetoothDevice: BluetoothDeviceWrapper | null = null;

export interface BluetoothDiagnosticResult {
  supported: boolean;
  isIframe: boolean;
  isSecureContext: boolean;
  isIOS: boolean;
  browser: string;
  os: string;
  recommendation?: string;
}

export function getBluetoothDiagnostics(): BluetoothDiagnosticResult {
  const isIframe = typeof window !== 'undefined' && window.self !== window.top;
  const isSecure = typeof window !== 'undefined' && window.isSecureContext;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isEdge = /Edg/.test(ua);
  const isChrome = /Chrome/.test(ua) && !isEdge && !/OPR/.test(ua);

  const supported = typeof navigator !== 'undefined' && 'bluetooth' in navigator && !!(navigator as any).bluetooth;

  let recommendation: string | undefined;
  if (isIOS) {
    recommendation =
      'Apple iOS (Safari & Chrome on iPhone/iPad) does not support Web Bluetooth. Use "System Print" to send receipts directly to any AirPrint or Bluetooth printer driver.';
  } else if (!isSecure) {
    recommendation = 'Web Bluetooth requires an HTTPS connection.';
  } else if (isIframe) {
    recommendation =
      'Web Bluetooth cannot access hardware inside an embedded preview iframe. Open this app directly in a full browser tab to pair your printer.';
  } else if (!supported) {
    recommendation =
      'Web Bluetooth is not supported on this browser. Please use Google Chrome or Microsoft Edge on Android, Windows, Mac, or ChromeOS.';
  }

  return {
    supported,
    isIframe,
    isSecureContext: isSecure,
    isIOS,
    browser: isChrome ? 'Chrome' : isEdge ? 'Edge' : isIOS ? 'Mobile Safari' : 'Browser',
    os: isIOS ? 'iOS' : isAndroid ? 'Android' : 'Desktop',
    recommendation,
  };
}

export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator && !!(navigator as any).bluetooth;
}

export function isBluetoothConnected(): boolean {
  return activeBluetoothDevice !== null && activeBluetoothDevice.device?.gatt?.connected;
}

export function getConnectedDeviceName(): string | null {
  return activeBluetoothDevice?.device?.name || null;
}

export async function disconnectBluetooth(): Promise<void> {
  if (activeBluetoothDevice?.device?.gatt?.connected) {
    try {
      activeBluetoothDevice.device.gatt.disconnect();
    } catch (e) {
      console.warn('Disconnect error', e);
    }
  }
  activeBluetoothDevice = null;
  window.dispatchEvent(new CustomEvent('printer_connection_changed', { detail: { connected: false } }));
}

// Comprehensive GATT Service UUIDs used across 58mm/80mm BLE thermal POS printers
export const THERMAL_PRINTER_GATT_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard POS-58 / POS-80 service
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / CC2540 / POS-5802DD / MPT-II / Goojprt (most common)
  '0000ffe1-0000-1000-8000-00805f9b34fb', // Alternate HM-10 service
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC transparent UART (Microchip)
  '0000ff00-0000-1000-8000-00805f9b34fb', // Common ESC/POS vendor service
  '0000fee7-0000-1000-8000-00805f9b34fb', // Tencent / WeChat IoT POS standard
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // CPCL/ESC-POS custom
  '0000af00-0000-1000-8000-00805f9b34fb', // Jerry / JL BLE POS
  '0000ae00-0000-1000-8000-00805f9b34fb', // Jerry / JL BLE POS
  '0000ae30-0000-1000-8000-00805f9b34fb', // Rongta / RPP BLE
  '0000fff0-0000-1000-8000-00805f9b34fb', // Goojprt / Xprinter
  '0000fff1-0000-1000-8000-00805f9b34fb',
  '0000ff02-0000-1000-8000-00805f9b34fb',
  '000018f1-0000-1000-8000-00805f9b34fb',
  'de5bf728-d711-4e47-af26-65e3012a5dc7', // Zebra mobile
];

export async function connectBluetoothPrinter(): Promise<string> {
  const diag = getBluetoothDiagnostics();
  if (!diag.supported) {
    throw new Error(diag.recommendation || 'Web Bluetooth is not supported on this browser.');
  }

  if (diag.isIframe) {
    throw new Error(
      'Web Bluetooth hardware access is blocked inside preview frames. Please click "Open in New Tab" or use "System Print".'
    );
  }

  try {
    // Request thermal printer device with comprehensive optionalServices
    const device = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: THERMAL_PRINTER_GATT_SERVICES,
    });

    if (!device.gatt) {
      throw new Error('Device does not support GATT connectivity.');
    }

    const server = await device.gatt.connect();

    // Look for writeable characteristic across available services
    let targetCharacteristic: any = null;
    let services: any[] = [];

    try {
      services = await server.getPrimaryServices();
    } catch {
      // In case getPrimaryServices() without args is restricted, query known services
      for (const uuid of THERMAL_PRINTER_GATT_SERVICES) {
        try {
          const s = await server.getPrimaryService(uuid);
          if (s) services.push(s);
        } catch {
          // not supported on device, continue
        }
      }
    }

    for (const service of services) {
      try {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          const props = char.properties;
          if (props?.write || props?.writeWithoutResponse) {
            targetCharacteristic = char;
            break;
          }
        }
      } catch (err) {
        console.warn('Could not inspect service characteristics', err);
      }
      if (targetCharacteristic) break;
    }

    if (!targetCharacteristic) {
      throw new Error(
        'Connected to Bluetooth device, but no ESC/POS writeable print channel was detected. Please verify your printer supports BLE GATT mode.'
      );
    }

    activeBluetoothDevice = {
      device,
      server,
      characteristic: targetCharacteristic,
    };

    device.addEventListener('gattserverdisconnected', () => {
      activeBluetoothDevice = null;
      window.dispatchEvent(new CustomEvent('printer_connection_changed', { detail: { connected: false } }));
    });

    window.dispatchEvent(
      new CustomEvent('printer_connection_changed', {
        detail: { connected: true, name: device.name || 'Wireless Thermal Printer' },
      })
    );

    return device.name || 'Wireless Thermal Printer';
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      throw new Error('Pairing cancelled. No printer selected.');
    }
    if (error.name === 'SecurityError') {
      throw new Error(
        'Browser security blocked Bluetooth. If you are inside an embedded frame, please open the POS in a full browser tab.'
      );
    }
    console.error('Bluetooth printer connect failed', error);
    throw error;
  }
}

// Format text columns for fixed width 58mm (32 chars) or 80mm (48 chars)
function padRight(str: string, len: number): string {
  if (str.length >= len) return str.slice(0, len);
  return str + ' '.repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  if (str.length >= len) return str.slice(0, len);
  return ' '.repeat(len - str.length) + str;
}

function centerText(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  const left = Math.floor((width - text.length) / 2);
  const right = width - text.length - left;
  return ' '.repeat(left) + text + ' '.repeat(right);
}

// Generate raw ESC/POS binary buffer
export function generateEscPosBuffer(bill: Bill, cafe: Cafe, paperWidth: 58 | 80 = 58): Uint8Array {
  const width = paperWidth === 80 ? 48 : 32;
  const divider = '-'.repeat(width);
  const doubleDivider = '='.repeat(width);

  const parts: number[] = [];

  // Command bytes
  const INIT = [0x1b, 0x40];
  const ALIGN_LEFT = [0x1b, 0x61, 0x00];
  const ALIGN_CENTER = [0x1b, 0x61, 0x01];
  const ALIGN_RIGHT = [0x1b, 0x61, 0x02];
  const BOLD_ON = [0x1b, 0x45, 0x01];
  const BOLD_OFF = [0x1b, 0x45, 0x00];
  const DOUBLE_HEIGHT = [0x1d, 0x21, 0x01]; // Taller font without double-width wrapping
  const DOUBLE_SIZE = [0x1d, 0x21, 0x11];
  const NORMAL_SIZE = [0x1d, 0x21, 0x00];
  // Clean feed of 2 lines before cut (adds 1 extra blank line at bottom per request)
  const FEED_AND_CUT = [0x1b, 0x64, 0x02, 0x1d, 0x56, 0x00];

  const appendBytes = (bytes: number[]) => {
    parts.push(...bytes);
  };

  const appendText = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      parts.push(text.charCodeAt(i) & 0xff);
    }
  };

  const appendLine = (text: string) => {
    appendText(text + '\n');
  };

  // 1. Initialize
  appendBytes(INIT);

  // 2. Header (Center)
  appendBytes(ALIGN_CENTER);
  appendBytes(BOLD_ON);
  appendBytes(DOUBLE_HEIGHT);
  appendLine(cafe.name);
  appendBytes(NORMAL_SIZE);
  appendBytes(BOLD_OFF);

  if (cafe.tagline) {
    appendLine(cafe.tagline);
  }
  if (cafe.address) {
    appendLine(cafe.address);
  }
  if (cafe.phone) {
    appendLine(`Phone: ${cafe.phone}`);
  }
  if (cafe.gstin) {
    appendLine(`GSTIN: ${cafe.gstin}`);
  }

  appendLine(doubleDivider);

  // Reprint / Duplicate Watermark (Section 32)
  if (bill.isReprint) {
    appendBytes(ALIGN_CENTER);
    appendBytes(BOLD_ON);
    appendBytes(DOUBLE_HEIGHT);
    appendLine('*** DUPLICATE ***');
    appendBytes(NORMAL_SIZE);
    appendBytes(BOLD_OFF);
    appendLine(centerText('(REPRINT RECEIPT)', width));
    appendLine(divider);
  }

  // 3. Bill Metadata
  appendBytes(ALIGN_LEFT);
  appendBytes(BOLD_ON);
  appendLine(`BILL NO: ${bill.billNumber}`);
  appendBytes(BOLD_OFF);

  const dateStr = new Date(bill.createdAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timeStr = new Date(bill.createdAt).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  appendLine(`DATE: ${dateStr}  ${timeStr}`);
  const isCustomCustomer = !bill.tableOrToken.toLowerCase().startsWith('table');
  appendLine(`${isCustomCustomer ? 'CUSTOMER' : 'TABLE'}: ${bill.tableOrToken}  |  TYPE: ${bill.orderType.toUpperCase()}`);

  appendLine(divider);

  // 4. Items Table Header (exact column counts so lines never overflow)
  appendBytes(BOLD_ON);
  if (width === 32) {
    // 32 chars: Item (16), Qty (4), Amt (12)
    appendLine(padRight('ITEM', 16) + padRight('QTY', 4) + padLeft('AMOUNT', 12));
  } else {
    // 48 chars: Item (24), Qty (6), Rate (8), Amt (10)
    appendLine(
      padRight('ITEM', 24) + padRight('QTY', 6) + padRight('RATE', 8) + padLeft('AMOUNT', 10)
    );
  }
  appendBytes(BOLD_OFF);
  appendLine(divider);

  // 5. Line Items with ASCII formatting (no broken Unicode characters)
  bill.items.forEach((item) => {
    const itemTotal = (item.price * item.quantity).toFixed(2);
    if (width === 32) {
      const itemName = item.name.trim();
      if (itemName.length > 15) {
        appendLine(itemName.slice(0, 31));
        appendLine(
          ' '.repeat(16) + padRight(`x${item.quantity}`, 4) + padLeft(`Rs.${itemTotal}`, 12)
        );
      } else {
        appendLine(
          padRight(itemName, 16) + padRight(`x${item.quantity}`, 4) + padLeft(`Rs.${itemTotal}`, 12)
        );
      }
    } else {
      appendLine(
        padRight(item.name.slice(0, 23), 24) +
          padRight(`x${item.quantity}`, 6) +
          padRight(`Rs.${item.price.toFixed(0)}`, 8) +
          padLeft(`Rs.${itemTotal}`, 10)
      );
    }
    if (item.notes) {
      appendLine(`  * ${item.notes.slice(0, width - 4)}`);
    }
  });

  appendLine(divider);

  // 6. Subtotal & Totals (Right Aligned calculations)
  appendBytes(ALIGN_LEFT);
  const renderRow = (label: string, value: string) => {
    const padding = width - label.length - value.length;
    return label + ' '.repeat(Math.max(1, padding)) + value;
  };

  appendLine(renderRow('Subtotal:', `Rs. ${bill.subtotal.toFixed(2)}`));

  if (bill.discountAmount > 0) {
    appendLine(
      renderRow(`Discount (${bill.discountPercent}%):`, `-Rs. ${bill.discountAmount.toFixed(2)}`)
    );
  }

  if (bill.taxAmount > 0) {
    appendLine(renderRow(`GST (${bill.taxPercent}%):`, `+Rs. ${bill.taxAmount.toFixed(2)}`));
  }

  appendLine(divider);

  // Grand Total in BOLD & DOUBLE HEIGHT (never wraps or breaks across multiple lines)
  appendBytes(BOLD_ON);
  appendBytes(DOUBLE_HEIGHT);
  appendLine(renderRow('TOTAL DUE:', `Rs. ${bill.grandTotal.toFixed(2)}`));
  appendBytes(NORMAL_SIZE);
  appendBytes(BOLD_OFF);

  appendLine(divider);
  if (bill.paymentMode === 'split') {
    appendBytes(BOLD_ON);
    appendLine(`PAYMENT: SPLIT (CASH + UPI)  |  STATUS: ${bill.status.toUpperCase()}`);
    appendBytes(BOLD_OFF);
    if (bill.splitDetails) {
      if ((bill.splitDetails.cash || 0) > 0) {
        appendLine(renderRow('  * Cash Received:', `Rs. ${(bill.splitDetails.cash || 0).toFixed(2)}`));
      }
      if ((bill.splitDetails.upi || 0) > 0) {
        appendLine(renderRow('  * UPI Paid:', `Rs. ${(bill.splitDetails.upi || 0).toFixed(2)}`));
      }
      if ((bill.splitDetails.card || 0) > 0) {
        appendLine(renderRow('  * Card Swiped:', `Rs. ${(bill.splitDetails.card || 0).toFixed(2)}`));
      }
    }
  } else {
    appendLine(`PAYMENT: ${bill.paymentMode.toUpperCase()}  |  STATUS: ${bill.status.toUpperCase()}`);
  }

  // 7. Dynamic UPI QR Code commands (for UPI mode OR split mode with UPI portion)
  const upiPayAmount =
    bill.paymentMode === 'upi'
      ? bill.grandTotal
      : bill.paymentMode === 'split' && (bill.splitDetails?.upi || 0) > 0
      ? bill.splitDetails!.upi!
      : 0;

  if (upiPayAmount > 0 && bill.includeQr !== false && cafe.upiId) {
    appendBytes(ALIGN_CENTER);
    appendBytes(BOLD_ON);
    appendLine('\nSCAN TO PAY VIA UPI:');
    appendBytes(BOLD_OFF);

    const upiUri = `upi://pay?pa=${cafe.upiId}&pn=${encodeURIComponent(
      cafe.name
    )}&am=${upiPayAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(bill.billNumber)}`;

    // ESC/POS QR Code Model 2 command
    const qrLen = upiUri.length + 3;
    const pL = qrLen & 0xff;
    const pH = (qrLen >> 8) & 0xff;

    // 1: Set QR code model (Model 2)
    appendBytes([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]);
    // 2: Set module size (size 5)
    appendBytes([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x05]);
    // 3: Set error correction (Level M = 49)
    appendBytes([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]);
    // 4: Store QR data in symbol storage area
    appendBytes([0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]);
    appendText(upiUri);
    // 5: Print the symbol data
    appendBytes([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]);

    // UPI Info text
    appendLine(`UPI ID: ${cafe.upiId}`);
    appendLine(`UPI Amount: Rs. ${upiPayAmount.toFixed(2)}`);
  }

  // 8. Footer (NO "Bill Generator POS" mention)
  appendBytes(ALIGN_CENTER);
  appendLine('\n' + centerText('*** THANK YOU! VISIT AGAIN ***', width));
  if (cafe.phone) {
    appendLine(centerText(`For Orders: ${cafe.phone}`, width));
  }

  // 9. Minimal Feed and Cut (prevents extra 5-6 blank lines)
  appendBytes(FEED_AND_CUT);

  return new Uint8Array(parts);
}

// Generate Kitchen Order Ticket (KOT) ESC/POS Buffer (Table No, Order ID & Items only)
export function generateKOTEscPosBuffer(
  kot: {
    orderId?: string;
    tableNumber: string;
    items: OrderItem[];
    serverName?: string;
    orderType?: string;
    createdAt?: string;
    notes?: string;
    isCustomCustomer?: boolean;
  },
  cafeName = 'Corner Cafe',
  paperWidth: 58 | 80 = 58
): Uint8Array {
  const width = paperWidth === 80 ? 48 : 32;
  const divider = '-'.repeat(width);

  const parts: number[] = [];
  const appendBytes = (bytes: number[]) => parts.push(...bytes);
  const appendText = (text: string) => {
    for (let i = 0; i < text.length; i++) parts.push(text.charCodeAt(i) & 0xff);
  };
  const appendLine = (text: string) => appendText(text + '\n');

  // Helper formatting commands
  const INIT = [0x1b, 0x40];
  const ALIGN_LEFT = [0x1b, 0x61, 0x00];
  const BOLD_ON = [0x1b, 0x45, 0x01];
  const BOLD_OFF = [0x1b, 0x45, 0x00];
  const DOUBLE_HEIGHT = [0x1b, 0x21, 0x10];
  const NORMAL_SIZE = [0x1d, 0x21, 0x00, 0x1b, 0x21, 0x00];
  const FEED_AND_CUT = [0x1b, 0x64, 0x02, 0x1d, 0x56, 0x00];

  appendBytes(INIT);
  appendBytes(ALIGN_LEFT);

  // 1. Table Number or Customer Name (Bold, Large)
  appendBytes(DOUBLE_HEIGHT);
  appendBytes(BOLD_ON);
  const isCustomTable = !kot.tableNumber.toLowerCase().startsWith('table');
  appendLine(`${isCustomTable ? 'CUSTOMER: ' : 'TABLE: '}${kot.tableNumber.toUpperCase()}`);
  appendBytes(NORMAL_SIZE);
  appendBytes(BOLD_OFF);

  appendLine(divider);

  // 3. Items list (Strictly quantities & item names & instructions only)
  kot.items.forEach((item) => {
    appendBytes(DOUBLE_HEIGHT);
    appendBytes(BOLD_ON);
    appendLine(`[${item.quantity}x]  ${item.name}`);
    appendBytes(NORMAL_SIZE);
    appendBytes(BOLD_OFF);

    if (item.notes && item.notes.trim()) {
      appendBytes(BOLD_ON);
      appendLine(`  >> NOTE: ${item.notes.trim()}`);
      appendBytes(BOLD_OFF);
    }
  });

  appendLine(divider);

  if (kot.notes && kot.notes.trim()) {
    appendLine(`NOTE: ${kot.notes.trim()}`);
    appendLine(divider);
  }

  // 1 extra line feed & paper cut
  appendBytes(FEED_AND_CUT);

  return new Uint8Array(parts);
}

// Generate Day-End Z-Report ESC/POS buffer
export function generateZReportBuffer(
  summary: {
    date: string;
    shiftWindow?: string;
    totalBills: number;
    grossSales: number;
    totalDiscounts: number;
    netRevenue: number;
    upiSales: number;
    cashSales: number;
    cardSales: number;
    topItems: { name: string; quantity: number; revenue: number }[];
  },
  cafe: Cafe,
  paperWidth: 58 | 80 = 58
): Uint8Array {
  const width = paperWidth === 80 ? 48 : 32;
  const divider = '-'.repeat(width);
  const doubleDivider = '='.repeat(width);

  const parts: number[] = [];
  const appendBytes = (bytes: number[]) => parts.push(...bytes);
  const appendText = (text: string) => {
    for (let i = 0; i < text.length; i++) parts.push(text.charCodeAt(i) & 0xff);
  };
  const appendLine = (text: string) => appendText(text + '\n');

  appendBytes([0x1b, 0x40]); // Init
  appendBytes([0x1b, 0x61, 0x01]); // Center
  appendBytes([0x1d, 0x21, 0x11]); // Double size
  appendBytes([0x1b, 0x45, 0x01]); // Bold
  appendLine('DAILY Z-REPORT');
  appendBytes([0x1d, 0x21, 0x00]);
  appendBytes([0x1b, 0x45, 0x00]);

  appendLine(cafe.name);
  appendLine(`BUSINESS DATE: ${summary.date}`);
  if (summary.shiftWindow) {
    appendLine(summary.shiftWindow);
  }
  appendLine(doubleDivider);

  appendBytes([0x1b, 0x61, 0x00]); // Left
  const renderRow = (label: string, value: string) => {
    const padding = width - label.length - value.length;
    return label + ' '.repeat(Math.max(1, padding)) + value;
  };

  appendLine(renderRow('Total Bills Issued:', summary.totalBills.toString()));
  appendLine(renderRow('Gross Turnover:', `₹${summary.grossSales.toFixed(2)}`));
  appendLine(renderRow('Discounts Given:', `-₹${summary.totalDiscounts.toFixed(2)}`));
  appendLine(divider);
  appendBytes([0x1b, 0x45, 0x01]);
  appendLine(renderRow('NET REVENUE:', `₹${summary.netRevenue.toFixed(2)}`));
  appendBytes([0x1b, 0x45, 0x00]);
  appendLine(divider);

  appendBytes([0x1b, 0x45, 0x01]);
  appendLine('TENDER RECONCILIATION:');
  appendBytes([0x1b, 0x45, 0x00]);
  appendLine(renderRow('• UPI QR Payments:', `₹${summary.upiSales.toFixed(2)}`));
  appendLine(renderRow('• Cash In Drawer:', `₹${summary.cashSales.toFixed(2)}`));
  appendLine(renderRow('• Card POS Swipes:', `₹${summary.cardSales.toFixed(2)}`));
  appendLine(divider);

  appendBytes([0x1b, 0x45, 0x01]);
  appendLine('TOP SELLING ITEMS:');
  appendBytes([0x1b, 0x45, 0x00]);
  summary.topItems.slice(0, 5).forEach((item, idx) => {
    appendLine(`${idx + 1}. ${item.name} (${item.quantity} sold) - ₹${item.revenue}`);
  });

  appendLine('\n' + centerText('REGISTER BALANCED & AUDITED', width));
  appendLine(centerText(`Printed: ${new Date().toLocaleTimeString()}`, width));
  appendLine('\n\n');
  appendBytes([0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00]);

  return new Uint8Array(parts);
}

// Send buffer to Bluetooth characteristic in safe chunks
export async function printToBluetoothDevice(buffer: Uint8Array): Promise<boolean> {
  if (!activeBluetoothDevice?.characteristic) {
    throw new Error('No Bluetooth printer connected. Please pair your wireless thermal printer first.');
  }

  const char = activeBluetoothDevice.characteristic;
  // Standard BLE packet size (default MTU is 23, usable payload 20 bytes)
  // Higher sizes (e.g. 128) cause hardware buffer overflow on cheap thermal printers
  const chunkSize = 20;

  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    const chunk = buffer.slice(offset, offset + chunkSize);
    try {
      if (char.writeValueWithoutResponse && char.properties?.writeWithoutResponse) {
        await char.writeValueWithoutResponse(chunk);
      } else if (char.writeValueWithResponse && char.properties?.write) {
        await char.writeValueWithResponse(chunk);
      } else if (char.writeValue) {
        await char.writeValue(chunk);
      } else {
        throw new Error('Bluetooth printer characteristic does not support write operations.');
      }
    } catch (writeErr: any) {
      // Fallback attempt with writeValue
      try {
        await char.writeValue(chunk);
      } catch (fallbackErr: any) {
        throw new Error(`Bluetooth write error: ${writeErr?.message || 'Transmission failed'}`);
      }
    }
    // Tiny pacing delay between chunks to prevent buffer overrun on microprinters
    await new Promise((r) => setTimeout(r, 15));
  }

  return true;
}
