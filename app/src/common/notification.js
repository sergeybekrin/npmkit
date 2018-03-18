import { Notification } from 'electron';

export default function createNotification(title, body = '', options = {}) {
  // Create and show new notification
  const notification = new Notification({ title, body, options });
  notification.show();
  return notification;
}
