// Single source of truth for the backend API base URL.
// Set VITE_API_BASE in .env (or Vercel dashboard) to override the default.
// Default points to the production Render backend so the deployed frontend
// works out of the box. For local dev, create frontend/.env.local with:
//   VITE_API_BASE=http://127.0.0.1:8000/api
export const API_BASE = import.meta.env.VITE_API_BASE || 'https://nexora-ogeo.onrender.com/api';
