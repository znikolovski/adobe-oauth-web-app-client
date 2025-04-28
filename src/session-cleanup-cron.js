const cron = require('node-cron');
const SQLiteStore = require('connect-sqlite3');
const path = require('path');

// Create SQLite store instance
const store = new SQLiteStore({
    db: 'oauth.db',
    table: 'sessions'
});

// Run cleanup every hour
cron.schedule('0 * * * *', async () => {
    try {
        // Get all sessions from the database
        const sessions = await new Promise((resolve, reject) => {
            store.all((err, sessions) => {
                if (err) reject(err);
                else resolve(sessions);
            });
        });

        // Get current timestamp
        const now = Date.now();

        // Clean up expired sessions
        for (const session of sessions) {
            const expires = new Date(session.expires).getTime();
            if (expires < now) {
                await new Promise((resolve, reject) => {
                    store.destroy(session.sid, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                console.log(`Cleaned up expired session: ${session.sid}`);
            }
        }

        console.log('Session cleanup completed successfully');
    } catch (error) {
        console.error('Error during session cleanup:', error);
    }
});

console.log('Session cleanup cron job started'); 