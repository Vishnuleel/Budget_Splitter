import { supabase } from '../supabaseClient';
import { isDemoMode } from './demo';
import { parseReceiptText, SAMPLE_RECEIPT, type ParsedReceipt } from '../../shared/receipt.js';

/** Shrink a phone photo (often 4–12 MB) to ~1600px JPEG before upload — faster and plenty for OCR. */
export async function photoToDataUrl(file: File, max = 1600): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

export async function readReceiptPhoto(file: File): Promise<ParsedReceipt> {
  if (isDemoMode()) {
    await new Promise(r => setTimeout(r, 1400)); // pretend to read it
    return parseReceiptText(SAMPLE_RECEIPT);
  }
  const image = await photoToDataUrl(file);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in first.');
  let res: Response;
  try {
    res = await fetch('/api/receipt', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ image }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (err) {
    if ((err as Error)?.name === 'TimeoutError') throw new Error('Reading took too long. Try again, or paste the text.');
    throw new Error('Could not reach the server. Paste the receipt text instead?');
  }
  const json = await res.json().catch(() => ({ error: `Server error (${res.status}).` }));
  if (!res.ok) throw new Error(json.error || `Couldn’t read the receipt (${res.status}).`);
  return json.receipt as ParsedReceipt;
}
