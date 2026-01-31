import PocketBase from 'pocketbase';

// Replace with your PocketBase server URL if different
export const pb = new PocketBase(import.meta.env.VITE_PB_URL || 'http://127.0.0.1:8090');
