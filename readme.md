Assesment given by codealpha
To run SyncSpace RTC locally on your computer, follow these simple, step-by-step setup instructions:
1. Prerequisites
Ensure you have Node.js (version 18 or newer recommends) installed on your machine. You can verify this by running node -v in your command line.
2. Export & Extract the Codebase
Export the project from Google AI Studio to your computer as a ZIP code bundle (via the Settings/Export menu) or pull it directly if you exported it to GitHub.
Extract the downloaded ZIP contents into a dedicated folder (e.g., syncspace-rtc) and open your terminal (Command Prompt, terminal, or VS Code terminal) in that root folder.
3. Install Dependencies
Run the standard package installation command to download all required frontend and backend libraries (such as Express, Socket.io, React, Vite, and Esbuild):
code
Bash
npm install
4. Create your Local Environment Configuration
Create a file named .env in the root folder by copying the contents of .env.example:
code
Bash
cp .env.example .env
(For offline sandbox testing, the Gemini API key is not strictly required. Default values are handled gracefully by the server.)
5. Launch the Local Server
Boot up the integrated full-stack server on your local network:
code
Bash
npm run dev
This serves the React application and the WebSocket signaling broker simultaneously on http://localhost:3000.
How to Test the Multi-User Calling Locally:
Open your web browser and go to http://localhost:3000.
Select Access as Guest Instant to log in, and click Start Instant Meeting to generate a custom secured Room Key (e.g. abc-123-xyz).
Open a separate browser window in Incognito/Private Mode (to simulate a second distinct user device) and navigate to http://localhost:3000.
Log in as a distinct guest, copy and paste the generated Room Key into the box, and hit Join Meeting Space.
Confirm your microphone and camera settings—the two screens will instantly configure their WebRTC connection peer-to-peer!