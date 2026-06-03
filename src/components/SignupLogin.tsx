/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User } from '../types';
import { Shield, KeyRound, UserPlus, LogIn, Users } from 'lucide-react';

interface SignupLoginProps {
  onAuthSuccess: (user: User) => void;
}

export default function SignupLogin({ onAuthSuccess }: SignupLoginProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMsg('');

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    const payload = isLogin 
      ? { email, password } 
      : { username, email, password };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong. Please check your credentials.');
      }

      if (isLogin) {
        // Logged in
        onAuthSuccess(data.user);
      } else {
        // Register successful, toggle to login screen with prefilled values
        setSuccessMsg('Account created successfully! Please log in.');
        setIsLogin(true);
        setPassword('');
      }
    } catch (err: any) {
      setError(err.message || 'Connection failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = () => {
    const randomId = 'guest_' + Math.random().toString(36).substring(2, 9);
    const guestNames = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Omega'];
    const randomName = 'Guest ' + guestNames[Math.floor(Math.random() * guestNames.length)];
    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];
    const avatarColor = colors[Math.floor(Math.random() * colors.length)];

    const guestUser: User = {
      id: randomId,
      username: randomName,
      email: `${randomId}@guest.local`,
      avatarColor,
    };
    onAuthSuccess(guestUser);
  };

  return (
    <div id="auth-container" className="min-h-screen flex items-center justify-center bg-gray-50/50 px-4">
      <div id="auth-card" className="w-full max-w-md bg-white border border-gray-100 shadow-xl rounded-2xl overflow-hidden p-8 transition-all hover:shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-3">
            <Shield id="auth-logo" className="w-6 h-6 animate-pulse" />
          </div>
          <h2 className="text-2xl font-bold font-sans tracking-tight text-gray-900">
            SyncSpace RTC
          </h2>
          <p className="text-gray-500 text-sm mt-1">Real-Time Secure Communication Portal</p>
        </div>

        {error && (
          <div id="auth-error" className="mb-6 p-4 bg-rose-50 text-rose-700 text-sm rounded-xl border border-rose-100 flex items-center gap-2">
            <span className="font-semibold">Error:</span> {error}
          </div>
        )}

        {successMsg && (
          <div id="auth-success" className="mb-6 p-4 bg-emerald-50 text-emerald-700 text-sm rounded-xl border border-emerald-100">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5" htmlFor="username-input">
                Username
              </label>
              <input
                id="username-input"
                type="text"
                placeholder="e.g. Alice Vance"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
                required={!isLogin}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5" htmlFor="email-input">
              Email Address
            </label>
            <input
              id="email-input"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5" htmlFor="password-input">
              Password
            </label>
            <input
              id="password-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
              required
            />
          </div>

          <button
            id="auth-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-xl shadow-lg shadow-indigo-1200 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
            ) : isLogin ? (
              <>
                <LogIn className="w-4 h-4" /> Sign In
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" /> Create Account
              </>
            )}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-100"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-3 text-gray-400 font-medium">Or quick sandbox test</span>
          </div>
        </div>

        <button
          id="guest-login-btn"
          onClick={handleGuestLogin}
          className="w-full py-2.5 bg-white border border-gray-250 hover:border-indigo-500 hover:text-indigo-600 text-gray-650 font-medium text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <Users className="w-4 h-4" /> Access as Guest Instant
        </button>

        <div className="text-center mt-6">
          <button
            id="auth-mode-toggle"
            onClick={() => setIsLogin(!isLogin)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer underline hover:no-underline"
          >
            {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
}
