# Personal Finance Tracker App (Shortcuts Edition)

A 100% free, automated personal finance tracker that uses a built-in iOS Shortcut to quietly capture your bank text messages, parse them, and display your spending in a beautiful, modern Progressive Web App (PWA).

## User Review Required
> [!IMPORTANT]
> To make this completely free and cloud-based without needing your computer left on, we will use free developer tiers. You will eventually need to create accounts for:
> 1. **Supabase:** For the database and the serverless "receiver" code.
> 2. **Vercel:** To host the web app.

## Open Questions
> [!WARNING]
> 1. **Where should I save the code?** Your current active folder is `Facial-Intoxication-detection`. Should I create a new folder specifically for this finance app on your computer?
> 2. **Can you paste an example SMS?** To write the perfect text parser, it would be extremely helpful if you could paste a real example of the text message your bank sends you when you buy something. 

## Proposed Architecture

### 1. The Data Capture (iOS Shortcuts)
Instead of a hacking an app to read your texts, we will set up a 3-step automation in your iPhone's official **Shortcuts** app:
- **Trigger:** When I receive a message from [Bank's Phone Number].
- **Action:** Take the text of the message and silently send it to our cloud database.
- *Because it's an official Apple feature, this runs entirely in the background without you having to tap anything!*

### 2. The Brain (Supabase Edge Function)
When the iOS Shortcut sends the text message to the cloud, a tiny piece of code (an Edge Function) will catch it. It will:
- Read the raw text message from the bank.
- Extract the dollar amount and the store name.
- Use a rules engine to categorize the expense (e.g., "McDonalds" -> "Food & Dining").
- Save it into the database.

### 3. The Database (Supabase PostgreSQL)
A free database in the cloud with our main tables:
- `transactions`: Stores the date, amount, merchant, and category.
- *Note: Since we are using SMS, getting your total savings balance might be tricky unless the bank includes your "Available Balance" in every text message. If they don't, we will focus purely on tracking your expenses against a budget!*

### 4. The Frontend App (React PWA)
A beautiful, mobile-first web app that you can save directly to your iPhone home screen. It will feature premium aesthetics (vibrant colors, glassmorphism, dark mode) and smooth animations.
- **Dashboard:** Shows your monthly spending and budget progress.
- **Transactions List:** A clean, scrollable list of your captured expenses.
- **Categories:** Visual charts showing where your money is going.

## Verification Plan

1.  **Local Prototype:** I will build the React app and the Text Parser code locally on your computer first so we can test it.
2.  **Test the Parser:** We will run your example bank SMS through our code to make sure it extracts the correct dollar amount and store name flawlessly.
3.  **UI Review:** We will spin up the React app on your computer. You can review the design to ensure it looks incredibly premium.
4.  **Cloud Deployment & Shortcuts Setup:** Once the code is perfect, I will guide you on how to push it to the free cloud services and give you exact, step-by-step instructions on how to set up the iOS Shortcut on your phone.
