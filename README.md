# OAuth Web App Client

A demonstration of OAuth 2.0 Authorization Code Grant Flow with token refresh functionality.

## Project Structure

```
oauth-client/
├── src/                    # Source code
│   ├── public/            # Static files (HTML, CSS, JS)
│   │   ├── admin.html    # Admin dashboard
│   │   ├── callback.html # OAuth callback page
│   │   ├── index.html    # Main application page
│   │   └── js/           # Client-side JavaScript
│   ├── db-service.js     # Database service
│   ├── server.js         # Express server
│   └── refresh-tokens-cron.js # Token refresh cron job
├── certs/                 # SSL certificates
├── oauth.db              # SQLite database (in root directory)
├── .env                  # Environment variables
├── setup.sh             # Setup script for SSL certificates
└── package.json          # Project dependencies
```

## Features

- OAuth 2.0 Authorization Code Grant Flow
- Token refresh functionality
- SQLite database for storing refresh tokens
- Admin dashboard for token management
- Automatic token refresh cron job
- Real-time token expiration display

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the setup script to generate SSL certificates and create the .env file:
   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```

3. Add Client ID, Client Secrets, and scopes to the .env file
   - Log in to the Adobe developer console https://developer.adobe.com/console
   - Create a new project
   - Add Lightroom API or any other API that supports OAuth Web App credential to the project
   - When prompted, use the following redirect URLS
     - Default redirect URL: https://localhost/callback
     - Redirect URL pattern: https://localhost/callback
   - Navigate to the OAuth Web App credential overview page
   - Copy the provided Client ID and Client Secret to the .env file
   - Copy the scopes to the .env file too (Note: scopes must be comma separated with no spaces)

4. Start the server:
   ```bash
   npm start
   ```

## Database

The SQLite database (`oauth.db`) is automatically created in the root directory when the server starts. It contains a single table:

```sql
CREATE TABLE refresh_tokens (
    sub TEXT PRIMARY KEY,
    refresh_token TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

## API Endpoints

- `GET /` - Main application page
- `GET /callback` - OAuth callback endpoint
- `POST /api/refresh` - Token refresh endpoint
- `GET /admin` - Admin dashboard
- `GET /api/admin/tokens` - Get all tokens
- `DELETE /api/admin/tokens/:sub` - Delete a token

## Token Refresh

- Refresh tokens are stored in the SQLite database
- A cron job runs daily to refresh tokens that haven't been updated in 3 days
- The admin dashboard allows manual token management

## Security Notes

- The following endpoints are not adequately protected
  - /api/refresh
  - /api/admin/tokens
  - /api/admin/tokens/:sub
- Refresh tokens are never exposed to the frontend
- Token refresh requires the user's `sub` identifier
- Admin dashboard provides token management capabilities 
- SSL certificates are required to support https
