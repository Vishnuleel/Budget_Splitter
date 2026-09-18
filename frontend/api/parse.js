import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// We use the new GenAI SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const CATEGORIES = [
  'Food & Dining',
  'Groceries',
  'Appliances or tools',
  'Clothing',
  'Transport',
  'Personal',
  'Sports',
  'Education/Stationery',
  'Entertainment'
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { text, secret } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'No text provided' });
  }

  // Security Check: Block unauthorized access
  const apiSecret = process.env.API_SECRET;
  if (apiSecret && secret !== apiSecret) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing secret' });
  }

  let amount = 0.0;
  let merchant = "Unknown";
  let category = "Uncategorized";

  // 1. Determine Income vs Expense
  if (text.toLowerCase().includes("received")) {
      category = "Income";
  }

  // 2. Extract Amount
  const amountMatch = text.match(/(?:INR|Rs\.?)\s*([\d,]+\.?\d*)/i);
  if (amountMatch) {
      amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  }

  // 3. Extract Merchant/Sender/Receiver
  const merchantPatterns = [
      /towards\s+(.+?)\s+through/i,
      /at\s+(.+?)\s+on\s+\d{1,2}/i,
      /to\s+(.+?)\s+on\s+\d{2}-\d{2}-\d{2}/i,
      /from\s+(.+?)\s+on\s+\d{2}-\d{2}-\d{2}/i
  ];

  for (const pattern of merchantPatterns) {
      const match = text.match(pattern);
      if (match) {
          merchant = match[1].trim();
          break;
      }
  }

  let bankName = null;
  let accountId = null;

  // 4. Use Gemini AI to guess category and bank account
  if (process.env.GEMINI_API_KEY) {
    try {
      const prompt = `You are a strict financial categorization bot. 
I had a transaction at a merchant named "${merchant}". The original SMS was: "${text}".
Reply ONLY with a valid JSON object in this exact format:
{
  "category": "One of: ${CATEGORIES.join(', ')} (or 'Income' if I received money, or 'Savings' if I transferred to savings)",
  "bank_name": "Name of the bank or wallet from the SMS (e.g. HDFC, Paytm, SBI, ICICI), or null if not mentioned"
}
Do not include markdown blocks or any other text. Just the JSON.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });
      
      const responseText = response.text.trim().replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedAi = JSON.parse(responseText);
      
      const suggestedCategory = parsedAi.category;
      bankName = parsedAi.bank_name;
      
      // Verify it's a valid category
      if (CATEGORIES.includes(suggestedCategory) || suggestedCategory === 'Income' || suggestedCategory === 'Savings') {
        category = suggestedCategory === 'Income' ? 'Income' : (suggestedCategory === 'Savings' ? 'Savings' : `Suggested: ${suggestedCategory}`);
      }

      // Try to find matching account
      if (bankName) {
        const { data: accounts } = await supabase.from('accounts').select('id, name');
        if (accounts && accounts.length > 0) {
          const match = accounts.find(acc => acc.name.toLowerCase().includes(bankName.toLowerCase()) || bankName.toLowerCase().includes(acc.name.toLowerCase()));
          if (match) accountId = match.id;
        }
      }

    } catch (err) {
      console.error("Gemini API Error:", err);
      if (category !== "Income") category = "Uncategorized";
    }
  }

  // 5. Insert into Supabase
  const { data, error } = await supabase
    .from('transactions')
    .insert([{ 
      amount, 
      merchant, 
      category, 
      raw_text: text,
      account_id: accountId
    }])
    .select();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ success: true, data });
}
