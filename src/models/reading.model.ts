import mongoose, { Schema, Document } from 'mongoose';

export interface IRawData {
  status: string;
  temperature: number;
  humidity: number;
  moisture: number;
  light: boolean;
  device_id: number;
}

export interface IReading extends Document {
  deviceId: string;
  ts: Date;
  temperature: number;
  humidity: number;
  chlorophyll: number | null;
  raw: IRawData;
}

const RawDataSchema = new Schema<IRawData>(
  {
    status: { type: String },
    temperature: { type: Number },
    humidity: { type: Number },
    moisture: { type: Number },
    light: { type: Boolean },
    device_id: { type: Number },
  },
  { _id: false }
);

const ReadingSchema = new Schema<IReading>(
  {
    deviceId: { type: String, required: true, index: true },
    ts: { type: Date, required: true, index: true },
    temperature: { type: Number },
    humidity: { type: Number },
    chlorophyll: { type: Number, default: null },
    raw: { type: RawDataSchema },
  },
  {
    collection: process.env.READINGS_COLLECTION || 'readings',
    timestamps: false,
  }
);

// Compound index for efficient queries
ReadingSchema.index({ deviceId: 1, ts: -1 });

export const Reading = mongoose.model<IReading>('Reading', ReadingSchema);
