/**
 * Stores OAuth tokens in localStorage
 * @param {string} accessToken - The access token
 * @param {string} idToken - The ID token
 * @param {number} expiresIn - Token expiration time in seconds
 */
function storeTokens(accessToken, sub, expiresIn) {
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('sub', sub);
    localStorage.setItem('token_expires_at', Date.now() + (expiresIn * 1000));
}

function hasAccessTokenExpired() {
    const expiresAt = localStorage.getItem('token_expires_at');
    return Date.now() > parseInt(expiresAt);
}

/**
 * Gets the access token from localStorage and checks if it's expired
 * @returns {string|null} The access token if valid, null if expired or not found
 */
function getAccessToken() {
    const token = localStorage.getItem('access_token');
    
    if (!token) {
        return null;
    }

    return hasAccessTokenExpired() ? null : token;
}

function getSub() {
    return localStorage.getItem('sub');
}

function getExpiresIn() {
    const expiresAt = localStorage.getItem('token_expires_at');
    const remainingMillis = parseInt(expiresAt) - Date.now();
    return Math.max(0, Math.floor(remainingMillis / 1000));
}

/**
 * Refreshes the access token using the ID token
 * @returns {Promise<Object>} The new token data
 */
async function refreshAccessToken() {
    const sub = getSub();
    if (!sub) {
        throw new Error('No Refresh token available');
    }

    try {
        const response = await fetch('/api/refresh', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(sub)
        });

        if (!response.ok) {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('text/html')) {
                throw new Error(`Server returned HTML error page (${response.status})`);
            }
            throw new Error(`Failed to refresh token: ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Server did not return JSON response');
        }

        const tokenData = await response.json();
        storeTokens(
            tokenData.access_token,
            sub,
            tokenData.expires_in
        );

        return tokenData;
    } catch (error) {
        console.error('Token refresh error:', error);
        throw error;
    }
}

/**
 * Clears all OAuth tokens from localStorage
 */
function clearTokens() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('sub');
    localStorage.removeItem('token_expires_at');
} 