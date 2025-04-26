require('dotenv').config();
const cron = require('node-cron');
const dbService = require('./db-service');
const axios = require('axios');

async function refreshAllTokens() {
    try {
        console.log('Starting token refresh cron job...');
        
        // Get refresh tokens that haven't been updated in the last 3 days
        const tokensToRefresh = await dbService.getStaleRefreshTokens(3);
        console.log(`Found ${tokensToRefresh.length} tokens to refresh`);

        // Refresh each token
        for (const token of tokensToRefresh) {
            try {
                const response = await axios.post(process.env.TOKEN_URL, {
                    grant_type: 'refresh_token',
                    refresh_token: token.refresh_token,
                    client_id: process.env.CLIENT_ID,
                    client_secret: process.env.CLIENT_SECRET
                }, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                });

                const { refresh_token: newRefreshToken } = response.data;
                
                // Update the refresh token in the database
                await dbService.updateRefreshToken(token.sub, newRefreshToken);
                console.log(`Successfully refreshed token for sub: ${token.sub} (created: ${token.created_at}, last updated: ${token.updated_at})`);
            } catch (error) {
                console.error(`Failed to refresh token for sub: ${token.sub} (created: ${token.created_at}, last updated: ${token.updated_at}):`, error.message);
                // Continue with other tokens even if one fails
                continue;
            }
        }

        console.log('Token refresh cron job completed');
    } catch (error) {
        console.error('Error in token refresh cron job:', error);
    }
}

// Schedule the cron job to run every day at midnight
cron.schedule('0 0 * * *', () => {
    refreshAllTokens();
});

console.log('Token refresh cron job scheduled to run daily at midnight'); 