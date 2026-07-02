import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../config/db.js";

// ─── Notification Types ──────────────────────────────

interface PushNotification {
  userID: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

// ─── Push Service ─────────────────────────────────────
/**
 * Firebase Cloud Messaging (FCM) push notification service.
 *
 * Uses the Firebase Admin SDK to send notifications to iOS clients.
 *
 * Setup:
 * 1. Go to Firebase Console → Project Settings → Service Accounts
 * 2. Generate a new private key (JSON)
 * 3. Copy the values to .env:
 *    - FIREBASE_PROJECT_ID
 *    - FIREBASE_PRIVATE_KEY
 *    - FIREBASE_CLIENT_EMAIL
 * 4. The admin SDK handles token management automatically
 *
 * iOS Client Side:
 * - Use Firebase Messaging SDK (already in Package.swift)
 * - Request notification permission on first launch
 * - Send FCM token to backend via POST /api/auth/fcm-token
 *
 * Note: In development mode, use APNs auth key for direct APNs testing.
 */
export class PushService {
  private adminApp: any = null;
  private initialized = false;

  constructor(
    private log: FastifyBaseLogger,
    private config: {
      firebaseProjectId: string;
      firebasePrivateKey: string;
      firebaseClientEmail: string;
    }
  ) {}

  /**
   * Lazy-initialize Firebase Admin SDK.
   * Done on first send() call to avoid startup errors if Firebase isn't configured.
   */
  private async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      // Dynamic import of firebase-admin (ESM compatible)
      // Using require for CJS interop — firebase-admin ships as CJS
      const admin = require("firebase-admin/app");
      const { getMessaging } = require("firebase-admin/messaging");

      // Check if already initialized (HMR in dev)
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: this.config.firebaseProjectId,
            privateKey: this.config.firebasePrivateKey.replace(/\\n/g, "\n"),
            clientEmail: this.config.firebaseClientEmail,
          }),
        });
      }

      this.adminApp = admin.apps[0];
      this.initialized = true;
      this.log.info("[Push] Firebase Admin SDK initialized");
      return true;
    } catch (err) {
      this.log.warn(err, "[Push] Failed to initialize Firebase — push notifications disabled");
      this.initialized = true; // Don't retry
      return false;
    }
  }

  /**
   * Send a push notification to a specific user.
   */
  async send(notification: PushNotification): Promise<boolean> {
    const ready = await this.initialize();
    if (!ready) return false;

    try {
      const { getMessaging } = require("firebase-admin/messaging");
      const messaging = getMessaging();

      // Get user's FCM token from DB
      const user = await prisma.user.findUnique({
        where: { id: notification.userID },
        select: { fcmToken: true },
      });

      if (!user?.fcmToken) {
        this.log.debug({ userID: notification.userID }, "[Push] No FCM token — skipping");
        return false;
      }

      // Send via Firebase Cloud Messaging
      await messaging.send({
        token: user.fcmToken,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: notification.data || {},
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
              contentAvailable: true,
            },
          },
          headers: {
            "apns-priority": "10",
          },
        },
      });

      this.log.info(
        { userID: notification.userID, title: notification.title },
        "[Push] Sent successfully"
      );
      return true;
    } catch (err) {
      // Handle invalid tokens
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("registration-token-not-registered") ||
          errMsg.includes("invalid-registration-token")) {
        // Clear the invalid token
        await prisma.user.update({
          where: { id: notification.userID },
          data: { fcmToken: null },
        }).catch(() => {});

        this.log.warn({ userID: notification.userID }, "[Push] Invalid token — cleared");
      } else {
        this.log.error(err, "[Push] Send failed");
      }
      return false;
    }
  }

  /**
   * Send to multiple users (batch).
   */
  async sendBatch(notifications: PushNotification[]): Promise<number> {
    let successCount = 0;
    for (const notification of notifications) {
      const sent = await this.send(notification);
      if (sent) successCount++;
    }
    return successCount;
  }

  // ─── Convenience Methods ────────────────────────────

  /**
   * Send "Your friend started a room" notification.
   */
  async notifyRoomCreated(roomName: string, hostName: string, recipientIDs: string[]): Promise<void> {
    const notifications: PushNotification[] = recipientIDs.map((userID) => ({
      userID,
      title: "🎬 New Room",
      body: `${hostName} started "${roomName}" — join now!`,
      data: {
        type: "room_created",
        action: "open_app",
      },
    }));

    const count = await this.sendBatch(notifications);
    this.log.info({ sent: count, total: recipientIDs.length }, "[Push] Room created notifications");
  }

  /**
   * Send "You've been invited" notification.
   */
  async notifyInvite(inviterName: string, roomName: string, recipientID: string): Promise<void> {
    await this.send({
      userID: recipientID,
      title: "🤝 Room Invite",
      body: `${inviterName} invited you to "${roomName}"`,
      data: {
        type: "room_invite",
        action: "open_app",
      },
    });
  }

  /**
   * Send "Friend is online" notification.
   */
  async notifyFriendOnline(friendName: string, recipientID: string): Promise<void> {
    await this.send({
      userID: recipientID,
      title: "🟢 Online",
      body: `${friendName} is now online`,
      data: {
        type: "friend_online",
        action: "open_app",
      },
    });
  }
}
