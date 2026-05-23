const ApplicationLog = require('../models/ApplicationLog');

// @desc    Get logs (paginated, filterable)
// @route   GET /api/logs
const getLogs = async (req, res) => {
  const { platform, status, page = 1, limit = 20, search } = req.query;

  const filter = { userId: req.user._id };
  if (platform) filter.platform = platform;
  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { jobTitle: { $regex: search, $options: 'i' } },
      { company: { $regex: search, $options: 'i' } },
    ];
  }

  const total = await ApplicationLog.countDocuments(filter);
  const logs = await ApplicationLog.find(filter)
    .sort('-appliedAt')
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .populate('searchId', 'keywords');

  res.json({
    success: true,
    logs,
    pagination: {
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      limit: parseInt(limit),
    },
  });
};

// @desc    Get stats
// @route   GET /api/logs/stats
const getStats = async (req, res) => {
  const stats = await ApplicationLog.aggregate([
    { $match: { userId: req.user._id } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  const formatted = { applied: 0, skipped: 0, failed: 0, duplicate: 0, total: 0 };
  stats.forEach((s) => {
    formatted[s._id] = s.count;
    formatted.total += s.count;
  });

  // Recent 7 days trend
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const trend = await ApplicationLog.aggregate([
    { $match: { userId: req.user._id, appliedAt: { $gte: sevenDaysAgo } } },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$appliedAt' } },
          status: '$status',
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.date': 1 } },
  ]);

  res.json({ success: true, stats: formatted, trend });
};

// @desc    Delete a log entry
// @route   DELETE /api/logs/:id
const deleteLog = async (req, res) => {
  const log = await ApplicationLog.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!log) return res.status(404).json({ success: false, message: 'Log not found' });
  res.json({ success: true, message: 'Log deleted' });
};

// @desc    Clear all logs
// @route   DELETE /api/logs
const clearLogs = async (req, res) => {
  await ApplicationLog.deleteMany({ userId: req.user._id });
  res.json({ success: true, message: 'All logs cleared' });
};

module.exports = { getLogs, getStats, deleteLog, clearLogs };
