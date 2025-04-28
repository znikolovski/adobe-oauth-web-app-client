const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios');

class DatabaseService {
    constructor() {
        this.db = null;
        this.isConnected = false;
    }

    async connect() {
        if (this.isConnected) return;

        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(path.join(__dirname, '..', 'oauth.db'), (err) => {
                if (err) {
                    console.error('Error opening database:', err);
                    reject(err);
                } else {
                    console.log('Connected to the SQLite database');
                    this.isConnected = true;
                    this.initializeDatabase().then(resolve).catch(reject);
                }
            });

            // Handle database errors
            this.db.on('error', (err) => {
                console.error('Database error:', err);
                this.isConnected = false;
                // Attempt to reconnect after a delay
                setTimeout(() => this.connect(), 5000);
            });
        });
    }

    async disconnect() {
        if (!this.isConnected) return;

        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err);
                    reject(err);
                } else {
                    console.log('Database connection closed');
                    this.isConnected = false;
                    this.db = null;
                    resolve();
                }
            });
        });
    }

    async initializeDatabase() {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run(`CREATE TABLE IF NOT EXISTS refresh_tokens (
                    sub TEXT PRIMARY KEY,
                    refresh_token TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });
    }

    async storeRefreshToken(sub, refreshToken) {
        if (!this.isConnected) {
            await this.connect();
        }

        return new Promise((resolve, reject) => {
            // First try to insert, which will only succeed if the sub doesn't exist
            const that = this;
            this.db.run(
                'INSERT OR IGNORE INTO refresh_tokens (sub, refresh_token, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
                [sub, refreshToken],
                function(err) {
                    if (err) {
                        reject(err);
                        return;
                    }

                    // If no rows were inserted (sub already exists), update the token
                    if (this.changes === 0) {
                        that.db.run(
                            'UPDATE refresh_tokens SET refresh_token = ?, updated_at = CURRENT_TIMESTAMP WHERE sub = ?',
                            [refreshToken, sub],
                function(err) {
                    if (err) reject(err);
                    else resolve();
                            }
                        );
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    async getRefreshToken(sub) {
        if (!this.isConnected) {
            await this.connect();
        }

        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT refresh_token FROM refresh_tokens WHERE sub = ?',
                [sub],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row?.refresh_token);
                }
            );
        });
    }

    async getStaleRefreshTokens(daysOld) {
        try {
            await this.connect();
            const result = await this.db.all(`
                SELECT sub, refresh_token, created_at, updated_at
                FROM refresh_tokens
                WHERE updated_at < datetime('now', ?)
            `, [`-${daysOld} days`]);
            return result;
        } catch (error) {
            console.error('Error getting stale refresh tokens:', error);
            throw error;
        }
    }

    async getAllTokens() {
        try {
            await this.connect();
            return new Promise((resolve, reject) => {
                this.db.all(`
                SELECT sub, refresh_token, created_at, updated_at
                FROM refresh_tokens
                ORDER BY updated_at DESC
                `, (err, rows) => {
                    if (err) {
                        console.error('Error getting all tokens:', err);
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                });
            });
        } catch (error) {
            console.error('Error getting all tokens:', error);
            throw error;
        }
    }

    async updateRefreshToken(sub, newRefreshToken) {
        if (!this.isConnected) {
            await this.connect();
        }

        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE refresh_tokens SET refresh_token = ?, updated_at = CURRENT_TIMESTAMP WHERE sub = ?',
                [newRefreshToken, sub],
                function(err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async deleteRefreshToken(sub) {
        if (!this.isConnected) {
            await this.connect();
        }

        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM refresh_tokens WHERE sub = ?',
                [sub],
                function(err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }
}

// Create a singleton instance
const dbService = new DatabaseService();

// Export the singleton instance
module.exports = dbService; 