const express = require('express');
const { Queue, Worker } = require('bullmq');

const PORT = process.env.PORT || 3000;
const REDIS_HOST = process.env.REDIS_HOST || 'redis';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
};

const QUEUE_NAME = 'break-alert-queue';
const DELAY_MS = 25 * 60 * 1000; // 25 minutes delay

// Initialize BullMQ Queue
const breakAlertQueue = new Queue(QUEUE_NAME, { connection });

// Express App setup
const app = express();
app.use(express.json());

// Webhook receiver endpoint
app.post('/webhook', async (req, res) => {
  try {
    const payload = req.body || {};
    console.log('[WEBHOOK RECEIVED]', JSON.stringify(payload, null, 2));

    const event = payload.event || payload.action || '';
    const activity = payload.timesheet?.activity || '';

    // Check if event corresponds to break start
    if (event === 'Break Started' || activity.toLowerCase() === 'break') {
      const username = payload.user?.username || payload.user?.name || 'Unknown User';
      const userPhone = payload.user?.phone || payload.phone || '+15550000000';
      const timesheetId = payload.timesheet?.id || Date.now();
      const startTime = payload.timesheet?.start_time || new Date().toISOString();

      const jobData = {
        timesheetId,
        username,
        userPhone,
        startTime,
        triggeredAt: new Date().toISOString(),
      };

      const job = await breakAlertQueue.add('send-break-alert', jobData, {
        delay: DELAY_MS,
        removeOnComplete: true,
        removeOnFail: false,
      });

      console.log(`[JOB QUEUED] Job ID ${job.id} enqueued for '${username}'. Fires in 25 mins.`);

      return res.status(200).json({
        success: true,
        message: 'Break alert scheduled successfully.',
        jobId: job.id,
        scheduledDelayMs: DELAY_MS,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Event '${event}' received but ignored (not a break start).`,
    });
  } catch (error) {
    console.error('[WEBHOOK ERROR]', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', queue: QUEUE_NAME });
});

// BullMQ Worker loop
const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const { username, userPhone, timesheetId, startTime } = job.data;
    console.log(`\n=================== [MOCK TWILIO SMS DISPATCH] ===================`);
    console.log(`[TIMESTAMP] : ${new Date().toISOString()}`);
    console.log(`[TO]        : ${userPhone}`);
    console.log(`[FROM]      : +18005550199 (Kimai Kiosk Alert System)`);
    console.log(`[BODY]      : Alert: ${username}, your 25-minute break for timesheet #${timesheetId} (started at ${startTime}) has ended. Please return to work.`);
    console.log(`[STATUS]    : 200 OK (Simulated Twilio Message SID: SM${Math.random().toString(36).substring(2, 15)})`);
    console.log(`==================================================================\n`);
  },
  { connection }
);

worker.on('completed', (job) => {
  console.log(`[JOB COMPLETED] Job ID ${job.id} finished successfully.`);
});

worker.on('failed', (job, err) => {
  console.error(`[JOB FAILED] Job ID ${job?.id} failed:`, err);
});

// Start Express Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Alert Worker listening on port ${PORT}`);
  console.log(`Connected to Redis at ${REDIS_HOST}:${REDIS_PORT}`);
});
