// Stealth Notification System for Chat App
// Maintains privacy by showing only generic notifications

class StealthNotifications {
  constructor() {
    this.isGranted = false;
    this.isAppInForeground = true;
    this.notificationSound = true; // Default on
    this.notificationVibration = true; // Default on
    this.activeNotifications = [];
    
    this.init();
  }

  // Initialize notification system
  async init() {
    // Check if notifications are supported
    if (!('Notification' in window)) {
      console.log('Notifications not supported');
      return;
    }

    // Load settings from localStorage
    this.loadSettings();

    // Check current permission
    this.isGranted = Notification.permission === 'granted';

    // Track app visibility
    this.setupVisibilityTracking();

    // Clear notifications when app opens
    this.clearAllNotifications();
  }

  // Request notification permission
  async requestPermission() {
    if (!('Notification' in window)) {
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      this.isGranted = permission === 'granted';
      return this.isGranted;
    } catch (error) {
      console.error('Permission request failed:', error);
      return false;
    }
  }

  // Track if app is in foreground or background
  setupVisibilityTracking() {
    // Track page visibility
    document.addEventListener('visibilitychange', () => {
      this.isAppInForeground = !document.hidden;
      
      // Clear all notifications when app comes to foreground
      if (this.isAppInForeground) {
        this.clearAllNotifications();
      }
    });

    // Track window focus
    window.addEventListener('focus', () => {
      this.isAppInForeground = true;
      this.clearAllNotifications();
    });

    window.addEventListener('blur', () => {
      this.isAppInForeground = false;
    });

    // Initial state
    this.isAppInForeground = !document.hidden;
  }

  // Show notification (only if app is in background)
  async showNotification() {
    // Don't show if permission not granted
    if (!this.isGranted) {
      console.log('Notification permission not granted');
      return;
    }

    // Don't show if app is in foreground
    if (this.isAppInForeground) {
      console.log('App in foreground, not showing notification');
      return;
    }

    try {
      // Generic notification text (no message content for privacy)
      const notification = new Notification('System Activity', {
        body: 'New update available',
        icon: '/icon.png', // Optional: add your icon
        badge: '/badge.png', // Optional: add badge
        tag: 'chat-update', // Reuse tag so only one notification shows
        requireInteraction: true, // Stays until user opens app
        silent: !this.notificationSound, // Respect sound settings
        vibrate: this.notificationVibration ? [200, 100, 200] : [] // Respect vibration settings
      });

      // Store reference
      this.activeNotifications.push(notification);

      // iOS limitation: tapping notification will open app (can't prevent this)
      notification.onclick = () => {
        // Notification tapped - focus window
        window.focus();
        notification.close();
      };

      console.log('Notification shown');
      return notification;
    } catch (error) {
      console.error('Failed to show notification:', error);
      return null;
    }
  }

  // Clear all active notifications
  clearAllNotifications() {
    this.activeNotifications.forEach(notification => {
      try {
        notification.close();
      } catch (error) {
        // Notification already closed
      }
    });
    this.activeNotifications = [];
    console.log('All notifications cleared');
  }

  // Settings management
  loadSettings() {
    try {
      const sound = localStorage.getItem('notificationSound');
      const vibration = localStorage.getItem('notificationVibration');
      
      this.notificationSound = sound !== null ? sound === 'true' : true;
      this.notificationVibration = vibration !== null ? vibration === 'true' : true;
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  saveSettings() {
    try {
      localStorage.setItem('notificationSound', this.notificationSound);
      localStorage.setItem('notificationVibration', this.notificationVibration);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  // Toggle sound on/off
  toggleSound() {
    this.notificationSound = !this.notificationSound;
    this.saveSettings();
    return this.notificationSound;
  }

  // Toggle vibration on/off
  toggleVibration() {
    this.notificationVibration = !this.notificationVibration;
    this.saveSettings();
    return this.notificationVibration;
  }

  // Set sound setting
  setSound(enabled) {
    this.notificationSound = enabled;
    this.saveSettings();
  }

  // Set vibration setting
  setVibration(enabled) {
    this.notificationVibration = enabled;
    this.saveSettings();
  }

  // Get current settings
  getSettings() {
    return {
      sound: this.notificationSound,
      vibration: this.notificationVibration,
      permission: this.isGranted
    };
  }

  // Check if we should show notifications
  canShowNotifications() {
    return this.isGranted && !this.isAppInForeground;
  }
}

// Create global instance
window.stealthNotifications = new StealthNotifications();

// Expose methods globally for easy access
window.notifyNewMessage = () => {
  return window.stealthNotifications.showNotification();
};

window.requestNotificationPermission = () => {
  return window.stealthNotifications.requestPermission();
};

window.getNotificationSettings = () => {
  return window.stealthNotifications.getSettings();
};

window.toggleNotificationSound = () => {
  return window.stealthNotifications.toggleSound();
};

window.toggleNotificationVibration = () => {
  return window.stealthNotifications.toggleVibration();
};

console.log('Stealth Notification System loaded');
