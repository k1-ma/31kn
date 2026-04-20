#!/usr/bin/env node

/**
 * Test script to demonstrate the notification system
 * 
 * This script shows how notifications can be created programmatically.
 * In production, these would be created:
 * - When admin updates feedback status or adds notes
 * - When risk monitoring detects issues (future enhancement)
 * - For system messages and achievements
 */

import { createNotification, NOTIFICATION_TYPES } from '../services/notification.service.js';

// Example notification data structures
const examples = {
  // Risk notifications
  riskMaxLoss: {
    type: NOTIFICATION_TYPES.RISK_MAX_LOSS_WARNING,
    data: {
      accountId: "1",
      accountName: "FTMO Phase 1",
      limitType: "max_loss",
      current: -4050,
      limit: -5000,
    },
  },
  
  // Admin feedback notifications  
  feedbackReply: {
    type: NOTIFICATION_TYPES.FEEDBACK_REPLY,
    data: {
      feedbackId: "42",
      title: "Добавить инбокс уведомления",
      adminReply: "Скоро будет! Мы работаем над этим.",
    },
  },
  
  feedbackStatusChanged: {
    type: NOTIFICATION_TYPES.FEEDBACK_STATUS_CHANGED,
    data: {
      feedbackId: "42",
      title: "Добавить инбокс уведомления",
      status: "in_progress",
    },
  },
  
  // Achievement notification
  achievement: {
    type: NOTIFICATION_TYPES.ACHIEVEMENT_UNLOCKED,
    data: {
      title: "Первые 100 сделок!",
      description: "Вы записали 100 сделок в журнал",
    },
  },
};

console.log('Notification System Examples\n');
console.log('Available notification types:');
Object.entries(NOTIFICATION_TYPES).forEach(([key, value]) => {
  console.log(`  - ${key}: "${value}"`);
});

console.log('\n\nExample notification data:');
console.log(JSON.stringify(examples, null, 2));

console.log('\n\nTo create a notification in code:');
console.log('```javascript');
console.log('import { createNotification, NOTIFICATION_TYPES } from "./services/notification.service.js";');
console.log('');
console.log('// Create a risk warning notification');
console.log('await createNotification(userId, NOTIFICATION_TYPES.RISK_MAX_LOSS_WARNING, {');
console.log('  accountId: "1",');
console.log('  accountName: "FTMO Phase 1",');
console.log('  current: -4050,');
console.log('  limit: -5000,');
console.log('});');
console.log('```');

console.log('\n\nNotifications are automatically created when:');
console.log('  ✓ Admin updates feedback status (implemented in updates.routes.js)');
console.log('  ✓ Admin adds notes to feedback (implemented in updates.routes.js)');
console.log('  • Risk monitoring detects issues (TODO: integrate with risk logic)');
console.log('  • Achievements are unlocked (TODO: future enhancement)');
