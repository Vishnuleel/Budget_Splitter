const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize SQLite database
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // Create transactions table
        db.run(`CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            amount REAL NOT NULL,
            merchant TEXT NOT NULL,
            category TEXT NOT NULL,
            raw_text TEXT
        )`);
    }
});

// Endpoint to receive SMS/Text payloads
app.post('/api/parse', (req, res) => {
    const { text } = req.body;
    
    if (!text) {
        return res.status(400).json({ error: 'No text provided' });
    }

    console.log('Received text:', text);

    // Basic parser for bank SMS/emails
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

    const parsedData = {
        amount,
        merchant,
        category
    };

    // Insert into DB
    const date = new Date().toISOString();
    db.run(`INSERT INTO transactions (date, amount, merchant, category, raw_text) VALUES (?, ?, ?, ?, ?)`,
        [date, parsedData.amount, parsedData.merchant, parsedData.category, text],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, id: this.lastID, data: parsedData });
        }
    );
});

// Endpoint to get all transactions
app.get('/api/transactions', (req, res) => {
    db.all(`SELECT * FROM transactions ORDER BY date DESC`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
