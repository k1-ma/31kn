# Notification System Documentation

## Overview

The notification system provides a unified inbox for all user notifications including risk alerts, admin responses, system messages, and achievements.

## Features

- **Bell Icon**: Shows unread count and recent notifications dropdown
- **Inbox Page**: Full list of all notifications with filtering
- **Real-time Polling**: Auto-refresh every 30 seconds
- **Mark as Read**: Individual or bulk operations
- **Multi-language**: Supports Russian, English, and Ukrainian

## Architecture

### Backend

#### Database Schema
```sql
CREATE TABLE notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### API Endpoints

**GET /api/notifications**
- List user notifications
- Query params: `limit`, `offset`, `unreadOnly`
- Returns: `{ notifications, count }`

**GET /api/notifications/count**
- Get unread notification count
- Returns: `{ count }`

**POST /api/notifications**
- Create notification (admin or system use)
- Body: `{ type, data, targetUserId? }`
- Returns: `{ notification }`

**PATCH /api/notifications/markRead**
- Mark notifications as read
- Body: `{ notificationIds: [1,2,3] }` or `{ all: true }`
- Returns: `{ success: true, marked: count }`

**DELETE /api/notifications/:id**
- Delete a notification
- Returns: `{ success: true }`

#### Notification Types

Defined in `server/services/notification.service.js`:

**Risk Notifications:**
- `risk_max_loss_warning` - Account approaching max loss
- `risk_max_loss_exceeded` - Max loss exceeded
- `risk_daily_loss_warning` - Daily loss warning
- `risk_daily_loss_exceeded` - Daily loss exceeded
- `risk_max_drawdown_warning` - Max drawdown warning

**Admin/User Interaction:**
- `suggestion_reply` - Admin replied to suggestion
- `suggestion_status_changed` - Suggestion status changed
- `feedback_reply` - Admin replied to feedback
- `feedback_status_changed` - Feedback status changed

**Service:**
- `achievement_unlocked` - Achievement unlocked
- `challenge_completed` - Challenge completed
- `reminder` - Reminder
- `system_message` - System message

### Frontend

#### Components

**NotificationBell** (`src/components/common/NotificationBell.jsx`)
- Bell icon with badge showing unread count
- Dropdown with recent (unread) notifications
- Auto-polling every 30 seconds
- Click to mark as read

**Inbox Page** (`src/pages/Inbox.jsx`)
- Full list of all notifications
- Filter: All / Unread
- Mark all as read button
- Individual delete/mark as read actions

#### Integration

The bell is added to the Shell header in `JournalApp.jsx`:

```jsx
topRight={
  <div className="flex items-center gap-2">
    <NotificationBell onInboxClick={() => setActive("inbox")} />
    <UserMenu ... />
  </div>
}
```

## Usage Examples

### Creating Notifications

```javascript
import { createNotification, NOTIFICATION_TYPES } from "./services/notification.service.js";

// Risk warning
await createNotification(userId, NOTIFICATION_TYPES.RISK_MAX_LOSS_WARNING, {
  accountId: "1",
  accountName: "FTMO Phase 1",
  current: -4050,
  limit: -5000,
});

// Feedback reply
await createNotification(userId, NOTIFICATION_TYPES.FEEDBACK_REPLY, {
  feedbackId: 42,
  title: "Bug report title",
  adminReply: "Thanks for reporting! We'll fix this soon.",
});

// Achievement
await createNotification(userId, NOTIFICATION_TYPES.ACHIEVEMENT_UNLOCKED, {
  title: "First 100 trades!",
  description: "You've logged 100 trades",
});
```

### Automatic Creation

Notifications are automatically created in:

**Admin Feedback Updates** (`server/routes/updates.routes.js`)
- When admin changes feedback status
- When admin adds notes to feedback

```javascript
// Example from updates.routes.js
if (statusChanged || notesAdded) {
  const notificationType = notesAdded 
    ? NOTIFICATION_TYPES.FEEDBACK_REPLY 
    : NOTIFICATION_TYPES.FEEDBACK_STATUS_CHANGED;
  
  await createNotification(current.user_id, notificationType, {
    feedbackId: feedbackId,
    title: current.title,
    status: sanitizedStatus,
    adminReply: notesAdded ? admin_notes.slice(0, 200) : null,
  });
}
```

## Translations

Notification strings are defined in `src/i18n/translations.js`:

```javascript
notifications: {
  title: "Notifications",
  inbox: "Inbox",
  markAllRead: "Mark all as read",
  // ...
  types: {
    risk_max_loss_warning: "Risk: Max loss warning",
    feedback_reply: "Reply to feedback",
    // ...
  },
  messages: {
    risk_max_loss_warning: "Account {accountName} is approaching max loss limit",
    feedback_reply: "Admin replied to your feedback: {title}",
    // ...
  },
}
```

Template variables in messages (e.g., `{accountName}`, `{title}`) are replaced with data from the notification's `data` field.

## Future Enhancements

### Planned Features

1. **Real-time Updates**: WebSocket/SSE for instant notifications
2. **Risk Monitoring Integration**: Auto-create notifications from risk logic
3. **Email Notifications**: Optional email for critical alerts
4. **Notification Preferences**: User settings for which types to receive
5. **In-app Toast**: Show toast on new notification
6. **Notification Categories**: Group by type/priority
7. **Archive/Mute**: More management options

### Integration Points

**Risk Monitoring** (TODO)
- Integrate with `AccountRiskMonitorModal.jsx`
- Create notifications when risk thresholds reached
- Daily/weekly risk summaries

**Admin Actions** (DONE)
- ✓ Feedback status changes
- ✓ Admin notes/replies
- TODO: Idea status changes
- TODO: Direct admin messages

**Achievements** (TODO)
- Trading milestones (10, 50, 100, 500 trades)
- Winning streaks
- Prop firm challenges completed
- First profitable month

## Testing

### Manual Testing

1. **Start the app**: Navigate to the main journal
2. **View Bell**: Check the bell icon in the header
3. **No Notifications**: Should show "No notifications"
4. **Create Test Notification**: Use admin panel to update feedback
5. **View Notification**: Bell badge should update, dropdown shows notification
6. **Click Notification**: Should mark as read
7. **Inbox Page**: Click "View all" to see full inbox
8. **Filter**: Test All/Unread filters
9. **Mark All Read**: Test bulk mark as read
10. **Delete**: Test individual deletion

### Database Testing

```sql
-- Create test notification
INSERT INTO notifications (user_id, type, data, read, created_at)
VALUES (1, 'risk_max_loss_warning', '{"accountName": "Test Account", "current": -4500, "limit": -5000}', false, now());

-- View user notifications
SELECT * FROM notifications WHERE user_id = 1 ORDER BY created_at DESC;

-- Get unread count
SELECT COUNT(*) FROM notifications WHERE user_id = 1 AND read = false;

-- Mark as read
UPDATE notifications SET read = true WHERE user_id = 1 AND id = 1;

-- Delete old notifications (cleanup)
DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '90 days';
```

## Migration

The notifications table is created automatically by `server/db.js` during the `initDb()` process. On existing deployments, the table will be created on next server restart.

## Performance Considerations

- **Polling Interval**: 30 seconds (configurable in NotificationBell.jsx)
- **Notification Limit**: Dropdown shows max 5 unread, Inbox shows max 100
- **Indexes**: Optimized for user_id, read status, and created_at
- **Cleanup**: Consider periodic cleanup of old notifications (90+ days)

## Security

- All endpoints require authentication (`requireAuth` middleware)
- Users can only view/manage their own notifications
- Admins can create notifications for any user (via `targetUserId`)
- XSS prevention: All notification content is sanitized on display
