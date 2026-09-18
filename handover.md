# Handover Notes for New Agent

**Context:** 
We are building a 100% free, cloud-hosted Personal Finance Tracker for the user. It uses an iOS Shortcut to capture bank SMS/app notifications and sends them via POST request to our backend parser. The UI is a React PWA.

**What has been done so far:**
1. The project folders `frontend` (React/Vite) and `backend` (Node.js/Express) have been scaffolded in this directory.
2. The `backend/server.js` boilerplate has been created with a local SQLite database and a `/api/parse` endpoint.
3. The `implementation_plan.md` and `task.md` have been approved by the user and are located in this directory.

**Next Steps for you:**
1. The user has numerous examples of their bank SMS/notifications. Ask the user to paste 2 or 3 examples in the chat.
2. Once provided, update the `/api/parse` endpoint in `backend/server.js` to parse those exact messages (extracting the amount and merchant).
3. Begin working on the frontend UI (Vite + React) following the `task.md`.
