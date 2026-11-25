// Shared by the app (src/lib/parser.ts) and the serverless API (api/parse.js).
// Plain JS so Node can import it without a build step. Types live in sms.d.ts.

export const EXPENSE_CATEGORIES = [
  'Food & Dining',
  'Groceries',
  'Housing',
  'Bills & utilities',
  'Transport',
  'Clothing',
  'Appliances or tools',
  'Personal',
  'Sports',
  'Education/Stationery',
  'Entertainment',
  'Transfers',
  'Bank fees',
];

// Currency words as they appear in Indian bank SMS. "Rs"/"₹" mean INR.
const CUR = '(SEK|EUR|USD|GBP|NOK|DKK|CHF|AED|SGD|INR|Rs\\.?|₹)';
// "1,25,000.50" / "2,345" (grouped) or "50000.00" (plain). The (?!\d) stops "50000" matching as "500".
const NUM = '(\\d{1,3}(?:,\\d{2,3})+(?:\\.\\d{1,2})?(?!\\d)|\\d+(?:\\.\\d{1,2})?)';

function normCurrency(c) {
  const u = c.toUpperCase().replace('.', '');
  return u === 'RS' || u === '₹' ? 'INR' : u;
}

/** All money mentions in order, e.g. [{currency:'SEK', amount:245}, {currency:'INR', amount:2345.6}]. */
export function findAmounts(text) {
  const out = [];
  // (?<![A-Za-z]) so "Rs" inside a word ("bars 12") isn't read as rupees.
  const before = new RegExp(`(?<![A-Za-z])${CUR}\\s*${NUM}`, 'gi'); // "SEK 245.00", "Rs.1,250"
  for (const m of text.matchAll(before)) out.push({ index: m.index, currency: normCurrency(m[1]), amount: toNumber(m[2]) });
  // Swedish style after the number: "1 245,00 kr", "245.50 kr", "1245,50 kr". Never start mid-number.
  for (const m of text.matchAll(/(?<![\d.,])(\d{1,3}(?:[ .]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(kr|SEK)\b/gi)) {
    if (out.some(o => Math.abs(o.index - m.index) < 6)) continue;
    const dec = m[1].match(/[.,](\d{1,2})$/);
    const whole = (dec ? m[1].slice(0, dec.index) : m[1]).replace(/[ .]/g, '');
    out.push({ index: m.index, currency: 'SEK', amount: parseFloat(dec ? `${whole}.${dec[1]}` : whole) });
  }
  return out.filter(a => a.amount > 0).sort((a, b) => a.index - b.index);
}

function toNumber(s) {
  // "245,50" (one comma, two digits after) is a European decimal; grouping always ends in three digits.
  if (/^\d{1,3},\d{2}$/.test(s)) return parseFloat(s.replace(',', '.')) || 0;
  return parseFloat(s.replace(/[,\s]/g, '')) || 0;
}

const MERCHANT_PATTERNS = [
  /towards\s+(.+?)\s+through/i,
  /\bVPA\s+([\w.-]+@[\w.-]+)/i,
  // ICICI style: "... on 15-Nov-26 on NETFLIX.COM. Avl Limit"
  /\bon\s+\d{1,2}-[A-Za-z]{3}-\d{2,4}\s+(?:on|at)\s+(.+?)(?:\.\s|\.$|\s+Avl|\s+Avbl|$)/i,
  // Axis style: "... 15-11-26 18:22:10 IST ICA NARA Avl Lmt"
  // (Never "PM"/"Avbl": IDFC writes "on 24 NOV 2026 at 09:58 PM Avbl Limit", with the merchant earlier.)
  /\d{1,2}:\d{2}(?::\d{2})?\s+(?:[AP]M\s+)?(?:IST\s+)?(?!(?:[AP]M|Avl|Avbl|Available)\b)([A-Za-z0-9][\w&*.' -]{1,40}?)\s+(?:Avl|Avbl|Available)/i,
  // HDFC / SBI cards: "at ICA SUPERMARKET STOCKHOLM on 2026-11-15"
  /\bat\s+(.+?)\s+on\s+\d/i,
  /\bto\s+(?!your\b|a\/c|ac\b)(.+?)\s+on\s+\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/i,
  /\bfrom\s+(?!a\/c|ac\b|acct|your\b)(.+?)\s+on\s+\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/i,
  /\b(?:to|at)\s+([A-Z][\w&.*' -]{2,40}?)(?:\.|,|\s+Ref|\s+UPI|\s+Avl|$)/,
  // Swedish bank notifications: "Kortköp 245,00 kr på WILLYS ODENPLAN"
  /\bp[åa]\s+([A-ZÅÄÖ0-9][\wÅÄÖåäö&*.' -]{1,40}?)(?:\.|,|\s+\d|$)/,
];

/** "swiggy.order@icici" → "Swiggy Order"; "ICA SUPERMARKET STOCKHOLM" → "ICA Supermarket Stockholm". */
export function tidyMerchant(raw) {
  let s = raw.trim().replace(/[.,;:]+$/, '').replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  const vpa = s.match(/^([\w.-]+)@[\w.-]+$/);
  if (vpa) {
    const words = vpa[1].split(/[._-]+/).filter(w => w && !/^\d+$/.test(w));
    return words.length ? words.map(cap).join(' ') : s;
  }
  // Card descriptors are often SHOUTING with payment-processor prefixes.
  s = s.replace(/^(?:IND\*|SQ \*|SUMUP \*|ZETTLE_\*|IZ \*|PAYPAL \*|KLARNA\*)/i, '');
  if (s === s.toUpperCase() && /[A-Z]{3}/.test(s)) {
    s = s.split(' ').map(w => (w.length <= 3 && /^[A-Z]+$/.test(w) ? w : cap(w))).join(' ');
  }
  return s;
}

function cap(w) {
  return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w;
}

// Common Swedish (and a few global) merchants → category, so most card spends need no review.
const MERCHANT_HINTS = [
  [/\b(ica|coop|willys|lidl|hemk[öo]p|city gross|netto|mathem|tempo|matsmart|axfood)\b/i, 'Groceries'],
  [/\b(espresso house|max hamburg|max\b|pressbyr[åa]n|7-eleven|wayne'?s|foodora|wolt|uber ?eats|mcdonald|burger king|sushi|pizzeria|restaurang|caf[ée]|bageri|subway|starbucks|joe & the juice|swiggy|zomato)\b/i, 'Food & Dining'],
  [/\b(sl\b|sl access|v[äa]sttrafik|sk[åa]netrafiken|ul\b|[öo]stg[öo]tatrafiken|sj\b|sj ab|flixbus|voi|tier|lime|bolt|uber|taxi|circle k|preem|okq8|ingo|st1|sas|norwegian|ryanair|arlanda express)\b/i, 'Transport'],
  [/\b(h&m|hm\b|lindex|kappahl|zalando|dressmann|weekday|cos\b|uniqlo|zara|boozt|nelly)\b/i, 'Clothing'],
  [/\b(ikea|clas ohlson|biltema|jula|elgiganten|mediamarkt|power\b|webhallen|netonnet|k-rauta|bauhaus|byggmax|amazon)\b/i, 'Appliances or tools'],
  [/\b(apotek|apoteket|kronans|hj[äa]rtat|lyko|kicks|systembolaget|frisör|barber)\b/i, 'Personal'],
  [/\b(sats|friskis|nordic wellness|actic|stadium|xxl|decathlon|stadium outlet)\b/i, 'Sports'],
  [/\b(spotify|netflix|disney|hbo|max\.com|viaplay|filmstaden|sf bio|steam|playstation|youtube|audible|storytel|bookbeat)\b/i, 'Entertainment'],
  [/\b(akademibokhandeln|adlibris|bokus|studentlitteratur|coursera|udemy)\b/i, 'Education/Stationery'],
  [/\b(telia|tele2|telenor|tre\b|hallon|comviq|vimla|fello|vattenfall|ellevio|e\.on|fortum|tibber|bahnhof|bredband|com hem|tele 2)\b/i, 'Bills & utilities'],
  [/\b(hyra|heimstaden|akelius|wallenstam|sgs studentbost[äa]der|af bostäder|stockholmshem|familjebost[äa]der|bostadsr[äa]tt|rent\b|landlord|hemnet)\b/i, 'Housing'],
];

export function hintCategory(merchant) {
  for (const [re, cat] of MERCHANT_HINTS) if (re.test(merchant)) return cat;
  return null;
}

/**
 * Parse an Indian bank SMS (card abroad, transfers, fees, UPI) into a transaction draft.
 * @returns {{ amount:number, currency:string, merchant:string, category:string, isIncome:boolean, kind:'card'|'transfer'|'fee'|'upi'|'other' }}
 */
export function parseSms(text) {
  const lower = text.toLowerCase();
  const isIncome = /(received|credited|refund|reversal|reversed)/.test(lower) && !/debited|spent|paid|sent|charged/.test(lower);

  // Prefer the foreign amount on an international card spend; INR is usually the converted debit
  // or the available limit/balance that comes after it.
  const amounts = findAmounts(text);
  const foreign = amounts.find(a => a.currency !== 'INR');
  const pick = foreign ?? amounts[0] ?? { amount: 0, currency: 'INR' };

  let kind = 'other';
  let merchant = 'Unknown';
  let category = isIncome ? 'Income' : 'Uncategorized';

  if (/(mark-?up|forex|cross[- ]currency|fx fee|foreign (?:currency |transaction )?fee|international transaction fee|dcc)/i.test(text)) {
    kind = 'fee';
    merchant = 'Forex markup fee';
    if (!isIncome) category = 'Bank fees';
  } else if (/(outward remittance|swift|wire transfer|international transfer|remit|lrs\b|wise\b|transferwise)/i.test(text)) {
    kind = 'transfer';
    merchant = 'International transfer';
    if (!isIncome) category = 'Transfers';
  } else if (/\b(card|credit card|debit card|pos|ecom|e-com)\b/i.test(text)) {
    kind = 'card';
  } else if (/\b(upi|vpa)\b/i.test(text)) {
    kind = 'upi';
  } else if (/\b(neft|imps|rtgs|transfer)\b/i.test(text)) {
    kind = 'transfer';
    if (!isIncome) category = 'Transfers';
  }

  if (kind !== 'fee' && !(kind === 'transfer' && merchant !== 'Unknown')) {
    for (const p of MERCHANT_PATTERNS) {
      const m = text.match(p);
      if (m && m[1] && !/^(your|a\/c|ac|card)\b/i.test(m[1].trim())) {
        merchant = tidyMerchant(m[1]);
        break;
      }
    }
  }

  // A known merchant beats the generic bucket (e.g. a NEFT to your landlord is Housing, not "Transfers").
  if (!isIncome && kind !== 'fee') {
    const hint = hintCategory(merchant);
    if (hint) category = hint;
  }

  return { amount: pick.amount, currency: pick.currency, merchant, category, isIncome, kind };
}
