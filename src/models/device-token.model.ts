import mongoose, { Schema, Document } from 'mongoose';

export interface IDeviceToken extends Document {
  appInstanceId: string;
  fcmToken: string;
  platform: 'ios' | 'android';
  deviceIds: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceTokenSchema = new Schema<IDeviceToken>(
  {
    appInstanceId: { type: String, required: true, index: true },
    fcmToken: { type: String, required: true },
    platform: { type: String, enum: ['ios', 'android'], required: true },
    deviceIds: [{ type: String }],
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: 'device_tokens',
  }
);

DeviceTokenSchema.index({ deviceIds: 1, isActive: 1 });
DeviceTokenSchema.index({ fcmToken: 1 });

export const DeviceToken = mongoose.model<IDeviceToken>('DeviceToken', DeviceTokenSchema);
