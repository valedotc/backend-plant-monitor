import mongoose, { Schema, Document } from 'mongoose';

export enum AlertType {
  TEMPERATURE_HIGH = 'TEMPERATURE_HIGH',
  TEMPERATURE_LOW = 'TEMPERATURE_LOW',
  HUMIDITY_HIGH = 'HUMIDITY_HIGH',
  HUMIDITY_LOW = 'HUMIDITY_LOW',
  MOISTURE_HIGH = 'MOISTURE_HIGH',
  MOISTURE_LOW = 'MOISTURE_LOW',
  DEVICE_OFFLINE = 'DEVICE_OFFLINE',
}

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface IAlert extends Document {
  deviceId: string;
  alertType: AlertType;
  severity: AlertSeverity;
  message: string;
  value: number;
  threshold: number;
  acknowledged: boolean;
  notificationSent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AlertSchema = new Schema<IAlert>(
  {
    deviceId: { type: String, required: true, index: true },
    alertType: {
      type: String,
      enum: Object.values(AlertType),
      required: true,
    },
    severity: {
      type: String,
      enum: Object.values(AlertSeverity),
      default: AlertSeverity.MEDIUM,
    },
    message: { type: String, required: true },
    value: { type: Number, required: true },
    threshold: { type: Number, required: true },
    acknowledged: { type: Boolean, default: false },
    notificationSent: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: 'alerts',
  }
);

AlertSchema.index({ deviceId: 1, createdAt: -1 });
AlertSchema.index({ acknowledged: 1, createdAt: -1 });

export const Alert = mongoose.model<IAlert>('Alert', AlertSchema);
