// Simple DOM-based toast notifications for content scripts
// Mimics Sonner's loading → success/error flow without React dependencies

// Track toast elements by event ID
const toastMap = new Map<string, HTMLElement>();

// Toast container element
let toastContainer: HTMLElement | null = null;

/**
 * Initialize the toast provider - creates container element
 */
export function initToastProvider(): void {
  if (toastContainer) return; // Already initialized

  // Create container
  toastContainer = document.createElement('div');
  toastContainer.id = 'pca-toast-container';
  toastContainer.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 100000;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  `;
  document.body.appendChild(toastContainer);

  // Inject toast styles
  const style = document.createElement('style');
  style.textContent = `
    .pca-toast {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-family: 'Google Sans Flex', sans-serif;
      font-size: 14px;
      color: #1f2937;
      min-width: 280px;
      max-width: 400px;
      animation: pca-toast-enter 0.3s ease-out;
      transition: all 0.3s ease;
    }

    .pca-toast-icon {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    .pca-toast-content {
      flex: 1;
    }

    .pca-toast-title {
      font-weight: 500;
    }

    .pca-toast-description {
      font-size: 13px;
      color: #6b7280;
      margin-top: 4px;
    }

    /* Loading spinner */
    .pca-toast-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid #e5e7eb;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: pca-spin 0.8s linear infinite;
    }

    /* Success icon */
    .pca-toast-success-icon {
      color: #22c55e;
    }

    /* Error icon */
    .pca-toast-error-icon {
      color: #ef4444;
    }

    @keyframes pca-toast-enter {
      from {
        opacity: 0;
        transform: translateX(100%);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    @keyframes pca-toast-exit {
      from {
        opacity: 1;
        transform: translateX(0);
      }
      to {
        opacity: 0;
        transform: translateX(100%);
      }
    }

    @keyframes pca-spin {
      to {
        transform: rotate(360deg);
      }
    }
  `;
  document.head.appendChild(style);

  console.log('[Toast Provider] DOM toast provider initialized');
}

/**
 * Create a toast element
 */
function createToast(type: 'loading' | 'success' | 'error', title: string, description?: string): HTMLElement {
  const toast = document.createElement('div');
  toast.className = 'pca-toast';

  let iconHtml = '';
  if (type === 'loading') {
    iconHtml = '<div class="pca-toast-spinner"></div>';
  } else if (type === 'success') {
    iconHtml = `<svg class="pca-toast-icon pca-toast-success-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>`;
  } else if (type === 'error') {
    iconHtml = `<svg class="pca-toast-icon pca-toast-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="15" y1="9" x2="9" y2="15"></line>
      <line x1="9" y1="9" x2="15" y2="15"></line>
    </svg>`;
  }

  toast.innerHTML = `
    ${iconHtml}
    <div class="pca-toast-content">
      <div class="pca-toast-title">${title}</div>
      ${description ? `<div class="pca-toast-description">${description}</div>` : ''}
    </div>
  `;

  return toast;
}

/**
 * Show a loading toast for an event update
 */
export function showSavingToast(eventId: string): void {
  if (!toastContainer) initToastProvider();

  const toast = createToast('loading', 'Saving event...');
  toastMap.set(eventId, toast);
  toastContainer!.appendChild(toast);
}

/**
 * Update the loading toast to success
 */
export function showSuccessToast(eventId: string): void {
  const existingToast = toastMap.get(eventId);
  
  if (existingToast && toastContainer) {
    // Replace with success toast
    const successToast = createToast('success', 'Sent sync request to Google Calendar');
    existingToast.replaceWith(successToast);
    toastMap.delete(eventId);

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      successToast.style.animation = 'pca-toast-exit 0.3s ease-out forwards';
      setTimeout(() => successToast.remove(), 300);
    }, 3000);
  } else {
    // Fallback: create new success toast
    if (!toastContainer) initToastProvider();
    const toast = createToast('success', 'Sent sync request to Google Calendar');
    toastContainer!.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'pca-toast-exit 0.3s ease-out forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

/**
 * Update the loading toast to error
 */
export function showErrorToast(eventId: string, error?: string): void {
  const existingToast = toastMap.get(eventId);

  if (existingToast && toastContainer) {
    // Replace with error toast
    const errorToast = createToast('error', 'Event update failed', error);
    existingToast.replaceWith(errorToast);
    toastMap.delete(eventId);

    // Auto-dismiss after 5 seconds (longer for errors)
    setTimeout(() => {
      errorToast.style.animation = 'pca-toast-exit 0.3s ease-out forwards';
      setTimeout(() => errorToast.remove(), 300);
    }, 5000);
  } else {
    // Fallback: create new error toast
    if (!toastContainer) initToastProvider();
    const toast = createToast('error', 'Event update failed', error);
    toastContainer!.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'pca-toast-exit 0.3s ease-out forwards';
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }
}