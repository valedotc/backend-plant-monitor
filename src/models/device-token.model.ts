import mongoose, { Schema, Document } from 'mongoose';

export interface IDeviceToken extends Document {
  appInstanceId: string; // Unique ID per app install (Device UUID)
  fcmToken: string; // Firebase Cloud Messaging token
  platform: 'ios' | 'android';
  deviceIds: string[]; // ESP32 device IDs this app is monitoring
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

const DeviceTokenSchema = new Schema<IDeviceToken>(
  {
    appInstanceId: { type: String, required: true, index: true },
    fcmToken: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['ios', 'android'], required: true },
    deviceIds: [{ type: String }],
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: 'device_tokens',
  }
);

// Index for efficient queries
DeviceTokenSchema.index({ deviceIds: 1, isActive: 1 });
DeviceTokenSchema.index({ fcmToken: 1 });

export const DeviceToken = mongoose.model<IDeviceToken>('DeviceToken', DeviceTokenSchema);
