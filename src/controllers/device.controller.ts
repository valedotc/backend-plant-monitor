import { Request, Response } from 'express';
import { Reading } from '../models/reading.model';

// Get latest reading for a device
export async function getLatestReading(req: Request, res: Response) {
  try {
    const { deviceId } = req.params;

    const reading = await Reading.findOne({ deviceId })
      .sort({ ts: -1 })
      .lean();

    if (!reading) {
      return res.status(404).json({ error: 'No readings found for this device' });
    }

    res.json(reading);
  } catch (error) {
    console.error('Error fetching latest reading:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Get readings history with pagination
export async function getReadings(req: Request, res: Response) {
  try {
    const { deviceId } = req.params;
    const {
      limit = '100',
      offset = '0',
      from,
      to,
    } = req.query;

    const query: Record<string, unknown> = { deviceId };

    // Date range filter
    if (from || to) {
      query.ts = {};
      if (from) (query.ts as Record<string, Date>).$gte = new Date(from as string);
      if (to) (query.ts as Record<string, Date>).$lte = new Date(to as string);
    }

    const [readings, total] = await Promise.all([
      Reading.find(query)
        .sort({ ts: -1 })
        .skip(parseInt(offset as string))
        .limit(parseInt(limit as string))
        .lean(),
      Reading.countDocuments(query),
    ]);

    res.json({
      data: readings,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: parseInt(offset as string) + readings.length < total,
      },
    });
  } catch (error) {
    console.error('Error fetching readings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Get aggregated stats for charts (hourly averages)
export async function getStats(req: Request, res: Response) {
  try {
    const { deviceId } = req.params;
    const { period = '24h' } = req.query;

    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;
    let groupByFormat: string;

    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        groupByFormat = '%Y-%m-%d'; // Daily
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        groupByFormat = '%Y-%m-%d'; // Daily
        break;
      case '24h':
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        groupByFormat = '%Y-%m-%dT%H:00'; // Hourly
        break;
    }

    const stats = await Reading.aggregate([
      {
        $match: {
          deviceId,
          ts: { $gte: startDate, $lte: now },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: groupByFormat, date: '$ts' },
          },
          avgTemperature: { $avg: '$temperature' },
          avgHumidity: { $avg: '$humidity' },
          avgMoisture: { $avg: '$raw.moisture' },
          minTemperature: { $min: '$temperature' },
          maxTemperature: { $max: '$temperature' },
          minHumidity: { $min: '$humidity' },
          maxHumidity: { $max: '$humidity' },
          minMoisture: { $min: '$raw.moisture' },
          maxMoisture: { $max: '$raw.moisture' },
          lightOnCount: {
            $sum: { $cond: ['$raw.light', 1, 0] },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
      {
        $project: {
          timestamp: '$_id',
          temperature: {
            avg: { $round: ['$avgTemperature', 1] },
            min: { $round: ['$minTemperature', 1] },
            max: { $round: ['$maxTemperature', 1] },
          },
          humidity: {
            avg: { $round: ['$avgHumidity', 1] },
            min: { $round: ['$minHumidity', 1] },
            max: { $round: ['$maxHumidity', 1] },
          },
          moisture: {
            avg: { $round: ['$avgMoisture', 1] },
            min: '$minMoisture',
            max: '$maxMoisture',
          },
          lightHours: {
            $round: [{ $divide: ['$lightOnCount', '$count'] }, 2],
          },
          sampleCount: '$count',
          _id: 0,
        },
      },
    ]);

    res.json({
      deviceId,
      period,
      startDate,
      endDate: now,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Get summary stats (current status + ranges)
export async function getSummary(req: Request, res: Response) {
  try {
    const { deviceId } = req.params;

    // Get latest reading
    const latest = await Reading.findOne({ deviceId })
      .sort({ ts: -1 })
      .lean();

    if (!latest) {
      return res.status(404).json({ error: 'No readings found for this device' });
    }

    // Get 24h stats
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const dayStats = await Reading.aggregate([
      {
        $match: {
          deviceId,
          ts: { $gte: oneDayAgo },
        },
      },
      {
        $group: {
          _id: null,
          avgTemperature: { $avg: '$temperature' },
          avgHumidity: { $avg: '$humidity' },
          avgMoisture: { $avg: '$raw.moisture' },
          minTemperature: { $min: '$temperature' },
          maxTemperature: { $max: '$temperature' },
          minHumidity: { $min: '$humidity' },
          maxHumidity: { $max: '$humidity' },
          minMoisture: { $min: '$raw.moisture' },
          maxMoisture: { $max: '$raw.moisture' },
          readingsCount: { $sum: 1 },
        },
      },
    ]);

    const stats24h = dayStats[0] || null;

    res.json({
      deviceId,
      latest: {
        timestamp: latest.ts,
        temperature: latest.temperature,
        humidity: latest.humidity,
        moisture: latest.raw?.moisture,
        light: latest.raw?.light,
        status: latest.raw?.status,
      },
      stats24h: stats24h
        ? {
            temperature: {
              avg: Math.round(stats24h.avgTemperature * 10) / 10,
              min: stats24h.minTemperature,
              max: stats24h.maxTemperature,
            },
            humidity: {
              avg: Math.round(stats24h.avgHumidity * 10) / 10,
              min: stats24h.minHumidity,
              max: stats24h.maxHumidity,
            },
            moisture: {
              avg: Math.round(stats24h.avgMoisture * 10) / 10,
              min: stats24h.minMoisture,
              max: stats24h.maxMoisture,
            },
            readingsCount: stats24h.readingsCount,
          }
        : null,
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Get list of all devices with their latest reading
export async function getAllDevices(req: Request, res: Response) {
  try {
    const devices = await Reading.aggregate([
      {
        $sort: { ts: -1 },
      },
      {
        $group: {
          _id: '$deviceId',
          lastReading: { $first: '$$ROOT' },
        },
      },
      {
        $project: {
          deviceId: '$_id',
          lastSeen: '$lastReading.ts',
          temperature: '$lastReading.temperature',
          humidity: '$lastReading.humidity',
          moisture: '$lastReading.raw.moisture',
          light: '$lastReading.raw.light',
          status: '$lastReading.raw.status',
          _id: 0,
        },
      },
      {
        $sort: { deviceId: 1 },
      },
    ]);

    res.json(devices);
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
