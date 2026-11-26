import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      window.dispatchEvent(new CustomEvent('auth:unauthenticated'));
    }
    return Promise.reject(error);
  },
);

export function errorMessage(error: unknown): string {
  const anyError = error as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return anyError.response?.data?.error?.message || anyError.message || 'حدث خطأ غير متوقع';
}

export default api;
