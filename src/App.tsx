/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import SignupLogin from './components/SignupLogin';
import MainScreen from './components/MainScreen';
import { User } from './types';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Sync active local login state on browser window startup
  useEffect(() => {
    const cachedUser = localStorage.getItem('syncspace_cached_user');
    if (cachedUser) {
      try {
        setCurrentUser(JSON.parse(cachedUser));
      } catch (e) {
        console.warn('Stale user session, clearing cache.');
        localStorage.removeItem('syncspace_cached_user');
      }
    }
  }, []);

  const handleAuthSuccess = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('syncspace_cached_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('syncspace_cached_user');
  };

  return (
    <div className="w-full min-h-screen bg-gray-50 selection:bg-indigo-100 selection:text-indigo-850">
      {currentUser ? (
        <MainScreen user={currentUser} onLogout={handleLogout} />
      ) : (
        <SignupLogin onAuthSuccess={handleAuthSuccess} />
      )}
    </div>
  );
}
