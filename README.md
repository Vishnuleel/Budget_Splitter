# Finance Tracker & Wealth Management Platform

A secure, full-stack personal finance application built to help you track expenses, manage subscriptions, calculate true net worth, and monitor your financial goals. Designed with a clean, mobile-first "Nordic Minimal" aesthetic.

## 🚀 Features

- **True Net Worth Tracking:** Automatically calculates your net worth based on liquid accounts, savings vaults, fixed deposits, and outstanding debts.
- **Smart Transactions:** Easily log income and expenses with automatic category suggestions.
- **Data Visualization:** Interactive area charts for spending trends and pie charts for category breakdowns using Recharts.
- **Debt & Liability Manager:** Track credit cards, personal loans, and mortgages, and see how they impact your overall wealth.
- **Subscriptions & Bills:** Never miss a payment. Track recurring expenses with days-until-due calculations and color-coded alerts.
- **Data Portability:** One-click export of all transaction histories to CSV.
- **Secure Architecture:** Built on a Supabase backend with custom middleware, ensuring data integrity and preventing unauthorized API access.

## 🛠 Tech Stack

- **Frontend:** React 18, TypeScript, Vite
- **Styling:** CSS Variables, Tailwind CSS (Nordic Minimal Theme)
- **Charts:** Recharts
- **Icons:** Lucide React
- **Backend & Database:** Supabase (PostgreSQL), Node.js/Express
- **Hosting:** Vercel

## 💻 Running Locally

### Prerequisites
- Node.js (v18+)
- A [Supabase](https://supabase.com) project

### 1. Clone the repository
```bash
git clone https://github.com/Vishnuleel/Finance_tracker.git
cd Finance_tracker
```

### 2. Setup the Frontend
```bash
cd frontend
npm install
```

Create a `.env` file in the `frontend` directory with your Supabase credentials:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_APP_PIN=your_custom_secure_pin
```

Start the frontend development server:
```bash
npm run dev
```

### 3. Setup the Backend
```bash
cd ../backend
npm install
node server.js
```

## 🔒 Security
The application is protected by a custom PIN-based authentication system configured via environment variables.

## 📄 License
This project is for personal use and portfolio demonstration.
