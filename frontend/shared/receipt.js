// Reads a Swedish grocery receipt (ICA, Willys, Lidl, Coop, Hemköp…) from text into items.
// Used for "paste receipt text", for demo mode, and to clean up what the photo reader returns.

const NUM = '-?\\d{1,5}(?:[ .]\\d{3})*[,.]\\d{2}';
const toNum = s => parseFloat(String(s).replace(/\s|\.(?=\d{3}\b)/g, '').replace(',', '.'));

const IGNORE = /^(moms|varav moms|netto|brutto|kort|bankkort|kontokort|mottaget|kontant|växel|vaxel|org\.?\s?nr|tel|telefon|kvitto|kassa|kassör|datum|tid|ref|terminal|butik|öppettider|välkommen|tack|spara kvittot|bonus(grundande|saldo)?|medlem|antal varor|swish|visa|mastercard|debit|godkänt|köp|kortnummer|\*{3,})(?=[\s:.]|$)/i;
const TOTAL = /^(summa|totalt|total|att betala|totalbelopp|betala)\b/i;
const ITEM_DISCOUNT = /^(rabatt|rab\b|extrapris|prisnedsättning|erbjudande|\d+\s?för\s?\d+|mängdrabatt|kampanj)/i;
const BILL_DISCOUNT = /^(kupong|bonuscheck|bonuscheckar|totalrabatt|medlemsrabatt|personlig rabatt|värdecheck|presentkort avdrag)/i;
const PANT = /^pant\b/i;
const FEE = /^(bärkasse|kasse|plastpåse|papperspåse|påse|hemleverans|leverans|plockavgift)/i;
const STORE = /\b(ICA(?: Kvantum| Maxi| Supermarket| Nära)?|Willys(?: Hemma)?|Lidl|Coop|Stora Coop|Hemköp|City Gross|Netto|Tempo|Matsmart|Mathem)\b/i;

const STORE_NAMES = ['ICA Kvantum', 'ICA Maxi', 'ICA Supermarket', 'ICA Nära', 'ICA', 'Willys Hemma', 'Willys', 'Lidl', 'Stora Coop', 'Coop',
  'Hemköp', 'City Gross', 'Netto', 'Tempo', 'Matsmart', 'Mathem'];

let seq = 0;
const nid = () => `i${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * @returns {{ store: string|null, currency: 'SEK', items: {id, name, qty, price}[], extras: {name, amount, kind}[], total: number|null }}
 */
export function parseReceiptText(text) {
  const lines = String(text).split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const items = [];
  const extras = [];
  let total = null;
  let store = null;
  const priceAtEnd = new RegExp(`(${NUM})\\s*(?:kr|sek)?\\s*[A-Z*]?$`, 'i');
  const qtyRe = new RegExp(`(\\d+(?:[,.]\\d+)?)\\s*(st|kg|g)?\\s*[x*×]\\s*(${NUM})`, 'i');

  for (const line of lines) {
    if (!store) {
      const m = line.match(STORE);
      if (m) {
        const found = m[1].replace(/\s+/g, ' ').toLowerCase();
        store = STORE_NAMES.find(n => n.toLowerCase() === found) ?? m[1];
      }
    }
    const pm = line.match(priceAtEnd);
    if (!pm) continue;
    const amount = toNum(pm[1]);
    const label = line.slice(0, pm.index).replace(/[.\s]+$/, '').trim();

    if (TOTAL.test(label)) { total = amount; continue; }
    if (!label || IGNORE.test(label)) continue;

    if (ITEM_DISCOUNT.test(label) && items.length) {
      items[items.length - 1].price = round2(items[items.length - 1].price - Math.abs(amount));
      continue;
    }
    if (BILL_DISCOUNT.test(label)) { extras.push({ name: tidy(label), amount: -Math.abs(amount), kind: 'discount' }); continue; }
    if (PANT.test(label) && items.length) {
      // Deposit belongs to the drink just above it.
      items[items.length - 1].price = round2(items[items.length - 1].price + amount);
      items[items.length - 1].pant = round2((items[items.length - 1].pant || 0) + amount);
      continue;
    }
    if (FEE.test(label)) { extras.push({ name: tidy(label), amount, kind: 'fee' }); continue; }
    if (amount < 0 && items.length) { // an unlabeled negative line = discount on the previous item
      items[items.length - 1].price = round2(items[items.length - 1].price + amount);
      continue;
    }

    const q = label.match(qtyRe);
    const name = tidy(q ? label.slice(0, q.index) : label);
    if (!name) continue;
    items.push({ id: nid(), name, qty: q ? toNum(q[1]) : 1, price: amount });
  }

  return { store, currency: 'SEK', items, extras, total };
}

/** Make whatever the photo reader returned safe and consistent. */
export function normalizeReceipt(raw) {
  const items = (Array.isArray(raw?.items) ? raw.items : [])
    .map(i => ({
      id: nid(),
      name: tidy(String(i?.name ?? '')).slice(0, 60),
      qty: Number(i?.qty) > 0 ? Number(i.qty) : 1,
      price: round2((Number(i?.price) || 0) - Math.abs(Number(i?.discount) || 0) + (Number(i?.pant) || 0)),
    }))
    .filter(i => i.name && Number.isFinite(i.price) && i.price !== 0)
    .slice(0, 200);
  const extras = (Array.isArray(raw?.extras) ? raw.extras : [])
    .map(x => ({ name: String(x?.name ?? 'Extra').slice(0, 40), amount: round2(Number(x?.amount) || 0), kind: x?.kind === 'fee' ? 'fee' : 'discount' }))
    .filter(x => x.amount !== 0);
  const total = Number(raw?.total);
  return {
    store: typeof raw?.store === 'string' ? raw.store.slice(0, 40) : null,
    currency: typeof raw?.currency === 'string' && /^[A-Z]{3}$/.test(raw.currency) ? raw.currency : 'SEK',
    items,
    extras,
    total: Number.isFinite(total) && total > 0 ? round2(total) : null,
  };
}

/**
 * Several receipts → one bill. Items keep their names (ids are made unique), each receipt's bags/coupons stay
 * as their own extra lines labelled with the store, and the total is the sum when every receipt had one.
 */
export function mergeReceipts(receipts) {
  const list = (receipts || []).filter(r => r && r.items?.length);
  const stores = [...new Set(list.map(r => r.store).filter(Boolean))];
  const many = list.length > 1;
  return {
    store: stores.length ? stores.join(' · ') : null,
    currency: list[0]?.currency || 'SEK',
    items: list.flatMap((r, k) => r.items.map(i => ({ ...i, id: `r${k}-${i.id}` }))),
    extras: list.flatMap(r => r.extras.map(x => ({ ...x, name: many && r.store ? `${x.name} (${r.store})` : x.name }))),
    total: list.length && list.every(r => r.total != null) ? round2(list.reduce((a, r) => a + r.total, 0)) : null,
  };
}

const KEEP_UPPER = new Set(['ICA', 'EKO', 'KRAV', 'XL', 'XXL', 'BBQ', 'MSC', 'ASC', 'UHT']);

function round2(n) { return Math.round(n * 100) / 100; }

function tidy(s) {
  const t = s.replace(/^[\d\s*]+(?=\D)/, '').replace(/\s{2,}/g, ' ').trim();
  if (!t) return '';
  // Receipts SHOUT; make it readable but keep short codes (ICA, EKO, 3%).
  return t === t.toUpperCase() ? t.split(' ').map(w => (KEEP_UPPER.has(w) ? w : w[0] + w.slice(1).toLowerCase())).join(' ') : t;
}

export const SAMPLE_RECEIPT = `ICA Supermarket Odenplan
Org nr 556123-4567
CHAMPINJONER 250G        24,90
MJÖLK 3% 1,5L             17,50
GUL LÖK 1KG               14,90
KYCKLINGFILÉ 900G        89,90
Rabatt kyckling         -15,00
COCA-COLA 1,5L            24,90
Pant                       2,00
BASMATIRIS 2KG            42,90
SCHAMPO 250ML             39,90
TOMATER 500G              22,50
BÄRKASSE                   3,00
Kupong                   -10,00
Totalt                   257,40
Kort                     257,40
Moms 12%                  27,59`;
