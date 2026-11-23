export interface ToastMessage {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export function showToast(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  const id = Math.random().toString(36).substring(2, 9);
  window.dispatchEvent(new CustomEvent('app_toast', { detail: { id, message, type } }));
}
