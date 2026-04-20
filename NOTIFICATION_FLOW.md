# Notification System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        NOTIFICATION FLOW                             │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│ TRIGGER      │
│ EVENTS       │
└──────┬───────┘
       │
       ├──► 1. Admin updates feedback status
       │        └──► updates.routes.js
       │             └──► createNotification(userId, type, data)
       │
       ├──► 2. Admin adds notes to feedback
       │        └──► updates.routes.js
       │             └──► createNotification(userId, FEEDBACK_REPLY, {...})
       │
       ├──► 3. Risk threshold exceeded (TODO)
       │        └──► risk-monitor logic
       │             └──► createNotification(userId, RISK_*, {...})
       │
       └──► 4. Achievement unlocked (TODO)
                └──► achievement logic
                     └──► createNotification(userId, ACHIEVEMENT_UNLOCKED, {...})

                              ▼

┌─────────────────────────────────────────────────────────────────────┐
│                    NOTIFICATION SERVICE                              │
│  server/services/notification.service.js                            │
├─────────────────────────────────────────────────────────────────────┤
│  createNotification(userId, type, data)                             │
│  ├─► Validates type                                                 │
│  ├─► Inserts into database                                          │
│  └─► Returns notification object                                    │
│                                                                      │
│  Other helpers:                                                      │
│  - getNotifications(userId, options)                                │
│  - getUnreadCount(userId)                                           │
│  - markAsRead(userId, notificationIds)                              │
│  - markAllAsRead(userId)                                            │
└─────────────────────────────────────────────────────────────────────┘

                              ▼

┌─────────────────────────────────────────────────────────────────────┐
│                         DATABASE                                     │
│  Table: notifications                                                │
├─────────────────────────────────────────────────────────────────────┤
│  ┌────┬─────────┬──────────┬────────┬──────┬────────────┐          │
│  │ id │ user_id │   type   │  data  │ read │ created_at │          │
│  ├────┼─────────┼──────────┼────────┼──────┼────────────┤          │
│  │ 1  │   42    │ feedback │ {...}  │ false│ 2024-...   │          │
│  │    │         │ _reply   │        │      │            │          │
│  └────┴─────────┴──────────┴────────┴──────┴────────────┘          │
│                                                                      │
│  Indexes:                                                            │
│  - user_id (fast user queries)                                      │
│  - user_id + read (fast unread count)                               │
│  - created_at DESC (fast recent fetch)                              │
└─────────────────────────────────────────────────────────────────────┘

                              ▼

┌─────────────────────────────────────────────────────────────────────┐
│                          REST API                                    │
│  server/routes/notifications.routes.js                              │
├─────────────────────────────────────────────────────────────────────┤
│  GET    /api/notifications                                          │
│         └─► List notifications (with filters)                       │
│                                                                      │
│  GET    /api/notifications/count                                    │
│         └─► Get unread count                                        │
│                                                                      │
│  POST   /api/notifications                                          │
│         └─► Create notification (admin/system)                      │
│                                                                      │
│  PATCH  /api/notifications/markRead                                 │
│         └─► Mark as read (single or all)                            │
│                                                                      │
│  DELETE /api/notifications/:id                                      │
│         └─► Delete notification                                     │
└─────────────────────────────────────────────────────────────────────┘

                              ▼

┌─────────────────────────────────────────────────────────────────────┐
│                      FRONTEND COMPONENTS                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────┐                      │
│  │  NotificationBell Component               │                      │
│  │  src/components/common/NotificationBell   │                      │
│  ├──────────────────────────────────────────┤                      │
│  │  • Shows 🔔 with badge (unread count)     │                      │
│  │  • Polls /api/notifications/count (30s)   │                      │
│  │  • Dropdown with recent notifications     │                      │
│  │  • Click notification → mark as read      │                      │
│  │  • "View all" → navigate to Inbox         │                      │
│  └──────────────────────────────────────────┘                      │
│                    │                                                 │
│                    ▼                                                 │
│  ┌──────────────────────────────────────────┐                      │
│  │  Inbox Page                               │                      │
│  │  src/pages/Inbox.jsx                      │                      │
│  ├──────────────────────────────────────────┤                      │
│  │  • Full list of notifications             │                      │
│  │  • Filter: All / Unread                   │                      │
│  │  • "Mark all as read" button              │                      │
│  │  • Individual delete/mark read            │                      │
│  │  • Icon + message for each notification   │                      │
│  └──────────────────────────────────────────┘                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

                              ▼

┌─────────────────────────────────────────────────────────────────────┐
│                        USER SEES                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Header:                                                             │
│  ┌────────────────────────────────────────┐                        │
│  │  [TradeJ Logo]     [🔔 (3)]  [User ▼]  │                        │
│  └────────────────────────────────────────┘                        │
│                                                                      │
│  Bell Dropdown:                                                      │
│  ┌────────────────────────────────────────┐                        │
│  │  Notifications                          │                        │
│  ├────────────────────────────────────────┤                        │
│  │  ⚠️  FTMO Phase 1: Max loss warning     │ 1m                    │
│  │  💬  Admin replied to your suggestion   │ 5m                    │
│  │  🏅  Challenge completed!               │ 2h                    │
│  ├────────────────────────────────────────┤                        │
│  │  [View all]                             │                        │
│  └────────────────────────────────────────┘                        │
│                                                                      │
│  Inbox Page (/inbox):                                               │
│  ┌────────────────────────────────────────┐                        │
│  │  🔔 Inbox                               │                        │
│  │  3 unread                                │                        │
│  │                                          │                        │
│  │  [All] [Unread]          [Mark all read]│                        │
│  │                                          │                        │
│  │  ┌──────────────────────────────────┐  │                        │
│  │  │ ⚠️  Risk: Max loss warning        │  │ [NEW]                 │
│  │  │ FTMO Phase 1: Max loss warning    │  │                        │
│  │  │ 1 min ago                          │  │                        │
│  │  │ [✓ Mark read] [🗑️ Delete]         │  │                        │
│  │  └──────────────────────────────────┘  │                        │
│  │                                          │                        │
│  │  ┌──────────────────────────────────┐  │                        │
│  │  │ 💬  Reply to suggestion           │  │ [NEW]                 │
│  │  │ Admin replied: "Great idea!"      │  │                        │
│  │  │ 5 min ago                          │  │                        │
│  │  │ [✓ Mark read] [🗑️ Delete]         │  │                        │
│  │  └──────────────────────────────────┘  │                        │
│  │                                          │                        │
│  │  ┌──────────────────────────────────┐  │                        │
│  │  │ 🏅  Challenge completed           │  │                        │
│  │  │ FTMO Phase 1 challenge passed!    │  │ [READ]                │
│  │  │ 2 hours ago                        │  │                        │
│  │  │ [🗑️ Delete]                        │  │                        │
│  │  └──────────────────────────────────┘  │                        │
│  └────────────────────────────────────────┘                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│                      DATA FLOW EXAMPLE                               │
└─────────────────────────────────────────────────────────────────────┘

1. Admin updates feedback status to "resolved"
   └─► PATCH /api/updates/admin/feedback/42
       { status: "resolved", admin_notes: "Fixed!" }

2. Server creates notification
   └─► createNotification(userId: 1, type: "feedback_reply", {
         feedbackId: 42,
         title: "Bug report",
         adminReply: "Fixed!",
       })

3. Database inserts record
   └─► INSERT INTO notifications (user_id, type, data, read)
       VALUES (1, 'feedback_reply', '{"feedbackId":42,...}', false)

4. User's bell polls count endpoint
   └─► GET /api/notifications/count
       Response: { count: 3 }

5. Badge updates
   └─► 🔔 (3)

6. User clicks bell
   └─► GET /api/notifications?limit=5&unreadOnly=true
       Response: { notifications: [...] }

7. Dropdown shows notifications
   └─► 💬 Admin replied to your feedback: Bug report [1m]

8. User clicks notification
   └─► PATCH /api/notifications/markRead
       { notificationIds: [42] }

9. Notification marked as read
   └─► UPDATE notifications SET read = true WHERE id = 42

10. Badge updates
    └─► 🔔 (2)
```
