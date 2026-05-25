import React, { useState, useEffect, useCallback } from 'react';
import { jwtVerify, importSPKI } from 'jose';
import { PUBLIC_KEY_PEM, LOGIN_URL, getCookie } from './authUtils';

/**
 * AuthGuard handles the authorization flow.
 * It verifies the JWT from URL or cookies and redirects if unauthorized.
 */
const AuthGuard = ({ children }) => {
  const [authState, setAuthState] = useState({
    token: '',
    payload: null,
    isLoading: true
  });

  // Centralized session termination logic
  const terminateSession = useCallback(() => {
    document.cookie = "sid=; Max-Age=0; path=/;"; // Clear the session cookie
    window.location.href = LOGIN_URL; // Redirect to login
  }, []);

  const verifyToken = useCallback(async (tokenToVerify) => {
    try {
      const publicKey = await importSPKI(PUBLIC_KEY_PEM, 'RS256');
      const { payload } = await jwtVerify(tokenToVerify, publicKey);
      
      // Update persistence
      document.cookie = `sid=${tokenToVerify}; Max-Age=3600; path=/; SameSite=Lax`;
      return { success: true, payload };
    } catch (err) {
      console.error("Token verification failed:", err.message);
      document.cookie = "sid=; Max-Age=0; path=/;"; // Clear invalid session
      return { success: false };
    }
  }, []);

  useEffect(() => {
    const runAuthFlow = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const tokenInUrl = urlParams.get('token');
      const sid = getCookie('sid');

      let validToken = '';
      let validPayload = null;

      // 1. Check for token in URL first
      if (tokenInUrl) {
          const result = await verifyToken(tokenInUrl);
          if (result.success) {
            validToken = tokenInUrl;
            validPayload = result.payload;
          }
      } 
      // 2. Fallback to session cookie
      else if (sid) {
          const result = await verifyToken(sid);
          if (result.success) {
            validToken = sid;
            validPayload = result.payload;
          }
      }

      // 3. Final Decision
      if (validPayload) {
        // Clean up URL now that we know the token was valid
        if (tokenInUrl) {
          const url = new URL(window.location.href);
          url.searchParams.delete('token');
          window.history.replaceState({}, '', url.pathname + url.search);
        }
        setAuthState({
          token: validToken,
          payload: validPayload,
          isLoading: false
        });
      } else {
        terminateSession();
      }
    };

    runAuthFlow();
  }, [verifyToken, terminateSession]);

  // Periodic session validation (every 2 minutes)
  useEffect(() => {
    // Only start polling if we have a valid session
    if (!authState.token || !authState.payload?.username) return;

    const checkSession = async () => {
      try {
        const response = await fetch('https://pluckier.co.uk/utils/authservice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: authState.payload.username }) 
        });

        if (!response.ok) {
          terminateSession();
        }
      } catch (err) {
        console.error("Background session check failed:", err);
        terminateSession();
      }
    };

    // Set up the 2-minute interval (120,000 ms)
    const intervalId = setInterval(checkSession, 120000);

    // Clean up interval on unmount or if authState changes
    return () => clearInterval(intervalId);
  }, [authState.token, authState.payload, terminateSession]);

  if (authState.isLoading) {
    return <div style={{ padding: '20px' }}>Verifying authentication...</div>;
  }

  // Return the main app content, passing auth data via render prop
  return children(authState);
};

export default AuthGuard;
